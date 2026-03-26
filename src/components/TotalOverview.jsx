// src/components/TotalOverview.jsx
import React, { useMemo, useEffect, useRef, useState } from 'react';
import { 
  Chart as ChartJS, ArcElement, Tooltip, Legend, 
  CategoryScale, LinearScale, PointElement, LineElement, Title, Filler 
} from 'chart.js';
import { Doughnut, Line } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Title, Filler);

const formatMoney = (num) => "$" + Math.round(Number(num)).toLocaleString();
const formatDate = (date) => date.toISOString().split('T')[0];

const today = new Date();
const lastYear = new Date(); lastYear.setFullYear(today.getFullYear() - 1);

// 🚀 你的專屬 Google API
const MY_GOOGLE_API_URL = "https://script.google.com/macros/s/AKfycbwK8pr2bfUqC6GnLYwYerjiS_wtt5sk_ZJD4A-xKR2ACA2v64aYXNeRyu1qp1uVRWTdzg/exec";

const TotalOverview = ({ assets, setAssets }) => {
  const [chartDateRange, setChartDateRange] = useState({ start: formatDate(lastYear), end: formatDate(today) });
  const [activeHistory, setActiveHistory] = useState(null); 
  const [historyDateRange, setHistoryDateRange] = useState({ start: '', end: '' });
  const [backupWarning, setBackupWarning] = useState(false);
  const [selectedChartDate, setSelectedChartDate] = useState(null);

  // 💱 即時美金匯率狀態
  const [currentFxRate, setCurrentFxRate] = useState(31.5);
  // ★ 儲存包含股票漲跌的「真實總市值」
  const [liveMarketNetWorth, setLiveMarketNetWorth] = useState(0);
  
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
              await fetch(MY_GOOGLE_API_URL, {
                  method: 'POST', 
                  mode: 'no-cors', 
                  headers: { "Content-Type": "text/plain;charset=utf-8" },
                  body: JSON.stringify({ 
                    action: 'backup', 
                    date: todayStr, 
                    fileName: `自動備份_${todayStr}.json`, 
                    assets: assets 
                  })
              });
              setBackupWarning(false);
              setAssets(prev => ({ ...prev, lastBackupDate: todayStr }));
          } catch (e) {
              setBackupWarning(true); 
          } finally {
              isBackingUpRef.current = false;
          }
      }, 3000); 
      
      return () => clearTimeout(timer);
  }, [assets, todayStr, setAssets]);

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

  // ★ 核心變更：總資產 = 絕對等於下面三個卡片的「現金 + 本金」相加！
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
      const holdings = {};
      (assets.monthlyExpenses || []).filter(r => !r.isDeleted).forEach(r => {
          if (!r.symbol) return; 
          const sym = r.symbol;
          if (!holdings[sym]) holdings[sym] = { shares: 0, market: r.market || 'TW' };
          if (r.type.includes('buy')) holdings[sym].shares += (Number(r.shares) || 0);
          else if (r.type.includes('sell')) holdings[sym].shares -= (Number(r.shares) || 0);
      });
      Object.keys(holdings).forEach(k => { if (holdings[k].shares <= 0) delete holdings[k]; });
      return holdings;
  }, [assets.monthlyExpenses]);

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
              setAssets(prev => ({ ...prev, dailyNetWorth: { ...(prev.dailyNetWorth || {}), [recordDate]: finalNetWorth } }));
          } catch (e) { 
            console.error("快照失敗:", e); 
          } finally { 
            isFetchingSnapshotRef.current = false; 
          }
      };
      runDailySnapshot();
  }, [hasSnapshot, stockHoldings, totalTwdCash, totalInvest, assets, setAssets, recordDate]);

  // ★ 升級版的重新結算：一鍵清除所有幽靈快照！
  const handleRecalculate = () => {
    if (window.confirm("⚠️ 確定要「清除並重置」所有的歷史快照嗎？\n\n這會消除過去記帳錯誤產生的幽靈金額(如52萬)，讓折線圖恢復平順，並以今天的正確餘額重新開始記錄！")) {
        const newAssets = { ...assets };
        newAssets.dailyNetWorth = {}; // 直接核彈級清空
        setAssets(newAssets);
    }
  };

  // ----------------------------------------------------
  // 3. 繪製折線圖資料
  // ----------------------------------------------------
  const historyData = useMemo(() => {
      const chartDataPoints = {};
      const sortedRecords = [...(assets.monthlyExpenses || [])]
          .filter(r => !r.isDeleted && r.auditTrail?.after)
          .sort((a, b) => new Date(a.timestamp || a.date) - new Date(b.timestamp || b.date));

      sortedRecords.forEach(record => {
          const state = record.auditTrail.after;
          const pastTwd = (state.userA || 0) + (state.userB || 0) + (state.jointCash || 0);
          const pastUsd = (state.userA_usd || 0) + (state.userB_usd || 0) + (state.jointCash_usd || 0);
          const pastInvest = sumInvestments(state.jointInvestments) + sumInvestments(state.userInvestments?.userA) + sumInvestments(state.userInvestments?.userB);
          
          chartDataPoints[record.date] = pastTwd + Math.round(pastUsd * currentFxRate) + pastInvest;
      });

      if (assets.dailyNetWorth) {
        Object.keys(assets.dailyNetWorth).forEach(date => { 
          chartDataPoints[date] = assets.dailyNetWorth[date]; 
        });
      }
      
      if (Object.keys(chartDataPoints).length === 0) chartDataPoints[formatDate(today)] = totalAssets;

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
  }, [assets.monthlyExpenses, assets.dailyNetWorth, totalAssets, chartDateRange, currentFxRate]);

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
          x: { grid: { display: false }, ticks: { maxTicksLimit: 6, maxRotation: 0, font: { size: 10 } } },
          y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { callback: (value) => '$' + (value/10000).toFixed(0) + '萬', font: { size: 10 } } }
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
      let filtered = (assets.monthlyExpenses || []).filter(r => !r.isDeleted);
      
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
  const specificHistory = getAccountHistory();

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

      const dayRecords = (assets.monthlyExpenses || []).filter(r => !r.isDeleted && r.date === selectedChartDate)
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

      return (
          <div style={{ marginTop: '15px', padding: '15px', borderRadius: '12px', borderLeft: '5px solid #9b59b6', background: 'linear-gradient(to right, rgba(155, 89, 182, 0.1), rgba(255,255,255,0.5))', animation: 'fadeIn 0.3s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ margin: 0, color: '#555', fontSize: '1.05rem' }}>📅 {selectedChartDate} 資產變動分析</h4>
                  <button onClick={() => setSelectedChartDate(null)} style={{ background:'transparent', border:'none', cursor:'pointer', fontSize:'1.2rem' }}>✖</button>
              </div>
              
              <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom: '15px' }}>
                 <div style={{ fontSize: '0.9rem', color: '#666' }}>總本金變動: </div>
                 <div style={{ padding:'2px 8px', borderRadius:'10px', fontSize: '0.85rem', fontWeight: 'bold', background: diff >= 0 ? 'rgba(46, 204, 113, 0.2)' : 'rgba(231, 76, 60, 0.2)', color: diff >= 0 ? '#27ae60' : '#c0392b' }}>
                     較昨日 {diff >= 0 ? '+' : ''}{formatMoney(diff)}
                 </div>
              </div>

              {dayRecords.length > 0 && (
                  <div style={{ marginBottom: '12px', background:'rgba(255,255,255,0.7)', padding:'10px', borderRadius:'8px' }}>
                      <div style={{ fontSize: '0.8rem', color: '#888', borderBottom: '1px solid #ddd', paddingBottom: '4px', marginBottom: '6px' }}>
                          📝 當日人為操作 (實質淨額影響: <span style={{color: netTransactions>=0?'#27ae60':'#c0392b', fontWeight:'bold'}}>{netTransactions >= 0 ? '+' : ''}{formatMoney(netTransactions)}</span>)
                      </div>
                      {dayRecords.map((r, i) => {
                          const isExternalOut = ['spend', 'expense', 'fixed', 'personal_invest_loss'].includes(r.type);
                          const isExternalIn = ['income', 'personal_invest_profit'].includes(r.type);
                          
                          let sign = ''; let color = '#888'; let isNeutral = true;
                          if (isExternalOut) { sign = '-'; color = '#e74c3c'; isNeutral = false; }
                          else if (isExternalIn) { sign = '+'; color = '#2ecc71'; isNeutral = false; }
                          else if (r.type === 'calibrate') { sign = '⚖️ '; color = '#95a5a6'; }
                          else if (r.type.includes('sell')) { sign = '+'; color = '#3498db'; } 
                          else if (r.type.includes('buy')) { sign = '-'; color = '#3498db'; } 
                          else { sign = '🔄 '; color = '#9b59b6'; } 
                          
                          return (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px', alignItems: 'center' }}>
                                  <span style={{color: isNeutral ? '#888' : '#444', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'70%'}}>
                                      {r.note || r.category} {isNeutral && <span style={{fontSize:'0.7rem', color:'#aaa', marginLeft:'5px'}}>(轉換/校正)</span>}
                                  </span>
                                  <span style={{ color: color, fontWeight: isNeutral ? 'normal' : 'bold' }}>{sign}{formatMoney(r.total)}</span>
                              </div>
                          );
                      })}
                  </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems:'center', fontSize: '0.9rem', color: '#555', borderTop: '1px dashed #ccc', paddingTop: '10px' }}>
                  <span>📈 市場與匯率波動估算</span>
                  <span style={{ fontWeight: 'bold', fontSize: '1.1rem', color: marketFluctuation >= 0 ? '#2ecc71' : '#e74c3c' }}>
                      {marketFluctuation >= 0 ? '+' : ''}{formatMoney(marketFluctuation)}
                  </span>
              </div>
          </div>
      );
  };

  return (
    <div style={{animation: 'fadeIn 0.5s'}}>
      {backupWarning && (
          <div style={{ background: '#e74c3c', color: 'white', padding: '10px 15px', borderRadius: '8px', marginBottom: '15px', fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>⚠️ 警告：無法連線至 Google 雲端備份伺服器。請手動備份。</span>
              <button onClick={() => setBackupWarning(false)} style={{ background:'transparent', border:'none', color:'white', fontSize:'1.2rem', cursor:'pointer' }}>×</button>
          </div>
      )}

      <h1 className="page-title" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        總資產概況
        <button onClick={handleRecalculate} style={{background: 'rgba(0,0,0,0.05)', border: 'none', borderRadius: '8px', padding: '6px 10px', fontSize: '0.8rem', color: '#666', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'}}><span>🔄</span>重新結算</button>
      </h1>

      {/* 【第一層】雙人總資產大看板 */}
      <div className="glass-card" style={{ marginBottom: '20px', textAlign: 'center', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', padding: '25px 15px' }}>
        <div style={{ fontSize: '0.9rem', opacity: 0.9, marginBottom: '5px' }}>雙人帳面總資產 (三科目相加)</div>
        <div style={{ fontSize: '2.5rem', fontWeight: 'bold', textShadow: '0 2px 10px rgba(0,0,0,0.2)' }}>
          {formatMoney(totalAssets)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginTop: '15px', fontSize: '0.85rem' }}>
           <div style={{background:'rgba(255,255,255,0.2)', padding:'4px 12px', borderRadius:'15px'}}>💰 總現金 {formatMoney(totalCashConverted)}</div>
           <div style={{background:'rgba(255,255,255,0.2)', padding:'4px 12px', borderRadius:'15px'}}>📈 總本金 {formatMoney(totalInvest)}</div>
        </div>
        
        {/* 🌟 核心變更：市值估算獨立拉出來，完美解決兩難！ */}
        {liveMarketNetWorth > 0 && liveMarketNetWorth !== totalAssets && (
            <div style={{ marginTop: '15px', paddingTop: '12px', borderTop: '1px dashed rgba(255,255,255,0.3)', fontSize: '0.85rem' }}>
                📊 包含股票漲跌的實際總市值估算：<span style={{fontWeight: 'bold', color: '#f1c40f', fontSize: '1rem'}}>{formatMoney(liveMarketNetWorth)}</span>
            </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: activeHistory ? '10px' : '20px', flexWrap: 'wrap' }}>
        <div className="glass-card" style={{ flex: 1, minWidth: '110px', padding: '12px', borderTop: '4px solid #ff9a9e', background: activeHistory === 'userA' ? 'rgba(255,154,158,0.1)' : '#fff' }}>
          <div style={{ fontSize: '0.85rem', color: '#666', fontWeight:'bold' }}>🐶 恆恆</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#333', margin: '5px 0' }}>{formatMoney(twdHeng + Math.round(usdHeng * currentFxRate) + investHeng)}</div>
          <div style={{ fontSize: '0.75rem', color: '#888', marginBottom:'10px' }}>現 {formatMoney(twdHeng)}<br/>美 ${usdHeng.toFixed(2)}<br/>投 {formatMoney(investHeng)}</div>
          <button onClick={() => setActiveHistory(activeHistory === 'userA' ? null : 'userA')} style={{ width:'100%', padding:'6px', background: activeHistory === 'userA' ? '#ff9a9e' : '#f0f0f0', color: activeHistory === 'userA' ? '#fff' : '#555', border:'none', borderRadius:'8px', fontSize:'0.8rem', cursor:'pointer' }}>{activeHistory === 'userA' ? '收起' : '🔍 紀錄'}</button>
        </div>
        
        <div className="glass-card" style={{ flex: 1, minWidth: '110px', padding: '12px', borderTop: '4px solid #a8e6cf', background: activeHistory === 'userB' ? 'rgba(168,230,207,0.1)' : '#fff' }}>
          <div style={{ fontSize: '0.85rem', color: '#666', fontWeight:'bold' }}>🐕 得得</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#333', margin: '5px 0' }}>{formatMoney(twdDe + Math.round(usdDe * currentFxRate) + investDe)}</div>
          <div style={{ fontSize: '0.75rem', color: '#888', marginBottom:'10px' }}>現 {formatMoney(twdDe)}<br/>美 ${usdDe.toFixed(2)}<br/>投 {formatMoney(investDe)}</div>
          <button onClick={() => setActiveHistory(activeHistory === 'userB' ? null : 'userB')} style={{ width:'100%', padding:'6px', background: activeHistory === 'userB' ? '#a8e6cf' : '#f0f0f0', color: activeHistory === 'userB' ? '#333' : '#555', border:'none', borderRadius:'8px', fontSize:'0.8rem', cursor:'pointer' }}>{activeHistory === 'userB' ? '收起' : '🔍 紀錄'}</button>
        </div>
        
        <div className="glass-card" style={{ flex: 1, minWidth: '110px', padding: '12px', borderTop: '4px solid #f6d365', background: activeHistory === 'jointCash' ? 'rgba(246,211,101,0.1)' : '#fff' }}>
          <div style={{ fontSize: '0.85rem', color: '#666', fontWeight:'bold' }}>🏫 共同</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#333', margin: '5px 0' }}>{formatMoney(twdJoint + Math.round(usdJoint * currentFxRate) + investJoint)}</div>
          <div style={{ fontSize: '0.75rem', color: '#888', marginBottom:'10px' }}>現 {formatMoney(twdJoint)}<br/>美 ${usdJoint.toFixed(2)}<br/>投 {formatMoney(investJoint)}</div>
          <button onClick={() => setActiveHistory(activeHistory === 'jointCash' ? null : 'jointCash')} style={{ width:'100%', padding:'6px', background: activeHistory === 'jointCash' ? '#f6d365' : '#f0f0f0', color: activeHistory === 'jointCash' ? '#333' : '#555', border:'none', borderRadius:'8px', fontSize:'0.8rem', cursor:'pointer' }}>{activeHistory === 'jointCash' ? '收起' : '🔍 紀錄'}</button>
        </div>
      </div>

      {activeHistory && (
        <div className="glass-card" style={{ marginBottom: '20px', borderLeft: `5px solid ${activeHistory === 'userA' ? '#ff9a9e' : activeHistory === 'userB' ? '#a8e6cf' : '#f6d365'}` }}>
          <div style={{ fontWeight: 'bold', color: '#555', marginBottom: '10px', fontSize: '1rem' }}>
              📝 {activeHistory === 'userA' ? '恆恆' : activeHistory === 'userB' ? '得得' : '共同'} 變動明細
          </div>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '15px' }}>
              <input type="date" value={historyDateRange.start} onChange={(e) => setHistoryDateRange(prev => ({...prev, start: e.target.value}))} className="glass-input" style={{margin:0, padding:'6px 10px', flex:1, minWidth:'110px', fontSize:'0.85rem'}} />
              <span style={{color:'#888', fontSize:'0.85rem'}}>至</span>
              <input type="date" value={historyDateRange.end} onChange={(e) => setHistoryDateRange(prev => ({...prev, end: e.target.value}))} className="glass-input" style={{margin:0, padding:'6px 10px', flex:1, minWidth:'110px', fontSize:'0.85rem'}} />
              <button onClick={() => setHistoryDateRange({ start: '', end: '' })} className="glass-btn" style={{padding:'6px 12px', fontSize:'0.85rem', background: '#fff', color:'#333', border:'1px solid #ccc'}}>清除</button>
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
                        <div key={idx} style={{ padding: '16px 0', borderBottom: '1px solid rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ fontSize: '0.8rem', color: '#64748b', display:'flex', justifyContent:'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.4)', padding: '4px 8px', borderRadius: '6px' }}>
                                <span style={{fontWeight: 'bold', color: '#475569'}}>📅 帳單日: {record.date}</span>
                                <span>⏱ 登錄: {formatDateTime(record.timestamp)} | 👤 {record.operator || '系統'}</span>
                            </div>
                            
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '2px' }}>
                                {cashDiff !== 0 && ( <div style={{ color: cashDiff > 0 ? '#16a34a' : '#dc2626', fontWeight: 'bold', fontSize: '1rem' }}>[{label}現鈔] {cashDiff > 0 ? '增加' : '扣除'} {cashDiff > 0 ? '+' : ''}{formatMoney(cashDiff)}</div> )}
                                {usdDiff !== 0 && ( <div style={{ color: usdDiff > 0 ? '#16a34a' : '#dc2626', fontWeight: 'bold', fontSize: '1rem' }}>[{label}美金] {usdDiff > 0 ? '增加' : '扣除'} {usdDiff > 0 ? '+' : ''}${usdDiff.toFixed(2)}</div> )}
                                {invDiff !== 0 && ( <div style={{ color: invDiff > 0 ? '#16a34a' : '#dc2626', fontWeight: 'bold', fontSize: '1rem' }}>[{label}投資] {invDiff > 0 ? '增加' : '扣除'} {invDiff > 0 ? '+' : ''}{formatMoney(invDiff)}</div> )}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ color: '#334155', fontSize: '0.95rem', wordBreak: 'break-word', paddingRight: '10px', fontWeight: 'bold' }}>📝 {record.note}</div>
                                <div style={{ fontSize: '0.85rem', color: '#64748b', whiteSpace: 'nowrap' }}>總額: {formatMoney(record.total)}</div>
                            </div>
                            
                            {b && a && (
                                <div style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.6)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.05)', marginTop: '4px' }}>
                                    <div style={{ marginBottom: '4px', display:'flex', justifyContent:'space-between' }}>
                                        <span style={{color:'#94a3b8'}}>變動前：</span><span style={{color:'#94a3b8'}}>現 {formatMoney(bCash)} | 美 ${bUsd.toFixed(2)} ｜ 投 {formatMoney(bInv)}</span>
                                    </div>
                                    <div style={{ display:'flex', justifyContent:'space-between', fontWeight:'bold', color:'#475569' }}>
                                        <span>變動後：</span><span>現 {formatMoney(aCash)} | 美 ${aUsd.toFixed(2)} ｜ 投 {formatMoney(aInv)}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })
            ) : ( <div style={{ textAlign: 'center', color: '#888', padding: '20px' }}>此區間尚無變動紀錄</div> )}
          </div>
        </div>
      )}

      {/* 【第三層】資產分佈圓餅圖 */}
      <div className="glass-card" style={{ marginBottom: '20px', display: 'flex', flexWrap: 'nowrap', alignItems: 'center', gap: '15px' }}>
        <div style={{ flexShrink: 0, width: '120px', height: '120px', display: 'flex', justifyContent: 'center' }}>
          {activeAssets.length > 0 ? ( <Doughnut data={doughnutData} options={{ maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } }} /> ) : ( <div style={{display:'flex', alignItems:'center', color:'#ccc'}}>尚無資產</div> )}
        </div>
        <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {activeAssets.map((asset) => (
            <div key={asset.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: asset.color, flexShrink: 0 }}></div>
                <span style={{ fontWeight: 'bold', color: '#555', fontSize: '0.9rem' }}>{asset.label}</span>
              </div>
              <div style={{ fontWeight: 'bold', color: '#333', fontSize: '0.95rem' }}>{formatMoney(asset.val)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 【第四層】互動式資產成長趨勢折線圖 */}
      <div className="glass-card" style={{ marginBottom: '20px', padding: '15px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <div style={{ fontWeight: 'bold', color: '#555', fontSize: '1rem' }}>📈 資產成長趨勢 (點擊圖表節點查看明細)</div>
        </div>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '15px' }}>
            <input type="date" value={chartDateRange.start} onChange={(e) => setChartDateRange(prev => ({...prev, start: e.target.value}))} className="glass-input" style={{margin:0, padding:'6px 10px', flex:1, minWidth:'110px', fontSize:'0.85rem'}} />
            <span style={{color:'#888', fontSize:'0.85rem'}}>至</span>
            <input type="date" value={chartDateRange.end} onChange={(e) => setChartDateRange(prev => ({...prev, end: e.target.value}))} className="glass-input" style={{margin:0, padding:'6px 10px', flex:1, minWidth:'110px', fontSize:'0.85rem'}} />
        </div>
        <div style={{display:'flex', gap:'8px', marginBottom:'15px'}}>
            <button onClick={() => setChartDateRange({ start: formatDate(lastYear), end: formatDate(today) })} className="glass-btn" style={{flex:1, padding:'6px', fontSize:'0.85rem', background: '#e2e8f0', color:'#333', border:'none'}}>近一年</button>
            <button onClick={() => setChartDateRange({ start: '', end: '' })} className="glass-btn" style={{flex:1, padding:'6px', fontSize:'0.85rem', background: '#fff', color:'#333', border:'1px solid #ccc'}}>全部時間</button>
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