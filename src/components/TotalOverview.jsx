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

// 🚀 請換成你的 Google API 網址！
const MY_GOOGLE_API_URL = "https://script.google.com/macros/s/AKfycbwK8pr2bfUqC6GnLYwYerjiS_wtt5sk_ZJD4A-xKR2ACA2v64aYXNeRyu1qp1uVRWTdzg/exec";

const TotalOverview = ({ assets, setAssets }) => {
  const [chartDateRange, setChartDateRange] = useState({ start: formatDate(lastYear), end: formatDate(today) });
  const [activeHistory, setActiveHistory] = useState(null); 
  const [historyDateRange, setHistoryDateRange] = useState({ start: '', end: '' });
  
  // 🌟 新增狀態：備份警示與折線圖點擊
  const [backupWarning, setBackupWarning] = useState(false);
  const [selectedChartDate, setSelectedChartDate] = useState(null);

  const isBackingUpRef = useRef(false);
  const todayStr = formatDate(today);

  // --- 0. 🚀 自動無感備份引擎 ---
  useEffect(() => {
      if (!assets.monthlyExpenses || assets.monthlyExpenses.length === 0) return;
      if (assets.lastBackupDate === todayStr || isBackingUpRef.current) return; // 每天只備份一次

      const runBackup = async () => {
          isBackingUpRef.current = true;
          try {
              const res = await fetch(MY_GOOGLE_API_URL, {
                  method: 'POST',
                  body: JSON.stringify({ action: 'backup', date: todayStr, assets: assets })
              });
              const data = await res.json();
              if (data.success) {
                  setBackupWarning(false);
                  // 備份成功，紀錄今天的日期，今天就不會再備份了
                  setAssets(prev => ({ ...prev, lastBackupDate: todayStr }));
              } else {
                  throw new Error("Google回傳失敗");
              }
          } catch (e) {
              console.error("雲端備份失敗:", e);
              setBackupWarning(true); // 觸發紅色警示
          } finally {
              isBackingUpRef.current = false;
          }
      };
      runBackup();
  }, [assets.monthlyExpenses, assets.lastBackupDate, todayStr, setAssets, assets]);


  // --- 1. 計算資產現況 ---
  const cashHeng = assets.userA || 0;
  const cashDe = assets.userB || 0;
  const cashJoint = assets.jointCash || 0;
  const totalCash = cashHeng + cashDe + cashJoint;

  const sumInvestments = (invObj) => Object.values(invObj || {}).reduce((sum, val) => sum + val, 0);
  const investHeng = sumInvestments(assets.userInvestments?.userA);
  const investDe = sumInvestments(assets.userInvestments?.userB);
  const investJoint = sumInvestments(assets.jointInvestments);
  const totalInvest = investHeng + investDe + investJoint;

  const totalAssets = totalCash + totalInvest; 

  const assetTypes = [
    { key: 'cash', label: '現金', color: '#2ecc71', val: totalCash },
    { key: 'stock', label: '股票', color: '#ff9f43', val: (assets.userInvestments?.userA?.stock || 0) + (assets.userInvestments?.userB?.stock || 0) + (assets.jointInvestments?.stock || 0) },
    { key: 'fund', label: '基金', color: '#54a0ff', val: (assets.userInvestments?.userA?.fund || 0) + (assets.userInvestments?.userB?.fund || 0) + (assets.jointInvestments?.fund || 0) },
    { key: 'deposit', label: '定存', color: '#9b59b6', val: (assets.userInvestments?.userA?.deposit || 0) + (assets.userInvestments?.userB?.deposit || 0) + (assets.jointInvestments?.deposit || 0) },
    { key: 'other', label: '其他', color: '#c8d6e5', val: (assets.userInvestments?.userA?.other || 0) + (assets.userInvestments?.userB?.other || 0) + (assets.jointInvestments?.other || 0) }
  ];

  const activeAssets = assetTypes.filter(a => a.val > 0);
  const doughnutData = { labels: activeAssets.map(a => a.label), datasets: [{ data: activeAssets.map(a => a.val), backgroundColor: activeAssets.map(a => a.color), borderWidth: 0, hoverOffset: 4 }] };

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

  // --- 2. 每日打卡快照引擎 ---
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const recordDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  
  const hasSnapshot = (assets.dailyNetWorth || {})[recordDate];
  const isFetchingSnapshotRef = useRef(false); 

  useEffect(() => {
      if (!assets.monthlyExpenses || assets.monthlyExpenses.length === 0) return;
      if (hasSnapshot || isFetchingSnapshotRef.current) return;

      const runDailySnapshot = async () => {
          isFetchingSnapshotRef.current = true;
          try {
              const symbols = Object.keys(stockHoldings);
              let stockMarketValue = 0;

              if (symbols.length > 0) {
                  const allSymbols = [...symbols, 'TWD=X'].join(',');
                  const res = await fetch(`${MY_GOOGLE_API_URL}?symbols=${allSymbols}`, { redirect: 'follow' });
                  if (!res.ok) throw new Error('API 連線失敗');
                  const data = await res.json();
                  
                  if (data?.quoteResponse?.result) {
                      let fxRate = 31.5;
                      const quotes = data.quoteResponse.result;
                      const fxQuote = quotes.find(q => q.symbol === 'TWD=X');
                      if (fxQuote) fxRate = fxQuote.regularMarketPreviousClose || fxQuote.regularMarketPrice || 31.5;

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
              }
              const nonStockInvest = totalInvest - ((assets.userInvestments?.userA?.stock || 0) + (assets.userInvestments?.userB?.stock || 0) + (assets.jointInvestments?.stock || 0));
              const finalNetWorth = Math.round(totalCash + nonStockInvest + stockMarketValue);

              setAssets(prev => ({ ...prev, dailyNetWorth: { ...(prev.dailyNetWorth || {}), [recordDate]: finalNetWorth } }));
          } catch (e) { console.error("快照失敗:", e); } 
          finally { isFetchingSnapshotRef.current = false; }
      };
      runDailySnapshot();
  }, [hasSnapshot, stockHoldings, totalCash, totalInvest, assets, setAssets, recordDate]);

  const handleRecalculate = () => {
    if (window.confirm("⚠️ 確定要重新結算「昨日」的資產快照嗎？\n(這只會重新抓取並覆蓋最近一天的數值，絕對不會影響更早之前的歷史現值！)")) {
        const newAssets = { ...assets };
        if (newAssets.dailyNetWorth && newAssets.dailyNetWorth[recordDate]) delete newAssets.dailyNetWorth[recordDate];
        setAssets(newAssets);
    }
  };

  // --- 3. 繪製折線圖資料 ---
  const historyData = useMemo(() => {
      const chartDataPoints = {};
      const sortedRecords = [...(assets.monthlyExpenses || [])]
          .filter(r => !r.isDeleted && r.auditTrail?.after)
          .sort((a, b) => new Date(a.timestamp || a.date) - new Date(b.timestamp || b.date));

      sortedRecords.forEach(record => {
          const state = record.auditTrail.after;
          const pastCash = (state.userA || 0) + (state.userB || 0) + (state.jointCash || 0);
          const pastInvest = sumInvestments(state.jointInvestments) + sumInvestments(state.userInvestments?.userA) + sumInvestments(state.userInvestments?.userB);
          chartDataPoints[record.date] = pastCash + pastInvest;
      });

      if (assets.dailyNetWorth) Object.keys(assets.dailyNetWorth).forEach(date => { chartDataPoints[date] = assets.dailyNetWorth[date]; });
      if (Object.keys(chartDataPoints).length === 0) chartDataPoints[formatDate(today)] = totalAssets;

      let labels = Object.keys(chartDataPoints).sort();
      
      if (chartDateRange.start) {
          let startValue = 0;
          for (let i = labels.length - 1; i >= 0; i--) { if (labels[i] <= chartDateRange.start) { startValue = chartDataPoints[labels[i]]; break; } }
          labels = labels.filter(d => d >= chartDateRange.start);
          if (labels.length === 0 || labels[0] > chartDateRange.start) { labels.unshift(chartDateRange.start); chartDataPoints[chartDateRange.start] = startValue; }
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
  }, [assets.monthlyExpenses, assets.dailyNetWorth, totalAssets, chartDateRange]);

  const lineChartData = {
      labels: historyData.labels,
      datasets: [{ label: '總資產現值', data: historyData.data, borderColor: '#667eea', backgroundColor: 'rgba(102, 126, 234, 0.15)', fill: true, tension: 0.3, pointRadius: 4, pointBackgroundColor: '#764ba2', borderWidth: 2, pointHoverRadius: 6 }]
  };

  const lineChartOptions = {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => formatMoney(ctx.raw) } } },
      scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 6, maxRotation: 0, font: { size: 10 } } },
          y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { callback: (value) => '$' + (value/10000).toFixed(0) + '萬', font: { size: 10 } } }
      },
      // 🌟 點擊折線圖的互動引擎
      onClick: (evt, elements) => {
          if (elements.length > 0) {
              const dataIndex = elements[0].index;
              setSelectedChartDate(historyData.labels[dataIndex]);
          } else {
              setSelectedChartDate(null);
          }
      }
  };

  // --- 4. 精準科目的歷史軌跡 (含時間戳記與科目扣除明細) ---
  const formatTime = (ts) => {
      if (!ts) return ''; const d = new Date(ts);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };

  const getAccountHistory = () => {
      if (!activeHistory) return [];
      let filtered = (assets.monthlyExpenses || []).filter(r => !r.isDeleted);
      
      // 🎯 最嚴格的過濾：只看該科目的資產數字有沒有變動！
      filtered = filtered.filter(r => {
          if (!r.auditTrail || !r.auditTrail.before || !r.auditTrail.after) return false;
          const b = r.auditTrail.before; const a = r.auditTrail.after;
          if (activeHistory === 'userA') return b.userA !== a.userA || JSON.stringify(b.userInvestments?.userA) !== JSON.stringify(a.userInvestments?.userA);
          if (activeHistory === 'userB') return b.userB !== a.userB || JSON.stringify(b.userInvestments?.userB) !== JSON.stringify(a.userInvestments?.userB);
          if (activeHistory === 'jointCash') return b.jointCash !== a.jointCash || JSON.stringify(b.jointInvestments) !== JSON.stringify(a.jointInvestments);
          return false;
      });

      if (historyDateRange.start) filtered = filtered.filter(r => (r.date || r.month) >= historyDateRange.start);
      if (historyDateRange.end) filtered = filtered.filter(r => (r.date || r.month) <= historyDateRange.end);
      filtered.sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));
      return filtered;
  };

  const handleToggleHistory = (account) => {
      if (activeHistory === account) { setActiveHistory(null); } 
      else { setActiveHistory(account); setHistoryDateRange({ start: '', end: '' }); }
  };
  const specificHistory = getAccountHistory();

  // --- 5. 繪製折線圖點擊後的「變動分析卡片」 ---
  const renderChartDetails = () => {
      if (!selectedChartDate) return null;
      const idx = historyData.labels.indexOf(selectedChartDate);
      if (idx === -1) return null;

      const currentVal = historyData.data[idx];
      const prevVal = idx > 0 ? historyData.data[idx - 1] : currentVal;
      const diff = currentVal - prevVal; // 今天跟昨天的總資產差距

      // 找出當天的所有記帳操作
      const dayRecords = (assets.monthlyExpenses || []).filter(r => !r.isDeleted && r.date === selectedChartDate);
      
      let netTransactions = 0;
      dayRecords.forEach(r => {
          if (['buy', 'spend', 'expense', 'loss'].some(k => r.type.includes(k))) netTransactions -= Number(r.total);
          else if (['sell', 'liquidate', 'income', 'profit', 'transfer'].some(k => r.type.includes(k))) netTransactions += Number(r.total);
      });

      // 核心邏輯：總變動 扣掉 人為記帳 = 純粹的股票市場波動
      const marketFluctuation = diff - netTransactions;

      return (
          <div style={{ marginTop: '15px', padding: '15px', borderRadius: '12px', borderLeft: '5px solid #9b59b6', background: 'linear-gradient(to right, rgba(155, 89, 182, 0.1), rgba(255,255,255,0.5))', animation: 'fadeIn 0.3s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ margin: 0, color: '#555', fontSize: '1.05rem' }}>📅 {selectedChartDate} 資產變動分析</h4>
                  <button onClick={() => setSelectedChartDate(null)} style={{ background:'transparent', border:'none', cursor:'pointer', fontSize:'1.2rem' }}>✖</button>
              </div>
              
              <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom: '15px' }}>
                 <div style={{ fontSize: '0.9rem', color: '#666' }}>總資產: <span style={{fontWeight:'bold', color:'#333'}}>{formatMoney(currentVal)}</span></div>
                 <div style={{ padding:'2px 8px', borderRadius:'10px', fontSize: '0.85rem', fontWeight: 'bold', background: diff >= 0 ? 'rgba(46, 204, 113, 0.2)' : 'rgba(231, 76, 60, 0.2)', color: diff >= 0 ? '#27ae60' : '#c0392b' }}>
                     較昨日 {diff >= 0 ? '+' : ''}{formatMoney(diff)}
                 </div>
              </div>

              {dayRecords.length > 0 && (
                  <div style={{ marginBottom: '12px', background:'rgba(255,255,255,0.7)', padding:'10px', borderRadius:'8px' }}>
                      <div style={{ fontSize: '0.8rem', color: '#888', borderBottom: '1px solid #ddd', paddingBottom: '4px', marginBottom: '6px' }}>
                          📝 當日人為記帳 (淨額: <span style={{color: netTransactions>=0?'#27ae60':'#c0392b', fontWeight:'bold'}}>{netTransactions >= 0 ? '+' : ''}{formatMoney(netTransactions)}</span>)
                      </div>
                      {dayRecords.map((r, i) => {
                          let sign = ['buy', 'spend', 'expense', 'loss'].some(k => r.type.includes(k)) ? '-' : '+';
                          let color = sign === '-' ? '#e74c3c' : '#2ecc71';
                          if (r.type === 'transfer') { sign = ''; color = '#3498db'; }
                          return (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                                  <span style={{color:'#444', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'75%'}}>{r.note || r.category}</span>
                                  <span style={{ color: color, fontWeight:'bold' }}>{sign}{formatMoney(r.total)}</span>
                              </div>
                          );
                      })}
                  </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems:'center', fontSize: '0.9rem', color: '#555', borderTop: '1px dashed #ccc', paddingTop: '10px' }}>
                  <span>📈 市場波動估算 (未實現損益)</span>
                  <span style={{ fontWeight: 'bold', fontSize: '1.1rem', color: marketFluctuation >= 0 ? '#2ecc71' : '#e74c3c' }}>
                      {marketFluctuation >= 0 ? '+' : ''}{formatMoney(marketFluctuation)}
                  </span>
              </div>
          </div>
      );
  };

  return (
    <div style={{animation: 'fadeIn 0.5s'}}>
      
      {/* 🚨 備份失敗紅色警示 */}
      {backupWarning && (
          <div style={{ background: '#e74c3c', color: 'white', padding: '10px 15px', borderRadius: '8px', marginBottom: '15px', fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>⚠️ 警告：昨日的雲端自動備份失敗！請檢查您的網路或 Google 權限，或進行手動備份。</span>
              <button onClick={() => setBackupWarning(false)} style={{ background:'transparent', border:'none', color:'white', fontSize:'1.2rem', cursor:'pointer' }}>×</button>
          </div>
      )}

      <h1 className="page-title" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        總資產概況
        <button onClick={handleRecalculate} style={{background: 'rgba(0,0,0,0.05)', border: 'none', borderRadius: '8px', padding: '6px 10px', fontSize: '0.8rem', color: '#666', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'}}>
            <span>🔄</span>重新結算
        </button>
      </h1>

      {/* 【第一層】雙人總資產大看板 */}
      <div className="glass-card" style={{ marginBottom: '20px', textAlign: 'center', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', padding: '25px 15px' }}>
        <div style={{ fontSize: '0.9rem', opacity: 0.9, marginBottom: '5px' }}>雙人總資產 (帳面現值)</div>
        <div style={{ fontSize: '2.5rem', fontWeight: 'bold', textShadow: '0 2px 10px rgba(0,0,0,0.2)' }}>
          {formatMoney(historyData.data[historyData.data.length - 1] || totalAssets)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginTop: '15px', fontSize: '0.85rem' }}>
           <div style={{background:'rgba(255,255,255,0.2)', padding:'4px 12px', borderRadius:'15px'}}>💰 總現金 {formatMoney(totalCash)}</div>
           <div style={{background:'rgba(255,255,255,0.2)', padding:'4px 12px', borderRadius:'15px'}}>📈 總投入本金 {formatMoney(totalInvest)}</div>
        </div>
      </div>

      {/* 【第二層】三個科目方塊 */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: activeHistory ? '10px' : '20px', flexWrap: 'wrap' }}>
        <div className="glass-card" style={{ flex: 1, minWidth: '110px', padding: '12px', borderTop: '4px solid #ff9a9e', background: activeHistory === 'userA' ? 'rgba(255,154,158,0.1)' : '#fff' }}>
          <div style={{ fontSize: '0.85rem', color: '#666', fontWeight:'bold' }}>🐶 恆恆</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#333', margin: '5px 0' }}>{formatMoney(cashHeng + investHeng)}</div>
          <div style={{ fontSize: '0.75rem', color: '#888', marginBottom:'10px' }}>現 {formatMoney(cashHeng)} <br/> 投 {formatMoney(investHeng)}</div>
          <button onClick={() => handleToggleHistory('userA')} style={{ width:'100%', padding:'6px', background: activeHistory === 'userA' ? '#ff9a9e' : '#f0f0f0', color: activeHistory === 'userA' ? '#fff' : '#555', border:'none', borderRadius:'8px', fontSize:'0.8rem', cursor:'pointer' }}>{activeHistory === 'userA' ? '收起軌跡' : '🔍 紀錄'}</button>
        </div>
        
        <div className="glass-card" style={{ flex: 1, minWidth: '110px', padding: '12px', borderTop: '4px solid #a8e6cf', background: activeHistory === 'userB' ? 'rgba(168,230,207,0.1)' : '#fff' }}>
          <div style={{ fontSize: '0.85rem', color: '#666', fontWeight:'bold' }}>🐕 得得</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#333', margin: '5px 0' }}>{formatMoney(cashDe + investDe)}</div>
          <div style={{ fontSize: '0.75rem', color: '#888', marginBottom:'10px' }}>現 {formatMoney(cashDe)} <br/> 投 {formatMoney(investDe)}</div>
          <button onClick={() => handleToggleHistory('userB')} style={{ width:'100%', padding:'6px', background: activeHistory === 'userB' ? '#a8e6cf' : '#f0f0f0', color: activeHistory === 'userB' ? '#333' : '#555', border:'none', borderRadius:'8px', fontSize:'0.8rem', cursor:'pointer' }}>{activeHistory === 'userB' ? '收起軌跡' : '🔍 紀錄'}</button>
        </div>
        
        <div className="glass-card" style={{ flex: 1, minWidth: '110px', padding: '12px', borderTop: '4px solid #f6d365', background: activeHistory === 'jointCash' ? 'rgba(246,211,101,0.1)' : '#fff' }}>
          <div style={{ fontSize: '0.85rem', color: '#666', fontWeight:'bold' }}>🏫 共同</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#333', margin: '5px 0' }}>{formatMoney(cashJoint + investJoint)}</div>
          <div style={{ fontSize: '0.75rem', color: '#888', marginBottom:'10px' }}>現 {formatMoney(cashJoint)} <br/> 投 {formatMoney(investJoint)}</div>
          <button onClick={() => handleToggleHistory('jointCash')} style={{ width:'100%', padding:'6px', background: activeHistory === 'jointCash' ? '#f6d365' : '#f0f0f0', color: activeHistory === 'jointCash' ? '#333' : '#555', border:'none', borderRadius:'8px', fontSize:'0.8rem', cursor:'pointer' }}>{activeHistory === 'jointCash' ? '收起軌跡' : '🔍 紀錄'}</button>
        </div>
      </div>

      {/* 【第二點五層】專屬科目的歷史軌跡面板 (點擊後展開) */}
      {activeHistory && (
        <div className="glass-card" style={{ marginBottom: '20px', borderLeft: `5px solid ${activeHistory === 'userA' ? '#ff9a9e' : activeHistory === 'userB' ? '#a8e6cf' : '#f6d365'}` }}>
          <div style={{ fontWeight: 'bold', color: '#555', marginBottom: '10px', fontSize: '1rem' }}>
              📝 {activeHistory === 'userA' ? '恆恆' : activeHistory === 'userB' ? '得得' : '共同'} 專屬變動明細
          </div>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '15px' }}>
              <input type="date" value={historyDateRange.start} onChange={(e) => setHistoryDateRange(prev => ({...prev, start: e.target.value}))} className="glass-input" style={{margin:0, padding:'6px 10px', flex:1, minWidth:'110px', fontSize:'0.85rem'}} />
              <span style={{color:'#888', fontSize:'0.85rem'}}>至</span>
              <input type="date" value={historyDateRange.end} onChange={(e) => setHistoryDateRange(prev => ({...prev, end: e.target.value}))} className="glass-input" style={{margin:0, padding:'6px 10px', flex:1, minWidth:'110px', fontSize:'0.85rem'}} />
              <button onClick={() => setHistoryDateRange({ start: '', end: '' })} className="glass-btn" style={{padding:'6px 12px', fontSize:'0.85rem', background: '#fff', color:'#333', border:'1px solid #ccc'}}>清除</button>
          </div>

          <div style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '5px' }}>
            {specificHistory.length > 0 ? (
                specificHistory.map((record, idx) => {
                    // 🎯 計算精準的帳戶扣除/增加金額
                    const b = record.auditTrail?.before;
                    const a = record.auditTrail?.after;
                    let accountChangeText = ""; let accountChangeAmount = 0;
                    
                    if (b && a) {
                        if (activeHistory === 'userA') {
                            const cashDiff = (a.userA || 0) - (b.userA || 0);
                            const invDiff = sumInvestments(a.userInvestments?.userA) - sumInvestments(b.userInvestments?.userA);
                            if (cashDiff !== 0) { accountChangeText = `[恆恆現鈔] ${cashDiff > 0 ? '增加' : '扣除'}`; accountChangeAmount = cashDiff; } 
                            else if (invDiff !== 0) { accountChangeText = `[恆恆投資] ${invDiff > 0 ? '增加' : '扣除'}`; accountChangeAmount = invDiff; }
                        } else if (activeHistory === 'userB') {
                            const cashDiff = (a.userB || 0) - (b.userB || 0);
                            const invDiff = sumInvestments(a.userInvestments?.userB) - sumInvestments(b.userInvestments?.userB);
                            if (cashDiff !== 0) { accountChangeText = `[得得現鈔] ${cashDiff > 0 ? '增加' : '扣除'}`; accountChangeAmount = cashDiff; } 
                            else if (invDiff !== 0) { accountChangeText = `[得得投資] ${invDiff > 0 ? '增加' : '扣除'}`; accountChangeAmount = invDiff; }
                        } else if (activeHistory === 'jointCash') {
                            const cashDiff = (a.jointCash || 0) - (b.jointCash || 0);
                            const invDiff = sumInvestments(a.jointInvestments) - sumInvestments(b.jointInvestments);
                            if (cashDiff !== 0) { accountChangeText = `[共同現金] ${cashDiff > 0 ? '增加' : '扣除'}`; accountChangeAmount = cashDiff; } 
                            else if (invDiff !== 0) { accountChangeText = `[共同投資] ${invDiff > 0 ? '增加' : '扣除'}`; accountChangeAmount = invDiff; }
                        }
                    }

                    return (
                        <div key={idx} style={{ padding: '15px 0', borderBottom: '1px solid #eee', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ fontSize: '0.8rem', color: '#888', display:'flex', justifyContent:'space-between' }}>
                                <span>📅 {record.date} | ⏱ {formatTime(record.timestamp)}</span>
                                <span>👤 操作: {record.operator || '系統'}</span>
                            </div>
                            
                            {accountChangeText && (
                                <div style={{ color: accountChangeAmount > 0 ? '#2ecc71' : '#e74c3c', fontWeight: 'bold', fontSize: '1rem' }}>
                                    {accountChangeText} {accountChangeAmount > 0 ? '+' : ''}{formatMoney(accountChangeAmount)}
                                </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.03)', padding: '8px 10px', borderRadius: '8px' }}>
                                <div style={{ color: '#444', fontSize: '0.9rem', wordBreak: 'break-word', paddingRight: '10px' }}>📝 {record.note}</div>
                                <div style={{ fontSize: '0.85rem', color: '#666', whiteSpace: 'nowrap' }}>
                                    單筆總額: {formatMoney(record.total)}
                                </div>
                            </div>
                        </div>
                    );
                })
            ) : (
                <div style={{ textAlign: 'center', color: '#888', padding: '20px' }}>此區間尚無變動紀錄</div>
            )}
          </div>
        </div>
      )}

      {/* 【第三層】資產分佈圓餅圖 */}
      <div className="glass-card" style={{ marginBottom: '20px', display: 'flex', flexWrap: 'nowrap', alignItems: 'center', gap: '15px' }}>
        <div style={{ flexShrink: 0, width: '120px', height: '120px', display: 'flex', justifyContent: 'center' }}>
          {activeAssets.length > 0 ? (
              <Doughnut data={doughnutData} options={{ maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } }} />
          ) : (
              <div style={{display:'flex', alignItems:'center', color:'#ccc'}}>尚無資產</div>
          )}
        </div>
        <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {activeAssets.map((asset) => (
            <div key={asset.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: asset.color, flexShrink: 0 }}></div>
                <span style={{ fontWeight: 'bold', color: '#555', fontSize: '0.9rem' }}>{asset.label}</span>
              </div>
              <div style={{ fontWeight: 'bold', color: '#333', fontSize: '0.95rem' }}>
                {formatMoney(asset.val)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 【第四層】互動式資產成長趨勢折線圖 */}
      <div className="glass-card" style={{ marginBottom: '20px', padding: '15px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <div style={{ fontWeight: 'bold', color: '#555', fontSize: '1rem' }}>📈 資產成長趨勢 (點擊節點查看明細)</div>
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

        {/* 折線圖本體 */}
        <div style={{ height: '220px', width: '100%', cursor: 'pointer' }}>
            <Line data={lineChartData} options={lineChartOptions} />
        </div>

        {/* 🌟 點擊折線圖後彈出的分析卡片 */}
        {renderChartDetails()}
      </div>

    </div>
  );
};

export default TotalOverview;