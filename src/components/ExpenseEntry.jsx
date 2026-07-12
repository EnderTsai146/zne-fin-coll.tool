// src/components/ExpenseEntry.jsx
import React, { useState, useEffect, useMemo } from 'react';
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

  // Auto pre-select default account for personal expense prioritising own account
  useEffect(() => {
    const myDefault = accounts.find(a => a.owner === userKey && a.isDefaultExpense) || 
                      accounts.find(a => a.owner === 'joint' && a.isDefaultExpense) || 
                      accounts.find(a => a.owner === userKey) || 
                      accounts.find(a => a.owner === 'joint') || 
                      accounts[0];
    if (myDefault && !persAccountId) {
      setPersAccountId(myDefault.id);
    }
  }, [accounts, userKey]);

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

  // Auto pre-select default account for income
  useEffect(() => {
    const defaultInc = accounts.find(a => a.owner === userKey && a.isDefaultIncome) || 
                       accounts.find(a => a.owner === 'joint' && a.isDefaultIncome) || 
                       accounts.find(a => a.owner === userKey) || 
                       accounts.find(a => a.owner === 'joint') || 
                       accounts[0];
    if (defaultInc && !incAccountId) {
      setIncAccountId(defaultInc.id);
    }
  }, [accounts, userKey]);

  // ==========================================
  // 4. Bills States
  // ==========================================
  const [showBillPayModal, setShowBillPayModal] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);
  const [billPayAccountId, setBillPayAccountId] = useState('');

  // Pre-select default bill payment account
  useEffect(() => {
    const defaultBillPay = accounts.find(a => a.owner === userKey && a.isDefaultExpense) || 
                           accounts.find(a => a.owner === 'joint' && a.isDefaultExpense) || 
                           accounts.find(a => a.owner === 'joint') || 
                           accounts[0];
    if (defaultBillPay && !billPayAccountId) {
      setBillPayAccountId(defaultBillPay.id);
    }
  }, [accounts, userKey]);

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

  const [showMorePers, setShowMorePers] = useState(false);
  const [showMoreJoint, setShowMoreJoint] = useState(false);
  const [showMoreInc, setShowMoreInc] = useState(false);
  const [showMoreBill, setShowMoreBill] = useState(false);

  // Custom visual grid account picker
  const renderAccountSelector = (selectedValue, onChange, filterFn = () => true, showMoreState, setShowMoreState, defaultAccField = 'isDefaultExpense') => {
    const list = accounts.filter(filterFn);
    if (list.length === 0) {
      return <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', padding: '6px' }}>無相符帳戶</div>;
    }
    
    const sorted = sortAccountsForUser(list, userKey);
    
    // Separate user's own + joint, and partner's
    const ownAndJoint = sorted.filter(a => a.owner === userKey || a.owner === 'joint');
    const partnerAccs = sorted.filter(a => a.owner === partnerKey);
    
    const visibleList = showMoreState ? [...ownAndJoint, ...partnerAccs] : ownAndJoint;
    
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginTop: '6px' }}>
        {visibleList.map(acc => {
          const isSelected = selectedValue === acc.id;
          const ownerLabel = acc.owner === 'joint' ? '共同 🏫' : (acc.owner === userKey ? '我 👤' : '伴侶 👥');
          const isCredit = acc.type === 'credit';
          const balanceColor = isCredit ? '#ff9500' : '#8effa2';
          
          let defaultIcon = '🏦';
          if (acc.type === 'cash') defaultIcon = '💵';
          else if (acc.type === 'credit') defaultIcon = '💳';
          else if (acc.type === 'virtual') defaultIcon = '📱';
          
          const iconToRender = acc.icon || defaultIcon;
          const isDefault = acc[defaultAccField] || false;
          
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
                minHeight: '52px',
                gridColumn: isDefault ? 'span 2' : 'span 1'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                <span style={{ fontSize: '0.76rem', color: isSelected ? '#fff' : 'var(--text-primary)', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {iconToRender} {acc.nickname}
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
        
        {!showMoreState && partnerAccs.length > 0 && (
          <button
            type="button"
            onClick={() => setShowMoreState(true)}
            style={{
              padding: '8px 10px',
              borderRadius: '10px',
              border: '1px dashed rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.01)',
              color: 'var(--text-tertiary)',
              fontSize: '0.78rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '52px',
              gridColumn: 'span 2',
              gap: '4px'
            }}
          >
            👥 顯示伴侶的帳戶 (更多)
          </button>
        )}

        {showMoreState && partnerAccs.length > 0 && (
          <button
            type="button"
            onClick={() => setShowMoreState(false)}
            style={{
              padding: '8px 10px',
              borderRadius: '10px',
              border: '1px dashed rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.01)',
              color: 'var(--text-tertiary)',
              fontSize: '0.78rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '52px',
              gridColumn: 'span 2',
              gap: '4px'
            }}
          >
            收起伴侶帳戶
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

    // Correctly combine all cart items' details instead of just using the first item
    const consolidatedDetails = { food: 0, shopping: 0, entertainment: 0, other: 0 };

    for (const item of finalItems) {
      // Deduct from account balance
      updatedAccounts = updatedAccounts.map(a => {
        if (a.id === item.accountId) return { ...a, balance: a.balance - item.amount };
        return a;
      });

      if (item.cat === '餐費') consolidatedDetails.food += item.amount;
      else if (item.cat === '購物') consolidatedDetails.shopping += item.amount;
      else if (item.cat === '娛樂') consolidatedDetails.entertainment += item.amount;
      else consolidatedDetails.other += item.amount;
    }

    // Call app handler with combined details map and total sum
    const totalSum = finalItems.reduce((s, e) => s + e.amount, 0);
    const combinedNotes = finalItems.map(i => i.note || i.cat).join('，');
    
    onAddExpense(txDate, consolidatedDetails, totalSum, userKey, combinedNotes, null, updatedAccounts);
    
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
    const consolidatedDetails = { food: 0, shopping: 0, entertainment: 0, other: 0 };

    for (const item of finalItems) {
      updatedAccounts = updatedAccounts.map(a => {
        if (a.id === item.accountId) return { ...a, balance: a.balance - item.amount };
        return a;
      });

      if (item.cat === '餐費') consolidatedDetails.food += item.amount;
      else if (item.cat === '購物') consolidatedDetails.shopping += item.amount;
      else if (item.cat === '娛樂') consolidatedDetails.entertainment += item.amount;
      else consolidatedDetails.other += item.amount;
    }

    const totalSum = finalItems.reduce((s, e) => s + e.amount, 0);
    const combinedNotes = finalItems.map(i => i.note || i.cat).join('，');
    
    // Joint submit (using joint helper callback)
    // Note: advancedBy is evaluated based on whether the payee account belongs to joint/userA/userB
    const sampleAcc = accounts.find(a => a.id === finalItems[0].accountId);
    const advancedBy = sampleAcc.owner === 'joint' ? null : sampleAcc.owner;

    onAddJointExpense(txDate, consolidatedDetails, totalSum, advancedBy, combinedNotes, null, updatedAccounts);
    
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
      accounts: updatedAccounts,
      monthlyExpenses: [
        ...(assets.monthlyExpenses || []),
        ...newIncomes
      ]
    };

    onTransaction(finalAssets, newIncomes[0]); // Save to cloud
    
    setIncomeCart([]);
    setIncAmount('');
    setIncNote('');
    await customAlert(`✅ 成功入帳 $${totalSum.toLocaleString()} 元！`);
  };

  const handleExecuteBillPay = async () => {
    if (!billPayAccountId || !selectedBill) return;
    const acc = accounts.find(a => a.id === billPayAccountId);
    const amount = selectedBill.amount;

    if (acc.type !== 'credit' && acc.balance < amount) {
      await customAlert(`❌ 帳戶【${acc.nickname}】餘額不足以支付此筆帳單！`);
      return;
    }

    const updatedAccounts = accounts.map(a => {
      if (a.id === billPayAccountId) return { ...a, balance: a.balance - amount };
      return a;
    });

    const targetTimestamp = new Date().toISOString();
    const finalAssets = {
      ...assets,
      accounts: updatedAccounts,
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
                  {renderAccountSelector(persAccountId, setPersAccountId, () => true, showMorePers, setShowMorePers, 'isDefaultExpense')}
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
                  {renderAccountSelector(jointAccountId, setJointAccountId, () => true, showMoreJoint, setShowMoreJoint, 'isDefaultExpense')}
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
              <h3 style={{ margin: '0 0 16px 0', fontWeight: '800' }}>📅 常態帳項繳款</h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 16px 0', lineHeight: '1.4' }}>
                點擊下方即將到期或已出帳的常態帳單項目，即可使用特定帳戶進行快速繳費結清。
              </p>

              <div className="inset-group-card">
                {safeBills.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>目前尚無設定任何常態帳單</div>
                ) : (
                  safeBills.map(bill => {
                    const isNear = isApproaching(bill.nextDate);
                    return (
                      <div
                        key={bill.id}
                        onClick={() => {
                          setSelectedBill(bill);
                          setShowBillPayModal(true);
                        }}
                        className="inset-group-row"
                        style={{
                          padding: '12px 14px',
                          cursor: 'pointer',
                          background: isNear ? 'rgba(255,149,0,0.05)' : 'none',
                          borderLeft: isNear ? '3px solid #ff9500' : 'none'
                        }}
                      >
                        <span className="inset-group-label" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontWeight: '750', fontSize: '0.84rem', color: '#fff' }}>{bill.note || bill.category}</span>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>繳費日: 每月 {bill.date} 號 | 下次: {bill.nextDate}</span>
                        </span>
                        <span className="inset-group-value" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
                          <strong style={{ color: '#fff', fontSize: '0.88rem' }}>${bill.amount.toLocaleString()} TWD</strong>
                          {isNear && <span style={{ fontSize: '0.58rem', background: '#ff9500', color: '#000', padding: '1px 5px', borderRadius: '4px', fontWeight: '800' }}>即將到期</span>}
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
                {renderAccountSelector(incAccountId, setIncAccountId, a => a.type !== 'credit', showMoreInc, setShowMoreInc, 'isDefaultIncome')}
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
      {showBillPayModal && selectedBill && (
        <div className="liquid-modal-overlay" onClick={() => setShowBillPayModal(false)}>
          <div className="liquid-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px', width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontWeight: '850', fontSize: '1.1rem', color: '#fff' }}>💳 繳納常態帳單</div>
              <button onClick={() => setShowBillPayModal(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ marginBottom: '16px', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
              您正準備繳納帳單【<strong>{selectedBill.note || selectedBill.category}</strong>】，應繳金額為 <strong style={{ color: '#fff' }}>${selectedBill.amount.toLocaleString()} TWD</strong>。
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '6px' }}>請選擇扣款支付帳戶</label>
              {renderAccountSelector(billPayAccountId, setBillPayAccountId, () => true, showMoreBill, setShowMoreBill, 'isDefaultExpense')}
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