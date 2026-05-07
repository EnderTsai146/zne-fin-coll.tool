// src/App.jsx
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import Login from './components/Login';
import TotalOverview from './components/TotalOverview';
import MonthlyView from './components/MonthlyView';
import AssetTransfer from './components/AssetTransfer';
import InvestmentView from './components/InvestmentView';
import ExpenseEntry from './components/ExpenseEntry';
import ReviewView from './components/ReviewView';
import './index.css';
import { db, auth } from './firebase';
import { doc, onSnapshot, setDoc, getDoc } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { MAKE_WEBHOOK_URL } from './config';

const USER_MAPPING = {
  "hzh940317@gmail.com": "恆恆🐶",
  "ender.tsai@gmail.com": "得得🐕"
};

// ★ Module‑level — stable reference so React doesn't remount
const NAV_ITEMS = [
  { id: 'overview', icon: '🏠', label: '總覽' },
  { id: 'monthly', icon: '📊', label: '紀錄' },
  { id: 'review',  icon: '📖', label: '回顧' },
  { id: 'invest',  icon: '📈', label: '投資' },
  { id: 'transfer', icon: '🛠️', label: '操作' },
  { id: 'expense', icon: '✍️', label: '記帳' }
];

// ★ Liquid‑glass bottom nav with sliding pill
const BottomNav = ({ currentPage, onPageChange, assets }) => {
  const navRef = useRef(null);
  const [pillStyle, setPillStyle] = useState({ opacity: 0 });

  useLayoutEffect(() => {
    if (!navRef.current) return;
    const idx = NAV_ITEMS.findIndex(item => item.id === currentPage);
    if (idx < 0) return;
    // children[0] = pill div, children[1+] = nav‑items
    const child = navRef.current.children[idx + 1];
    if (!child) return;
    setPillStyle({
      width: child.offsetWidth,
      height: child.offsetHeight,
      transform: `translateX(${child.offsetLeft}px)`,
      opacity: 1,
    });
  }, [currentPage]);

  const hasPendingBills = assets?.bills?.some(b => {
    const todayStr = new Date().toISOString().split('T')[0];
    return Math.ceil((new Date(b.nextDate) - new Date(todayStr)) / (1000 * 60 * 60 * 24)) <= 3;
  });

  return (
    <div className="bottom-nav" ref={navRef}>
      {/* Liquid glass sliding pill */}
      <div className="nav-pill" style={pillStyle} />
      {NAV_ITEMS.map(item => (
        <div
          key={item.id}
          className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
          onClick={() => onPageChange(item.id)}
          style={{ position: 'relative' }}
        >
          <div className="nav-icon">
            {item.icon}
            {item.id === 'expense' && hasPendingBills && (
              <span className="nav-warning-dot" />
            )}
          </div>
          <div className="nav-label">{item.label}</div>
        </div>
      ))}
    </div>
  );
};

