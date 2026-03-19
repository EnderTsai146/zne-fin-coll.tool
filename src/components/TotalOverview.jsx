// src/components/TotalOverview.jsx
import React, { useMemo, useEffect, useRef, useState } from 'react';
import { 
  Chart as ChartJS, ArcElement, Tooltip, Legend, 
  CategoryScale, LinearScale, PointElement, LineElement, Title, Filler 
} from 'chart.js';
import { Doughnut, Line } from 'react-chartjs-2';

// 註冊所有 Chart.js 需要的元件
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Title, Filler);

const formatMoney = (num) => "$" + Math.round(Number(num)).toLocaleString();
const formatDate = (date) => date.toISOString().split('T')[0];

// 🚀 取得「近一年」的預設日期區間
const today = new Date();
const lastYear = new Date(); lastYear.setFullYear(today.getFullYear() - 1);

// ⚠️ 請把下面這串換成你自己的 Google API 網址！
const MY_GOOGLE_API_URL = "https://script.google.com/macros/s/AKfycbwK8pr2bfUqC6GnLYwYerjiS_wtt5sk_ZJD4A-xKR2ACA2v64aYXNeRyu1qp1uVRWTdzg/exec";

const TotalOverview = ({ assets, setAssets }) => {
  // 預設時間範圍為：近一年
  const [dateRange, setDateRange] = useState({ start: formatDate(lastYear), end: formatDate(today) });

  // --- 1. 計算各項資產現況 (本金視角) ---
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

  // --- 2. 🛡️ 圓餅圖動態過濾 ---
  const assetTypes = [
    { key: 'cash', label: '現金', color: '#2ecc71', val: totalCash },
    { key: 'stock', label: '股票', color: '#ff9f43', val: (assets.userInvestments?.userA?.stock || 0) + (assets.userInvestments?.userB?.stock || 0) + (assets.jointInvestments?.stock || 0) },
    { key: 'fund', label: '基金', color: '#54a0ff', val: (assets.userInvestments?.userA?.fund || 0) + (assets.userInvestments?.userB?.fund || 0) + (assets.jointInvestments?.fund || 0) },
    { key: 'deposit', label: '定存', color: '#9b59b6', val: (assets.userInvestments?.userA?.deposit || 0) + (assets.userInvestments?.userB?.deposit || 0) + (assets.jointInvestments?.deposit || 0) },
    { key: 'other', label: '其他', color: '#c8d6e5', val: (assets.userInvestments?.userA?.other || 0) + (assets.userInvestments?.userB?.other || 0) + (assets.jointInvestments?.other || 0) }
  ];

  const activeAssets = assetTypes.filter(a => a.val > 0);
  const doughnutData = {
    labels: activeAssets.map(a => a.label),
    datasets: [{
      data: activeAssets.map(a => a.val),
      backgroundColor: activeAssets.map(a => a.color),
      borderWidth: 0, hoverOffset: 4
    }]
  };

  // --- 3. 取得目前持股股數 ---
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

  // --- 4. 🚀 每日打卡快照引擎 ---
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const recordDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  
  const hasSnapshot = (assets.dailyNetWorth || {})[recordDate];
  const isFetchingRef = useRef(false); 

  useEffect(() => {
      if (!assets.monthlyExpenses || assets.monthlyExpenses.length === 0) return;
      if (hasSnapshot || isFetchingRef.current) return;

      const runDailySnapshot = async () => {
          isFetchingRef.current = true;
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

              setAssets({
                  ...assets,
                  dailyNetWorth: {
                      ...(assets.dailyNetWorth || {}),
                      [recordDate]: finalNetWorth
                  }
              });

          } catch (e) {
              console.error("背景快照引擎執行失敗:", e);
          } finally {
              isFetchingRef.current = false;
          }
      };

      runDailySnapshot();
  }, [hasSnapshot, stockHoldings, totalCash, totalInvest, assets, setAssets, recordDate]);

  // --- 5. 繪製折線圖 (連動時間範圍，智能補點) ---
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

      if (assets.dailyNetWorth) {
          Object.keys(assets.dailyNetWorth).forEach(date => {
              chartDataPoints[date] = assets.dailyNetWorth[date];
          });
      }

      // 如果完全沒資料的防呆
      if (Object.keys(chartDataPoints).length === 0) {
          chartDataPoints[formatDate(today)] = totalAssets;
      }

      // 提取排序後的所有日期
      let labels = Object.keys(chartDataPoints).sort();
      
      // 👉 智能邊界補點：尋找「起點之前」最後一次的真實餘額
      if (dateRange.start) {
          let startValue = 0;
          for (let i = labels.length - 1; i >= 0; i--) {
              if (labels[i] <= dateRange.start) { startValue = chartDataPoints[labels[i]]; break; }
          }
          labels = labels.filter(d => d >= dateRange.start);
          if (labels.length === 0 || labels[0] > dateRange.start) {
              labels.unshift(dateRange.start);
              chartDataPoints[dateRange.start] = startValue;
          }
      }
      
      // 👉 智能邊界補點：尋找「終點之前」的最後餘額
      if (dateRange.end) {
          labels = labels.filter(d => d <= dateRange.end);
          if (labels.length === 0 || labels[labels.length - 1] < dateRange.end) {
              labels.push(dateRange.end);
              let endValue = totalAssets;
              for (let i = 0; i < Object.keys(chartDataPoints).sort().length; i++) {
                  if (Object.keys(chartDataPoints).sort()[i] <= dateRange.end) {
                      endValue = chartDataPoints[Object.keys(chartDataPoints).sort()[i]];
                  }
              }
              chartDataPoints[dateRange.end] = endValue;
          }
      }

      const data = labels.map(d => chartDataPoints[d]);
      return { labels, data };
  }, [assets.monthlyExpenses, assets.dailyNetWorth, totalAssets, dateRange]);

  const lineChartData = {
      labels: historyData.labels,
      datasets: [{
          label: '總資產現值',
          data: historyData.data,
          borderColor: '#667eea',
          backgroundColor: 'rgba(102, 126, 234, 0.15)', 
          fill: true, tension: 0.3, pointRadius: 3,
          pointBackgroundColor: '#764ba2', borderWidth: 2
      }]
  };

  const lineChartOptions = {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => formatMoney(ctx.raw) } } },
      scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 6, maxRotation: 0, font: { size: 10 } } },
          y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { callback: (value) => '$' + (value/10000).toFixed(0) + '萬', font: { size: 10 } } }
      }
  };

  // --- 6. 軌跡過濾與「交易原子性」群組化邏輯 ---
  const groupedExpenses = useMemo(() => {
      let filtered = (assets.monthlyExpenses || []).filter(r => !r.isDeleted);
      if (dateRange.start) filtered = filtered.filter(r => (r.date || r.month) >= dateRange.start);
      if (dateRange.end) filtered = filtered.filter(r => (r.date || r.month) <= dateRange.end);
      
      filtered.sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));
      
      // 依據精確的 timestamp (時間戳記) 將同時發生的操作打包成同一個 Group
      const groups = [];
      let currentGroup = null;

      filtered.forEach(record => {
          const groupKey = record.timestamp || record.date; // 優先用 timestamp 分組
          if (!currentGroup || currentGroup.key !== groupKey) {
              if (currentGroup) groups.push(currentGroup);
              currentGroup = {
                  key: groupKey,
                  date: record.date,
                  timestamp: record.timestamp,
                  operator: record.operator || '系統',
                  records: [record]
              };
          } else {
              currentGroup.records.push(record);
          }
      });
      if (currentGroup) groups.push(currentGroup);
      
      return groups.slice(0, 15); // 最多顯示 15 個群組，保持頁面流暢
  }, [assets.monthlyExpenses, dateRange]);

  const formatTime = (ts) => {
      if (!ts) return '';
      const d = new Date(ts);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };

  return (
    <div style={{animation: 'fadeIn 0.5s'}}>
      <h1 className="page-title">總資產概況</h1>

      {/* 總資產大看板 */}
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

      {/* 🔍 歷史查詢區間 */}
      <div className="glass-card" style={{ padding: '12px 15px', marginBottom: '20px', borderLeft: '5px solid #3498db' }}>
          <div style={{color:'#555', fontWeight:'bold', marginBottom:'8px', fontSize:'0.9rem'}}>🔍 歷史查詢區間 (連動圖表與明細)</div>
          <div style={{display:'flex', flexWrap:'wrap', gap:'8px', alignItems:'center'}}>
              <input type="date" value={dateRange.start} onChange={(e) => setDateRange(prev => ({...prev, start: e.target.value}))} className="glass-input" style={{margin:0, padding:'6px 10px', flex:1, minWidth:'110px', fontSize:'0.85rem'}} />
              <span style={{color:'#888', fontSize:'0.85rem'}}>至</span>
              <input type="date" value={dateRange.end} onChange={(e) => setDateRange(prev => ({...prev, end: e.target.value}))} className="glass-input" style={{margin:0, padding:'6px 10px', flex:1, minWidth:'110px', fontSize:'0.85rem'}} />
          </div>
          <div style={{display:'flex', gap:'8px', marginTop:'10px'}}>
              <button onClick={() => setDateRange({ start: formatDate(lastYear), end: formatDate(today) })} className="glass-btn" style={{flex:1, padding:'6px', fontSize:'0.85rem', background: '#e2e8f0', color:'#333', border:'none'}}>近一年</button>
              <button onClick={() => setDateRange({ start: '', end: '' })} className="glass-btn" style={{flex:1, padding:'6px', fontSize:'0.85rem', background: '#fff', color:'#333', border:'1px solid #ccc'}}>全部時間</button>
          </div>
      </div>

      {/* 📈 歷史資產折線圖 */}
      <div className="glass-card" style={{ marginBottom: '20px', padding: '15px' }}>
        <div style={{ fontWeight: 'bold', color: '#555', marginBottom: '10px', fontSize: '1rem' }}>📈 資產成長趨勢</div>
        <div style={{ height: '180px', width: '100%' }}>
            <Line data={lineChartData} options={lineChartOptions} />
        </div>
      </div>

      {/* 🛡️ 修復版：資產分佈圓餅圖 */}
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

      {/* 個人資產明細 */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div className="glass-card" style={{ flex: 1, minWidth: '140px', padding: '15px', borderTop: '4px solid #ff9a9e' }}>
          <div style={{ fontSize: '0.85rem', color: '#666' }}>🐶 恆恆總資產</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#333', margin: '5px 0' }}>{formatMoney(cashHeng + investHeng)}</div>
          <div style={{ fontSize: '0.75rem', color: '#888' }}>現 {formatMoney(cashHeng)} | 投 {formatMoney(investHeng)}</div>
        </div>
        <div className="glass-card" style={{ flex: 1, minWidth: '140px', padding: '15px', borderTop: '4px solid #a8e6cf' }}>
          <div style={{ fontSize: '0.85rem', color: '#666' }}>🐕 得得總資產</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#333', margin: '5px 0' }}>{formatMoney(cashDe + investDe)}</div>
          <div style={{ fontSize: '0.75rem', color: '#888' }}>現 {formatMoney(cashDe)} | 投 {formatMoney(investDe)}</div>
        </div>
        <div className="glass-card" style={{ flex: 1, minWidth: '140px', padding: '15px', borderTop: '4px solid #f6d365' }}>
          <div style={{ fontSize: '0.85rem', color: '#666' }}>🏫 共同總資產</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#333', margin: '5px 0' }}>{formatMoney(cashJoint + investJoint)}</div>
          <div style={{ fontSize: '0.75rem', color: '#888' }}>現 {formatMoney(cashJoint)} | 投 {formatMoney(investJoint)}</div>
        </div>
      </div>

      {/* 🚀 群組化＋時間範圍的變動軌跡 */}
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ marginTop: 0, marginBottom: '15px', color: '#555', fontSize: '1.05rem', marginLeft: '5px' }}>
          🕒 最近資產變動軌跡
        </h3>

        {groupedExpenses.length > 0 ? (
          groupedExpenses.map((group, gIdx) => (
            <div key={gIdx} className="glass-card" style={{ padding: '15px', marginBottom: '15px', background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(0,0,0,0.05)' }}>
              
              {/* 卡片群組頂端：共用時間與操作者 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#888', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #eaeaea' }}>
                  <span>📅 {group.date} <span style={{marginLeft:'5px', color:'#aaa'}}>{formatTime(group.timestamp)}</span></span>
                  <span>👤 操作: {group.operator}</span>
              </div>

              {/* 渲染同一個時間點的所有細項操作 */}
              {group.records.map((record, rIdx) => {
                  let amountStr = ''; let amountColor = '#333';
                  if (['buy', 'spend', 'expense', 'loss'].some(k => record.type.includes(k))) { 
                      amountStr = `-${formatMoney(record.total)}`; amountColor = '#e74c3c'; 
                  } else if (['sell', 'liquidate', 'income', 'profit'].some(k => record.type.includes(k))) { 
                      amountStr = `+${formatMoney(record.total)}`; amountColor = '#2ecc71'; 
                  } else { 
                      amountStr = `🔄 ${formatMoney(record.total)}`; amountColor = '#3498db'; 
                  }

                  let balanceLabel = ''; let balanceAmount = null;
                  const stateAfter = record.auditTrail?.after;
                  if (stateAfter) {
                      if (record.advancedBy) {
                          if (record.advancedBy === 'userA') { balanceLabel = '恆恆'; balanceAmount = stateAfter.userA; }
                          else if (record.advancedBy === 'userB') { balanceLabel = '得得'; balanceAmount = stateAfter.userB; }
                          else if (record.advancedBy === 'jointCash') { balanceLabel = '共同'; balanceAmount = stateAfter.jointCash; }
                      } else if (record.accountKey) {
                          if (record.accountKey === 'userA') { balanceLabel = '恆恆'; balanceAmount = stateAfter.userA; }
                          else if (record.accountKey === 'userB') { balanceLabel = '得得'; balanceAmount = stateAfter.userB; }
                          else if (record.accountKey === 'jointCash') { balanceLabel = '共同'; balanceAmount = stateAfter.jointCash; }
                      } else {
                          if (record.payer?.includes('恆恆')) { balanceLabel = '恆恆'; balanceAmount = stateAfter.userA; }
                          else if (record.payer?.includes('得得')) { balanceLabel = '得得'; balanceAmount = stateAfter.userB; }
                          else if (record.payer?.includes('共同')) { balanceLabel = '共同'; balanceAmount = stateAfter.jointCash; }
                      }
                  }

                  // 每一筆明細的俐落排版
                  return (
                    <div key={rIdx} style={{ padding: '8px 0', borderBottom: rIdx === group.records.length - 1 ? 'none' : '1px dashed #ccc', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ fontWeight: 'bold', color: '#444', fontSize: '0.95rem', lineHeight: '1.4', paddingRight: '10px', wordBreak: 'break-word' }}>
                              {record.note}
                          </div>
                          {/* 金額上了 nowrap 鎖，絕對不換行 */}
                          <div style={{ fontWeight: 'bold', fontSize: '1.15rem', color: amountColor, whiteSpace: 'nowrap', flexShrink: 0 }}>
                              {amountStr}
                          </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#667eea' }}>
                          <span>{record.category} ({record.payer})</span>
                          {balanceAmount !== null && (
                              <span style={{ color: '#888' }}>💳 {balanceLabel}餘額: {formatMoney(balanceAmount)}</span>
                          )}
                      </div>
                    </div>
                  );
              })}
            </div>
          ))
        ) : (
          <div style={{ textAlign: 'center', color: '#888', padding: '20px' }}>此區間尚無變動紀錄</div>
        )}
      </div>

    </div>
  );
};

export default TotalOverview;