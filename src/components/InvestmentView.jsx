// src/components/InvestmentView.jsx
import React, { useState, useMemo, useEffect } from 'react';
import { MY_GOOGLE_API_URL } from '../config';

const formatMoney = (num) => "$" + Math.round(Number(num)).toLocaleString();

const InvestmentView = ({ assets }) => {
  const [activeTab, setActiveTab] = useState('jointCash'); 
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  const [livePrices, setLivePrices] = useState({});
  const [liveFx, setLiveFx] = useState(31.5); 
  const [isFetching, setIsFetching] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

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
                throw new Error("Yahoo Finance 拒絕連線，請稍後再試");
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
              if (isMounted) alert(`⚠️ 報價更新失敗：${err.message}`);
          } finally {
              if (isMounted) setIsFetching(false);
          }
      };

      fetchPrices();
      return () => { isMounted = false; };
  }, [activeTab, stockHoldings, refreshKey]);

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
          // 美股換算台幣邏輯
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
    <div className="page-transition-enter">
      <h1 className="page-title">投資部位</h1>
      
      <div style={{display:'flex', gap:'8px', marginBottom:'18px'}}>
        <button className={`glass-btn ${activeTab==='jointCash'?'':'inactive'}`} onClick={()=>setActiveTab('jointCash')} style={{flex:1, padding:'10px 0', fontSize:'0.88rem'}}>🏫 共同</button>
        <button className={`glass-btn ${activeTab==='userA'?'':'inactive'}`} onClick={()=>setActiveTab('userA')} style={{flex:1, padding:'10px 0', fontSize:'0.88rem'}}>🐶 恆恆</button>
        <button className={`glass-btn ${activeTab==='userB'?'':'inactive'}`} onClick={()=>setActiveTab('userB')} style={{flex:1, padding:'10px 0', fontSize:'0.88rem'}}>🐕 得得</button>
      </div>

      <div className="glass-card card-animate" style={{ marginBottom: '18px', textAlign: 'center', background: 'linear-gradient(135deg, rgba(88,86,214,0.85), rgba(94,158,247,0.8))', color: 'white', padding: '24px 16px', border:'none', boxShadow:'0 10px 36px rgba(88,86,214,0.2)' }}>
        <div style={{ fontSize: '0.88rem', opacity: 0.9, marginBottom: '5px' }}>{currentHistoryFilter} - 投資總市值估算 <span style={{fontSize:'0.7rem'}}>(已統一換算台幣)</span></div>
        <div style={{ fontSize: '2.2rem', fontWeight: '800', letterSpacing:'-0.02em', textShadow:'0 2px 10px rgba(0,0,0,0.15)' }}>{formatMoney(totalMarketValue)}</div>
        <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '15px', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '12px' }}>
            <div><div style={{fontSize:'0.73rem', opacity:0.8}}>投入本金(台幣)</div><div style={{fontWeight:'700', fontSize:'1rem'}}>{formatMoney(totalPrincipal)}</div></div>
            <div><div style={{fontSize:'0.73rem', opacity:0.8}}>未實現損益(台幣)</div><div style={{fontWeight:'700', fontSize:'1rem', color: totalUnrealizedProfit >= 0 ? '#ffd60a' : '#ff9a9e'}}>{totalUnrealizedProfit >= 0 ? '+' : ''}{formatMoney(totalUnrealizedProfit)}</div></div>
        </div>
      </div>

      <div className="glass-card card-animate" style={{marginBottom:'18px'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px'}}>
              <h3 style={{margin:0, fontWeight:'700'}}>📊 目前持股庫存</h3>
              <button 
                className="glass-btn" 
                onClick={() => { setRefreshKey(k => k + 1); }} 
                disabled={isFetching} 
                style={{padding:'5px 10px', fontSize:'0.78rem'}}
              >
                  {isFetching ? '🔄 載入中...' : '🔄 更新報價'}
              </button>
          </div>
          {lastUpdated && <div style={{fontSize:'0.73rem', color:'var(--text-tertiary)', textAlign:'right', marginBottom:'10px'}}>最後更新: {lastUpdated} (USD/TWD: {liveFx.toFixed(2)})</div>}

          {holdingList.length === 0 ? (
              <div style={{textAlign:'center', color:'var(--text-tertiary)', padding:'12px', fontSize:'0.9rem'}}>目前沒有持股</div>
          ) : (
              holdingList.map((h, idx) => (
                  <div key={idx} style={{display:'flex', justifyContent:'space-between', padding:'12px 0', borderBottom:'0.5px solid rgba(0,0,0,0.04)'}}>
                      <div>
                          <div style={{fontWeight:'700', color:'var(--text-primary)', fontSize:'1.05rem'}}>{h.sym}</div>
                          <div style={{fontSize:'0.78rem', color:'var(--text-secondary)'}}>庫存: <span style={{fontWeight:'600'}}>{h.shares}</span> 股</div>
                          <div style={{fontSize:'0.73rem', color:'var(--text-tertiary)'}}>
                              台幣均價: {formatMoney(h.avgCost)} <br/>
                              現價: <span style={{color: h.market==='US'?'var(--accent-orange)':'var(--text-primary)', fontWeight: h.market==='US'?'600':'400'}}>{h.market==='US'?'USD $':''}{h.currentPrice.toFixed(2)}</span>
                          </div>
                      </div>
                      <div style={{textAlign:'right'}}>
                          <div style={{fontWeight:'700', fontSize:'1.05rem', color:'var(--text-primary)'}}>{formatMoney(h.marketValue)}</div>
                          <div style={{fontSize:'0.82rem', fontWeight:'700', color: h.profit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}}>
                              {h.profit >= 0 ? '▲' : '▼'} {formatMoney(Math.abs(h.profit))} ({h.profitPercent.toFixed(1)}%)
                          </div>
                          {h.market === 'US' && <div style={{fontSize:'0.68rem', color:'var(--text-tertiary)'}}>*已依匯率 {liveFx.toFixed(2)} 換算</div>}
                      </div>
                  </div>
              ))
          )}

          <div style={{marginTop:'15px', paddingTop:'15px', borderTop:'0.5px solid rgba(0,0,0,0.06)'}}>
              <h4 style={{margin:'0 0 10px 0', color:'var(--text-secondary)', fontSize:'0.88rem', fontWeight:'600'}}>非股票資產 (依系統登錄台幣本金)</h4>
              <div style={{display:'flex', justifyContent:'space-between', fontSize:'0.84rem', color:'var(--text-secondary)', marginBottom:'5px'}}><span>基金</span><span style={{fontWeight:'600'}}>{formatMoney(currentData.fund || 0)}</span></div>
              <div style={{display:'flex', justifyContent:'space-between', fontSize:'0.84rem', color:'var(--text-secondary)', marginBottom:'5px'}}><span>定存</span><span style={{fontWeight:'600'}}>{formatMoney(currentData.deposit || 0)}</span></div>
              <div style={{display:'flex', justifyContent:'space-between', fontSize:'0.84rem', color:'var(--text-secondary)'}}><span>其他</span><span style={{fontWeight:'600'}}>{formatMoney(currentData.other || 0)}</span></div>
          </div>
      </div>

      <div className="glass-card card-animate" style={{ marginBottom: '18px' }}>
          <h3 style={{marginTop:0, marginBottom:'15px', fontWeight:'700'}}>📜 歷史交易紀錄</h3>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '15px' }}>
              <input type="date" value={dateRange.start} onChange={(e) => setDateRange(prev => ({...prev, start: e.target.value}))} className="glass-input" style={{margin:0, padding:'5px 8px', flex:1, minWidth:'110px', fontSize:'0.82rem'}} />
              <span style={{color:'var(--text-tertiary)', fontSize:'0.82rem'}}>至</span>
              <input type="date" value={dateRange.end} onChange={(e) => setDateRange(prev => ({...prev, end: e.target.value}))} className="glass-input" style={{margin:0, padding:'5px 8px', flex:1, minWidth:'110px', fontSize:'0.82rem'}} />
              <button onClick={() => setDateRange({ start: '', end: '' })} className="glass-btn" style={{padding:'5px 10px', fontSize:'0.78rem'}}>清除</button>
          </div>

          {filteredHistory.length === 0 ? (
              <div style={{textAlign:'center', color:'var(--text-tertiary)', padding:'20px', fontSize:'0.9rem'}}>此區間尚無投資紀錄</div>
          ) : (
              filteredHistory.map((r, idx) => {
                  let actionSign = ''; let amountColor = 'var(--text-primary)'; let amountStr = formatMoney(r.total);
                  
                  if (r.type.includes('buy')) { actionSign = '買入'; amountColor = 'var(--accent-purple)'; amountStr = '-' + amountStr; } 
                  else if (r.type.includes('sell')) { actionSign = '賣出'; amountColor = 'var(--accent-yellow)'; amountStr = '+' + amountStr; } 
                  else if (r.type.includes('profit')) { actionSign = '當沖賺'; amountColor = 'var(--accent-orange)'; amountStr = '+' + amountStr; } 
                  else if (r.type.includes('loss')) { actionSign = '當沖賠'; amountColor = 'var(--text-tertiary)'; amountStr = '-' + amountStr; }

                  let profitStr = '';
                  if (r.type.includes('sell')) {
                      const p = (Number(r.total) || 0) - (Number(r.principal) || Number(r.total));
                      if (p !== 0) profitStr = p > 0 ? `(賺 ${formatMoney(p)})` : `(賠 ${formatMoney(Math.abs(p))})`;
                  }

                  return (
                      <div key={idx} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'0.5px solid rgba(0,0,0,0.04)'}}>
                          <div>
                              <div style={{fontSize:'0.78rem', color:'var(--text-tertiary)'}}>{r.date || r.month}</div>
                              <div style={{fontWeight:'600', color:'var(--text-primary)'}}>{r.note} <span style={{fontSize:'0.73rem', color:'var(--text-tertiary)', fontWeight:'400'}}>({actionSign})</span></div>
                              {r.symbol && <div style={{fontSize:'0.73rem', color:'var(--accent-blue)', marginTop:'2px'}}>{r.symbol} | {r.shares}股</div>}
                          </div>
                          <div style={{textAlign:'right'}}>
                              <div style={{fontWeight:'700', fontSize:'1.05rem', color: amountColor}}>{amountStr}</div>
                              {r.usdAmount && <div style={{fontSize:'0.73rem', color:'var(--accent-orange)', fontWeight:'600'}}>(含美金 ${r.usdAmount.toFixed(2)})</div>}
                              {profitStr && <div style={{fontSize:'0.73rem', color: profitStr.includes('賺') ? 'var(--accent-green)' : 'var(--accent-red)'}}>{profitStr}</div>}
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