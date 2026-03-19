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

  // --- 4. 🚀 神級功能：每日打卡快照引擎 (Idempotent Snapshot Engine) ---
  // 計算「昨天」的日期字串
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const recordDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  
  // 檢查資料庫是否已經有昨天的打卡紀錄
  const hasSnapshot = (assets.dailyNetWorth || {})[recordDate];
  const isFetchingRef = useRef(false); // 防連點機制

  useEffect(() => {
      if (hasSnapshot || isFetchingRef.current) return;

      const runDailySnapshot = async () => {
          isFetchingRef.current = true;
          try {
              const symbols = Object.keys(stockHoldings);
              let stockMarketValue = 0;

              // 如果有股票，就去呼叫 Google API 拿「昨日收盤價」
              if (symbols.length > 0) {
                  const allSymbols = [...symbols, 'TWD=X'].join(',');
                  const res = await fetch(`${MY_GOOGLE_API_URL}?symbols=${allSymbols}`, { redirect: 'follow' });
                  if (!res.ok) throw new Error('API 連線失敗');
                  const data = await res.json();
                  
                  if (data?.quoteResponse?.result) {
                      let fxRate = 31.5;
                      const quotes = data.quoteResponse.result;
                      const fxQuote = quotes.find(q => q.symbol === 'TWD=X');
                      // 優先拿昨日收盤價 regularMarketPreviousClose
                      if (fxQuote) fxRate = fxQuote.regularMarketPreviousClose || fxQuote.regularMarketPrice || 31.5;

                      symbols.forEach(sym => {
                          const q = quotes.find(q => q.symbol === sym);
                          if (q) {
                              const price = q.regularMarketPreviousClose || q.regularMarketPrice || 0;
                              const holding = stockHoldings[sym];
                              let val = price * holding.shares;
                              // 扣除未來賣出會產生的預估稅費
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

              // 計算最終現值：總現金 + (非股票的投資本金) + 股票真實市值
              const nonStockInvest = totalInvest - ((assets.userInvestments?.userA?.stock || 0) + (assets.userInvestments?.userB?.stock || 0) + (assets.jointInvestments?.stock || 0));
              const finalNetWorth = Math.round(totalCash + nonStockInvest + stockMarketValue);

              // 寫入 Firebase 資料庫 (打卡完成！)
              setAssets({
                  ...assets,
                  dailyNetWorth: {
                      ...(assets.dailyNetWorth || {}),
                      [recordDate]: finalNetWorth
                  }
              });

          } catch (e) {
              console.error("背景快照引擎執行失敗，明日將自動重試:", e);
          } finally {
              isFetchingRef.current = false;
          }
      };

      runDailySnapshot();
  }, [hasSnapshot, stockHoldings, totalCash, totalInvest, assets, setAssets, recordDate]);

  // --- 5. 繪製「歷史與現實交織」的完美折線圖 ---
  const historyData = useMemo(() => {
      const chartDataPoints = {};
      
      // 階段一：用過去的記帳歷史 (AuditTrail) 鋪底，畫出「本金成長階梯」
      const sortedRecords = [...(assets.monthlyExpenses || [])]
          .filter(r => !r.isDeleted && r.auditTrail?.after)
          .sort((a, b) => new Date(a.timestamp || a.date) - new Date(b.timestamp || b.date));

      sortedRecords.forEach(record => {
          const state = record.auditTrail.after;
          const pastCash = (state.userA || 0) + (state.userB || 0) + (state.jointCash || 0);
          const pastInvest = sumInvestments(state.jointInvestments) + sumInvestments(state.userInvestments?.userA) + sumInvestments(state.userInvestments?.userB);
          chartDataPoints[record.date] = pastCash + pastInvest;
      });

      // 階段二：將我們每天打卡算好的「真實市值 (dailyNetWorth)」覆蓋上去
      if (assets.dailyNetWorth) {
          Object.keys(assets.dailyNetWorth).forEach(date => {
              chartDataPoints[date] = assets.dailyNetWorth[date];
          });
      }

      // 如果資料庫完全沒資料，給個初始點防呆
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
          backgroundColor: 'rgba(102, 126, 234, 0.15)', // 絕美漸層紫底色
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
          {/* 取折線圖最後一天的數字，代表最新現值 */}
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
        
        {/* 修正文字重疊：改成上下列表排列，並允許換行 */}
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

    </div>
  );
};

export default TotalOverview;