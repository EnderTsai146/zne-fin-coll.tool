// src/components/InvestmentView.jsx
import React, { useState, useMemo, useEffect } from 'react';

const formatMoney = (num) => "$" + Math.round(Number(num)).toLocaleString();

// 🚀 你的專屬 Google API
const MY_GOOGLE_API_URL = "https://script.google.com/macros/s/AKfycbwK8pr2bfUqC6GnLYwYerjiS_wtt5sk_ZJD4A-xKR2ACA2v64aYXNeRyu1qp1uVRWTdzg/exec";

const InvestmentView = ({ assets }) => {
  const [activeTab, setActiveTab] = useState('jointCash'); 
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  const [livePrices, setLivePrices] = useState({});
  const [liveFx, setLiveFx] = useState(31.5); 
  const [isFetching, setIsFetching] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');

  const history = assets.monthlyExpenses || [];
  const safeJoint = assets.jointInvestments || { stock: 0, fund: 0, deposit: 0, other: 0 };
  const safeUserA = assets.userInvestments?.userA || { stock: 0, fund: 0, deposit: 0, other: 0 };
  const safeUserB = assets.userInvestments?.userB || { stock: 0, fund: 0, deposit: 0, other: 0 };

  const currentData = activeTab === 'jointCash' ? safeJoint : (activeTab === 'userA' ? safeUserA : safeUserB);
  const currentHistoryFilter = activeTab === 'jointCash' ? '共同帳戶' : (activeTab === 'userA' ? '恆恆' : '得得');

  const stockHoldings = useMemo(() => {
      const holdings = {};
      history.filter(r => !r.isDeleted && r.payer && r.payer.includes(currentHistoryFilter)).forEach(r => {
          if (!r.symbol) return;
          const sym = r.symbol;
          if (!holdings[sym]) holdings[sym] = { shares: 0, market: r.market || 'TW', buyCost: 0, sellRevenue: 0 };
          
          if (r.type.includes('buy')) {
              holdings[sym].shares += (Number(r.shares) || 0);
              holdings[sym].buyCost += (Number(r.total) || 0);
          } else if (r.type.includes('sell')) {
              holdings[sym].shares -= (Number(r.shares) || 0);
              holdings[sym].sellRevenue += (Number(r.total) || 0);
          }
      });
      // 移除已經賣光且沒有賺賠紀錄的幽靈股票
      Object.keys(holdings).forEach(k => { 
        if (holdings[k].shares <= 0 && holdings[k].buyCost === 0 && holdings[k].sellRevenue === 0) {
          delete holdings[k]; 
        }
      });
      return holdings;
  }, [history, currentHistoryFilter]);

  // ★ 股價獲取引擎 (加入安全鎖與錯誤提示)
  useEffect(() => {
      let isMounted = true;
      const fetchPrices = async () => {
          const symbols = Object.keys(stockHoldings).filter(sym => stockHoldings[sym].shares > 0);
          if (symbols.length === 0) return;
          
          setIsFetching(true);
          try {
              const allSymbols = [...symbols, 'TWD=X'].join(',');
              const res = await fetch(`${MY_GOOGLE_API_URL}?symbols=${allSymbols}`, { redirect: 'follow' });
              
              if (!res.ok) throw new Error('無法連線到 Google 伺服器');
              const data = await res.json();
              
              if (data.error) {
                console.error("API 回傳錯誤:", data.error);
                throw new Error("Yahoo Finance 拒絕連線");
              }
              
              if (data && data.quoteResponse && data.quoteResponse.result) {
                  const newPrices = {};
                  let fxRate = 31.5;
                  
                  data.quoteResponse.result.forEach(q => {
                      if (q.symbol === 'TWD=X') {
                          fxRate = q.regularMarketPreviousClose || q.regularMarketPrice || 31.5;
                          if (isMounted) setLiveFx(fxRate);
                      } else {
                          newPrices[q.symbol] = q.regularMarketPreviousClose || q.regularMarketPrice || 0;
                      }
                  });
                  if (isMounted) {
                      setLivePrices(newPrices);
                      const now = new Date();
                      setLastUpdated(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`);
                  }
              }
          } catch (err) {
              console.error("股價更新失敗:", err);
              // 如果錯誤，不再讓它卡在載入中
          } finally {
              if (isMounted) setIsFetching(false);
          }
      };

      fetchPrices();
      return () => { isMounted = false; };
  }, [activeTab, stockHoldings]);

  // 計算現值與損益
  let stockMarketValue = 0;
  let totalUnrealizedProfit = 0;
  
  const holdingList = Object.keys(stockHoldings).map(sym => {
      const holding = stockHoldings[sym];
      if (holding.shares <= 0) return null;
      
      const currentPrice = livePrices[sym] || 0;
      let valTwd = currentPrice * holding.shares;
      
      if (holding.market === 'TW') {
          const fee = Math.max(20, Math.floor(valTwd * 0.001425 * 0.6));
          const tax = Math.floor(valTwd * 0.003);
          valTwd = valTwd - fee - tax;
      } else {
          const feeUsd = valTwd * 0.001;
          valTwd = (valTwd - feeUsd) * liveFx;
      }
      
      stockMarketValue += valTwd;
      
      const avgCost = holding.shares > 0 ? holding.buyCost / holding.shares : 0;
      const profit = valTwd - holding.buyCost;
      totalUnrealizedProfit += profit;
      const profitPercent = holding.buyCost > 0 ? (profit / holding.buyCost) * 100 : 0;

      return {
          sym,
          shares: holding.shares,
          avgCost: avgCost,
          currentPrice: currentPrice,
          marketValue: valTwd,
          profit: profit,
          profitPercent: profitPercent,
          market: holding.market
      };
  }).filter(Boolean);

  const nonStockInvest = (currentData.fund || 0) + (currentData.deposit || 0) + (currentData.other || 0);
  const totalMarketValue = nonStockInvest + stockMarketValue;
  const totalPrincipal = (currentData.stock || 0) + (currentData.fund || 0) + (currentData.deposit || 0) + (currentData.other || 0);

  const filteredHistory = history.filter(r => {
      if (r.isDeleted) return false;
      const isTarget = r.payer && r.payer.includes(currentHistoryFilter);
      const isInvestType = ['liquidate', 'joint_invest_buy', 'joint_invest_sell', 'personal_invest_profit', 'personal_invest_loss', 'personal_invest_buy', 'personal_invest_sell'].includes(r.type);
      if (!isTarget || !isInvestType) return false;
      if (dateRange.start && (r.date || r.month) < dateRange.start) return false;
      if (dateRange.end && (r.date || r.month) > dateRange.end) return false;
      return true;
  }).reverse();

  return (
    <div style={{animation: 'fadeIn 0.5s'}}>
      <h1 className="page-title">投資部位</h1>
      
      <div style={{display:'flex', gap:'10px', marginBottom:'20px'}}>
        <button className={`glass-btn ${activeTab==='jointCash'?'':'inactive'}`} onClick={()=>setActiveTab('jointCash')} style={{flex:1, padding:'8px 0'}}>🏫 共同</button>
        <button className={`glass-btn ${activeTab==='userA'?'':'inactive'}`} onClick={()=>setActiveTab('userA')} style={{flex:1, padding:'8px 0'}}>🐶 恆恆</button>
        <button className={`glass-btn ${activeTab==='userB'?'':'inactive'}`} onClick={()=>setActiveTab('userB')} style={{flex:1, padding:'8px 0'}}>🐕 得得</button>
      </div>

      <div className="glass-card" style={{ marginBottom: '20px', textAlign: 'center', background: 'linear-gradient(135deg, #a8e6cf 0%, #dcedc1 100%)', padding: '20px 15px' }}>
        <div style={{ fontSize: '0.9rem', color: '#555', marginBottom: '5px' }}>{currentHistoryFilter} - 投資總市值估算</div>
        <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: '#2c3e50' }}>{formatMoney(totalMarketValue)}</div>
        <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '15px', borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '10px' }}>
            <div><div style={{fontSize:'0.75rem', color:'#666'}}>投入本金</div><div style={{fontWeight:'bold', color:'#333'}}>{formatMoney(totalPrincipal)}</div></div>
            <div><div style={{fontSize:'0.75rem', color:'#666'}}>未實現損益</div><div style={{fontWeight:'bold', color: totalUnrealizedProfit >= 0 ? '#27ae60' : '#e74c3c'}}>{totalUnrealizedProfit >= 0 ? '+' : ''}{formatMoney(totalUnrealizedProfit)}</div></div>
        </div>
      </div>

      <div className="glass-card" style={{marginBottom:'20px'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px'}}>
              <h3 style={{margin:0, color:'#555'}}>📊 目前持股庫存</h3>
              <button 
                className="glass-btn" 
                onClick={() => {
                   setIsFetching(true);
                   setTimeout(() => setActiveTab(prev => prev), 100); 
                }} 
                disabled={isFetching} 
                style={{padding:'4px 8px', fontSize:'0.8rem', background:'#f0f0f0', color:'#333', border:'none'}}
              >
                  {isFetching ? '🔄 載入中...' : '🔄 更新報價'}
              </button>
          </div>
          {lastUpdated && <div style={{fontSize:'0.75rem', color:'#888', textAlign:'right', marginBottom:'10px'}}>最後更新: {lastUpdated} (USD/TWD: {liveFx.toFixed(2)})</div>}

          {holdingList.length === 0 ? (
              <div style={{textAlign:'center', color:'#888', padding:'10px'}}>目前沒有持股</div>
          ) : (
              holdingList.map((h, idx) => (
                  <div key={idx} style={{display:'flex', justifyContent:'space-between', padding:'12px 0', borderBottom:'1px solid #eee'}}>
                      <div>
                          <div style={{fontWeight:'bold', color:'#333', fontSize:'1.1rem'}}>{h.sym}</div>
                          <div style={{fontSize:'0.8rem', color:'#666'}}>庫存: <span style={{fontWeight:'bold'}}>{h.shares}</span> 股</div>
                          <div style={{fontSize:'0.75rem', color:'#888'}}>均價: {formatMoney(h.avgCost)} | 現價: {h.market==='US'?'$':''}{h.currentPrice.toFixed(2)}</div>
                      </div>
                      <div style={{textAlign:'right'}}>
                          <div style={{fontWeight:'bold', fontSize:'1.1rem', color:'#2c3e50'}}>{formatMoney(h.marketValue)}</div>
                          <div style={{fontSize:'0.85rem', fontWeight:'bold', color: h.profit >= 0 ? '#27ae60' : '#e74c3c'}}>
                              {h.profit >= 0 ? '▲' : '▼'} {formatMoney(Math.abs(h.profit))} ({h.profitPercent.toFixed(1)}%)
                          </div>
                      </div>
                  </div>
              ))
          )}

          <div style={{marginTop:'15px', paddingTop:'15px', borderTop:'2px dashed #ddd'}}>
              <h4 style={{margin:'0 0 10px 0', color:'#666', fontSize:'0.9rem'}}>非股票資產 (依系統登錄本金)</h4>
              <div style={{display:'flex', justifyContent:'space-between', fontSize:'0.85rem', color:'#555', marginBottom:'5px'}}><span>基金</span><span>{formatMoney(currentData.fund || 0)}</span></div>
              <div style={{display:'flex', justifyContent:'space-between', fontSize:'0.85rem', color:'#555', marginBottom:'5px'}}><span>定存</span><span>{formatMoney(currentData.deposit || 0)}</span></div>
              <div style={{display:'flex', justifyContent:'space-between', fontSize:'0.85rem', color:'#555'}}><span>其他</span><span>{formatMoney(currentData.other || 0)}</span></div>
          </div>
      </div>

      <div className="glass-card" style={{ marginBottom: '20px' }}>
          <h3 style={{marginTop:0, marginBottom:'15px', color:'#555'}}>📜 歷史交易紀錄</h3>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '15px' }}>
              <input type="date" value={dateRange.start} onChange={(e) => setDateRange(prev => ({...prev, start: e.target.value}))} className="glass-input" style={{margin:0, padding:'4px 8px', flex:1, minWidth:'110px', fontSize:'0.8rem'}} />
              <span style={{color:'#888', fontSize:'0.8rem'}}>至</span>
              <input type="date" value={dateRange.end} onChange={(e) => setDateRange(prev => ({...prev, end: e.target.value}))} className="glass-input" style={{margin:0, padding:'4px 8px', flex:1, minWidth:'110px', fontSize:'0.8rem'}} />
              <button onClick={() => setDateRange({ start: '', end: '' })} className="glass-btn" style={{padding:'4px 10px', fontSize:'0.8rem', background: '#fff', color:'#333', border:'1px solid #ccc'}}>清除</button>
          </div>

          {filteredHistory.length === 0 ? (
              <div style={{textAlign:'center', color:'#888', padding:'20px'}}>此區間尚無投資紀錄</div>
          ) : (
              filteredHistory.map((r, idx) => {
                  let actionSign = ''; let amountColor = '#333'; let amountStr = formatMoney(r.total);
                  
                  if (r.type.includes('buy')) { actionSign = '買入'; amountColor = '#8e44ad'; amountStr = '-' + amountStr; } 
                  else if (r.type.includes('sell')) { actionSign = '賣出'; amountColor = '#f1c40f'; amountStr = '+' + amountStr; } 
                  else if (r.type.includes('profit')) { actionSign = '當沖賺'; amountColor = '#e67e22'; amountStr = '+' + amountStr; } 
                  else if (r.type.includes('loss')) { actionSign = '當沖賠'; amountColor = '#7f8c8d'; amountStr = '-' + amountStr; }

                  let profitStr = '';
                  if (r.type.includes('sell')) {
                      const p = (Number(r.total) || 0) - (Number(r.principal) || Number(r.total));
                      if (p !== 0) profitStr = p > 0 ? `(賺 ${formatMoney(p)})` : `(賠 ${formatMoney(Math.abs(p))})`;
                  }

                  return (
                      <div key={idx} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px dashed #eee'}}>
                          <div>
                              <div style={{fontSize:'0.8rem', color:'#888'}}>{r.date || r.month}</div>
                              <div style={{fontWeight:'bold', color:'#444'}}>{r.note} <span style={{fontSize:'0.75rem', color:'#888', fontWeight:'normal'}}>({actionSign})</span></div>
                              {r.symbol && <div style={{fontSize:'0.75rem', color:'#3498db', marginTop:'2px'}}>{r.symbol} | {r.shares}股</div>}
                          </div>
                          <div style={{textAlign:'right'}}>
                              <div style={{fontWeight:'bold', fontSize:'1.1rem', color: amountColor}}>{amountStr}</div>
                              {profitStr && <div style={{fontSize:'0.75rem', color: profitStr.includes('賺') ? '#2ecc71' : '#e74c3c'}}>{profitStr}</div>}
                          </div>
                      </div>
                  );
              })
          )}
      </div>
    </div>
  );
};

export default InvestmentView;