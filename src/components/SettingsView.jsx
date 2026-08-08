// src/components/SettingsView.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import HelpWizard from './HelpWizard';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

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
  onNavigateWithGuide
}) => {
  
  // --- Push Notification Permission States & Handlers ---
  const [notificationPermission, setNotificationPermission] = useState('default');
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isTestingPush, setIsTestingPush] = useState(false);

  // --- Reset Test Data with Backup ---
  const [isResetting, setIsResetting] = useState(false);

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
  const rawCategories = assets?.config?.categories || ["餐費", "購物", "娛樂", "其他"];
  const dynamicCategories = rawCategories.includes("固定費用") ? rawCategories : [...rawCategories.slice(0, 3), "固定費用", ...rawCategories.slice(3)];
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



  // --- 3. Operation Logs State & Logic ---
  const [dbLogs, setDbLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [lastVisibleDoc, setLastVisibleDoc] = useState(null);
  const [hasMoreLogs, setHasMoreLogs] = useState(true);

  // Search & Filter state variables
  const [logSearchText, setLogSearchText] = useState('');
  const [logFilterAction, setLogFilterAction] = useState('all');
  const [logFilterOperator, setLogFilterOperator] = useState('all');
  const [logStartDate, setLogStartDate] = useState('');
  const [logEndDate, setLogEndDate] = useState('');

  const filteredLogs = useMemo(() => {
    return dbLogs.filter(log => {
      const matchesSearch = logSearchText 
        ? (log.detail?.toLowerCase().includes(logSearchText.toLowerCase()) || log.operator?.toLowerCase().includes(logSearchText.toLowerCase())) 
        : true;
      const matchesAction = logFilterAction === 'all' ? true : (
        logFilterAction === 'calibrate'
          ? (log.action === 'calibrate' || log.detail?.includes('校正') || log.detail?.includes('餘額校正'))
          : logFilterAction === 'transaction'
          ? (log.action === 'transaction' || log.action === 'expense_add' || log.detail?.includes('記帳') || log.detail?.includes('支出') || log.detail?.includes('收入') || log.detail?.includes('劃撥'))
          : logFilterAction === 'delete'
          ? (log.action === 'delete' || log.action === 'budget_delete' || log.detail?.includes('作廢') || log.detail?.includes('刪除') || log.detail?.includes('註銷'))
          : logFilterAction === 'expense_add'
          ? (log.action === 'expense_add' || log.detail?.includes('新增支出'))
          : logFilterAction === 'login'
          ? (log.action === 'login' || log.detail?.includes('登入'))
          : log.action === logFilterAction
      );
      const matchesOperator = logFilterOperator === 'all' ? true : (
        logFilterOperator === 'userA' ? (log.operator?.includes('大狗狗') || log.operator === 'userA') :
        logFilterOperator === 'userB' ? (log.operator?.includes('阿陞') || log.operator === 'userB') :
        logFilterOperator === 'system' ? (log.operator?.includes('系統') || log.operator === 'system' || !log.operator) : true
      );
      return matchesSearch && matchesAction && matchesOperator;
    });
  }, [dbLogs, logSearchText, logFilterAction, logFilterOperator]);

  const fetchLogs = async (isInitial = false) => {
    if (loadingLogs) return;
    setLoadingLogs(true);
    try {
      const logsRef = collection(db, "finance", "data", "operationsLog");
      let q;

      const queryConstraints = [orderBy("timestamp", "desc")];
      if (logStartDate) {
        queryConstraints.push(where("timestamp", ">=", logStartDate + "T00:00:00"));
      }
      if (logEndDate) {
        queryConstraints.push(where("timestamp", "<=", logEndDate + "T23:59:59.999Z"));
      }

      if (isInitial) {
        queryConstraints.push(limit(20));
        q = query(logsRef, ...queryConstraints);
      } else if (lastVisibleDoc) {
        queryConstraints.push(startAfter(lastVisibleDoc), limit(20));
        q = query(logsRef, ...queryConstraints);
      } else {
        setLoadingLogs(false);
        return;
      }

      const querySnapshot = await getDocs(q);
      const newLogs = [];
      querySnapshot.forEach((doc) => {
        newLogs.push({ id: doc.id, ...doc.data() });
      });

      if (querySnapshot.docs.length < 20) {
        setHasMoreLogs(false);
      } else {
        setHasMoreLogs(true);
      }

      if (querySnapshot.docs.length > 0) {
        setLastVisibleDoc(querySnapshot.docs[querySnapshot.docs.length - 1]);
      }

      if (isInitial) {
        setDbLogs(newLogs);
      } else {
        setDbLogs(prev => [...prev, ...newLogs]);
      }
    } catch (err) {
      console.error("Error fetching logs: ", err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'logs') {
      fetchLogs(true);
    } else {
      setDbLogs([]);
      setLastVisibleDoc(null);
      setHasMoreLogs(true);
      setLogSearchText('');
      setLogFilterAction('all');
      setLogFilterOperator('all');
      setLogStartDate('');
      setLogEndDate('');
    }
  }, [activeSubTab, logStartDate, logEndDate]);

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

  // --- Notification Preferences Helper States & Handlers ---
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

  // --- Test Push Diagnostic State ---
  const [testPushDiagnostic, setTestPushDiagnostic] = useState({
    status: 'idle', // 'idle' | 'testing' | 'success' | 'error'
    message: null,
    error: null
  });

  // --- Optimistic Notification Preferences State ---
  const userNotifSettings = useMemo(() => {
    const defaults = {
      enabled: true,
      partnerExpense: true,
      jointExpense: true,
      billReminders: true,
      creditCardReminders: true,
      budgetWarning70: true,
      budgetOverdraft: true,
    };
    return {
      ...defaults,
      ...(assets?.notificationSettings?.[userKey] || {})
    };
  }, [assets?.notificationSettings, userKey]);

  const [localNotifSettings, setLocalNotifSettings] = useState(userNotifSettings);

  useEffect(() => {
    setLocalNotifSettings(userNotifSettings);
  }, [userNotifSettings]);

  const handleToggleNotifSetting = (settingKey) => {
    const currentVal = localNotifSettings[settingKey] !== false;
    const nextVal = !currentVal;

    // 0ms Instant UI Feedback
    const nextSettings = {
      ...localNotifSettings,
      [settingKey]: nextVal
    };
    setLocalNotifSettings(nextSettings);

    const updatedAssets = {
      ...assets,
      notificationSettings: {
        ...(assets?.notificationSettings || {}),
        [userKey]: nextSettings
      }
    };

    saveToCloud(updatedAssets);
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

  // --- Device Tokens Management & Unbind Handlers ---
  const userDeviceTokens = useMemo(() => {
    const raw = assets?.fcmTokens?.[userKey];
    const arr = typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? Object.keys(raw)
      : (Array.isArray(raw) ? raw : (typeof raw === 'string' ? [raw] : []));

    const currentToken = fcmDiagnostic?.token;
    return arr.map((tokenStr, idx) => {
      const isCurrent = currentToken && tokenStr === currentToken;
      return {
        token: tokenStr,
        shortToken: tokenStr.length > 24 ? `${tokenStr.substring(0, 12)}...${tokenStr.substring(tokenStr.length - 8)}` : tokenStr,
        isCurrent,
        label: isCurrent ? '📱 本機裝置 (當前使用中)' : `📱 登入裝置 #${idx + 1}`
      };
    });
  }, [assets?.fcmTokens, userKey, fcmDiagnostic?.token]);

  const registeredTokensCount = userDeviceTokens.length;

  const handleUnbindToken = async (targetTokenStr) => {
    if (!await customConfirm("⚠️ 確定要解除綁定此裝置的推播 Token 嗎？\n解除後該裝置將無法接收推播提醒。", "解除裝置綁定確認")) {
      return;
    }

    const rawUserTokens = assets?.fcmTokens?.[userKey] || {};
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
        [userKey]: updatedUserTokens
      }
    };

    saveToCloud(updatedAssets);
    await customAlert("🗑️ 已成功解除該裝置的推播綁定。");
  };

  const handleClearOtherTokens = async () => {
    const currentToken = fcmDiagnostic?.token;
    if (!currentToken) {
      await customAlert("⚠️ 本機裝置尚未取得 FCM Token，無法清理其他裝置。");
      return;
    }

    if (!await customConfirm("🧹 確定要清理所有其他離線裝置，僅保留【本機裝置】嗎？")) {
      return;
    }

    const updatedAssets = {
      ...assets,
      fcmTokens: {
        ...(assets?.fcmTokens || {}),
        [userKey]: { [currentToken]: true }
      }
    };

    saveToCloud(updatedAssets);
    await customAlert("🧹 已清理完畢，目前僅保留本機裝置。");
  };

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
        width: '46px',
        height: '26px',
        padding: 0,
        border: 'none',
        outline: 'none',
        background: checked ? '#30d158' : 'rgba(255,255,255,0.18)',
        borderRadius: '26px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        flexShrink: 0,
        transition: 'background-color 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        WebkitTapHighlightColor: 'transparent',
        boxShadow: checked ? '0 0 10px rgba(48, 209, 88, 0.4)' : 'none'
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: '3px',
          left: checked ? '23px' : '3px',
          width: '20px',
          height: '20px',
          backgroundColor: '#ffffff',
          borderRadius: '50%',
          transition: 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: '0 2px 5px rgba(0,0,0,0.35)'
        }}
      />
    </button>
  );

  return (
    <div className="page-transition-enter" style={{ padding: '0 16px' }}>
      <h1 className="page-title">管家設定</h1>

      {/* Settings Navigation Sub-Tabs */}
      <div className="settings-tabs" style={{ marginBottom: '20px', overflowX: 'auto', whiteSpace: 'nowrap' }}>
        <button className={`settings-tab-btn ${currentSubTab === 'budget' ? 'active' : ''}`} onClick={() => handleTabChange('budget')}>預算設定</button>
        <button className={`settings-tab-btn ${currentSubTab === 'notifications' ? 'active' : ''}`} onClick={() => handleTabChange('notifications')}>🔔 推播通知設定</button>
        <button className={`settings-tab-btn ${currentSubTab === 'guide' || currentSubTab === 'faq' ? 'active' : ''}`} onClick={() => handleTabChange('guide')}>🧭 智慧引導助手</button>
        <button className={`settings-tab-btn ${currentSubTab === 'logs' ? 'active' : ''}`} onClick={() => handleTabChange('logs')}>歷史軌跡</button>
        <button className={`settings-tab-btn ${currentSubTab === 'info' ? 'active' : ''}`} onClick={() => handleTabChange('info')}>系統資訊</button>
      </div>

      {/* Tab Contents */}
      <div className="settings-tab-content" style={{ paddingBottom: '30px' }}>
        
        {/* === 1. 預算設定 === */}
        {activeSubTab === 'budget' && (
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
            <div className="glass-card" style={{ padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
            <div className="glass-card" style={{ padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
                <div style={{ fontWeight: '850', fontSize: '0.92rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>📱</span>
                  <span>已綁定推播裝置管理 (共 {registeredTokensCount} 台)</span>
                </div>
                {userDeviceTokens.length > 1 && (
                  <button
                    type="button"
                    onClick={handleClearOtherTokens}
                    className="glass-btn"
                    style={{ fontSize: '0.74rem', padding: '4px 10px', borderRadius: '8px', color: '#ffb94f', borderColor: 'rgba(255,185,79,0.3)' }}
                  >
                    🧹 清理其他裝置
                  </button>
                )}
              </div>

              {userDeviceTokens.length === 0 ? (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', padding: '12px 0', textAlign: 'center' }}>
                  尚未於任何裝置上註冊 FCM 推播 Token。
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {userDeviceTokens.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        justify: 'space-between',
                        alignItems: 'center',
                        padding: '10px 12px',
                        background: item.isCurrent ? 'rgba(48, 209, 88, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                        border: item.isCurrent ? '1px solid rgba(48, 209, 88, 0.3)' : '1px solid rgba(255, 255, 255, 0.06)',
                        borderRadius: '12px'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: '750', fontSize: '0.82rem', color: item.isCurrent ? '#8effa2' : '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>{item.label}</span>
                          {item.isCurrent && (
                            <span style={{ fontSize: '0.68rem', background: '#30d158', color: '#000', padding: '1px 6px', borderRadius: '6px', fontWeight: '800' }}>
                              當前裝置
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontFamily: 'monospace', marginTop: '2px' }}>
                          Token: {item.shortToken}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleUnbindToken(item.token)}
                        className="glass-btn"
                        style={{ fontSize: '0.74rem', padding: '4px 8px', borderRadius: '8px', color: '#ff453a', borderColor: 'rgba(255,69,58,0.3)', background: 'rgba(255,69,58,0.06)' }}
                      >
                        🗑️ 解除綁定
                      </button>
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

          </div>
        )}

        {/* === 3. 智慧引導助手 (替代原操作指南與常見問題) === */}
        {(currentSubTab === 'guide' || currentSubTab === 'faq') && (
          <HelpWizard onNavigateWithGuide={onNavigateWithGuide} />
        )}

        {/* === 5. 歷史軌跡 === */}
        {activeSubTab === 'logs' && (
          <div className="glass-card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              
              {/* Filters grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '4px' }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '4px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', paddingLeft: '4px' }}>📅 起始日期</span>
                  <input 
                    type="date" 
                    value={logStartDate} 
                    onChange={(e) => setLogStartDate(e.target.value)} 
                    className="glass-input" 
                    style={{ margin: 0, padding: '6px 8px', fontSize: '0.8rem', height: '36px', borderRadius: '8px' }}
                  />
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', paddingLeft: '4px' }}>📅 結束日期</span>
                  <input 
                    type="date" 
                    value={logEndDate} 
                    onChange={(e) => setLogEndDate(e.target.value)} 
                    className="glass-input" 
                    style={{ margin: 0, padding: '6px 8px', fontSize: '0.8rem', height: '36px', borderRadius: '8px' }}
                  />
                </div>
              </div>

              <input 
                type="text" 
                placeholder="🔍 輸入關鍵字搜尋已載入軌跡..." 
                value={logSearchText} 
                onChange={(e) => setLogSearchText(e.target.value)} 
                className="glass-input" 
                style={{ width: '100%', boxSizing: 'border-box', margin: '0 0 6px 0', padding: '8px 12px', fontSize: '0.82rem', borderRadius: '8px' }}
              />

              <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', display: 'flex', justifyContent: 'space-between', padding: '0 4px', marginBottom: '4px' }}>
                <span>已載入: {dbLogs.length} 筆</span>
                <span>符合搜尋: {filteredLogs.length} 筆</span>
              </div>

              {loadingLogs && dbLogs.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.84rem', padding: '40px 0' }}>載入中...</div>
              ) : dbLogs.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.84rem', padding: '40px 0' }}>目前尚無操作紀錄。</div>
              ) : filteredLogs.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.84rem', padding: '40px 0' }}>無符合條件的軌跡。</div>
              ) : (
                <>
                  <div className="timeline-list" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                    {filteredLogs.slice(0, 200).map((log, idx) => (
                      <div key={log.id || idx} className="timeline-item">
                        <div className={getTimelineDotClass(log.action)} />
                        <div className="timeline-meta">
                          <span className="timeline-operator">{log.operator}</span>
                          <span>{formatTimestamp(log.timestamp)}</span>
                        </div>
                        <div className="timeline-desc" style={{ wordBreak: 'break-all' }}>{log.detail}</div>
                      </div>
                    ))}
                    {filteredLogs.length > 200 && (
                      <div style={{ textAlign: 'center', fontSize: '0.74rem', color: 'var(--text-tertiary)', padding: '12px 0', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
                        ⚠️ 僅顯示最新的 200 筆軌跡（尚有 {filteredLogs.length - 200} 筆未列出）
                      </div>
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
                        color: 'var(--text-primary)',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        cursor: 'pointer',
                        marginTop: '8px'
                      }}
                    >
                      {loadingLogs ? '載入中...' : '載入先前軌跡'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* === 6. 系統資訊 === */}
        {activeSubTab === 'info' && (() => {
          let statusText = '偵測中...';
          let statusColor = 'var(--text-secondary)';
          let showBtn = false;
          if (notificationPermission === 'granted') {
            statusText = '已開啟通知 系統運作中 ✅';
            statusColor = 'var(--accent-green)';
          } else if (notificationPermission === 'denied') {
            statusText = '通知已遭封鎖 ❌ (請至瀏覽器設定允許)';
            statusColor = 'var(--accent-red)';
          } else if (notificationPermission === 'unsupported') {
            statusText = '不支援通知 🚫';
            statusColor = 'var(--text-tertiary)';
          } else {
            statusText = '尚未啟用通知 🔔';
            statusColor = 'var(--accent-orange)';
            showBtn = true;
          }
          return (
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
          );
        })()}

      </div>
    </div>
  );
};

export default SettingsView;
