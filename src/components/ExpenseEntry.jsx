// src/components/ExpenseEntry.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import SegmentedControl from './SegmentedControl';
import ErrorBoundary from './ErrorBoundary';
import IOSAccountMenuPicker from './IOSAccountMenuPicker';
import { logger } from '../utils/logger';

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
  onTransaction,
  currentUser,
  operatorName,
  currentFxRate = 32.0,
  customAlert,
  customConfirm,
  getBudgetProgressText,
  onNavigateTab
}) => {
  const accounts = useMemo(() => assets?.accounts || [], [assets?.accounts]);
  const loggedInUserName = operatorName || currentUser || "系統";
  const userKey = loggedInUserName.includes('大狗狗') ? 'userA' : 'userB';
  const partnerKey = userKey === 'userA' ? 'userB' : 'userA';
  const expenseCategories = useMemo(() => assets?.config?.categories || ["餐費", "購物", "娛樂", "其他"], [assets?.config?.categories]);
  const incomeCategories = ["薪資", "獎金", "投資", "其他"];

  const categoryOptions = useMemo(() => expenseCategories.map(cat => ({ label: cat, value: cat })), [expenseCategories]);

  const [entryMode, setEntryMode] = useState('expense'); // 'expense', 'income', 'transfer', 'exchange'
  const [activeTab, setActiveTab] = useState('personal'); // 'personal', 'joint', 'bills'
  const [incomeTab, setIncomeTab] = useState('personal'); // 'personal', 'joint'

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
  }, [accounts, jointAccountId]);

  // ==========================================
  // 3. Income States
  // ==========================================
  const [incCat, setIncCat] = useState(incomeCategories[0]);
  const [incAmount, setIncAmount] = useState('');
  const [incNote, setIncNote] = useState('');
  const [incAccountId, setIncAccountId] = useState('');
  const [incomeCart, setIncomeCart] = useState([]);

  const lastUserKeyIncRef = useRef(userKey);

  // Auto pre-select default account for income (Option A: Strict personal vs joint separation)
  useEffect(() => {
    const isUserChanged = lastUserKeyIncRef.current !== userKey;
    lastUserKeyIncRef.current = userKey;

    if (incomeTab === 'joint') {
      const currentAcc = accounts.find(a => a.id === incAccountId);
      if (!currentAcc || currentAcc.owner !== 'joint' || currentAcc.type === 'credit') {
        const jointAcc = accounts.find(a => a.owner === 'joint' && a.type !== 'credit' && a.isDefaultIncome) ||
          accounts.find(a => a.owner === 'joint' && a.type !== 'credit');
        if (jointAcc) {
          setIncAccountId(jointAcc.id);
        }
      }
    } else {
      const currentAcc = accounts.find(a => a.id === incAccountId);
      if (!currentAcc || currentAcc.owner !== userKey || currentAcc.type === 'credit' || isUserChanged) {
        const defaultInc = accounts.find(a => a.owner === userKey && a.type !== 'credit' && a.isDefaultIncome) ||
          accounts.find(a => a.owner === userKey && a.type !== 'credit');
        if (defaultInc) {
          setIncAccountId(defaultInc.id);
        }
      }
    }
  }, [accounts, userKey, incomeTab, incAccountId]);

  // ==========================================
  // 4. Transfer (劃撥) States
  // ==========================================
  const [tfSource, setTfSource] = useState('');
  const [tfTarget, setTfTarget] = useState('');
  const [tfAmount, setTfAmount] = useState('');
  const [tfTargetAmount, setTfTargetAmount] = useState('');
  const [tfNote, setTfNote] = useState('');
  const [tfDate, setTfDate] = useState(new Date().toISOString().split('T')[0]);

  // Auto pre-select default transfer accounts
  useEffect(() => {
    if (accounts.length >= 2) {
      if (!tfSource) {
        const myBank = accounts.find(a => a.owner === userKey && (a.type === 'bank' || a.type === 'cash')) || accounts[0];
        if (myBank) setTfSource(myBank.id);
      }
      if (!tfTarget) {
        const otherBank = accounts.find(a => (a.owner === 'joint' || a.owner === partnerKey) && a.id !== tfSource) || accounts.find(a => a.id !== tfSource) || accounts[1];
        if (otherBank) setTfTarget(otherBank.id);
      }
    }
  }, [accounts, userKey, partnerKey, tfSource, tfTarget]);

  // ==========================================
  // 5. Exchange (換匯) States
  // ==========================================
  const [exSource, setExSource] = useState('');
  const [exTarget, setExTarget] = useState('');
  const [exSourceAmount, setExSourceAmount] = useState('');
  const [exTargetAmount, setExTargetAmount] = useState('');
  const [exNote, setExNote] = useState('');
  const [exDate, setExDate] = useState(new Date().toISOString().split('T')[0]);

  // Auto pre-select default exchange accounts
  useEffect(() => {
    if (accounts.length >= 2) {
      if (!exSource) {
        const twdAcc = accounts.find(a => a.currency === 'TWD' && (a.owner === userKey || a.owner === 'joint')) || accounts[0];
        if (twdAcc) setExSource(twdAcc.id);
      }
      if (!exTarget) {
        const usdAcc = accounts.find(a => a.currency === 'USD') || accounts.find(a => a.id !== exSource) || accounts[1];
        if (usdAcc) setExTarget(usdAcc.id);
      }
    }
  }, [accounts, userKey, exSource, exTarget]);

  const handleExSourceAmountChange = (valStr) => {
    setExSourceAmount(formatInputMoney(valStr));
    const num = parseMoney(valStr);
    if (num > 0 && exSource && exTarget) {
      const sAcc = accounts.find(a => a.id === exSource);
      const tAcc = accounts.find(a => a.id === exTarget);
      const rate = currentFxRate || 32.0;
      if (sAcc && tAcc && sAcc.currency !== tAcc.currency) {
        if (sAcc.currency === 'USD' && tAcc.currency === 'TWD') {
          setExTargetAmount(formatInputMoney(Math.round(num * rate).toString()));
        } else if (sAcc.currency === 'TWD' && tAcc.currency === 'USD') {
          setExTargetAmount(formatInputMoney((num / rate).toFixed(2)));
        }
      }
    }
  };

  // ==========================================
  // 6. Bills States & Handlers
  // ==========================================
  const [showBillPayModal, setShowBillPayModal] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);
  const [billPayAccountId, setBillPayAccountId] = useState('');

  const [showCreditCardModal, setShowCreditCardModal] = useState(false);
  const [selectedCcBill, setSelectedCcBill] = useState(null);
  const [reconcileAmountInput, setReconcileAmountInput] = useState('');
  const [selectedTxKeys, setSelectedTxKeys] = useState(new Set());
  const [showDirectCalibration, setShowDirectCalibration] = useState(false);
  const [directCalibrateInput, setDirectCalibrateInput] = useState('');
  const [helpTooltipConfig, setHelpTooltipConfig] = useState(null);
  const [pendingSubmitConfig, setPendingSubmitConfig] = useState(null);

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
    if (onTransaction) {
      onTransaction(finalAssets, []);
    } else if (setAssets) {
      setAssets(finalAssets);
    }
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
    if (onTransaction) {
      onTransaction(finalAssets, []);
    } else if (setAssets) {
      setAssets(finalAssets);
    }
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

    // Check if this submission is a multi-item cart batch
    const isBatch = finalItems.length > 1;
    const batchId = isBatch ? `batch_${Date.now()}_${Math.random().toString(36).substr(2, 5)}` : undefined;
    const batchTotal = isBatch ? finalItems.reduce((s, i) => s + i.amount, 0) : undefined;
    const batchItems = isBatch ? finalItems.map(i => ({ cat: i.cat, amount: i.amount, note: i.note, accountNickname: i.accountNickname })) : undefined;

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
        necessity: 'need',
        batchId,
        batchCount: isBatch ? finalItems.length : undefined,
        batchIndex: isBatch ? (idx + 1) : undefined,
        batchTotal,
        batchItems
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
        setPersAccountId('');
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

    // Check if this submission is a multi-item cart batch
    const isBatch = finalItems.length > 1;
    const batchId = isBatch ? `batch_${Date.now()}_${Math.random().toString(36).substr(2, 5)}` : undefined;
    const batchTotal = isBatch ? finalItems.reduce((s, i) => s + i.amount, 0) : undefined;
    const batchItems = isBatch ? finalItems.map(i => ({ cat: i.cat, amount: i.amount, note: i.note, accountNickname: i.accountNickname })) : undefined;

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
        subCategory: item.cat,
        batchId,
        batchCount: isBatch ? finalItems.length : undefined,
        batchIndex: isBatch ? (idx + 1) : undefined,
        batchTotal,
        batchItems
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
        setJointAccountId('');
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
    if (!acc) {
      await customAlert("找不到指定的存入帳戶！");
      return;
    }
    if (incomeTab === 'joint' && acc.owner !== 'joint') {
      await customAlert("⚠️ 共同公費入帳必須存入【共同公費帳戶】！");
      return;
    }
    if (incomeTab === 'personal' && acc.owner !== userKey) {
      await customAlert("⚠️ 個人收入請存入您的【個人專屬帳戶】！");
      return;
    }

    const payload = {
      id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      cat: incCat,
      amount: parsedAmount,
      note: incNote.trim(),
      accountId: incAccountId,
      accountNickname: acc.nickname,
      incomeScope: incomeTab,
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
      if (!acc) {
        await customAlert("找不到指定的存入帳戶！");
        return;
      }
      if (incomeTab === 'joint' && acc.owner !== 'joint') {
        await customAlert("⚠️ 共同公費入帳必須存入【共同公費帳戶】！");
        return;
      }
      if (incomeTab === 'personal' && acc.owner !== userKey) {
        await customAlert("⚠️ 個人收入請存入您的【個人專屬帳戶】！");
        return;
      }
      finalItems.push({
        id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        cat: incCat,
        amount: parsedAmount,
        note: incNote.trim(),
        accountId: incAccountId,
        accountNickname: acc.nickname,
        incomeScope: incomeTab,
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

    // Check if this submission is a multi-item cart batch
    const isBatch = finalItems.length > 1;
    const batchId = isBatch ? `batch_${Date.now()}_${Math.random().toString(36).substr(2, 5)}` : undefined;
    const batchTotal = isBatch ? finalItems.reduce((s, i) => s + i.amount, 0) : undefined;
    const batchItems = isBatch ? finalItems.map(i => ({ cat: i.cat, amount: i.amount, note: i.note, accountNickname: i.accountNickname })) : undefined;

    // Create income record list
    const newIncomes = finalItems.map((item, idx) => ({
      date: item.date || txDate,
      month: (item.date || txDate).slice(0, 7),
      type: 'income',
      category: item.cat,
      total: item.amount,
      payer: (item.incomeScope || incomeTab) === 'joint' ? '共同帳戶' : loggedInUserName,
      accountId: item.accountId,
      operator: loggedInUserName,
      note: item.note || item.cat,
      incomeScope: item.incomeScope || incomeTab,
      timestamp: new Date().toISOString(),
      batchId,
      batchCount: isBatch ? finalItems.length : undefined,
      batchIndex: isBatch ? (idx + 1) : undefined,
      batchTotal,
      batchItems
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

  // ==========================================
  // Transfer (資金劃撥) Submission
  // ==========================================
  const handleExecuteTransfer = async () => {
    if (!tfSource || !tfTarget || !tfAmount) {
      await customAlert("請選擇轉出帳戶、轉入帳戶並填寫劃撥金額！");
      return;
    }
    const sellVal = parseMoney(tfAmount);
    if (sellVal <= 0) {
      await customAlert("劃撥金額必須大於 0！");
      return;
    }
    if (tfSource === tfTarget) {
      await customAlert("轉出與轉入帳戶不能相同！");
      return;
    }

    const srcAcc = accounts.find(a => a.id === tfSource);
    const tgtAcc = accounts.find(a => a.id === tfTarget);

    if (!srcAcc || !tgtAcc) {
      await customAlert("找不到指定的帳戶！");
      return;
    }

    if (srcAcc.type !== 'credit' && srcAcc.balance < sellVal) {
      await customAlert(`❌ 轉出帳戶【${srcAcc.nickname}】餘額不足！`);
      return;
    }

    const isCrossCurrency = srcAcc.currency !== tgtAcc.currency;
    let buyVal = sellVal;
    let impliedRateText = "";

    if (isCrossCurrency) {
      buyVal = parseMoney(tfTargetAmount);
      if (buyVal <= 0) {
        await customAlert("跨幣別劃撥時，轉入金額必須大於 0！");
        return;
      }
      const rate = srcAcc.currency === 'TWD' ? (sellVal / buyVal) : (buyVal / sellVal);
      impliedRateText = ` (匯率 1 USD = ${rate.toFixed(4)} TWD)`;
    }

    const updatedAccounts = accounts.map(a => {
      if (a.id === tfSource) return { ...a, balance: a.balance - sellVal };
      if (a.id === tfTarget) return { ...a, balance: a.balance + buyVal };
      return a;
    });

    const historyTotal = srcAcc.currency === 'TWD' ? sellVal : Math.round(buyVal * (currentFxRate || 32.0));

    const txRecord = {
      date: tfDate,
      month: tfDate.slice(0, 7),
      type: 'transfer',
      category: '資產劃撥',
      total: historyTotal,
      sourceAmount: sellVal,
      targetAmount: buyVal,
      payer: loggedInUserName,
      accountId: tfSource,
      targetAccountId: tfTarget,
      operator: loggedInUserName,
      note: tfNote.trim() || `資金劃撥: ${srcAcc.nickname} ➔ ${tgtAcc.nickname}${impliedRateText}`,
      timestamp: new Date().toISOString()
    };

    onTransaction({ ...assets, accounts: updatedAccounts }, txRecord);
    await customAlert(`🎉 資金劃撥成功！\n【${srcAcc.nickname}】➔【${tgtAcc.nickname}】$${sellVal.toLocaleString()} ${srcAcc.currency}`);
    setTfAmount('');
    setTfTargetAmount('');
    setTfNote('');
  };

  // ==========================================
  // Exchange (貨幣換匯) Submission
  // ==========================================
  const handleExecuteExchange = async () => {
    if (!exSource || !exTarget || !exSourceAmount || !exTargetAmount) {
      await customAlert("請選擇帳戶並填寫換匯金額！");
      return;
    }
    const sellVal = parseMoney(exSourceAmount);
    const buyVal = parseMoney(exTargetAmount);

    if (sellVal <= 0 || buyVal <= 0) {
      await customAlert("換匯金額必須大於 0！");
      return;
    }

    const srcAcc = accounts.find(a => a.id === exSource);
    const tgtAcc = accounts.find(a => a.id === exTarget);

    if (!srcAcc || !tgtAcc) {
      await customAlert("找不到指定的帳戶！");
      return;
    }

    if (srcAcc.type !== 'credit' && srcAcc.balance < sellVal) {
      await customAlert(`❌ 轉出帳戶【${srcAcc.nickname}】餘額不足！`);
      return;
    }
    if (srcAcc.currency === tgtAcc.currency) {
      await customAlert(`❌ 相同的貨幣無須換匯，請改用「資金劃撥」功能！`);
      return;
    }

    const updatedAccounts = accounts.map(a => {
      if (a.id === exSource) return { ...a, balance: a.balance - sellVal };
      if (a.id === exTarget) return { ...a, balance: a.balance + buyVal };
      return a;
    });

    const twdVal = srcAcc.currency === 'TWD' ? sellVal : buyVal;
    const usdVal = srcAcc.currency === 'USD' ? sellVal : buyVal;

    const txRecord = {
      date: exDate,
      month: exDate.slice(0, 7),
      type: 'exchange',
      category: '貨幣換匯',
      total: twdVal,
      usdAmount: usdVal,
      sourceAmount: sellVal,
      targetAmount: buyVal,
      payer: loggedInUserName,
      accountId: exSource,
      targetAccountId: exTarget,
      operator: loggedInUserName,
      note: exNote.trim() || `換匯: ${srcAcc.nickname} ➔ ${tgtAcc.nickname} (售出 $${sellVal.toLocaleString()} ${srcAcc.currency} / 買入 $${buyVal.toLocaleString()} ${tgtAcc.currency})`,
      timestamp: new Date().toISOString()
    };

    onTransaction({ ...assets, accounts: updatedAccounts }, txRecord);
    await customAlert(`🎉 外幣換匯成功！\n售出【${srcAcc.nickname}】$${sellVal.toLocaleString()} ${srcAcc.currency}\n買入【${tgtAcc.nickname}】$${buyVal.toLocaleString()} ${tgtAcc.currency}`);
    setExSourceAmount('');
    setExTargetAmount('');
    setExNote('');
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

    if (onTransaction) {
      onTransaction(finalAssets, []); // Trigger cloud save
    } else if (setAssets) {
      setAssets(finalAssets);
    }
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
    const regularBills = (assets?.bills || [])
      .filter(Boolean)
      .map(b => ({ ...b, isCreditCard: false }));
    return [...regularBills, ...(creditCardBills || [])].sort((a, b) => {
      const dA = a?.nextDate ? new Date(a.nextDate).getTime() : 0;
      const dB = b?.nextDate ? new Date(b.nextDate).getTime() : 0;
      return (isNaN(dA) ? 0 : dA) - (isNaN(dB) ? 0 : dB);
    });
  }, [assets?.bills, creditCardBills]);

  // --- Unpaid Credit Card Transactions Query ---
  const unpaidCardTransactions = useMemo(() => {
    if (!selectedCcBill?.creditCardAccountId) return [];
    const cardId = selectedCcBill.creditCardAccountId;
    return (assets?.monthlyExpenses || [])
      .filter(r => !r.isDeleted && r.accountId === cardId && !r.ccBillSettled && r.type !== 'transfer')
      .map((r, index) => {
        const amt = Math.abs(Number(r.total) || 0);
        return {
          ...r,
          _amt: amt,
          _uniqueKey: r.id || `${r.timestamp || r.date || 'tx'}_${amt}_${r.category || ''}_${r.note || ''}_${index}`
        };
      })
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }, [assets?.monthlyExpenses, selectedCcBill]);

  // --- Smart Subset-Sum Reconciliation Solver ---
  const smartMatchResult = useMemo(() => {
    const rawVal = reconcileAmountInput.trim();
    if (!rawVal) return { status: 'idle', selectedSet: new Set(), matchedSum: 0, diff: 0, count: 0 };
    const target = parseMoney(rawVal);
    if (target <= 0) return { status: 'idle', selectedSet: new Set(), matchedSum: 0, diff: 0, count: 0 };

    const items = unpaidCardTransactions;
    if (!items || items.length === 0) return { status: 'no_match', selectedSet: new Set(), matchedSum: 0, diff: target, count: 0 };

    // 1. Prefix check (Time-sequential order)
    let runningSum = 0;
    const prefixSet = new Set();
    for (const it of items) {
      runningSum += it._amt;
      prefixSet.add(it._uniqueKey);
      if (runningSum === target) {
        return { status: 'exact_prefix', selectedSet: prefixSet, matchedSum: runningSum, diff: 0, count: prefixSet.size };
      }
    }

    // 2. Subset sum recursion
    const validItems = items.slice(0, 45);
    const exactSubsets = [];
    const findSubsets = (index, currentSum, currentSubset) => {
      if (currentSum === target) {
        exactSubsets.push([...currentSubset]);
        return;
      }
      if (index >= validItems.length || currentSum > target || exactSubsets.length > 5) return;
      const item = validItems[index];
      const val = item._amt;
      if (currentSum + val <= target) {
        currentSubset.push(item);
        findSubsets(index + 1, currentSum + val, currentSubset);
        currentSubset.pop();
      }
      findSubsets(index + 1, currentSum, currentSubset);
    };
    findSubsets(0, 0, []);

    if (exactSubsets.length === 1) {
      const sSet = new Set(exactSubsets[0].map(it => it._uniqueKey));
      return { status: 'exact_subset', selectedSet: sSet, matchedSum: target, diff: 0, count: sSet.size };
    } else if (exactSubsets.length > 1) {
      const commonKeys = exactSubsets[0].filter(it => 
        exactSubsets.every(sub => sub.some(s => s._uniqueKey === it._uniqueKey))
      ).map(it => it._uniqueKey);
      return { status: 'ambiguous', selectedSet: new Set(commonKeys), matchedSum: target, diff: 0, candidateSubsets: exactSubsets, count: exactSubsets[0].length };
    }

    // 3. Closest subset within tolerance <= $30
    let bestSubset = [];
    let minDiff = Infinity;
    const findClosest = (index, currentSum, currentSubset) => {
      const diff = Math.abs(currentSum - target);
      if (diff < minDiff) {
        minDiff = diff;
        bestSubset = [...currentSubset];
      }
      if (index >= validItems.length || currentSum > target + 50) return;
      const item = validItems[index];
      const val = item._amt;
      currentSubset.push(item);
      findClosest(index + 1, currentSum + val, currentSubset);
      currentSubset.pop();
      findClosest(index + 1, currentSum, currentSubset);
    };
    findClosest(0, 0, []);

    if (minDiff <= 30 && bestSubset.length > 0) {
      const bestSum = bestSubset.reduce((s, it) => s + it._amt, 0);
      return { status: 'small_diff', selectedSet: new Set(bestSubset.map(it => it._uniqueKey)), matchedSum: bestSum, diff: target - bestSum, count: bestSubset.length };
    }

    return { status: 'no_match', selectedSet: new Set(), matchedSum: 0, diff: target, count: 0 };
  }, [reconcileAmountInput, unpaidCardTransactions]);

  const handleCardClick = async (bill) => {
    if (bill.isCreditCard) {
      setSelectedCcBill(bill);
      setShowDirectCalibration(false);
      const cardDebt = Math.abs(bill.rawAccount?.balance || bill.amount || 0);
      setDirectCalibrateInput(String(cardDebt));

      const cardExpenses = (assets?.monthlyExpenses || [])
        .filter(r => !r.isDeleted && r.accountId === bill.creditCardAccountId && !r.ccBillSettled && r.type !== 'transfer')
        .map((r, index) => {
          const amt = Math.abs(Number(r.total) || 0);
          return {
            ...r,
            _amt: amt,
            _uniqueKey: r.id || `${r.timestamp || r.date || 'tx'}_${amt}_${r.category || ''}_${r.note || ''}_${index}`
          };
        });

      const totalUnpaid = cardExpenses.reduce((s, r) => s + r._amt, 0);
      setReconcileAmountInput(totalUnpaid > 0 ? String(totalUnpaid) : '');
      setSelectedTxKeys(new Set(cardExpenses.map(r => r._uniqueKey)));

      // Pre-select paying bank account
      const linkedAcc = bill.linkedBankAccountId ? accounts.find(a => a.id === bill.linkedBankAccountId) : null;
      const defaultAcc = linkedAcc || accounts.find(a => a.owner === userKey && a.type !== 'credit' && a.isDefaultExpense) || accounts.find(a => a.type !== 'credit') || accounts[0];
      if (defaultAcc) setBillPayAccountId(defaultAcc.id);

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

  const handleExecuteCreditCardSettlement = async (paymentAmount, options = {}) => {
    if (!selectedCcBill) return;
    const creditAccId = selectedCcBill.creditCardAccountId;
    const creditAcc = accounts.find(a => a.id === creditAccId);
    const payingBankAcc = accounts.find(a => a.id === billPayAccountId);

    if (!creditAcc || !payingBankAcc) {
      await customAlert?.("❌ 請先選擇有效的扣款活儲帳戶！", "錯誤");
      return;
    }

    if (payingBankAcc.type !== 'credit' && payingBankAcc.balance < paymentAmount) {
      await customAlert(`❌ 帳戶【${payingBankAcc.nickname}】餘額不足以支付 $${paymentAmount.toLocaleString()}！\n目前餘額為: $${payingBankAcc.balance.toLocaleString()}`, "餘額不足");
      return;
    }

    const { calibrationDiff = 0, customNote = '' } = options;
    const totalCreditCardDeduct = paymentAmount + calibrationDiff;

    const statementId = `stmt_${Date.now()}`;
    const targetTimestamp = new Date().toISOString();
    const txDate = targetTimestamp.split('T')[0];

    const updatedAccounts = accounts.map(a => {
      if (a.id === billPayAccountId) return { ...a, balance: a.balance - paymentAmount };
      if (a.id === creditAccId) return { ...a, balance: a.balance + totalCreditCardDeduct };
      return a;
    });

    const selectedKeysSet = new Set(selectedTxKeys);
    const settledUniqueKeys = new Set(
      unpaidCardTransactions.filter(r => selectedKeysSet.has(r._uniqueKey)).map(r => r._uniqueKey)
    );

    const updatedExpenses = (assets.monthlyExpenses || []).map((r, index) => {
      const amt = Math.abs(Number(r.total) || 0);
      const uKey = r.id || `${r.timestamp || r.date || 'tx'}_${amt}_${r.category || ''}_${r.note || ''}_${index}`;
      if (!r.isDeleted && r.accountId === creditAccId && settledUniqueKeys.has(uKey)) {
        return {
          ...r,
          ccBillSettled: true,
          ccStatementId: statementId
        };
      }
      return r;
    });

    const diffNote = calibrationDiff !== 0 ? ` (微差校正: ${calibrationDiff > 0 ? '+' : ''}$${calibrationDiff})` : '';
    const txRecord = {
      date: txDate,
      month: txDate.slice(0, 7),
      type: 'transfer',
      category: '信用卡帳單',
      total: paymentAmount,
      sourceAmount: paymentAmount,
      targetAmount: totalCreditCardDeduct,
      calibrationDiff: calibrationDiff,
      statementId: statementId,
      settledItemCount: settledUniqueKeys.size,
      payer: payingBankAcc.owner === 'joint' ? '共同帳戶' : (payingBankAcc.owner === 'userA' ? '大狗狗🐕' : '阿陞🐶'),
      accountId: billPayAccountId,
      targetAccountId: creditAccId,
      note: customNote || `💳 信用卡帳單結清: ${creditAcc.nickname} (自 ${payingBankAcc.nickname} 劃撥，沖銷 ${settledUniqueKeys.size} 筆)${diffNote}`,
      timestamp: targetTimestamp
    };

    const finalAssets = {
      ...assets,
      accounts: updatedAccounts,
      monthlyExpenses: [...updatedExpenses, txRecord]
    };

    setShowCreditCardModal(false);
    logger.addLog('TRANSACTION', `信用卡結算完成: ${creditAcc.nickname} 劃撥 $${paymentAmount} (沖銷 ${settledUniqueKeys.size} 筆)`, { statementId, calibrationDiff });
    
    if (onTransaction) {
      onTransaction(finalAssets, txRecord);
    } else if (setAssets) {
      setAssets(finalAssets);
    }

    await customAlert?.(`🎉 信用卡【${creditAcc.nickname}】已成功自【${payingBankAcc.nickname}】劃撥繳納 $${paymentAmount.toLocaleString()} TWD！\n共沖銷 ${settledUniqueKeys.size} 筆刷卡明細。`, "劃撥結清成功");
  };

  const handleExecuteDirectCalibration = async () => {
    if (!selectedCcBill) return;
    const card = accounts.find(a => a.id === selectedCcBill.creditCardAccountId);
    if (!card) return;

    const rawVal = directCalibrateInput.trim();
    if (!rawVal || isNaN(Number(rawVal))) {
      await customAlert?.("請輸入有效的未繳金額數字！", "格式錯誤");
      return;
    }

    const targetDebt = Math.abs(Number(rawVal));
    const newBalance = -targetDebt;
    const diff = newBalance - (Number(card.balance) || 0);

    if (diff === 0) {
      await customAlert?.("輸入之金額與目前 App 紀錄一致，無需調整。", "提示");
      setShowDirectCalibration(false);
      return;
    }

    const updatedAccounts = accounts.map(a => a.id === card.id ? { ...a, balance: newBalance } : a);
    const txRecord = {
      date: new Date().toISOString().split('T')[0],
      month: new Date().toISOString().slice(0, 7),
      type: 'calibrate',
      category: '餘額校正',
      total: Math.abs(diff),
      payer: card.nickname,
      accountId: card.id,
      twdDiff: diff,
      note: `⚖️ 信用卡餘額直接校正: ${card.nickname} (${card.balance} ➔ ${newBalance})`,
      timestamp: new Date().toISOString()
    };

    setShowDirectCalibration(false);
    setShowCreditCardModal(false);

    logger.addLog('TRANSACTION', `信用卡餘額直接校正: ${card.nickname} (${card.balance} ➔ ${newBalance})`, { targetDebt, diff });

    if (onTransaction) onTransaction({ ...assets, accounts: updatedAccounts }, txRecord);
    else if (setAssets) setAssets({ ...assets, accounts: updatedAccounts });

    await customAlert?.(`✅ 信用卡【${card.nickname}】餘額已成功直接校正為 -$${targetDebt.toLocaleString()} TWD！`, "校正完成");
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
          {entryMode === 'expense' && '快速記錄個人與共同支出明細'}
          {entryMode === 'income' && '登記薪資、獎金與各項入帳'}
          {entryMode === 'transfer' && '帳戶間同幣別與跨幣別資金調撥'}
          {entryMode === 'exchange' && '台幣與外幣即時匯率換匯登記'}
        </p>

        {/* Dynamic Budget Text Progress */}
        {entryMode === 'expense' && (
          <div style={{ marginTop: '14px', fontSize: '0.78rem', background: 'rgba(255,255,255,0.06)', padding: '8px 12px', borderRadius: '8px', border: '0.5px solid rgba(255,255,255,0.1)', color: '#fff' }}>
            📊 {getBudgetProgressText()?.text || ""}
          </div>
        )}
      </div>

      {/* Main Tab Controls: 4-in-1 MOZE System */}
      <div style={{ padding: '0 4px', marginBottom: '16px' }}>
        <SegmentedControl
          options={[
            { label: '💸 支出', value: 'expense', activeColor: '#0a84ff' },
            { label: '💰 收入', value: 'income', activeColor: '#30d158' },
            { label: '🔄 劃撥', value: 'transfer', activeColor: '#bf5af2' },
            { label: '💱 換匯', value: 'exchange', activeColor: '#ff9f0a' },
          ]}
          value={entryMode}
          onChange={(val) => setEntryMode(val)}
        />
      </div>

      {/* ========================================== */}
      {/* MODE 1: EXPENSE SYSTEM */}
      {/* ========================================== */}
      {entryMode === 'expense' && (
        <div className="slide-in">
          {/* Sub Navigation */}
          <div style={{ padding: '0 4px', marginBottom: '16px' }}>
            <SegmentedControl
              options={[
                { label: '👤 個人記帳', value: 'personal', activeColor: '#0a84ff' },
                { label: '🤝 共同記帳', value: 'joint', activeColor: '#30d158' },
                { label: `📅 帳單 ${safeBills.some(b => isApproaching(b.nextDate)) ? '⚠️' : ''}`, value: 'bills', activeColor: '#ffd60a' },
              ]}
              value={activeTab}
              onChange={setActiveTab}
            />
          </div>

          {/* Sub Tab: Personal Expense */}
          {activeTab === 'personal' && (
            <div className={`glass-card ${userKey === 'userA' ? 'expense-mode-glow-purple' : 'expense-mode-glow-green'}`} style={{ padding: '20px 18px' }}>
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
                  <SegmentedControl options={categoryOptions} value={persCat} onChange={setPersCat} activeColor={userKey === 'userA' ? '#AF52DE' : '#30D158'} />
                </div>

                {/* Account (iOS UIMenu Context Menu Picker) */}
                <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                  <IOSAccountMenuPicker
                    label="💳 扣款帳戶 (個人)"
                    accounts={accounts}
                    selectedValue={persAccountId}
                    onChange={setPersAccountId}
                    currentUser={loggedInUserName}
                    themeColor="#0a84ff"
                    modalTitle="選擇個人扣款帳戶"
                  />
                </div>

                {/* Amount */}
                <div className="inset-group-row">
                  <span className="inset-group-label">💵 金額</span>
                  <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                    <input type="text" inputMode="numeric" className="inset-group-input tabular-nums" value={persAmount} onChange={(e) => setPersAmount(formatInputMoney(e.target.value))} placeholder="$0" style={{ fontSize: '1.2rem', fontWeight: '800' }} />
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

              {/* Distinct Personal Reminder Banner (Placed above Submit Button for Maximum Visibility) */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(10,132,255,0.18), rgba(10,132,255,0.06))',
                border: '1px solid rgba(10,132,255,0.3)',
                borderRadius: '14px',
                padding: '12px 14px',
                marginTop: '16px',
                marginBottom: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <span style={{ fontSize: '1.4rem' }}>👤</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: '850', fontSize: '0.92rem', color: '#0a84ff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>【個人支出】</span>
                    <span style={{ fontSize: '0.62rem', background: '#0a84ff', color: '#fff', padding: '1px 5px', borderRadius: '4px', fontWeight: '700' }}>私有</span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', marginTop: '2px', lineHeight: '1.4' }}>
                    此為個人私有支出，僅從個人帳戶扣款。
                  </div>
                </div>
              </div>

              <button onClick={handlePersSubmit} className="glass-btn primary-gradient-btn" style={{ width: '100%', height: '44px', borderRadius: '12px', marginTop: '10px', fontWeight: '800' }}>
                🚀 確定送出記帳
              </button>
            </div>
          )}

          {/* Sub Tab: Joint Expense */}
          {activeTab === 'joint' && (
            <div className="glass-card expense-mode-glow-blue" style={{ padding: '20px 18px' }}>
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
                  <SegmentedControl options={categoryOptions} value={jointCat} onChange={setJointCat} activeColor="#007AFF" />
                </div>

                {/* Account (iOS UIMenu Context Menu Picker) */}
                <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                  <IOSAccountMenuPicker
                    label="💳 共同扣款 / 代墊帳戶"
                    accounts={accounts}
                    selectedValue={jointAccountId}
                    onChange={setJointAccountId}
                    currentUser={loggedInUserName}
                    themeColor="#30d158"
                    modalTitle="選擇共同支付或代墊帳戶"
                  />
                </div>

                {/* Amount */}
                <div className="inset-group-row">
                  <span className="inset-group-label">💵 金額</span>
                  <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                    <input type="text" inputMode="numeric" className="inset-group-input tabular-nums" value={jointAmount} onChange={(e) => setJointAmount(formatInputMoney(e.target.value))} placeholder="$0" style={{ fontSize: '1.2rem', fontWeight: '800' }} />
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

              {/* Distinct Joint Reminder Banner (Placed above Submit Button for Maximum Visibility) */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(48,209,88,0.18), rgba(48,209,88,0.06))',
                border: '1px solid rgba(48,209,88,0.3)',
                borderRadius: '14px',
                padding: '12px 14px',
                marginTop: '16px',
                marginBottom: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <span style={{ fontSize: '1.4rem' }}>🏫</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: '850', fontSize: '0.92rem', color: '#30d158', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>【共同公費支出】</span>
                    <span style={{ fontSize: '0.62rem', background: '#30d158', color: '#000', padding: '1px 5px', borderRadius: '4px', fontWeight: '800' }}>公費</span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.75)', marginTop: '2px', lineHeight: '1.4' }}>
                    ⚠️ <strong>注意：</strong>正在紀錄共同支出。若選擇個人帳戶支付將列為<strong>「個人代墊款」</strong>並計入代墊未結。
                  </div>
                </div>
              </div>

              <button onClick={handleJointSubmit} className="glass-btn primary-gradient-btn" style={{ width: '100%', height: '44px', borderRadius: '12px', marginTop: '10px', fontWeight: '800' }}>
                🚀 確定送出記帳
              </button>
            </div>
          )}

          {/* Sub Tab: Bills */}
          {activeTab === 'bills' && (
            <ErrorBoundary title="📅 常態與信用卡帳單管理模組異常">
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

                {(!combinedBills || combinedBills.length === 0) ? (
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
                      try {
                        const normalizeOwner = (owner) => {
                          if (!owner) return userKey;
                          const o = String(owner).toLowerCase();
                          if (o === 'usera' || o.includes('大狗狗') || o.includes('user_a')) return 'userA';
                          if (o === 'userb' || o.includes('阿陞') || o.includes('user_b')) return 'userB';
                          if (o === 'joint' || o.includes('共同')) return 'joint';
                          return userKey;
                        };

                        const renderBillGroup = (billsList, groupTitle, groupIcon) => {
                          if (!billsList || billsList.length === 0) return null;
                          return (
                            <div style={{ marginBottom: '10px' }}>
                              <div style={{ fontSize: '0.72rem', fontWeight: '800', color: 'rgba(255,255,255,0.6)', marginBottom: '6px', paddingLeft: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span>{groupIcon}</span>
                                <span>{groupTitle}</span>
                                <span style={{ fontSize: '0.62rem', opacity: 0.5 }}>({billsList.length})</span>
                              </div>

                              <div className="inset-group-card">
                                {billsList.map((bill, idx) => {
                                  if (!bill) return null;
                                  const isNear = bill.nextDate ? isApproaching(bill.nextDate) : false;
                                  const isCc = !!bill.isCreditCard;
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

                                  const displayAmount = (typeof bill.amount === 'number' && !isNaN(bill.amount))
                                    ? bill.amount
                                    : Number(bill.amount) || 0;

                                  return (
                                    <div
                                      key={bill.id || `bill_${idx}`}
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
                                            {bill.note || bill.category || bill.name || '帳單明細'}
                                          </span>
                                        </div>

                                        <strong style={{ color: isCc && displayAmount > 0 ? '#ffb94f' : '#fff', fontSize: '0.9rem', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                          ${displayAmount.toLocaleString()} {bill.currency || 'TWD'}
                                        </strong>
                                      </div>

                                      {/* Line 2: Date Subtext (Left), Status Badges (Right) */}
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', width: '100%' }}>
                                        <span style={{ fontSize: '0.66rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>
                                          扣繳日: 每月 {bill.date || (bill.nextDate && !isNaN(new Date(bill.nextDate).getTime()) ? new Date(bill.nextDate).getDate() : '')} 號 | 下次: {bill.nextDate || '未定'}
                                        </span>

                                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
                                          {isCc ? (
                                            bill.autoPay ? (
                                              <span style={{ fontSize: '0.6rem', background: 'rgba(142,255,162,0.15)', color: '#8effa2', border: '0.5px solid rgba(142,255,162,0.3)', padding: '1px 5px', borderRadius: '4px', fontWeight: '700', whiteSpace: 'nowrap' }}>
                                                🤖 自動扣款 ({bill.linkedBankName || '活儲'})
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

                        const owners = [
                          { key: userKey, title: userKey === 'userA' ? '🐕 大狗狗的常態帳單' : '🐶 阿陞的常態帳單', accentColor: '#0a84ff' },
                          { key: 'joint', title: '🏫 共同公費常態帳單', accentColor: '#30d158' },
                          { key: partnerKey, title: partnerKey === 'userA' ? '🐕 大狗狗的常態帳單' : '🐶 阿陞的常態帳單', accentColor: 'rgba(255,255,255,0.4)' },
                        ];

                        const renderedSections = owners.map(ownerSection => {
                          const ownerBills = combinedBills.filter(b => b && normalizeOwner(b.owner) === ownerSection.key);
                          if (ownerBills.length === 0) return null;

                          const fixedBills = ownerBills.filter(b => b.isFixedAmount !== false);
                          const variableBills = ownerBills.filter(b => b.isFixedAmount === false);

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
                        }).filter(Boolean);

                        if (renderedSections.length === 0) {
                          const fixedBills = combinedBills.filter(b => b && b.isFixedAmount !== false);
                          const variableBills = combinedBills.filter(b => b && b.isFixedAmount === false);
                          return (
                            <div style={{
                              background: 'rgba(255,255,255,0.02)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              borderRadius: '14px',
                              padding: '12px 12px 4px 12px'
                            }}>
                              <div style={{ fontSize: '0.82rem', fontWeight: '850', color: '#fff', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ width: '4px', height: '14px', background: '#0a84ff', borderRadius: '2px' }} />
                                📋 所有常態與信用卡帳單
                              </div>
                              {renderBillGroup(fixedBills, '固定金額帳單', '📌')}
                              {renderBillGroup(variableBills, '變動金額帳單', '📊')}
                            </div>
                          );
                        }

                        return renderedSections;
                      } catch (err) {
                        console.error("Error inside combinedBills rendering:", err);
                        return (
                          <div style={{ padding: '16px', color: '#ff9500', textAlign: 'center', fontSize: '0.8rem' }}>
                            ⚠️ 載入帳單列表時發生錯誤：{err.message}
                          </div>
                        );
                      }
                    })()}
                  </div>
                )}
              </div>
            </ErrorBoundary>
          )}
        </div>
      )}

      {/* ========================================== */}
      {/* MODE 2: INCOME SYSTEM */}
      {/* ========================================== */}
      {entryMode === 'income' && (
        <div className="slide-in">
          {/* Sub Navigation for Income */}
          <div style={{ padding: '0 4px', marginBottom: '16px' }}>
            <SegmentedControl
              options={[
                { label: '👤 個人收入', value: 'personal', activeColor: '#0a84ff' },
                { label: '🤝 共同入帳', value: 'joint', activeColor: '#30d158' },
              ]}
              value={incomeTab}
              onChange={(newTab) => {
                setIncomeTab(newTab);
                if (newTab === 'joint') {
                  const jointAcc = accounts.find(a => a.owner === 'joint' && a.type !== 'credit' && a.isDefaultIncome) ||
                    accounts.find(a => a.owner === 'joint' && a.type !== 'credit');
                  if (jointAcc) setIncAccountId(jointAcc.id);
                } else {
                  const persAcc = accounts.find(a => a.owner === userKey && a.type !== 'credit' && a.isDefaultIncome) ||
                    accounts.find(a => a.owner === userKey && a.type !== 'credit');
                  if (persAcc) setIncAccountId(persAcc.id);
                }
              }}
            />
          </div>

          <div className={`glass-card ${incomeTab === 'joint' ? 'expense-mode-glow-blue' : (userKey === 'userA' ? 'expense-mode-glow-purple' : 'expense-mode-glow-green')}`} style={{ padding: '20px 18px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>💰 {incomeTab === 'personal' ? '個人收入入帳' : '共同公費入帳'}</span>
            </h3>

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
                  activeColor={incomeTab === 'joint' ? '#30d158' : '#0a84ff'}
                />
              </div>

              {/* Account (iOS UIMenu Context Menu Picker - Filtered strictly by incomeTab) */}
              <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                <IOSAccountMenuPicker
                  label={incomeTab === 'joint' ? "🏫 存入帳戶 (限共同公費帳戶)" : `💳 存入帳戶 (${loggedInUserName} 個人專屬)`}
                  accounts={accounts}
                  selectedValue={incAccountId}
                  onChange={setIncAccountId}
                  filterFn={a => a.type !== 'credit' && (incomeTab === 'joint' ? a.owner === 'joint' : a.owner === userKey)}
                  currentUser={loggedInUserName}
                  themeColor={incomeTab === 'joint' ? '#30d158' : '#0a84ff'}
                  modalTitle={incomeTab === 'joint' ? "選擇共同公費存入帳戶" : "選擇個人存入帳戶"}
                />
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
                    <span style={{ fontSize: '0.7rem', background: 'rgba(48,209,88,0.15)', color: '#30d158', border: '0.5px solid rgba(48,209,88,0.3)', padding: '1px 7px', borderRadius: '8px', fontWeight: '750' }}>
                      累計: ${incomeCart.reduce((sum, item) => sum + item.amount, 0).toLocaleString()} TWD
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIncomeCart([])}
                    className="glass-btn glass-btn-danger"
                    style={{ padding: '4px 8px', fontSize: '0.72rem', borderRadius: '8px' }}
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

            {/* Distinct Income Reminder Banner */}
            <div style={{
              background: incomeTab === 'joint'
                ? 'linear-gradient(135deg, rgba(48,209,88,0.18), rgba(48,209,88,0.06))'
                : 'linear-gradient(135deg, rgba(10,132,255,0.18), rgba(10,132,255,0.06))',
              border: incomeTab === 'joint'
                ? '1px solid rgba(48,209,88,0.3)'
                : '1px solid rgba(10,132,255,0.3)',
              borderRadius: '14px',
              padding: '12px 14px',
              marginTop: '16px',
              marginBottom: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <span style={{ fontSize: '1.4rem' }}>{incomeTab === 'joint' ? '🏫' : '👤'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: '850', fontSize: '0.92rem', color: incomeTab === 'joint' ? '#30d158' : '#0a84ff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>{incomeTab === 'joint' ? '【共同公費入帳】' : `【${loggedInUserName} 個人專屬收入】`}</span>
                  <span style={{ fontSize: '0.62rem', background: incomeTab === 'joint' ? '#30d158' : '#0a84ff', color: incomeTab === 'joint' ? '#000' : '#fff', padding: '1px 5px', borderRadius: '4px', fontWeight: '800' }}>
                    {incomeTab === 'joint' ? '公費' : '私有'}
                  </span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', marginTop: '2px', lineHeight: '1.4' }}>
                  {incomeTab === 'joint'
                    ? '💡 此款項將直接存入「共同公費帳戶」，作為兩人共同公積金與開銷儲備。'
                    : '💡 此為個人私有收入，僅存入個人私有帳戶，作為個人資產。'}
                </div>
              </div>
            </div>

            <button onClick={handleIncomeSubmit} className="glass-btn primary-gradient-btn" style={{ width: '100%', height: '44px', borderRadius: '12px', marginTop: '10px', fontWeight: '800' }}>
              🚀 確定送出記帳
            </button>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODE 3: TRANSFER (資金劃撥) SYSTEM */}
      {/* ========================================== */}
      {entryMode === 'transfer' && (
        <div className="slide-in">
          <div className="glass-card expense-mode-glow-purple" style={{ padding: '20px 18px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🔄 帳戶資金劃撥</span>
            </h3>

            <div className="inset-group-card">
              {/* Date */}
              <div className="inset-group-row">
                <span className="inset-group-label">📅 劃撥日期</span>
                <span className="inset-group-value">
                  <input type="date" style={{ background: 'none', border: 'none', color: '#fff', textAlign: 'right', outline: 'none' }} value={tfDate} onChange={(e) => setTfDate(e.target.value)} />
                </span>
              </div>

              {/* Source Account */}
              <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                <IOSAccountMenuPicker
                  label="📤 轉出帳戶"
                  accounts={accounts}
                  selectedValue={tfSource}
                  onChange={setTfSource}
                  currentUser={loggedInUserName}
                  themeColor="#bf5af2"
                  modalTitle="選擇轉出帳戶"
                />
              </div>

              {/* Target Account */}
              <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                <IOSAccountMenuPicker
                  label="📥 轉入帳戶"
                  accounts={accounts}
                  selectedValue={tfTarget}
                  onChange={setTfTarget}
                  filterFn={a => a.id !== tfSource}
                  currentUser={loggedInUserName}
                  themeColor="#bf5af2"
                  modalTitle="選擇轉入帳戶"
                />
              </div>

              {/* Amount */}
              <div className="inset-group-row">
                <span className="inset-group-label">💵 劃撥金額</span>
                <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="inset-group-input tabular-nums"
                    value={tfAmount}
                    onChange={(e) => setTfAmount(formatInputMoney(e.target.value))}
                    placeholder="$0"
                    style={{ fontSize: '1.2rem', fontWeight: '800' }}
                  />
                </span>
              </div>

              {/* Cross-Currency Target Amount if needed */}
              {(() => {
                const sAcc = accounts.find(a => a.id === tfSource);
                const tAcc = accounts.find(a => a.id === tfTarget);
                if (sAcc && tAcc && sAcc.currency !== tAcc.currency) {
                  return (
                    <div className="inset-group-row">
                      <span className="inset-group-label">💱 轉入金額 ({tAcc.currency})</span>
                      <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="inset-group-input tabular-nums"
                          value={tfTargetAmount}
                          onChange={(e) => setTfTargetAmount(formatInputMoney(e.target.value))}
                          placeholder={`轉入 ${tAcc.currency} 金額`}
                          style={{ fontSize: '1.1rem', fontWeight: '750', color: '#bf5af2' }}
                        />
                      </span>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Note */}
              <div className="inset-group-row">
                <span className="inset-group-label">📝 備註 (選填)</span>
                <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                  <input
                    type="text"
                    className="inset-group-input"
                    value={tfNote}
                    onChange={(e) => setTfNote(e.target.value)}
                    placeholder="例如：生活費提撥、存款移轉"
                  />
                </span>
              </div>
            </div>

            <button
              onClick={handleExecuteTransfer}
              className="glass-btn primary-gradient-btn"
              style={{
                width: '100%',
                height: '44px',
                borderRadius: '12px',
                marginTop: '16px',
                fontWeight: '800',
                background: 'linear-gradient(135deg, #bf5af2, #9933cc)'
              }}
            >
              🚀 執行資金劃撥
            </button>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODE 4: EXCHANGE (貨幣換匯) SYSTEM */}
      {/* ========================================== */}
      {entryMode === 'exchange' && (
        <div className="slide-in">
          <div className="glass-card expense-mode-glow-orange" style={{ padding: '20px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>💱 外幣換匯登錄</span>
              </h3>
              <span style={{ fontSize: '0.72rem', color: '#ff9f0a', background: 'rgba(255,159,10,0.12)', border: '0.5px solid rgba(255,159,10,0.3)', padding: '2px 8px', borderRadius: '6px', fontWeight: '700' }}>
                1 USD ≈ {currentFxRate || 32.0} TWD
              </span>
            </div>

            <div className="inset-group-card">
              {/* Date */}
              <div className="inset-group-row">
                <span className="inset-group-label">📅 換匯日期</span>
                <span className="inset-group-value">
                  <input type="date" style={{ background: 'none', border: 'none', color: '#fff', textAlign: 'right', outline: 'none' }} value={exDate} onChange={(e) => setExDate(e.target.value)} />
                </span>
              </div>

              {/* Sell Source Account */}
              <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                <IOSAccountMenuPicker
                  label="📤 售出 (轉出) 帳戶"
                  accounts={accounts}
                  selectedValue={exSource}
                  onChange={setExSource}
                  currentUser={loggedInUserName}
                  themeColor="#ff9f0a"
                  modalTitle="選擇售出帳戶"
                />
              </div>

              {/* Buy Target Account */}
              <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                <IOSAccountMenuPicker
                  label="📥 買入 (轉入) 帳戶"
                  accounts={accounts}
                  selectedValue={exTarget}
                  onChange={setExTarget}
                  filterFn={a => a.id !== exSource}
                  currentUser={loggedInUserName}
                  themeColor="#ff9f0a"
                  modalTitle="選擇買入帳戶"
                />
              </div>

              {/* Sell Amount */}
              <div className="inset-group-row">
                <span className="inset-group-label">
                  💵 售出金額 {(() => {
                    const s = accounts.find(a => a.id === exSource);
                    return s ? `(${s.currency})` : '';
                  })()}
                </span>
                <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="inset-group-input tabular-nums"
                    value={exSourceAmount}
                    onChange={(e) => handleExSourceAmountChange(e.target.value)}
                    placeholder="$0"
                    style={{ fontSize: '1.2rem', fontWeight: '800' }}
                  />
                </span>
              </div>

              {/* Buy Amount */}
              <div className="inset-group-row">
                <span className="inset-group-label">
                  💵 買入金額 {(() => {
                    const t = accounts.find(a => a.id === exTarget);
                    return t ? `(${t.currency})` : '';
                  })()}
                </span>
                <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="inset-group-input tabular-nums"
                    value={exTargetAmount}
                    onChange={(e) => setExTargetAmount(formatInputMoney(e.target.value))}
                    placeholder="$0"
                    style={{ fontSize: '1.2rem', fontWeight: '800', color: '#ff9f0a' }}
                  />
                </span>
              </div>

              {/* Note */}
              <div className="inset-group-row">
                <span className="inset-group-label">📝 備註 (選填)</span>
                <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                  <input
                    type="text"
                    className="inset-group-input"
                    value={exNote}
                    onChange={(e) => setExNote(e.target.value)}
                    placeholder="例如：線上換匯買入美金"
                  />
                </span>
              </div>
            </div>

            <button
              onClick={handleExecuteExchange}
              className="glass-btn primary-gradient-btn"
              style={{
                width: '100%',
                height: '44px',
                borderRadius: '12px',
                marginTop: '16px',
                fontWeight: '800',
                background: 'linear-gradient(135deg, #ff9f0a, #e08800)'
              }}
            >
              💱 執行外幣換匯
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
                <IOSAccountMenuPicker
                  label={selectedBill.isCreditCard ? "請選擇劃撥沖銷之活儲/現金帳戶 (不可使用信用卡)" : "請選擇扣款支付帳戶"}
                  accounts={accounts}
                  selectedValue={billPayAccountId}
                  onChange={setBillPayAccountId}
                  filterFn={(acc) => {
                    if (selectedBill.isCreditCard || selectedBill.category === '信用卡帳單') {
                      return acc.type !== 'credit';
                    }
                    return true;
                  }}
                  currentUser={loggedInUserName}
                  themeColor="#ffd60a"
                  modalTitle="選擇繳費扣款帳戶"
                />

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
                <IOSAccountMenuPicker
                  accounts={accounts}
                  selectedValue={billDefaultAccountId}
                  onChange={setBillDefaultAccountId}
                  currentUser={loggedInUserName}
                  themeColor="#0a84ff"
                  placeholder="選擇預設扣款/代扣帳戶 (選填)"
                  modalTitle="選擇帳單預設扣款帳戶"
                />
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

      {/* DEDICATED CREDIT CARD BILL MANAGEMENT MODAL WITH SMART RECONCILIATION */}
      {showCreditCardModal && selectedCcBill && createPortal(
        <div className="liquid-modal-overlay" onClick={() => setShowCreditCardModal(false)} style={{ zIndex: 9999 }}>
          <div
            className="liquid-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '460px',
              width: '94%',
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
              padding: '16px 14px',
              boxSizing: 'border-box',
              overflow: 'hidden',
              gap: '0px'
            }}
          >

            {/* Fixed Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
              <div style={{ fontWeight: '850', fontSize: '1.05rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>💳</span>
                <span>{selectedCcBill?.rawAccount?.nickname || selectedCcBill?.name || '信用卡'} 智慧帳單對帳與結清</span>
              </div>
              <button onClick={() => setShowCreditCardModal(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '1.4rem', cursor: 'pointer', padding: '0 4px' }}>✕</button>
            </div>

            {/* Scrollable Modal Content */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px 2px' }}>

              {/* Card Summary Inset */}
              <div className="inset-group-card" style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>📊 目前未結算刷卡負債</span>
                  <strong style={{ fontSize: '1.18rem', color: (selectedCcBill?.amount || 0) > 0 ? '#ffb94f' : '#8effa2' }}>
                    -${(selectedCcBill?.amount || 0).toLocaleString()} {selectedCcBill?.currency || 'TWD'}
                  </strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                  <span>📅 出帳日: <strong>每月 {selectedCcBill?.rawAccount?.billingDay || 10} 號</strong></span>
                  <span>⏰ 到期: <strong>{selectedCcBill?.nextDate} (剩 {selectedCcBill?.diffDays} 天)</strong></span>
                  <span>{selectedCcBill?.autoPay ? '🤖 自動扣繳' : '🖐️ 手動劃撥'}</span>
                </div>
              </div>

              {/* Direct Calibration Interactive Panel */}
              {showDirectCalibration && (
                <div style={{ background: 'rgba(10,132,255,0.08)', border: '1px solid rgba(10,132,255,0.25)', borderRadius: '12px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '0.84rem', fontWeight: '800', color: '#0a84ff', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span>⚖️</span>
                    <span>信用卡餘額直接校正</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                    💡 <strong>什麼是直接校正？</strong><br />
                    當您不想逐筆比對發票，只想將 App 內此卡負債強制改為目前網銀上看到的「未出帳/未繳總金額」時使用。
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--text-tertiary)' }}>
                    <span>目前 App 記錄卡片負債：</span>
                    <strong style={{ color: '#ffb94f' }}>-${Math.abs(selectedCcBill?.rawAccount?.balance || selectedCcBill?.amount || 0).toLocaleString()} TWD</strong>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="例如: 4348"
                      value={directCalibrateInput ? formatInputMoney(directCalibrateInput) : ''}
                      onChange={(e) => setDirectCalibrateInput(e.target.value.replace(/[^\d.]/g, ''))}
                      style={{ flex: 1, padding: '8px 10px', fontSize: '0.95rem', fontWeight: '800', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff' }}
                    />
                    <button
                      type="button"
                      onClick={handleExecuteDirectCalibration}
                      className="glass-btn primary-gradient-btn"
                      style={{ padding: '8px 14px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: '800' }}
                    >
                      確定校正
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDirectCalibration(false)}
                      className="glass-btn"
                      style={{ padding: '8px 10px', borderRadius: '8px', fontSize: '0.78rem' }}
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}

              {/* Smart Reconciliation Input Box */}
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: '800', color: '#fff', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span>🔢</span>
                    <span>輸入網銀本期帳單應繳金額</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const totalUnpaid = unpaidCardTransactions.reduce((s, r) => s + r._amt, 0);
                      setReconcileAmountInput(String(totalUnpaid));
                      setSelectedTxKeys(new Set(unpaidCardTransactions.map(r => r._uniqueKey)));
                    }}
                    style={{ background: 'none', border: 'none', color: 'var(--color-joint)', fontSize: '0.72rem', cursor: 'pointer', fontWeight: '700' }}
                  >
                    帶入全部待繳 (${unpaidCardTransactions.reduce((s, r) => s + r._amt, 0).toLocaleString()})
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="例如: 3450"
                      value={reconcileAmountInput ? formatInputMoney(reconcileAmountInput) : ''}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^\d.]/g, '');
                        setReconcileAmountInput(raw);
                        if (raw) {
                          const sol = solveSubsetSum(unpaidCardTransactions, Number(raw) || 0);
                          if (sol.selectedSet.size > 0) {
                            setSelectedTxKeys(new Set(sol.selectedSet));
                          }
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        fontSize: '1.05rem',
                        fontWeight: '800',
                        borderRadius: '10px',
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        color: '#fff',
                        boxSizing: 'border-box'
                      }}
                    />
                    {reconcileAmountInput && (
                      <button
                        type="button"
                        onClick={() => {
                          setReconcileAmountInput('');
                          setSelectedTxKeys(new Set(unpaidCardTransactions.map(r => r._uniqueKey)));
                        }}
                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '0.9rem' }}
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const target = parseMoney(reconcileAmountInput);
                      if (target > 0) {
                        const sol = solveSubsetSum(unpaidCardTransactions, target);
                        if (sol.selectedSet.size > 0) {
                          setSelectedTxKeys(new Set(sol.selectedSet));
                        }
                      }
                    }}
                    className="glass-btn"
                    style={{ padding: '10px 14px', fontSize: '0.8rem', borderRadius: '10px', fontWeight: '750', whiteSpace: 'nowrap' }}
                  >
                    ✨ 智慧匹配
                  </button>
                </div>

                {/* Status Banner */}
                {reconcileAmountInput && (
                  <div style={{ marginTop: '10px', fontSize: '0.74rem', padding: '8px 10px', borderRadius: '8px', lineHeight: '1.4', ...(
                    smartMatchResult.status === 'exact_prefix' || smartMatchResult.status === 'exact_subset'
                      ? { background: 'rgba(48,209,88,0.12)', border: '1px solid rgba(48,209,88,0.25)', color: '#8effa2' }
                      : (smartMatchResult.status === 'small_diff'
                          ? { background: 'rgba(10,132,255,0.12)', border: '1px solid rgba(10,132,255,0.25)', color: '#90c8ff' }
                          : (smartMatchResult.status === 'ambiguous'
                              ? { background: 'rgba(255,185,79,0.12)', border: '1px solid rgba(255,185,79,0.25)', color: '#ffd591' }
                              : { background: 'rgba(255,69,58,0.12)', border: '1px solid rgba(255,69,58,0.25)', color: '#ff9b94' }
                            ))
                  ) }}>
                    {smartMatchResult.status === 'exact_prefix' && `🟢 完全吻合！已依時間自動選取前 ${smartMatchResult.count} 筆消費（合計 $${smartMatchResult.matchedSum.toLocaleString()}），其餘未請款留至下期。`}
                    {smartMatchResult.status === 'exact_subset' && `🟢 精確匹配！已自動找出吻合網銀 $${smartMatchResult.matchedSum.toLocaleString()} 的 ${smartMatchResult.count} 筆消費組合。`}
                    {smartMatchResult.status === 'small_diff' && `🔵 接近匹配！已選取 ${smartMatchResult.count} 筆（合計 $${smartMatchResult.matchedSum.toLocaleString()}），與網銀差額 $${Math.abs(smartMatchResult.diff)} (可一鍵差額結清校正)。`}
                    {smartMatchResult.status === 'ambiguous' && `🟠 發現多重相同金額組合！已為您勾選無爭議項目，請在下方清單確認其餘項目。`}
                    {smartMatchResult.status === 'no_match' && `⚪ 未找到完全吻合之組合。您可以直接在下方手動勾選或點擊一鍵全選。`}
                  </div>
                )}
              </div>

              {/* Itemized Transactions Section */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#fff' }}>
                    📋 待結清刷卡明細 ({unpaidCardTransactions.length} 筆)
                  </span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => setSelectedTxKeys(new Set(unpaidCardTransactions.map(r => r._uniqueKey)))}
                      style={{ background: 'none', border: 'none', color: 'var(--color-joint)', fontSize: '0.7rem', cursor: 'pointer', padding: 0 }}
                    >
                      全選
                    </button>
                    <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
                    <button
                      type="button"
                      onClick={() => {
                        const cutoffDay = Number(selectedCcBill?.rawAccount?.billingDay || 10);
                        const filtered = unpaidCardTransactions.filter(r => {
                          const d = r.date ? Number(r.date.split('-')[2]) : 0;
                          return d <= cutoffDay;
                        });
                        setSelectedTxKeys(new Set(filtered.map(r => r._uniqueKey)));
                      }}
                      style={{ background: 'none', border: 'none', color: 'var(--color-joint)', fontSize: '0.7rem', cursor: 'pointer', padding: 0 }}
                    >
                      出帳日前
                    </button>
                    <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedTxKeys(new Set())}
                      style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: '0.7rem', cursor: 'pointer', padding: 0 }}
                    >
                      清除
                    </button>
                  </div>
                </div>

                <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '2px' }}>
                  {unpaidCardTransactions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
                      🎉 此信用卡目前無任何待結算的刷卡消費！
                    </div>
                  ) : (
                    unpaidCardTransactions.map((tx) => {
                      const isChecked = selectedTxKeys.has(tx._uniqueKey);
                      const bDay = Number(selectedCcBill?.rawAccount?.billingDay || 10);
                      const txDay = tx.date ? Number(tx.date.split('-')[2]) : 0;
                      const isAfterCutoff = txDay > bDay;

                      return (
                        <div
                          key={tx._uniqueKey}
                          onClick={() => {
                            const next = new Set(selectedTxKeys);
                            if (isChecked) next.delete(tx._uniqueKey);
                            else next.add(tx._uniqueKey);
                            setSelectedTxKeys(next);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 10px',
                            borderRadius: '10px',
                            background: isChecked ? 'rgba(48,209,88,0.08)' : 'rgba(255,255,255,0.02)',
                            border: `1px solid ${isChecked ? 'rgba(48,209,88,0.3)' : 'rgba(255,255,255,0.05)'}`,
                            cursor: 'pointer',
                            userSelect: 'none',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}} // Controlled by outer div click
                              style={{ accentColor: '#30d158', width: '16px', height: '16px', cursor: 'pointer' }}
                            />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: '0.78rem', fontWeight: '750', color: '#fff', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span>{tx.note || tx.category || '刷卡消費'}</span>
                                {isAfterCutoff && (
                                  <span style={{ fontSize: '0.62rem', padding: '1px 4px', borderRadius: '4px', background: 'rgba(255,149,0,0.15)', color: '#ffb94f', border: '0.5px solid rgba(255,149,0,0.3)' }}>
                                    結帳後
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>
                                {tx.date} · {tx.payer || '個人'} · {tx.category}
                              </div>
                            </div>
                          </div>
                          <span style={{ fontWeight: '800', fontSize: '0.85rem', color: isChecked ? '#8effa2' : '#fff', paddingLeft: '8px' }}>
                            ${tx._amt.toLocaleString()}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Selected Total Bar */}
                {unpaidCardTransactions.length > 0 && (() => {
                  const selCount = unpaidCardTransactions.filter(r => selectedTxKeys.has(r._uniqueKey)).length;
                  const selSum = unpaidCardTransactions
                    .filter(r => selectedTxKeys.has(r._uniqueKey))
                    .reduce((s, r) => s + r._amt, 0);
                  return (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', padding: '6px 8px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', fontSize: '0.74rem' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        已選取 <strong>{selCount}</strong> / {unpaidCardTransactions.length} 筆
                      </span>
                      <span style={{ color: '#fff', fontWeight: '750' }}>
                        選取合計: <strong style={{ color: '#30d158', fontSize: '0.88rem' }}>${selSum.toLocaleString()} TWD</strong>
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Paying Bank Account Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '750' }}>
                  🏦 請選擇劃撥扣繳之活儲帳戶
                </label>
                <IOSAccountMenuPicker
                  accounts={accounts.filter(a => a.type !== 'credit')}
                  selectedAccountId={billPayAccountId}
                  onSelect={(accId) => setBillPayAccountId(accId)}
                  label="扣繳活儲帳戶"
                />
              </div>

            </div>

            {/* Fixed Modal Footer */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
              {(() => {
                const targetInputVal = parseMoney(reconcileAmountInput);
                const targetPayingAcc = accounts.find(a => a.id === billPayAccountId);
                const selCount = unpaidCardTransactions.filter(r => selectedTxKeys.has(r._uniqueKey)).length;
                const selSum = unpaidCardTransactions
                  .filter(r => selectedTxKeys.has(r._uniqueKey))
                  .reduce((s, r) => s + r._amt, 0);

                if (!targetPayingAcc) {
                  return (
                    <button
                      type="button"
                      onClick={() => customAlert?.("請先於上方「扣繳活儲帳戶」選取欲扣款的銀行或現金帳戶！", "提示")}
                      className="glass-btn"
                      style={{ width: '100%', padding: '12px 0', borderRadius: '12px', fontWeight: '850', fontSize: '0.88rem', background: 'rgba(255,149,0,0.18)', border: '1px solid rgba(255,149,0,0.4)', color: '#ffb94f' }}
                    >
                      ⚠️ 請先選擇上方扣繳活儲帳戶
                    </button>
                  );
                }

                const diff = targetInputVal > 0 ? targetInputVal - selSum : 0;

                // Scenario 1: Exact target match
                if (targetInputVal > 0 && Math.abs(diff) === 0 && selSum > 0) {
                  return (
                    <button
                      type="button"
                      onClick={() => handleExecuteCreditCardSettlement(targetInputVal)}
                      className="glass-btn primary-gradient-btn"
                      style={{ width: '100%', padding: '12px 0', borderRadius: '12px', fontWeight: '850', fontSize: '0.92rem' }}
                    >
                      🚀 確定以網銀 ${targetInputVal.toLocaleString()} 劃撥結清 (沖銷 {selCount} 筆)
                    </button>
                  );
                }

                // Scenario 2: Small discrepancy tolerance button
                if (targetInputVal > 0 && Math.abs(diff) > 0 && Math.abs(diff) <= 30 && selSum > 0) {
                  return (
                    <button
                      type="button"
                      onClick={() => handleExecuteCreditCardSettlement(targetInputVal, { calibrationDiff: diff })}
                      className="glass-btn"
                      style={{
                        width: '100%',
                        padding: '12px 0',
                        borderRadius: '12px',
                        fontWeight: '850',
                        fontSize: '0.86rem',
                        background: 'linear-gradient(135deg, rgba(10,132,255,0.4), rgba(48,209,88,0.4))',
                        border: '1px solid rgba(10,132,255,0.5)',
                        color: '#fff'
                      }}
                    >
                      ⚡ 允許 ${Math.abs(diff)} 微差，以網銀 ${targetInputVal.toLocaleString()} 結清並校正
                    </button>
                  );
                }

                // Scenario 3: Regular manual selection settlement
                if (selSum > 0) {
                  return (
                    <button
                      type="button"
                      onClick={() => handleExecuteCreditCardSettlement(selSum)}
                      className="glass-btn primary-gradient-btn"
                      style={{ width: '100%', padding: '12px 0', borderRadius: '12px', fontWeight: '850', fontSize: '0.92rem' }}
                    >
                      🚀 依勾選合計 ${selSum.toLocaleString()} 劃撥結清 ({selCount} 筆)
                    </button>
                  );
                }

                return (
                  <button
                    type="button"
                    disabled
                    className="glass-btn"
                    style={{ width: '100%', padding: '12px 0', borderRadius: '12px', opacity: 0.5, cursor: 'not-allowed', fontSize: '0.86rem' }}
                  >
                    請勾選至少一筆明細以執行劃撥
                  </button>
                );
              })()}

              <div style={{ display: 'flex', gap: '8px' }}>
                {/* Fast Balance Calibration */}
                <button
                  type="button"
                  onClick={() => setShowDirectCalibration(v => !v)}
                  className="glass-btn"
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    fontSize: '0.82rem',
                    borderRadius: '10px',
                    color: showDirectCalibration ? '#0a84ff' : '#fff',
                    border: showDirectCalibration ? '1px solid #0a84ff' : undefined,
                    fontWeight: '750'
                  }}
                >
                  ⚖️ 直接校正餘額
                </button>

                <button
                  type="button"
                  onClick={() => setShowCreditCardModal(false)}
                  className="glass-btn"
                  style={{ width: '80px', padding: '10px 0', fontSize: '0.82rem', borderRadius: '10px' }}
                >
                  關閉
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