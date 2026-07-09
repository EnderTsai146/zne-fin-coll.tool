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

// SF Symbols style line SVGs (HIG 3)
const getCategoryIcon = (catName) => {
  const strokeColor = "currentColor";
  if (catName.includes('娛') || catName.includes('樂') || catName.includes('玩')) {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: '5px' }}>
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <path d="M6 12h4" />
        <path d="M8 10v4" />
        <line x1="15" y1="13" x2="15.01" y2="13" />
        <line x1="18" y1="11" x2="18.01" y2="11" />
      </svg>
    );
  }
  if (catName.includes('餐') || catName.includes('食') || catName.includes('喝')) {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: '5px' }}>
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9z" />
        <path d="M12 2v6" />
        <path d="M12 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
      </svg>
    );
  }
  if (catName.includes('物') || catName.includes('用') || catName.includes('娛') || catName.includes('樂')) {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: '5px' }}>
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>
    );
  }
  if (catName.includes('固定') || catName.includes('租') || catName.includes('費') || catName.includes('水') || catName.includes('電') || catName.includes('稅')) {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: '5px' }}>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    );
  }
  if (catName.includes('投') || catName.includes('理') || catName.includes('金') || catName.includes('股')) {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: '5px' }}>
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    );
  }
  if (catName.includes('育') || catName.includes('孩') || catName.includes('女')) {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: '5px' }}>
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    );
  }
  if (catName.includes('寵') || catName.includes('貓') || catName.includes('狗')) {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: '5px' }}>
        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
        <path d="M8 14s1.5 2 4 2 4-2 4-2" />
        <line x1="9" y1="9" x2="9.01" y2="9" />
        <line x1="15" y1="9" x2="15.01" y2="9" />
      </svg>
    );
  }
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: '5px' }}>
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="4" y1="15" x2="20" y2="15" />
      <line x1="10" y1="3" x2="8" y2="21" />
      <line x1="16" y1="3" x2="14" y2="21" />
    </svg>
  );
};

