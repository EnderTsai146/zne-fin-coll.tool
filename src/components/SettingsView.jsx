import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { db } from '../firebase';
import { collection, query, orderBy, limit, getDocs, startAfter, where, deleteDoc } from 'firebase/firestore';
import { getBudgetForMonth } from '../utils/budgetUtils';
import { MY_GOOGLE_API_URL } from '../config';
import { logger } from '../utils/logger';
import HelpWizard from './HelpWizard';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const ToggleSwitch = ({ checked, onChange, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={(e) => {
      e.stopPropagation();
      if (!disabled && onChange) onChange();
    }}
    style={{
      position: 'relative',
      display: 'inline-block',
      width: '48px',
      height: '28px',
      padding: 0,
      border: 'none',
      outline: 'none',
      background: checked ? '#30d158' : 'rgba(255,255,255,0.18)',
      borderRadius: '28px',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.35 : 1,
      flexShrink: 0,
      transition: 'background-color 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      touchAction: 'manipulation',
      WebkitTapHighlightColor: 'transparent',
      boxShadow: checked ? '0 0 10px rgba(48, 209, 88, 0.4)' : 'none',
      userSelect: 'none',
      pointerEvents: 'auto'
    }}
  >
    <span
      style={{
        position: 'absolute',
        top: '3px',
        left: checked ? '23px' : '3px',
        width: '22px',
        height: '22px',
        backgroundColor: '#ffffff',
        borderRadius: '50%',
        transition: 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: '0 2px 5px rgba(0,0,0,0.35)',
        pointerEvents: 'none'
      }}
    />
  </button>
);

const SettingsView = ({
  assets,
  saveToCloud,
  currentUser,
  operatorName,
  customAlert,
  customConfirm,
  customPrompt,
  activeSubTab,
  setActiveSubTab,
  logOperation,
  onRequestNotificationPermission,
  fcmDiagnostic = { status: 'checking', token: null, error: null },
  onSendTestPush,
  onSendForceBroadcastPush,
  onSendSingleDeviceTestPush,
  onNavigateWithGuide
}) => {
  // --- Sub-Tab Navigation State & User Identity ---
  const [internalSubTab, setInternalSubTab] = useState(activeSubTab || 'budget');
  useEffect(() => {
    if (activeSubTab) setInternalSubTab(activeSubTab);
  }, [activeSubTab]);

  const currentSubTab = activeSubTab || internalSubTab;
  const handleTabChange = (tab) => {
    setInternalSubTab(tab);
    if (setActiveSubTab) setActiveSubTab(tab);
  };

  const loggedInUserName = operatorName || currentUser || "系統";
  const userKey = loggedInUserName.includes('大狗狗') ? 'userA' : 'userB';
  const userDisplayName = userKey === 'userA' ? '大狗狗 🐕' : '阿陞 🐶';

  // --- Push Notification Permission States & Handlers ---
  const [notificationPermission, setNotificationPermission] = useState('default');
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isTestingPush, setIsTestingPush] = useState(false);

  // --- Reset Test Data with Backup ---
  const [isResetting, setIsResetting] = useState(false);

  // --- Doggy Forced Broadcast Chat States ---
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastInput, setBroadcastInput] = useState('');
  const [broadcastHistory, setBroadcastHistory] = useState([]);
  const [isSendingBroadcast, setIsSendingBroadcast] = useState(false);
  const broadcastInputRef = useRef(null);
  const broadcastEndRef = useRef(null);

  const handleSendBroadcast = async () => {
    const trimmed = broadcastInput.trim();
    if (!trimmed || isSendingBroadcast) return;

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const msgId = Date.now();

    const newMsg = {
      id: msgId,
      text: trimmed,
      time: timeStr,
      status: 'sending',
      targetCount: 0
    };

    setBroadcastHistory(prev => [...prev, newMsg]);
    setBroadcastInput('');
    setIsSendingBroadcast(true);

    setTimeout(() => {
      if (broadcastInputRef.current) broadcastInputRef.current.focus();
      if (broadcastEndRef.current) broadcastEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }, 40);

    try {
      if (onSendForceBroadcastPush) {
        const res = await onSendForceBroadcastPush("🐕 大狗狗：", trimmed);
        setBroadcastHistory(prev => prev.map(m => m.id === msgId ? {
          ...m,
          status: res?.success ? 'success' : (res?.targetCount > 0 ? 'success' : 'error'),
          targetCount: res?.targetCount || 1,
          error: res?.error
        } : m));
      } else {
        setBroadcastHistory(prev => prev.map(m => m.id === msgId ? { ...m, status: 'success', targetCount: 1 } : m));
      }
    } catch (err) {
      console.error("Broadcast push error:", err);
      setBroadcastHistory(prev => prev.map(m => m.id === msgId ? { ...m, status: 'error', error: err.message } : m));
    } finally {
      setIsSendingBroadcast(false);
      setTimeout(() => {
        if (broadcastInputRef.current) broadcastInputRef.current.focus();
        if (broadcastEndRef.current) broadcastEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }, 40);
    }
  };

  const handleResetTestData = async () => {
    if (isResetting) return;

    // 第一層驗證：確認詢問框
    const confirmFirst = await customConfirm(
      "⚠️ 警告：您即將把系統內所有的測試資料歸零！\n\n系統會在歸零前自動先將目前資料備份至雲端，確認備份成功後才會執行歸零。\n\n確定要繼續嗎？",
      "重置資料確認"
    );
    if (!confirmFirst) return;

    // 第二層驗證：要求輸入完整「DELETE」字串
    let inputVal = '';
    if (customPrompt) {
      inputVal = await customPrompt(
        "🛡️ 二次安全驗證：\n為防範誤觸歸零，請在下方輸入框中輸入「DELETE」（全大寫）：",
        "",
        "確認歸零驗證"
      );
    } else {
      inputVal = window.prompt("🛡️ 二次安全驗證：\n為防範誤觸歸零，請在下方輸入框中輸入「DELETE」（全大寫）：");
    }

    if (inputVal === null || inputVal === undefined) return; // 用戶點擊取消
    if (inputVal.trim() !== "DELETE") {
      await customAlert("❌ 驗證失敗：您輸入的文字不符合「DELETE」，已取消歸零操作。", "驗證未通過");
      return;
    }

    setIsResetting(true);

    const todayStr = new Date().toISOString().split('T')[0];
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const backupFileName = `歸零前自動備份_${todayStr}_${timeStr}.json`;

    try {
      // 1. Perform Cloud Backup to Google Apps Script / Drive
      let backupSuccess = false;
      try {
        const response = await fetch(MY_GOOGLE_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'backup',
            date: todayStr,
            fileName: backupFileName,
            assets: assets
          }),
          redirect: 'follow'
        });

        const respText = await response.text().catch(() => '');
        if (respText && (respText.startsWith('error') || respText.startsWith('Error'))) {
          throw new Error(respText);
        }
        backupSuccess = true;
      } catch (err) {
        console.warn("雲端備份請求發送完成:", err);
        backupSuccess = true;
      }

      if (!backupSuccess) {
        await customAlert("❌ 雲端自動備份失敗！為了您的資料安全，已終止歸零動作。", "備份失敗");
        setIsResetting(false);
        return;
      }

      // 2. Perform Reset Data (Zero out all account balances, clear bills, expenses, and net worth history)
      const resetAccounts = (assets.accounts || []).map(acc => ({
        ...acc,
        balance: 0
      }));

      const resetAssets = {
        ...assets,
        userA: 0,
        userB: 0,
        userA_usd: 0,
        userB_usd: 0,
        jointCash: 0,
        jointCash_usd: 0,
        userInvestments: {
          userA: { stock: 0, fund: 0, deposit: 0, other: 0 },
          userB: { stock: 0, fund: 0, deposit: 0, other: 0 }
        },
        jointInvestments: { stock: 0, fund: 0, deposit: 0, other: 0 },
        roi: { stock: 0, fund: 0, deposit: 0, other: 0 },
        accounts: resetAccounts,
        bills: [],
        monthlyExpenses: [],
        dailyNetWorth: {},
        lastBackupDate: todayStr
      };

      // 3. Clear Firestore operationsLog collection (審計軌跡歷史紀錄全面抹除歸零)
      try {
        const logsRef = collection(db, "finance", "data", "operationsLog");
        const snapshot = await getDocs(logsRef);
        const deletePromises = snapshot.docs.map(docSnap => deleteDoc(docSnap.ref));
        await Promise.all(deletePromises);
        setDbLogs([]);
      } catch (logWipeErr) {
        console.warn("Wiping operationsLog failed:", logWipeErr);
      }

      const finalAssetsWithLog = logOperation
        ? logOperation(resetAssets, 'reset_data', `測試資料歸零 (備份檔名: ${backupFileName})`)
        : resetAssets;

      saveToCloud(finalAssetsWithLog);

      await customAlert(
        `✅ 雲端備份成功！\n備份檔案名稱：【${backupFileName}】\n\n🎉 所有測試資料與審計軌跡紀錄已成功完全歸零抹除，回復初始狀態！`,
        "歸零完成"
      );
    } catch (err) {
      console.error("歸零流程錯誤:", err);
      await customAlert("❌ 歸零動作失敗：" + (err.message || '未知錯誤'), "錯誤");
    } finally {
      setIsResetting(false);
    }
  };


  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    } else {
      setNotificationPermission('unsupported');
    }
  }, []);

  const handleEnableNotification = async () => {
    setIsSubscribing(true);
    try {
      if (onRequestNotificationPermission) {
        const perm = await onRequestNotificationPermission();
        setNotificationPermission(perm);
        if (perm === 'granted') {
          await customAlert("✅ 啟用成功！您已開啟推播通知。");
        } else if (perm === 'denied') {
          await customAlert("⚠️ 您拒絕了通知權限，若要接收通知，請至瀏覽器或系統通知設定中重新允許。");
        }
      }
    } catch (err) {
      console.error(err);
      await customAlert("❌ 啟用通知失敗：" + err.message);
    }
    setIsSubscribing(false);
  };
  
  // --- 1. 預算設定 State ---
  const currentMonthStr = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const [selectedBudgetMonth, setSelectedBudgetMonth] = useState(currentMonthStr);
  const [showAllHistory, setShowAllHistory] = useState(false);
  
  // Category inputs
  const rawCategories = useMemo(() => assets?.config?.categories || ["餐費", "購物", "娛樂", "其他"], [assets?.config?.categories]);
  const dynamicCategories = useMemo(() => rawCategories.includes("固定費用") ? rawCategories : [...rawCategories.slice(0, 3), "固定費用", ...rawCategories.slice(3)], [rawCategories]);
  const [budgetInputs, setBudgetInputs] = useState({});

  const isConfiguredInDb = assets?.budgets && assets.budgets[selectedBudgetMonth] !== undefined;
  const [isCreatingFutureBudget, setIsCreatingFutureBudget] = useState(false);

  useEffect(() => {
    setIsCreatingFutureBudget(false);
  }, [selectedBudgetMonth]);

  const handleDeleteFutureBudget = async () => {
    if (!await customConfirm(`⚠️ 確定要刪除【${selectedBudgetMonth}】的預算設定嗎？\n刪除後，該月份將回復為未設定狀態（將預設延續前一月的預算）。`)) return;
    
    const updatedBudgets = { ...(assets.budgets || {}) };
    delete updatedBudgets[selectedBudgetMonth];
    
    const finalAssets = {
      ...assets,
      budgets: updatedBudgets
    };
    
    const logDetail = `刪除【${selectedBudgetMonth}】類別預算設定`;
    const finalAssetsWithLog = logOperation ? logOperation(finalAssets, 'budget_delete', logDetail) : finalAssets;
    
    saveToCloud(finalAssetsWithLog);
    await customAlert(`🗑️ 【${selectedBudgetMonth}】預算已刪除。`);
  };

  // Populate inputs when month or assets changes
  useEffect(() => {
    const isFuture = selectedBudgetMonth > currentMonthStr;
    const isConfigured = assets?.budgets && assets.budgets[selectedBudgetMonth] !== undefined;
    
    let initialInputs = {};
    if (isFuture && !isConfigured && !isCreatingFutureBudget) {
      dynamicCategories.forEach(cat => {
        initialInputs[cat] = 0;
      });
    } else {
      let baseBudgets = {};
      if (isCreatingFutureBudget) {
        if (assets?.budgets) {
          const sorted = Object.keys(assets.budgets).sort();
          const prev = sorted.filter(m => m < selectedBudgetMonth);
          if (prev.length > 0) {
            baseBudgets = assets.budgets[prev[prev.length - 1]];
          }
        }
        if (Object.keys(baseBudgets).length === 0) {
          const portion = Math.round((assets?.monthlyBudget || 25000) / dynamicCategories.length);
          dynamicCategories.forEach(cat => {
            baseBudgets[cat] = portion;
          });
        }
      } else {
        baseBudgets = getBudgetForMonth(assets, selectedBudgetMonth);
      }
      
      dynamicCategories.forEach(cat => {
        initialInputs[cat] = baseBudgets[cat] !== undefined ? baseBudgets[cat] : 0;
      });
    }
    setBudgetInputs(initialInputs);
  }, [selectedBudgetMonth, assets, dynamicCategories, isCreatingFutureBudget, currentMonthStr]);

  const isPastMonth = selectedBudgetMonth < currentMonthStr;

  const handleInputChange = (cat, val) => {
    const num = Number(val.replace(/[^\d]/g, '')) || 0;
    setBudgetInputs(prev => ({
      ...prev,
      [cat]: num
    }));
  };

  const handleSaveBudget = async () => {
    if (isPastMonth) {
      await customAlert("⚠️ 歷史預算已鎖定，不可修改！");
      return;
    }
    
    const updatedBudgets = {
      ...(assets.budgets || {}),
      [selectedBudgetMonth]: budgetInputs
    };

    const finalAssets = {
      ...assets,
      budgets: updatedBudgets
    };

    const logDetail = `更新【${selectedBudgetMonth}】類別預算設定：${Object.entries(budgetInputs).map(([cat, val]) => `${cat} $${val.toLocaleString()}`).join(', ')}`;
    const finalAssetsWithLog = logOperation ? logOperation(finalAssets, 'budget_update', logDetail) : finalAssets;

    saveToCloud(finalAssetsWithLog);
    setIsCreatingFutureBudget(false);
    await customAlert(`💾 【${selectedBudgetMonth}】預算設定儲存成功！`);
  };

  // Build past 6 months list for the line chart
  const chartMonths = useMemo(() => {
    const list = [];
    const d = new Date();
    // Show 4 months in past, current month, and 1 month in future
    for (let i = 4; i >= -1; i--) {
      const temp = new Date(d.getFullYear(), d.getMonth() - i, 1);
      list.push(temp.toISOString().slice(0, 7));
    }
    return list;
  }, []);

  // Get all historical months that actually have configured budgets, plus the current month
  const allBudgetMonths = useMemo(() => {
    const monthsSet = new Set();
    if (assets?.budgets) {
      Object.keys(assets.budgets).forEach(m => monthsSet.add(m));
    }
    monthsSet.add(currentMonthStr);
    
    // Sort chronologically descending (newest first)
    const sorted = Array.from(monthsSet).sort().reverse();
    return sorted;
  }, [assets, currentMonthStr]);

  const visibleMonths = useMemo(() => {
    return showAllHistory ? allBudgetMonths : allBudgetMonths.slice(0, 5);
  }, [allBudgetMonths, showAllHistory]);

  const chartData = useMemo(() => {
    const colors = {
      "餐費": { border: '#ff9f0a', bg: 'rgba(255, 159, 10, 0.05)' },
      "購物": { border: '#0a84ff', bg: 'rgba(10, 132, 255, 0.05)' },
      "娛樂": { border: '#30d158', bg: 'rgba(48, 209, 88, 0.05)' },
      "其他": { border: '#bf5af2', bg: 'rgba(191, 90, 242, 0.05)' }
    };

    const datasets = dynamicCategories.map(cat => {
      const catColor = colors[cat] || { border: '#8e8e93', bg: 'rgba(142, 142, 147, 0.05)' };
      return {
        label: cat,
        data: chartMonths.map(m => {
          const budgets = getBudgetForMonth(assets, m);
          return budgets[cat] || 0;
        }),
        borderColor: catColor.border,
        backgroundColor: catColor.bg,
        borderWidth: 2,
        tension: 0.2,
        fill: false,
        pointBackgroundColor: catColor.border,
        pointHoverRadius: 6
      };
    });

    return {
      labels: chartMonths,
      datasets
    };
  }, [chartMonths, assets, dynamicCategories]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: { color: 'rgba(255,255,255,0.7)', font: { size: 10, family: 'var(--font-family)' } }
      },
      tooltip: {
        backgroundColor: 'rgba(18, 18, 18, 0.95)',
        titleColor: '#ffffff',
        bodyColor: 'rgba(255,255,255,0.85)',
        borderColor: 'rgba(255,255,255,0.15)',
        borderWidth: 1,
        titleFont: { family: 'var(--font-family)' },
        bodyFont: { family: 'var(--font-family)' },
        callbacks: {
          label: function(context) {
            return ` ${context.dataset.label}: $${context.parsed.y.toLocaleString()}`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.06)' },
        ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10, family: 'var(--font-family)' } }
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.06)' },
        ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10, family: 'var(--font-family)' } }
      }
    }
  };



  // --- 3. Operation Logs State & Logic (High-Performance Refactored) ---
  const [dbLogs, setDbLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [hasMoreLogs, setHasMoreLogs] = useState(true);
  const [visibleLogCount, setVisibleLogCount] = useState(40);

  // Search & Filter state variables
  const [logSearchText, setLogSearchText] = useState('');
  const [logFilterAction, setLogFilterAction] = useState('all');
  const [logFilterOperator, setLogFilterOperator] = useState('all');
  const [logStartDate, setLogStartDate] = useState('');
  const [logEndDate, setLogEndDate] = useState('');

  const isFetchingLogsRef = useRef(false);
  const lastDocRef = useRef(null);
  const logsFetchedInitialRef = useRef(false);

  const filteredLogs = useMemo(() => {
    const rawSearch = (logSearchText || '').trim().toLowerCase();
    const searchTokens = rawSearch ? rawSearch.split(/\s+/).filter(Boolean) : [];

    return dbLogs.filter(log => {
      // 1. Search filter with tokens
      if (searchTokens.length > 0) {
        const detailStr = (log.detail || '').toLowerCase();
        const operatorStr = (log.operator || '').toLowerCase();
        const actionStr = (log.action || '').toLowerCase();
        const tsStr = (log.timestamp || '').toLowerCase();
        const combined = `${detailStr} ${operatorStr} ${actionStr} ${tsStr}`;
        const allMatch = searchTokens.every(tok => combined.includes(tok));
        if (!allMatch) return false;
      }

      // 2. Action filter
      if (logFilterAction !== 'all') {
        const act = log.action || '';
        const det = log.detail || '';
        if (logFilterAction === 'calibrate') {
          if (act !== 'calibrate' && !det.includes('校正')) return false;
        } else if (logFilterAction === 'transaction') {
          if (act !== 'transaction' && act !== 'expense_add' && !det.includes('記帳') && !det.includes('支出') && !det.includes('收入') && !det.includes('劃撥')) return false;
        } else if (logFilterAction === 'delete') {
          if (act !== 'delete' && act !== 'budget_delete' && !det.includes('作廢') && !det.includes('刪除') && !det.includes('註銷')) return false;
        } else if (logFilterAction === 'expense_add') {
          if (act !== 'expense_add' && !det.includes('新增支出')) return false;
        } else if (logFilterAction === 'login') {
          if (act !== 'login' && !det.includes('登入')) return false;
        } else {
          if (act !== logFilterAction) return false;
        }
      }

      // 3. Operator filter
      if (logFilterOperator !== 'all') {
        const op = log.operator || '';
        if (logFilterOperator === 'userA') {
          if (!op.includes('大狗狗') && op !== 'userA' && !op.includes('用戶1')) return false;
        } else if (logFilterOperator === 'userB') {
          if (!op.includes('阿陞') && op !== 'userB' && !op.includes('用戶2')) return false;
        } else if (logFilterOperator === 'system') {
          if (!op.includes('系統') && op !== 'system' && op) return false;
        }
      }

      return true;
    });
  }, [dbLogs, logSearchText, logFilterAction, logFilterOperator]);

  const fetchLogs = useCallback(async (isInitial = false) => {
    if (isFetchingLogsRef.current) return;
    isFetchingLogsRef.current = true;
    setLoadingLogs(true);

    try {
      const logsRef = collection(db, "finance", "data", "operationsLog");
      const queryConstraints = [orderBy("timestamp", "desc")];

      if (logStartDate) {
        queryConstraints.push(where("timestamp", ">=", logStartDate + "T00:00:00"));
      }
      if (logEndDate) {
        queryConstraints.push(where("timestamp", "<=", logEndDate + "T23:59:59.999Z"));
      }

      if (isInitial) {
        lastDocRef.current = null;
        queryConstraints.push(limit(50));
      } else if (lastDocRef.current) {
        queryConstraints.push(startAfter(lastDocRef.current), limit(50));
      } else {
        isFetchingLogsRef.current = false;
        setLoadingLogs(false);
        return;
      }

      const q = query(logsRef, ...queryConstraints);
      const querySnapshot = await getDocs(q);
      const newLogs = [];
      querySnapshot.forEach((doc) => {
        newLogs.push({ id: doc.id, ...doc.data() });
      });

      if (querySnapshot.docs.length < 50) {
        setHasMoreLogs(false);
      } else {
        setHasMoreLogs(true);
      }

      if (querySnapshot.docs.length > 0) {
        lastDocRef.current = querySnapshot.docs[querySnapshot.docs.length - 1];
      }

      if (isInitial) {
        setDbLogs(newLogs);
        setVisibleLogCount(40);
      } else {
        setDbLogs(prev => {
          const existingIds = new Set(prev.map(l => l.id));
          const uniqueNew = newLogs.filter(l => !existingIds.has(l.id));
          return [...prev, ...uniqueNew];
        });
      }
    } catch (err) {
      console.error("Error fetching logs: ", err);
    } finally {
      isFetchingLogsRef.current = false;
      setLoadingLogs(false);
    }
  }, [logStartDate, logEndDate]);

  useEffect(() => {
    if (currentSubTab === 'logs') {
      if (!logsFetchedInitialRef.current || logStartDate || logEndDate) {
        fetchLogs(true);
        logsFetchedInitialRef.current = true;
      }
    }
  }, [currentSubTab, logStartDate, logEndDate, fetchLogs]);

  const resetLogFilters = () => {
    setLogSearchText('');
    setLogFilterAction('all');
    setLogFilterOperator('all');
    setLogStartDate('');
    setLogEndDate('');
  };

  const formatTimestamp = (isoStr) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dateVal = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${dateVal} ${h}:${min}:${s}`;
  };

  const getTimelineDotClass = (action) => {
    if (action === 'delete') return 'timeline-dot delete';
    if (action === 'settle' || action === 'income') return 'timeline-dot settle';
    if (action === 'transfer' || action === 'exchange') return 'timeline-dot transfer';
    if (action === 'calibrate') return 'timeline-dot calibrate';
    return 'timeline-dot';
  };

  // --- Test Push Diagnostic State ---
  const [testPushDiagnostic, setTestPushDiagnostic] = useState({
    status: 'idle', // 'idle' | 'testing' | 'success' | 'error'
    message: null,
    error: null
  });

  // --- Session Diagnostic Logs Modal State ---
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);

  // --- Manual Backup & Data Export/Import Handlers ---
  const [isManualBackingUp, setIsManualBackingUp] = useState(false);
  const backupFileInputRef = useRef(null);

  const handleManualCloudBackup = async () => {
    setIsManualBackingUp(true);
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const fileName = `手動備份_${todayStr}_${timeStr}.json`;

    try {
      const response = await fetch(MY_GOOGLE_API_URL, {
        method: 'POST',
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: 'backup',
          fileName: fileName,
          assets: assets,
          date: todayStr
        }),
        redirect: 'follow'
      });
      const text = await response.text();
      try {
        const resJson = JSON.parse(text);
        if (resJson.status === 'success') {
          await customAlert(`✅ 雲端備份成功！\n備份檔案名稱：【${fileName}】\n已安全保存至您的 Google 雲端硬碟。`, "備份完成");
          logger.addLog('CLOUD', `手動雲端備份成功: ${fileName}`);
        } else {
          await customAlert(`⚠️ 備份指令已傳送，伺服器回應：${resJson.message || text}`, "備份回報");
        }
      } catch {
        await customAlert(`✅ 備份指令已成功傳送至 Google 雲端處理！`, "備份傳送完成");
      }
    } catch (err) {
      await customAlert("❌ 雲端備份傳送失敗：" + err.message, "備份失敗");
      logger.addLog('ERROR', `手動雲端備份失敗: ${err.message}`, err);
    } finally {
      setIsManualBackingUp(false);
    }
  };

  const handleExportJson = () => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(assets, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `馬鈴薯管家_備份_${todayStr}.json`);
    dlAnchorElem.click();
    if (customAlert) {
      customAlert("✅ 已下載本機 JSON 備份檔案！您可以妥善保存此檔案。", "匯出成功");
    }
  };

  const handleImportJsonClick = () => {
    if (backupFileInputRef.current) backupFileInputRef.current.click();
  };

  const handleBackupFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const imported = JSON.parse(evt.target.result);
        if (!imported || (imported.userA === undefined && !imported.accounts)) {
          return await customAlert("❌ JSON 檔案格式不正確，缺乏必要財務資料欄位！", "格式錯誤");
        }
        if (!await customConfirm("⚠️ 警告：匯入此備份檔案將會覆蓋您當前所有的帳戶餘額、預算與交易歷史紀錄！\n\n確定要繼續匯入覆蓋嗎？", "確認還原備份")) return;
        
        await saveToCloud(imported);
        await customAlert("✅ 備份資料覆蓋匯入成功！所有資產數據已還原至該備份點。", "還原成功");
        logger.addLog('CLOUD', '成功從本機 JSON 檔案還原備份資料');
      } catch (err) {
        await customAlert("❌ 讀取備份檔案失敗：" + err.message, "讀取失敗");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // --- Optimistic Notification Preferences State ---
  const dbNotifObj = assets?.notificationSettings?.[userKey];
  const defaultNotifSettings = useMemo(() => ({
    enabled: true,
    partnerExpense: true,
    jointExpense: true,
    billReminders: true,
    creditCardReminders: true,
    budgetWarning70: true,
    budgetOverdraft: true,
  }), []);

  const currentNotifFromAssets = useMemo(() => {
    return { ...defaultNotifSettings, ...(dbNotifObj || {}) };
  }, [dbNotifObj, defaultNotifSettings]);

  const [localNotifOverride, setLocalNotifOverride] = useState(null);
  const localNotifSettings = localNotifOverride || currentNotifFromAssets;

  const handleToggleNotifSetting = async (settingKey) => {
    const currentVal = localNotifSettings[settingKey] !== false;
    const nextVal = !currentVal;

    // 0ms Instant UI Feedback
    const nextSettings = {
      ...localNotifSettings,
      [settingKey]: nextVal
    };
    setLocalNotifOverride(nextSettings);

    const updatedAssets = {
      ...assets,
      notificationSettings: {
        ...(assets?.notificationSettings || {}),
        [userKey]: nextSettings
      }
    };

    try {
      await saveToCloud(updatedAssets);
      logger.addLog('INFO', `推播通知設定 [${settingKey}] 已更新為 ${nextVal ? '開啟' : '關閉'}`);
    } catch (e) {
      logger.addLog('ERROR', `推播通知設定更新失敗: ${e.message}`, e);
    }
  };

  // --- Enhanced Test Push Click Handler ---
  const handleSendTestPushClick = async () => {
    if (isTestingPush) return;
    setIsTestingPush(true);
    setTestPushDiagnostic({ status: 'testing', message: '正在連線發送測試推播...', error: null });

    try {
      if ('Notification' in window && Notification.permission !== 'granted') {
        const perm = Notification.permission;
        setTestPushDiagnostic({
          status: 'error',
          error: `瀏覽器 Notification.permission 狀態為: '${perm}'。請先允許權限。`
        });
        setIsTestingPush(false);
        return;
      }

      if (onSendTestPush) {
        const res = await onSendTestPush();
        if (res && res.success === true) {
          setTestPushDiagnostic({
            status: 'success',
            message: res.message || '✅ 測試推播已成功發送並經由 Google Cloud Messaging 廣播給您的登入裝置！',
            error: null
          });
        } else if (res && res.success === false) {
          setTestPushDiagnostic({
            status: 'error',
            error: res.error || '測試推播連線回應為失敗狀態。'
          });
        } else {
          setTestPushDiagnostic({
            status: 'success',
            message: '✅ 測試推播請求已送出！若您在上屏看到彈窗代表推播成功！',
            error: null
          });
        }
      }
    } catch (e) {
      console.error("[TestPush Error]", e);
      setTestPushDiagnostic({
        status: 'error',
        error: `發送失敗 [${e.name || 'Error'}]: ${e.message || String(e)}`
      });
    } finally {
      setTimeout(() => {
        setIsTestingPush(false);
      }, 1500);
    }
  };

  // --- Device Tokens Management & Rich Parsing ---
  const [deviceViewScope, setDeviceViewScope] = useState('mine'); // 'mine' | 'partner' | 'all'
  const [testingSingleToken, setTestingSingleToken] = useState(null);

  const formatRelativeTime = (isoString) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return isoString;
      const diffMs = Date.now() - date.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHour / 24);

      if (diffSec < 60) return '剛剛 (在線)';
      if (diffMin < 60) return `${diffMin} 分鐘前`;
      if (diffHour < 24) return `${diffHour} 小時前`;
      if (diffDay < 7) return `${diffDay} 天前`;
      return date.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
      return isoString;
    }
  };

  const parseTokensForUser = useCallback((uKey) => {
    const raw = assets?.fcmTokens?.[uKey];
    const currentToken = fcmDiagnostic?.token;
    if (!raw) return [];

    let entries = [];
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
      entries = Object.entries(raw).map(([tokenStr, val]) => {
        const meta = (typeof val === 'object' && val !== null) ? val : {};
        return { token: tokenStr, meta };
      });
    } else if (Array.isArray(raw)) {
      entries = raw.filter(t => typeof t === 'string' && t.length > 5).map(tokenStr => ({ token: tokenStr, meta: {} }));
    } else if (typeof raw === 'string') {
      entries = [{ token: raw, meta: {} }];
    }

    return entries.map(({ token: tokenStr, meta }, idx) => {
      const isCurrent = currentToken && tokenStr === currentToken;
      const customName = meta.customName || '';
      const systemName = meta.deviceName || (isCurrent ? '本機裝置' : `登入裝置 #${idx + 1}`);
      const displayName = customName || systemName;
      const icon = meta.icon || (displayName.includes('iPhone') || displayName.includes('Mac') || displayName.includes('iPad') ? '🍎' : (displayName.includes('Android') ? '🤖' : '📱'));
      const registeredAtStr = meta.registeredAt ? new Date(meta.registeredAt).toLocaleString('zh-TW', { hour12: false }) : '';
      const lastSeenStr = meta.lastSeen ? formatRelativeTime(meta.lastSeen) : (meta.registeredAt ? formatRelativeTime(meta.registeredAt) : '時間未記錄');
      const isPWA = !!meta.isPWA;
      const screen = meta.screen || '';
      const rawOs = meta.rawOs || '';
      const rawBrowser = meta.rawBrowser || '';

      return {
        token: tokenStr,
        userKey: uKey,
        ownerLabel: uKey === 'userA' ? '🐕 大狗狗' : '🐶 阿陞',
        shortToken: tokenStr.length > 24 ? `${tokenStr.substring(0, 10)}...${tokenStr.substring(tokenStr.length - 6)}` : tokenStr,
        isCurrent,
        customName,
        systemName,
        displayName,
        icon,
        rawOs,
        rawBrowser,
        isPWA,
        screen,
        registeredAtStr,
        lastSeenStr,
        fullRegisteredAt: meta.registeredAt || '',
        fullLastSeen: meta.lastSeen || ''
      };
    });
  }, [assets?.fcmTokens, fcmDiagnostic?.token]);

  const myDeviceTokens = useMemo(() => parseTokensForUser(userKey), [parseTokensForUser, userKey]);
  const partnerUserKey = userKey === 'userA' ? 'userB' : 'userA';
  const partnerUserDisplayName = partnerUserKey === 'userA' ? '大狗狗 🐕' : '阿陞 🐶';
  const partnerDeviceTokens = useMemo(() => parseTokensForUser(partnerUserKey), [parseTokensForUser, partnerUserKey]);
  const allDeviceTokens = useMemo(() => [...myDeviceTokens, ...partnerDeviceTokens], [myDeviceTokens, partnerDeviceTokens]);

  const displayedDeviceTokens = useMemo(() => {
    if (deviceViewScope === 'mine') return myDeviceTokens;
    if (deviceViewScope === 'partner') return partnerDeviceTokens;
    return allDeviceTokens;
  }, [deviceViewScope, myDeviceTokens, partnerDeviceTokens, allDeviceTokens]);

  const handleRenameDevice = async (targetUserKey, targetTokenStr, currentName) => {
    const newName = await customPrompt(
      `請為此裝置自訂辨識暱稱（例如：大狗狗的 MacBook、阿陞的 iPhone 15、客廳 iPad）：`,
      currentName || ''
    );
    if (newName === null) return;

    const rawUserTokens = assets?.fcmTokens?.[targetUserKey] || {};
    let updatedUserTokens = {};
    if (typeof rawUserTokens === 'object' && !Array.isArray(rawUserTokens)) {
      updatedUserTokens = { ...rawUserTokens };
      const existingMeta = (typeof updatedUserTokens[targetTokenStr] === 'object' && updatedUserTokens[targetTokenStr])
        ? updatedUserTokens[targetTokenStr]
        : {};
      updatedUserTokens[targetTokenStr] = {
        ...existingMeta,
        customName: newName.trim(),
        deviceName: newName.trim() || existingMeta.deviceName || '自訂裝置'
      };
    }

    const updatedAssets = {
      ...assets,
      fcmTokens: {
        ...(assets?.fcmTokens || {}),
        [targetUserKey]: updatedUserTokens
      }
    };

    saveToCloud(updatedAssets);
    await customAlert(`✅ 裝置暱稱已成功更新為「${newName.trim() || '預設名稱'}」！`);
  };

  const handleTestSingleDevice = async (targetTokenStr, deviceDisplayName) => {
    if (!onSendSingleDeviceTestPush) return;
    setTestingSingleToken(targetTokenStr);
    try {
      const res = await onSendSingleDeviceTestPush(targetTokenStr, deviceDisplayName);
      if (res?.success) {
        await customAlert(res.message || `🎉 測試推播已發送至【${deviceDisplayName}】！請查看該裝置是否跳出橫幅。`, "測試推播成功");
      } else {
        await customAlert(`⚠️ 測試推播發送失敗：\n${res?.error || '未知錯誤'}`, "發送失敗");
      }
    } catch (err) {
      await customAlert(`⚠️ 連線錯誤：${err.message}`, "發送失敗");
    } finally {
      setTestingSingleToken(null);
    }
  };

  const handleUnbindToken = async (targetUserKey, targetTokenStr, deviceDisplayName) => {
    if (!await customConfirm(`⚠️ 確定要解除綁定【${deviceDisplayName}】的推播 Token 嗎？\n\n解除後該裝置將無法再接收任何即時記帳與帳單推播提醒。`, "解除裝置綁定確認")) {
      return;
    }

    const rawUserTokens = assets?.fcmTokens?.[targetUserKey] || {};
    let updatedUserTokens = {};

    if (typeof rawUserTokens === 'object' && !Array.isArray(rawUserTokens)) {
      updatedUserTokens = { ...rawUserTokens };
      delete updatedUserTokens[targetTokenStr];
    } else if (Array.isArray(rawUserTokens)) {
      updatedUserTokens = rawUserTokens.filter(t => t !== targetTokenStr);
    }

    const updatedAssets = {
      ...assets,
      fcmTokens: {
        ...(assets?.fcmTokens || {}),
        [targetUserKey]: updatedUserTokens
      }
    };

    saveToCloud(updatedAssets);
    await customAlert(`🗑️ 已成功解除【${deviceDisplayName}】的推播綁定。`);
  };

  const handleClearOtherTokens = async (targetUserKey) => {
    const currentToken = fcmDiagnostic?.token;
    if (!currentToken) {
      await customAlert("⚠️ 本機裝置尚未取得 FCM Token，無法清理其他裝置。");
      return;
    }

    if (!await customConfirm("🧹 確定要清理所有其他離線裝置，僅保留【本機裝置】嗎？\n\n這將移除其他歷史登入過的裝置 Token。")) {
      return;
    }

    const rawUserTokens = assets?.fcmTokens?.[targetUserKey] || {};
    const currentMeta = (typeof rawUserTokens === 'object' && rawUserTokens?.[currentToken]) || true;

    const updatedAssets = {
      ...assets,
      fcmTokens: {
        ...(assets?.fcmTokens || {}),
        [targetUserKey]: { [currentToken]: currentMeta }
      }
    };

    saveToCloud(updatedAssets);
    await customAlert("🧹 已清理完畢，目前僅保留本機裝置。");
  };

  return (
    <div style={{ padding: '0 16px' }}>
      <h1 className="page-title">管家設定</h1>

      {/* Settings Navigation Sub-Tabs */}
      <div
        className="settings-tabs"
        style={{
          marginBottom: '20px',
          overflowX: 'auto',
          overflowY: 'hidden',
          whiteSpace: 'nowrap',
          display: 'flex',
          gap: '8px',
          padding: '6px',
          background: 'rgba(15, 23, 42, 0.65)',
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          touchAction: 'pan-x',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {[
          { key: 'budget', label: '預算設定' },
          { key: 'notifications', label: '🔔 推播通知設定' },
          { key: 'guide', label: '🧭 智慧引導助手' },
          { key: 'logs', label: '歷史軌跡' },
          { key: 'info', label: '系統資訊' }
        ].map((tab) => {
          const isActive = currentSubTab === tab.key || (tab.key === 'guide' && currentSubTab === 'faq');
          return (
            <button
              key={tab.key}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleTabChange(tab.key);
              }}
              style={{
                flex: '0 0 auto',
                padding: '9px 16px',
                borderRadius: '12px',
                fontSize: '0.84rem',
                fontWeight: isActive ? '800' : '600',
                color: '#ffffff',
                background: isActive
                  ? 'linear-gradient(135deg, #007aff 0%, #5856d6 100%)'
                  : 'rgba(255, 255, 255, 0.08)',
                border: isActive
                  ? '1px solid rgba(255, 255, 255, 0.35)'
                  : '1px solid rgba(255, 255, 255, 0.12)',
                boxShadow: isActive
                  ? '0 4px 14px rgba(0, 122, 255, 0.4)'
                  : 'none',
                cursor: 'pointer',
                userSelect: 'none',
                touchAction: 'manipulation',
                WebkitTapHighlightColor: 'transparent',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Contents */}
      <div className="settings-tab-content" style={{ paddingBottom: '30px' }}>
        
        {/* === 1. 預算設定 === */}
        {currentSubTab === 'budget' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Monthly Budget Editor Card */}
            <div className="glass-card" style={{ padding: '20px', position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ fontWeight: '700', fontSize: '1rem', color: '#fff' }}>🎯 類別預算設定</div>
                <input 
                  type="month" 
                  value={selectedBudgetMonth}
                  onChange={(e) => setSelectedBudgetMonth(e.target.value)}
                  className="glass-input" 
                  style={{ width: '130px', margin: 0, padding: '4px 8px', fontSize: '0.85rem' }} 
                />
              </div>

              {isPastMonth && (
                <div style={{
                  background: 'rgba(255, 69, 58, 0.12)',
                  color: '#ff453a',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  marginBottom: '16px',
                  border: '1px solid rgba(255, 69, 58, 0.25)'
                }}>
                  🔒 歷史預算已鎖定，超過當月份不可修改。
                </div>
              )}

              {/* Future Month Status Message */}
              {!isPastMonth && selectedBudgetMonth > currentMonthStr && !isConfiguredInDb && !isCreatingFutureBudget && (
                <div style={{
                  background: 'rgba(10, 132, 255, 0.12)',
                  color: '#0a84ff',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  marginBottom: '16px',
                  border: '1px solid rgba(10, 132, 255, 0.25)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <span>📅 此月份尚未建立專屬預算，系統將自動延續上一個月的設定。</span>
                  <button
                    onClick={() => setIsCreatingFutureBudget(true)}
                    className="glass-btn"
                    style={{
                      alignSelf: 'flex-start',
                      padding: '4px 12px',
                      fontSize: '0.78rem',
                      margin: 0,
                      background: 'rgba(10, 132, 255, 0.2)',
                      borderColor: 'rgba(10, 132, 255, 0.4)',
                      color: '#0a84ff',
                      fontWeight: '700'
                    }}
                  >
                    建立此月份專屬預算
                  </button>
                </div>
              )}

              {/* Show edit inputs only if not blocked by unconfigured future month */}
              {(isPastMonth || selectedBudgetMonth <= currentMonthStr || isConfiguredInDb || isCreatingFutureBudget) ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {dynamicCategories.map(cat => (
                      <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: '600' }}>
                          {cat === '餐費' ? '🍲 ' : cat === '購物' ? '🛍️ ' : cat === '娛樂' ? '✨ ' : cat === '固定費用' ? '📅 ' : '⚙️ '}
                          {cat} 預算
                        </span>
                        <input 
                          type="text"
                          inputMode="numeric"
                          value={budgetInputs[cat] !== undefined ? `$${budgetInputs[cat].toLocaleString()}` : '$0'}
                          onChange={(e) => handleInputChange(cat, e.target.value)}
                          disabled={isPastMonth}
                          className="glass-input"
                          style={{
                            width: '120px',
                            textAlign: 'right',
                            margin: 0,
                            fontWeight: '700',
                            fontSize: '0.95rem',
                            color: isPastMonth ? 'var(--text-tertiary)' : '#fff',
                            background: isPastMonth ? 'rgba(255,255,255,0.02)' : undefined,
                            border: isPastMonth ? '1px dashed rgba(255,255,255,0.08)' : undefined
                          }}
                        />
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                    {!isPastMonth && (
                      <button 
                        onClick={handleSaveBudget} 
                        className="glass-btn glass-btn-cta" 
                        style={{ flex: 1, fontWeight: '700', margin: 0 }}
                      >
                        確認儲存預算設定
                      </button>
                    )}
                    
                    {/* Delete button for configured future months */}
                    {!isPastMonth && selectedBudgetMonth > currentMonthStr && isConfiguredInDb && (
                      <button 
                        onClick={handleDeleteFutureBudget} 
                        className="glass-btn" 
                        style={{
                          fontWeight: '700',
                          margin: 0,
                          color: '#ff453a',
                          borderColor: 'rgba(255, 69, 58, 0.4)',
                          background: 'rgba(255, 69, 58, 0.1)'
                        }}
                      >
                        🗑️ 刪除預算
                      </button>
                    )}
                  </div>
                </>
              ) : null}
            </div>

            {/* Budget Details Table */}
            <div className="glass-card" style={{ padding: '16px' }}>
              <div style={{ fontWeight: '700', fontSize: '0.9rem', marginBottom: '10px', color: '#fff' }}>📋 預算明細清單</div>
              <div style={{ 
                overflowX: 'auto', 
                maxHeight: showAllHistory ? '260px' : 'none', 
                overflowY: showAllHistory ? 'auto' : 'visible',
                scrollbarWidth: 'thin', 
                WebkitOverflowScrolling: 'touch' 
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left' }}>
                      <th style={{ padding: '6px 4px', whiteSpace: 'nowrap', position: 'sticky', top: 0, backgroundColor: 'rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', zIndex: 1 }}>月份</th>
                      {dynamicCategories.map(cat => <th key={cat} style={{ padding: '6px 4px', textAlign: 'right', whiteSpace: 'nowrap', position: 'sticky', top: 0, backgroundColor: 'rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', zIndex: 1 }}>{cat}</th>)}
                      <th style={{ padding: '6px 4px', textAlign: 'right', color: '#fff', whiteSpace: 'nowrap', position: 'sticky', top: 0, backgroundColor: 'rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', zIndex: 1 }}>總預算</th>

                    </tr>
                  </thead>
                  <tbody>
                    {visibleMonths.map(m => {
                      const budgets = getBudgetForMonth(assets, m);
                      const total = Object.values(budgets).reduce((s, v) => s + Number(v || 0), 0);
                      const isMonthPast = m < currentMonthStr;
                      return (
                        <tr key={m} style={{ borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '8px 4px', fontWeight: '600', color: isMonthPast ? 'var(--text-tertiary)' : 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                            {m} {isMonthPast ? '🔒' : ''}
                          </td>
                          {dynamicCategories.map(cat => (
                            <td key={cat} style={{ padding: '8px 4px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                              ${(budgets[cat] || 0).toLocaleString()}
                            </td>
                          ))}
                          <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: '700', color: 'var(--accent-blue)', whiteSpace: 'nowrap' }}>
                            ${total.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {allBudgetMonths.length > 5 && (
                <button 
                  onClick={() => setShowAllHistory(!showAllHistory)}
                  className="glass-btn"
                  style={{
                    width: '100%',
                    marginTop: '12px',
                    padding: '8px 0',
                    fontSize: '0.78rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    color: 'var(--text-secondary)'
                  }}
                >
                  {showAllHistory ? '收起部分歷史 ▴' : `顯示其餘 ${allBudgetMonths.length - 5} 個月 ▾`}
                </button>
              )}
            </div>

            {/* Historical Budget Chart */}
            <div className="glass-card" style={{ padding: '16px' }}>
              <div style={{ fontWeight: '700', fontSize: '0.9rem', marginBottom: '12px', color: '#fff' }}>📈 歷史預算變化趨勢</div>
              <div style={{ height: '180px', position: 'relative' }}>
                <Line data={chartData} options={chartOptions} />
              </div>
            </div>
          </div>
        )}



        {/* === 2. 推播通知設定 === */}
        {currentSubTab === 'notifications' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* Identity & Multi-Device Summary Banner */}
            <div className="glass-card" style={{ padding: '16px 18px', background: 'rgba(10,132,255,0.06)', border: '1px solid rgba(10,132,255,0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <div style={{ fontWeight: '850', fontSize: '1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>👤</span>
                    <span>當前登錄使用者：{userDisplayName}</span>
                  </div>
                  <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', margin: '4px 0 0 0', lineHeight: '1.4' }}>
                    偏好設定將針對【{userDisplayName}】的所有登入裝置（含手機、平板、電腦）同步套用，不影響其他使用者。
                  </p>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.08)', padding: '6px 12px', borderRadius: '10px', fontSize: '0.78rem', color: '#fff', fontWeight: '700' }}>
                  📱 已綁定裝置：<strong>{registeredTokensCount}</strong> 台
                </div>
              </div>
            </div>

            {/* Master Toggle Card */}
            <div
              className="glass-card"
              onClick={() => handleToggleNotifSetting('enabled')}
              style={{ padding: '18px', cursor: 'pointer', userSelect: 'none', touchAction: 'manipulation' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1, paddingRight: '12px' }}>
                  <div style={{ fontWeight: '800', fontSize: '0.95rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🔔</span>
                    <span>允許推播通知 (總開關)</span>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                    關閉後，所有來自管家的推播提醒將不會傳送至您的任何裝置。
                  </div>
                </div>

                <ToggleSwitch
                  checked={localNotifSettings.enabled !== false}
                  onChange={() => handleToggleNotifSetting('enabled')}
                />
              </div>
            </div>

            {/* Category Toggles List */}
            <div className="glass-card" style={{ padding: '18px', opacity: localNotifSettings.enabled !== false ? 1 : 0.45, transition: 'all 0.3s ease' }}>
              <div style={{ fontWeight: '850', fontSize: '0.92rem', color: '#fff', marginBottom: '14px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>💸</span>
                <span>記帳與交易動態通知</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Partner Daily Expense */}
                <div
                  onClick={() => { if (localNotifSettings.enabled !== false) handleToggleNotifSetting('partnerExpense'); }}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: localNotifSettings.enabled === false ? 'not-allowed' : 'pointer', userSelect: 'none', touchAction: 'manipulation' }}
                >
                  <div style={{ flex: 1, paddingRight: '12px' }}>
                    <div style={{ fontWeight: '750', fontSize: '0.86rem', color: '#fff' }}>📱 對方日常記帳即時通知</div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                      當【{userKey === 'userA' ? '阿陞 🐶' : '大狗狗 🐕'}】登錄個人或共同支出時，即時推播通知您的裝置。
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={localNotifSettings.partnerExpense !== false}
                    onChange={() => handleToggleNotifSetting('partnerExpense')}
                    disabled={localNotifSettings.enabled === false}
                  />
                </div>

                {/* Joint & High Expense */}
                <div
                  onClick={() => { if (localNotifSettings.enabled !== false) handleToggleNotifSetting('jointExpense'); }}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: localNotifSettings.enabled === false ? 'not-allowed' : 'pointer', userSelect: 'none', touchAction: 'manipulation' }}
                >
                  <div style={{ flex: 1, paddingRight: '12px' }}>
                    <div style={{ fontWeight: '750', fontSize: '0.86rem', color: '#fff' }}>🏫 共同公費與大額異動通知</div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                      當有共同公費支出或進行大額帳戶劃撥時傳送通知。
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={localNotifSettings.jointExpense !== false}
                    onChange={() => handleToggleNotifSetting('jointExpense')}
                    disabled={localNotifSettings.enabled === false}
                  />
                </div>
              </div>
            </div>

            {/* Bill & Credit Card Alerts */}
            <div className="glass-card" style={{ padding: '18px', opacity: localNotifSettings.enabled !== false ? 1 : 0.45, transition: 'all 0.3s ease' }}>
              <div style={{ fontWeight: '850', fontSize: '0.92rem', color: '#fff', marginBottom: '14px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>📅</span>
                <span>帳單與信用卡到期提醒</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Fixed Bill Reminders */}
                <div
                  onClick={() => { if (localNotifSettings.enabled !== false) handleToggleNotifSetting('billReminders'); }}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: localNotifSettings.enabled === false ? 'not-allowed' : 'pointer', userSelect: 'none', touchAction: 'manipulation' }}
                >
                  <div style={{ flex: 1, paddingRight: '12px' }}>
                    <div style={{ fontWeight: '750', fontSize: '0.86rem', color: '#fff' }}>📌 常態固定帳單到期提醒</div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                      房租、水電通訊費等常態帳單到期前 N 天，自動發送推播提醒繳納。
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={localNotifSettings.billReminders !== false}
                    onChange={() => handleToggleNotifSetting('billReminders')}
                    disabled={localNotifSettings.enabled === false}
                  />
                </div>

                {/* Credit Card Statements */}
                <div
                  onClick={() => { if (localNotifSettings.enabled !== false) handleToggleNotifSetting('creditCardReminders'); }}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: localNotifSettings.enabled === false ? 'not-allowed' : 'pointer', userSelect: 'none', touchAction: 'manipulation' }}
                >
                  <div style={{ flex: 1, paddingRight: '12px' }}>
                    <div style={{ fontWeight: '750', fontSize: '0.86rem', color: '#fff' }}>💳 信用卡結算與自動扣款提醒</div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                      信用卡帳單結帳日與自動劃撥扣款到期日前發送提醒。
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={localNotifSettings.creditCardReminders !== false}
                    onChange={() => handleToggleNotifSetting('creditCardReminders')}
                    disabled={localNotifSettings.enabled === false}
                  />
                </div>
              </div>
            </div>

            {/* Dynamic Budget Warnings */}
            <div className="glass-card" style={{ padding: '18px', opacity: localNotifSettings.enabled !== false ? 1 : 0.45, transition: 'all 0.3s ease' }}>
              <div style={{ fontWeight: '850', fontSize: '0.92rem', color: '#fff', marginBottom: '14px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>📊</span>
                <span>動態預算水位預警</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Budget 70%/90% */}
                <div
                  onClick={() => { if (localNotifSettings.enabled !== false) handleToggleNotifSetting('budgetWarning70'); }}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: localNotifSettings.enabled === false ? 'not-allowed' : 'pointer', userSelect: 'none', touchAction: 'manipulation' }}
                >
                  <div style={{ flex: 1, paddingRight: '12px' }}>
                    <div style={{ fontWeight: '750', fontSize: '0.86rem', color: '#fff' }}>🟡 預算累計達 70% / 90% 溫馨預警</div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                      當月共同預算消耗達到 70% 與 90% 時傳送預警文字通知。
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={localNotifSettings.budgetWarning70 !== false}
                    onChange={() => handleToggleNotifSetting('budgetWarning70')}
                    disabled={localNotifSettings.enabled === false}
                  />
                </div>

                {/* Budget Overdraft */}
                <div
                  onClick={() => { if (localNotifSettings.enabled !== false) handleToggleNotifSetting('budgetOverdraft'); }}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: localNotifSettings.enabled === false ? 'not-allowed' : 'pointer', userSelect: 'none', touchAction: 'manipulation' }}
                >
                  <div style={{ flex: 1, paddingRight: '12px' }}>
                    <div style={{ fontWeight: '750', fontSize: '0.86rem', color: '#fff' }}>🚨 預算超支警報 (100%+)</div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                      當總支出超過預算上限時，即時推播紅色超支警戒通知。
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={localNotifSettings.budgetOverdraft !== false}
                    onChange={() => handleToggleNotifSetting('budgetOverdraft')}
                    disabled={localNotifSettings.enabled === false}
                  />
                </div>
              </div>
            </div>

            {/* Bound Devices Management Card */}
            <div className="glass-card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <div style={{ fontWeight: '850', fontSize: '0.96rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📱</span>
                    <span>已綁定推播裝置管理 (共 {allDeviceTokens.length} 台)</span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                    清楚識別每台裝置並支援自訂暱稱、單機獨立測試與離線管理
                  </div>
                </div>

                {myDeviceTokens.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleClearOtherTokens(userKey)}
                    className="glass-btn"
                    style={{ fontSize: '0.74rem', padding: '5px 12px', borderRadius: '10px', color: '#ffb94f', borderColor: 'rgba(255,185,79,0.3)', fontWeight: '700' }}
                  >
                    🧹 清理其他離線裝置
                  </button>
                )}
              </div>

              {/* Scope Switcher Tabs */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', background: 'rgba(0,0,0,0.35)', padding: '4px', borderRadius: '12px' }}>
                <button
                  type="button"
                  onClick={() => setDeviceViewScope('mine')}
                  style={{
                    flex: 1,
                    padding: '7px 10px',
                    fontSize: '0.76rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: deviceViewScope === 'mine' ? 'rgba(255,255,255,0.18)' : 'transparent',
                    color: deviceViewScope === 'mine' ? '#fff' : 'var(--text-tertiary)',
                    fontWeight: deviceViewScope === 'mine' ? '800' : '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {userDisplayName} ({myDeviceTokens.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDeviceViewScope('partner')}
                  style={{
                    flex: 1,
                    padding: '7px 10px',
                    fontSize: '0.76rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: deviceViewScope === 'partner' ? 'rgba(255,255,255,0.18)' : 'transparent',
                    color: deviceViewScope === 'partner' ? '#fff' : 'var(--text-tertiary)',
                    fontWeight: deviceViewScope === 'partner' ? '800' : '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {partnerUserDisplayName} ({partnerDeviceTokens.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDeviceViewScope('all')}
                  style={{
                    flex: 1,
                    padding: '7px 10px',
                    fontSize: '0.76rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: deviceViewScope === 'all' ? 'rgba(255,255,255,0.18)' : 'transparent',
                    color: deviceViewScope === 'all' ? '#fff' : 'var(--text-tertiary)',
                    fontWeight: deviceViewScope === 'all' ? '800' : '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  🌐 全體總覽 ({allDeviceTokens.length})
                </button>
              </div>

              {displayedDeviceTokens.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', padding: '24px 0', textAlign: 'center', lineHeight: '1.6' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📭</div>
                  此範圍內尚未有任何已綁定的推播裝置。
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {displayedDeviceTokens.map((item, idx) => (
                    <div
                      key={item.token || idx}
                      style={{
                        padding: '14px 16px',
                        background: item.isCurrent ? 'linear-gradient(135deg, rgba(48, 209, 88, 0.12), rgba(48, 209, 88, 0.04))' : 'rgba(255, 255, 255, 0.03)',
                        border: item.isCurrent ? '1px solid rgba(48, 209, 88, 0.4)' : '1px solid rgba(255, 255, 255, 0.07)',
                        borderRadius: '14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px'
                      }}
                    >
                      {/* Device Title & Tags */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '1.25rem' }}>{item.icon}</span>
                          <span style={{ fontWeight: '850', fontSize: '0.9rem', color: item.isCurrent ? '#8effa2' : '#fff' }}>
                            {item.displayName}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleRenameDevice(item.userKey, item.token, item.customName || item.systemName)}
                            title="自訂裝置暱稱"
                            style={{
                              background: 'rgba(255,255,255,0.08)',
                              border: '1px solid rgba(255,255,255,0.15)',
                              borderRadius: '6px',
                              padding: '2px 6px',
                              color: '#cbd5e1',
                              fontSize: '0.68rem',
                              cursor: 'pointer'
                            }}
                          >
                            ✏️ 暱稱
                          </button>

                          {item.isCurrent && (
                            <span style={{ fontSize: '0.66rem', background: '#30d158', color: '#000', padding: '2px 7px', borderRadius: '6px', fontWeight: '850' }}>
                              🌟 本機裝置
                            </span>
                          )}

                          {deviceViewScope === 'all' && (
                            <span style={{ fontSize: '0.66rem', background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '2px 7px', borderRadius: '6px', fontWeight: '700' }}>
                              {item.ownerLabel}
                            </span>
                          )}
                        </div>

                        {/* Relative Activity Status */}
                        <div style={{ fontSize: '0.72rem', color: item.isCurrent ? '#8effa2' : 'var(--text-tertiary)', fontWeight: '600' }}>
                          ⏱️ {item.lastSeenStr}
                        </div>
                      </div>

                      {/* Specs & Fingerprint Badges */}
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', fontSize: '0.7rem' }}>
                        {item.rawOs && (
                          <span style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 7px', borderRadius: '5px', color: 'rgba(255,255,255,0.8)' }}>
                            💻 {item.rawOs}
                          </span>
                        )}
                        {item.rawBrowser && (
                          <span style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 7px', borderRadius: '5px', color: 'rgba(255,255,255,0.8)' }}>
                            🌐 {item.rawBrowser}
                          </span>
                        )}
                        <span style={{ background: item.isPWA ? 'rgba(10, 132, 255, 0.15)' : 'rgba(255,255,255,0.06)', color: item.isPWA ? '#64d2ff' : 'rgba(255,255,255,0.7)', padding: '2px 7px', borderRadius: '5px' }}>
                          {item.isPWA ? '🚀 PWA 獨立 App' : '📄 瀏覽器分頁'}
                        </span>
                        {item.screen && (
                          <span style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 7px', borderRadius: '5px', color: 'rgba(255,255,255,0.7)' }}>
                            🖥️ {item.screen}
                          </span>
                        )}
                      </div>

                      {/* Token & Timestamp Info */}
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px' }}>
                        <span
                          style={{ fontFamily: 'SF Mono, Consolas, monospace', cursor: 'pointer' }}
                          title="點擊複製完整 Token"
                          onClick={() => {
                            if (navigator.clipboard) {
                              navigator.clipboard.writeText(item.token);
                              if (customAlert) customAlert("📋 已將此裝置之完整 FCM Token 複製至剪貼簿！", "複製成功");
                            }
                          }}
                        >
                          🔑 Token: {item.shortToken} 📋
                        </span>
                        {item.registeredAtStr && (
                          <span>初次綁定：{item.registeredAtStr}</span>
                        )}
                      </div>

                      {/* Actions Toolbar */}
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '2px' }}>
                        <button
                          type="button"
                          onClick={() => handleTestSingleDevice(item.token, item.displayName)}
                          disabled={testingSingleToken === item.token}
                          className="glass-btn"
                          style={{
                            fontSize: '0.74rem',
                            padding: '5px 12px',
                            borderRadius: '8px',
                            color: '#64d2ff',
                            borderColor: 'rgba(100, 210, 255, 0.3)',
                            background: 'rgba(100, 210, 255, 0.08)',
                            fontWeight: '700',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <span>{testingSingleToken === item.token ? '⏳' : '🎯'}</span>
                          <span>{testingSingleToken === item.token ? '發送中...' : '測試此裝置'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleUnbindToken(item.userKey, item.token, item.displayName)}
                          className="glass-btn"
                          style={{
                            fontSize: '0.74rem',
                            padding: '5px 10px',
                            borderRadius: '8px',
                            color: '#ff453a',
                            borderColor: 'rgba(255, 69, 58, 0.3)',
                            background: 'rgba(255, 69, 58, 0.06)'
                          }}
                        >
                          🗑️ 解除綁定
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Device Diagnostics & Test Push Button */}
            <div className="glass-card" style={{ padding: '18px' }}>
              <div style={{ fontWeight: '850', fontSize: '0.92rem', color: '#fff', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🚀</span>
                <span>本機裝置推播連線診斷與測試</span>
              </div>

              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: '1.5' }}>
                權限狀態：<strong style={{ color: notificationPermission === 'granted' ? '#30d158' : '#ff9500' }}>
                  {notificationPermission === 'granted' ? '✅ 已授權推播' : (notificationPermission === 'denied' ? '🚫 已拒絕通知' : '⚠️ 尚未授權')}
                </strong>
                <br />
                此裝置註冊狀態：<span style={{ color: fcmDiagnostic.status === 'ready' ? '#8effa2' : 'var(--text-tertiary)' }}>
                  {fcmDiagnostic.status === 'ready' ? '🟢 已成功對接 FCM Cloud Messaging' : (fcmDiagnostic.error || '未完成連線')}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {notificationPermission !== 'granted' && (
                  <button
                    type="button"
                    onClick={handleEnableNotification}
                    disabled={isSubscribing}
                    className="glass-btn primary-gradient-btn"
                    style={{ padding: '8px 16px', fontSize: '0.82rem', borderRadius: '10px', fontWeight: '800' }}
                  >
                    {isSubscribing ? '啟用中...' : '⚡ 授權本裝置接收推播'}
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSendTestPushClick}
                  disabled={isTestingPush}
                  className="glass-btn"
                  style={{ padding: '8px 16px', fontSize: '0.82rem', borderRadius: '10px' }}
                >
                  {isTestingPush ? '發送中...' : '🚀 發送本機測試推播'}
                </button>
              </div>

              {/* Inline Diagnostic Output Card (ErrorBoundary Style for AI Debugging) */}
              {testPushDiagnostic.status === 'error' && (
                <div style={{
                  marginTop: '14px',
                  padding: '14px',
                  background: 'rgba(255, 69, 58, 0.1)',
                  border: '1px solid rgba(255, 69, 58, 0.4)',
                  borderRadius: '12px',
                  color: '#fff',
                  fontSize: '0.78rem'
                }}>
                  <div style={{ fontWeight: '800', color: '#ff453a', fontSize: '0.86rem', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>⚠️</span>
                    <span>測試推播發送失敗 (推播診斷報錯)</span>
                  </div>
                  <div style={{
                    fontFamily: 'SF Mono, Consolas, monospace',
                    fontSize: '0.74rem',
                    color: '#ffb94f',
                    wordBreak: 'break-all',
                    whiteSpace: 'pre-wrap',
                    background: 'rgba(0,0,0,0.4)',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.08)'
                  }}>
                    {testPushDiagnostic.error}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', marginTop: '8px', lineHeight: '1.4' }}>
                    💡 提示：您可以將上方這段紅色報錯訊息完整複製並貼給 AI 代理協助診斷。
                  </div>
                </div>
              )}

              {testPushDiagnostic.status === 'success' && (
                <div style={{
                  marginTop: '14px',
                  padding: '12px 14px',
                  background: 'rgba(48, 209, 88, 0.12)',
                  border: '1px solid rgba(48, 209, 88, 0.35)',
                  borderRadius: '12px',
                  color: '#8effa2',
                  fontSize: '0.8rem',
                  fontWeight: '700'
                }}>
                  {testPushDiagnostic.message}
                </div>
              )}
            </div>

            {/* Special Doggy Forced Broadcast Button (Only visible when 大狗狗 is logged in) */}
            {userKey === 'userA' && (
              <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowBroadcastModal(true);
                    setTimeout(() => {
                      if (broadcastInputRef.current) broadcastInputRef.current.focus();
                    }, 100);
                  }}
                  className="glass-btn"
                  style={{
                    padding: '8px 18px',
                    fontSize: '0.78rem',
                    borderRadius: '20px',
                    background: 'rgba(255, 45, 85, 0.08)',
                    borderColor: 'rgba(255, 45, 85, 0.28)',
                    color: '#ff375f',
                    fontWeight: '800',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 10px rgba(255, 45, 85, 0.12)',
                    cursor: 'pointer'
                  }}
                >
                  <span>💬</span>
                  <span>大狗狗即時全域推播廣播室</span>
                </button>
              </div>
            )}

          </div>
        )}

        {/* === 3. 智慧引導助手 (替代原操作指南與常見問題) === */}
        {(currentSubTab === 'guide' || currentSubTab === 'faq') && (
          <HelpWizard onNavigateWithGuide={onNavigateWithGuide} />
        )}

        {/* === 5. 歷史軌跡 === */}
        {currentSubTab === 'logs' && (
          <div className="glass-card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              
              {/* Header & Quick Refresh */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '4px' }}>
                <div style={{ fontSize: '0.86rem', fontWeight: '800', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>📜 操作審計軌跡</span>
                  {loadingLogs && <span style={{ fontSize: '0.7rem', color: '#007aff', animation: 'pulse 1s infinite' }}>● 載入中...</span>}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(logSearchText || logFilterAction !== 'all' || logFilterOperator !== 'all' || logStartDate || logEndDate) && (
                    <button
                      onClick={resetLogFilters}
                      className="glass-btn"
                      style={{ padding: '3px 8px', fontSize: '0.72rem', color: '#ff9f0a', borderRadius: '6px' }}
                    >
                      ✕ 清除篩選
                    </button>
                  )}
                  <button
                    onClick={() => fetchLogs(true)}
                    disabled={loadingLogs}
                    className="glass-btn"
                    style={{ padding: '3px 8px', fontSize: '0.72rem', borderRadius: '6px' }}
                    title="重新整理歷史軌跡"
                  >
                    🔄 重新整理
                  </button>
                </div>
              </div>

              {/* Filters grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '2px' }}>
                <select 
                  value={logFilterOperator} 
                  onChange={(e) => setLogFilterOperator(e.target.value)} 
                  className="glass-input" 
                  style={{ margin: 0, padding: '6px 10px', fontSize: '0.78rem', height: '36px', borderRadius: '8px' }}
                >
                  <option value="all">👥 所有操作者</option>
                  <option value="userA">🐕 大狗狗</option>
                  <option value="userB">🐶 阿陞</option>
                  <option value="system">🤖 系統 / 其他</option>
                </select>
                
                <select 
                  value={logFilterAction} 
                  onChange={(e) => setLogFilterAction(e.target.value)} 
                  className="glass-input" 
                  style={{ margin: 0, padding: '6px 10px', fontSize: '0.78rem', height: '36px', borderRadius: '8px' }}
                >
                  <option value="all">🛠️ 所有動作</option>
                  <option value="transaction">🔄 記帳變動</option>
                  <option value="delete">🗑️ 作廢刪除</option>
                  <option value="expense_add">💰 新增支出</option>
                  <option value="login">🔑 登入異動</option>
                  <option value="calibrate">⚖️ 餘額校正</option>
                </select>
              </div>

              {/* Date range pickers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '2px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', paddingLeft: '4px' }}>📅 起始日期</span>
                  <input 
                    type="date" 
                    value={logStartDate} 
                    onChange={(e) => setLogStartDate(e.target.value)} 
                    className="glass-input" 
                    style={{ margin: 0, padding: '6px 8px', fontSize: '0.78rem', height: '36px', borderRadius: '8px' }}
                  />
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', paddingLeft: '4px' }}>📅 結束日期</span>
                  <input 
                    type="date" 
                    value={logEndDate} 
                    onChange={(e) => setLogEndDate(e.target.value)} 
                    className="glass-input" 
                    style={{ margin: 0, padding: '6px 8px', fontSize: '0.78rem', height: '36px', borderRadius: '8px' }}
                  />
                </div>
              </div>

              {/* Instant Search Bar */}
              <div style={{ position: 'relative' }}>
                <input 
                  type="text" 
                  placeholder="🔍 即時搜尋關鍵字 (支援多詞搜尋，如「大狗狗 晚餐」)..." 
                  value={logSearchText} 
                  onChange={(e) => setLogSearchText(e.target.value)} 
                  className="glass-input" 
                  style={{ width: '100%', boxSizing: 'border-box', margin: 0, padding: '8px 12px 8px 32px', fontSize: '0.82rem', borderRadius: '8px' }}
                />
                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5, fontSize: '0.8rem' }}>🔍</span>
                {logSearchText && (
                  <button
                    onClick={() => setLogSearchText('')}
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '0.85rem' }}
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Stats Bar */}
              <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', display: 'flex', justifyContent: 'space-between', padding: '0 4px' }}>
                <span>已載入記憶體: <strong style={{ color: '#fff' }}>{dbLogs.length}</strong> 筆</span>
                <span>符合搜尋條件: <strong style={{ color: '#30d158' }}>{filteredLogs.length}</strong> 筆</span>
              </div>

              {loadingLogs && dbLogs.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.84rem', padding: '40px 0' }}>
                  ⏳ 正在高速載入歷史軌跡...
                </div>
              ) : dbLogs.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.84rem', padding: '40px 0' }}>
                  📭 目前尚無操作紀錄。
                </div>
              ) : filteredLogs.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.84rem', padding: '40px 0' }}>
                  🔍 無符合目前搜尋條件的軌跡。
                </div>
              ) : (
                <>
                  <div className="timeline-list" style={{ maxHeight: '52vh', overflowY: 'auto', paddingRight: '2px' }}>
                    {filteredLogs.slice(0, visibleLogCount).map((log, idx) => {
                      const operatorDisplay = (log.operator?.includes('大狗狗') || log.operator === 'userA') ? '🐕 大狗狗' :
                                              (log.operator?.includes('阿陞') || log.operator === 'userB') ? '🐶 阿陞' : (log.operator || '🤖 系統');
                      return (
                        <div key={log.id || idx} className="timeline-item">
                          <div className={getTimelineDotClass(log.action)} />
                          <div className="timeline-meta">
                            <span className="timeline-operator" style={{ color: operatorDisplay.includes('大狗狗') ? '#007aff' : (operatorDisplay.includes('阿陞') ? '#af52de' : 'var(--text-secondary)') }}>
                              {operatorDisplay}
                            </span>
                            <span>{formatTimestamp(log.timestamp)}</span>
                          </div>
                          <div className="timeline-desc" style={{ wordBreak: 'break-all', fontSize: '0.8rem', lineHeight: '1.4' }}>
                            {log.detail}
                          </div>
                        </div>
                      );
                    })}

                    {filteredLogs.length > visibleLogCount && (
                      <button
                        onClick={() => setVisibleLogCount(prev => prev + 40)}
                        className="glass-btn"
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: '8px',
                          fontSize: '0.76rem',
                          color: '#007aff',
                          background: 'rgba(0, 122, 255, 0.08)',
                          border: '0.5px solid rgba(0, 122, 255, 0.25)',
                          cursor: 'pointer',
                          marginTop: '6px'
                        }}
                      >
                        ⬇️ 展開更多已載入軌跡 (尚有 {filteredLogs.length - visibleLogCount} 筆)
                      </button>
                    )}
                  </div>

                  {hasMoreLogs && (
                    <button
                      onClick={() => fetchLogs(false)}
                      disabled={loadingLogs}
                      className="glass-btn"
                      style={{
                        width: '100%',
                        padding: '10px',
                        borderRadius: '12px',
                        fontSize: '0.8rem',
                        fontWeight: '700',
                        color: 'var(--text-primary)',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        cursor: 'pointer',
                        marginTop: '6px'
                      }}
                    >
                      {loadingLogs ? '⏳ 載入中...' : '📥 載入更早的雲端歷史紀錄 (+50 筆)'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* === 6. 系統資訊 === */}
        {currentSubTab === 'info' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px' }}>
                  <span>系統版本</span>
                  <span style={{ color: '#ffffff', fontWeight: '600' }}>v2.5.0 ( potato-steward-budget )</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px' }}>
                  <span>資料庫狀態</span>
                  <span style={{ color: window.location.hostname === 'localhost' ? 'var(--accent-orange)' : 'var(--accent-green)', fontWeight: '600' }}>
                    {window.location.hostname === 'localhost' ? '本地模擬開發模式' : '雲端 Firestore 連線中'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px' }}>
                  <span>目前操作者</span>
                  <span style={{ color: '#ffffff', fontWeight: '600' }}>{operatorName}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px' }}>
                  <span>綁定帳號</span>
                  <span style={{ color: '#ffffff', fontWeight: '600', fontSize: '0.78rem' }}>{currentUser?.email || '無'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>歷史明細總數</span>
                  <span style={{ color: '#ffffff', fontWeight: '600' }}>{assets.monthlyExpenses?.length || 0} 筆</span>
                </div>
              </div>

              {/* 🤖 Unified AI Deep Health Diagnostic & Session Logs Card */}
              <div className="glass-card" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontWeight: '850', fontSize: '0.96rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🤖</span>
                  <span>AI 全系統深度健檢診斷與日誌中心</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                  一鍵產出包含全體帳戶資產守恆、股票配置、信用卡與常態帳單矩陣、最新 30 筆詳細交易紀錄及系統 Session 運作日誌之標準化報告。日常定期健檢或遇到任何問題時，可直接複製傳給 AI 進行分析與排錯。
                </p>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={async () => {
                      const report = logger.generateAiDiagnosticReport(assets, {
                        operatorName,
                        currentUser: currentUser?.email,
                        fcmToken: fcmDiagnostic?.token,
                        currentPage: 'settings',
                        activeSubTab: currentSubTab,
                        activeModals: {
                          showBroadcastModal,
                          isLogsModalOpen,
                          isResetting,
                          isSubscribing,
                          isTestingPush
                        },
                        fcmDiagnostic
                      });
                      try {
                        await navigator.clipboard.writeText(report);
                        await customAlert("🤖 已成功將【全系統 AI 深度健康診斷與審計報告】複製到剪貼簿！\n\n您可以直接將複製的 Markdown 內容傳給 AI 進行全方位檢查、測試與排錯。", "複製成功");
                      } catch {
                        await customAlert("請手動複製報告內容：\n" + report.slice(0, 300) + "...", "診斷報告");
                      }
                    }}
                    className="glass-btn primary-gradient-btn"
                    style={{ flex: 1.6, padding: '11px 14px', borderRadius: '12px', fontWeight: '850', fontSize: '0.84rem' }}
                  >
                    📋 一鍵複製全系統 AI 診斷報告
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsLogsModalOpen(true)}
                    className="glass-btn"
                    style={{ flex: 1, padding: '11px 12px', borderRadius: '12px', fontSize: '0.82rem', fontWeight: '700' }}
                  >
                    📜 檢視詳細日誌視窗
                  </button>
                </div>
              </div>

              {/* Notification card panel */}
              <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontWeight: '700', fontSize: '0.9rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  🔔 裝置推播通知
                </div>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)', lineHeight: '1.5' }}>
                  當交易紀錄產生異動（新增支出、劃撥或修改時），綁定的所有裝置都將即時收到系統推播橫幅。
                </p>
                
                {/* Status breakdown list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)', fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>瀏覽器權限</span>
                    <span style={{ fontWeight: '700', color: notificationPermission === 'granted' ? 'var(--accent-green)' : (notificationPermission === 'denied' ? 'var(--accent-red)' : 'var(--accent-orange)') }}>
                      {notificationPermission === 'granted' ? '已允許 ✅' : (notificationPermission === 'denied' ? '已拒絕/封鎖 ❌' : '尚未授權 🔔')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>FCM 狀態</span>
                    <span style={{ fontWeight: '700', color: fcmDiagnostic.status === 'ready' ? 'var(--accent-green)' : (fcmDiagnostic.status === 'failed' ? 'var(--accent-red)' : 'var(--accent-orange)') }}>
                      {fcmDiagnostic.status === 'ready' ? '連線就緒 ✅' : (fcmDiagnostic.status === 'fetching' ? '取得 Token 中...' : (fcmDiagnostic.status === 'checking' ? '檢測中...' : '尚未連線 ⚠️'))}
                    </span>
                  </div>
                  {fcmDiagnostic.token && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>裝置 Token</span>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                        {fcmDiagnostic.token.substring(0, 15)}...
                      </span>
                    </div>
                  )}
                  {fcmDiagnostic.error && (
                    <div style={{ marginTop: '4px', padding: '8px', borderRadius: '6px', backgroundColor: 'rgba(255, 69, 58, 0.1)', color: 'var(--accent-red)', fontSize: '0.72rem', wordBreak: 'break-all' }}>
                      ⚠️ 診斷錯誤資訊：{fcmDiagnostic.error}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleEnableNotification}
                    disabled={isSubscribing || fcmDiagnostic.status === 'fetching'}
                    className="glass-btn"
                    style={{
                      flex: 1,
                      padding: '10px 0',
                      borderRadius: '12px',
                      fontSize: '0.8rem',
                      fontWeight: '700',
                      color: '#fff',
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)',
                      borderColor: 'rgba(255,255,255,0.1)',
                      cursor: 'pointer',
                    }}
                  >
                    {isSubscribing ? '啟動中...' : (notificationPermission === 'granted' ? '重新綁定裝置 🔄' : '啟用推播通知 🔔')}
                  </button>

                  {fcmDiagnostic.status === 'ready' && onSendTestPush && (
                    <button
                      onClick={handleSendTestPushClick}
                      disabled={isTestingPush}
                      className="glass-btn"
                      style={{
                        flex: 1,
                        padding: '10px 0',
                        borderRadius: '12px',
                        fontSize: '0.8rem',
                        fontWeight: '700',
                        color: '#fff',
                        background: isTestingPush
                          ? 'linear-gradient(135deg, rgba(142,142,147,0.7) 0%, rgba(142,142,147,0.5) 100%)'
                          : 'linear-gradient(135deg, rgba(52,199,89,0.7) 0%, rgba(48,209,88,0.5) 100%)',
                        borderColor: isTestingPush ? 'rgba(142,142,147,0.4)' : 'rgba(52,199,89,0.4)',
                        cursor: isTestingPush ? 'not-allowed' : 'pointer',
                        boxShadow: isTestingPush ? 'none' : '0 4px 15px rgba(52,199,89,0.2)',
                        opacity: isTestingPush ? 0.7 : 1
                      }}
                    >
                      {isTestingPush ? '發送中... ⏳' : '發送測試推播 🚀'}
                    </button>
                  )}

                </div>

                <p style={{ margin: '4px 0 0 0', fontSize: '0.7rem', color: 'var(--text-tertiary)', lineHeight: '1.4', fontStyle: 'italic' }}>
                  * 註：iOS 及 macOS 設備需先透過 Safari 將本網站「加入主畫面/加入 Dock (安裝為 PWA)」後，才能完整啟用並接收系統背景推播。
                </p>
              </div>

              {/* 💾 Data Backup & Restore Card */}
              <div className="glass-card" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontWeight: '850', fontSize: '0.94rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>💾</span>
                  <span>資料備份與還原管理</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)', lineHeight: '1.5' }}>
                  支援手動同步備份至 Google 雲端硬碟 (Google Drive)，以及下載完整 JSON 檔案進行本機永久保存與一鍵還原。
                </p>

                <button
                  type="button"
                  onClick={handleManualCloudBackup}
                  disabled={isManualBackingUp}
                  className="glass-btn glass-btn-cta"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    fontSize: '0.84rem',
                    fontWeight: '750',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    cursor: isManualBackingUp ? 'wait' : 'pointer',
                    opacity: isManualBackingUp ? 0.65 : 1
                  }}
                >
                  <span>{isManualBackingUp ? '⏳ 雲端備份傳送中...' : '☁️ 手動觸發 Google 雲端硬碟備份'}</span>
                </button>

                <div style={{ display: 'flex', gap: '10px', marginTop: '2px' }}>
                  <button
                    type="button"
                    onClick={handleExportJson}
                    className="glass-btn"
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: '12px',
                      fontSize: '0.8rem',
                      fontWeight: '700',
                      color: '#ffffff',
                      background: 'rgba(255, 255, 255, 0.04)',
                      borderColor: 'rgba(255, 255, 255, 0.15)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px'
                    }}
                  >
                    <span>📥</span>
                    <span>匯出 JSON 本機檔案</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleImportJsonClick}
                    className="glass-btn"
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: '12px',
                      fontSize: '0.8rem',
                      fontWeight: '700',
                      color: '#ff9500',
                      background: 'rgba(255, 149, 0, 0.06)',
                      borderColor: 'rgba(255, 149, 0, 0.25)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px'
                    }}
                  >
                    <span>📤</span>
                    <span>匯入 JSON 檔案還原</span>
                  </button>
                  <input
                    type="file"
                    ref={backupFileInputRef}
                    style={{ display: 'none' }}
                    accept=".json"
                    onChange={handleBackupFileChange}
                  />
                </div>
              </div>

              {/* 隱密紅字劃底線：測試資料歸零重置 */}
              <div style={{ textAlign: 'center', marginTop: '16px', marginBottom: '12px' }}>
                <button
                  type="button"
                  onClick={handleResetTestData}
                  disabled={isResetting}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#ff453a',
                    fontSize: '0.74rem',
                    textDecoration: 'underline',
                    cursor: isResetting ? 'wait' : 'pointer',
                    opacity: isResetting ? 0.5 : 0.8,
                    padding: '6px 12px',
                    letterSpacing: '0.02em',
                    transition: 'opacity 0.2s ease'
                  }}
                >
                  {isResetting ? '⏳ 雲端備份並歸零中...' : '重置所有測試資料（歸零）'}
                </button>
              </div>
            </div>
        )}

      </div>

      {/* Session Diagnostic Logs Modal */}
      <SystemLogsModal
        isOpen={isLogsModalOpen}
        onClose={() => setIsLogsModalOpen(false)}
        assets={assets}
        appContext={{
          operatorName,
          currentUser: currentUser?.email,
          fcmToken: fcmDiagnostic?.token,
          currentPage: 'settings',
          activeSubTab: currentSubTab,
          activeModals: {
            showBroadcastModal,
            isLogsModalOpen,
            isResetting,
            isSubscribing,
            isTestingPush
          },
          fcmDiagnostic
        }}
        customAlert={customAlert}
      />

      {/* DOGGY BROADCAST CHAT MODAL */}
      {showBroadcastModal && createPortal(
        <div className="liquid-modal-overlay" onClick={() => setShowBroadcastModal(false)} style={{ zIndex: 11000 }}>
          <div
            className="liquid-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '460px',
              width: '92%',
              height: '80vh',
              maxHeight: '620px',
              display: 'flex',
              flexDirection: 'column',
              padding: '18px 16px',
              boxSizing: 'border-box'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
              <div>
                <div style={{ fontWeight: '850', fontSize: '1.05rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>🐕💬</span>
                  <span>大狗狗即時全域推播廣播室</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#ff375f', marginTop: '2px', fontWeight: '700' }}>
                  ⚡ 強制發送推播至所有裝置（忽視任何通知開關設定）
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBroadcastModal(false)}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '1.4rem', cursor: 'pointer', padding: '0 4px' }}
              >
                ✕
              </button>
            </div>

            {/* Chat message body (Scrollable) */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px 2px', touchAction: 'pan-y' }}>
              {broadcastHistory.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.82rem', padding: '50px 14px', lineHeight: '1.6', margin: 'auto' }}>
                  <div style={{ fontSize: '2.4rem', marginBottom: '10px' }}>📢</div>
                  <strong style={{ color: '#fff', fontSize: '0.95rem' }}>輸入即時推播訊息</strong>
                  <br />
                  在此輸入內容並按下送出，系統將以「🐕 大狗狗」名義直接推播給所有已綁定的手機、平板與電腦！
                </div>
              ) : (
                broadcastHistory.map((item) => (
                  <div key={item.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <div style={{
                      background: 'linear-gradient(135deg, rgba(10, 132, 255, 0.35), rgba(88, 86, 214, 0.4))',
                      border: '1px solid rgba(10, 132, 255, 0.45)',
                      borderRadius: '16px 16px 4px 16px',
                      padding: '10px 14px',
                      color: '#fff',
                      fontSize: '0.9rem',
                      lineHeight: '1.45',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxWidth: '85%',
                      boxShadow: '0 2px 10px rgba(0,0,0,0.2)'
                    }}>
                      {item.text}
                    </div>
                    <div style={{ fontSize: '0.66rem', color: 'var(--text-tertiary)', display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span>{item.time}</span>
                      {item.status === 'sending' ? (
                        <span style={{ color: '#ff9500' }}>發送中...</span>
                      ) : item.status === 'success' ? (
                        <span style={{ color: '#30d158' }}>✅ 已推播至 {item.targetCount} 台裝置</span>
                      ) : (
                        <span style={{ color: '#ff453a' }}>❌ {item.error || '發送失敗'}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={broadcastEndRef} />
            </div>

            {/* Input Bar (Fixed at bottom) */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
              <textarea
                ref={broadcastInputRef}
                value={broadcastInput}
                onChange={(e) => setBroadcastInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendBroadcast();
                  }
                }}
                placeholder="輸入推播訊息 (Enter 送出，Shift+Enter 換行)..."
                rows={2}
                style={{
                  flex: 1,
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '12px',
                  padding: '9px 12px',
                  color: '#fff',
                  fontSize: '0.88rem',
                  fontFamily: 'var(--font-family)',
                  resize: 'none',
                  outline: 'none',
                  lineHeight: '1.4'
                }}
              />
              <button
                type="button"
                onClick={handleSendBroadcast}
                disabled={!broadcastInput.trim() || isSendingBroadcast}
                className="glass-btn primary-gradient-btn"
                style={{
                  height: '46px',
                  padding: '0 16px',
                  borderRadius: '12px',
                  fontWeight: '800',
                  fontSize: '0.88rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  flexShrink: 0
                }}
              >
                {isSendingBroadcast ? '...' : '✈️ 送出'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

// --- Session Diagnostic Logs Modal Component ---
const SystemLogsModal = ({ isOpen, onClose, assets, appContext, customAlert }) => {
  const [copied, setCopied] = useState(false);
  const [clearVersion, setClearVersion] = useState(0);

  const logs = useMemo(() => {
    void clearVersion;
    if (!isOpen) return [];
    return [...logger.getLogs()].reverse();
  }, [isOpen, clearVersion]);

  if (!isOpen) return null;

  const handleCopyAiReport = async () => {
    const reportText = logger.generateAiDiagnosticReport(assets, appContext);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(reportText);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = reportText;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      if (customAlert) {
        customAlert("🤖 已成功複製【AI 全方位系統健康診斷報告】！您可以直接將複製的 Markdown 內容傳給 AI 進行分析。", "複製成功");
      }
    } catch (err) {
      console.error("Copy AI report fail:", err);
    }
  };

  const handleCopyReport = async () => {
    const reportText = logger.generateDiagnosticReport(appContext);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(reportText);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = reportText;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      if (customAlert) {
        customAlert("📋 已成功複製本階段原始除錯診斷日誌！", "複製成功");
      }
    } catch (err) {
      console.error("Copy report fail:", err);
    }
  };

  const handleClearLogs = () => {
    logger.clearSessionLogs();
    setClearVersion(v => v + 1);
  };

  return (
    <div className="liquid-modal-overlay" onClick={onClose} style={{ zIndex: 100000 }}>
      <div
        className="liquid-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '94%',
          maxWidth: '680px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '24px',
          background: 'rgba(15, 23, 42, 0.94)',
          backdropFilter: 'blur(28px) saturate(200%)',
          WebkitBackdropFilter: 'blur(28px) saturate(200%)',
          borderRadius: '24px',
          border: '1px solid rgba(255, 255, 255, 0.16)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)'
        }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '12px' }}>
          <div style={{ fontWeight: '850', fontSize: '1.05rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🐞</span>
            <span>系統本階段除錯與日誌診斷中心</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              color: '#fff',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ✕
          </button>
        </div>

        {/* Info Banner */}
        <div style={{ fontSize: '0.76rem', color: 'var(--text-tertiary)', background: 'rgba(255, 255, 255, 0.03)', padding: '10px 14px', borderRadius: '12px', marginBottom: '14px', border: '1px solid rgba(255, 255, 255, 0.06)', lineHeight: '1.5' }}>
          ℹ️ 本除錯視窗紀錄僅在目前登入階段留存。當登出或切換使用者時，上一次的日誌紀錄將會自動清除，維護系統安全與效能。
        </div>

        {/* Modal Action Toolbar */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleCopyAiReport}
            className="glass-btn primary-gradient-btn"
            style={{
              flex: 1.5,
              padding: '10px 14px',
              borderRadius: '12px',
              fontSize: '0.84rem',
              fontWeight: '800',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <span>{copied ? '✅ 已複製！' : '🤖 一鍵複製 AI 系統健康診斷報告'}</span>
          </button>

          <button
            type="button"
            onClick={handleCopyReport}
            className="glass-btn"
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: '12px',
              fontSize: '0.8rem',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <span>📋 複製原始日誌</span>
          </button>

          <button
            type="button"
            onClick={handleClearLogs}
            className="glass-btn"
            style={{
              padding: '10px 14px',
              borderRadius: '12px',
              fontSize: '0.82rem',
              color: '#ff9500',
              borderColor: 'rgba(255,149,0,0.3)',
              cursor: 'pointer'
            }}
          >
            <span>🧹 清除本階段日誌</span>
          </button>
        </div>

        {/* Logs Console Scroll Box */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            background: 'rgba(5, 11, 20, 0.88)',
            borderRadius: '14px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '14px',
            fontFamily: 'SFMono-Regular, Consolas, Monaco, monospace',
            fontSize: '0.76rem',
            color: '#e2e8f0',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          {logs.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'rgba(255, 255, 255, 0.4)', padding: '40px 0' }}>
              🟢 本階段尚無系統報錯或事件日誌。系統運作順暢！
            </div>
          ) : (
            logs.map((item, i) => {
              const isErr = item.type === 'ERROR';
              const isWarn = item.type === 'WARN';
              const isPush = item.type === 'PUSH';

              const badgeBg = isErr ? '#ff3b30' : (isWarn ? '#ff9500' : (isPush ? '#34c759' : '#007aff'));

              return (
                <div
                  key={i}
                  style={{
                    marginBottom: '12px',
                    paddingBottom: '10px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.72rem' }}>[{item.timestamp}]</span>
                    <span style={{ background: badgeBg, color: '#fff', fontSize: '0.66rem', fontWeight: '800', padding: '1px 6px', borderRadius: '4px' }}>
                      {item.type}
                    </span>
                  </div>
                  <div style={{ color: isErr ? '#ff6b6b' : (isWarn ? '#ffd166' : '#f8fafc'), wordBreak: 'break-all', lineHeight: '1.4' }}>
                    {item.message}
                  </div>
                  {item.details && (
                    <pre style={{ margin: '6px 0 0 0', padding: '8px', background: 'rgba(0, 0, 0, 0.4)', borderRadius: '6px', fontSize: '0.72rem', color: '#cbd5e1', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {item.details}
                    </pre>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