// MAKE_WEBHOOK_URL moved to config.js

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [operatorName, setOperatorName] = useState('');
  const [loading, setLoading] = useState(true);
  const [dataReady, setDataReady] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [splashPhase, setSplashPhase] = useState('loading');
  const dataReadyForSplash = useRef(false);
  const [currentPage, setCurrentPage] = useState('overview');
  const [currentFxRate, setCurrentFxRate] = useState(31.5);

  // ★ Sync body data-page attribute for per-page background gradients
  useEffect(() => {
    document.body.setAttribute('data-page', currentPage);
  }, [currentPage]);

  // ★ 馬鈴薯進度條動畫引擎
  useEffect(() => {
    if (splashPhase === 'done' || splashPhase === 'exit') return;
    const interval = setInterval(() => {
      setLoadProgress(prev => {
        if (prev >= 100) return 100;
        if (dataReadyForSplash.current) return Math.min(100, prev + 2.5);
        if (prev < 30) return prev + 0.8;
        if (prev < 55) return prev + 0.4;
        if (prev < 75) return prev + 0.12;
        if (prev < 85) return prev + 0.03;
        return prev;
      });
    }, 50);
    return () => clearInterval(interval);
  }, [splashPhase]);

  // ★ 追蹤實際載入狀態 → 驅動進度條衝刺
  useEffect(() => {
    if (!loading && !currentUser) setSplashPhase('done');
    if (!loading && currentUser && dataReady) dataReadyForSplash.current = true;
  }, [loading, currentUser, dataReady]);

  // ★ 進度到 100% → 觸發過場
  useEffect(() => {
    if (loadProgress >= 100 && splashPhase === 'loading') setSplashPhase('filled');
  }, [loadProgress, splashPhase]);

  // ★ 過場動畫時間軸
  useEffect(() => {
    if (splashPhase === 'filled') {
      const t = setTimeout(() => setSplashPhase('exit'), 800);
      return () => clearTimeout(t);
    }
    if (splashPhase === 'exit') {
      const t = setTimeout(() => setSplashPhase('done'), 700);
      return () => clearTimeout(t);
    }
  }, [splashPhase]);

  // ★ 超時安全閥：15 秒後強制完成
  useEffect(() => {
    const timeout = setTimeout(() => { dataReadyForSplash.current = true; }, 15000);
    return () => clearTimeout(timeout);
  }, []);
  
  const [showLineSettings, setShowLineSettings] = useState(false);
  const [tempLineCount, setTempLineCount] = useState('');

  const [assets, setAssets] = useState({
    userA: 0,
    userB: 0,
    userA_usd: 0,
    userB_usd: 0,
    jointCash: 0,
    jointCash_usd: 0,
    jointInvestments: { stock: 0, fund: 0, deposit: 0, other: 0 },
    userInvestments: {
      userA: { stock: 0, fund: 0, deposit: 0, other: 0 },
      userB: { stock: 0, fund: 0, deposit: 0, other: 0 }
    },
    roi: { stock: 0, fund: 0, deposit: 0, other: 0 },
    monthlyExpenses: [],
    bills: []
  });

  const [archivedRecords, setArchivedRecords] = useState({});
  const archivedRecordsRef = useRef({});
  const [isFetchingArchive, setIsFetchingArchive] = useState(false);
  const archivingInProgress = useRef(false);
  const repairAttempted = useRef(false);

  // ★ Fix: 用 ref 同步追蹤已載入的月份，避免 useCallback 依賴 state 導致引用不穩定
  useEffect(() => { archivedRecordsRef.current = archivedRecords; }, [archivedRecords]);

  const loadArchiveMonth = useCallback(async (monthStr) => {
    if (!monthStr || archivedRecordsRef.current[monthStr] !== undefined) return;
    setIsFetchingArchive(true);
    try {
      const snap = await getDoc(doc(db, "finance", `arc_${monthStr}`));
      if (snap.exists() && snap.data().records) {
        setArchivedRecords(prev => ({ ...prev, [monthStr]: snap.data().records }));
      } else {
        setArchivedRecords(prev => ({ ...prev, [monthStr]: [] }));
      }
    } catch (e) {
      console.error("載入歸檔失敗:", e);
    } finally {
      setIsFetchingArchive(false);
    }
  }, []);

  // ★ Fix: useMemo 取代 useCallback + 呼叫，避免每次 render 產生新陣列引用
  const combinedHistory = useMemo(() => {
    const combined = (assets.monthlyExpenses || []).map((r, i) => ({
      ...r,
      _context: { source: 'main', index: i }
    }));
    
    Object.keys(archivedRecords).forEach(month => {
      (archivedRecords[month] || []).forEach((r, i) => {
        combined.push({
          ...r,
          _context: { source: 'archive', month: month, index: i }
        });
      });
    });
    return combined;
  }, [assets.monthlyExpenses, archivedRecords]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
        setOperatorName(USER_MAPPING[user.email] || user.email.split('@')[0]);
        // ★ 不要在此設 loading=false，等 Firestore 資料到位後再解鎖
      } else {
        setCurrentUser(null);
        setOperatorName('');
        setDataReady(false);
        setLoading(false); // 未登入時直接解鎖，讓 Login 頁面顯示
      }
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const docRef = doc(db, "finance", "data");
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (!data.userInvestments) {
          data.userInvestments = {
            userA: { stock: 0, fund: 0, deposit: 0, other: 0 },
            userB: { stock: 0, fund: 0, deposit: 0, other: 0 }
          };
        }
        const currentMonthStr = new Date().toISOString().slice(0, 7);
        let needsUpdate = false;
        if (!data.lineConfig || data.lineConfig.month !== currentMonthStr) {
           data.lineConfig = { batchMode: false, month: currentMonthStr };
           data.lineNotifCount = { month: currentMonthStr, count: 0 };
           needsUpdate = true;
        }
        if (!data.pendingLineNotifications) {
           data.pendingLineNotifications = [];
           needsUpdate = true;
        }

        // ★ 安全月度歸檔引擎 — 序列化處理以防資料遺失
        if (data.monthlyExpenses && data.monthlyExpenses.length > 0) {
          try {
            const now = new Date();
            const keepMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const keepCutoff = `${keepMonth.getFullYear()}-${String(keepMonth.getMonth() + 1).padStart(2, '0')}`;

            const toArchive = {};
            data.monthlyExpenses.forEach(r => {
              const rMonth = (r.month || (r.date || '').slice(0, 7));
              if (rMonth < keepCutoff) {
                if (!toArchive[rMonth]) toArchive[rMonth] = [];
                toArchive[rMonth].push(r);
              }
            });

            const archiveMonths = Object.keys(toArchive).sort();
            if (archiveMonths.length > 0 && !archivingInProgress.current) {
              archivingInProgress.current = true;
              console.log(`[系統優化] 觸發安全的序向歸檔機制，準備寫入：`, archiveMonths);

              const runSafeArchival = async () => {
                try {
                  const sumAssets = (state) => {
                    if (!state) return 0;
                    const twd = (state.userA || 0) + (state.userB || 0) + (state.jointCash || 0);
                    const usd = (state.userA_usd || 0) + (state.userB_usd || 0) + (state.jointCash_usd || 0);
                    const sumInv = (obj) => Object.values(obj || {}).reduce((s, v) => s + v, 0);
                    const invest = sumInv(state.jointInvestments) + sumInv(state.userInvestments?.userA) + sumInv(state.userInvestments?.userB);
                    return twd + Math.round(usd * (currentFxRate || 31.5)) + invest;
                  };

                  let archivedTimestamps = new Set();

                  // 1. 先安全合併到個別歷史檔案（防止覆蓋）
                  for (const month of archiveMonths) {
                    const archiveDocRef = doc(db, "finance", `arc_${month}`);
                    const arcSnap = await getDoc(archiveDocRef);
                    const rawRecords = arcSnap.exists() ? (arcSnap.data().records || []) : [];
                    
                    const existingMap = new Map();
                    rawRecords.forEach(r => existingMap.set(r.timestamp, r));
                    
                    toArchive[month].forEach(r => {
                        existingMap.set(r.timestamp, r); // 如果有同時間戳的更新，以主檔案 (即將歸檔的這筆) 為主
                        archivedTimestamps.add(r.timestamp);
                    });

                    await setDoc(archiveDocRef, {
                      month: month,
                      archivedAt: new Date().toISOString(),
                      records: Array.from(existingMap.values())
                    });
                    console.log(`✅ 已安全合併歸檔 ${month}，共儲存 ${existingMap.size} 筆`);
                  }

                  // 2. 所有歷史檔案都確定寫入成功後，重新抓取最新的主檔案進行清理
                  const mainDocRef = doc(db, "finance", "data");
                  const mainSnap = await getDoc(mainDocRef);
                  if (mainSnap.exists()) {
                     const mainData = mainSnap.data();
                     const safeMonthly = (mainData.monthlyExpenses || []).filter(r => !archivedTimestamps.has(r.timestamp));
                     
                     const newSnapshots = { ...(mainData.dailyNetWorth || {}) };
                     const holdingsBase = mainData.currentStockHoldings ? { ...mainData.currentStockHoldings } : {};
                     // ★ 防禦性初始化：確保所有現有持股項目都有成本欄位
                     Object.keys(holdingsBase).forEach(k => {
                       if (holdingsBase[k] && typeof holdingsBase[k] === 'object') {
                         if (holdingsBase[k].costTwd === undefined) holdingsBase[k].costTwd = 0;
                         if (holdingsBase[k].costUsd === undefined) holdingsBase[k].costUsd = 0;
                       }
                     });
                     
                     // 根據剛成功歸檔的資料更新快照與持股基準
                     archiveMonths.forEach(month => {
                       toArchive[month].forEach(r => {
                         if (!r.isDeleted && r.auditTrail?.after && r.date && !newSnapshots[r.date]) {
                             newSnapshots[r.date] = sumAssets(r.auditTrail.after);
                         }
                         if (!r.isDeleted && r.symbol) {
                            const sym = r.symbol;
                            const payer = r.payer ? r.payer.replace(/🐶|🐕/g, '') : '共同帳戶';
                            const key = `${payer}_${sym}`;
                            if (!holdingsBase[key]) holdingsBase[key] = { shares: 0, market: r.market || 'TW', costTwd: 0, costUsd: 0 };
                            if (r.type?.includes('buy')) {
                              holdingsBase[key].shares += (Number(r.shares) || 0);
                              holdingsBase[key].costTwd += (Number(r.total) || 0);
                              holdingsBase[key].costUsd += (Number(r.usdAmount) || 0);
                            } else if (r.type?.includes('sell')) {
                              const sellShares = Number(r.shares) || 0;
                              const ratio = holdingsBase[key].shares > 0 ? sellShares / holdingsBase[key].shares : 0;
                              holdingsBase[key].costTwd -= (holdingsBase[key].costTwd * ratio);
                              holdingsBase[key].costUsd -= (holdingsBase[key].costUsd * ratio);
                              holdingsBase[key].shares -= sellShares;
                            }
                         }
                       });
                     });
                     
                     Object.keys(holdingsBase).forEach(k => { if (holdingsBase[k].shares <= 0) delete holdingsBase[k]; });

                     await setDoc(mainDocRef, {
                        ...mainData,
                        monthlyExpenses: safeMonthly,
                        dailyNetWorth: newSnapshots,
                        currentStockHoldings: holdingsBase
                     }, { merge: true });
                     console.log(`🚀 主檔案已成功清理完成，系統永續優化成功`);
                  }
                } catch (error) {
                  console.error("❌ 歸檔引擎中途連線失敗，已中止清理主流程。確保資料不會遺失:", error);
                } finally {
                  archivingInProgress.current = false;
                }
              };

              runSafeArchival();
            }
          } catch (error) {
            console.error("歸檔引擎觸發階段發生例外:", error);
          }
        }

        if (needsUpdate) setDoc(docRef, data);

        setAssets(data);
        setDataReady(true);
        setLoading(false);
      } else {
        setDoc(docRef, assets);
        setDataReady(true);
        setLoading(false);
      }
    }, (error) => { console.error("資料讀取失敗:", error); setLoading(false); });
    return () => unsubscribe();
    // eslint-disable-next-line
  }, [currentUser]);

  // ★ 自動修復：偵測持股成本資料缺失並從歷史歸檔重建
  useEffect(() => {
    if (repairAttempted.current || !currentUser || !dataReady) return;
    const holdings = assets.currentStockHoldings;
    if (!holdings) return;
    const broken = Object.entries(holdings).filter(([, v]) =>
      v && v.shares > 0 && !v.costTwd && !v.costUsd
    );
    if (broken.length === 0) return;
    repairAttempted.current = true;
    console.log('[自動修復] 偵測到持股成本缺失:', broken.map(b => b[0]));
    const doRepair = async () => {
      try {
        const updated = JSON.parse(JSON.stringify(holdings));
        const now = new Date();
        const allRecs = [...(assets.monthlyExpenses || [])];
        for (let i = 18; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          try {
            const snap = await getDoc(doc(db, "finance", `arc_${m}`));
            if (snap.exists() && snap.data().records) allRecs.push(...snap.data().records);
          } catch (_) { /* skip */ }
        }
        allRecs.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.timestamp || '').localeCompare(b.timestamp || ''));
        let changed = false;
        for (const [key] of broken) {
          let sym = key, ownerFilter = '共同帳戶';
          if (key.includes('_')) { const p = key.split('_'); ownerFilter = p[0]; sym = p.slice(1).join('_'); }
          const lots = [];
          allRecs.filter(r => !r.isDeleted && r.symbol === sym && r.payer && r.payer.replace(/🐶|🐕/g, '').includes(ownerFilter))
            .forEach(r => {
              if (r.type?.includes('buy')) {
                lots.push({ shares: Number(r.shares) || 0, costTwd: Number(r.total) || 0, costUsd: Number(r.usdAmount) || 0 });
              } else if (r.type?.includes('sell')) {
                let rem = Number(r.shares) || 0;
                while (rem > 0 && lots.length > 0) {
                  if (lots[0].shares <= rem) { rem -= lots[0].shares; lots.shift(); }
                  else { const f = rem / lots[0].shares; lots[0].costTwd *= (1 - f); lots[0].costUsd *= (1 - f); lots[0].shares -= rem; rem = 0; }
                }
              }
            });
          const costTwd = lots.reduce((s, l) => s + l.costTwd, 0);
          const costUsd = lots.reduce((s, l) => s + l.costUsd, 0);
          if (costTwd > 0 || costUsd > 0) {
            updated[key] = { ...updated[key], costTwd, costUsd };
            changed = true;
            console.log(`[自動修復] ${key}: costTwd=${Math.round(costTwd)}, costUsd=${costUsd.toFixed(2)}`);
          }
        }
        if (changed) {
          await setDoc(doc(db, "finance", "data"), { currentStockHoldings: updated }, { merge: true });
          console.log('[自動修復] 持股成本修復完成');
        }
      } catch (err) { console.error('[自動修復] 修復失敗:', err); }
    };
    doRepair();
    // eslint-disable-next-line
  }, [currentUser, dataReady]);

  const saveToCloud = (newAssets) => {
    if (!currentUser) return;
    const docRef = doc(db, "finance", "data");
    setDoc(docRef, newAssets).catch((err) => alert("連線錯誤：" + err.message));
  };

  // (舊的 22 點晚間自動批次發送邏輯已被移除，改用手動開關觸發收集與發送)

  const sendLineNotification = async (data) => {
    try {
      const safeData = {
        title: String(data.title || "系統通知").replace(/"/g, '＂').replace(/\n/g, ' '),
        amount: String(data.amount || "$0").replace(/"/g, '＂'),
        category: String(data.category || "未分類").replace(/"/g, '＂').replace(/\n/g, ' '),
        // Fix #4: 彙整通知保留換行，一般通知清除換行
        note: data.isSummary
          ? String(data.note || "無備註").replace(/"/g, '＂')
          : String(data.note || "無備註").replace(/"/g, '＂').replace(/\n/g, ' '),
        date: String(data.date || new Date().toISOString().split('T')[0]),
        color: String(data.color || "#666666"),
        operator: String(data.operator || operatorName || "系統").replace(/"/g, '＂')
      };
      await fetch(MAKE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(safeData)
      });
    } catch (error) {
      console.error("Line 通知發送失敗", error);
    }
  };

  const handleLogout = () => {
    if (window.confirm("確定要登出嗎？")) signOut(auth);
  };

  const getSnapshot = (currentAssets) => ({
    userA: currentAssets.userA,
    userB: currentAssets.userB,
    userA_usd: currentAssets.userA_usd || 0,
    userB_usd: currentAssets.userB_usd || 0,
    jointCash: currentAssets.jointCash,
    jointCash_usd: currentAssets.jointCash_usd || 0,
    jointInvestments: { ...(currentAssets.jointInvestments || {}) },
    userInvestments: currentAssets.userInvestments
      ? JSON.parse(JSON.stringify(currentAssets.userInvestments))
      : { userA: { stock: 0, fund: 0, deposit: 0, other: 0 }, userB: { stock: 0, fund: 0, deposit: 0, other: 0 } }
  });

  const handleTransaction = (newAssets, historyRecordsInput) => {
    const timestamp = new Date().toISOString();
    const records = Array.isArray(historyRecordsInput) ? historyRecordsInput : [historyRecordsInput];

    const isBatch = assets.lineConfig?.batchMode;
    const increment = isBatch ? 0 : 1;

    const finalAssets = getUpdatedAssetsWithLineCount({
      ...newAssets,
      monthlyExpenses: [
        ...(assets.monthlyExpenses || []),
        ...records.map(r => ({
          ...r,
          operator: operatorName,
          timestamp: timestamp,
          auditTrail: { before: getSnapshot(assets), after: getSnapshot(newAssets) }
        }))
      ]
    }, increment);

    const appended = [];

    records.forEach(historyRecord => {
      let color = "#17c9b2"; let title = "資產變動";
      if (historyRecord.type === 'income') { color = "#06c755"; title = "收入入帳"; }
      else if (historyRecord.type === 'spend') { color = "#ef454d"; title = "共同支出"; }
      else if (historyRecord.type === 'transfer') { color = "#2b90d9"; title = "資產劃撥"; }
      else if (historyRecord.type === 'exchange') { color = "#3498db"; title = "外幣換匯"; }
      else if (historyRecord.type === 'calibrate') { color = "#95a5a6"; title = "餘額校正"; }
      else if (historyRecord.type.includes('invest_sell')) { color = "#f1c40f"; title = "投資變現"; }
      else if (historyRecord.type.includes('invest_buy')) { color = "#8e44ad"; title = "買入投資"; }

      let signPrefix = '';
      if (['income', 'joint_invest_sell', 'personal_invest_sell', 'personal_invest_profit', 'liquidate'].includes(historyRecord.type)) { signPrefix = '+'; }
      else if (['spend', 'expense', 'joint_invest_buy', 'personal_invest_buy', 'personal_invest_loss'].includes(historyRecord.type)) { signPrefix = '-'; }
      else if (['transfer', 'settle', 'exchange', 'calibrate'].includes(historyRecord.type)) { signPrefix = '🔄 '; }

      const usdNote = historyRecord.usdAmount ? ` (含 $${historyRecord.usdAmount} USD)` : '';
      const payload = { title: title, amount: `${signPrefix}$${(Number(historyRecord.total) || 0).toLocaleString()}`, category: historyRecord.category, note: `${historyRecord.note || '無'}${usdNote}`, date: historyRecord.date, color: color, operator: operatorName };
      
      if (isBatch) appended.push(payload);
      else sendLineNotification(payload);
    });

    if (isBatch) finalAssets.pendingLineNotifications = [...(assets.pendingLineNotifications || []), ...appended];
    
    saveToCloud(finalAssets);
    setCurrentPage('overview');
  };

  const handleAddExpense = (date, expenseData, totalAmount, payer, note, updatedBills = null) => {
    const payerKey = payer === 'heng' ? 'userA' : 'userB';
    const payerName = payer === 'heng' ? '恆恆🐶' : '得得🐕';

    // Fix #2: 加入 return 攔截餘額不足的操作
    if (assets[payerKey] < totalAmount) return alert(`⚠️ ${payerName} 的個人餘額不足！`);

    const finalNote = note || '日記帳';
    const newAssetsTemp = { ...assets, [payerKey]: assets[payerKey] - totalAmount };

    const isBatch = assets.lineConfig?.batchMode;
    const finalAssets = getUpdatedAssetsWithLineCount({
      ...newAssetsTemp,
      ...(updatedBills ? { bills: updatedBills } : {}),
      monthlyExpenses: [
        ...(assets.monthlyExpenses || []),
        {
          date, month: date.slice(0, 7), type: 'expense', category: '個人支出', details: expenseData,
          total: totalAmount, payer: payerName, operator: operatorName, note: finalNote,
          timestamp: new Date().toISOString(), auditTrail: { before: getSnapshot(assets), after: getSnapshot(newAssetsTemp) }
        }
      ]
    }, isBatch ? 0 : 1);

    const payload = { title: "個人日記帳", amount: `-$${totalAmount.toLocaleString()}`, category: "個人支出", note: finalNote, date: date, color: "#ef454d", operator: operatorName };
    if (isBatch) finalAssets.pendingLineNotifications = [...(assets.pendingLineNotifications || []), payload];

    saveToCloud(finalAssets);
    alert("✅ 記帳完成！");
    setCurrentPage('overview');
    if (!isBatch) sendLineNotification(payload);
  };

  const handleAddJointExpense = (date, category, amount, advancedBy, note, updatedBills = null) => {
    const val = Number(amount) || 0;
    const newAssets = { ...assets };

    let paymentMethodName = "共同帳戶直接付";
    if (advancedBy === 'jointCash') {
      if (newAssets.jointCash < val) return alert("❌ 共同現金不足！");
      newAssets.jointCash -= val;
    } else if (advancedBy === 'userA') {
      if (newAssets.userA < val) return alert("❌ 恆恆的個人餘額不足以代墊！");
      newAssets.userA -= val;
      paymentMethodName = "恆恆先墊 (User A)";
    } else if (advancedBy === 'userB') {
      if (newAssets.userB < val) return alert("❌ 得得的個人餘額不足以代墊！");
      newAssets.userB -= val;
      paymentMethodName = "得得先墊 (User B)";
    }

    const safeNote = note ? String(note).trim() : '';
    const isBatch = assets.lineConfig?.batchMode;
    
    const finalAssets = getUpdatedAssetsWithLineCount({
      ...newAssets,
      ...(updatedBills ? { bills: updatedBills } : {}),
      monthlyExpenses: [
        ...(newAssets.monthlyExpenses || []),
        {
          date, month: date.slice(0, 7), type: 'spend', category: '共同支出', payer: '共同帳戶',
          total: val, note: safeNote ? `${category} - ${safeNote}` : category,
          operator: operatorName, advancedBy: advancedBy === 'jointCash' ? null : advancedBy,
          isSettled: false, timestamp: new Date().toISOString(), auditTrail: { before: getSnapshot(assets), after: getSnapshot(newAssets) }
        }
      ]
    }, isBatch ? 0 : 1);

    const payload = { title: "共同支出", amount: `-$${val.toLocaleString()}`, category: "共同支出", note: safeNote ? `${category} - ${safeNote}` : category, date: date, color: "#ef454d", operator: operatorName };
    if (isBatch) finalAssets.pendingLineNotifications = [...(assets.pendingLineNotifications || []), payload];

    saveToCloud(finalAssets);
    alert(`💸 已記錄共同支出 $${val.toLocaleString()} \n付款方式：${paymentMethodName}`);
    setCurrentPage('overview');
    if (!isBatch) sendLineNotification(payload);
  };

  // ★ 嚴格防護的修改功能：只准改文字與日期，金額絕不可動
  const handleEditTransaction = (context, newData) => {
    const newAssets = { ...assets };
    
    let list;
    let targetRecord;
    if (context.source === 'main') {
      list = [...newAssets.monthlyExpenses];
      targetRecord = list[context.index];
    } else {
      list = [...archivedRecords[context.month]];
      targetRecord = list[context.index];
    }

    const oldDate = targetRecord.date;
    const newDate = newData.date;

    // ★ 鎖定共同支出的舊分類，避免改變備註後統計圓餅圖跟著跑位
    let subCategory = targetRecord.subCategory;
    if (!subCategory && targetRecord.type === 'spend') {
        const oldNote = targetRecord.note || '';
        if (oldNote.includes('餐費')) subCategory = '餐費';
        else if (oldNote.includes('購物')) subCategory = '購物';
        else if (oldNote.includes('固定')) subCategory = '固定費用';
        else subCategory = '其他';
    }

    const mutatedRecord = {
      ...targetRecord,
      date: newDate,
      month: newDate.slice(0, 7),
      category: newData.category,
      note: newData.note,
      ...(subCategory && { subCategory }),
      operator: operatorName
    };

    if (context.source === 'main') {
      // 快照刪除只在活躍月進行（保護歷史冷資料庫不會因為斷聯而失去計算基準）
      if (newAssets.dailyNetWorth) {
        if (newAssets.dailyNetWorth[oldDate]) delete newAssets.dailyNetWorth[oldDate];
        if (newAssets.dailyNetWorth[newDate]) delete newAssets.dailyNetWorth[newDate];
      }
      list[context.index] = mutatedRecord;
      newAssets.monthlyExpenses = list;
    } else {
      const targetMonth = newDate.slice(0, 7);
      if (targetMonth !== context.month) {
        // ★ 跨月修復機制：若修改的日期跨越當前所屬月份，從舊歸檔庫中拔除，遣返回主區。
        list.splice(context.index, 1);
        setArchivedRecords(prev => ({ ...prev, [context.month]: list }));
        setDoc(doc(db, "finance", `arc_${context.month}`), {
          month: context.month,
          archivedAt: new Date().toISOString(),
          records: list
        }).catch(e => alert("歷史庫舊紀錄移除失敗：" + e.message));
        
        // 遣送回主動區，讓安全的 Archival Engine 等等把它接走重新安置。
        newAssets.monthlyExpenses = [...(newAssets.monthlyExpenses || []), mutatedRecord];
      } else {
        list[context.index] = mutatedRecord;
        setArchivedRecords(prev => ({ ...prev, [context.month]: list }));
        setDoc(doc(db, "finance", `arc_${context.month}`), {
          month: context.month,
          archivedAt: new Date().toISOString(),
          records: list
        }).catch(e => alert("歸檔紀錄唯讀同步失敗：" + e.message));
      }
    }

    saveToCloud(newAssets);
    alert("✅ 紀錄修改成功！(金額與帳戶已受保護不可修改)");
  };

  // ★ 完美還原的作廢功能
  const handleDeleteTransaction = (context) => {
    let list;
    let record;
    if (context.source === 'main') {
      list = [...(assets.monthlyExpenses || [])];
      record = list[context.index];
    } else {
      list = [...(archivedRecords[context.month] || [])];
      record = list[context.index];
    }

    if (!record) return;
    if (record.isDeleted) return alert("❌ 這筆紀錄已經被作廢過了！");
    if (record.category === '作廢退款') return alert("❌ 「作廢退款」紀錄不可再次作廢！");
    if (record.isSettled && record.advancedBy) return alert("❌ 此筆消費已被「結清」！\n請先在流水帳中作廢「系統結算」紀錄，才能作廢此筆消費。");

    const reason = window.prompt("⚠️ 即將作廢此紀錄，系統將自動還原對應的金額。\n請輸入作廢原因（必填）：");
    if (!reason || !reason.trim()) return alert("❌ 必須輸入作廢原因才能繼續。");

    const snapshotBefore = getSnapshot(assets);
    // Fix #7: 深拷貝巢狀物件，避免 state 汙染
    const newAssets = {
      ...assets,
      jointInvestments: { ...(assets.jointInvestments || { stock: 0, fund: 0, deposit: 0, other: 0 }) },
      userInvestments: assets.userInvestments
        ? { userA: { ...assets.userInvestments.userA }, userB: { ...assets.userInvestments.userB } }
        : { userA: { stock: 0, fund: 0, deposit: 0, other: 0 }, userB: { stock: 0, fund: 0, deposit: 0, other: 0 } }
    };
    const safePayer = record.payer || '';
    const payerKey = safePayer.includes('恆恆') ? 'userA' : (safePayer.includes('得得') ? 'userB' : null);

    let updatedExpenses = [...(assets.monthlyExpenses || [])];

    // 依據交易類型，進行精準的反向加減 (包含美金與台幣)
    switch (record.type) {
      case 'settle':
        if (record.settledUser) {
          newAssets.jointCash += record.total;
          newAssets[record.settledUser] -= record.total;
        }
        if (record.settleId) {
          updatedExpenses = updatedExpenses.map(r => r.settleId === record.settleId ? { ...r, isSettled: false, settleId: null } : r);
        }
        break;
      case 'income':
      case 'personal_invest_profit':
        if (payerKey) newAssets[payerKey] -= record.total; break;
      case 'expense':
      case 'personal_invest_loss':
        if (payerKey) newAssets[payerKey] += record.total; break;
      case 'spend':
        if (record.advancedBy === 'jointCash' || !record.advancedBy) newAssets.jointCash += record.total;
        else newAssets[record.advancedBy] += record.total;
        break;
      case 'transfer':
        if (payerKey) newAssets[payerKey] += record.total;
        newAssets.jointCash -= record.total;
        break;
      case 'exchange':
        if (record.note && record.note.includes('台幣換美金')) {
          newAssets[record.accountKey] += record.total;
          if (record.usdAmount) newAssets[`${record.accountKey}_usd`] -= record.usdAmount;
        } else {
          newAssets[record.accountKey] -= record.total;
          if (record.usdAmount) newAssets[`${record.accountKey}_usd`] += record.usdAmount;
        }
        break;
      case 'calibrate':
        if (record.accountKey) {
          if (record.twdDiff !== undefined) newAssets[record.accountKey] -= record.twdDiff;
          if (record.usdDiff !== undefined) newAssets[`${record.accountKey}_usd`] -= record.usdDiff;
        }
        break;
      case 'joint_invest_buy':
        if (record.usdAmount) newAssets.jointCash_usd = (newAssets.jointCash_usd || 0) + record.usdAmount;
        else newAssets.jointCash += record.total;

        if (record.investType && newAssets.jointInvestments[record.investType] !== undefined) {
          newAssets.jointInvestments[record.investType] -= record.total;
        }
        break;
      case 'personal_invest_buy':
        if (record.accountKey && newAssets.userInvestments && newAssets.userInvestments[record.accountKey]) {
          if (record.usdAmount) {
            newAssets[`${record.accountKey}_usd`] = (newAssets[`${record.accountKey}_usd`] || 0) + record.usdAmount;
          } else {
            newAssets[record.accountKey] += record.total;
          }
          newAssets.userInvestments[record.accountKey][record.investType] -= record.total;
        }
        break;
      case 'joint_invest_sell':
      case 'liquidate':
        if (record.usdAmount) newAssets.jointCash_usd = (newAssets.jointCash_usd || 0) - record.usdAmount;
        else newAssets.jointCash -= record.total;

        const sellType = record.investType || (record.note && record.note.split(' ')[1]);
        if (sellType && newAssets.jointInvestments[sellType] !== undefined) {
          newAssets.jointInvestments[sellType] += (record.principal || record.total);
        }
        break;
      case 'personal_invest_sell':
        if (record.accountKey && newAssets.userInvestments && newAssets.userInvestments[record.accountKey]) {
          if (record.usdAmount) {
            newAssets[`${record.accountKey}_usd`] -= record.usdAmount;
          } else {
            newAssets[record.accountKey] -= record.total;
          }
          newAssets.userInvestments[record.accountKey][record.investType] += (record.principal || record.total);
        }
        break;
      default: break;
    }

    const snapshotAfter = getSnapshot(newAssets);
    const updatedRecord = {
      ...record,
      isDeleted: true,
      deleteReason: reason.trim(),
      deleteTimestamp: new Date().toISOString(),
      deleteAuditTrail: { before: snapshotBefore, after: snapshotAfter }
    };
    list[context.index] = updatedRecord;

    // ★ 新增一筆「作廢退款」可見紀錄，讓 TotalOverview 的變動軌跡能追蹤到這個操作
    const calibrateRecord = {
      date: new Date().toISOString().split('T')[0],
      month: new Date().toISOString().slice(0, 7),
      type: 'calibrate',
      category: '作廢退款',
      total: record.total,
      note: `🗑️ 作廢退款: ${record.note} (原因: ${reason.trim()})`,
      payer: record.payer || '系統',
      operator: operatorName,
      timestamp: new Date().toISOString(),
      auditTrail: { before: snapshotBefore, after: snapshotAfter }
    };

    let mainList = [...(assets.monthlyExpenses || [])];

    if (context.source === 'main') {
      mainList = list;
      mainList.push(calibrateRecord);
    } else {
      mainList.push(calibrateRecord);
      setArchivedRecords(prev => ({ ...prev, [context.month]: list }));
      setDoc(doc(db, "finance", `arc_${context.month}`), {
         month: context.month,
         archivedAt: new Date().toISOString(),
         records: list
      }).catch(e => alert("歸檔紀錄同步失敗：" + e.message));
    }

    newAssets.monthlyExpenses = mainList;

    const isBatch = assets.lineConfig?.batchMode;
    const finalAssets = getUpdatedAssetsWithLineCount(newAssets, isBatch ? 0 : 1);
    
    const payload = { title: "🗑️ 刪除/作廢紀錄", amount: `🔄$${(Number(record.total) || 0).toLocaleString()}`, category: record.category, note: `已作廢: ${record.note} (原因: ${reason.trim()})`, date: new Date().toISOString().split('T')[0], color: "#666666", operator: operatorName };
    if (isBatch) finalAssets.pendingLineNotifications = [...(assets.pendingLineNotifications || []), payload];

    saveToCloud(finalAssets);
    if (!isBatch) sendLineNotification(payload);
    alert("🗑️ 紀錄已作廢，相關金額與投資本金已完全復原。");
  };

  const handleAssetsUpdate = (updatedAssets) => { saveToCloud(updatedAssets); };

  // Fix #9: 將 getUpdatedAssetsWithLineCount 移到 early return 之前，避免 hoisting 問題
  const getUpdatedAssetsWithLineCount = (assetsCopy, increment = 1) => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    let newCountObj = { month: currentMonth, count: increment };
    if (assetsCopy.lineNotifCount && assetsCopy.lineNotifCount.month === currentMonth) {
      newCountObj.count = assetsCopy.lineNotifCount.count + increment;
    }
    return { ...assetsCopy, lineNotifCount: newCountObj };
  };

  if (splashPhase !== 'done' && (loading || currentUser)) return (
    <div className={`splash-screen splash-phase-${splashPhase}`}>
      {/* Background aurora */}
      <div className="splash-aurora" />

      {/* Orbital rings */}
      <div className="splash-orbit splash-orbit-1" />
      <div className="splash-orbit splash-orbit-2" />
      <div className="splash-orbit splash-orbit-3" />
      
      {/* Glowing core */}
      <div className="splash-core">
        <div className="splash-core-glow" />
        <div className="splash-emoji">🥔</div>
      </div>
      
      {/* Particle dots */}
      <div className="splash-particles">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="splash-particle" style={{
            '--angle': `${i * 45}deg`,
            '--delay': `${i * 0.15}s`,
            '--distance': `${80 + (i % 3) * 20}px`
          }} />
        ))}
      </div>
      
      {/* ★ Potato Progress Bar */}
      <div className="potato-bar-container">
        <div className="potato-bar">
          <div className="potato-bar-fill" style={{ height: `${loadProgress}%` }}>
            {loadProgress > 15 && (
              <div className="potato-bar-bubbles">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="potato-bubble" style={{
                    '--bubble-delay': `${i * 0.35}s`,
                    '--bubble-x': `${15 + i * 16}%`,
                    '--bubble-size': `${3 + (i % 3) * 2}px`
                  }} />
                ))}
              </div>
            )}
          </div>
          <div className="potato-bar-spots">
            <div className="potato-spot" style={{ top: '18%', left: '15%' }} />
            <div className="potato-spot" style={{ top: '55%', left: '78%' }} />
            <div className="potato-spot" style={{ top: '72%', left: '30%' }} />
          </div>
          <div className="potato-bar-shine" />
          <div className="potato-bar-text">{Math.round(loadProgress)}%</div>
        </div>
      </div>

      {/* Text */}
      <div className="splash-text-group">
        <div className="splash-title">
          {splashPhase === 'filled' || splashPhase === 'exit' ? '馬鈴薯已甦醒！' : '馬鈴薯甦醒中'}
        </div>
        {splashPhase === 'loading' && (
          <div className="splash-dots">
            <span className="splash-dot" style={{ animationDelay: '0s' }}>.</span>
            <span className="splash-dot" style={{ animationDelay: '0.2s' }}>.</span>
            <span className="splash-dot" style={{ animationDelay: '0.4s' }}>.</span>
          </div>
        )}
      </div>
      
      {/* Golden burst rings (on fill complete) */}
      {(splashPhase === 'filled' || splashPhase === 'exit') && (
        <div className="splash-golden-burst">
          <div className="splash-burst-ring splash-burst-ring-1" />
          <div className="splash-burst-ring splash-burst-ring-2" />
          <div className="splash-burst-ring splash-burst-ring-3" />
        </div>
      )}

      {/* Flash overlay on exit */}
      {splashPhase === 'exit' && <div className="splash-flash-overlay" />}
    </div>
  );
  if (!currentUser) return <Login />;

  const Topbar = () => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const lineCount = (assets.lineNotifCount && assets.lineNotifCount.month === currentMonth) ? assets.lineNotifCount.count : 0;
    const limitWarning = lineCount >= 185;

    return (
      <nav className="glass-nav" style={{ borderRadius: '0 0 20px 20px', marginBottom: '16px' }}>
        <div style={{ fontSize: '1.15rem', lineHeight: '1.2', fontWeight: '700', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '1.3rem' }}>🥔</span>
          <span>管家</span>
          <span style={{ fontSize: '0.7rem', fontWeight: '500', color: 'var(--text-secondary)', marginLeft: '2px' }}>({operatorName})</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => { setTempLineCount(lineCount); setShowLineSettings(true); }}
            style={{
              fontSize: '0.72rem', fontFamily: 'var(--font-family)',
              background: limitWarning ? 'rgba(255,59,48,0.08)' : 'rgba(120,120,128,0.08)',
              color: limitWarning ? 'var(--accent-red)' : 'var(--text-secondary)',
              padding: '6px 12px', borderRadius: 'var(--radius-pill)',
              display: 'flex', alignItems: 'center', gap: '4px',
              fontWeight: limitWarning ? '700' : '500',
              border: limitWarning ? '1px solid rgba(255,59,48,0.25)' : '1px solid transparent',
              animation: limitWarning ? 'pulseRed 1.5s infinite' : 'none',
              cursor: 'pointer', transition: 'all 0.2s ease'
            }}
          >
            💬 {lineCount}/200
            {limitWarning && <span>⚠️</span>}
          </button>
          <button
            className="glass-btn glass-btn-danger"
            style={{ padding: '6px 14px', fontSize: '0.8rem' }}
            onClick={handleLogout}
          >登出</button>
        </div>
      </nav>
    );
  };

  const LineSettingsModal = () => {
    if (!showLineSettings) return null;
    const isBatch = assets.lineConfig?.batchMode || false;
    
    const handleToggleBatchMode = () => {
      if (isBatch) {
        // 從開啟狀態（收集模式）切換為關閉：立刻發出所有累積的通知並清空原本等候名單
        let willSend = false;
        
        if (assets.pendingLineNotifications && assets.pendingLineNotifications.length > 0) {
          const summaryList = assets.pendingLineNotifications.map((n, i) => `${i+1}. ${n.title}: ${n.note} (${n.amount})`).join('\\n').slice(0, 800);
          const batchPayload = {
            title: "手動批次變動彙整",
            amount: `共 ${assets.pendingLineNotifications.length} 筆`,
            category: "系統彙整",
            note: summaryList,
            date: new Date().toISOString().split('T')[0] + '（本日期為系統彙整日，以上逐筆個別日期請至App中查看。）',
            color: "#9b59b6",
            operator: "累積總結推播",
            isSummary: true
          };
          sendLineNotification(batchPayload);
          willSend = true;
          alert(`📤 已為您合併發出共 ${assets.pendingLineNotifications.length} 筆通知！`);
        } else {
           alert(`沒有累積等待中的通知。已關閉暫存模式。`);
        }
        
        const finalAssets = getUpdatedAssetsWithLineCount({
           ...assets,
           pendingLineNotifications: [],
           lineConfig: { ...assets.lineConfig, batchMode: false }
        }, willSend ? 1 : 0);
        
        saveToCloud(finalAssets);
      } else {
        // 從關閉切換為開啟：狀態變為暫停推播並累積新帳單
        saveToCloud({
           ...assets,
           lineConfig: { ...assets.lineConfig, batchMode: true }
        });
      }
    };
    
    return (
      <div className="modal-backdrop" onClick={() => setShowLineSettings(false)}>
         <div className="modal-content glass-card" style={{ padding:'28px', position:'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={()=>setShowLineSettings(false)} style={{position:'absolute', right:'16px', top:'12px', background:'none', border:'none', fontSize:'1.4rem', cursor:'pointer', color:'var(--text-tertiary)', fontWeight:'300'}}>&times;</button>
            <h3 style={{marginTop:0, marginBottom:'20px', fontWeight:'700', letterSpacing:'-0.01em'}}>💬 系統通知管理</h3>
            
            <div style={{marginBottom:'18px'}}>
              <label style={{display:'block', fontSize:'0.85rem', color:'var(--text-secondary)', marginBottom:'6px', fontWeight:'600'}}>手動校正當月計數</label>
              <input type="number" className="glass-input" value={tempLineCount} onChange={e=>setTempLineCount(e.target.value)} placeholder="強制覆寫系統已發送數量" style={{marginBottom:0}} />
            </div>

            <div style={{marginBottom:'22px', padding:'16px', background:'rgba(120,120,128,0.06)', borderRadius:'var(--radius-md)', border: isBatch ? '1px solid rgba(0,122,255,0.25)' : '1px solid transparent', transition:'all 0.3s ease'}}>
              <label style={{display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer'}}>
                <span style={{fontWeight:'600', fontSize:'0.92rem', color: isBatch ? 'var(--accent-blue)' : 'var(--text-primary)'}}>
                  {isBatch ? '📦 已暫停 Line 推播並開始收集' : '📦 暫停推播並開始收集新通知'}
                </span>
                <input type="checkbox" checked={isBatch} onChange={handleToggleBatchMode} style={{transform:'scale(1.3)', accentColor:'var(--accent-blue)'}} />
              </label>
              <p style={{fontSize:'0.73rem', color:'var(--text-tertiary)', marginTop:'10px', lineHeight:'1.6'}}>
                開啟此開關以暫停每筆獨立提醒，所有的操作將存入雲端等候名單。當你將此開關「關閉」時，會一次性合開發送所有等候中的變動。
              </p>
              {isBatch && (
                <div style={{fontSize:'0.82rem', color:'var(--accent-orange)', marginTop:'10px', fontWeight:'600', animation:'slideUpFade 0.3s ease-out'}}>
                   🛒 等待發送的通知數量：{assets.pendingLineNotifications?.length || 0} 筆
                </div>
              )}
            </div>

            <button className="glass-btn glass-btn-cta" style={{width:'100%', fontWeight:'700'}} onClick={() => {
               saveToCloud({ ...assets, lineNotifCount: { month: new Date().toISOString().slice(0, 7), count: Number(tempLineCount) || 0 } });
               setShowLineSettings(false);
            }}>確認儲存設定</button>
         </div>
      </div>
    );
  };

  /* navItems & BottomNav moved to module level for stable pill animation */

  return (
    <div style={{ paddingBottom: '110px' }}>
      <Topbar />
      <div key={currentPage} className="page-transition-enter" style={{ padding: '0 20px', maxWidth: '800px', margin: '0 auto' }}>

        {currentPage === 'overview' && <TotalOverview assets={assets} combinedHistory={combinedHistory} loadArchiveMonth={loadArchiveMonth} isFetchingArchive={isFetchingArchive} setAssets={handleAssetsUpdate} currentFxRate={currentFxRate} setCurrentFxRate={setCurrentFxRate} />}

        {currentPage === 'monthly' && (
          <MonthlyView
            assets={assets}
            combinedHistory={combinedHistory}
            loadArchiveMonth={loadArchiveMonth}
            setAssets={handleAssetsUpdate}
            onDelete={handleDeleteTransaction}
            onEdit={handleEditTransaction}
            sendLineNotification={sendLineNotification}
            currentUser={operatorName}
            getUpdatedAssetsWithLineCount={getUpdatedAssetsWithLineCount}
          />
        )}

        {currentPage === 'review' && <ReviewView assets={assets} combinedHistory={combinedHistory} loadArchiveMonth={loadArchiveMonth} />}
        {currentPage === 'invest' && <InvestmentView assets={assets} />}
        {currentPage === 'transfer' && <AssetTransfer assets={assets} setAssets={handleAssetsUpdate} onTransaction={handleTransaction} currentFxRate={currentFxRate} />}
        {currentPage === 'expense' && <ExpenseEntry assets={assets} setAssets={handleAssetsUpdate} onAddExpense={handleAddExpense} onAddJointExpense={handleAddJointExpense} onTransaction={handleTransaction} />}
      </div>
      <LineSettingsModal />
      <BottomNav currentPage={currentPage} onPageChange={setCurrentPage} assets={assets} />
    </div>
  );
}
export default App;