const ExpenseEntry = ({ assets, setAssets, onAddExpense, onAddJointExpense, onTransaction, customAlert, customConfirm, customPrompt, getBudgetProgressText }) => {
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

  const isApproaching = (dateStr) => {
    return Math.ceil((new Date(dateStr) - new Date(todayStr)) / (1000 * 60 * 60 * 24)) <= 3;
  };

  // Dynamic Categories Config (Task 1)
  const dynamicCategories = assets?.config?.categories || ["餐費", "購物", "娛樂", "其他"];
  const [jointNecessity, setJointNecessity] = useState('need'); // 'need' or 'want'
  const [persNecessity, setPersNecessity] = useState('need'); // 'need' or 'want'
  const categoryOptions = dynamicCategories.map(cat => ({
    label: (
      <span>
        {getCategoryIcon(cat)}
        {cat}
      </span>
    ),
    value: cat
  }));

  // Budget threshold helper (Task 4)
  const checkBudgetThreshold = (newSpendAmount) => {
    if (!getBudgetProgressText) return '';
    const progress = getBudgetProgressText(assets, newSpendAmount);
    const p = progress.percentage;
    if (p >= 100) {
      return `\n⚠️ 【預算超額警示 🔴】\n本月共同支出累計將達預算的 ${p}%，已突破預算上限，請節制支出！\n\n`;
    } else if (p >= 90) {
      return `\n⚠️ 【預算橘色警戒 🟠】\n本月共同支出累計將達預算的 ${p}%，已極度逼近預算上限，請注意控制！\n\n`;
    } else if (p >= 70) {
      return `\n⚠️ 【預算水位提醒 🟡】\n本月共同支出累計將達預算的 ${p}%，已達警戒範圍，請留意剩餘開支！\n\n`;
    }
    return '';
  };

  // 🔌 外部資料匯入接軌 Hook (Task 2)
  const onImportRawData = async (rawData, type = 'carrier') => {
    console.log(`[外部導入 Hook] 載入資料: ${rawData}, 類型: ${type}`);
    if (customAlert) {
      await customAlert(`🔌 外部資料導入接軌測試成功！\n已將來源數據「${type}」導入記帳通道。`);
    }
  };

  // --- 共同記帳邏輯 ---
  const handleAddJointCart = async () => {
    if (!jointAdvanced) {
      await customAlert("請選擇付款方式！");
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

    const existingCartTotal = jointCart
      .filter(item => item.advancedBy === jointAdvanced)
      .reduce((sum, item) => sum + item.amount, 0);
    const totalProposed = existingCartTotal + parsedAmount;
    const currentBalance = assets[jointAdvanced] || 0;
    if (currentBalance < totalProposed) {
      const payerName = jointAdvanced === 'jointCash' ? '共同現金' : (jointAdvanced === 'userA' ? '大狗狗🐕' : '阿陞🐶');
      await customAlert(`❌ 餘額不足！當前 ${payerName} 餘額為 ${formatMoney(currentBalance)}，暫存購物車已累計 ${formatMoney(existingCartTotal)}，無法再加入 ${formatMoney(parsedAmount)}`);
      return;
    }

    setJointCart([...jointCart, { id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`, advancedBy: jointAdvanced, cat: jointCat, amount: parsedAmount, note: jointNote, necessity: jointNecessity }]);
    setJointAmount('');
    setJointNote('');
    setJointCat(null);
    setJointNecessity('need');
  };

  const handleRemoveJointCart = (id) => {
    setJointCart(jointCart.filter(i => i.id !== id));
  };

  const handleJointSubmit = async () => {
    let finalItems = [...jointCart];
    if (jointAmount) {
      const parsedAmount = parseMoney(jointAmount);
      if (!jointAdvanced) {
        await customAlert("請為最後一筆填寫付款方式！");
        return;
      }
      if (parsedAmount <= 0) {
        await customAlert("請輸入有效金額！");
        return;
      }
      if (!jointCat) {
        await customAlert("請為最後一筆選擇分類！");
        return;
      }
      finalItems.push({ advancedBy: jointAdvanced, cat: jointCat, amount: parsedAmount, note: jointNote, necessity: jointNecessity });
    }
    if (finalItems.length === 0) {
      await customAlert("請輸入金額或加入暫存！");
      return;
    }

    const getDeepCopy = (obj) => structuredClone(obj);
    let newAssets = getDeepCopy(assets);
    let records = [];

    const grouped = {};
    finalItems.forEach(item => {
      const gKey = `${item.advancedBy}_${item.necessity || 'need'}`;
      if (!grouped[gKey]) grouped[gKey] = [];
      grouped[gKey].push(item);
    });

    let errors = [];
    for (const gKey of Object.keys(grouped)) {
      let items = grouped[gKey];
      const total = items.reduce((sum, item) => sum + item.amount, 0);
      const [advancedBy] = gKey.split('_');

      if (advancedBy === 'jointCash') {
        if (newAssets.jointCash < total) {
          errors.push(`共同現金不足！餘額 ${formatMoney(newAssets.jointCash)}，購物車為 ${formatMoney(total)}`);
        }
      } else if (advancedBy === 'userA') {
        if (newAssets.userA < total) {
          errors.push(`大狗狗個人餘額不足！餘額 ${formatMoney(newAssets.userA)}，購物車為 ${formatMoney(total)}`);
        }
      } else if (advancedBy === 'userB') {
        if (newAssets.userB < total) {
          errors.push(`阿陞個人餘額不足！餘額 ${formatMoney(newAssets.userB)}，購物車為 ${formatMoney(total)}`);
        }
      }
    }

    if (errors.length > 0) {
      await customAlert(`❌ 無法送出記帳：\n` + errors.join('\n'));
      return;
    }

    for (const gKey of Object.keys(grouped)) {
      let items = grouped[gKey];
      const total = items.reduce((sum, item) => sum + item.amount, 0);
      const [advancedBy, necessity] = gKey.split('_');
      const isMulti = items.length > 1;
      const mainCat = isMulti ? '多筆合併' : items[0].cat;

      const safeNote = items.map(i => {
        let s = isMulti ? `[${i.cat}] $${i.amount}` : '';
        if (i.note) s += (s ? ` - ${i.note}` : i.note);
        if (!s) s = i.cat;
        return s;
      }).join('，');

      if (advancedBy === 'jointCash') {
        newAssets.jointCash -= total;
      } else if (advancedBy === 'userA') {
        newAssets.userA -= total;
      } else if (advancedBy === 'userB') {
        newAssets.userB -= total;
      }

      records.push({
        date: txDate, month: txDate.slice(0, 7), type: 'spend', category: '共同支出', payer: '共同帳戶',
        total: total, note: safeNote ? `${mainCat} - ${safeNote}` : mainCat,
        advancedBy: advancedBy === 'jointCash' ? null : advancedBy,
        isSettled: false, subCategory: mainCat, necessity: necessity
      });
    }

    const totalAmount = finalItems.reduce((sum, item) => sum + item.amount, 0);
    const budgetWarning = checkBudgetThreshold(totalAmount);

    if (!(await customConfirm(`${budgetWarning}確定要送出這 ${finalItems.length} 筆共同記帳嗎？`))) return;

    if (onTransaction) {
      onTransaction(newAssets, records);
    }

    setJointCart([]);
    setJointAmount('');
    setJointNote('');
    setJointCat(null);
    setJointNecessity('need');
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

    const existingCartTotal = persCart
      .filter(item => item.user === persUser)
      .reduce((sum, item) => sum + item.amount, 0);
    const totalProposed = existingCartTotal + parsedAmount;
    const currentBalance = assets[persUser] || 0;
    if (currentBalance < totalProposed) {
      const payerName = persUser === 'userA' ? '大狗狗🐕' : '阿陞🐶';
      await customAlert(`❌ 餘額不足！當前 ${payerName} 個人餘額為 ${formatMoney(currentBalance)}，暫存購物車已累計 ${formatMoney(existingCartTotal)}，無法再加入 ${formatMoney(parsedAmount)}`);
      return;
    }

    setPersCart([...persCart, { id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`, user: persUser, cat: persCat, amount: parsedAmount, note: persNote, necessity: persNecessity }]);
    setPersAmount('');
    setPersNote('');
    setPersCat(null);
    setPersNecessity('need');
  };

  const handleRemovePersCart = (id) => {
    setPersCart(persCart.filter(i => i.id !== id));
  };

  const handlePersonalSubmit = async () => {
    let finalItems = [...persCart];
    if (persAmount) {
      const parsedAmount = parseMoney(persAmount);
      if (!persUser) {
        await customAlert("請為最後一筆選擇記誰的帳！");
        return;
      }
      if (parsedAmount <= 0) {
        await customAlert("請輸入有效金額！");
        return;
      }
      if (!persCat) {
        await customAlert("請為最後一筆選擇分類！");
        return;
      }
      finalItems.push({ user: persUser, cat: persCat, amount: parsedAmount, note: persNote, necessity: persNecessity });
    }
    if (finalItems.length === 0) {
      await customAlert("請輸入花費金額或加入暫存！");
      return;
    }

    const getDeepCopy = (obj) => structuredClone(obj);
    let newAssets = getDeepCopy(assets);
    let records = [];

    const grouped = {};
    finalItems.forEach(item => {
      const gKey = `${item.user}_${item.necessity || 'need'}`;
      if (!grouped[gKey]) grouped[gKey] = [];
      grouped[gKey].push(item);
    });

    let errors = [];
    for (const gKey of Object.keys(grouped)) {
      let items = grouped[gKey];
      const total = items.reduce((sum, item) => sum + item.amount, 0);
      const [user] = gKey.split('_');
      const payerKey = user === 'userA' ? 'userA' : 'userB';
      const payerName = user === 'userA' ? '大狗狗🐕' : '阿陞🐶';

      if (newAssets[payerKey] < total) {
        errors.push(`${payerName} 個人餘額不足！餘額 ${formatMoney(newAssets[payerKey])}，購物車為 ${formatMoney(total)}`);
      }
    }

    if (errors.length > 0) {
      await customAlert(`❌ 無法送出個人記帳：\n` + errors.join('\n'));
      return;
    }

    for (const gKey of Object.keys(grouped)) {
      let items = grouped[gKey];
      const total = items.reduce((sum, item) => sum + item.amount, 0);
      const [user, necessity] = gKey.split('_');
      const isMulti = items.length > 1;
      const finalNote = items.map(i => {
        let s = isMulti ? `[${i.cat}] $${i.amount}` : '';
        if (i.note) s += (s ? ` - ${i.note}` : i.note);
        if (!s) s = i.cat;
        return s;
      }).join('，');

      // Task 1 Dynamic category schema mapper
      const expenseData = { food: 0, shopping: 0, entertainment: 0, other: 0 };
      items.forEach(i => {
        const cat = i.cat || '';
        if (cat === '餐費') {
          expenseData.food += i.amount;
        } else if (cat === '購物') {
          expenseData.shopping += i.amount;
        } else if (cat === '娛樂') {
          expenseData.entertainment += i.amount;
        } else {
          expenseData.other += i.amount;
        }
      });

      const payerKey = user === 'userA' ? 'userA' : 'userB';
      const payerName = user === 'userA' ? '大狗狗🐕' : '阿陞🐶';

      newAssets[payerKey] -= total;

      records.push({
        date: txDate, month: txDate.slice(0, 7), type: 'expense', category: '個人支出', details: expenseData,
        total: total, payer: payerName, note: finalNote || '日記帳', necessity: necessity
      });
    }

    if (!(await customConfirm(`確定要送出這 ${finalItems.length} 筆個人記帳嗎？`))) return;

    if (onTransaction) {
      onTransaction(newAssets, records);
    }

    setPersCart([]);
    setPersAmount('');
    setPersNote('');
    setPersCat(null);
    setPersNecessity('need');
  };

  const handleSaveNewBill = async () => {
    if (!setAssets) {
      await customAlert("❌ 系統錯誤：未取得資料庫權限！");
      return;
    }
    if (!billName) {
      await customAlert("請填寫帳單名稱！");
      return;
    }
    const amountVal = parseMoney(billAmount);
    if (billType === 'fixed' && amountVal <= 0) {
      await customAlert("請輸入有效的帳單金額！");
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
      setAssets(prev => {
        const currentSafeBills = prev.bills || [];
        const updatedBills = currentSafeBills.map(b => b.id === editingBillId ? { ...b, ...updatedBillData } : b);
        return { ...prev, bills: updatedBills };
      });
      await customAlert("✅ 帳單修改成功！");
    } else {
      setAssets(prev => {
        const currentSafeBills = prev.bills || [];
        const newBill = { id: Date.now().toString(), ...updatedBillData };
        return { ...prev, bills: [...currentSafeBills, newBill] };
      });
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
        await customAlert("❌ 金額無效");
        return;
      }
      finalAmount = Number(input);
    }

    if (finalAmount <= 0) {
      await customAlert("金額無效");
      return;
    }

    if (bill.scope === 'joint') {
      if (bill.payer === 'jointCash' && (assets.jointCash || 0) < finalAmount) {
        await customAlert("❌ 共同現金不足！");
        return;
      } else if (bill.payer === 'userA' && (assets.userA || 0) < finalAmount) {
        await customAlert("❌ 大狗狗個人餘額不足！");
        return;
      } else if (bill.payer === 'userB' && (assets.userB || 0) < finalAmount) {
        await customAlert("❌ 阿陞個人餘額不足！");
        return;
      }
    } else {
      const userKey = bill.payer === 'userA' ? 'userA' : 'userB';
      const payerName = bill.payer === 'userA' ? '大狗狗🐕' : '阿陞🐶';
      if ((assets[userKey] || 0) < finalAmount) {
        await customAlert(`❌ ${payerName} 的個人餘額不足！`);
        return;
      }
    }

    if (!(await customConfirm(`確定要認列【${bill.name}】扣款 ${formatMoney(finalAmount)} 嗎？`))) return;

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
    setAssets(prev => ({ ...prev, bills: (prev.bills || []).filter(b => b.id !== id) }));
  };

  return (
    <div className="page-transition-enter">
      <h1 className="page-title">記帳</h1>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
        <button className={`glass-btn ${activeTab === 'joint' ? '' : 'inactive'}`} onClick={() => setActiveTab('joint')} style={{ flex: 1, padding: '10px 0', fontSize: '0.88rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          共同
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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          個人
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
        <button className={`glass-btn ${activeTab === 'bills' ? '' : 'inactive'}`} onClick={() => setActiveTab('bills')} style={{ flex: 1, padding: '10px 0', fontSize: '0.88rem', border: safeBills.some(b => isApproaching(b.nextDate)) ? '1px solid var(--accent-orange)' : undefined, animation: safeBills.some(b => isApproaching(b.nextDate)) ? 'pulseOrange 2s infinite' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          帳單 {safeBills.some(b => isApproaching(b.nextDate)) && ' ⚠️'}
        </button>
      </div>

      {/* 🏫 共同記帳面板 */}
      {activeTab === 'joint' && (
        <div key="joint-panel" className="glass-card card-animate page-transition-enter" style={{ padding: '20px 18px' }}>
          <h3 style={{ marginTop: 0, marginBottom: '20px', color: 'var(--text-primary)', fontWeight: '800', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-indigo)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            共同支出登錄
          </h3>

          {/* Grouped Inset Card (HIG 1) */}
          <div className="inset-group-card">
            <div className="inset-group-row">
              <span className="inset-group-label">📅 消費日期</span>
              <span className="inset-group-value">
                <input type="date" style={{ background: 'none', border: 'none', color: '#fff', textAlign: 'right', outline: 'none', fontFamily: 'var(--font-family)' }} value={txDate} onChange={(e) => setTxDate(e.target.value)} />
              </span>
            </div>

            <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>🏷️ 分類</span>
              <SegmentedControl options={categoryOptions} value={jointCat} onChange={setJointCat} />
              <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '2px', alignSelf: 'flex-start', lineHeight: '1.4' }}>
                ✦「固定費用」現已合併至「帳單」功能，請至「帳單」輸入。
              </div>
            </div>

            <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>💳 付款方式</span>
              <SegmentedControl 
                options={[
                  { label: '大狗狗代墊 🐕', value: 'userA' }, 
                  { label: '共同直接付 🏫', value: 'jointCash' }, 
                  { label: '阿陞代墊 🐶', value: 'userB' }
                ]} 
                value={jointAdvanced} 
                onChange={setJointAdvanced} 
              />
            </div>

            <div className="inset-group-row">
              <span className="inset-group-label">💵 金額</span>
              <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                <input type="text" inputMode="numeric" className="inset-group-input" value={jointAmount} onChange={(e) => setJointAmount(formatInputMoney(e.target.value))} placeholder="$0" />
              </span>
            </div>

            <div className="inset-group-row">
              <span className="inset-group-label">📝 備註 (選填)</span>
              <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                <input type="text" className="inset-group-input" value={jointNote} onChange={(e) => setJointNote(e.target.value)} placeholder="例如：好市多買菜" />
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <button className="glass-btn" style={{ flex: 1, fontSize: '0.88rem', fontWeight: '600' }} onClick={handleAddJointCart}>
              ➕ 暫存此筆
            </button>
            {jointCart.length > 0 && <button className="glass-btn glass-btn-danger" style={{ padding: '8px 16px', fontSize: '0.88rem' }} onClick={() => setJointCart([])}>清空暫存</button>}
          </div>

          {jointCart.length > 0 && (
            <div style={{ background: 'rgba(52,199,89,0.06)', padding: '16px', borderRadius: '14px', marginBottom: '20px', border: '1px solid rgba(52,199,89,0.15)', animation: 'slideDown 0.3s ease-out' }}>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '12px', fontWeight: '700' }}>🛒 本次合併明細：</div>
              {jointCart.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.88rem', marginBottom: '8px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', paddingBottom: '6px', gap: '8px' }}>
                  <div style={{ color: 'var(--text-primary)', flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                    <span style={{ background: 'rgba(255, 255, 255, 0.08)', color: 'var(--text-primary)', padding: '3px 8px', borderRadius: '6px', fontSize: '0.73rem', fontWeight: '600', whiteSpace: 'nowrap' }}>{item.cat}</span>
                    <span style={{ 
                      background: item.necessity === 'want' ? 'rgba(255, 149, 0, 0.08)' : 'rgba(10, 132, 255, 0.08)', 
                      color: item.necessity === 'want' ? '#ff9f0a' : '#0a84ff', 
                      padding: '3px 8px', 
                      borderRadius: '6px', 
                      fontSize: '0.73rem', 
                      fontWeight: '600', 
                      whiteSpace: 'nowrap' 
                    }}>
                      {item.necessity === 'want' ? '選擇性 ✨' : '必要 🍲'}
                    </span>
                    <span style={{ 
                      fontSize: '0.73rem', 
                      fontWeight: '700', 
                      whiteSpace: 'nowrap',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      background: item.advancedBy === 'jointCash' ? 'rgba(255, 149, 0, 0.12)' : (item.advancedBy === 'userA' ? 'rgba(255, 45, 87, 0.12)' : 'rgba(52, 199, 89, 0.15)'),
                      color: item.advancedBy === 'jointCash' ? '#ffb94f' : (item.advancedBy === 'userA' ? '#ff8da1' : '#8effa2')
                    }}>
                      {item.advancedBy === 'jointCash' ? '共同帳戶' : (item.advancedBy === 'userA' ? '大狗狗代墊' : '阿陞代墊')}
                    </span>
                    <span style={{ minWidth: 0, wordBreak: 'break-all' }}>{item.note || item.cat}</span>
                  </div>
                  <div style={{ fontWeight: '600', flexShrink: 0, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{formatMoney(item.amount)}</span>
                    <button onClick={() => handleRemoveJointCart(item.id)} style={{ border: 'none', background: 'none', color: 'var(--accent-red)', padding: '2px 6px', cursor: 'pointer', fontSize: '0.9rem' }}>✖</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button className="glass-btn glass-btn-cta" style={{ width: '100%', fontWeight: '700', padding: '14px', fontSize: '1rem', borderRadius: '14px' }} onClick={handleJointSubmit}>
            確認記帳 (總計: {formatMoney(jointCart.reduce((s, i) => s + i.amount, 0) + (parseMoney(jointAmount) || 0))})
          </button>
        </div>
      )}

      {/* 👤 個人記帳面板 */}
      {activeTab === 'personal' && (
        <div key="personal-panel" className="glass-card card-animate page-transition-enter" style={{ padding: '20px 18px' }}>
          <h3 style={{ marginTop: 0, marginBottom: '20px', color: 'var(--text-primary)', fontWeight: '800', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-purple)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            個人日記帳登錄
          </h3>

          {/* Grouped Inset Card (HIG 1) */}
          <div className="inset-group-card">
            <div className="inset-group-row">
              <span className="inset-group-label">消費日期</span>
              <span className="inset-group-value">
                <input type="date" style={{ background: 'none', border: 'none', color: '#fff', textAlign: 'right', outline: 'none', fontFamily: 'var(--font-family)' }} value={txDate} onChange={(e) => setTxDate(e.target.value)} />
              </span>
            </div>

            <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>👤 記誰的帳？</span>
              <SegmentedControl options={[{ label: '大狗狗 🐕', value: 'userA' }, { label: '阿陞 🐶', value: 'userB' }]} value={persUser} onChange={setPersUser} />
            </div>

            <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>🏷️ 分類</span>
              <SegmentedControl options={categoryOptions} value={persCat} onChange={setPersCat} />
              <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '2px', alignSelf: 'flex-start', lineHeight: '1.4' }}>
                ✦「固定費用」現已合併至「帳單」功能，請至「帳單」輸入。
              </div>
            </div>



            <div className="inset-group-row">
              <span className="inset-group-label">💵 金額</span>
              <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                <input type="text" inputMode="numeric" className="inset-group-input" value={persAmount} onChange={(e) => setPersAmount(formatInputMoney(e.target.value))} placeholder="$0" />
              </span>
            </div>

            <div className="inset-group-row">
              <span className="inset-group-label">📝 備註 (選填)</span>
              <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                <input type="text" className="inset-group-input" value={persNote} onChange={(e) => setPersNote(e.target.value)} placeholder="例如：手動輸入手搖杯" />
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <button className="glass-btn" style={{ flex: 1, fontSize: '0.88rem', fontWeight: '600' }} onClick={handleAddPersCart}>
              ➕ 暫存此筆
            </button>
            {persCart.length > 0 && <button className="glass-btn glass-btn-danger" style={{ padding: '8px 16px', fontSize: '0.88rem' }} onClick={() => setPersCart([])}>清空暫存</button>}
          </div>

          {persCart.length > 0 && (
            <div style={{ background: 'rgba(175,82,222,0.05)', padding: '16px', borderRadius: '14px', marginBottom: '20px', border: '1px solid rgba(175,82,222,0.15)', animation: 'slideDown 0.3s ease-out' }}>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '12px', fontWeight: '700' }}>🛒 本次合併明細：</div>
              {persCart.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.88rem', marginBottom: '8px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', paddingBottom: '6px', gap: '8px' }}>
                  <div style={{ color: 'var(--text-primary)', flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                    <span style={{ background: 'rgba(255, 255, 255, 0.08)', color: 'var(--text-primary)', padding: '3px 8px', borderRadius: '6px', fontSize: '0.73rem', fontWeight: '600', whiteSpace: 'nowrap' }}>{item.cat}</span>
                    <span style={{ 
                      background: item.necessity === 'want' ? 'rgba(255, 149, 0, 0.08)' : 'rgba(10, 132, 255, 0.08)', 
                      color: item.necessity === 'want' ? '#ff9f0a' : '#0a84ff', 
                      padding: '3px 8px', 
                      borderRadius: '6px', 
                      fontSize: '0.73rem', 
                      fontWeight: '600', 
                      whiteSpace: 'nowrap' 
                    }}>
                      {item.necessity === 'want' ? '選擇性 ✨' : '必要 🍲'}
                    </span>
                    <span style={{ 
                      fontSize: '0.73rem', 
                      fontWeight: '700', 
                      whiteSpace: 'nowrap',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      background: item.user === 'userA' ? 'rgba(255, 45, 87, 0.12)' : 'rgba(52, 199, 89, 0.15)',
                      color: item.user === 'userA' ? '#ff8da1' : '#8effa2'
                    }}>
                      {item.user === 'userA' ? '大狗狗' : '阿陞'}
                    </span>
                    <span style={{ minWidth: 0, wordBreak: 'break-all' }}>{item.note || item.cat}</span>
                  </div>
                  <div style={{ fontWeight: '600', flexShrink: 0, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{formatMoney(item.amount)}</span>
                    <button onClick={() => handleRemovePersCart(item.id)} style={{ border: 'none', background: 'none', color: 'var(--accent-red)', padding: '2px 6px', cursor: 'pointer', fontSize: '0.9rem' }}>✖</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button className="glass-btn glass-btn-cta" style={{ width: '100%', fontWeight: '700', padding: '14px', fontSize: '1rem', borderRadius: '14px' }} onClick={handlePersonalSubmit}>
            確認記帳 (總計: {formatMoney(persCart.reduce((s, i) => s + i.amount, 0) + (parseMoney(persAmount) || 0))})
          </button>
        </div>
      )}

      {/* 📅 帳單管家面板 */}
      {activeTab === 'bills' && (
        <div key="bills-panel" className="page-transition-enter">
          {!showAddBill && (
            <button className="glass-btn" style={{ width: '100%', marginBottom: '18px', fontSize: '0.92rem', fontWeight: '600' }} onClick={() => setShowAddBill(true)}>
              ➕ 新增定期帳單 / 訂閱
            </button>
          )}

          {showAddBill && (
            <div className="glass-card card-animate" style={{ marginBottom: '18px', padding: '20px 18px' }}>
              <h4 style={{ marginTop: 0, marginBottom: '16px', color: 'var(--accent-blue)', fontWeight: '800' }}>{editingBillId ? '✏️ 編輯帳單設定' : '➕ 新增帳單設定'}</h4>
              
              <div className="inset-group-card">
                <div className="inset-group-row">
                  <span className="inset-group-label">帳單名稱</span>
                  <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                    <input type="text" className="inset-group-input" placeholder="Netflix, 水費" value={billName} onChange={e => setBillName(e.target.value)} />
                  </span>
                </div>

                <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                  <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>帳單歸屬</span>
                  <SegmentedControl options={[{ label: '大狗狗個人 🐕', value: 'userA' }, { label: '共同帳戶 🏫', value: 'jointCash' }, { label: '阿陞個人 🐶', value: 'userB' }]} value={billPayer} onChange={(v) => { setBillPayer(v); setBillScope(v === 'jointCash' ? 'joint' : 'personal'); }} />
                </div>

                <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                  <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>金額類型</span>
                  <SegmentedControl options={[{ label: '固定金額 (訂閱)', value: 'fixed' }, { label: '變動金額 (水電)', value: 'variable' }]} value={billType} onChange={setBillType} />
                </div>

                {billType === 'fixed' && (
                  <div className="inset-group-row">
                    <span className="inset-group-label">每期金額</span>
                    <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                      <input type="text" inputMode="numeric" className="inset-group-input" placeholder="$0" value={billAmount} onChange={e => setBillAmount(formatInputMoney(e.target.value))} />
                    </span>
                  </div>
                )}

                <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                  <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>繳費週期</span>
                  <SegmentedControl options={[{ label: '每月', value: 1 }, { label: '每兩月', value: 2 }, { label: '每年', value: 12 }]} value={billCycle} onChange={setBillCycle} />
                </div>

                <div className="inset-group-row">
                  <span className="inset-group-label">下次預計扣款日</span>
                  <span className="inset-group-value">
                    <input type="date" style={{ background: 'none', border: 'none', color: '#fff', textAlign: 'right', outline: 'none', fontFamily: 'var(--font-family)' }} value={billNextDate} onChange={e => setBillNextDate(e.target.value)} />
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="glass-btn" style={{ flex: 1 }} onClick={() => { setShowAddBill(false); setEditingBillId(null); setBillName(''); setBillAmount(''); }}>取消</button>
                <button className="glass-btn glass-btn-cta" style={{ flex: 1 }} onClick={handleSaveNewBill}>儲存設定</button>
              </div>
            </div>
          )}

          <h3 style={{ color: 'var(--text-primary)', marginBottom: '15px', fontWeight: '800', letterSpacing: '-0.02em' }}>📋 帳單排程清單</h3>
          {safeBills.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '24px', fontSize: '0.9rem' }}>尚未建立定期帳單提醒。</div>
          ) : (
            safeBills.sort((a, b) => new Date(a.nextDate) - new Date(b.nextDate)).map(bill => {
              const isNearDue = isApproaching(bill.nextDate);
              return (
                <div key={bill.id} className="glass-card card-animate" style={{ marginBottom: '14px', borderLeft: isNearDue ? '4px solid var(--accent-orange)' : '4px solid var(--accent-green)', position: 'relative', animation: isNearDue ? 'pulseOrange 3s infinite' : 'none' }}>
                  <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '8px' }}>
                    <button onClick={() => handleEditBill(bill)} style={{ background: 'transparent', border: 'none', color: 'var(--accent-blue)', cursor: 'pointer', fontSize: '0.9rem' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                    </button>
                    <button onClick={() => handleDeleteBill(bill.id)} style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '0.9rem' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', paddingRight: '50px' }}>
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '1rem', color: '#ffffff' }}>{bill.name}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        {bill.payer === 'jointCash' ? '共同帳戶扣款' : (bill.payer === 'userA' ? '大狗狗付款' : '阿陞付款')} | {bill.cycle === 1 ? '每月' : bill.cycle === 2 ? '每兩月' : '每年'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: '700', color: isNearDue ? 'var(--accent-orange)' : 'var(--accent-green)' }}>{bill.type === 'fixed' ? formatMoney(bill.amount) : '金額變動'}</div>
                    </div>
                  </div>
                  <div style={{ background: isNearDue ? 'rgba(255,149,0,0.06)' : 'rgba(120,120,128,0.04)', padding: '10px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: isNearDue ? 'var(--accent-orange)' : 'var(--text-tertiary)', fontWeight: '600' }}>下次扣款日</div>
                      <div style={{ fontWeight: '600', color: isNearDue ? 'var(--accent-orange)' : '#ffffff', fontSize: '0.86rem' }}>{bill.nextDate} {isNearDue && '⚠️ 即將到期'}</div>
                    </div>
                    <button className={isNearDue ? 'glass-btn glass-btn-cta' : 'glass-btn'} style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: '600' }} onClick={() => handlePayBill(bill)}>
                      一鍵認列
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 🔌 外部資料載具/CSV導入展示 (Task 2) */}
      {activeTab !== 'bills' && (
        <div className="inset-group-card" style={{ marginTop: '24px' }}>
          <div className="inset-group-row">
            <span className="inset-group-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              電子載具 / 外部資料導入接軌
            </span>
            <span className="inset-group-value">
              <button 
                onClick={() => onImportRawData("TEST_RAW_CSV_CARRIER_FLOW", "carrier")}
                className="card-sheet-btn-text"
                style={{ fontSize: '0.8rem', fontWeight: '700' }}
              >
                模擬導入
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpenseEntry;