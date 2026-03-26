// src/App.jsx
import React, { useCallback, useEffect, useState } from 'react';
import Login from './components/Login';
import TotalOverview from './components/TotalOverview';
import MonthlyView from './components/MonthlyView';
import AssetTransfer from './components/AssetTransfer';
import InvestmentView from './components/InvestmentView';
import ExpenseEntry from './components/ExpenseEntry';
import './index.css';

import { db, auth } from './firebase';
import { doc, onSnapshot, runTransaction } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';

const USER_MAPPING = {
  'hzh940317@gmail.com': '恆恆🐶',
  'ender.tsai@gmail.com': '得得🐕',
};

const MAKE_WEBHOOK_URL =
  'https://hook.us2.make.com/bl76wl9v2v6hxd1k5xdm5n1yjt34hs7l';

const DEFAULT_ASSETS = {
  userA: 0,
  userB: 0,
  userA_usd: 0,
  userB_usd: 0,
  jointCash: 0,
  jointCash_usd: 0,
  jointInvestments: { stock: 0, fund: 0, deposit: 0, other: 0 },
  userInvestments: {
    userA: { stock: 0, fund: 0, deposit: 0, other: 0 },
    userB: { stock: 0, fund: 0, deposit: 0, other: 0 },
  },
  roi: { stock: 0, fund: 0, deposit: 0, other: 0 },
  monthlyExpenses: [],
  bills: [],
  dailyNetWorth: {},
  monthlyBudget: 40000,
};

const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const createId = (prefix = 'rec') => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const normalizeInvestmentBlock = (block = {}) => ({
  stock: toNumber(block.stock),
  fund: toNumber(block.fund),
  deposit: toNumber(block.deposit),
  other: toNumber(block.other),
});

const normalizeRecord = (record = {}, index = 0) => {
  const stableId =
    record.id ||
    record.recordId ||
    `legacy_${index}_${record.timestamp || record.date || Date.now()}`;

  return {
    ...record,
    id: stableId,
    recordId: stableId,
    total: toNumber(record.total),
    usdAmount:
      record.usdAmount === undefined ? undefined : toNumber(record.usdAmount),
    shares: record.shares === undefined ? undefined : toNumber(record.shares),
    principal:
      record.principal === undefined ? undefined : toNumber(record.principal),
    twdDiff: record.twdDiff === undefined ? undefined : toNumber(record.twdDiff),
    usdDiff: record.usdDiff === undefined ? undefined : toNumber(record.usdDiff),
  };
};

const normalizeAssets = (raw = {}) => {
  const base = deepClone(DEFAULT_ASSETS);
  const next = {
    ...base,
    ...raw,
    userA: toNumber(raw.userA, base.userA),
    userB: toNumber(raw.userB, base.userB),
    userA_usd: toNumber(raw.userA_usd, base.userA_usd),
    userB_usd: toNumber(raw.userB_usd, base.userB_usd),
    jointCash: toNumber(raw.jointCash, base.jointCash),
    jointCash_usd: toNumber(raw.jointCash_usd, base.jointCash_usd),
    jointInvestments: normalizeInvestmentBlock(raw.jointInvestments || {}),
    userInvestments: {
      userA: normalizeInvestmentBlock(raw.userInvestments?.userA || {}),
      userB: normalizeInvestmentBlock(raw.userInvestments?.userB || {}),
    },
    roi: {
      stock: toNumber(raw.roi?.stock),
      fund: toNumber(raw.roi?.fund),
      deposit: toNumber(raw.roi?.deposit),
      other: toNumber(raw.roi?.other),
    },
    monthlyExpenses: Array.isArray(raw.monthlyExpenses)
      ? raw.monthlyExpenses.map((item, index) => normalizeRecord(item, index))
      : [],
    bills: Array.isArray(raw.bills) ? raw.bills : [],
    dailyNetWorth:
      raw.dailyNetWorth && typeof raw.dailyNetWorth === 'object'
        ? raw.dailyNetWorth
        : {},
    monthlyBudget: toNumber(raw.monthlyBudget, base.monthlyBudget),
  };

  return next;
};

const sanitizeText = (value, fallback = '') =>
  String(value ?? fallback)
    .replace(/"/g, '＂')
    .replace(/\n/g, ' ')
    .trim();

const getSnapshot = (currentAssets) => ({
  userA: toNumber(currentAssets.userA),
  userB: toNumber(currentAssets.userB),
  userA_usd: toNumber(currentAssets.userA_usd),
  userB_usd: toNumber(currentAssets.userB_usd),
  jointCash: toNumber(currentAssets.jointCash),
  jointCash_usd: toNumber(currentAssets.jointCash_usd),
  jointInvestments: deepClone(
    currentAssets.jointInvestments || DEFAULT_ASSETS.jointInvestments
  ),
  userInvestments: deepClone(
    currentAssets.userInvestments || DEFAULT_ASSETS.userInvestments
  ),
});

const getUserLabel = (key) => {
  if (key === 'userA') return '恆恆🐶';
  if (key === 'userB') return '得得🐕';
  return '共同帳戶';
};

const resolveOwnerKey = (record = {}) => {
  if (record.accountKey === 'userA' || record.ownerKey === 'userA') return 'userA';
  if (record.accountKey === 'userB' || record.ownerKey === 'userB') return 'userB';

  const payer = String(record.payer || '');
  if (payer.includes('恆恆')) return 'userA';
  if (payer.includes('得得')) return 'userB';

  return null;
};

const getNotificationMeta = (type = '') => {
  if (type === 'income') return { color: '#06c755', title: '收入入帳' };
  if (type === 'spend') return { color: '#ef454d', title: '共同支出' };
  if (type === 'transfer') return { color: '#2b90d9', title: '資產劃撥' };
  if (type === 'exchange') return { color: '#3498db', title: '外幣換匯' };
  if (type === 'calibrate') return { color: '#95a5a6', title: '餘額校正' };
  if (type.includes('invest_sell') || type === 'liquidate') {
    return { color: '#f1c40f', title: '投資變現' };
  }
  if (type.includes('invest_buy')) {
    return { color: '#8e44ad', title: '買入投資' };
  }
  if (type === 'personal_invest_profit') {
    return { color: '#e67e22', title: '投資獲利入帳' };
  }
  if (type === 'personal_invest_loss') {
    return { color: '#7f8c8d', title: '投資虧損認列' };
  }
  if (type === 'settle') {
    return { color: '#00b894', title: '帳務結算' };
  }
  return { color: '#17c9b2', title: '資產變動' };
};

const getNotificationSignPrefix = (type = '') => {
  if (
    ['income', 'joint_invest_sell', 'personal_invest_sell', 'personal_invest_profit', 'liquidate'].includes(
      type
    )
  ) {
    return '+';
  }

  if (
    ['spend', 'expense', 'joint_invest_buy', 'personal_invest_buy', 'personal_invest_loss'].includes(
      type
    )
  ) {
    return '-';
  }

  if (['transfer', 'settle', 'exchange', 'calibrate'].includes(type)) {
    return '🔄 ';
  }

  return '';
};

const appendHistoryRecord = ({
  currentAssets,
  nextAssets,
  historyRecord,
  operatorName,
  operatorEmail,
}) => {
  const timestamp = new Date().toISOString();
  const recordId = historyRecord.recordId || historyRecord.id || createId('record');

  const finalRecord = normalizeRecord(
    {
      ...historyRecord,
      id: recordId,
      recordId,
      operator: operatorName || '系統',
      operatorEmail: operatorEmail || '',
      timestamp,
      month: historyRecord.month || String(historyRecord.date || '').slice(0, 7),
      auditTrail: {
        before: getSnapshot(currentAssets),
        after: getSnapshot(nextAssets),
      },
    },
    nextAssets.monthlyExpenses?.length || 0
  );

  return {
    ...nextAssets,
    monthlyExpenses: [...(currentAssets.monthlyExpenses || []), finalRecord],
  };
};

const applyTransactionRecord = (currentAssets, historyRecord) => {
  const next = normalizeAssets(currentAssets);
  const amount = toNumber(historyRecord.total);
  const ownerKey = resolveOwnerKey(historyRecord) || historyRecord.accountKey || null;
  const investType = historyRecord.investType;
  const principal = toNumber(
    historyRecord.principal !== undefined ? historyRecord.principal : historyRecord.total
  );
  const usdAmount = toNumber(historyRecord.usdAmount);
  const twdDiff = toNumber(historyRecord.twdDiff);
  const usdDiff = toNumber(historyRecord.usdDiff);

  switch (historyRecord.type) {
    case 'income': {
      if (!ownerKey) throw new Error('income 缺少 owner/accountKey');
      next[ownerKey] += amount;
      break;
    }

    case 'transfer': {
      if (!ownerKey) throw new Error('transfer 缺少 owner/accountKey');
      if (next[ownerKey] < amount) {
        throw new Error(`${getUserLabel(ownerKey)} 的個人餘額不足`);
      }
      next[ownerKey] -= amount;
      next.jointCash += amount;
      break;
    }

    case 'exchange': {
      if (!historyRecord.accountKey) {
        throw new Error('exchange 缺少 accountKey');
      }

      if (String(historyRecord.note || '').includes('台幣換美金')) {
        if (next[historyRecord.accountKey] < amount) {
          throw new Error('台幣餘額不足，無法換匯');
        }
        next[historyRecord.accountKey] -= amount;
        next[`${historyRecord.accountKey}_usd`] =
          toNumber(next[`${historyRecord.accountKey}_usd`]) + usdAmount;
      } else {
        if (toNumber(next[`${historyRecord.accountKey}_usd`]) < usdAmount) {
          throw new Error('美金餘額不足，無法換回台幣');
        }
        next[historyRecord.accountKey] += amount;
        next[`${historyRecord.accountKey}_usd`] =
          toNumber(next[`${historyRecord.accountKey}_usd`]) - usdAmount;
      }
      break;
    }

    case 'calibrate': {
      if (!historyRecord.accountKey) {
        throw new Error('calibrate 缺少 accountKey');
      }
      next[historyRecord.accountKey] =
        toNumber(next[historyRecord.accountKey]) + twdDiff;
      next[`${historyRecord.accountKey}_usd`] =
        toNumber(next[`${historyRecord.accountKey}_usd`]) + usdDiff;
      break;
    }

    case 'joint_invest_buy': {
      if (!investType) throw new Error('joint_invest_buy 缺少 investType');
      if (next.jointCash < amount) {
        throw new Error('共同現金不足，無法買入投資');
      }
      next.jointCash -= amount;
      next.jointInvestments[investType] =
        toNumber(next.jointInvestments[investType]) + amount;
      break;
    }

    case 'personal_invest_buy': {
      if (!historyRecord.accountKey || !investType) {
        throw new Error('personal_invest_buy 缺少 accountKey 或 investType');
      }

      if (usdAmount > 0) {
        if (toNumber(next[`${historyRecord.accountKey}_usd`]) < usdAmount) {
          throw new Error('美金餘額不足，無法買入投資');
        }
        next[`${historyRecord.accountKey}_usd`] =
          toNumber(next[`${historyRecord.accountKey}_usd`]) - usdAmount;
      } else {
        if (toNumber(next[historyRecord.accountKey]) < amount) {
          throw new Error('台幣餘額不足，無法買入投資');
        }
        next[historyRecord.accountKey] =
          toNumber(next[historyRecord.accountKey]) - amount;
      }

      next.userInvestments[historyRecord.accountKey][investType] =
        toNumber(next.userInvestments[historyRecord.accountKey][investType]) + amount;
      break;
    }

    case 'joint_invest_sell':
    case 'liquidate': {
      const targetType =
        investType || String(historyRecord.note || '').split(' ')[1] || null;

      if (!targetType) throw new Error('joint_invest_sell 缺少 investType');

      next.jointCash += amount;
      next.jointInvestments[targetType] = Math.max(
        0,
        toNumber(next.jointInvestments[targetType]) - principal
      );
      break;
    }

    case 'personal_invest_sell': {
      if (!historyRecord.accountKey || !investType) {
        throw new Error('personal_invest_sell 缺少 accountKey 或 investType');
      }

      if (usdAmount > 0) {
        next[`${historyRecord.accountKey}_usd`] =
          toNumber(next[`${historyRecord.accountKey}_usd`]) + usdAmount;
      } else {
        next[historyRecord.accountKey] =
          toNumber(next[historyRecord.accountKey]) + amount;
      }

      next.userInvestments[historyRecord.accountKey][investType] = Math.max(
        0,
        toNumber(next.userInvestments[historyRecord.accountKey][investType]) - principal
      );
      break;
    }

    case 'personal_invest_profit': {
      if (!ownerKey) throw new Error('personal_invest_profit 缺少 owner/accountKey');
      next[ownerKey] += amount;
      break;
    }

    case 'personal_invest_loss': {
      if (!ownerKey) throw new Error('personal_invest_loss 缺少 owner/accountKey');
      if (next[ownerKey] < amount) {
        throw new Error(`${getUserLabel(ownerKey)} 的個人餘額不足`);
      }
      next[ownerKey] -= amount;
      break;
    }

    default: {
      return normalizeAssets(historyRecord.__unsafeNextAssets || currentAssets);
    }
  }

  return normalizeAssets(next);
};

const resolveRecordIndex = (history = [], recordRef) => {
  if (typeof recordRef === 'number') {
    return recordRef >= 0 && recordRef < history.length ? recordRef : -1;
  }

  const key =
    typeof recordRef === 'string'
      ? recordRef
      : recordRef?.recordId || recordRef?.id || null;

  if (!key) return -1;

  return history.findIndex((item) => item.recordId === key || item.id === key);
};

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [operatorName, setOperatorName] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState('overview');
  const [assets, setAssets] = useState(deepClone(DEFAULT_ASSETS));

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
        setOperatorName(USER_MAPPING[user.email] || user.email?.split('@')[0] || '使用者');
      } else {
        setCurrentUser(null);
        setOperatorName('');
        setAssets(deepClone(DEFAULT_ASSETS));
        setCurrentPage('overview');
      }
      setLoading(false);
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    const docRef = doc(db, 'finance', 'data');
    setLoading(true);

    const unsubscribe = onSnapshot(
      docRef,
      async (docSnap) => {
        if (docSnap.exists()) {
          setAssets(normalizeAssets(docSnap.data()));
          setLoading(false);
          return;
        }

        const initialData = normalizeAssets({
          ...deepClone(DEFAULT_ASSETS),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser.email || '',
        });

        setAssets(initialData);
        setLoading(false);

        try {
          await runTransaction(db, async (transaction) => {
            const latest = await transaction.get(docRef);
            if (!latest.exists()) {
              transaction.set(docRef, initialData);
            }
          });
        } catch (error) {
          console.error('初始化資料失敗:', error);
        }
      },
      (error) => {
        console.error('資料讀取失敗:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  const saveToCloud = useCallback(
    async (valueOrUpdater) => {
      if (!currentUser) return null;

      const docRef = doc(db, 'finance', 'data');

      try {
        const savedAssets = await runTransaction(db, async (transaction) => {
          const snapshot = await transaction.get(docRef);
          const currentData = snapshot.exists()
            ? normalizeAssets(snapshot.data())
            : normalizeAssets(DEFAULT_ASSETS);

          const computed =
            typeof valueOrUpdater === 'function'
              ? valueOrUpdater(currentData)
              : valueOrUpdater;

          const nextData = normalizeAssets(computed);

          transaction.set(
            docRef,
            {
              ...nextData,
              updatedAt: new Date().toISOString(),
              updatedBy: currentUser.email || '',
            },
            { merge: false }
          );

          return nextData;
        });

        setAssets(savedAssets);
        return savedAssets;
      } catch (err) {
        console.error('資料寫入失敗:', err);
        alert(`連線錯誤：${err.message}`);
        throw err;
      }
    },
    [currentUser]
  );

  const syncedSetAssets = useCallback(
    async (valueOrUpdater) => {
      await saveToCloud(valueOrUpdater);
    },
    [saveToCloud]
  );

  const sendLineNotification = useCallback(
    async (data) => {
      try {
        const safeData = {
          title: sanitizeText(data?.title, '系統通知'),
          amount: sanitizeText(data?.amount, '$0'),
          category: sanitizeText(data?.category, '未分類'),
          note: sanitizeText(data?.note, '無備註'),
          date: sanitizeText(data?.date, new Date().toISOString().split('T')[0]),
          color: sanitizeText(data?.color, '#666666'),
          operator: sanitizeText(data?.operator, operatorName || '系統'),
        };

        await fetch(MAKE_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(safeData),
        });
      } catch (error) {
        console.error('Line 通知發送失敗', error);
      }
    },
    [operatorName]
  );

  const handleLogout = () => {
    if (window.confirm('確定要登出嗎？')) {
      signOut(auth);
    }
  };

  const handleTransaction = async (newAssets, historyRecord) => {
    if (!historyRecord?.type) {
      alert('❌ 交易資料不完整，缺少 type。');
      return;
    }

    try {
      const savedAssets = await saveToCloud((current) => {
        const currentNormalized = normalizeAssets(current);

        let nextAssets;
        try {
          nextAssets = applyTransactionRecord(currentNormalized, historyRecord);
        } catch (applyError) {
          nextAssets = normalizeAssets(newAssets || currentNormalized);
          nextAssets.__applyFallback = true;
        }

        return appendHistoryRecord({
          currentAssets: currentNormalized,
          nextAssets,
          historyRecord,
          operatorName,
          operatorEmail: currentUser?.email || '',
        });
      });

      setCurrentPage('overview');

      const meta = getNotificationMeta(historyRecord.type);
      const signPrefix = getNotificationSignPrefix(historyRecord.type);

      await sendLineNotification({
        title: meta.title,
        amount: `${signPrefix}$${toNumber(historyRecord.total).toLocaleString()}`,
        category: historyRecord.category || '未分類',
        note: historyRecord.note || '無',
        date: historyRecord.date || new Date().toISOString().split('T')[0],
        color: meta.color,
        operator: operatorName,
      });

      return savedAssets;
    } catch (error) {
      console.error('handleTransaction 失敗:', error);
    }
  };

  const handleAddExpense = async (
    date,
    expenseData,
    totalAmount,
    payer,
    note,
    updatedBills = null
  ) => {
    const amount = toNumber(totalAmount);
    const payerKey = payer === 'heng' ? 'userA' : 'userB';
    const payerName = payer === 'heng' ? '恆恆🐶' : '得得🐕';

    if (!date) return alert('❌ 請選擇日期');
    if (amount <= 0) return alert('❌ 金額必須大於 0');

    try {
      await saveToCloud((current) => {
        const currentNormalized = normalizeAssets(current);

        if (currentNormalized[payerKey] < amount) {
          throw new Error(`⚠️ ${payerName} 的個人餘額不足！`);
        }

        const nextAssets = normalizeAssets({
          ...currentNormalized,
          [payerKey]: currentNormalized[payerKey] - amount,
          ...(updatedBills ? { bills: updatedBills } : {}),
        });

        return appendHistoryRecord({
          currentAssets: currentNormalized,
          nextAssets,
          historyRecord: {
            date,
            month: date.slice(0, 7),
            type: 'expense',
            category: '個人支出',
            details: expenseData,
            total: amount,
            payer: payerName,
            ownerKey: payerKey,
            accountKey: payerKey,
            note: note || '日記帳',
          },
          operatorName,
          operatorEmail: currentUser?.email || '',
        });
      });

      alert('✅ 記帳完成！');
      setCurrentPage('overview');

      await sendLineNotification({
        title: '個人日記帳',
        amount: `-$${amount.toLocaleString()}`,
        category: '個人支出',
        note: note || '日記帳',
        date,
        color: '#ef454d',
        operator: operatorName,
      });
    } catch (error) {
      alert(error.message);
    }
  };

  const handleAddJointExpense = async (
    date,
    category,
    amount,
    advancedBy,
    note,
    updatedBills = null
  ) => {
    const val = toNumber(amount);
    if (!date) return alert('❌ 請選擇日期');
    if (val <= 0) return alert('❌ 金額必須大於 0');

    try {
      await saveToCloud((current) => {
        const currentNormalized = normalizeAssets(current);
        const nextAssets = normalizeAssets({
          ...currentNormalized,
          ...(updatedBills ? { bills: updatedBills } : {}),
        });

        let paymentMethodName = '共同帳戶直接付';

        if (advancedBy === 'jointCash') {
          if (nextAssets.jointCash < val) {
            throw new Error('❌ 共同現金不足！');
          }
          nextAssets.jointCash -= val;
        } else if (advancedBy === 'userA') {
          if (nextAssets.userA < val) {
            throw new Error('❌ 恆恆的個人餘額不足以代墊！');
          }
          nextAssets.userA -= val;
          paymentMethodName = '恆恆先墊 (User A)';
        } else if (advancedBy === 'userB') {
          if (nextAssets.userB < val) {
            throw new Error('❌ 得得的個人餘額不足以代墊！');
          }
          nextAssets.userB -= val;
          paymentMethodName = '得得先墊 (User B)';
        } else {
          throw new Error('❌ 付款方式錯誤');
        }

        nextAssets.__paymentMethodName = paymentMethodName;

        return appendHistoryRecord({
          currentAssets: currentNormalized,
          nextAssets,
          historyRecord: {
            date,
            month: date.slice(0, 7),
            type: 'spend',
            category: '共同支出',
            payer: '共同帳戶',
            total: val,
            note: note ? `${category} - ${String(note).trim()}` : category,
            advancedBy: advancedBy === 'jointCash' ? null : advancedBy,
            isSettled: advancedBy === 'jointCash',
          },
          operatorName,
          operatorEmail: currentUser?.email || '',
        });
      });

      const paymentMethodName =
        advancedBy === 'jointCash'
          ? '共同帳戶直接付'
          : advancedBy === 'userA'
          ? '恆恆先墊 (User A)'
          : '得得先墊 (User B)';

      alert(`💸 已記錄共同支出 $${val.toLocaleString()}\n付款方式：${paymentMethodName}`);
      setCurrentPage('overview');

      await sendLineNotification({
        title: '共同支出',
        amount: `-$${val.toLocaleString()}`,
        category: '共同支出',
        note: note ? `${category} - ${String(note).trim()}` : category,
        date,
        color: '#ef454d',
        operator: operatorName,
      });
    } catch (error) {
      alert(error.message);
    }
  };

  const handleEditTransaction = async (recordRef, newData) => {
    try {
      await saveToCloud((current) => {
        const currentNormalized = normalizeAssets(current);
        const updatedExpenses = [...currentNormalized.monthlyExpenses];
        const targetIndex = resolveRecordIndex(updatedExpenses, recordRef);

        if (targetIndex === -1) {
          throw new Error('找不到要修改的紀錄');
        }

        const target = updatedExpenses[targetIndex];
        const safeDate = newData?.date || target.date;

        updatedExpenses[targetIndex] = normalizeRecord({
          ...target,
          date: safeDate,
          month: safeDate.slice(0, 7),
          category: newData?.category ?? target.category,
          note: newData?.note ?? target.note,
          operator: operatorName,
          lastEditedAt: new Date().toISOString(),
          lastEditedBy: currentUser?.email || '',
        });

        return {
          ...currentNormalized,
          monthlyExpenses: updatedExpenses,
        };
      });

      alert('✅ 紀錄修改成功！');
    } catch (error) {
      alert(error.message);
    }
  };

  const handleDeleteTransaction = async (recordRef) => {
    try {
      await saveToCloud((current) => {
        const currentNormalized = normalizeAssets(current);
        const targetIndex = resolveRecordIndex(currentNormalized.monthlyExpenses, recordRef);

        if (targetIndex === -1) {
          throw new Error('找不到要作廢的紀錄');
        }

        const record = currentNormalized.monthlyExpenses[targetIndex];
        if (!record) throw new Error('找不到要作廢的紀錄');
        if (record.isDeleted) throw new Error('❌ 這筆紀錄已經被作廢過了！');
        if (record.isSettled) {
          throw new Error(
            '❌ 此筆消費已被「結清」！\n請先在流水帳中作廢「系統結算」紀錄，才能作廢此筆消費。'
          );
        }

        const reason = window.prompt('⚠️ 即將作廢此紀錄，請輸入刪除原因（必填）：');
        if (!reason || !reason.trim()) {
          throw new Error('❌ 必須輸入刪除原因才能作廢紀錄。');
        }

        const snapshotBefore = getSnapshot(currentNormalized);
        const nextAssets = normalizeAssets(currentNormalized);
        let updatedExpenses = [...nextAssets.monthlyExpenses];
        const payerKey = resolveOwnerKey(record);

        switch (record.type) {
          case 'settle': {
            if (record.settledUser) {
              nextAssets.jointCash += toNumber(record.total);
              nextAssets[record.settledUser] =
                toNumber(nextAssets[record.settledUser]) - toNumber(record.total);
            }
            if (record.settleId) {
              updatedExpenses = updatedExpenses.map((item) =>
                item.settleId === record.settleId
                  ? { ...item, isSettled: false, settleId: null }
                  : item
              );
            }
            break;
          }

          case 'income':
          case 'personal_invest_profit': {
            if (payerKey) nextAssets[payerKey] -= toNumber(record.total);
            break;
          }

          case 'expense':
          case 'personal_invest_loss': {
            if (payerKey) nextAssets[payerKey] += toNumber(record.total);
            break;
          }

          case 'spend': {
            if (record.advancedBy === 'jointCash' || !record.advancedBy) {
              nextAssets.jointCash += toNumber(record.total);
            } else {
              nextAssets[record.advancedBy] =
                toNumber(nextAssets[record.advancedBy]) + toNumber(record.total);
            }
            break;
          }

          case 'transfer': {
            if (payerKey) nextAssets[payerKey] += toNumber(record.total);
            nextAssets.jointCash -= toNumber(record.total);
            break;
          }

          case 'exchange': {
            if (!record.accountKey) break;

            if (String(record.note || '').includes('台幣換美金')) {
              nextAssets[record.accountKey] += toNumber(record.total);
              if (record.usdAmount !== undefined) {
                nextAssets[`${record.accountKey}_usd`] =
                  toNumber(nextAssets[`${record.accountKey}_usd`]) -
                  toNumber(record.usdAmount);
              }
            } else {
              nextAssets[record.accountKey] -= toNumber(record.total);
              if (record.usdAmount !== undefined) {
                nextAssets[`${record.accountKey}_usd`] =
                  toNumber(nextAssets[`${record.accountKey}_usd`]) +
                  toNumber(record.usdAmount);
              }
            }
            break;
          }

          case 'calibrate': {
            if (record.accountKey) {
              if (record.twdDiff !== undefined) {
                nextAssets[record.accountKey] =
                  toNumber(nextAssets[record.accountKey]) - toNumber(record.twdDiff);
              }
              if (record.usdDiff !== undefined) {
                nextAssets[`${record.accountKey}_usd`] =
                  toNumber(nextAssets[`${record.accountKey}_usd`]) -
                  toNumber(record.usdDiff);
              }
            }
            break;
          }

          case 'joint_invest_buy': {
            nextAssets.jointCash += toNumber(record.total);
            if (
              record.investType &&
              nextAssets.jointInvestments[record.investType] !== undefined
            ) {
              nextAssets.jointInvestments[record.investType] = Math.max(
                0,
                toNumber(nextAssets.jointInvestments[record.investType]) -
                  toNumber(record.total)
              );
            }
            break;
          }

          case 'personal_invest_buy': {
            if (
              record.accountKey &&
              nextAssets.userInvestments &&
              nextAssets.userInvestments[record.accountKey]
            ) {
              if (record.usdAmount) {
                nextAssets[`${record.accountKey}_usd`] =
                  toNumber(nextAssets[`${record.accountKey}_usd`]) +
                  toNumber(record.usdAmount);
              } else {
                nextAssets[record.accountKey] =
                  toNumber(nextAssets[record.accountKey]) + toNumber(record.total);
              }

              nextAssets.userInvestments[record.accountKey][record.investType] = Math.max(
                0,
                toNumber(nextAssets.userInvestments[record.accountKey][record.investType]) -
                  toNumber(record.total)
              );
            }
            break;
          }

          case 'joint_invest_sell':
          case 'liquidate': {
            nextAssets.jointCash -= toNumber(record.total);
            const sellType =
              record.investType || String(record.note || '').split(' ')[1] || null;

            if (sellType && nextAssets.jointInvestments[sellType] !== undefined) {
              nextAssets.jointInvestments[sellType] =
                toNumber(nextAssets.jointInvestments[sellType]) +
                toNumber(record.principal ?? record.total);
            }
            break;
          }

          case 'personal_invest_sell': {
            if (
              record.accountKey &&
              nextAssets.userInvestments &&
              nextAssets.userInvestments[record.accountKey]
            ) {
              if (record.usdAmount) {
                nextAssets[`${record.accountKey}_usd`] =
                  toNumber(nextAssets[`${record.accountKey}_usd`]) -
                  toNumber(record.usdAmount);
              } else {
                nextAssets[record.accountKey] =
                  toNumber(nextAssets[record.accountKey]) - toNumber(record.total);
              }

              nextAssets.userInvestments[record.accountKey][record.investType] =
                toNumber(nextAssets.userInvestments[record.accountKey][record.investType]) +
                toNumber(record.principal ?? record.total);
            }
            break;
          }

          default:
            break;
        }

        updatedExpenses = updatedExpenses.map((item, index) =>
          index === targetIndex
            ? {
                ...item,
                isDeleted: true,
                deleteReason: reason.trim(),
                deleteTimestamp: new Date().toISOString(),
                deleteAuditTrail: {
                  before: snapshotBefore,
                  after: getSnapshot(nextAssets),
                },
              }
            : item
        );

        sendLineNotification({
          title: '🗑️ 刪除/作廢紀錄',
          amount: `🔄$${toNumber(record.total).toLocaleString()}`,
          category: record.category,
          note: `已作廢: ${record.note || '無'} (原因: ${reason.trim()})`,
          date: new Date().toISOString().split('T')[0],
          color: '#666666',
          operator: operatorName,
        });

        return {
          ...nextAssets,
          monthlyExpenses: updatedExpenses,
        };
      });

      alert('🗑️ 紀錄已作廢並完成復原。');
    } catch (error) {
      alert(error.message);
    }
  };

  const handleAssetsUpdate = async (updatedAssetsOrUpdater) => {
    await saveToCloud(updatedAssetsOrUpdater);
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'overview':
        return (
          <TotalOverview
            assets={assets}
            setAssets={syncedSetAssets}
            onAssetsUpdate={handleAssetsUpdate}
          />
        );

      case 'monthly':
        return (
          <MonthlyView
            assets={assets}
            onDelete={handleDeleteTransaction}
            onEdit={handleEditTransaction}
            setAssets={syncedSetAssets}
            sendLineNotification={sendLineNotification}
            currentUser={operatorName}
            operatorName={operatorName}
          />
        );

      case 'transfer':
        return (
          <AssetTransfer
            assets={assets}
            setAssets={syncedSetAssets}
            onTransaction={handleTransaction}
            handleTransaction={handleTransaction}
            currentUser={operatorName}
            operatorName={operatorName}
            sendLineNotification={sendLineNotification}
          />
        );

      case 'invest':
        return <InvestmentView assets={assets} />;

      case 'expense':
        return (
          <ExpenseEntry
            assets={assets}
            bills={assets.bills || []}
            onAddExpense={handleAddExpense}
            onAddJointExpense={handleAddJointExpense}
            handleAddExpense={handleAddExpense}
            handleAddJointExpense={handleAddJointExpense}
            setAssets={syncedSetAssets}
            operatorName={operatorName}
            currentUser={operatorName}
          />
        );

      default:
        return (
          <TotalOverview
            assets={assets}
            setAssets={syncedSetAssets}
            onAssetsUpdate={handleAssetsUpdate}
          />
        );
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '24px' }}>
        <div className="glass-card">
          <h2>資料載入中...</h2>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <Login />;
  }

  return (
    <div>
      <nav className="glass-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span>👋 {operatorName}</span>
          <button className="glass-btn inactive" onClick={() => setCurrentPage('overview')}>
            總覽
          </button>
          <button className="glass-btn inactive" onClick={() => setCurrentPage('expense')}>
            記帳
          </button>
          <button className="glass-btn inactive" onClick={() => setCurrentPage('transfer')}>
            劃撥 / 投資
          </button>
          <button className="glass-btn inactive" onClick={() => setCurrentPage('monthly')}>
            月報表
          </button>
          <button className="glass-btn inactive" onClick={() => setCurrentPage('invest')}>
            投資總覽
          </button>
        </div>

        <button
          className="glass-btn"
          onClick={handleLogout}
          style={{ minWidth: '96px', marginLeft: '12px' }}
        >
          登出
        </button>
      </nav>

      <main style={{ padding: '20px' }}>{renderPage()}</main>
    </div>
  );
}

export default App;