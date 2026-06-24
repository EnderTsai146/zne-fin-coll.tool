// src/components/ExpenseEntry.jsx
import React, { useState } from 'react';
import SegmentedControl from './SegmentedControl';

const formatMoney = (num) => "$" + Number(num).toLocaleString();

const formatInputMoney = (valStr) => {
  if (valStr === '' || valStr === undefined || valStr === null) return '';
  const clean = valStr.toString().replace(/[^\d.]/g, '');
  const parts = clean.split('.');
  if (parts.length > 2) {
    parts[1] = parts.slice(1).join('');
  }
  const integerPart = parts[0] ? Number(parts[0]).toLocaleString() : '';
  const decimalPart = parts.length > 1 ? '.' + parts[1] : '';
  return `$${integerPart}${decimalPart}`;
};

const parseMoney = (valStr) => {
  if (!valStr) return 0;
  const clean = valStr.toString().replace(/[^\d.]/g, '');
  return Number(clean) || 0;
};

const addMonthsSafe = (dateStr, months) => {
  let d = new Date(dateStr);
  let targetMonth = d.getMonth() + months;
  let targetYear = d.getFullYear();
  let expectedMonth = targetMonth % 12;
  if (expectedMonth < 0) expectedMonth += 12;
  let newD = new Date(targetYear, targetMonth, d.getDate());
  if (newD.getMonth() !== expectedMonth) {
    newD = new Date(targetYear, targetMonth + 1, 0);
  }
  const offset = newD.getTimezoneOffset()
  newD = new Date(newD.getTime() - (offset * 60 * 1000))
  return newD.toISOString().split('T')[0];
};

