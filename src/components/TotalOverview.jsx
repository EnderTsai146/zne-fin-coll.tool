// src/components/TotalOverview.jsx
import React, { useMemo, useEffect, useRef } from 'react';
import { 
  Chart as ChartJS, ArcElement, Tooltip, Legend, 
  CategoryScale, LinearScale, PointElement, LineElement, Title, Filler 
} from 'chart.js';
import { Doughnut, Line } from 'react-chartjs-2';

// 註冊所有 Chart.js 需要的元件
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Title, Filler);

const formatMoney = (num) => "$" + Math.round(Number(num)).toLocaleString();

// 🚀 請把下面這串換成你自己的 Google API 網址！
const MY_GOOGLE_API_URL = "https://script.google.com/macros/s/AKfycbwK8pr2bfUqC6GnLYwYerjiS_wtt5sk_ZJD4A-xKR2ACA2v64aYXNeRyu1qp1uVRWTdzg/exec";

const TotalOverview = ({ assets, setAssets }) => {
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

  const totalAssets = totalCash + totalInvest; // 這是「帳面本金總資產」

  // --- 2. 🛡️ 完美修復：圓餅圖動態過濾 (解決文字重疊與顏色錯亂) ---
  const assetTypes = [
    { key: 'cash', label: '現金', color: '#2ecc71', val: totalCash },
    { key: 'stock', label: '股票', color: '#ff9f43', val: (assets.userInvestments?.userA?.stock || 0) + (assets.userInvestments?.userB?.stock || 0) + (assets.jointInvestments?.stock || 0) },
    { key: 'fund', label: '基金', color: '#54a0ff', val: (assets.userInvestments?.userA?.fund || 0) + (assets.userInvestments?.userB?.fund || 0) + (assets.jointInvestments?.fund || 0) },
    { key: 'deposit', label: '定存', color: '#9b59b6', val: (assets.userInvestments?.userA?.deposit || 0) + (assets.userInvestments?.userB?.deposit || 0) + (assets.jointInvestments?.deposit || 0) },
    { key: 'other', label: '其他', color: '#c8d6e5', val: (assets.userInvestments?.userA?.other || 0) + (assets.userInvestments?.userB?.other || 0) + (assets.jointInvestments?.other || 0) }
  ];

  // 只保留大於 0 的項目，並精準對應顏色
  const activeAssets = assetTypes.filter(a => a.val > 0);
  const doughnutData = {
    labels: activeAssets.map(a => a.label),
    datasets: [{
      data: activeAssets.map(a => a.val),
      backgroundColor: activeAssets.map(a => a.color),
      borderWidth: 0, hoverOffset: 4
    }]
  };

  // --- 3. 取得目前持股股數 (為快照引擎準備) ---
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

  // --- 4. 🚀 神級功能：每日打卡快照引擎 (已上安全鎖) ---
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

  // --- 5. 繪製「歷史與現實交織」的完美折線圖 ---
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

      if (Object.keys(chartDataPoints).length === 0) {
          chartDataPoints[new Date().toISOString().split('T')[0]] = totalAssets;
      }

      const labels = Object.keys(chartDataPoints).sort();
      const data = labels.map(d => chartDataPoints[d]);

      return { labels, data };
  }, [assets.monthlyExpenses, assets.dailyNetWorth, totalAssets]);

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
        
        {/* 上下列表排列 */}
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

      {/* 🚀 升級版：最近變動軌跡 (防跑版、顯示餘額、清晰操作者) */}
      <div className="glass-card" style={{ marginBottom: '20px' }}>
        <h3 style={{ marginTop: 0, marginBottom: '15px', color: '#555', fontSize: '1.05rem', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
          🕒 最近資產變動軌跡
        </h3>
        {assets.monthlyExpenses && assets.monthlyExpenses.filter(r => !r.isDeleted).length > 0 ? (
          assets.monthlyExpenses
            .filter(r => !r.isDeleted)
            .sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date))
            .slice(0, 6) // 取最新 6 筆
            .map((record, idx) => {
              // 1. 判斷資金流向與顏色
              let amountStr = ''; let amountColor = '#333';
              if (['buy', 'spend', 'expense', 'loss'].some(k => record.type.includes(k))) { 
                  amountStr = `-${formatMoney(record.total)}`; 
                  amountColor = '#e74c3c'; 
              } else if (['sell', 'liquidate', 'income', 'profit'].some(k => record.type.includes(k))) { 
                  amountStr = `+${formatMoney(record.total)}`; 
                  amountColor = '#2ecc71'; 
              } else { 
                  amountStr = `🔄 ${formatMoney(record.total)}`; 
                  amountColor = '#3498db'; 
              }

              // 2. 精準抓取變動後的帳戶餘額 (透過 auditTrail)
              let balanceLabel = '';
              let balanceAmount = null;
              const stateAfter = record.auditTrail?.after;
              
              if (stateAfter) {
                  if (record.advancedBy) {
                      if (record.advancedBy === 'userA') { balanceLabel = '恆恆現鈔'; balanceAmount = stateAfter.userA; }
                      else if (record.advancedBy === 'userB') { balanceLabel = '得得現鈔'; balanceAmount = stateAfter.userB; }
                      else if (record.advancedBy === 'jointCash') { balanceLabel = '共同現金'; balanceAmount = stateAfter.jointCash; }
                  } else if (record.accountKey) {
                      if (record.accountKey === 'userA') { balanceLabel = '恆恆現鈔'; balanceAmount = stateAfter.userA; }
                      else if (record.accountKey === 'userB') { balanceLabel = '得得現鈔'; balanceAmount = stateAfter.userB; }
                      else if (record.accountKey === 'jointCash') { balanceLabel = '共同現金'; balanceAmount = stateAfter.jointCash; }
                  } else {
                      if (record.payer?.includes('恆恆')) { balanceLabel = '恆恆現鈔'; balanceAmount = stateAfter.userA; }
                      else if (record.payer?.includes('得得')) { balanceLabel = '得得現鈔'; balanceAmount = stateAfter.userB; }
                      else if (record.payer?.includes('共同')) { balanceLabel = '共同現金'; balanceAmount = stateAfter.jointCash; }
                  }
              }

              // 3. 全新三層式清晰排版
              return (
                <div key={idx} style={{ padding: '12px 0', borderBottom: '1px dashed #eee', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {/* 第一層：時間與操作者 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#888' }}>
                      <span>📅 {record.date}</span>
                      <span>👤 操作: {record.operator || '系統'}</span>
                  </div>
                  
                  {/* 第二層：明細與金額 (Flexbox 保護，金額絕對不換行) */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ flex: 1, wordBreak: 'break-word', paddingRight: '15px' }}>
                          <span style={{ fontWeight: 'bold', color: '#444', fontSize: '0.95rem', lineHeight: '1.4' }}>{record.note}</span>
                      </div>
                      <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: amountColor, whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {amountStr}
                      </div>
                  </div>

                  {/* 第三層：分類與交易後真實餘額 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                      <span style={{ color: '#667eea', background: 'rgba(102, 126, 234, 0.1)', padding: '2px 8px', borderRadius: '10px' }}>
                          {record.category}
                      </span>
                      {balanceAmount !== null && (
                          <span style={{ color: '#7f8c8d' }}>💳 {balanceLabel}: {formatMoney(balanceAmount)}</span>
                      )}
                  </div>
                </div>
              );
            })
        ) : (
          <div style={{ textAlign: 'center', color: '#888', padding: '20px' }}>尚無變動紀錄</div>
        )}
      </div>

    </div>
  );
};

export default TotalOverview;