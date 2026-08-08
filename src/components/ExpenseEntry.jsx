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
  getBudgetProgressText,
  onNavigateTab
}) => {
  const accounts = assets?.accounts || [];
  const loggedInUserName = currentUser || "系統";
  const userKey = loggedInUserName.includes('大狗狗') ? 'userA' : 'userB';
  const partnerKey = userKey === 'userA' ? 'userB' : 'userA';

  const defaultExpenseAccount = accounts.find(a => a.owner === userKey && a.isDefaultExpense) || accounts.find(a => a.owner === 'joint' && a.isDefaultExpense) || accounts[0];
  const defaultIncomeAccount = accounts.find(a => a.owner === userKey && a.isDefaultIncome) || accounts.find(a => a.owner === 'joint' && a.isDefaultIncome) || accounts[0];

  const expenseCategories = assets?.config?.categories || ["餐費", "購物", "娛樂", "其他"];
  const incomeCategories = ["薪資", "獎金", "投資", "其他"];

  const categoryOptions = useMemo(() => expenseCategories.map(cat => ({ label: cat, value: cat })), [expenseCategories]);

  const [entryMode, setEntryMode] = useState('expense'); // 'expense', 'income'
  const [activeTab, setActiveTab] = useState('personal'); // 'personal', 'joint', 'bills'

  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);

  // ==========================================
  // 1. Personal Expense States
  // ==========================================
  const [persCat, setPersCat] = useState(''); // Empty initial state requiring explicit user tap (anti-mistake defense)
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
  const [jointCat, setJointCat] = useState(''); // Empty initial state requiring explicit user tap (anti-mistake defense)
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

  const [showCreditCardModal, setShowCreditCardModal] = useState(false);
  const [selectedCcBill, setSelectedCcBill] = useState(null);
  const [helpTooltipConfig, setHelpTooltipConfig] = useState(null);

  const [showEditBillModal, setShowEditBillModal] = useState(false);
  const [editingBill, setEditingBill] = useState(null);
  const [billNote, setBillNote] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [billNextDate, setBillNextDate] = useState('');
  const [isFixedAmount, setIsFixedAmount] = useState(true);
  const [billOwner, setBillOwner] = useState(userKey);
  const [billDefaultAccountId, setBillDefaultAccountId] = useState('');
  const [reminderDays, setReminderDays] = useState(3);
  const [billingDay, setBillingDay] = useState(1);

  const handleOpenAddBill = () => {
    setEditingBill(null);
    setBillNote('');
    setBillAmount('');
    const today = new Date();
    setBillNextDate(today.toISOString().split('T')[0]);
    setIsFixedAmount(true);
    setBillOwner(userKey);
    setBillDefaultAccountId('');
    setReminderDays(3);
    setBillingDay(today.getDate() > 28 ? 28 : today.getDate());
    setShowEditBillModal(true);
  };

  const handleOpenEditBill = (b) => {
    setEditingBill(b);
    setBillNote(b.note || b.category || b.name || '');
    setBillAmount(b.amount ? formatInputMoney(b.amount) : '');
    setBillNextDate(b.nextDate || new Date().toISOString().split('T')[0]);
    setIsFixedAmount(b.isFixedAmount !== false);
    setBillOwner(b.owner || userKey);
    setBillDefaultAccountId(b.defaultAccountId || '');
    setReminderDays(b.reminderDays || 3);
    setBillingDay(b.date || (b.nextDate ? new Date(b.nextDate).getDate() : 1));
    setShowEditBillModal(true);
  };

  const handleSaveBill = async () => {
    if (!billNote.trim()) {
      await customAlert("請輸入帳單名稱！");
      return;
    }
    const amt = parseMoney(billAmount);
    const dateDay = Number(billingDay) || 1;
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
            category: '固定費用',
            isFixedAmount: isFixedAmount,
            owner: billOwner,
            defaultAccountId: billDefaultAccountId,
            reminderDays: Number(reminderDays)
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
        category: '固定費用',
        isFixedAmount: isFixedAmount,
        owner: billOwner,
        defaultAccountId: billDefaultAccountId,
        reminderDays: Number(reminderDays)
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
  // ==========================================
  // Personal Expense Submission
  // ==========================================
  const handleAddPersCart = async () => {
    if (!persCat) {
      await customAlert("⚠️ 請先點按選擇支出類別！", "未選擇類別");
      return;
    }
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
      id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      cat: persCat,
      amount: parsedAmount,
      note: persNote.trim(),
      accountId: persAccountId,
      accountNickname: acc.nickname,
      accountType: acc.type,
      owner: acc.owner,
      date: txDate
    };

    setPersCart([...persCart, payload]);
    setPersAmount('');
    setPersNote('');
    setPersCat(''); // Reset category to force explicit tap for next item
  };

  const handlePersSubmit = async () => {
    let finalItems = [...persCart];
    const parsedAmount = parseMoney(persAmount);

    if (parsedAmount > 0) {
      if (!persCat) {
        await customAlert("⚠️ 請先點按選擇支出類別！", "未選擇類別");
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
      finalItems.push({
        id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        cat: persCat,
        amount: parsedAmount,
        note: persNote.trim(),
        accountId: persAccountId,
        accountNickname: acc.nickname,
        accountType: acc.type,
        owner: acc.owner,
        date: txDate
      });
    }

    if (finalItems.length === 0) {
      await customAlert("請輸入金額或暫存交易！");
      return;
    }

    let updatedAccounts = [...accounts];
    const accountChangesMap = {};

    // Deduct from account balances
    for (const item of finalItems) {
      const acc = updatedAccounts.find(a => a.id === item.accountId);
      if (acc) {
        if (!accountChangesMap[acc.id]) {
          accountChangesMap[acc.id] = { nickname: acc.nickname, oldBal: acc.balance, diff: 0 };
        }
        accountChangesMap[acc.id].diff -= item.amount;
      }
      updatedAccounts = updatedAccounts.map(a => {
        if (a.id === item.accountId) return { ...a, balance: a.balance - item.amount };
        return a;
      });
    }

    const accountChanges = Object.values(accountChangesMap).map(ac => ({
      ...ac,
      newBal: ac.oldBal + ac.diff
    }));

    const payerName = userKey === 'userA' ? '大狗狗🐕' : '阿陞🐶';

    // Generate separate history records
    const historyRecords = finalItems.map((item, idx) => {
      const details = { food: 0, shopping: 0, entertainment: 0, other: 0, fixed: 0 };
      if (item.cat === '餐費') details.food = item.amount;
      else if (item.cat === '購物') details.shopping = item.amount;
      else if (item.cat === '娛樂') details.entertainment = item.amount;
      else if (item.cat === '固定費用') details.fixed = item.amount;
      else details.other = item.amount;

      return {
        id: `exp_${Date.now()}_${idx}`,
        date: item.date || txDate,
        month: (item.date || txDate).slice(0, 7),
        type: 'expense',
        category: '個人支出',
        details,
        total: item.amount,
        payer: payerName,
        accountId: item.accountId,
        note: item.note || item.cat,
        subCategory: item.cat,
        necessity: 'need'
      };
    });

    const finalAssets = { ...assets, accounts: updatedAccounts };

    // Trigger Pre-Submission Confirmation Modal
    setPendingSubmitConfig({
      typeTitle: `💰 個人支出送出確認 (${payerName})`,
      operator: loggedInUserName,
      txDate: txDate,
      items: finalItems,
      accountChanges,
      onConfirm: () => {
        onTransaction(finalAssets, historyRecords);
        setPersCart([]);
        setPersAmount('');
        setPersNote('');
        setPersCat('');
      }
    });
  };

  // ==========================================
  // Joint Expense Submission
  // ==========================================
  const handleAddJointCart = async () => {
    if (!jointCat) {
      await customAlert("⚠️ 請先點按選擇支出類別！", "未選擇類別");
      return;
    }
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
      id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      cat: jointCat,
      amount: parsedAmount,
      note: jointNote.trim(),
      accountId: jointAccountId,
      accountNickname: acc.nickname,
      accountType: acc.type,
      owner: acc.owner,
      date: txDate
    };

    setJointCart([...jointCart, payload]);
    setJointAmount('');
    setJointNote('');
    setJointCat(''); // Reset category
  };

  const handleJointSubmit = async () => {
    let finalItems = [...jointCart];
    const parsedAmount = parseMoney(jointAmount);

    if (parsedAmount > 0) {
      if (!jointCat) {
        await customAlert("⚠️ 請先點按選擇支出類別！", "未選擇類別");
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
      finalItems.push({
        id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        cat: jointCat,
        amount: parsedAmount,
        note: jointNote.trim(),
        accountId: jointAccountId,
        accountNickname: acc.nickname,
        accountType: acc.type,
        owner: acc.owner,
        date: txDate
      });
    }

    if (finalItems.length === 0) {
      await customAlert("請輸入金額或暫存交易！");
      return;
    }

    let updatedAccounts = [...accounts];
    const accountChangesMap = {};

    // Deduct from account balances
    for (const item of finalItems) {
      const acc = updatedAccounts.find(a => a.id === item.accountId);
      if (acc) {
        if (!accountChangesMap[acc.id]) {
          accountChangesMap[acc.id] = { nickname: acc.nickname, oldBal: acc.balance, diff: 0 };
        }
        accountChangesMap[acc.id].diff -= item.amount;
      }
      updatedAccounts = updatedAccounts.map(a => {
        if (a.id === item.accountId) return { ...a, balance: a.balance - item.amount };
        return a;
      });
    }

    const accountChanges = Object.values(accountChangesMap).map(ac => ({
      ...ac,
      newBal: ac.oldBal + ac.diff
    }));

    const historyRecords = finalItems.map((item, idx) => {
      const sampleAcc = accounts.find(a => a.id === item.accountId);
      const advancedBy = sampleAcc.owner === 'joint' ? null : sampleAcc.owner;

      return {
        id: `spend_${Date.now()}_${idx}`,
        date: item.date || txDate,
        month: (item.date || txDate).slice(0, 7),
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

    // Trigger Pre-Submission Confirmation Modal
    setPendingSubmitConfig({
      typeTitle: `🏫 共同支出送出確認`,
      operator: loggedInUserName,
      txDate: txDate,
      items: finalItems,
      accountChanges,
      onConfirm: () => {
        onTransaction(finalAssets, historyRecords);
        setJointCart([]);
        setJointAmount('');
        setJointNote('');
        setJointCat('');
      }
    });
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
      id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      cat: incCat,
      amount: parsedAmount,
      note: incNote.trim(),
      accountId: incAccountId,
      accountNickname: acc.nickname,
      date: txDate
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
        id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        cat: incCat,
        amount: parsedAmount,
        note: incNote.trim(),
        accountId: incAccountId,
        accountNickname: acc.nickname,
        date: txDate
      });
    }

    if (finalItems.length === 0) {
      await customAlert("請輸入金額或暫存交易！");
      return;
    }

    let updatedAccounts = [...accounts];
    const accountChangesMap = {};

    for (const item of finalItems) {
      const acc = updatedAccounts.find(a => a.id === item.accountId);
      if (acc) {
        if (!accountChangesMap[acc.id]) {
          accountChangesMap[acc.id] = { nickname: acc.nickname, oldBal: acc.balance, diff: 0 };
        }
        accountChangesMap[acc.id].diff += item.amount;
      }
      updatedAccounts = updatedAccounts.map(a => {
        if (a.id === item.accountId) return { ...a, balance: a.balance + item.amount };
        return a;
      });
    }

    const accountChanges = Object.values(accountChangesMap).map(ac => ({
      ...ac,
      newBal: ac.oldBal + ac.diff
    }));

    // Create income record list
    const newIncomes = finalItems.map(item => ({
      date: item.date || txDate,
      month: (item.date || txDate).slice(0, 7),
      type: 'income',
      category: item.cat,
      total: item.amount,
      payer: loggedInUserName,
      accountId: item.accountId,
      operator: loggedInUserName,
      note: item.note || item.cat,
      timestamp: new Date().toISOString()
    }));

    const finalAssets = { ...assets, accounts: updatedAccounts };

    // Trigger Pre-Submission Confirmation Modal
    setPendingSubmitConfig({
      typeTitle: `💵 收入入帳送出確認`,
      operator: loggedInUserName,
      txDate: txDate,
      items: finalItems,
      accountChanges,
      onConfirm: () => {
        onTransaction(finalAssets, newIncomes);
        setIncomeCart([]);
        setIncAmount('');
        setIncNote('');
      }
    });
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
      setSelectedCcBill(bill);
      setShowCreditCardModal(true);
      return;
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

              {/* Apple-Style Inset Grouped Personal Expense Cart */}
              {persCart.length > 0 && (
                <div style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '16px',
                  padding: '14px',
                  marginTop: '16px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.15)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.95rem' }}>🛒</span>
                      <span style={{ fontWeight: '800', fontSize: '0.86rem', color: '#fff' }}>
                        待確認個人支出 (<strong>{persCart.length}</strong> 筆)
                      </span>
                      <span style={{ fontSize: '0.7rem', background: 'rgba(10,132,255,0.15)', color: '#0a84ff', border: '0.5px solid rgba(10,132,255,0.3)', padding: '1px 7px', borderRadius: '8px', fontWeight: '750' }}>
                        累計: ${persCart.reduce((sum, item) => sum + item.amount, 0).toLocaleString()} TWD
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPersCart([])}
                      className="glass-btn glass-btn-danger"
                      style={{ padding: '2px 8px', fontSize: '0.7rem', borderRadius: '6px' }}
                    >
                      🗑️ 清空暫存
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {persCart.map((item, idx) => (
                      <div key={item.id || idx} style={{
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        borderRadius: '12px',
                        padding: '10px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                              fontSize: '0.9rem',
                              background: 'rgba(255,255,255,0.08)',
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}>
                              {item.cat.includes('餐') ? '🍲' : (item.cat.includes('購') ? '🛍️' : (item.cat.includes('娛') ? '🎮' : (item.cat.includes('固定') ? '📌' : '🏷️')))}
                            </span>
                            <div>
                              <div style={{ fontWeight: '750', fontSize: '0.84rem', color: '#fff' }}>
                                {item.cat}
                              </div>
                              <div style={{ fontSize: '0.66rem', color: 'var(--text-tertiary)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: '4px' }}>
                                  🏦 {item.accountNickname}
                                </span>
                                <span>• {item.date || txDate}</span>
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <strong style={{ fontSize: '0.9rem', color: '#fff' }}>
                              ${item.amount.toLocaleString()} TWD
                            </strong>
                            <button
                              type="button"
                              onClick={() => setPersCart(persCart.filter(i => i.id !== item.id))}
                              style={{
                                background: 'rgba(255,69,58,0.15)',
                                border: 'none',
                                color: '#ff453a',
                                width: '22px',
                                height: '22px',
                                borderRadius: '50%',
                                cursor: 'pointer',
                                fontSize: '0.76rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        {item.note && (
                          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', fontStyle: 'italic', paddingLeft: '36px' }}>
                            📝 {item.note}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
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

              {/* Apple-Style Inset Grouped Joint Expense Cart */}
              {jointCart.length > 0 && (
                <div style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '16px',
                  padding: '14px',
                  marginTop: '16px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.15)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.95rem' }}>🛒</span>
                      <span style={{ fontWeight: '800', fontSize: '0.86rem', color: '#fff' }}>
                        待確認共同支出 (<strong>{jointCart.length}</strong> 筆)
                      </span>
                      <span style={{ fontSize: '0.7rem', background: 'rgba(48,209,88,0.15)', color: '#30d158', border: '0.5px solid rgba(48,209,88,0.3)', padding: '1px 7px', borderRadius: '8px', fontWeight: '750' }}>
                        累計: ${jointCart.reduce((sum, item) => sum + item.amount, 0).toLocaleString()} TWD
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setJointCart([])}
                      className="glass-btn glass-btn-danger"
                      style={{ padding: '2px 8px', fontSize: '0.7rem', borderRadius: '6px' }}
                    >
                      🗑️ 清空暫存
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {jointCart.map((item, idx) => (
                      <div key={item.id || idx} style={{
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        borderRadius: '12px',
                        padding: '10px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                              fontSize: '0.9rem',
                              background: 'rgba(255,255,255,0.08)',
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}>
                              🏫
                            </span>
                            <div>
                              <div style={{ fontWeight: '750', fontSize: '0.84rem', color: '#fff' }}>
                                {item.cat}
                              </div>
                              <div style={{ fontSize: '0.66rem', color: 'var(--text-tertiary)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: '4px' }}>
                                  🏦 {item.accountNickname}
                                </span>
                                <span>• {item.date || txDate}</span>
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <strong style={{ fontSize: '0.9rem', color: '#fff' }}>
                              ${item.amount.toLocaleString()} TWD
                            </strong>
                            <button
                              type="button"
                              onClick={() => setJointCart(jointCart.filter(i => i.id !== item.id))}
                              style={{
                                background: 'rgba(255,69,58,0.15)',
                                border: 'none',
                                color: '#ff453a',
                                width: '22px',
                                height: '22px',
                                borderRadius: '50%',
                                cursor: 'pointer',
                                fontSize: '0.76rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        {item.note && (
                          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', fontStyle: 'italic', paddingLeft: '36px' }}>
                            📝 {item.note}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
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
                統一認列為「固定費用」。依使用者層級與【📌 固定金額 / 📊 變動金額】分類展示，支援自動與手動扣繳。
              </p>

              {combinedBills.length === 0 ? (
                <div className="inset-group-card" style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {(() => {
                    const owners = [
                      { key: userKey, title: userKey === 'userA' ? '🐕 大狗狗的常態帳單' : '🐶 阿陞的常態帳單', accentColor: '#0a84ff' },
                      { key: 'joint', title: '🏫 共同公費常態帳單', accentColor: '#30d158' },
                      { key: partnerKey, title: partnerKey === 'userA' ? '🐕 大狗狗的常態帳單' : '🐶 阿陞的常態帳單', accentColor: 'rgba(255,255,255,0.4)' },
                    ];

                    return owners.map(ownerSection => {
                      const ownerBills = combinedBills.filter(b => (b.owner || userKey) === ownerSection.key);
                      if (ownerBills.length === 0) return null;

                      const fixedBills = ownerBills.filter(b => b.isFixedAmount !== false);
                      const variableBills = ownerBills.filter(b => b.isFixedAmount === false);

                      const renderBillGroup = (billsList, groupTitle, groupIcon) => {
                        if (billsList.length === 0) return null;
                        return (
                          <div style={{ marginBottom: '10px' }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: '800', color: 'rgba(255,255,255,0.6)', marginBottom: '6px', paddingLeft: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span>{groupIcon}</span>
                              <span>{groupTitle}</span>
                              <span style={{ fontSize: '0.62rem', opacity: 0.5 }}>({billsList.length})</span>
                            </div>

                            <div className="inset-group-card">
                              {billsList.map(bill => {
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
                                    style={{
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: '6px',
                                      padding: '10px 14px 10px 12px',
                                      cursor: 'pointer',
                                      background: rowBg,
                                      borderLeft: rowBorderLeft,
                                      borderBottom: '0.5px solid rgba(255,255,255,0.06)',
                                      transition: 'all 0.2s ease',
                                      boxSizing: 'border-box'
                                    }}
                                  >
                                    {/* Line 1: Icon + Name (Left), Amount (Right) */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', width: '100%' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                                        <span style={{ fontSize: '1rem', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                                          {bill.icon || (isCc ? '💳' : (bill.isFixedAmount === false ? '📊' : '📌'))}
                                        </span>
                                        <span style={{ fontWeight: '750', fontSize: '0.88rem', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                          {bill.note || bill.category || bill.name}
                                        </span>
                                      </div>

                                      <strong style={{ color: isCc && bill.amount > 0 ? '#ffb94f' : '#fff', fontSize: '0.9rem', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                        ${(bill.amount || 0).toLocaleString()} {bill.currency || 'TWD'}
                                      </strong>
                                    </div>

                                    {/* Line 2: Date Subtext (Left), Status Badges (Right) */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', width: '100%' }}>
                                      <span style={{ fontSize: '0.66rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>
                                        扣繳日: 每月 {bill.date || (bill.nextDate ? new Date(bill.nextDate).getDate() : '')} 號 | 下次: {bill.nextDate}
                                      </span>

                                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
                                        {isCc ? (
                                          bill.autoPay ? (
                                            <span style={{ fontSize: '0.6rem', background: 'rgba(142,255,162,0.15)', color: '#8effa2', border: '0.5px solid rgba(142,255,162,0.3)', padding: '1px 5px', borderRadius: '4px', fontWeight: '700', whiteSpace: 'nowrap' }}>
                                              🤖 自動扣款 ({bill.linkedBankName})
                                            </span>
                                          ) : (
                                            <span style={{ fontSize: '0.6rem', background: 'rgba(255,185,79,0.15)', color: '#ffb94f', border: '0.5px solid rgba(255,185,79,0.3)', padding: '1px 5px', borderRadius: '4px', fontWeight: '700', whiteSpace: 'nowrap' }}>
                                              🖐️ 手動繳納
                                            </span>
                                          )
                                        ) : (
                                          <span style={{ fontSize: '0.6rem', background: bill.isFixedAmount === false ? 'rgba(0,122,255,0.15)' : 'rgba(48,209,88,0.15)', color: bill.isFixedAmount === false ? '#0a84ff' : '#30d158', border: '0.5px solid rgba(255,255,255,0.1)', padding: '1px 5px', borderRadius: '4px', fontWeight: '700', whiteSpace: 'nowrap' }}>
                                            {bill.isFixedAmount === false ? '📊 變動金額' : '📌 固定金額'}
                                          </span>
                                        )}

                                        {isCc && !bill.autoPay && diffDays <= 1 && (
                                          <span style={{ fontSize: '0.6rem', background: '#ff453a', color: '#fff', padding: '1px 5px', borderRadius: '4px', fontWeight: '800', whiteSpace: 'nowrap' }}>
                                            🚨 到期
                                          </span>
                                        )}
                                        {isCc && !bill.autoPay && diffDays > 1 && diffDays <= 3 && (
                                          <span style={{ fontSize: '0.6rem', background: '#ff9500', color: '#000', padding: '1px 5px', borderRadius: '4px', fontWeight: '800', whiteSpace: 'nowrap' }}>
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
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      };

                      return (
                        <div key={ownerSection.key} style={{
                          background: 'rgba(255,255,255,0.02)',
                          border: `1px solid ${ownerSection.accentColor}33`,
                          borderRadius: '14px',
                          padding: '12px 12px 4px 12px'
                        }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: '850', color: '#fff', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: '4px', height: '14px', background: ownerSection.accentColor, borderRadius: '2px' }} />
                            {ownerSection.title}
                          </div>

                          {renderBillGroup(fixedBills, '固定金額帳單', '📌')}
                          {renderBillGroup(variableBills, '變動金額帳單', '📊')}
                        </div>
                      );
                    });
                  })()}
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

            {/* Apple-Style Inset Grouped Income Cart */}
            {incomeCart.length > 0 && (
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '16px',
                padding: '14px',
                marginTop: '16px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.15)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.95rem' }}>🛒</span>
                    <span style={{ fontWeight: '800', fontSize: '0.86rem', color: '#fff' }}>
                      待確認收入入帳 (<strong>{incomeCart.length}</strong> 筆)
                    </span>
                    <span style={{ fontSize: '0.7rem', background: 'rgba(255,159,10,0.15)', color: '#ff9f0a', border: '0.5px solid rgba(255,159,10,0.3)', padding: '1px 7px', borderRadius: '8px', fontWeight: '750' }}>
                      累計: ${incomeCart.reduce((sum, item) => sum + item.amount, 0).toLocaleString()} TWD
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIncomeCart([])}
                    className="glass-btn glass-btn-danger"
                    style={{ padding: '2px 8px', fontSize: '0.7rem', borderRadius: '6px' }}
                  >
                    🗑️ 清空暫存
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {incomeCart.map((item, idx) => (
                    <div key={item.id || idx} style={{
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: '12px',
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            fontSize: '0.9rem',
                            background: 'rgba(255,255,255,0.08)',
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            💵
                          </span>
                          <div>
                            <div style={{ fontWeight: '750', fontSize: '0.84rem', color: '#fff' }}>
                              {item.cat}
                            </div>
                            <div style={{ fontSize: '0.66rem', color: 'var(--text-tertiary)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: '4px' }}>
                                🏦 {item.accountNickname}
                              </span>
                              <span>• {item.date || txDate}</span>
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <strong style={{ fontSize: '0.9rem', color: '#fff' }}>
                            ${item.amount.toLocaleString()} TWD
                          </strong>
                          <button
                            type="button"
                            onClick={() => setIncomeCart(incomeCart.filter(i => i.id !== item.id))}
                            style={{
                              background: 'rgba(255,69,58,0.15)',
                              border: 'none',
                              color: '#ff453a',
                              width: '22px',
                              height: '22px',
                              borderRadius: '50%',
                              cursor: 'pointer',
                              fontSize: '0.76rem',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {item.note && (
                        <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', fontStyle: 'italic', paddingLeft: '36px' }}>
                          📝 {item.note}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
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
        <div className="liquid-modal-overlay" onClick={() => setShowBillPayModal(false)} style={{ zIndex: 9999 }}>
          <div className="liquid-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px', width: '92%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: '20px 16px', boxSizing: 'border-box' }}>
            
            {/* Modal Header (Fixed) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexShrink: 0 }}>
              <div style={{ fontWeight: '850', fontSize: '1.1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>💳</span>
                <span>{selectedBill.isCreditCard ? '信用卡帳單劃撥繳納' : '繳納常態帳單'}</span>
              </div>
              <button onClick={() => setShowBillPayModal(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '1.4rem', cursor: 'pointer' }}>✕</button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '14px', touchAction: 'pan-y', overscrollBehavior: 'contain' }}>
              
              <div style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                您正準備繳納帳單【<strong>{selectedBill.note || selectedBill.category || selectedBill.name || '帳單'}</strong>】，應繳金額為 <strong style={{ color: '#fff' }}>${(selectedBill.amount || 0).toLocaleString()} {selectedBill.currency || 'TWD'}</strong>。
              </div>

              {!selectedBill.isCreditCard && (
                <div style={{ display: 'flex', gap: '8px' }}>
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
              )}

              <div>
                <label style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px', fontWeight: '700' }}>
                  {selectedBill.isCreditCard ? '請選擇劃撥沖銷之活儲/現金帳戶 (不可使用信用卡)' : '請選擇扣款支付帳戶'}
                </label>

                {renderAccountSelector(
                  (() => {
                    const isCcBill = selectedBill.isCreditCard || selectedBill.category === '信用卡帳單';
                    const currentAcc = accounts.find(a => a.id === billPayAccountId);
                    if (isCcBill && currentAcc && currentAcc.type === 'credit') {
                      const validAcc = accounts.find(a => a.type !== 'credit');
                      return validAcc ? validAcc.id : billPayAccountId;
                    }
                    return billPayAccountId;
                  })(),
                  setBillPayAccountId,
                  (acc) => {
                    if (selectedBill.isCreditCard || selectedBill.category === '信用卡帳單') {
                      return acc.type !== 'credit'; // Exclude credit cards completely!
                    }
                    return true;
                  },
                  'isDefaultExpense'
                )}

                {(() => {
                  const payAcc = accounts.find(a => a.id === billPayAccountId);
                  if (!payAcc) return null;
                  const isCc = payAcc.type === 'credit';
                  const amt = selectedBill.amount || 0;
                  return (
                    <div style={{
                      background: selectedBill.isCreditCard ? 'rgba(48,209,88,0.08)' : (isCc ? 'rgba(255,149,0,0.08)' : 'rgba(10,132,255,0.08)'),
                      border: `1px solid ${selectedBill.isCreditCard ? 'rgba(48,209,88,0.25)' : (isCc ? 'rgba(255,149,0,0.25)' : 'rgba(10,132,255,0.25)')}`,
                      borderRadius: '10px',
                      padding: '10px 12px',
                      marginTop: '12px',
                      fontSize: '0.76rem',
                      lineHeight: '1.45',
                      color: 'var(--text-secondary)'
                    }}>
                      <div style={{ fontWeight: '800', color: selectedBill.isCreditCard ? '#30d158' : (isCc ? '#ff9500' : '#0a84ff'), marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span>💡 會計效果與資產影響說明</span>
                      </div>
                      {selectedBill.isCreditCard ? (
                        <div>
                          使用 <strong>【{payAcc.nickname}】活儲劃撥</strong> 繳納信用卡帳單：
                          <br />
                          • 活儲餘額 <strong>-${amt.toLocaleString()}</strong> (真實現金流出)
                          <br />
                          • 信用卡負債 <strong>+${amt.toLocaleString()}</strong> (負債沖銷歸零/減少)
                          <br />
                          • 當月消費費用 <strong>+$0</strong> (消費已於刷卡當下即時認列，不重複計算費用)
                        </div>
                      ) : isCc ? (
                        <div>
                          使用 <strong>【{payAcc.nickname}】信用卡代扣</strong>：
                          <br />
                          • 本月固定費用 <strong>+${amt.toLocaleString()}</strong> (計入當月固定費用)
                          <br />
                          • 信用卡未結帳負債 <strong>+${amt.toLocaleString()}</strong> (活儲當下不扣款，直至卡費扣繳日自動劃撥沖銷)
                        </div>
                      ) : (
                        <div>
                          使用 <strong>【{payAcc.nickname}】活儲/現金扣款</strong>：
                          <br />
                          • 本月固定費用 <strong>+${amt.toLocaleString()}</strong> (計入當月固定費用)
                          <br />
                          • 活儲餘額 <strong>-${amt.toLocaleString()}</strong> (淨資產相應扣減)
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

            </div>

            {/* Modal Footer (Fixed) */}
            <div style={{ display: 'flex', gap: '10px', paddingTop: '14px', flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
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

      {/* EDIT / ADD REGULAR RECURRING BILL MODAL */}
      {showEditBillModal && createPortal(
        <div className="liquid-modal-overlay" onClick={() => setShowEditBillModal(false)} style={{ zIndex: 9998 }}>
          <div className="liquid-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px', width: '92%', maxHeight: '88vh', overflowY: 'auto', padding: '20px 16px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontWeight: '850', fontSize: '1.1rem', color: '#fff' }}>
                {editingBill ? '✏️ 編輯常態帳單' : '➕ 新增常態帳單'}
              </div>
              <button onClick={() => setShowEditBillModal(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>

            <div className="inset-group-card" style={{ marginBottom: '16px' }}>
              {/* Fixed vs Variable Toggle */}
              <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px', padding: '10px 14px' }}>
                <span className="inset-group-label" style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>📌 帳單金額屬性</span>
                  <button type="button" onClick={() => setHelpTooltipConfig({
                    title: "帳單金額屬性說明",
                    text: "📌 固定金額帳單（如房租、Netflix 訂閱）每月金額固定，到達認列日會精準扣繳與提示。\n\n📊 變動金額帳單（如水電瓦斯費、手機通訊費）到達認列日會提示您確認並輸入當月實際發票金額。"
                  })} style={{ background: 'none', border: 'none', color: '#0a84ff', padding: 0, cursor: 'pointer', fontSize: '0.82rem' }}>❓</button>
                </span>
                <SegmentedControl
                  options={[
                    { label: '📌 固定金額帳單', value: true },
                    { label: '📊 變動金額帳單', value: false }
                  ]}
                  value={isFixedAmount}
                  onChange={setIsFixedAmount}
                />
              </div>

              {/* Owner Segmented Control */}
              <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px', padding: '10px 14px' }}>
                <span className="inset-group-label" style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>👤 歸屬對象</span>
                  <button type="button" onClick={() => setHelpTooltipConfig({
                    title: "歸屬對象說明",
                    text: "標記此筆常態帳單屬於大狗狗個人、阿陞個人或是兩人共同公費。系統將依據歸屬對象進行分區展示與權限控管。"
                  })} style={{ background: 'none', border: 'none', color: '#0a84ff', padding: 0, cursor: 'pointer', fontSize: '0.82rem' }}>❓</button>
                </span>
                <SegmentedControl
                  options={[
                    { label: userKey === 'userA' ? '🐕 大狗狗' : '🐶 阿陞', value: userKey },
                    { label: '🏫 共同', value: 'joint' },
                    { label: partnerKey === 'userA' ? '🐕 大狗狗' : '🐶 阿陞', value: partnerKey }
                  ]}
                  value={billOwner}
                  onChange={setBillOwner}
                />
              </div>

              {/* Bill Name/Note */}
              <div className="inset-group-row" style={{ padding: '10px 14px', minHeight: '46px' }}>
                <span className="inset-group-label">📝 帳單名稱</span>
                <span className="inset-group-value" style={{ flex: 1, marginLeft: '16px' }}>
                  <input
                    type="text"
                    className="inset-group-input"
                    value={billNote}
                    onChange={(e) => setBillNote(e.target.value)}
                    placeholder="例如：房屋租金、電費、Netflix 訂閱"
                  />
                </span>
              </div>

              {/* Bill Amount */}
              <div className="inset-group-row" style={{ padding: '10px 14px', minHeight: '46px' }}>
                <span className="inset-group-label">{isFixedAmount ? '💵 每月金額' : '💵 預估金額'}</span>
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

              {/* Monthly Billing Day */}
              <div className="inset-group-row" style={{ padding: '10px 14px', minHeight: '46px' }}>
                <span className="inset-group-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>📅 每月扣繳/認列日</span>
                  <button type="button" onClick={() => setHelpTooltipConfig({
                    title: "每月扣繳/認列日說明",
                    text: "設定每月固定產生繳費提醒或自動劃撥扣款的日期 (1~28 日)。"
                  })} style={{ background: 'none', border: 'none', color: '#0a84ff', padding: 0, cursor: 'pointer', fontSize: '0.82rem' }}>❓</button>
                </span>
                <span className="inset-group-value" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>每月</span>
                  <input
                    type="number"
                    min="1"
                    max="28"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', textAlign: 'center', borderRadius: '6px', width: '45px', padding: '2px 4px', outline: 'none' }}
                    value={billingDay}
                    onChange={(e) => setBillingDay(Math.min(28, Math.max(1, parseInt(e.target.value) || 1)))}
                  />
                  <span>號</span>
                </span>
              </div>

              {/* Reminder Advance Days */}
              <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px', padding: '10px 14px' }}>
                <span className="inset-group-label" style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>🔔 到期前提醒天數</span>
                  <button type="button" onClick={() => setHelpTooltipConfig({
                    title: "到期前提醒天數說明",
                    text: "在帳單到期日前 N 天，App 會開始在帳單清單頂部高亮提示並傳送推播通知提醒您繳納。"
                  })} style={{ background: 'none', border: 'none', color: '#0a84ff', padding: 0, cursor: 'pointer', fontSize: '0.82rem' }}>❓</button>
                </span>
                <SegmentedControl
                  options={[
                    { label: '1 天前', value: 1 },
                    { label: '3 天前', value: 3 },
                    { label: '5 天前', value: 5 },
                    { label: '7 天前', value: 7 }
                  ]}
                  value={reminderDays}
                  onChange={setReminderDays}
                />
              </div>

              {/* Default Linked Payment Account */}
              <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px', padding: '10px 14px' }}>
                <span className="inset-group-label" style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>💳 預設扣款/代扣帳戶 (選填)</span>
                  <button type="button" onClick={() => setHelpTooltipConfig({
                    title: "預設扣款帳戶說明",
                    text: "設定此帳單預設扣款/代扣帳戶。\n• 若選擇活儲/現金：繳款時直接扣減該帳戶餘額。\n• 若選擇信用卡代扣：將自動處理為信用卡負債與費用，於卡費扣繳日由活儲劃撥沖銷，絕不重複計入費用。"
                  })} style={{ background: 'none', border: 'none', color: '#0a84ff', padding: 0, cursor: 'pointer', fontSize: '0.82rem' }}>❓</button>
                </span>
                {renderAccountSelector(billDefaultAccountId, setBillDefaultAccountId, () => true, 'isDefaultExpense')}
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

      {/* DEDICATED CREDIT CARD BILL MANAGEMENT MODAL */}
      {showCreditCardModal && selectedCcBill && createPortal(
        <div className="liquid-modal-overlay" onClick={() => setShowCreditCardModal(false)} style={{ zIndex: 9999 }}>
          <div className="liquid-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px', width: '92%', maxHeight: '88vh', overflowY: 'auto', padding: '20px 16px', boxSizing: 'border-box' }}>
            
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ fontWeight: '850', fontSize: '1.1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>💳</span>
                <span>{selectedCcBill.rawAccount.nickname} 信用卡帳單專區</span>
              </div>
              <button onClick={() => setShowCreditCardModal(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '1.4rem', cursor: 'pointer' }}>✕</button>
            </div>

            {/* Credit Card Detail Card */}
            <div className="inset-group-card" style={{ marginBottom: '14px', padding: '14px', background: 'rgba(255,255,255,0.03)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-tertiary)' }}>📊 本期未結算/待繳金額</span>
                <strong style={{ fontSize: '1.15rem', color: selectedCcBill.amount > 0 ? '#ffb94f' : '#8effa2' }}>
                  ${(selectedCcBill.amount || 0).toLocaleString()} {selectedCcBill.currency}
                </strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.78rem' }}>
                <span style={{ color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>📅 每月帳單出帳日</span>
                  <button type="button" onClick={() => setHelpTooltipConfig({
                    title: "帳單結帳/出帳日說明",
                    text: "結帳日是計算當期應繳總金額的時間基準點。\n在結帳日前刷卡消費時，金額已即時認列為當月消費費用，並增加信用卡負債。\n到達結帳日當天，系統將結帳日前所有刷卡金額彙整封裝為『本期帳單應繳總金額』，絕不重複扣款。"
                  })} style={{ background: 'none', border: 'none', color: '#0a84ff', padding: 0, cursor: 'pointer', fontSize: '0.8rem' }}>❓</button>
                </span>
                <span style={{ color: '#fff', fontWeight: '600' }}>每月 {selectedCcBill.rawAccount.billingDay || 10} 號</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.78rem' }}>
                <span style={{ color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>⏰ 繳費截止日</span>
                  <button type="button" onClick={() => setHelpTooltipConfig({
                    title: "繳費截止日說明",
                    text: "繳費截止日是活儲實際劃撥沖銷信用卡負債的時間點。\n劃撥扣繳時：活儲 -$X，信用卡負債 +$X (沖銷歸零)，當月費用 +$0 (避免重複計算)。"
                  })} style={{ background: 'none', border: 'none', color: '#0a84ff', padding: 0, cursor: 'pointer', fontSize: '0.8rem' }}>❓</button>
                </span>
                <span style={{ color: selectedCcBill.diffDays <= 3 ? '#ff453a' : '#fff', fontWeight: '700' }}>
                  {selectedCcBill.nextDate} (離到期剩 {selectedCcBill.diffDays} 天)
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>🤖 扣繳方式與狀態</span>
                  <button type="button" onClick={() => setHelpTooltipConfig({
                    title: "扣繳方式說明",
                    text: "自動扣繳：系統將於每月扣繳日自動從指定活儲劃撥結清。\n手動劃撥：需於網銀繳款後，在 App 中點擊『確定劃撥繳清』發起金額沖銷。"
                  })} style={{ background: 'none', border: 'none', color: '#0a84ff', padding: 0, cursor: 'pointer', fontSize: '0.8rem' }}>❓</button>
                </span>
                <span style={{
                  fontSize: '0.7rem',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  fontWeight: '750',
                  background: selectedCcBill.autoPay ? 'rgba(48,209,88,0.15)' : 'rgba(255,185,79,0.15)',
                  color: selectedCcBill.autoPay ? '#30d158' : '#ffb94f',
                  border: `0.5px solid ${selectedCcBill.autoPay ? 'rgba(48,209,88,0.3)' : 'rgba(255,185,79,0.3)'}`
                }}>
                  {selectedCcBill.autoPay ? `🤖 自動扣繳 (${selectedCcBill.linkedBankName})` : '🖐️ 手動劃撥繳納'}
                </span>
              </div>
            </div>

            {/* Real-World Synchronization Alert Box */}
            <div style={{
              background: selectedCcBill.autoPay ? 'rgba(48,209,88,0.08)' : 'rgba(255,185,79,0.08)',
              border: `1px solid ${selectedCcBill.autoPay ? 'rgba(48,209,88,0.25)' : 'rgba(255,185,79,0.25)'}`,
              borderRadius: '12px',
              padding: '12px 14px',
              marginBottom: '16px',
              fontSize: '0.76rem',
              lineHeight: '1.5',
              color: 'var(--text-secondary)'
            }}>
              <div style={{ fontWeight: '800', color: selectedCcBill.autoPay ? '#30d158' : '#ffb94f', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span>💡 真實現實同步提醒與會計原則</span>
              </div>
              {selectedCcBill.autoPay ? (
                <div>
                  ⚠️ App 已開啟<strong>「自動扣繳」</strong>，將於出帳日自動將【{selectedCcBill.linkedBankName}】劃撥至信用卡沖銷負債。<br />
                  <strong>請務必確認</strong>：<br />
                  1. 您已向發卡銀行開通實體帳戶自動扣繳。<br />
                  2. 扣繳日當天【{selectedCcBill.linkedBankName}】活儲餘額足夠。
                </div>
              ) : (
                <div>
                  🖐️ 本卡片為<strong>「手動劃撥模式」</strong>。<br />
                  當您在網路銀行完成轉帳繳費後，請點擊下方【🚀 提前手動劃撥繳清】，App 資料庫才會將活儲與信用卡負債同步沖銷更新！
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  setShowCreditCardModal(false);
                  if (onNavigateTab) onNavigateTab('accounts');
                }}
                className="glass-btn"
                style={{ width: '100%', padding: '10px 0', fontSize: '0.8rem', borderRadius: '10px' }}
              >
                ⚙️ 至「帳戶管理」修改此信用卡扣繳設定
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setShowCreditCardModal(false)} className="glass-btn" style={{ flex: 1, padding: '10px 0', borderRadius: '10px' }}>關閉</button>
                <button
                  type="button"
                  onClick={() => {
                    const b = selectedCcBill;
                    setShowCreditCardModal(false);
                    setSelectedBill(b);
                    if (!billPayAccountId && accounts.length > 0) {
                      const linkedAcc = b.linkedBankAccountId ? accounts.find(a => a.id === b.linkedBankAccountId) : null;
                      const defaultAcc = linkedAcc || accounts.find(a => a.owner === userKey && a.isDefaultExpense) || accounts[0];
                      if (defaultAcc) setBillPayAccountId(defaultAcc.id);
                    }
                    setShowBillPayModal(true);
                  }}
                  className="glass-btn primary-gradient-btn"
                  style={{ flex: 2, padding: '10px 0', borderRadius: '10px', fontWeight: '800' }}
                >
                  🚀 提前手動劃撥繳清
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* PRE-SUBMISSION CONFIRMATION MODAL */}
      {pendingSubmitConfig && createPortal(
        <div className="liquid-modal-overlay" onClick={() => setPendingSubmitConfig(null)} style={{ zIndex: 10000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
          <div className="liquid-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px', width: '92%', maxHeight: '88vh', display: 'flex', flexDirection: 'column', padding: '20px 18px', boxSizing: 'border-box', background: 'rgba(28,28,30,0.96)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 24px 48px rgba(0,0,0,0.6)', borderRadius: '20px' }}>
            
            {/* Modal Header (Fixed) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexShrink: 0 }}>
              <div style={{ fontWeight: '850', fontSize: '1.1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🚀</span>
                <span>{pendingSubmitConfig.typeTitle || '確認送出記帳明細'}</span>
              </div>
              <button onClick={() => setPendingSubmitConfig(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '1.3rem', cursor: 'pointer' }}>✕</button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '14px', touchAction: 'pan-y' }}>
              
              {/* Operator & Date Info Card */}
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <div>👤 記帳操作者：<strong style={{ color: '#fff' }}>{pendingSubmitConfig.operator}</strong></div>
                <div>📅 入帳日期：<strong style={{ color: '#fff' }}>{pendingSubmitConfig.txDate}</strong></div>
              </div>

              {/* Account Balance Changes Card */}
              {pendingSubmitConfig.accountChanges && pendingSubmitConfig.accountChanges.length > 0 && (
                <div style={{ background: 'rgba(10,132,255,0.06)', border: '1px solid rgba(10,132,255,0.2)', borderRadius: '12px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: '800', color: '#0a84ff', marginBottom: '8px' }}>
                    💡 預期帳戶餘額變動對比：
                  </div>
                  {pendingSubmitConfig.accountChanges.map((acc, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', padding: '4px 0', borderBottom: idx < pendingSubmitConfig.accountChanges.length - 1 ? '0.5px solid rgba(255,255,255,0.05)' : 'none' }}>
                      <span style={{ color: '#fff', fontWeight: '700' }}>🏦 {acc.nickname}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        ${acc.oldBal.toLocaleString()} ➔ <strong style={{ color: acc.diff < 0 ? '#ffb94f' : '#8effa2' }}>${acc.newBal.toLocaleString()}</strong> ({acc.diff > 0 ? `+$${acc.diff.toLocaleString()}` : `-$${Math.abs(acc.diff).toLocaleString()}`})
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Itemized Items Breakdown */}
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: '800', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>
                  🛒 即將寫入資料庫之項目 (共 {pendingSubmitConfig.items.length} 筆)：
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {pendingSubmitConfig.items.map((item, idx) => (
                    <div key={idx} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: '750', fontSize: '0.84rem', color: '#fff' }}>
                          {item.cat || '項目'} {item.note ? `• ${item.note}` : ''}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                          扣款/存入帳戶: {item.accountNickname}
                        </div>
                      </div>

                      <strong style={{ fontSize: '0.92rem', color: '#fff' }}>
                        ${item.amount.toLocaleString()} TWD
                      </strong>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Modal Footer (Fixed) */}
            <div style={{ display: 'flex', gap: '10px', paddingTop: '14px', flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: '12px' }}>
              <button onClick={() => setPendingSubmitConfig(null)} className="glass-btn" style={{ flex: 1, padding: '10px 0', borderRadius: '10px' }}>
                ✏️ 返回修改
              </button>
              <button
                onClick={() => {
                  const cfg = pendingSubmitConfig;
                  setPendingSubmitConfig(null);
                  if (cfg.onConfirm) cfg.onConfirm();
                }}
                className="glass-btn primary-gradient-btn"
                style={{ flex: 2, padding: '10px 0', borderRadius: '10px', fontWeight: '800' }}
              >
                🚀 確定寫入資料庫
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}

      {/* REUSABLE HELP TOOLTIP MICRO-POPOVER MODAL */}
      {helpTooltipConfig && createPortal(
        <div className="liquid-modal-overlay" onClick={() => setHelpTooltipConfig(null)} style={{ zIndex: 10000, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
          <div className="liquid-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '360px', width: '88%', padding: '20px 18px', textAlign: 'left', background: 'rgba(28,28,30,0.96)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)', borderRadius: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ fontWeight: '850', fontSize: '1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '1.1rem' }}>❓</span>
                <span>{helpTooltipConfig.title}</span>
              </div>
              <button onClick={() => setHelpTooltipConfig(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '18px', whiteSpace: 'pre-line' }}>
              {helpTooltipConfig.text}
            </div>

            <button onClick={() => setHelpTooltipConfig(null)} className="glass-btn primary-gradient-btn" style={{ width: '100%', padding: '8px 0', borderRadius: '10px', fontWeight: '750', fontSize: '0.84rem' }}>
              我知道了
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ExpenseEntry;