const ExpenseEntry = ({ assets, setAssets, onAddExpense, onAddJointExpense, onTransaction, customAlert, customConfirm, customPrompt }) => {
  const [activeTab, setActiveTab] = useState('joint');
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);

  // 共同花費 State
  const [jointAdvanced, setJointAdvanced] = useState(null);
  const [jointCat, setJointCat] = useState(null);
  const [jointAmount, setJointAmount] = useState('');
  const [jointNote, setJointNote] = useState('');
  const [jointCart, setJointCart] = useState([]);

  // 個人花費 State
  const [persUser, setPersUser] = useState(null);
  const [persCat, setPersCat] = useState(null);
  const [persAmount, setPersAmount] = useState('');
  const [persNote, setPersNote] = useState('');
  const [persCart, setPersCart] = useState([]);

  // 定期帳單 State
  const [showAddBill, setShowAddBill] = useState(false);
  const [billName, setBillName] = useState('');
  const [billScope, setBillScope] = useState('joint');
  const [billPayer, setBillPayer] = useState('jointCash');
  const [billType, setBillType] = useState('fixed');
  const [billAmount, setBillAmount] = useState('');
  const [billCycle, setBillCycle] = useState(1);
  const [billNextDate, setBillNextDate] = useState(txDate);
  const [editingBillId, setEditingBillId] = useState(null);

  const safeBills = assets?.bills || [];
  const todayStr = new Date().toISOString().split('T')[0];

  // 判斷帳單是否在 3 天內即將到期
  const isApproaching = (dateStr) => {
    return Math.ceil((new Date(dateStr) - new Date(todayStr)) / (1000 * 60 * 60 * 24)) <= 3;
  };

  // --- 共同記帳邏輯 ---
  const handleAddJointCart = async () => {
    if (!jointAdvanced) {
      await customAlert("請選擇付款方式 (誰墊付/共同出)！");
      return;
    }
    if (!jointCat) {
      await customAlert("請選擇分類！");
      return;
    }
    const parsedAmount = parseMoney(jointAmount);
    if (!jointAmount || parsedAmount <= 0) {
      await customAlert("請輸入有效金額！");
      return;
    }
    setJointCart([...jointCart, { id: Date.now(), advancedBy: jointAdvanced, cat: jointCat, amount: parsedAmount, note: jointNote }]);
    setJointAmount('');
    setJointNote('');
    setJointCat(null);
  };

  const handleRemoveJointCart = (id) => {
    setJointCart(jointCart.filter(i => i.id !== id));
  };

  const handleJointSubmit = async () => {
    let finalItems = [...jointCart];
    if (jointAmount) {
      const parsedAmount = parseMoney(jointAmount);
      if (!jointAdvanced) {
        await customAlert("最後一筆(下方還未加入暫存)請選擇付款方式！");
        return;
      }
      if (parsedAmount <= 0) {
        await customAlert("請輸入有效金額！");
        return;
      }
      if (!jointCat) {
        await customAlert("最後一筆輸入尚未選擇分類！");
        return;
      }
      finalItems.push({ advancedBy: jointAdvanced, cat: jointCat, amount: parsedAmount, note: jointNote });
    }
    if (finalItems.length === 0) {
      await customAlert("請輸入花費金額或加入暫存！");
      return;
    }

    const getDeepCopy = (obj) => JSON.parse(JSON.stringify(obj));
    let newAssets = getDeepCopy(assets);
    let records = [];

    // Group items by advancedBy
    const grouped = {};
    finalItems.forEach(item => {
      if (!grouped[item.advancedBy]) grouped[item.advancedBy] = [];
      grouped[item.advancedBy].push(item);
    });

    for (const advancedBy of Object.keys(grouped)) {
      let items = grouped[advancedBy];
      const total = items.reduce((sum, item) => sum + item.amount, 0);
      const isMulti = items.length > 1;
      const mainCat = isMulti ? '多筆合併' : items[0].cat;

      const safeNote = items.map(i => {
        let s = isMulti ? `[${i.cat}] $${i.amount}` : '';
        if (i.note) s += (s ? ` - ${i.note}` : i.note);
        if (!s) s = i.cat;
        return s;
      }).join('，');

      if (advancedBy === 'jointCash') {
        if (newAssets.jointCash < total) {
          await customAlert("❌ 共同現金不足以支付總額：" + formatMoney(total));
          return;
        }
        newAssets.jointCash -= total;
      } else if (advancedBy === 'userA') {
        if (newAssets.userA < total) {
          await customAlert("❌ 大狗狗🐕的個人餘額不足以代墊：" + formatMoney(total));
          return;
        }
        newAssets.userA -= total;
      } else if (advancedBy === 'userB') {
        if (newAssets.userB < total) {
          await customAlert("❌ 阿陞🐶的個人餘額不足以代墊：" + formatMoney(total));
          return;
        }
        newAssets.userB -= total;
      }

      records.push({
        date: txDate, month: txDate.slice(0, 7), type: 'spend', category: '共同支出', payer: '共同帳戶',
        total: total, note: safeNote ? `${mainCat} - ${safeNote}` : mainCat,
        advancedBy: advancedBy === 'jointCash' ? null : advancedBy,
        isSettled: false
      });
    }

    if (!(await customConfirm(`確定要送出這 ${finalItems.length} 筆共同記帳嗎？\n(包含 ${Object.keys(grouped).length} 種不同的扣款來源)`))) return;

    if (onTransaction) {
      onTransaction(newAssets, records);
    } else {
      await customAlert("Error: onTransaction method is not provided");
    }

    setJointCart([]);
    setJointAmount('');
    setJointNote('');
    setJointCat(null);
  };

  // --- 個人記帳邏輯 ---
  const handleAddPersCart = async () => {
    if (!persUser) {
      await customAlert("請選擇記誰的帳！");
      return;
    }
    if (!persCat) {
      await customAlert("請選擇分類！");
      return;
    }
    const parsedAmount = parseMoney(persAmount);
    if (!persAmount || parsedAmount <= 0) {
      await customAlert("請輸入有效金額！");
      return;
    }
    setPersCart([...persCart, { id: Date.now(), user: persUser, cat: persCat, amount: parsedAmount, note: persNote }]);
    setPersAmount('');
    setPersNote('');
    setPersCat(null);
  };

  const handleRemovePersCart = (id) => {
    setPersCart(persCart.filter(i => i.id !== id));
  };

  const handlePersonalSubmit = async () => {
    let finalItems = [...persCart];
    if (persAmount) {
      const parsedAmount = parseMoney(persAmount);
      if (!persUser) {
        await customAlert("最後一筆(下方還未加入暫存)請選擇記誰的帳！");
        return;
      }
      if (parsedAmount <= 0) {
        await customAlert("請輸入有效金額！");
        return;
      }
      if (!persCat) {
        await customAlert("最後一筆輸入尚未選擇分類！");
        return;
      }
      finalItems.push({ user: persUser, cat: persCat, amount: parsedAmount, note: persNote });
    }
    if (finalItems.length === 0) {
      await customAlert("請輸入花費金額或加入暫存！");
      return;
    }

    const getDeepCopy = (obj) => JSON.parse(JSON.stringify(obj));
    let newAssets = getDeepCopy(assets);
    let records = [];

    const grouped = {};
    finalItems.forEach(item => {
      if (!grouped[item.user]) grouped[item.user] = [];
      grouped[item.user].push(item);
    });

    // ★ Fix: 使用 for...of 取代 forEach + throw，確保餘額不足時能正確中斷
    for (const user of Object.keys(grouped)) {
      let items = grouped[user];
      const total = items.reduce((sum, item) => sum + item.amount, 0);
      const isMulti = items.length > 1;
      const finalNote = items.map(i => {
        let s = isMulti ? `[${i.cat}] $${i.amount}` : '';
        if (i.note) s += (s ? ` - ${i.note}` : i.note);
        if (!s) s = i.cat;
        return s;
      }).join('，');

      const expenseData = { food: 0, shopping: 0, fixed: 0, other: 0 };
      const catMap = { '餐費': 'food', '購物': 'shopping', '固定費用': 'fixed', '固定': 'fixed', '其他': 'other' };

      items.forEach(i => {
        expenseData[catMap[i.cat] || 'other'] += i.amount;
      });

      const payerKey = user === 'userA' ? 'userA' : 'userB';
      const payerName = user === 'userA' ? '大狗狗🐕' : '阿陞🐶';

      if (newAssets[payerKey] < total) {
        await customAlert(`⚠️ 取消送出：${payerName} 的個人餘額不足以支付 ${formatMoney(total)}！`);
        return;
      }
      newAssets[payerKey] -= total;

      records.push({
        date: txDate, month: txDate.slice(0, 7), type: 'expense', category: '個人支出', details: expenseData,
        total: total, payer: payerName, note: finalNote || '日記帳'
      });
    }

    if (!(await customConfirm(`確定要送出這 ${finalItems.length} 筆個人記帳嗎？\n(包含來自 ${Object.keys(grouped).length} 個不同帳戶)`))) return;

    if (onTransaction) {
      onTransaction(newAssets, records);
    } else {
      await customAlert("Error: onTransaction is undefined");
    }

    setPersCart([]);
    setPersAmount('');
    setPersNote('');
    setPersCat(null);
  };

  const handleSaveNewBill = async () => {
    if (!setAssets) {
      await customAlert("❌ 系統錯誤：未取得資料庫權限，請確認 App.jsx 是否已更新！");
      return;
    }
    if (!billName) {
      await customAlert("請填寫帳單名稱！");
      return;
    }
    const amountVal = parseMoney(billAmount);
    if (billType === 'fixed' && amountVal <= 0) {
      await customAlert("請輸入有效的正數帳單金額！");
      return;
    }

    const updatedBillData = {
      name: billName,
      scope: billScope,
      payer: billPayer,
      type: billType,
      amount: billType === 'fixed' ? parseMoney(billAmount) : 0,
      cycle: Number(billCycle),
      nextDate: billNextDate
    };

    if (editingBillId) {
      const updatedBills = safeBills.map(b => b.id === editingBillId ? { ...b, ...updatedBillData } : b);
      setAssets({ ...assets, bills: updatedBills });
      await customAlert("✅ 帳單修改成功！");
    } else {
      const newBill = { id: Date.now().toString(), ...updatedBillData };
      setAssets({ ...assets, bills: [...safeBills, newBill] });
      await customAlert("✅ 帳單設定成功！");
    }

    setShowAddBill(false);
    setEditingBillId(null);
    setBillName('');
    setBillAmount('');
  };

  const handleEditBill = (bill) => {
    setBillName(bill.name);
    setBillScope(bill.scope);
    setBillPayer(bill.payer);
    setBillType(bill.type);
    setBillAmount(bill.amount > 0 ? formatInputMoney(bill.amount) : '');
    setBillCycle(bill.cycle);
    setBillNextDate(bill.nextDate);
    setEditingBillId(bill.id);
    setShowAddBill(true);
  };

  const handlePayBill = async (bill) => {
    if (!setAssets) {
      await customAlert("❌ 系統錯誤：未取得資料庫權限！");
      return;
    }

    let finalAmount = bill.amount;
    if (bill.type === 'variable') {
      const input = await customPrompt(`請輸入【${bill.name}】本期的實際扣款金額：`, '', '輸入金額', 'decimal');
      if (!input || isNaN(input)) {
        await customAlert("❌ 已取消或金額無效");
        return;
      }
      finalAmount = Number(input);
    }

    if (finalAmount <= 0) {
      await customAlert("金額無效");
      return;
    }

    // Check balance before confirmation dialog
    if (bill.scope === 'joint') {
      if (bill.payer === 'jointCash' && (assets.jointCash || 0) < finalAmount) {
        await customAlert("❌ 共同現金不足以支付此帳單！");
        return;
      } else if (bill.payer === 'userA' && (assets.userA || 0) < finalAmount) {
        await customAlert("❌ 大狗狗🐕的個人餘額不足以代墊此帳單！");
        return;
      } else if (bill.payer === 'userB' && (assets.userB || 0) < finalAmount) {
        await customAlert("❌ 阿陞🐶的個人餘額不足以代墊此帳單！");
        return;
      }
    } else {
      const userKey = bill.payer === 'userA' ? 'userA' : 'userB';
      const payerName = bill.payer === 'userA' ? '大狗狗🐕' : '阿陞🐶';
      if ((assets[userKey] || 0) < finalAmount) {
        await customAlert(`❌ ${payerName} 的個人餘額不足以支付此帳單！`);
        return;
      }
    }

    if (!(await customConfirm(`確定要認列【${bill.name}】扣款 ${formatMoney(finalAmount)} 嗎？`))) return;

    // 🛡️ 修復 Race Condition：把更新後的 bills 陣列當作參數一起丟給 App.jsx
    const nextDateStr = addMonthsSafe(bill.nextDate, bill.cycle);
    const updatedBills = safeBills.map(b => b.id === bill.id ? { ...b, nextDate: nextDateStr } : b);

    if (bill.scope === 'joint') {
      onAddJointExpense(todayStr, '固定費用', finalAmount, bill.payer, `[定期帳單] ${bill.name}`, updatedBills);
    } else {
      const userKey = bill.payer === 'userA' ? 'userA' : 'userB';
      onAddExpense(todayStr, { fixed: finalAmount }, finalAmount, userKey, `[定期帳單] ${bill.name}`, updatedBills);
    }
  };

  const handleDeleteBill = async (id) => {
    if (!setAssets) {
      await customAlert("❌ 系統錯誤：未取得資料庫權限！");
      return;
    }
    if (!(await customConfirm("⚠️ 確定要刪除這個帳單提醒嗎？"))) return;
    setAssets({ ...assets, bills: safeBills.filter(b => b.id !== id) });
  };

  return (
    <div className="page-transition-enter">
      <h1 className="page-title">記帳</h1>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
          <button className={`glass-btn ${activeTab === 'joint' ? '' : 'inactive'}`} onClick={() => setActiveTab('joint')} style={{ flex: 1, padding: '10px 0', fontSize: '0.88rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            🏫 共同
            {jointCart.length > 0 && (
              <span style={{
                marginLeft: '6px',
                background: 'var(--accent-red)',
                color: '#ffffff',
                fontSize: '0.72rem',
                padding: '2px 6px',
                borderRadius: 'var(--radius-pill)',
                fontWeight: '700',
                display: 'inline-block',
                lineHeight: 1
              }}>
                {jointCart.length}
              </span>
            )}
          </button>
          <button className={`glass-btn ${activeTab === 'personal' ? '' : 'inactive'}`} onClick={() => setActiveTab('personal')} style={{ flex: 1, padding: '10px 0', fontSize: '0.88rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            👤 個人
            {persCart.length > 0 && (
              <span style={{
                marginLeft: '6px',
                background: 'var(--accent-red)',
                color: '#ffffff',
                fontSize: '0.72rem',
                padding: '2px 6px',
                borderRadius: 'var(--radius-pill)',
                fontWeight: '700',
                display: 'inline-block',
                lineHeight: 1
              }}>
                {persCart.length}
              </span>
            )}
          </button>
          <button className={`glass-btn ${activeTab === 'bills' ? '' : 'inactive'}`} onClick={() => setActiveTab('bills')} style={{ flex: 1, padding: '10px 0', fontSize: '0.88rem', border: safeBills.some(b => isApproaching(b.nextDate)) ? '1px solid var(--accent-orange)' : undefined, animation: safeBills.some(b => isApproaching(b.nextDate)) ? 'pulseOrange 2s infinite' : 'none' }}>
            📅 帳單 {safeBills.some(b => isApproaching(b.nextDate)) && '🔴'}
          </button>
        </div>

      {activeTab !== 'bills' && (
        <div className="glass-card card-animate" style={{ padding: '12px 16px', marginBottom: '18px', borderLeft: '4px solid var(--accent-indigo)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
          <label style={{ fontWeight: '600', fontSize: '1rem', margin: 0, color: 'var(--text-primary)' }}>📅 消費日期</label>
          <input type="date" className="glass-input" style={{ flex: 1, minWidth: '140px', maxWidth: '100%', margin: 0, padding: '8px 12px', boxSizing: 'border-box' }} value={txDate} onChange={(e) => setTxDate(e.target.value)} />
        </div>
      )}

      {/* 🏫 共同記帳面板 */}
      {activeTab === 'joint' && (
        <div key="joint-panel" className="glass-card card-animate page-transition-enter">
          <h3 style={{ marginTop: 0, marginBottom: '15px', color: 'var(--text-primary)', fontWeight: '700' }}>🏫 共同花費</h3>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>分類</label>
            <SegmentedControl options={[{ label: '🍔 餐費', value: '餐費' }, { label: '🛍️ 購物', value: '購物' }, { label: '🏠 固定', value: '固定費用' }, { label: '📦 其他', value: '其他' }]} value={jointCat} onChange={setJointCat} />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>付款方式 (誰先付的？)</label>
            <SegmentedControl options={[{ label: '🏫 共同直接付', value: 'jointCash' }, { label: '大狗狗🐕代墊', value: 'userA' }, { label: '阿陞🐶代墊', value: 'userB' }]} value={jointAdvanced} onChange={setJointAdvanced} />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
            <div style={{ flex: 1, minWidth: '100px' }}>
              <label style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', fontWeight: '600' }}>金額</label>
              <input type="text" inputMode="numeric" className="glass-input" style={{ boxSizing: 'border-box' }} value={jointAmount} onChange={(e) => setJointAmount(formatInputMoney(e.target.value))} placeholder="$0" />
            </div>
            <div style={{ flex: 2, minWidth: '150px' }}>
              <label style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', fontWeight: '600' }}>備註 (選填)</label>
              <input type="text" className="glass-input" style={{ boxSizing: 'border-box' }} value={jointNote} onChange={(e) => setJointNote(e.target.value)} placeholder="例如：全聯買菜" />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '6px', marginBottom: '15px' }}>
            <button className="glass-btn" style={{ flex: 1, fontSize: '0.88rem' }} onClick={handleAddJointCart}>
              ➕ 暫存此筆
            </button>
            {jointCart.length > 0 && <button className="glass-btn glass-btn-danger" style={{ padding: '8px 12px', fontSize: '0.88rem' }} onClick={() => setJointCart([])}>🗑️ 清空</button>}
          </div>

          {jointCart.length > 0 && (
            <div style={{ background: 'rgba(52,199,89,0.06)', padding: '12px', borderRadius: 'var(--radius-sm)', marginBottom: '15px', border: '1px solid rgba(52,199,89,0.15)', animation: 'slideDown 0.3s ease-out' }}>
              <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '600' }}>🛒 本次合併明細：</div>
              {jointCart.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem', marginBottom: '6px', borderBottom: '0.5px solid rgba(0,0,0,0.04)', paddingBottom: '4px', gap: '8px' }}>
                  <div style={{ color: 'var(--text-primary)', flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                    <span style={{ background: 'rgba(120,120,128,0.08)', padding: '2px 6px', borderRadius: '6px', fontSize: '0.73rem', fontWeight: '500', whiteSpace: 'nowrap' }}>{item.cat}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--accent-indigo)', fontWeight: '600', whiteSpace: 'nowrap' }}>
                      [{item.advancedBy === 'jointCash' ? '🏫 共同' : (item.advancedBy === 'userA' ? '大狗狗🐕' : '阿陞🐶')}]
                    </span>
                    <span style={{ minWidth: 0, wordBreak: 'break-all' }}>{item.note || item.cat}</span>
                  </div>
                  <div style={{ fontWeight: '500', flexShrink: 0, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>{formatMoney(item.amount)}</span>
                    <button onClick={() => handleRemoveJointCart(item.id)} style={{ border: 'none', background: 'none', color: 'var(--accent-red)', padding: '2px 6px', cursor: 'pointer', fontSize: '0.85rem' }}>✖</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button className="glass-btn glass-btn-cta" style={{ width: '100%', fontWeight: '700', fontSize: '1.05rem' }} onClick={handleJointSubmit}>
            確認記帳 (總計: {formatMoney(jointCart.reduce((s, i) => s + i.amount, 0) + (parseMoney(jointAmount) || 0))})
          </button>
        </div>
      )}

      {/* 👤 個人記帳面板 */}
      {activeTab === 'personal' && (
        <div key="personal-panel" className="glass-card card-animate page-transition-enter">
          <h3 style={{ marginTop: 0, marginBottom: '15px', color: 'var(--text-primary)', fontWeight: '700' }}>👤 個人日記帳</h3>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>記誰的帳？</label>
            <SegmentedControl options={[{ label: '大狗狗🐕', value: 'userA' }, { label: '阿陞🐶', value: 'userB' }]} value={persUser} onChange={setPersUser} />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>分類</label>
            <SegmentedControl options={[{ label: '🍔 餐費', value: '餐費' }, { label: '🛍️ 購物', value: '購物' }, { label: '🏠 固定', value: '固定' }, { label: '📦 其他', value: '其他' }]} value={persCat} onChange={setPersCat} />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
            <div style={{ flex: 1, minWidth: '100px' }}>
              <label style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', fontWeight: '600' }}>金額</label>
              <input type="text" inputMode="numeric" className="glass-input" style={{ boxSizing: 'border-box' }} value={persAmount} onChange={(e) => setPersAmount(formatInputMoney(e.target.value))} placeholder="$0" />
            </div>
            <div style={{ flex: 2, minWidth: '150px' }}>
              <label style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', fontWeight: '600' }}>備註 (選填)</label>
              <input type="text" className="glass-input" style={{ boxSizing: 'border-box' }} value={persNote} onChange={(e) => setPersNote(e.target.value)} placeholder="例如：手搖飲" />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '6px', marginBottom: '15px' }}>
            <button className="glass-btn" style={{ flex: 1, fontSize: '0.88rem' }} onClick={handleAddPersCart}>
              ➕ 暫存此筆
            </button>
            {persCart.length > 0 && <button className="glass-btn glass-btn-danger" style={{ padding: '8px 12px', fontSize: '0.88rem' }} onClick={() => setPersCart([])}>🗑️ 清空</button>}
          </div>

          {persCart.length > 0 && (
            <div style={{ background: 'rgba(175,82,222,0.05)', padding: '12px', borderRadius: 'var(--radius-sm)', marginBottom: '15px', border: '1px solid rgba(175,82,222,0.12)', animation: 'slideDown 0.3s ease-out' }}>
              <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '600' }}>🛒 本次合併明細：</div>
              {persCart.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem', marginBottom: '6px', borderBottom: '0.5px solid rgba(0,0,0,0.04)', paddingBottom: '4px', gap: '8px' }}>
                  <div style={{ color: 'var(--text-primary)', flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                    <span style={{ background: 'rgba(120,120,128,0.08)', padding: '2px 6px', borderRadius: '6px', fontSize: '0.73rem', fontWeight: '500', whiteSpace: 'nowrap' }}>{item.cat}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--accent-purple)', fontWeight: '600', whiteSpace: 'nowrap' }}>
                      [{item.user === 'userA' ? '大狗狗🐕' : '阿陞🐶'}]
                    </span>
                    <span style={{ minWidth: 0, wordBreak: 'break-all' }}>{item.note || item.cat}</span>
                  </div>
                  <div style={{ fontWeight: '500', flexShrink: 0, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>{formatMoney(item.amount)}</span>
                    <button onClick={() => handleRemovePersCart(item.id)} style={{ border: 'none', background: 'none', color: 'var(--accent-red)', padding: '2px 6px', cursor: 'pointer', fontSize: '0.85rem' }}>✖</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button className="glass-btn glass-btn-cta" style={{ width: '100%', fontWeight: '700', fontSize: '1.05rem' }} onClick={handlePersonalSubmit}>
            確認記帳 (總計: {formatMoney(persCart.reduce((s, i) => s + i.amount, 0) + (parseMoney(persAmount) || 0))})
          </button>
        </div>
      )}

      {/* 📅 帳單管家面板 */}
      {activeTab === 'bills' && (
        <div key="bills-panel" className="page-transition-enter">
          {!showAddBill && (
            <button className="glass-btn" style={{ width: '100%', marginBottom: '18px', fontSize: '0.95rem' }} onClick={() => setShowAddBill(true)}>
              ➕ 新增定期帳單 / 訂閱
            </button>
          )}

          {showAddBill && (
            <div className="glass-card card-animate" style={{ marginBottom: '18px' }}>
              <h4 style={{ marginTop: 0, color: 'var(--accent-blue)', fontWeight: '700' }}>{editingBillId ? '✏️ 編輯帳單設定' : '➕ 新增帳單設定'}</h4>
              <input type="text" className="glass-input" placeholder="帳單名稱 (例: Netflix, 水費)" value={billName} onChange={e => setBillName(e.target.value)} />

              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', fontWeight: '600' }}>帳單歸屬</label>
                <SegmentedControl options={[{ label: '共同帳戶', value: 'jointCash' }, { label: '大狗狗🐕個人', value: 'userA' }, { label: '阿陞🐶個人', value: 'userB' }]} value={billPayer} onChange={(v) => { setBillPayer(v); setBillScope(v === 'jointCash' ? 'joint' : 'personal'); }} />
              </div>

              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', fontWeight: '600' }}>金額類型</label>
                <SegmentedControl options={[{ label: '固定金額 (如訂閱)', value: 'fixed' }, { label: '變動金額 (如水電)', value: 'variable' }]} value={billType} onChange={setBillType} />
              </div>

              {billType === 'fixed' && (
                <input type="text" inputMode="numeric" className="glass-input" placeholder="請輸入每期固定金額" value={billAmount} onChange={e => setBillAmount(formatInputMoney(e.target.value))} />
              )}

              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', fontWeight: '600' }}>繳費週期</label>
                <SegmentedControl options={[{ label: '每月', value: 1 }, { label: '每兩月', value: 2 }, { label: '每年', value: 12 }]} value={billCycle} onChange={setBillCycle} />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', fontWeight: '600' }}>「下次」預計扣款日</label>
                <input type="date" className="glass-input" style={{ width: '100%', boxSizing: 'border-box' }} value={billNextDate} onChange={e => setBillNextDate(e.target.value)} />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="glass-btn" style={{ flex: 1 }} onClick={() => { setShowAddBill(false); setEditingBillId(null); setBillName(''); setBillAmount(''); }}>取消</button>
                <button className="glass-btn glass-btn-cta" style={{ flex: 1 }} onClick={handleSaveNewBill}>儲存設定</button>
              </div>
            </div>
          )}

          <h3 style={{ color: 'var(--text-primary)', marginBottom: '15px', fontWeight: '700' }}>📋 我的帳單清單</h3>
          {safeBills.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '24px', fontSize: '0.9rem' }}>還沒有設定任何定期帳單喔！</div>
          ) : (
            safeBills.sort((a, b) => new Date(a.nextDate) - new Date(b.nextDate)).map(bill => {
              const isNearDue = isApproaching(bill.nextDate);
              return (
                <div key={bill.id} className="glass-card card-animate" style={{ marginBottom: '14px', borderLeft: isNearDue ? '4px solid var(--accent-orange)' : '4px solid var(--accent-green)', position: 'relative', animation: isNearDue ? 'pulseOrange 3s infinite' : 'none' }}>
                  <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '6px' }}>
                    <button onClick={() => handleEditBill(bill)} style={{ background: 'transparent', border: 'none', color: 'var(--accent-blue)', cursor: 'pointer', fontSize: '0.95rem' }}>✏️</button>
                    <button onClick={() => handleDeleteBill(bill.id)} style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '0.95rem' }}>✖</button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', paddingRight: '50px' }}>
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '1.05rem', color: 'var(--text-primary)' }}>{bill.name}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        {bill.payer === 'jointCash' ? '🏫 共同扣款' : (bill.payer === 'userA' ? '大狗狗🐕付' : '阿陞🐶付')} | {bill.cycle === 1 ? '每月' : bill.cycle === 2 ? '每兩月' : '每年'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: '700', color: isNearDue ? 'var(--accent-orange)' : 'var(--accent-green)' }}>{bill.type === 'fixed' ? formatMoney(bill.amount) : '金額變動'}</div>
                    </div>
                  </div>
                  <div style={{ background: isNearDue ? 'rgba(255,149,0,0.06)' : 'rgba(120,120,128,0.04)', padding: '10px', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '0.73rem', color: isNearDue ? 'var(--accent-orange)' : 'var(--text-tertiary)', fontWeight: '500' }}>下次扣款日</div>
                      <div style={{ fontWeight: '600', color: isNearDue ? 'var(--accent-orange)' : 'var(--text-primary)', fontSize: '0.9rem' }}>{bill.nextDate} {isNearDue && '⚠️ 即將到期'}</div>
                    </div>
                    <button className={isNearDue ? 'glass-btn glass-btn-cta' : 'glass-btn'} style={{ padding: '7px 14px', fontSize: '0.82rem' }} onClick={() => handlePayBill(bill)}>
                      ✅ 一鍵認列
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default ExpenseEntry;