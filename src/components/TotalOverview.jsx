// src/components/TotalOverview.jsx
import React, { useMemo, useEffect, useRef, useState } from 'react';
import { 
  Chart as ChartJS, ArcElement, Tooltip, Legend, 
  CategoryScale, LinearScale, PointElement, LineElement, Title, Filler 
} from 'chart.js';
import { Doughnut, Line } from 'react-chartjs-2';
import { MY_GOOGLE_API_URL } from '../config';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Title, Filler);

const formatMoney = (num) => "$" + Math.round(Number(num)).toLocaleString();
const formatDate = (date) => date.toISOString().split('T')[0];

const TotalOverview = ({ assets, combinedHistory, loadArchiveMonth, isFetchingArchive, setAssets, currentFxRate, setCurrentFxRate }) => {
  // ★ Fix: 將日期移入元件內，避免模組級別變數在跨日後過期
  const today = useMemo(() => new Date(), []);
  const lastYear = useMemo(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d; }, []);
  const [chartDateRange, setChartDateRange] = useState({ start: formatDate(new Date(new Date().setFullYear(new Date().getFullYear() - 1))), end: formatDate(new Date()) });
  const [activeHistory, setActiveHistory] = useState(null); 
  const [historyDateRange, setHistoryDateRange] = useState({ start: '', end: '' });
  const [backupWarning, setBackupWarning] = useState(false);
  const [selectedChartDate, setSelectedChartDate] = useState(null);

  // ★ 當用戶點擊折線圖的某一天時，系統自動背景調取那一個月的歸檔紀錄
  useEffect(() => {
    if (selectedChartDate && loadArchiveMonth) {
      loadArchiveMonth(selectedChartDate.slice(0, 7));
    }
  }, [selectedChartDate, loadArchiveMonth]);

  // ★ 當開啟「帳戶變動軌跡明細」時，自動背景載入近三個月的資料，確保滾動平順不斷層
  useEffect(() => {
    if (activeHistory && loadArchiveMonth) {
      const now = new Date();
      for (let i = 0; i < 3; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        loadArchiveMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }
    }
  }, [activeHistory, loadArchiveMonth]);

  // ★ 當帳戶明細要求超大範圍時，自動遍歷該區間背景提領
  useEffect(() => {
    if (activeHistory && historyDateRange.start && historyDateRange.end && loadArchiveMonth) {
      let d = new Date(historyDateRange.start);
      const endD = new Date(historyDateRange.end);
      let count = 0;
      while (d <= endD && count < 60) {
        loadArchiveMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        d.setMonth(d.getMonth() + 1);
        count++;
      }
    }
  }, [activeHistory, historyDateRange, loadArchiveMonth]);

  // ★ 儲存包含股票漲跌的「真實總市值」
  const [liveMarketNetWorth, setLiveMarketNetWorth] = useState(0);
  // ★ 新增：背景抓取即時報價的 UI 狀態
  const [isFetchingLive, setIsFetchingLive] = useState(false);
  
  const isBackingUpRef = useRef(false);
  const todayStr = formatDate(today);

  // ----------------------------------------------------
  // 0. 自動無感備份引擎
  // ----------------------------------------------------
  useEffect(() => {
      if (!assets.monthlyExpenses || assets.monthlyExpenses.length === 0) return;
      if (assets.lastBackupDate === todayStr) return; 

      const timer = setTimeout(async () => {
          if (isBackingUpRef.current) return;
          isBackingUpRef.current = true;
          try {
              fetch(MY_GOOGLE_API_URL, {
                  method: 'POST', 
                  mode: 'no-cors', 
                  headers: { "Content-Type": "text/plain;charset=utf-8" },
                  body: JSON.stringify({ 
                    action: 'backup', 
                    date: todayStr, 
                    fileName: `自動備份_${todayStr}.json`, 
                    assets: assets 
                  })
              }).catch(e => console.log('Background backup error (usually cors/redirect thrown by browser):', e));
              
              setBackupWarning(false);
              // ★ Fix: 傳入完整物件而非函式（setAssets 實際上是 handleAssetsUpdate，期望收到物件）
              setAssets({ ...assets, lastBackupDate: todayStr });
          } finally {
              isBackingUpRef.current = false;
          }
      }, 3000); 
      
      return () => clearTimeout(timer);
  // ★ Fix: 移除 assets 依賴，避免 setAssets 後立即重新觸發備份
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayStr, setAssets]);

  // ----------------------------------------------------
  // 1. 雙幣別資產計算 (直覺相加邏輯)
  // ----------------------------------------------------
  const twdHeng = assets.userA || 0; 
  const usdHeng = assets.userA_usd || 0;
  
  const twdDe = assets.userB || 0;   
  const usdDe = assets.userB_usd || 0;
  
  const twdJoint = assets.jointCash || 0; 
  const usdJoint = assets.jointCash_usd || 0;

  const totalTwdCash = twdHeng + twdDe + twdJoint;
  const totalUsdCash = usdHeng + usdDe + usdJoint;
  
  const totalCashConverted = totalTwdCash + Math.round(totalUsdCash * currentFxRate);

  const sumInvestments = (invObj) => Object.values(invObj || {}).reduce((sum, val) => sum + val, 0);
  const investHeng = sumInvestments(assets.userInvestments?.userA);
  const investDe = sumInvestments(assets.userInvestments?.userB);
  const investJoint = sumInvestments(assets.jointInvestments);
  const totalInvest = investHeng + investDe + investJoint;

  // 總資產本金 (現金 + 投入本金)
  const totalAssets = totalCashConverted + totalInvest; 

  const assetTypes = [
    { key: 'cash', label: '台幣現金', color: '#2ecc71', val: totalTwdCash },
    { key: 'usd', label: '美金現鈔', color: '#f1c40f', val: Math.round(totalUsdCash * currentFxRate) },
    { key: 'stock', label: '股票', color: '#ff9f43', val: (assets.userInvestments?.userA?.stock || 0) + (assets.userInvestments?.userB?.stock || 0) + (assets.jointInvestments?.stock || 0) },
    { key: 'fund', label: '基金', color: '#54a0ff', val: (assets.userInvestments?.userA?.fund || 0) + (assets.userInvestments?.userB?.fund || 0) + (assets.jointInvestments?.fund || 0) },
    { key: 'deposit', label: '定存', color: '#9b59b6', val: (assets.userInvestments?.userA?.deposit || 0) + (assets.userInvestments?.userB?.deposit || 0) + (assets.jointInvestments?.deposit || 0) },
    { key: 'other', label: '其他', color: '#c8d6e5', val: (assets.userInvestments?.userA?.other || 0) + (assets.userInvestments?.userB?.other || 0) + (assets.jointInvestments?.other || 0) }
  ];
  
  const activeAssets = assetTypes.filter(a => a.val > 0);
  const doughnutData = { 
    labels: activeAssets.map(a => a.label), 
    datasets: [{ data: activeAssets.map(a => a.val), backgroundColor: activeAssets.map(a => a.color), borderWidth: 0, hoverOffset: 4 }] 
  };

  const stockHoldings = useMemo(() => {
      // ★ 先載入歸檔紀錄累積的持股基底
      const holdings = {};
      if (assets.currentStockHoldings) {
          Object.entries(assets.currentStockHoldings).forEach(([key, data]) => {
              let actualSym = key;
              if (key.includes('_')) {
                  actualSym = key.split('_').slice(1).join('_');
              }
              if (!holdings[actualSym]) {
                  holdings[actualSym] = { shares: 0, market: data.market || 'TW' };
              }
              holdings[actualSym].shares += (data.shares || 0);
          });
      }
      // 再疊加目前主文件中的交易紀錄
      (assets.monthlyExpenses || []).filter(r => !r.isDeleted).forEach(r => {
          if (!r.symbol) return; 
          const sym = r.symbol;
          if (!holdings[sym]) holdings[sym] = { shares: 0, market: r.market || 'TW' };
          if (r.type.includes('buy')) holdings[sym].shares += (Number(r.shares) || 0);
          else if (r.type.includes('sell')) holdings[sym].shares -= (Number(r.shares) || 0);
      });
      Object.keys(holdings).forEach(k => { if (holdings[k].shares <= 0.0001) delete holdings[k]; });
      return holdings;
  }, [assets.monthlyExpenses, assets.currentStockHoldings]);

  // ----------------------------------------------------
  // 2. 每日打卡快照引擎 (抓取真實市場現值)
  // ----------------------------------------------------
  const yesterday = new Date(); 
  yesterday.setDate(yesterday.getDate() - 1);
  const recordDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  
  const hasSnapshot = (assets.dailyNetWorth || {})[recordDate];
  const isFetchingSnapshotRef = useRef(false); 

  useEffect(() => {
    if (assets.dailyNetWorth && assets.dailyNetWorth[recordDate]) {
      setLiveMarketNetWorth(assets.dailyNetWorth[recordDate]);
    }
  }, [assets.dailyNetWorth, recordDate]);

  useEffect(() => {
      if (!assets.monthlyExpenses || assets.monthlyExpenses.length === 0) return;
      if (hasSnapshot || isFetchingSnapshotRef.current) return;

      const runDailySnapshot = async () => {
          isFetchingSnapshotRef.current = true;
          setIsFetchingLive(true); // ★ 顯示載入中 UI
          try {
              const symbols = Object.keys(stockHoldings);
              let stockMarketValue = 0; 
              let fxRate = 31.5;

              const allSymbols = symbols.length > 0 ? [...symbols, 'TWD=X'].join(',') : 'TWD=X';
              const res = await fetch(`${MY_GOOGLE_API_URL}?symbols=${allSymbols}`, { redirect: 'follow' });
              if (!res.ok) throw new Error('API 連線失敗');
              const data = await res.json();
              
              if (data?.quoteResponse?.result) {
                  const quotes = data.quoteResponse.result;
                  const fxQuote = quotes.find(q => q.symbol === 'TWD=X');
                  if (fxQuote) fxRate = fxQuote.regularMarketPreviousClose || fxQuote.regularMarketPrice || 31.5;
                  setCurrentFxRate(fxRate);

                  symbols.forEach(sym => {
                      const q = quotes.find(q => q.symbol === sym);
                      if (q) {
                          const price = q.regularMarketPreviousClose || q.regularMarketPrice || 0;
                          const holding = stockHoldings[sym];
                          let val = price * holding.shares;
                          if (holding.market === 'TW') {
                              const fee = Math.max(20, Math.floor(val * 0.001425 * 0.6));
                              const tax = Math.floor(val * 0.003);
                              stockMarketValue += (val - fee - tax);
                          } else {
                              const feeUsd = val * 0.001;
                              stockMarketValue += (val - feeUsd) * fxRate;
                          }
                      }
                  });
              }
              
              const usdCashTwd = Math.round(((assets.userA_usd || 0) + (assets.userB_usd || 0) + (assets.jointCash_usd || 0)) * fxRate);
              const nonStockInvest = totalInvest - ((assets.userInvestments?.userA?.stock || 0) + (assets.userInvestments?.userB?.stock || 0) + (assets.jointInvestments?.stock || 0));
              const finalNetWorth = Math.round(totalTwdCash + usdCashTwd + nonStockInvest + stockMarketValue);

              setLiveMarketNetWorth(finalNetWorth);
              // ★ Fix: 傳入完整物件而非函式，確保 dailyNetWorth 快照真正寫入 Firebase
              setAssets({ ...assets, dailyNetWorth: { ...(assets.dailyNetWorth || {}), [recordDate]: finalNetWorth } });
          } catch (e) { 
            console.error("快照失敗:", e); 
          } finally { 
            isFetchingSnapshotRef.current = false; 
            setIsFetchingLive(false); // ★ 隱藏載入中 UI
          }
      };
      runDailySnapshot();
  // ★ Fix: 移除 assets 依賴，避免 setAssets 後立即重新觸發快照造成無窮迴圈
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSnapshot, recordDate]);

    // ----------------------------------------------------
    // 3. 繪製折線圖資料
    // ----------------------------------------------------
  const historyData = useMemo(() => {
      const getAssetsTotal = (state) => {
          if (!state) return 0;
          const twd = (state.userA || 0) + (state.userB || 0) + (state.jointCash || 0);
          const usd = (state.userA_usd || 0) + (state.userB_usd || 0) + (state.jointCash_usd || 0);
          const invest = sumInvestments(state.jointInvestments) + sumInvestments(state.userInvestments?.userA) + sumInvestments(state.userInvestments?.userB);
          return twd + Math.round(usd * currentFxRate) + invest;
      };

      const chartDataPoints = {};
      const sortedRecords = [...(combinedHistory || [])]
          .filter(r => !r.isDeleted && r.auditTrail?.after && r.auditTrail?.before)
          // 嚴格依照日期與時間排序
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());

      // 取得所有需要繪製的日期
      let allDates = [...new Set([formatDate(today), ...sortedRecords.map(r => r.date), ...Object.keys(assets.dailyNetWorth || {})])].sort();

      // 以現在的實際總資產作為絕對起點，開始往前回推歷史資產線。完美避開修改日期造成的幽靈狀態錯置。
      let currentBal = liveMarketNetWorth > 0 ? liveMarketNetWorth : totalAssets;

      for (let i = allDates.length - 1; i >= 0; i--) {
          const d = allDates[i];
          
          if (assets.dailyNetWorth && assets.dailyNetWorth[d]) {
              currentBal = assets.dailyNetWorth[d];
          }
          
          chartDataPoints[d] = currentBal;

          const dayRecords = sortedRecords.filter(r => r.date === d);
          let dayNetChange = 0;
          dayRecords.forEach(r => {
              dayNetChange += (getAssetsTotal(r.auditTrail.after) - getAssetsTotal(r.auditTrail.before));
          });
          
          currentBal -= dayNetChange;
      }

      let labels = Object.keys(chartDataPoints).sort();
      
      if (chartDateRange.start) {
          let startValue = 0;
          for (let i = labels.length - 1; i >= 0; i--) { 
            if (labels[i] <= chartDateRange.start) { startValue = chartDataPoints[labels[i]]; break; } 
          }
          labels = labels.filter(d => d >= chartDateRange.start);
          if (labels.length === 0 || labels[0] > chartDateRange.start) { 
            labels.unshift(chartDateRange.start); chartDataPoints[chartDateRange.start] = startValue; 
          }
      }
      if (chartDateRange.end) {
          labels = labels.filter(d => d <= chartDateRange.end);
          if (labels.length === 0 || labels[labels.length - 1] < chartDateRange.end) {
              labels.push(chartDateRange.end);
              let endValue = totalAssets;
              for (let i = 0; i < Object.keys(chartDataPoints).sort().length; i++) {
                  if (Object.keys(chartDataPoints).sort()[i] <= chartDateRange.end) endValue = chartDataPoints[Object.keys(chartDataPoints).sort()[i]];
              }
              chartDataPoints[chartDateRange.end] = endValue;
          }
      }
      
      const data = labels.map(d => chartDataPoints[d]);
      return { labels, data };
  }, [assets.monthlyExpenses, assets.dailyNetWorth, combinedHistory, totalAssets, chartDateRange, currentFxRate, liveMarketNetWorth]);

  const lineChartData = {
      labels: historyData.labels,
      datasets: [{ 
        label: '總資產現值', 
        data: historyData.data, 
        borderColor: '#667eea', 
        backgroundColor: 'rgba(102, 126, 234, 0.15)', 
        fill: true, 
        tension: 0.3, 
        pointRadius: 4, 
        pointBackgroundColor: '#764ba2', 
        borderWidth: 2, 
        pointHoverRadius: 6 
      }]
  };

  const lineChartOptions = {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => formatMoney(ctx.raw) } } },
      scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 6, maxRotation: 0, font: { size: 10 }, color: 'rgba(235,235,245,0.6)' } },
          y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { callback: (value) => '$' + (value/10000).toFixed(0) + '萬', font: { size: 10 }, color: 'rgba(235,235,245,0.6)' } }
      },
      onClick: (evt, elements) => {
          if (elements.length > 0) setSelectedChartDate(historyData.labels[elements[0].index]);
          else setSelectedChartDate(null);
      }
  };

  const formatDateTime = (ts) => {
      if (!ts) return ''; const d = new Date(ts);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };

  const hasInvDiff = (b, a) => {
      const bInv = b || {}; const aInv = a || {};
      return (bInv.stock || 0) !== (aInv.stock || 0) || (bInv.fund || 0) !== (aInv.fund || 0) || (bInv.deposit || 0) !== (aInv.deposit || 0) || (bInv.other || 0) !== (aInv.other || 0);
  };

  // ----------------------------------------------------
  // 4. 精準科目的歷史軌跡
  // ----------------------------------------------------
  const getAccountHistory = () => {
      if (!activeHistory) return [];
      let filtered = (combinedHistory || []);
      
      filtered = filtered.filter(r => {
          if (!r.auditTrail || !r.auditTrail.before || !r.auditTrail.after) return false;
          const b = r.auditTrail.before; const a = r.auditTrail.after;
          if (activeHistory === 'userA') return b.userA !== a.userA || (b.userA_usd || 0) !== (a.userA_usd || 0) || hasInvDiff(b.userInvestments?.userA, a.userInvestments?.userA);
          if (activeHistory === 'userB') return b.userB !== a.userB || (b.userB_usd || 0) !== (a.userB_usd || 0) || hasInvDiff(b.userInvestments?.userB, a.userInvestments?.userB);
          if (activeHistory === 'jointCash') return b.jointCash !== a.jointCash || (b.jointCash_usd || 0) !== (a.jointCash_usd || 0) || hasInvDiff(b.jointInvestments, a.jointInvestments);
          return false;
      });

      if (historyDateRange.start) filtered = filtered.filter(r => (r.date || r.month) >= historyDateRange.start);
      if (historyDateRange.end) filtered = filtered.filter(r => (r.date || r.month) <= historyDateRange.end);
      
      let patchedFiltered = filtered.map(r => ({ ...r, auditTrail: r.auditTrail ? { before: { ...r.auditTrail.before }, after: { ...r.auditTrail.after } } : null }));
      patchedFiltered.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
      
      for (let i = 0; i < patchedFiltered.length; i++) {
          const r = patchedFiltered[i];
          const b = r.auditTrail?.before; const a = r.auditTrail?.after;
          if (b && a && b.userInvestments === undefined) {
              let olderInvestments = null; let olderJoint = null;
              for (let j = i + 1; j < patchedFiltered.length; j++) {
                  const older = patchedFiltered[j];
                  if (older.auditTrail?.after?.userInvestments !== undefined) {
                      olderInvestments = older.auditTrail.after.userInvestments; olderJoint = older.auditTrail.after.jointInvestments; break;
                  }
              }
              if (!olderInvestments) { olderInvestments = assets.userInvestments || { userA: {}, userB: {} }; olderJoint = assets.jointInvestments || {}; }
              b.userInvestments = olderInvestments; a.userInvestments = olderInvestments; b.jointInvestments = olderJoint; a.jointInvestments = olderJoint;
          }
      }
      return patchedFiltered;
  };

  const handleToggleHistory = (account) => {
      if (activeHistory === account) { setActiveHistory(null); } 
      else { setActiveHistory(account); setHistoryDateRange({ start: '', end: '' }); }
  };
  // ★ Fix: 將 getAccountHistory 包裹在 useMemo 中，避免每次 render 都重新計算 O(n²)
  const specificHistory = useMemo(() => getAccountHistory(), [activeHistory, combinedHistory, historyDateRange, assets]);

  // ----------------------------------------------------
  // 5. 繪製折線圖點擊後的「變動分析卡片」
  // ----------------------------------------------------
  const renderChartDetails = () => {
      if (!selectedChartDate) return null;
      const idx = historyData.labels.indexOf(selectedChartDate);
      if (idx === -1) return null;

      const currentVal = historyData.data[idx];
      const prevVal = idx > 0 ? historyData.data[idx - 1] : currentVal;
      const diff = currentVal - prevVal; 

      const dayRecords = (combinedHistory || []).filter(r => !r.isDeleted && r.date === selectedChartDate)
          .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
      
      let netTransactions = 0;
      dayRecords.forEach(r => {
          const isRealOutflow = ['spend', 'expense', 'fixed'].includes(r.type);
          const isRealInflow = ['income', 'personal_invest_profit'].includes(r.type);
          const isRealLoss = ['personal_invest_loss'].includes(r.type);
          
          if (isRealOutflow || isRealLoss) netTransactions -= Number(r.total);
          else if (isRealInflow) netTransactions += Number(r.total);
      });

      const marketFluctuation = diff - netTransactions;

      // ★ 判斷是否有可靠的快照數據來計算市場波動
      const hasCurrentSnapshot = !!(assets.dailyNetWorth && assets.dailyNetWorth[selectedChartDate]);
      const prevDate = idx > 0 ? historyData.labels[idx - 1] : null;
      const hasPrevSnapshot = !!(prevDate && assets.dailyNetWorth && assets.dailyNetWorth[prevDate]);
      const hasSnapshotData = hasCurrentSnapshot || hasPrevSnapshot;

      return (
          <div style={{ marginTop: '15px', padding: '16px', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--accent-purple)', background: 'rgba(255,255,255,0.06)', animation: 'slideDown 0.3s ease-out' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1rem', fontWeight:'700' }}>
                      📅 {selectedChartDate} 資產變動分析 {isFetchingArchive && <span style={{fontSize: '0.7rem', color: 'var(--accent-blue)', animation: 'pulse 1.5s infinite'}}>(載入歷史中...)</span>}
                  </h4>
                  <button onClick={() => setSelectedChartDate(null)} style={{ background:'transparent', border:'none', cursor:'pointer', fontSize:'1.2rem', color:'var(--text-secondary)' }}>✖</button>
              </div>
              
              <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom: '15px' }}>
                 <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>總資產變動: </div>
                 <div style={{ padding:'3px 10px', borderRadius:'var(--radius-pill)', fontSize: '0.84rem', fontWeight: '700', background: diff >= 0 ? 'rgba(52,199,89,0.12)' : 'rgba(255,59,48,0.10)', color: diff >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                     較前一日 {diff >= 0 ? '+' : ''}{formatMoney(diff)}
                 </div>
              </div>

              <div style={{ marginBottom: '12px', background:'rgba(255,255,255,0.06)', padding:'12px', borderRadius:'var(--radius-sm)' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', borderBottom: '0.5px solid rgba(255,255,255,0.08)', paddingBottom: '4px', marginBottom: '6px' }}>
                      📝 當日人為操作 (實質淨額影響: <span style={{color: netTransactions>=0?'var(--accent-green)':'var(--accent-red)', fontWeight:'700'}}>{netTransactions >= 0 ? '+' : ''}{formatMoney(netTransactions)}</span>)
                  </div>
                  {dayRecords.length === 0 ? (
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', textAlign: 'center', padding: '10px 0' }}>{isFetchingArchive ? '努力從冷倉庫撈取資料中...' : '當日無任何紀錄'}</div>
                  ) : dayRecords.map((r, i) => {
                          const isExternalOut = ['spend', 'expense', 'fixed', 'personal_invest_loss'].includes(r.type);
                          const isExternalIn = ['income', 'personal_invest_profit'].includes(r.type);
                          
                          let sign = ''; let color = 'var(--text-secondary)'; let isNeutral = true;
                          if (isExternalOut) { sign = '-'; color = '#ff6b6b'; isNeutral = false; }
                          else if (isExternalIn) { sign = '+'; color = 'var(--accent-green)'; isNeutral = false; }
                          else if (r.type === 'calibrate') { sign = '⚖️ '; color = 'var(--text-tertiary)'; }
                          else if (r.type.includes('sell')) { sign = '+'; color = 'var(--accent-teal)'; } 
                          else if (r.type.includes('buy')) { sign = '-'; color = 'var(--accent-teal)'; } 
                          else { sign = '🔄 '; color = 'var(--accent-purple)'; } 
                          
                          return (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px', alignItems: 'center' }}>
                                  <span style={{color: isNeutral ? 'var(--text-secondary)' : 'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'70%'}}>
                                      {r.note || r.category} {isNeutral && <span style={{fontSize:'0.68rem', color:'var(--text-tertiary)', marginLeft:'5px'}}>(轉換/校正)</span>}
                                  </span>
                                  <span style={{ color: color, fontWeight: isNeutral ? 'normal' : 'bold' }}>{sign}{formatMoney(r.total)}</span>
                              </div>
                          );
                      })}
                  </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems:'center', fontSize: '0.88rem', color: 'var(--text-secondary)', borderTop: '0.5px solid rgba(255,255,255,0.08)', paddingTop: '10px' }}>
                  <span>📈 市場與匯率波動估算</span>
                  {hasSnapshotData ? (
                      <span style={{ fontWeight: '700', fontSize: '1.05rem', color: marketFluctuation >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                          {marketFluctuation >= 0 ? '+' : ''}{formatMoney(marketFluctuation)}
                      </span>
                  ) : (
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                          ⚠️ 無快照 · 僅帳面變動
                      </span>
                  )}
              </div>
          </div>
      );
  };

  return (
    <div className="page-transition-enter">
      {backupWarning && (
          <div style={{ background: 'var(--accent-red)', color: 'white', padding: '10px 15px', borderRadius: 'var(--radius-sm)', marginBottom: '15px', fontSize: '0.88rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>⚠️ 警告：無法連線至 Google 雲端備份伺服器。請手動備份。</span>
              <button onClick={() => setBackupWarning(false)} style={{ background:'transparent', border:'none', color:'white', fontSize:'1.2rem', cursor:'pointer' }}>×</button>
          </div>
      )}

      <h1 className="page-title" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        總資產概況
      </h1>

      {/* 【第一層】雙人總資產大看板 */}
      <div className="glass-card card-animate" style={{ marginBottom: '18px', textAlign: 'center', background: 'linear-gradient(135deg, rgba(88,86,214,0.9), rgba(94,158,247,0.85))', color: 'white', padding: '28px 18px', border:'none', boxShadow:'0 12px 40px rgba(88,86,214,0.25)' }}>
        <div style={{ fontSize: '0.88rem', opacity: 0.9, marginBottom: '5px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '5px' }}>
          雙人總資產 (即時市值估算)
          {isFetchingLive && <span style={{fontSize:'0.73rem', background: 'rgba(255,255,255,0.2)', padding:'2px 8px', borderRadius:'var(--radius-pill)'}}>🔄 更新報價中...</span>}
        </div>
        <div style={{ fontSize: '2.4rem', fontWeight: '800', letterSpacing:'-0.02em', textShadow: '0 2px 12px rgba(0,0,0,0.15)' }}>
          {formatMoney(liveMarketNetWorth > 0 ? liveMarketNetWorth : totalAssets)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '15px', fontSize: '0.82rem' }}>
           <div style={{background:'rgba(255,255,255,0.18)', padding:'5px 14px', borderRadius:'var(--radius-pill)', backdropFilter:'blur(4px)'}}>💰 總現金 {formatMoney(totalCashConverted)}</div>
           <div style={{background:'rgba(255,255,255,0.18)', padding:'5px 14px', borderRadius:'var(--radius-pill)', backdropFilter:'blur(4px)'}}>📥 總投入 {formatMoney(totalInvest)}</div>
        </div>
        
        {liveMarketNetWorth > 0 && liveMarketNetWorth !== totalAssets && (
            <div style={{ marginTop: '15px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.2)', fontSize: '0.84rem' }}>
                📊 包含股票未實現損益：<span style={{fontWeight: '800', color: liveMarketNetWorth >= totalAssets ? '#ffd60a' : '#ff9a9e', fontSize: '1rem'}}>{liveMarketNetWorth >= totalAssets ? '+' : ''}{formatMoney(liveMarketNetWorth - totalAssets)}</span>
            </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: activeHistory ? '10px' : '18px', flexWrap: 'wrap' }}>
        <div className="glass-card card-animate" style={{ flex: 1, minWidth: '105px', padding: '12px', borderTop: '3px solid var(--accent-pink)', background: activeHistory === 'userA' ? 'rgba(255,59,48,0.04)' : undefined }}>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight:'600' }}>🐶 恆恆 <span style={{fontSize:'0.63rem', fontWeight:'400'}}>(依投入本金)</span></div>
          <div style={{ fontSize: '1.15rem', fontWeight: '700', color: 'var(--text-primary)', margin: '5px 0' }}>{formatMoney(twdHeng + Math.round(usdHeng * currentFxRate) + investHeng)}</div>
          <div style={{ fontSize: '0.73rem', color: 'var(--text-tertiary)', marginBottom:'10px', lineHeight:'1.4' }}>現 {formatMoney(twdHeng)}<br/>美 ${usdHeng.toFixed(2)}<br/>投 {formatMoney(investHeng)}</div>
          <button onClick={() => setActiveHistory(activeHistory === 'userA' ? null : 'userA')} className={activeHistory === 'userA' ? 'glass-btn glass-btn-cta' : 'glass-btn'} style={{ width:'100%', padding:'6px', fontSize:'0.78rem' }}>{activeHistory === 'userA' ? '收起' : '🔍 紀錄'}</button>
        </div>
        
        <div className="glass-card card-animate" style={{ flex: 1, minWidth: '105px', padding: '12px', borderTop: '3px solid var(--accent-green)', background: activeHistory === 'userB' ? 'rgba(52,199,89,0.04)' : undefined }}>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight:'600' }}>🐕 得得 <span style={{fontSize:'0.63rem', fontWeight:'400'}}>(依投入本金)</span></div>
          <div style={{ fontSize: '1.15rem', fontWeight: '700', color: 'var(--text-primary)', margin: '5px 0' }}>{formatMoney(twdDe + Math.round(usdDe * currentFxRate) + investDe)}</div>
          <div style={{ fontSize: '0.73rem', color: 'var(--text-tertiary)', marginBottom:'10px', lineHeight:'1.4' }}>現 {formatMoney(twdDe)}<br/>美 ${usdDe.toFixed(2)}<br/>投 {formatMoney(investDe)}</div>
          <button onClick={() => setActiveHistory(activeHistory === 'userB' ? null : 'userB')} className={activeHistory === 'userB' ? 'glass-btn glass-btn-cta' : 'glass-btn'} style={{ width:'100%', padding:'6px', fontSize:'0.78rem' }}>{activeHistory === 'userB' ? '收起' : '🔍 紀錄'}</button>
        </div>
        
        <div className="glass-card card-animate" style={{ flex: 1, minWidth: '105px', padding: '12px', borderTop: '3px solid var(--accent-orange)', background: activeHistory === 'jointCash' ? 'rgba(255,149,0,0.04)' : undefined }}>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight:'600' }}>🏫 共同 <span style={{fontSize:'0.63rem', fontWeight:'400'}}>(依投入本金)</span></div>
          <div style={{ fontSize: '1.15rem', fontWeight: '700', color: 'var(--text-primary)', margin: '5px 0' }}>{formatMoney(twdJoint + Math.round(usdJoint * currentFxRate) + investJoint)}</div>
          <div style={{ fontSize: '0.73rem', color: 'var(--text-tertiary)', marginBottom:'10px', lineHeight:'1.4' }}>現 {formatMoney(twdJoint)}<br/>美 ${usdJoint.toFixed(2)}<br/>投 {formatMoney(investJoint)}</div>
          <button onClick={() => setActiveHistory(activeHistory === 'jointCash' ? null : 'jointCash')} className={activeHistory === 'jointCash' ? 'glass-btn glass-btn-cta' : 'glass-btn'} style={{ width:'100%', padding:'6px', fontSize:'0.78rem' }}>{activeHistory === 'jointCash' ? '收起' : '🔍 紀錄'}</button>
        </div>
      </div>

      {activeHistory && (
        <div className="glass-card card-animate" style={{ marginBottom: '18px', borderLeft: `4px solid ${activeHistory === 'userA' ? 'var(--accent-pink)' : activeHistory === 'userB' ? 'var(--accent-green)' : 'var(--accent-orange)'}` }}>
          <div style={{ fontWeight: '700', color: 'var(--text-primary)', marginBottom: '10px', fontSize: '1rem' }}>
              📝 {activeHistory === 'userA' ? '恆恆' : activeHistory === 'userB' ? '得得' : '共同'} 變動明細
          </div>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '15px' }}>
              <input type="date" value={historyDateRange.start} onChange={(e) => setHistoryDateRange(prev => ({...prev, start: e.target.value}))} className="glass-input" style={{margin:0, padding:'6px 10px', flex:1, minWidth:'110px', fontSize:'0.84rem'}} />
              <span style={{color:'var(--text-tertiary)', fontSize:'0.84rem'}}>至</span>
              <input type="date" value={historyDateRange.end} onChange={(e) => setHistoryDateRange(prev => ({...prev, end: e.target.value}))} className="glass-input" style={{margin:0, padding:'6px 10px', flex:1, minWidth:'110px', fontSize:'0.84rem'}} />
              <button onClick={() => setHistoryDateRange({ start: '', end: '' })} className="glass-btn" style={{padding:'6px 12px', fontSize:'0.82rem'}}>清除</button>
          </div>

          <div style={{ maxHeight: '450px', overflowY: 'auto', paddingRight: '5px' }}>
            {specificHistory.length > 0 ? (
                specificHistory.map((record, idx) => {
                    const b = record.auditTrail?.before; const a = record.auditTrail?.after;
                    let bCash = 0, aCash = 0, bInv = 0, aInv = 0, bUsd = 0, aUsd = 0;
                    let cashDiff = 0, invDiff = 0, usdDiff = 0; let label = "";
                    
                    if (b && a) {
                        if (activeHistory === 'userA') {
                            label = "恆恆"; bCash = b.userA || 0; aCash = a.userA || 0; bUsd = b.userA_usd || 0; aUsd = a.userA_usd || 0;
                            bInv = sumInvestments(b.userInvestments?.userA); aInv = sumInvestments(a.userInvestments?.userA);
                        } else if (activeHistory === 'userB') {
                            label = "得得"; bCash = b.userB || 0; aCash = a.userB || 0; bUsd = b.userB_usd || 0; aUsd = a.userB_usd || 0;
                            bInv = sumInvestments(b.userInvestments?.userB); aInv = sumInvestments(a.userInvestments?.userB);
                        } else if (activeHistory === 'jointCash') {
                            label = "共同"; bCash = b.jointCash || 0; aCash = a.jointCash || 0; bUsd = b.jointCash_usd || 0; aUsd = a.jointCash_usd || 0;
                            bInv = sumInvestments(b.jointInvestments); aInv = sumInvestments(a.jointInvestments);
                        }
                        cashDiff = aCash - bCash; invDiff = aInv - bInv; usdDiff = aUsd - bUsd;
                        if (invDiff === 0 && (record.type.includes('invest_buy') || record.type.includes('invest_sell'))) {
                            if (record.type.includes('buy')) invDiff = Number(record.total);
                            if (record.type.includes('sell')) invDiff = -Number(record.principal);
                            bInv = aInv - invDiff; 
                        }
                    }

                    return (
                        <div key={idx} style={{ padding: '16px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '8px', opacity: record.isDeleted ? 0.6 : 1 }}>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display:'flex', justifyContent:'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.06)', padding: '4px 8px', borderRadius: 'var(--radius-xs)' }}>
                                <span style={{fontWeight: '600', color: 'var(--text-primary)'}}>📅 帳單日: {record.date} {record.isDeleted && <span style={{color: 'var(--accent-red)', marginLeft: '5px'}}>(🚫已作廢)</span>}</span>
                                <span>⏱ 登錄: {formatDateTime(record.timestamp)} | 👤 {record.operator || '系統'}</span>
                            </div>
                            
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '2px' }}>
                                {cashDiff !== 0 && ( <div style={{ color: cashDiff > 0 ? 'var(--accent-green)' : '#ff6b6b', fontWeight: 'bold', fontSize: '1rem' }}>[{label}現鈔] {cashDiff > 0 ? '增加' : '扣除'} {cashDiff > 0 ? '+' : ''}{formatMoney(cashDiff)}</div> )}
                                {usdDiff !== 0 && ( <div style={{ color: usdDiff > 0 ? 'var(--accent-green)' : '#ff6b6b', fontWeight: 'bold', fontSize: '1rem' }}>[{label}美金] {usdDiff > 0 ? '增加' : '扣除'} {usdDiff > 0 ? '+' : ''}${usdDiff.toFixed(2)}</div> )}
                                {invDiff !== 0 && ( <div style={{ color: invDiff > 0 ? 'var(--accent-green)' : '#ff6b6b', fontWeight: 'bold', fontSize: '1rem' }}>[{label}投資] {invDiff > 0 ? '增加' : '扣除'} {invDiff > 0 ? '+' : ''}{formatMoney(invDiff)}</div> )}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ color: 'var(--text-primary)', fontSize: '0.92rem', wordBreak: 'break-word', paddingRight: '10px', fontWeight: '700', textDecoration: record.isDeleted ? 'line-through' : 'none' }}>📝 {record.note}</div>
                                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', textDecoration: record.isDeleted ? 'line-through' : 'none' }}>總額: {formatMoney(record.total)}</div>
                            </div>
                            
                            {b && a && (
                                <div style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.06)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', marginTop: '4px' }}>
                                    <div style={{ marginBottom: '4px', display:'flex', justifyContent:'space-between' }}>
                                        <span style={{color:'var(--text-tertiary)'}}>變動前：</span><span style={{color:'var(--text-tertiary)'}}>現 {formatMoney(bCash)} | 美 ${bUsd.toFixed(2)} ｜ 投 {formatMoney(bInv)}</span>
                                    </div>
                                    <div style={{ display:'flex', justifyContent:'space-between', fontWeight:'600', color:'var(--text-primary)' }}>
                                        <span>變動後：</span><span>現 {formatMoney(aCash)} | 美 ${aUsd.toFixed(2)} ｜ 投 {formatMoney(aInv)}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })
            ) : ( <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '20px' }}>此區間尚無變動紀錄</div> )}
          </div>
        </div>
      )}

      {/* 【第三層】資產分佈圓餅圖 */}
      <div className="glass-card card-animate" style={{ marginBottom: '18px', display: 'flex', flexWrap: 'nowrap', alignItems: 'center', gap: '15px' }}>
        <div style={{ flexShrink: 0, width: '120px', height: '120px', display: 'flex', justifyContent: 'center' }}>
          {activeAssets.length > 0 ? ( <Doughnut data={doughnutData} options={{ maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } }} /> ) : ( <div style={{display:'flex', alignItems:'center', color:'var(--text-tertiary)'}}>尚無資產</div> )}
        </div>
        <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {activeAssets.map((asset) => (
            <div key={asset.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: asset.color, flexShrink: 0 }}></div>
                <span style={{ fontWeight: '600', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>{asset.label}</span>
              </div>
              <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.92rem' }}>{formatMoney(asset.val)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 【第四層】互動式資產成長趨勢折線圖 */}
      <div className="glass-card card-animate" style={{ marginBottom: '18px', padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.95rem' }}>📈 資產成長趨勢</div>
        </div>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '15px' }}>
            <input type="date" value={chartDateRange.start} onChange={(e) => setChartDateRange(prev => ({...prev, start: e.target.value}))} className="glass-input" style={{margin:0, padding:'6px 10px', flex:1, minWidth:'110px', fontSize:'0.84rem'}} />
            <span style={{color:'var(--text-tertiary)', fontSize:'0.84rem'}}>至</span>
            <input type="date" value={chartDateRange.end} onChange={(e) => setChartDateRange(prev => ({...prev, end: e.target.value}))} className="glass-input" style={{margin:0, padding:'6px 10px', flex:1, minWidth:'110px', fontSize:'0.84rem'}} />
        </div>
        <div style={{display:'flex', gap:'8px', marginBottom:'15px'}}>
            <button onClick={() => setChartDateRange({ start: formatDate(lastYear), end: formatDate(today) })} className="glass-btn" style={{flex:1, padding:'6px', fontSize:'0.82rem'}}>近一年</button>
            <button onClick={() => setChartDateRange({ start: '', end: '' })} className="glass-btn" style={{flex:1, padding:'6px', fontSize:'0.82rem'}}>全部時間</button>
        </div>

        <div style={{ height: '220px', width: '100%', cursor: 'pointer' }}>
            <Line data={lineChartData} options={lineChartOptions} />
        </div>

        {renderChartDetails()}
      </div>

    </div>
  );
};

export default TotalOverview;