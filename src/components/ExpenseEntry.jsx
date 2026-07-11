// src/components/ExpenseEntry.jsx
import React, { useState, useEffect, useMemo } from 'react';
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
  const offset = newD.getTimezoneOffset();
  newD = new Date(newD.getTime() - (offset * 60 * 1000));
  return newD.toISOString().split('T')[0];
};

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
  if (catName.includes('物') || catName.includes('用')) {
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
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: '5px' }}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
};

const ExpenseEntry = ({
  assets,
  setAssets,
  onAddExpense,
  onAddJointExpense,
  onTransaction,
  customAlert,
  customConfirm,
  customPrompt,
  getBudgetProgressText
}) => {
  // Main Entry mode: Expense (支出) vs Income (收入)
  const [entryMode, setEntryMode] = useState('expense'); // 'expense', 'income'

  // Sub tabs for Expense Mode
  const [activeTab, setActiveTab] = useState('personal'); // 'personal', 'joint', 'bills'

  // Common date
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);

  // Accounts list from assets
  const accounts = assets?.accounts || [];
  
  // Find current operator's email and user key
  const userKey = assets.operator?.includes('大狗狗') ? 'userA' : 'userB';
  const partnerKey = userKey === 'userA' ? 'userB' : 'userA';
  const loggedInUserName = assets.operator || '大狗狗🐕';

  // Categories
  const expenseCategories = assets.config?.categories || ["餐費", "購物", "娛樂", "其他"];
  const incomeCategories = ["薪資", "獎金", "投資收益", "其他"];

  const categoryOptions = expenseCategories.map(cat => ({
    label: (
      <span>
        {getCategoryIcon(cat)}
        {cat}
      </span>
    ),
    value: cat
  }));

  // Default accounts finder
  const defaultExpenseAccount = accounts.find(a => a.owner === userKey && a.isDefaultExpense) || accounts.find(a => a.owner === userKey) || accounts[0];
  const defaultIncomeAccount = accounts.find(a => a.owner === userKey && a.isDefaultIncome) || accounts.find(a => a.owner === userKey) || accounts[0];

  // ==========================================
  // 1. Personal Expense States
  // ==========================================
  const [persCat, setPersCat] = useState(expenseCategories[0] || '餐費');
  const [persAmount, setPersAmount] = useState('');
  const [persNote, setPersNote] = useState('');
  const [persNecessity, setPersNecessity] = useState('need'); // 'need', 'want'
  const [persAccountId, setPersAccountId] = useState('');
  const [persCart, setPersCart] = useState([]);

  // Auto pre-select default account for personal expense
  useEffect(() => {
    if (defaultExpenseAccount && !persAccountId) {
      setPersAccountId(defaultExpenseAccount.id);
    }
  }, [defaultExpenseAccount]);

  // ==========================================
  // 2. Joint Expense States
  // ==========================================
  const [jointCat, setJointCat] = useState(expenseCategories[0] || '餐費');
  const [jointAmount, setJointAmount] = useState('');
  const [jointNote, setJointNote] = useState('');
  const [jointNecessity, setJointNecessity] = useState('need');
  const [jointAccountId, setJointAccountId] = useState('');
  const [jointCart, setJointCart] = useState([]);

  // Pre-select default joint account (prefer joint cash account)
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

  // Auto pre-select default account for income
  useEffect(() => {
    if (defaultIncomeAccount && !incAccountId) {
      setIncAccountId(defaultIncomeAccount.id);
    }
  }, [defaultIncomeAccount]);

  // ==========================================
  // 4. Bills States
  // ==========================================
  const [showBillPayModal, setShowBillPayModal] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);
  const [billPayAccountId, setBillPayAccountId] = useState('');

  // Pre-select default bill payment account
  useEffect(() => {
    if (defaultExpenseAccount && !billPayAccountId) {
      setBillPayAccountId(defaultExpenseAccount.id);
    }
  }, [defaultExpenseAccount]);

  // Helper check for bills approaching
  const isApproaching = (dueDateStr) => {
    const today = new Date();
    const due = new Date(dueDateStr);
    const diff = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    return diff >= 0 && diff <= 3;
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
    
    // Validate balance for non-credit cards
    if (acc.type !== 'credit' && acc.balance < parsedAmount) {
      await customAlert(`⚠️ 帳戶【${acc.nickname}】餘額不足！ (餘額: $${acc.balance.toLocaleString()})`);
      return;
    }

    const payload = {
      id: Date.now().toString(),
      cat: persCat,
      amount: parsedAmount,
      note: persNote.trim(),
      necessity: persNecessity,
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
        necessity: persNecessity,
        accountId: persAccountId,
        accountNickname: acc.nickname
      });
    }

    if (finalItems.length === 0) {
      await customAlert("請輸入金額或暫存交易！");
      return;
    }

    let updatedAccounts = [...accounts];
    const newExpenses = [];

    for (const item of finalItems) {
      // Deduct from account
      updatedAccounts = updatedAccounts.map(a => {
        if (a.id === item.accountId) return { ...a, balance: a.balance - item.amount };
        return a;
      });

      const expenseDataMap = { food: 0, shopping: 0, entertainment: 0, other: 0 };
      if (item.cat === '餐費') expenseDataMap.food = item.amount;
      else if (item.cat === '購物') expenseDataMap.shopping = item.amount;
      else if (item.cat === '娛樂') expenseDataMap.entertainment = item.amount;
      else expenseDataMap.other = item.amount;

      newExpenses.push({
        date: txDate,
        month: txDate.slice(0, 7),
        type: 'expense',
        category: '個人支出',
        details: expenseDataMap,
        total: item.amount,
        payer: loggedInUserName,
        accountId: item.accountId,
        operator: loggedInUserName,
        note: item.note || item.cat,
        timestamp: new Date().toISOString(),
        necessity: item.necessity
      });
    }

    // Call app handler with modified accounts
    onAddExpense(txDate, newExpenses[0].details, newExpenses.reduce((s, e) => s + e.total, 0), userKey, finalItems.map(i => i.note || i.cat).join('，'));
    setAssets({ ...assets, accounts: updatedAccounts });
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
      await customAlert(`⚠️ 帳戶【${acc.nickname}】餘額不足！`);
      return;
    }

    const payload = {
      id: Date.now().toString(),
      cat: jointCat,
      amount: parsedAmount,
      note: jointNote.trim(),
      necessity: jointNecessity,
      accountId: jointAccountId,
      accountNickname: acc.nickname,
      owner: acc.owner
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
        await customAlert(`⚠️ 帳戶【${acc.nickname}】餘額不足！`);
        return;
      }
      finalItems.push({
        id: Date.now().toString(),
        cat: jointCat,
        amount: parsedAmount,
        note: jointNote.trim(),
        necessity: jointNecessity,
        accountId: jointAccountId,
        accountNickname: acc.nickname,
        owner: acc.owner
      });
    }

    if (finalItems.length === 0) {
      await customAlert("請輸入金額或暫存交易！");
      return;
    }

    let updatedAccounts = [...accounts];
    const newSpends = [];

    for (const item of finalItems) {
      // Deduct from account
      updatedAccounts = updatedAccounts.map(a => {
        if (a.id === item.accountId) return { ...a, balance: a.balance - item.amount };
        return a;
      });

      const advancedBy = item.owner === 'joint' ? 'jointCash' : item.owner;

      newSpends.push({
        date: txDate,
        month: txDate.slice(0, 7),
        type: 'spend',
        category: '共同支出',
        total: item.amount,
        note: item.note ? `${item.cat} - ${item.note}` : item.cat,
        operator: loggedInUserName,
        payer: '共同帳戶',
        accountId: item.accountId,
        advancedBy: advancedBy === 'jointCash' ? null : advancedBy,
        isSettled: false,
        timestamp: new Date().toISOString(),
        necessity: item.necessity,
        subCategory: item.cat
      });
    }

    onAddJointExpense(txDate, finalItems[0].cat, finalItems.reduce((s, e) => s + e.amount, 0), finalItems[0].owner === 'joint' ? 'jointCash' : finalItems[0].owner, finalItems.map(i => i.note).filter(Boolean).join('，'));
    setAssets({ ...assets, accounts: updatedAccounts });
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
      await customAlert("請輸入收入金額！");
      return;
    }
    if (!incAccountId) {
      await customAlert("請選擇入帳帳戶！");
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
        await customAlert("請選擇入帳帳戶！");
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
    const transactionRecords = [];

    for (const item of finalItems) {
      // Add to account balance
      updatedAccounts = updatedAccounts.map(a => {
        if (a.id === item.accountId) return { ...a, balance: a.balance + item.amount };
        return a;
      });

      transactionRecords.push({
        date: txDate,
        month: txDate.slice(0, 7),
        type: 'income',
        category: '個人收入',
        total: item.amount,
        payer: loggedInUserName,
        accountId: item.accountId,
        note: item.note || item.cat,
        timestamp: new Date().toISOString()
      });
    }

    onTransaction({ ...assets, accounts: updatedAccounts }, transactionRecords);
    setIncomeCart([]);
    setIncAmount('');
    setIncNote('');
    await customAlert("🎉 收入已成功登錄入帳！");
  };

  // ==========================================
  // Bills Payment Handling
  // ==========================================
  const handleOpenBillPay = (bill) => {
    setSelectedBill(bill);
    setShowBillPayModal(true);
  };

  const handleExecuteBillPay = async () => {
    if (!billPayAccountId || !selectedBill) return;
    const acc = accounts.find(a => a.id === billPayAccountId);
    const amount = selectedBill.amount;

    if (acc.type !== 'credit' && acc.balance < amount) {
      await customAlert(`❌ 帳戶【${acc.nickname}】餘額不足！ (餘額: $${acc.balance.toLocaleString()})`);
      return;
    }

    // Prepare updated bill cycle date
    const updatedBills = (assets.bills || []).map(b => {
      if (b.id === selectedBill.id) {
        return {
          ...b,
          nextDate: addMonthsSafe(b.nextDate, b.cycleMonths || 1),
          isPaid: false // Reset flag for the new month
        };
      }
      return b;
    });

    // Deduct from account
    const updatedAccounts = accounts.map(a => {
      if (a.id === billPayAccountId) return { ...a, balance: a.balance - amount };
      return a;
    });

    // Record spend transaction
    const targetTimestamp = new Date().toISOString();
    const newAssets = {
      ...assets,
      accounts: updatedAccounts,
      bills: updatedBills
    };

    const finalAssets = {
      ...newAssets,
      monthlyExpenses: [
        ...(assets.monthlyExpenses || []),
        {
          date: txDate,
          month: txDate.slice(0, 7),
          type: 'spend',
          category: '共同支出',
          total: amount,
          note: `[帳單繳款] ${selectedBill.note || selectedBill.category}`,
          operator: loggedInUserName,
          payer: '共同帳戶',
          accountId: billPayAccountId,
          advancedBy: acc.owner === 'joint' ? null : acc.owner,
          isSettled: false,
          timestamp: targetTimestamp,
          necessity: 'need',
          subCategory: selectedBill.category
        }
      ]
    };

    setAssets(finalAssets);
    onTransaction(finalAssets, []); // Trigger cloud save
    setShowBillPayModal(false);
    await customAlert(`✅ 帳單【${selectedBill.note || selectedBill.category}】繳費成功！\n由帳戶【${acc.nickname}】支付 $${amount.toLocaleString()}`);
  };

  const safeBills = assets.bills || [];

  const renderAccountSelector = (selectedValue, onChange, filterFn = () => true) => {
    const list = accounts.filter(filterFn);
    if (list.length === 0) {
      return <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', padding: '6px' }}>無相符帳戶</div>;
    }
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginTop: '6px' }}>
        {list.map(acc => {
          const isSelected = selectedValue === acc.id;
          const ownerLabel = acc.owner === 'joint' ? '共同' : (acc.owner === 'userA' ? '大狗狗' : '阿陞');
          const isCredit = acc.type === 'credit';
          const balanceColor = isCredit ? '#ff9500' : '#8effa2';
          
          return (
            <button
              key={acc.id}
              type="button"
              onClick={() => onChange(acc.id)}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                <span style={{ fontSize: '0.76rem', color: isSelected ? '#fff' : 'var(--text-primary)', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {acc.nickname}
                </span>
                <span style={{ fontSize: '0.58rem', opacity: 0.6, background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: '4px' }}>
                  {ownerLabel}
                </span>
              </div>
              <span style={{ fontSize: '0.66rem', color: isSelected ? '#fff' : balanceColor, fontWeight: '700' }}>
                ${acc.balance.toLocaleString()} {acc.currency}
              </span>
            </button>
          );
        })}
      </div>
    );
  };

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

        {/* Dynamic Budget Ring/Text Progress */}
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
            if (val === 'income') {
              // Pre-select default income account
              if (defaultIncomeAccount) setIncAccountId(defaultIncomeAccount.id);
            } else {
              // Pre-select default expense account
              if (defaultExpenseAccount) setPersAccountId(defaultExpenseAccount.id);
            }
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

                {/* Account */}
                <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                  <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>💳 支付帳戶</span>
                  {renderAccountSelector(persAccountId, setPersAccountId)}
                </div>

                {/* Amount */}
                <div className="inset-group-row">
                  <span className="inset-group-label">💵 金額</span>
                  <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                    <input type="text" inputMode="numeric" className="inset-group-input" value={persAmount} onChange={(e) => setPersAmount(formatInputMoney(e.target.value))} placeholder="$0" />
                  </span>
                </div>

                {/* Note */}
                <div className="inset-group-row">
                  <span className="inset-group-label">📝 備註 (選填)</span>
                  <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                    <input type="text" className="inset-group-input" value={persNote} onChange={(e) => setPersNote(e.target.value)} placeholder="例如：買咖啡" />
                  </span>
                </div>

                {/* Necessity */}
                <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                  <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>🎯 必要程度</span>
                  <SegmentedControl
                    options={[
                      { label: '🍲 必要 (Need)', value: 'need' },
                      { label: '✨ 想要 (Want)', value: 'want' }
                    ]}
                    value={persNecessity}
                    onChange={setPersNecessity}
                  />
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

                {/* Joint Account Selector */}
                <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                  <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>💳 支付帳戶</span>
                  {renderAccountSelector(jointAccountId, setJointAccountId)}
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

                {/* Necessity */}
                <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                  <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>🎯 必要程度</span>
                  <SegmentedControl
                    options={[
                      { label: '🍲 必要 (Need)', value: 'need' },
                      { label: '✨ 想要 (Want)', value: 'want' }
                    ]}
                    value={jointNecessity}
                    onChange={setJointNecessity}
                  />
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
                🚀 確定送出共同記帳
              </button>
            </div>
          )}

          {/* Sub Tab: Bills */}
          {activeTab === 'bills' && (
            <div className="glass-card" style={{ padding: '20px 18px' }}>
              <h3 style={{ margin: '0 0 16px 0', fontWeight: '800' }}>📅 待繳常態帳單</h3>

              {safeBills.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '20px', fontSize: '0.9rem' }}>目前尚未建立任何定期帳單。</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {safeBills.map(bill => {
                    const approaching = isApproaching(bill.nextDate);
                    return (
                      <div key={bill.id} className="bill-item-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: '8px', border: '0.5px solid rgba(255,255,255,0.08)', backgroundColor: approaching ? 'rgba(255,149,0,0.08)' : 'rgba(255,255,255,0.02)' }}>
                        <div>
                          <div style={{ fontWeight: '700', fontSize: '0.86rem', color: '#fff' }}>
                            {bill.note || bill.category} {approaching && <span style={{ color: '#ff9500', fontSize: '0.7rem' }}>⚠️ 即將到期</span>}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                            應繳日期: {bill.nextDate}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontWeight: '800', fontSize: '0.9rem', color: '#fff' }}>${bill.amount.toLocaleString()}</span>
                          <button onClick={() => handleOpenBillPay(bill)} className="glass-btn primary-gradient-btn" style={{ padding: '6px 12px', fontSize: '0.74rem', borderRadius: '6px' }}>
                            繳款
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================== */}
      {/* MODE 2: INCOME SYSTEM */}
      {/* ========================================== */}
      {entryMode === 'income' && (
        <div className="slide-in glass-card" style={{ padding: '20px 18px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontWeight: '800' }}>💵 登錄個人收入</h3>

          <div className="inset-group-card">
            {/* Date */}
            <div className="inset-group-row">
              <span className="inset-group-label">📅 收入日期</span>
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
              {renderAccountSelector(incAccountId, setIncAccountId, a => a.type !== 'credit')}
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
                <input type="text" className="inset-group-input" value={incNote} onChange={(e) => setIncNote(e.target.value)} placeholder="例如：本月薪資" />
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
              <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', marginBottom: '8px', fontWeight: '800' }}>🛒 暫存個人收入明細：</div>
              {incomeCart.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '6px 0', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                  <span>[{item.cat}] {item.note || '無備註'} ({item.accountNickname})</span>
                  <strong style={{ color: '#8effa2' }}>${item.amount.toLocaleString()}</strong>
                </div>
              ))}
            </div>
          )}

          <button onClick={handleIncomeSubmit} className="glass-btn primary-gradient-btn" style={{ width: '100%', height: '44px', borderRadius: '12px', marginTop: '16px', fontWeight: '800' }}>
            🚀 確定送出收入入帳
          </button>
        </div>
      )}

      {/* BILL PAYMENT POPUP MODAL */}
      {showBillPayModal && selectedBill && (
        <div className="custom-modal-overlay" onClick={() => setShowBillPayModal(false)}>
          <div className="modal-content glass-card slide-in" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px', width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontWeight: '850', fontSize: '1.1rem', color: '#fff' }}>💳 繳納常態帳單</div>
              <button onClick={() => setShowBillPayModal(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ marginBottom: '16px', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
              您正準備繳納帳單【<strong>{selectedBill.note || selectedBill.category}</strong>】，應繳金額為 <strong style={{ color: '#fff' }}>${selectedBill.amount.toLocaleString()} TWD</strong>。
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '6px' }}>請選擇扣款支付帳戶</label>
              {renderAccountSelector(billPayAccountId, setBillPayAccountId)}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowBillPayModal(false)} className="glass-btn" style={{ flex: 1, padding: '10px 0', borderRadius: '8px' }}>取消</button>
              <button onClick={handleExecuteBillPay} className="glass-btn primary-gradient-btn" style={{ flex: 2, padding: '10px 0', borderRadius: '8px', fontWeight: '800' }}>確定繳款</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ExpenseEntry;