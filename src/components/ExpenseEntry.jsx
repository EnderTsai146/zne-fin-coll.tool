// src/components/ExpenseEntry.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import SegmentedControl from './SegmentedControl';

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

const ExpenseEntry = ({
  assets,
  setAssets,
  onAddExpense,
  onAddJointExpense,
  onTransaction,
  currentUser,
  customAlert,
  customConfirm,
  getBudgetProgressText
}) => {
  const accounts = assets.accounts || [];
  const loggedInUserName = currentUser || "系統";
  const userKey = loggedInUserName.includes('大狗狗') ? 'userA' : 'userB';
  const partnerKey = userKey === 'userA' ? 'userB' : 'userA';

  const defaultExpenseAccount = accounts.find(a => a.owner === userKey && a.isDefaultExpense) || accounts.find(a => a.owner === 'joint' && a.isDefaultExpense) || accounts[0];
  const defaultIncomeAccount = accounts.find(a => a.owner === userKey && a.isDefaultIncome) || accounts.find(a => a.owner === 'joint' && a.isDefaultIncome) || accounts[0];

  const expenseCategories = assets?.config?.categories || ["餐費", "購物", "娛樂", "其他"];
  const incomeCategories = ["薪資", "獎金", "投資", "其他"];

  const categoryOptions = expenseCategories.map(cat => ({ label: cat, value: cat }));

  const [entryMode, setEntryMode] = useState('expense'); // 'expense', 'income'
  const [activeTab, setActiveTab] = useState('personal'); // 'personal', 'joint', 'bills'

  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);

  // ==========================================
  // 1. Personal Expense States
  // ==========================================
  const [persCat, setPersCat] = useState(expenseCategories[0] || '餐費');
  const [persAmount, setPersAmount] = useState('');
  const [persNote, setPersNote] = useState('');
  const [persAccountId, setPersAccountId] = useState('');
  const [persCart, setPersCart] = useState([]);

  const lastUserKeyRef = useRef(userKey);

  // Auto pre-select default account for personal expense prioritising own account
  useEffect(() => {
    const isUserChanged = lastUserKeyRef.current !== userKey;
    lastUserKeyRef.current = userKey;

    const myDefault = accounts.find(a => a.owner === userKey && a.isDefaultExpense) || 
                      accounts.find(a => a.owner === 'joint' && a.isDefaultExpense) || 
                      accounts.find(a => a.owner === userKey) || 
                      accounts.find(a => a.owner === 'joint') || 
                      accounts[0];
    if (myDefault && (!persAccountId || isUserChanged)) {
      setPersAccountId(myDefault.id);
    }
  }, [accounts, userKey, persAccountId]);

  // ==========================================
  // 2. Joint Expense States
  // ==========================================
  const [jointCat, setJointCat] = useState(expenseCategories[0] || '餐費');
  const [jointAmount, setJointAmount] = useState('');
  const [jointNote, setJointNote] = useState('');
  const [jointAccountId, setJointAccountId] = useState('');
  const [jointCart, setJointCart] = useState([]);

  // Pre-select default joint account (prefer joint cash/bank account)
  useEffect(() => {
    const defaultJoint = accounts.find(a => a.owner === 'joint' && a.isDefaultExpense) || accounts.find(a => a.owner === 'joint') || accounts[0];
    if (defaultJoint && !jointAccountId) {
      setJointAccountId(defaultJoint.id);
    }
  }, [accounts]);

  // ==========================================
  // 3. Income States
  // ==========================================
  const [incCat, setIncCat] = useState(incomeCategories[0]);
  const [incAmount, setIncAmount] = useState('');
  const [incNote, setIncNote] = useState('');
  const [incAccountId, setIncAccountId] = useState('');
  const [incomeCart, setIncomeCart] = useState([]);

  const lastUserKeyIncRef = useRef(userKey);

  // Auto pre-select default account for income
  useEffect(() => {
    const isUserChanged = lastUserKeyIncRef.current !== userKey;
    lastUserKeyIncRef.current = userKey;

    const defaultInc = accounts.find(a => a.owner === userKey && a.isDefaultIncome) || 
                       accounts.find(a => a.owner === 'joint' && a.isDefaultIncome) || 
                       accounts.find(a => a.owner === userKey) || 
                       accounts.find(a => a.owner === 'joint') || 
                       accounts[0];
    if (defaultInc && (!incAccountId || isUserChanged)) {
      setIncAccountId(defaultInc.id);
    }
  }, [accounts, userKey, incAccountId]);

  // ==========================================
  // 4. Bills States & Handlers
  // ==========================================
  const [showBillPayModal, setShowBillPayModal] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);
  const [billPayAccountId, setBillPayAccountId] = useState('');

  const [showEditBillModal, setShowEditBillModal] = useState(false);
  const [editingBill, setEditingBill] = useState(null);
  const [billNote, setBillNote] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [billNextDate, setBillNextDate] = useState('');
  const [billCategory, setBillCategory] = useState('固定支出');

  const handleOpenAddBill = () => {
    setEditingBill(null);
    setBillNote('');
    setBillAmount('');
    setBillNextDate(new Date().toISOString().split('T')[0]);
    setBillCategory('固定支出');
    setShowEditBillModal(true);
  };

  const handleOpenEditBill = (b) => {
    setEditingBill(b);
    setBillNote(b.note || b.category || b.name || '');
    setBillAmount(b.amount ? formatInputMoney(b.amount) : '');
    setBillNextDate(b.nextDate || new Date().toISOString().split('T')[0]);
    setBillCategory(b.category || '固定支出');
    setShowEditBillModal(true);
  };

  const handleSaveBill = async () => {
    if (!billNote.trim()) {
      await customAlert("請輸入帳單名稱！");
      return;
    }
    const amt = parseMoney(billAmount);
    const dateDay = billNextDate ? new Date(billNextDate).getDate() : 1;
    const nextDateVal = billNextDate || new Date().toISOString().split('T')[0];

    let updatedBills = [];
    if (editingBill) {
      updatedBills = safeBills.map(b => {
        if (b.id === editingBill.id) {
          return {
            ...b,
            note: billNote.trim(),
            name: billNote.trim(),
            amount: amt,
            nextDate: nextDateVal,
            date: dateDay,
            category: billCategory || '固定支出'
          };
        }
        return b;
      });
    } else {
      const newBill = {
        id: `bill_${Date.now()}`,
        note: billNote.trim(),
        name: billNote.trim(),
        amount: amt,
        nextDate: nextDateVal,
        date: dateDay,
        category: billCategory || '固定支出'
      };
      updatedBills = [...safeBills, newBill];
    }

    const finalAssets = { ...assets, bills: updatedBills };
    setAssets(finalAssets);
    onTransaction(finalAssets, []);
    setShowEditBillModal(false);
    setShowBillPayModal(false);
    setEditingBill(null);
    await customAlert(editingBill ? "✅ 帳單修改成功！" : "✅ 新增常態帳單成功！");
  };

  const handleDeleteBill = async (billToDelete) => {
    if (!billToDelete) return;
    if (!await customConfirm(`⚠️ 確定要刪除常態帳單【${billToDelete.note || billToDelete.category || billToDelete.name}】嗎？`)) return;
    const updatedBills = safeBills.filter(b => b.id !== billToDelete.id);
    const finalAssets = { ...assets, bills: updatedBills };
    setAssets(finalAssets);
    onTransaction(finalAssets, []);
    setShowBillPayModal(false);
    setShowEditBillModal(false);
    setSelectedBill(null);
    await customAlert("✅ 帳單已成功刪除！");
  };

  const lastUserKeyBillRef = useRef(userKey);

  // Pre-select default bill payment account
  useEffect(() => {
    const isUserChanged = lastUserKeyBillRef.current !== userKey;
    lastUserKeyBillRef.current = userKey;

    const defaultBillPay = accounts.find(a => a.owner === userKey && a.isDefaultExpense) || 
                           accounts.find(a => a.owner === 'joint' && a.isDefaultExpense) || 
                           accounts.find(a => a.owner === 'joint') || 
                           accounts[0];
    if (defaultBillPay && (!billPayAccountId || isUserChanged)) {
      setBillPayAccountId(defaultBillPay.id);
    }
  }, [accounts, userKey, billPayAccountId]);

  // Helper check for bills approaching
  const isApproaching = (dueDateStr) => {
    const today = new Date();
    const due = new Date(dueDateStr);
    const diff = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    return diff >= 0 && diff <= 3;
  };

  // Sorting helper for account lists
  const sortAccountsForUser = (accList, activeUserKey) => {
    return [...accList].sort((a, b) => {
      // 1. User's own first, then joint, then partner
      const getOwnerWeight = (owner) => {
        if (owner === activeUserKey) return 0;
        if (owner === 'joint') return 1;
        return 2;
      };
      const ownerA = getOwnerWeight(a.owner);
      const ownerB = getOwnerWeight(b.owner);
      if (ownerA !== ownerB) return ownerA - ownerB;
      
      // 2. Default preset first (check either expense or income defaults)
      const defA = (a.isDefaultExpense || a.isDefaultIncome) ? 0 : 1;
      const defB = (b.isDefaultExpense || b.isDefaultIncome) ? 0 : 1;
      if (defA !== defB) return defA - defB;
      
      // 3. Type weight
      const getTypeWeight = (type) => {
        if (type === 'bank') return 0;
        if (type === 'cash') return 1;
        if (type === 'virtual') return 2;
        return 3; // credit
      };
      const typeA = getTypeWeight(a.type);
      const typeB = getTypeWeight(b.type);
      if (typeA !== typeB) return typeA - typeB;
      
      return a.nickname.localeCompare(b.nickname);
    });
  };

  const [accountModalConfig, setAccountModalConfig] = useState(null);

  // Custom visual grid account picker (Grouped by Owner & 4 Account Types)
  const renderAccountSelector = (selectedValue, onChange, filterFn = () => true, defaultAccField = 'isDefaultExpense') => {
    const list = accounts.filter(filterFn);
    if (list.length === 0) {
      return <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', padding: '6px' }}>無相符帳戶</div>;
    }
    
    const sorted = sortAccountsForUser(list, userKey);
    const ownAndJoint = sorted.filter(a => a.owner === userKey || a.owner === 'joint');
    const partnerAccs = sorted.filter(a => a.owner === partnerKey);

    const selectedAcc = accounts.find(a => a.id === selectedValue);
    const isSelectedPartner = selectedAcc && selectedAcc.owner === partnerKey;
    const activeList = isSelectedPartner ? [...ownAndJoint, selectedAcc] : ownAndJoint;

    const owners = [
      { key: userKey, title: userKey === 'userA' ? '🐕 我的個人帳戶 (大狗狗)' : '🐶 我的個人帳戶 (阿陞)', accentColor: '#0a84ff' },
      { key: 'joint', title: '🏫 共同公費帳戶', accentColor: '#30d158' },
    ];

    if (isSelectedPartner) {
      owners.push({
        key: partnerKey,
        title: partnerKey === 'userA' ? '🐕 伴侶帳戶 (大狗狗)' : '🐶 伴侶帳戶 (阿陞)',
        accentColor: 'rgba(255,255,255,0.4)'
      });
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '6px' }}>
        {owners.map(owner => {
          const ownerAccs = activeList.filter(a => a.owner === owner.key);
          if (ownerAccs.length === 0) return null;

          const categories = [
            { key: 'bank', name: '🏦 銀行活儲', list: ownerAccs.filter(a => a.type === 'bank' || a.type === 'virtual') },
            { key: 'cash', name: '💵 現金帳戶', list: ownerAccs.filter(a => a.type === 'cash') },
            { key: 'credit', name: '💳 信用卡', list: ownerAccs.filter(a => a.type === 'credit') },
            { key: 'investment', name: '📈 投資/交割戶', list: ownerAccs.filter(a => a.type === 'investment') },
          ].filter(c => c.list.length > 0);

          return (
            <div key={owner.key} style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: `1px solid ${owner.accentColor}33`,
              borderRadius: '12px',
              padding: '8px 10px'
            }}>
              <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#fff', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '3px', height: '10px', background: owner.accentColor, borderRadius: '2px' }} />
                {owner.title}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {categories.map(cat => (
                  <div key={cat.key}>
                    <div style={{ fontSize: '0.64rem', fontWeight: '700', color: 'rgba(255,255,255,0.45)', marginBottom: '3px', paddingLeft: '2px' }}>
                      {cat.name}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                      {cat.list.map(acc => {
                        const isSelected = selectedValue === acc.id;
                        const isCredit = acc.type === 'credit';
                        const balanceColor = isCredit ? '#ff9500' : '#8effa2';
                        const defaultIcon = acc.type === 'cash' ? '💵' : (acc.type === 'credit' ? '💳' : (acc.type === 'investment' ? '📈' : '🏦'));
                        const iconToRender = acc.icon || defaultIcon;

                        return (
                          <button
                            key={acc.id}
                            type="button"
                            onClick={() => onChange(acc.id)}
                            style={{
                              padding: '8px 10px',
                              borderRadius: '10px',
                              border: isSelected ? '1.5px solid var(--accent-blue)' : '1px solid rgba(255,255,255,0.08)',
                              background: isSelected ? 'rgba(0,122,255,0.18)' : 'rgba(255,255,255,0.02)',
                              color: isSelected ? '#fff' : 'var(--text-secondary)',
                              fontSize: '0.78rem',
                              fontWeight: '600',
                              cursor: 'pointer',
                              textAlign: 'left',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '2px',
                              transition: 'all 0.2s ease',
                              boxShadow: isSelected ? '0 0 10px rgba(0,122,255,0.25)' : 'none',
                              minHeight: '48px'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.76rem', color: isSelected ? '#fff' : 'var(--text-primary)', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {iconToRender} {acc.nickname}
                              </span>
                            </div>
                            <span style={{ fontSize: '0.66rem', color: isSelected ? '#fff' : balanceColor, fontWeight: '700' }}>
                              ${(acc.balance || 0).toLocaleString()} {acc.currency || 'TWD'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {partnerAccs.length > 0 && !isSelectedPartner && (
          <button
            type="button"
            onClick={() => setAccountModalConfig({
              title: `選擇伴侶的帳戶 (${partnerKey === 'userA' ? '大狗狗' : '阿陞'})`,
              list: partnerAccs,
              selectedValue,
              onChange: (val) => {
                onChange(val);
                setAccountModalConfig(null);
              }
            })}
            style={{
              padding: '8px 10px',
              borderRadius: '10px',
              border: '1px dashed rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.02)',
              color: 'var(--text-tertiary)',
              fontSize: '0.74rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px'
            }}
          >
            👥 選擇伴侶的帳戶 (更多)
          </button>
        )}
      </div>
    );
  };

  // ==========================================
  // Personal Expense Submission
  // ==========================================
  const handleAddPersCart = async () => {
    const parsedAmount = parseMoney(persAmount);
    if (!parsedAmount) {
      await customAlert("請輸入金額！");
      return;
    }
    if (!persAccountId) {
      await customAlert("請選擇扣款帳戶！");
      return;
    }
    const acc = accounts.find(a => a.id === persAccountId);
    
    if (acc.type !== 'credit' && acc.balance < parsedAmount) {
      await customAlert(`⚠️ 帳戶【${acc.nickname}】餘額不足！ (餘額: $${acc.balance.toLocaleString()})`);
      return;
    }

    const payload = {
      id: Date.now().toString(),
      cat: persCat,
      amount: parsedAmount,
      note: persNote.trim(),
      accountId: persAccountId,
      accountNickname: acc.nickname
    };

    setPersCart([...persCart, payload]);
    setPersAmount('');
    setPersNote('');
  };

  const handlePersSubmit = async () => {
    let finalItems = [...persCart];
    const parsedAmount = parseMoney(persAmount);

    if (parsedAmount > 0) {
      if (!persAccountId) {
        await customAlert("請選擇扣款帳戶！");
        return;
      }
      const acc = accounts.find(a => a.id === persAccountId);
      if (acc.type !== 'credit' && acc.balance < parsedAmount) {
        await customAlert(`⚠️ 帳戶【${acc.nickname}】餘額不足！ (餘額: $${acc.balance.toLocaleString()})`);
        return;
      }
      finalItems.push({
        id: Date.now().toString(),
        cat: persCat,
        amount: parsedAmount,
        note: persNote.trim(),
        accountId: persAccountId,
        accountNickname: acc.nickname
      });
    }

    if (finalItems.length === 0) {
      await customAlert("請輸入金額或暫存交易！");
      return;
    }

    let updatedAccounts = [...accounts];

    // Deduct from account balances
    for (const item of finalItems) {
      updatedAccounts = updatedAccounts.map(a => {
        if (a.id === item.accountId) return { ...a, balance: a.balance - item.amount };
        return a;
      });
    }

    const payerName = userKey === 'userA' ? '大狗狗🐕' : '阿陞🐶';

    // Generate separate history records
    const historyRecords = finalItems.map((item, idx) => {
      const details = { food: 0, shopping: 0, entertainment: 0, other: 0 };
      if (item.cat === '餐費') details.food = item.amount;
      else if (item.cat === '購物') details.shopping = item.amount;
      else if (item.cat === '娛樂') details.entertainment = item.amount;
      else details.other = item.amount;

      return {
        id: `exp_${Date.now()}_${idx}`,
        date: txDate,
        month: txDate.slice(0, 7),
        type: 'expense',
        category: '個人支出',
        details,
        total: item.amount,
        payer: payerName,
        accountId: item.accountId,
        note: item.note || item.cat,
        necessity: 'need'
      };
    });

    const finalAssets = { ...assets, accounts: updatedAccounts };
    onTransaction(finalAssets, historyRecords);

    setPersCart([]);
    setPersAmount('');
    setPersNote('');
  };

  // ==========================================
  // Joint Expense Submission
  // ==========================================
  const handleAddJointCart = async () => {
    const parsedAmount = parseMoney(jointAmount);
    if (!parsedAmount) {
      await customAlert("請輸入金額！");
      return;
    }
    if (!jointAccountId) {
      await customAlert("請選擇支付帳戶！");
      return;
    }
    const acc = accounts.find(a => a.id === jointAccountId);
    
    if (acc.type !== 'credit' && acc.balance < parsedAmount) {
      await customAlert(`⚠️ 帳戶【${acc.nickname}】餘額不足！ (餘額: $${acc.balance.toLocaleString()})`);
      return;
    }

    const payload = {
      id: Date.now().toString(),
      cat: jointCat,
      amount: parsedAmount,
      note: jointNote.trim(),
      accountId: jointAccountId,
      accountNickname: acc.nickname
    };

    setJointCart([...jointCart, payload]);
    setJointAmount('');
    setJointNote('');
  };

  const handleJointSubmit = async () => {
    let finalItems = [...jointCart];
    const parsedAmount = parseMoney(jointAmount);

    if (parsedAmount > 0) {
      if (!jointAccountId) {
        await customAlert("請選擇支付帳戶！");
        return;
      }
      const acc = accounts.find(a => a.id === jointAccountId);
      if (acc.type !== 'credit' && acc.balance < parsedAmount) {
        await customAlert(`⚠️ 帳戶【${acc.nickname}】餘額不足！ (餘額: $${acc.balance.toLocaleString()})`);
        return;
      }
      finalItems.push({
        id: Date.now().toString(),
        cat: jointCat,
        amount: parsedAmount,
        note: jointNote.trim(),
        accountId: jointAccountId,
        accountNickname: acc.nickname
      });
    }

    if (finalItems.length === 0) {
      await customAlert("請輸入金額或暫存交易！");
      return;
    }

    let updatedAccounts = [...accounts];

    // Deduct from account balances
    for (const item of finalItems) {
      updatedAccounts = updatedAccounts.map(a => {
        if (a.id === item.accountId) return { ...a, balance: a.balance - item.amount };
        return a;
      });
    }

    const historyRecords = finalItems.map((item, idx) => {
      const sampleAcc = accounts.find(a => a.id === item.accountId);
      const advancedBy = sampleAcc.owner === 'joint' ? null : sampleAcc.owner;

      return {
        id: `spend_${Date.now()}_${idx}`,
        date: txDate,
        month: txDate.slice(0, 7),
        type: 'spend',
        category: '共同支出',
        total: item.amount,
        payer: '共同帳戶',
        accountId: item.accountId,
        note: item.note ? `${item.cat} - ${item.note}` : item.cat,
        advancedBy: advancedBy === 'jointCash' ? null : advancedBy,
        isSettled: false,
        necessity: 'need',
        subCategory: item.cat
      };
    });

    const finalAssets = { ...assets, accounts: updatedAccounts };
    onTransaction(finalAssets, historyRecords);
    
    setJointCart([]);
    setJointAmount('');
    setJointNote('');
  };

  // ==========================================
  // Income Submission
  // ==========================================
  const handleAddIncomeCart = async () => {
    const parsedAmount = parseMoney(incAmount);
    if (!parsedAmount) {
      await customAlert("請輸入金額！");
      return;
    }
    if (!incAccountId) {
      await customAlert("請選擇存入帳戶！");
      return;
    }
    const acc = accounts.find(a => a.id === incAccountId);

    const payload = {
      id: Date.now().toString(),
      cat: incCat,
      amount: parsedAmount,
      note: incNote.trim(),
      accountId: incAccountId,
      accountNickname: acc.nickname
    };

    setIncomeCart([...incomeCart, payload]);
    setIncAmount('');
    setIncNote('');
  };

  const handleIncomeSubmit = async () => {
    let finalItems = [...incomeCart];
    const parsedAmount = parseMoney(incAmount);

    if (parsedAmount > 0) {
      if (!incAccountId) {
        await customAlert("請選擇存入帳戶！");
        return;
      }
      const acc = accounts.find(a => a.id === incAccountId);
      finalItems.push({
        id: Date.now().toString(),
        cat: incCat,
        amount: parsedAmount,
        note: incNote.trim(),
        accountId: incAccountId,
        accountNickname: acc.nickname
      });
    }

    if (finalItems.length === 0) {
      await customAlert("請輸入金額或暫存交易！");
      return;
    }

    let updatedAccounts = [...accounts];

    for (const item of finalItems) {
      updatedAccounts = updatedAccounts.map(a => {
        if (a.id === item.accountId) return { ...a, balance: a.balance + item.amount };
        return a;
      });
    }

    const totalSum = finalItems.reduce((s, e) => s + e.amount, 0);
    const combinedNotes = finalItems.map(i => i.note || i.cat).join('，');

    // Create income record list
    const newIncomes = finalItems.map(item => ({
      date: txDate,
      month: txDate.slice(0, 7),
      type: 'income',
      category: item.cat,
      total: item.amount,
      payer: loggedInUserName,
      accountId: item.accountId,
      operator: loggedInUserName,
      note: item.note || item.cat,
      timestamp: new Date().toISOString()
    }));

    const finalAssets = {
      ...assets,
      accounts: updatedAccounts
    };

    onTransaction(finalAssets, newIncomes);
    
    setIncomeCart([]);
    setIncAmount('');
    setIncNote('');
  };

  const handleExecuteBillPay = async () => {
    if (!billPayAccountId || !selectedBill) return;
    const acc = accounts.find(a => a.id === billPayAccountId);
    const amount = selectedBill.amount || 0;

    if (acc.type !== 'credit' && acc.balance < amount) {
      await customAlert(`❌ 帳戶【${acc.nickname}】餘額不足以支付此筆帳單！`);
      return;
    }

    if (selectedBill.isCreditCard) {
      const creditAccId = selectedBill.creditCardAccountId;
      const creditAcc = accounts.find(a => a.id === creditAccId);
      if (!creditAcc) return;

      const updatedAccounts = accounts.map(a => {
        if (a.id === billPayAccountId) return { ...a, balance: a.balance - amount };
        if (a.id === creditAccId) return { ...a, balance: a.balance + amount };
        return a;
      });

      const targetTimestamp = new Date().toISOString();
      const txRecord = {
        date: txDate,
        month: txDate.slice(0, 7),
        type: 'transfer',
        category: '資產劃撥',
        total: amount,
        sourceAmount: amount,
        targetAmount: amount,
        payer: acc.owner === 'joint' ? '共同帳戶' : (acc.owner === 'userA' ? '大狗狗🐕' : '阿陞🐶'),
        accountId: billPayAccountId,
        targetAccountId: creditAccId,
        note: `💳 信用卡帳單劃撥繳款: ${creditAcc.nickname} (自 ${acc.nickname} 撥款)`,
        timestamp: targetTimestamp
      };

      setShowBillPayModal(false);
      onTransaction({ ...assets, accounts: updatedAccounts }, txRecord);
      await customAlert(`🎉 信用卡【${creditAcc.nickname}】已成功自【${acc.nickname}】劃撥繳納 $${amount.toLocaleString()} ${creditAcc.currency || 'TWD'}！`);
      return;
    }

    const updatedAccounts = accounts.map(a => {
      if (a.id === billPayAccountId) return { ...a, balance: a.balance - amount };
      return a;
    });

    // Increment nextDate by 1 month
    const updatedBills = (assets.bills || []).map(b => {
      if (b.id === selectedBill.id) {
        const oldDate = new Date(b.nextDate);
        oldDate.setMonth(oldDate.getMonth() + 1);
        const yyyy = oldDate.getFullYear();
        const mm = String(oldDate.getMonth() + 1).padStart(2, '0');
        const dd = String(oldDate.getDate()).padStart(2, '0');
        return { ...b, nextDate: `${yyyy}-${mm}-${dd}` };
      }
      return b;
    });

    const targetTimestamp = new Date().toISOString();
    const finalAssets = {
      ...assets,
      accounts: updatedAccounts,
      bills: updatedBills,
      monthlyExpenses: [
        ...(assets.monthlyExpenses || []),
        {
          date: txDate,
          month: txDate.slice(0, 7),
          type: 'spend',
          category: '共同支出',
          total: amount,
          note: `[帳單繳款] ${selectedBill.note || selectedBill.category || selectedBill.name}`,
          operator: loggedInUserName,
          payer: '共同帳戶',
          accountId: billPayAccountId,
          advancedBy: acc.owner === 'joint' ? null : acc.owner,
          isSettled: false,
          timestamp: targetTimestamp,
          necessity: 'need',
          subCategory: selectedBill.category || selectedBill.name || '常態帳單'
        }
      ]
    };

    setAssets(finalAssets);
    onTransaction(finalAssets, []); // Trigger cloud save
    setShowBillPayModal(false);
    await customAlert(`✅ 帳單【${selectedBill.note || selectedBill.category || selectedBill.name}】繳費成功！\n由帳戶【${acc.nickname}】支付 $${amount.toLocaleString()}`);
  };

  const creditCardBills = useMemo(() => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const currentDay = today.getDate();

    return (assets?.accounts || [])
      .filter(a => a && a.type === 'credit')
      .map(card => {
        const bDay = card.billingDay ? Number(card.billingDay) : 10;
        let dueYear = currentYear;
        let dueMonth = currentMonth;
        if (currentDay > bDay) {
          dueMonth += 1;
        }
        const dueDateObj = new Date(dueYear, dueMonth, bDay);
        const yyyy = dueDateObj.getFullYear();
        const mm = String(dueDateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dueDateObj.getDate()).padStart(2, '0');
        const nextDateStr = `${yyyy}-${mm}-${dd}`;

        const diffDays = Math.ceil((dueDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const unpaidAmount = Math.abs(card.balance || 0);

        const linkedBank = card.linkedBankAccountId 
          ? (assets?.accounts || []).find(a => a && a.id === card.linkedBankAccountId)
          : null;
        
        let linkedBankName = linkedBank 
          ? `${linkedBank.owner === 'joint' ? '共同' : (linkedBank.owner === 'userA' ? '大狗狗' : '阿陞')}${linkedBank.nickname}`
          : '未綁定活儲';

        return {
          id: `cc_bill_${card.id}`,
          isCreditCard: true,
          creditCardAccountId: card.id,
          name: `${card.nickname} (信用卡帳單)`,
          note: `${card.nickname} 信用卡`,
          amount: unpaidAmount,
          category: '信用卡帳單',
          nextDate: nextDateStr,
          diffDays,
          autoPay: !!card.autoPay,
          linkedBankAccountId: card.linkedBankAccountId,
          linkedBankName,
          owner: card.owner,
          currency: card.currency || 'TWD',
          icon: card.icon || '💳',
          rawAccount: card
        };
      });
  }, [assets?.accounts]);

  const combinedBills = useMemo(() => {
    const regularBills = (assets?.bills || []).map(b => ({ ...b, isCreditCard: false }));
    return [...regularBills, ...creditCardBills].sort((a, b) => new Date(a.nextDate) - new Date(b.nextDate));
  }, [assets?.bills, creditCardBills]);

  const handleCardClick = async (bill) => {
    if (bill.isCreditCard) {
      if (bill.amount === 0) {
        await customAlert(`🎉 信用卡【${bill.rawAccount.nickname}】本期帳單已完全結清 (未繳金額 $0)，無須手動扣繳。`, "帳單已結清");
        return;
      }

      if (bill.autoPay) {
        const confirmManual = await customConfirm(
          `🤖 提醒：信用卡【${bill.rawAccount.nickname}】已設定於每月 ${bill.rawAccount.billingDay || 10} 日由【${bill.linkedBankName}】自動扣繳。\n\n確定要提前手動劃撥結清嗎？`,
          "自動扣繳提示"
        );
        if (!confirmManual) return;
      }
    }

    setSelectedBill(bill);
    if (!billPayAccountId && accounts.length > 0) {
      const linkedAcc = bill.linkedBankAccountId ? accounts.find(a => a.id === bill.linkedBankAccountId) : null;
      const defaultAcc = linkedAcc || accounts.find(a => a.owner === userKey && a.isDefaultExpense) || accounts[0];
      if (defaultAcc) setBillPayAccountId(defaultAcc.id);
    }
    setShowBillPayModal(true);
  };

  const safeBills = assets.bills || [];

  return (
    <div className="overview-container" style={{ paddingBottom: '90px' }}>
      
      {/* Aurora Header Banner */}
      <div className="header-glass-banner" style={{ marginBottom: '20px' }}>
        <div className="banner-glow-spot" />
        <h2 style={{ fontSize: '1.4rem', fontWeight: '850', color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          ✍️ 記帳登錄中心
        </h2>
        <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)', margin: '4px 0 0 0' }}>
          {entryMode === 'expense' ? '快速記錄個人與共同支出明細' : '快速登記薪資、獎金與投資收入'}
        </p>

        {/* Dynamic Budget Text Progress */}
        {entryMode === 'expense' && (
          <div style={{ marginTop: '14px', fontSize: '0.78rem', background: 'rgba(255,255,255,0.06)', padding: '8px 12px', borderRadius: '8px', border: '0.5px solid rgba(255,255,255,0.1)', color: '#fff' }}>
            📊 {getBudgetProgressText()?.text || ""}
          </div>
        )}
      </div>

      {/* Main Tab Controls: Expense vs Income */}
      <div style={{ padding: '0 4px', marginBottom: '16px' }}>
        <SegmentedControl
          options={[
            { label: '💸 支出記帳', value: 'expense' },
            { label: '💰 收入入帳', value: 'income' }
          ]}
          value={entryMode}
          onChange={(val) => {
            setEntryMode(val);
          }}
        />
      </div>

      {/* ========================================== */}
      {/* MODE 1: EXPENSE SYSTEM */}
      {/* ========================================== */}
      {entryMode === 'expense' && (
        <div className="slide-in">
          {/* Sub Navigation */}
          <div style={{ display: 'flex', gap: '8px', padding: '0 4px', marginBottom: '16px' }}>
            <button className={`glass-btn ${activeTab === 'personal' ? 'active' : ''}`} onClick={() => setActiveTab('personal')} style={{ flex: 1, fontSize: '0.82rem', fontWeight: '600' }}>
              👤 個人記帳
            </button>
            <button className={`glass-btn ${activeTab === 'joint' ? 'active' : ''}`} onClick={() => setActiveTab('joint')} style={{ flex: 1, fontSize: '0.82rem', fontWeight: '600' }}>
              🏫 共同記帳
            </button>
            <button className={`glass-btn ${activeTab === 'bills' ? 'active' : ''}`} onClick={() => setActiveTab('bills')} style={{ flex: 1, fontSize: '0.82rem', fontWeight: '600', position: 'relative' }}>
              📅 帳單 {safeBills.some(b => isApproaching(b.nextDate)) && '⚠️'}
            </button>
          </div>

          {/* Sub Tab: Personal Expense */}
          {activeTab === 'personal' && (
            <div className="glass-card" style={{ padding: '20px 18px' }}>
              <h3 style={{ margin: '0 0 16px 0', fontWeight: '800' }}>👤 個人支出登錄</h3>

              <div className="inset-group-card">
                {/* Date */}
                <div className="inset-group-row">
                  <span className="inset-group-label">📅 消費日期</span>
                  <span className="inset-group-value">
                    <input type="date" style={{ background: 'none', border: 'none', color: '#fff', textAlign: 'right', outline: 'none' }} value={txDate} onChange={(e) => setTxDate(e.target.value)} />
                  </span>
                </div>

                {/* Category */}
                <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                  <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>🏷️ 分類</span>
                  <SegmentedControl options={categoryOptions} value={persCat} onChange={setPersCat} />
                </div>

                {/* Account (Visual Grid Picker with default double size and Hide-Partner filter) */}
                <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                  <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>💳 支付帳戶</span>
                  {renderAccountSelector(persAccountId, setPersAccountId, () => true, 'isDefaultExpense')}
                </div>

                {/* Amount */}
                <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="inset-group-label">💵 金額</span>
                    <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                      <input type="text" inputMode="numeric" className="inset-group-input tabular-nums" value={persAmount} onChange={(e) => setPersAmount(formatInputMoney(e.target.value))} placeholder="$0" style={{ fontSize: '1.2rem', fontWeight: '800' }} />
                    </span>
                  </div>

                  {/* Quick Increment Buttons */}
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '2px' }}>
                    {[100, 500, 1000].map(amt => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => {
                          const current = parseMoney(persAmount);
                          setPersAmount(formatInputMoney(current + amt));
                        }}
                        style={{
                          padding: '3px 8px',
                          borderRadius: '8px',
                          border: '1px solid rgba(255,255,255,0.1)',
                          background: 'rgba(255,255,255,0.05)',
                          color: 'var(--text-secondary)',
                          fontSize: '0.72rem',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        +{amt}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setPersAmount('')}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255,69,58,0.2)',
                        background: 'rgba(255,69,58,0.08)',
                        color: 'var(--accent-red)',
                        fontSize: '0.72rem',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      清空
                    </button>
                  </div>
                </div>

                {/* Note */}
                <div className="inset-group-row">
                  <span className="inset-group-label">📝 備註 (選填)</span>
                  <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                    <input type="text" className="inset-group-input" value={persNote} onChange={(e) => setPersNote(e.target.value)} placeholder="例如：買咖啡" />
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                <button onClick={handleAddPersCart} className="glass-btn" style={{ flex: 1, fontWeight: '700' }}>
                  ➕ 暫存此筆
                </button>
                {persCart.length > 0 && (
                  <button onClick={() => setPersCart([])} className="glass-btn glass-btn-danger" style={{ padding: '0 12px' }}>清空</button>
                )}
              </div>

              {/* Cart List */}
              {persCart.length > 0 && (
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '14px', borderRadius: '12px', marginTop: '16px', border: '0.5px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', marginBottom: '8px', fontWeight: '800' }}>🛒 暫存個人支出明細：</div>
                  {persCart.map(item => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '6px 0', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                      <span>[{item.cat}] {item.note || '無備註'} ({item.accountNickname})</span>
                      <strong style={{ color: '#fff' }}>${item.amount.toLocaleString()}</strong>
                    </div>
                  ))}
                </div>
              )}

              <button onClick={handlePersSubmit} className="glass-btn primary-gradient-btn" style={{ width: '100%', height: '44px', borderRadius: '12px', marginTop: '16px', fontWeight: '800' }}>
                🚀 確定送出記帳
              </button>
            </div>
          )}

          {/* Sub Tab: Joint Expense */}
          {activeTab === 'joint' && (
            <div className="glass-card" style={{ padding: '20px 18px' }}>
              <h3 style={{ margin: '0 0 16px 0', fontWeight: '800' }}>🏫 共同支出登錄</h3>

              <div className="inset-group-card">
                {/* Date */}
                <div className="inset-group-row">
                  <span className="inset-group-label">📅 消費日期</span>
                  <span className="inset-group-value">
                    <input type="date" style={{ background: 'none', border: 'none', color: '#fff', textAlign: 'right', outline: 'none' }} value={txDate} onChange={(e) => setTxDate(e.target.value)} />
                  </span>
                </div>

                {/* Category */}
                <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                  <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>🏷️ 分類</span>
                  <SegmentedControl options={categoryOptions} value={jointCat} onChange={setJointCat} />
                </div>

                {/* Account Selector */}
                 <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                  <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>💳 支付帳戶</span>
                  {renderAccountSelector(jointAccountId, setJointAccountId, () => true, 'isDefaultExpense')}
                </div>

                {/* Amount */}
                <div className="inset-group-row">
                  <span className="inset-group-label">💵 金額</span>
                  <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                    <input type="text" inputMode="numeric" className="inset-group-input" value={jointAmount} onChange={(e) => setJointAmount(formatInputMoney(e.target.value))} placeholder="$0" />
                  </span>
                </div>

                {/* Note */}
                <div className="inset-group-row">
                  <span className="inset-group-label">📝 備註 (選填)</span>
                  <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                    <input type="text" className="inset-group-input" value={jointNote} onChange={(e) => setJointNote(e.target.value)} placeholder="例如：好市多買菜" />
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                <button onClick={handleAddJointCart} className="glass-btn" style={{ flex: 1, fontWeight: '700' }}>
                  ➕ 暫存此筆
                </button>
                {jointCart.length > 0 && (
                  <button onClick={() => setJointCart([])} className="glass-btn glass-btn-danger" style={{ padding: '0 12px' }}>清空</button>
                )}
              </div>

              {/* Cart List */}
              {jointCart.length > 0 && (
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '14px', borderRadius: '12px', marginTop: '16px', border: '0.5px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', marginBottom: '8px', fontWeight: '800' }}>🛒 暫存共同支出明細：</div>
                  {jointCart.map(item => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '6px 0', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                      <span>[{item.cat}] {item.note || '無備註'} ({item.accountNickname})</span>
                      <strong style={{ color: '#fff' }}>${item.amount.toLocaleString()}</strong>
                    </div>
                  ))}
                </div>
              )}

              <button onClick={handleJointSubmit} className="glass-btn primary-gradient-btn" style={{ width: '100%', height: '44px', borderRadius: '12px', marginTop: '16px', fontWeight: '800' }}>
                🚀 確定送出記帳
              </button>
            </div>
          )}

          {/* Sub Tab: Bills */}
          {activeTab === 'bills' && (
            <div className="glass-card" style={{ padding: '20px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontWeight: '800' }}>📅 常態帳項與信用卡帳單管理</h3>
                <button
                  type="button"
                  onClick={handleOpenAddBill}
                  className="glass-btn primary-gradient-btn"
                  style={{ padding: '6px 12px', fontSize: '0.78rem', fontWeight: '700', borderRadius: '10px' }}
                >
                  ➕ 新增常態帳單
                </button>
              </div>

              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 16px 0', lineHeight: '1.4' }}>
                統一管理常態訂閱帳單與信用卡待繳帳單。自動扣繳項目時間到達自動劃撥結清；手動帳單可自選活儲劃撥。
              </p>

              <div className="inset-group-card">
                {combinedBills.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>
                    目前尚無任何帳單或信用卡帳單
                    <br />
                    <button
                      type="button"
                      onClick={handleOpenAddBill}
                      className="glass-btn"
                      style={{ marginTop: '12px', padding: '6px 16px', fontSize: '0.8rem' }}
                    >
                      ➕ 立即新增第一筆常態帳單
                    </button>
                  </div>
                ) : (
                  combinedBills.map(bill => {
                    const isNear = isApproaching(bill.nextDate);
                    const isCc = bill.isCreditCard;
                    const diffDays = bill.diffDays !== undefined ? bill.diffDays : 99;

                    let rowBorderLeft = 'none';
                    let rowBg = 'none';

                    if (isCc && !bill.autoPay) {
                      if (diffDays <= 1) {
                        rowBorderLeft = '4px solid #ff453a';
                        rowBg = 'rgba(255,69,58,0.08)';
                      } else if (diffDays <= 3) {
                        rowBorderLeft = '4px solid #ff9500';
                        rowBg = 'rgba(255,149,0,0.06)';
                      } else if (diffDays <= 7) {
                        rowBorderLeft = '3px solid #ffb94f';
                        rowBg = 'rgba(255,185,79,0.04)';
                      }
                    } else if (isNear) {
                      rowBorderLeft = '3px solid #ff9500';
                      rowBg = 'rgba(255,149,0,0.05)';
                    }

                    return (
                      <div
                        key={bill.id}
                        onClick={() => handleCardClick(bill)}
                        className="inset-group-row"
                        style={{
                          padding: '12px 14px',
                          cursor: 'pointer',
                          background: rowBg,
                          borderLeft: rowBorderLeft,
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <span className="inset-group-label" style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span style={{ fontWeight: '750', fontSize: '0.86rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>{bill.icon || (isCc ? '💳' : '📅')}</span>
                            <span>{bill.note || bill.category || bill.name}</span>
                          </span>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>
                            繳費日: 每月 {bill.date || (bill.nextDate ? new Date(bill.nextDate).getDate() : '')} 號 | 下次: {bill.nextDate}
                          </span>
                        </span>

                        <span className="inset-group-value" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                          <strong style={{ color: isCc && bill.amount > 0 ? '#ffb94f' : '#fff', fontSize: '0.9rem' }}>
                            ${(bill.amount || 0).toLocaleString()} {bill.currency || 'TWD'}
                          </strong>

                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            {isCc && (
                              bill.autoPay ? (
                                <span style={{ fontSize: '0.62rem', background: 'rgba(142,255,162,0.15)', color: '#8effa2', border: '0.5px solid rgba(142,255,162,0.3)', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>
                                  🤖 自動扣款 ({bill.linkedBankName})
                                </span>
                              ) : (
                                <span style={{ fontSize: '0.62rem', background: 'rgba(255,185,79,0.15)', color: '#ffb94f', border: '0.5px solid rgba(255,185,79,0.3)', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>
                                  🖐️ 手動繳納
                                </span>
                              )
                            )}

                            {isCc && !bill.autoPay && diffDays <= 1 && (
                              <span style={{ fontSize: '0.62rem', background: '#ff453a', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontWeight: '800' }}>
                                🚨 今日/明日到期
                              </span>
                            )}
                            {isCc && !bill.autoPay && diffDays > 1 && diffDays <= 3 && (
                              <span style={{ fontSize: '0.62rem', background: '#ff9500', color: '#000', padding: '2px 6px', borderRadius: '4px', fontWeight: '800' }}>
                                ⚠️ 3天內到期
                              </span>
                            )}
                            {isCc && !bill.autoPay && diffDays > 3 && diffDays <= 7 && (
                              <span style={{ fontSize: '0.62rem', background: 'rgba(255,149,0,0.25)', color: '#ffb94f', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>
                                📅 7天內到期
                              </span>
                            )}

                            {!isCc && isNear && (
                              <span style={{ fontSize: '0.58rem', background: '#ff9500', color: '#000', padding: '1px 5px', borderRadius: '4px', fontWeight: '800' }}>
                                即將到期
                              </span>
                            )}
                          </div>
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================== */}
      {/* MODE 2: INCOME SYSTEM */}
      {/* ========================================== */}
      {entryMode === 'income' && (
        <div className="slide-in">
          <div className="glass-card" style={{ padding: '20px 18px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontWeight: '800' }}>💰 收入入帳登錄</h3>

            <div className="inset-group-card">
              {/* Date */}
              <div className="inset-group-row">
                <span className="inset-group-label">📅 入帳日期</span>
                <span className="inset-group-value">
                  <input type="date" style={{ background: 'none', border: 'none', color: '#fff', textAlign: 'right', outline: 'none' }} value={txDate} onChange={(e) => setTxDate(e.target.value)} />
                </span>
              </div>

              {/* Category */}
              <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>🏷️ 類別</span>
                <SegmentedControl
                  options={incomeCategories.map(c => ({ label: c, value: c }))}
                  value={incCat}
                  onChange={setIncCat}
                />
              </div>

              {/* Account Selector */}
              <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>💳 存入帳戶</span>
                {renderAccountSelector(incAccountId, setIncAccountId, a => a.type !== 'credit', 'isDefaultIncome')}
              </div>

              {/* Amount */}
              <div className="inset-group-row">
                <span className="inset-group-label">💵 金額</span>
                <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                  <input type="text" inputMode="numeric" className="inset-group-input" value={incAmount} onChange={(e) => setIncAmount(formatInputMoney(e.target.value))} placeholder="$0" />
                </span>
              </div>

              {/* Note */}
              <div className="inset-group-row">
                <span className="inset-group-label">📝 備註 (選填)</span>
                <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                  <input type="text" className="inset-group-input" value={incNote} onChange={(e) => setIncNote(e.target.value)} placeholder="例如：月薪薪資" />
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button onClick={handleAddIncomeCart} className="glass-btn" style={{ flex: 1, fontWeight: '700' }}>
                ➕ 暫存此筆
              </button>
              {incomeCart.length > 0 && (
                <button onClick={() => setIncomeCart([])} className="glass-btn glass-btn-danger" style={{ padding: '0 12px' }}>清空</button>
              )}
            </div>

            {/* Cart List */}
            {incomeCart.length > 0 && (
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '14px', borderRadius: '12px', marginTop: '16px', border: '0.5px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', marginBottom: '8px', fontWeight: '800' }}>🛒 暫存收入入帳明細：</div>
                {incomeCart.map(item => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '6px 0', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                    <span>[{item.cat}] {item.note || '無備註'} ({item.accountNickname})</span>
                    <strong style={{ color: '#fff' }}>${item.amount.toLocaleString()}</strong>
                  </div>
                ))}
              </div>
            )}

            <button onClick={handleIncomeSubmit} className="glass-btn primary-gradient-btn" style={{ width: '100%', height: '44px', borderRadius: '12px', marginTop: '16px', fontWeight: '800' }}>
              🚀 確定送出記帳
            </button>
          </div>
        </div>
      )}

      {/* BILL PAYMENT POPUP MODAL */}
      {showBillPayModal && selectedBill && createPortal(
        <div className="liquid-modal-overlay" onClick={() => setShowBillPayModal(false)}>
          <div className="liquid-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px', width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontWeight: '850', fontSize: '1.1rem', color: '#fff' }}>💳 繳納常態帳單</div>
              <button onClick={() => setShowBillPayModal(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ marginBottom: '16px', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
              您正準備繳納帳單【<strong>{selectedBill.note || selectedBill.category || selectedBill.name || '常態帳單'}</strong>】，應繳金額為 <strong style={{ color: '#fff' }}>${(selectedBill.amount || 0).toLocaleString()} TWD</strong>。
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
              <button
                type="button"
                onClick={() => {
                  const b = selectedBill;
                  setShowBillPayModal(false);
                  handleOpenEditBill(b);
                }}
                className="glass-btn"
                style={{ flex: 1, padding: '6px 0', fontSize: '0.78rem' }}
              >
                ✏️ 編輯帳單
              </button>
              <button
                type="button"
                onClick={() => handleDeleteBill(selectedBill)}
                className="glass-btn glass-btn-danger"
                style={{ padding: '6px 12px', fontSize: '0.78rem' }}
              >
                🗑️ 刪除
              </button>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '6px' }}>請選擇扣款支付帳戶</label>
              {renderAccountSelector(billPayAccountId, setBillPayAccountId, () => true, 'isDefaultExpense')}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowBillPayModal(false)} className="glass-btn" style={{ flex: 1, padding: '10px 0', borderRadius: '8px' }}>取消</button>
              <button onClick={handleExecuteBillPay} className="glass-btn primary-gradient-btn" style={{ flex: 2, padding: '10px 0', borderRadius: '8px', fontWeight: '800' }}>確定繳款</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* PARTNER ACCOUNTS POPUP MODAL */}
      {accountModalConfig && createPortal(
        <div className="liquid-modal-overlay" onClick={() => setAccountModalConfig(null)}>
          <div className="liquid-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px', width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontWeight: '850', fontSize: '1.1rem', color: '#fff' }}>👥 {accountModalConfig.title || '選擇伴侶的帳戶'}</div>
              <button onClick={() => setAccountModalConfig(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '16px' }}>
              {accountModalConfig.list.map(acc => {
                const isSelected = accountModalConfig.selectedValue === acc.id;
                const isCredit = acc.type === 'credit';
                const balanceColor = isCredit ? '#ff9500' : '#8effa2';
                
                let defaultIcon = '🏦';
                if (acc.type === 'cash') defaultIcon = '💵';
                else if (acc.type === 'credit') defaultIcon = '💳';
                else if (acc.type === 'virtual') defaultIcon = '📱';
                
                const iconToRender = acc.icon || defaultIcon;
                const ownerLabel = acc.owner === 'joint' ? '共同 🏫' : (acc.owner === 'userA' ? '大狗狗🐕' : '阿陞🐶');

                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => {
                      accountModalConfig.onChange(acc.id);
                    }}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '10px',
                      border: isSelected ? '1.5px solid var(--accent-blue)' : '1px solid rgba(255,255,255,0.08)',
                      background: isSelected ? 'rgba(0,122,255,0.15)' : 'rgba(255,255,255,0.02)',
                      color: isSelected ? '#fff' : 'var(--text-secondary)',
                      fontSize: '0.78rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                      transition: 'all 0.2s ease',
                      boxShadow: isSelected ? '0 0 10px rgba(0,122,255,0.2)' : 'none',
                      minHeight: '52px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '0.76rem', color: isSelected ? '#fff' : 'var(--text-primary)', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {iconToRender} {acc.nickname}
                      </span>
                      <span style={{ fontSize: '0.58rem', opacity: 0.7, background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                        {ownerLabel}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.66rem', color: isSelected ? '#fff' : balanceColor, fontWeight: '700' }}>
                      ${(acc.balance || 0).toLocaleString()} {acc.currency || 'TWD'}
                    </span>
                  </button>
                );
              })}
            </div>

            <button onClick={() => setAccountModalConfig(null)} className="glass-btn" style={{ width: '100%', padding: '10px 0', borderRadius: '8px' }}>
              關閉
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* EDIT / ADD BILL MODAL */}
      {showEditBillModal && createPortal(
        <div className="liquid-modal-overlay" onClick={() => setShowEditBillModal(false)}>
          <div className="liquid-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px', width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontWeight: '850', fontSize: '1.1rem', color: '#fff' }}>
                {editingBill ? '✏️ 編輯常態帳單' : '➕ 新增常態帳單'}
              </div>
              <button onClick={() => setShowEditBillModal(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>

            <div className="inset-group-card" style={{ marginBottom: '20px' }}>
              {/* Bill Name/Note */}
              <div className="inset-group-row">
                <span className="inset-group-label">📝 帳單名稱</span>
                <span className="inset-group-value" style={{ flex: 1, marginLeft: '16px' }}>
                  <input
                    type="text"
                    className="inset-group-input"
                    value={billNote}
                    onChange={(e) => setBillNote(e.target.value)}
                    placeholder="例如：電費、房租、Netflix"
                  />
                </span>
              </div>

              {/* Bill Amount */}
              <div className="inset-group-row">
                <span className="inset-group-label">💵 預估金額</span>
                <span className="inset-group-value" style={{ flex: 1, marginLeft: '16px' }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="inset-group-input tabular-nums"
                    value={billAmount}
                    onChange={(e) => setBillAmount(formatInputMoney(e.target.value))}
                    placeholder="$0"
                  />
                </span>
              </div>

              {/* Bill Next Date */}
              <div className="inset-group-row">
                <span className="inset-group-label">📅 下次繳費日</span>
                <span className="inset-group-value">
                  <input
                    type="date"
                    style={{ background: 'none', border: 'none', color: '#fff', textAlign: 'right', outline: 'none' }}
                    value={billNextDate}
                    onChange={(e) => setBillNextDate(e.target.value)}
                  />
                </span>
              </div>

              {/* Bill Category */}
              <div className="inset-group-row">
                <span className="inset-group-label">🏷️ 分類</span>
                <span className="inset-group-value" style={{ flex: 1, marginLeft: '16px' }}>
                  <input
                    type="text"
                    className="inset-group-input"
                    value={billCategory}
                    onChange={(e) => setBillCategory(e.target.value)}
                    placeholder="例如：固定支出、水電瓦斯"
                  />
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowEditBillModal(false)} className="glass-btn" style={{ flex: 1, padding: '10px 0', borderRadius: '8px' }}>取消</button>
              <button onClick={handleSaveBill} className="glass-btn primary-gradient-btn" style={{ flex: 2, padding: '10px 0', borderRadius: '8px', fontWeight: '800' }}>
                {editingBill ? '更新帳單' : '確定新增'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ExpenseEntry;