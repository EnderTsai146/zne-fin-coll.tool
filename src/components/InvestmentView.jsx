// src/components/InvestmentView.jsx
import React, { useState, useMemo, useEffect } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

const formatMoney = (num) => "$" + Math.round(Number(num)).toLocaleString();

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
  const accountName = activeTab === 'jointCash' ? '🏫 共同投資' : (activeTab === 'userA' ? '🐶 恆恆個人' : '🐕 得得個人');
  
  const totalPrincipal = Object.values(currentData).reduce((a, b) => a + b, 0);

  const accountHistory = useMemo(() => {
      return history.filter(r => {
          if (r.isDeleted === true) return false;
          if (activeTab === 'jointCash') {
              return r.type === 'joint_invest_buy' || r.type === 'joint_invest_sell';
          } else {
              const payerName = activeTab === 'userA' ? '恆恆' : '得得';
              return (r.accountKey === activeTab && r.type.includes('personal_invest_')) ||
                     (r.payer && r.payer.includes(payerName) && (r.type === 'personal_invest_profit' || r.type === 'personal_invest_loss'));
          }
      });
  }, [history, activeTab]);

  const filteredHistory = useMemo(() => {
      return accountHistory.filter(r => {
          const rDate = r.date || `${r.month}-01`;
          if (dateRange.start && rDate < dateRange.start) return false;
          if (dateRange.end && rDate > dateRange.end) return false;
          return true;
      });
  }, [accountHistory, dateRange]);

  const realizedProfit = useMemo(() => {
      return filteredHistory.reduce((sum, r) => {
          if (r.type.includes('sell')) return sum + ((Number(r.total) || 0) - (Number(r.principal) || Number(r.total)));
          if (r.type === 'personal_invest_profit') return sum + (Number(r.total) || 0);
          if (r.type === 'personal_invest_loss') return sum - (Number(r.total) || 0);
          return sum;
      }, 0);
  }, [filteredHistory]);

  const stockHoldings = useMemo(() => {
      const holdings = {};
      accountHistory.forEach(r => {
          if (!r.symbol) return; 
          const sym = r.symbol;
          if (!holdings[sym]) holdings[sym] = { shares: 0, totalCost: 0, market: r.market || 'TW' };

          if (r.type.includes('buy')) {
              holdings[sym].shares += (Number(r.shares) || 0);
              holdings[sym].totalCost += (Number(r.total) || 0); 
              holdings[sym].market = r.market || 'TW';
          } else if (r.type.includes('sell')) {
              holdings[sym].shares -= (Number(r.shares) || 0);
              holdings[sym].totalCost -= (Number(r.principal) || 0); 
          }
      });
      Object.keys(holdings).forEach(k => { if (holdings[k].shares <= 0) delete holdings[k]; });
      return holdings;
  }, [accountHistory]);

  const holdingSymbols = Object.keys(stockHoldings);

  // ★ 核心大升級：相容性 100% 的批次查詢與超強防護罩
  const fetchLivePrices = async () => {
      if (holdingSymbols.length === 0) return;
      setIsFetching(true);
      
      const allSymbols = [...holdingSymbols, 'TWD=X'].join(',');
      const yahooUrl = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${allSymbols}`;

      // 🛡️ 自建 100% 相容的 Timeout 機制，取代會讓舊手機崩潰的 AbortSignal
      const fetchWithTimeout = (resource, timeout = 6000) => {
          return Promise.race([
              fetch(resource),
              new Promise((_, reject) => setTimeout(() => reject(new Error('連線逾時')), timeout))
          ]);
      };

      // 擴充至 4 條代理伺服器通道
      const proxies = [
          (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
          (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
          (url) => `https://thingproxy.freeboard.io/fetch/${url}`,
          (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
      ];

      let successData = null;

      for (const proxy of proxies) {
          try {
              const targetUrl = proxy(yahooUrl);
              const res = await fetchWithTimeout(targetUrl, 6000); 
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              
              const data = await res.json();
              if (data?.quoteResponse?.result) {
                  successData = data.quoteResponse.result;
                  break; // 只要有一條通道成功，立刻跳出迴圈
              }
          } catch (err) {
              console.warn("Proxy 切換中...", err.message); // 靜默切換，不打擾使用者
          }
      }

      const newPrices = { ...livePrices };
      let newFx = liveFx;

      if (successData) {
          successData.forEach(quote => {
              if (quote.symbol === 'TWD=X') {
                  newFx = quote.regularMarketPrice || liveFx;
              } else {
                  newPrices[quote.symbol] = quote.regularMarketPrice;
              }
          });

          holdingSymbols.forEach(sym => {
              if (newPrices[sym] === undefined) newPrices[sym] = -1;
          });

          setLiveFx(newFx);
          setLivePrices(newPrices);
          const now = new Date();
          setLastUpdated(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`);
      } else {
          // 🛡️ 溫柔降級：全部失敗時，只標示 -1，【不再跳出 Alert 視窗】
          holdingSymbols.forEach(sym => { if (!newPrices[sym]) newPrices[sym] = -1; });
          setLivePrices(newPrices);
          console.error("📡 網路連線或 API 伺服器暫時無法使用");
      }

      setIsFetching(false);
  };

  useEffect(() => {
      if (holdingSymbols.length > 0) fetchLivePrices();
      // eslint-disable-next-line
  }, [activeTab]);

  let totalUnrealizedPnL = 0;

  const renderHoldings = () => {
      if (holdingSymbols.length === 0) return <div style={{textAlign:'center', color:'#888', padding:'20px'}}>目前沒有庫存股票喔！</div>;

      return holdingSymbols.map(sym => {
          const holding = stockHoldings[sym];
          const currentPrice = livePrices[sym] || 0;
          let currentValue = 0;

          if (currentPrice > 0) {
              const baseValue = currentPrice * holding.shares;
              if (holding.market === 'TW') {
                  const fee = Math.max(20, Math.floor(baseValue * 0.001425 * 0.6));
                  const tax = Math.floor(baseValue * 0.003);
                  currentValue = baseValue - (fee + tax);
              } else {
                  const feeUsd = baseValue * 0.001;
                  currentValue = (baseValue - feeUsd) * liveFx;
              }
          }

          const pnl = currentValue > 0 ? (currentValue - holding.totalCost) : 0;
          const roi = holding.totalCost > 0 ? ((pnl / holding.totalCost) * 100).toFixed(2) : 0;
          
          totalUnrealizedPnL += pnl;

          const isProfit = pnl >= 0;
          const borderColor = currentPrice === -1 ? '#f39c12' : (isProfit ? '#2ecc71' : '#e74c3c');

          return (
              <div key={sym} className="glass-card" style={{ marginBottom:'10px', padding:'12px', borderLeft: `4px solid ${borderColor}` }}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                      <div>
                          <div style={{fontWeight:'bold', fontSize:'1.1rem', color:'#333'}}>{sym} <span style={{fontSize:'0.7rem', color:'#fff', background: holding.market === 'TW' ? '#3498db' : '#9b59b6', padding:'2px 6px', borderRadius:'10px'}}>{holding.market}</span></div>
                          <div style={{fontSize:'0.8rem', color:'#666'}}>
                              {holding.shares} 股 | 總成本 {formatMoney(holding.totalCost)}
                          </div>
                      </div>
                      <div style={{textAlign:'right'}}>
                          <div style={{fontSize:'0.85rem', color:'#888'}}>
                              現價: <span style={{fontWeight:'bold', color:'#333'}}>
                                  {currentPrice > 0 
                                      ? (holding.market === 'US' ? `$${currentPrice.toFixed(2)} (USD)` : `$${currentPrice.toFixed(2)}`) 
                                      : (currentPrice === -1 ? '⚠️ 暫無法取得' : '載入中...')}
                              </span>
                          </div>
                          {currentPrice > 0 && (
                              <div style={{fontWeight:'bold', color: isProfit ? '#2ecc71' : '#e74c3c', fontSize:'1.1rem'}}>
                                  {isProfit ? '+' : ''}{formatMoney(pnl)} <span style={{fontSize:'0.8rem'}}>({isProfit ? '+' : ''}{roi}%)</span>
                              </div>
                          )}
                      </div>
                  </div>
              </div>
          );
      });
  };

  const chartData = {
      labels: ['股票', '基金', '定存', '其他'],
      datasets: [{
          data: [currentData.stock, currentData.fund, currentData.deposit, currentData.other],
          backgroundColor: ['#ff9f43', '#54a0ff', '#2ecc71', '#c8d6e5'],
          borderWidth: 0, hoverOffset: 4
      }]
  };

  const isAllTime = !dateRange.start && !dateRange.end;
  const displayHistory = isAllTime ? [...filteredHistory].reverse().slice(0, 30) : [...filteredHistory].reverse(); 

  return (
    <div style={{animation: 'fadeIn 0.5s'}}>
      <h1 className="page-title">投資戰情室</h1>

      <div style={{display:'flex', gap:'10px', marginBottom:'20px'}}>
        <button className={`glass-btn ${activeTab==='jointCash'?'':'inactive'}`} onClick={()=>setActiveTab('jointCash')} style={{flex:1, padding:'8px 0'}}>🏫 共同</button>
        <button className={`glass-btn ${activeTab==='userA'?'':'inactive'}`} onClick={()=>setActiveTab('userA')} style={{flex:1, padding:'8px 0'}}>🐶 恆恆</button>
        <button className={`glass-btn ${activeTab==='userB'?'':'inactive'}`} onClick={()=>setActiveTab('userB')} style={{flex:1, padding:'8px 0'}}>🐕 得得</button>
      </div>

      <h3 style={{color:'#555', margin:'0 0 15px 0', textAlign:'center'}}>{accountName} 的資產現況</h3>

      <div style={{display:'flex', gap:'10px', marginBottom:'20px'}}>
          <div className="glass-card" style={{flex:1, textAlign:'center', padding:'15px'}}>
              <div style={{fontSize:'0.85rem', color:'#888', marginBottom:'5px'}}>目前投入本金</div>
              <div style={{fontSize:'1.5rem', fontWeight:'bold', color:'#34495e'}}>{formatMoney(totalPrincipal)}</div>
          </div>
          <div className="glass-card" style={{flex:1, textAlign:'center', padding:'15px', background: realizedProfit >= 0 ? 'rgba(46, 204, 113, 0.1)' : 'rgba(231, 76, 60, 0.1)', border: realizedProfit >= 0 ? '1px solid #2ecc71' : '1px solid #e74c3c'}}>
              <div style={{fontSize:'0.85rem', color: realizedProfit >= 0 ? '#27ae60' : '#c0392b', marginBottom:'5px'}}>{isAllTime ? '累計已實現損益' : '區間已實現損益'}</div>
              <div style={{fontSize:'1.5rem', fontWeight:'bold', color: realizedProfit >= 0 ? '#2ecc71' : '#e74c3c'}}>
                  {realizedProfit > 0 ? '+' : ''}{formatMoney(realizedProfit)}
              </div>
          </div>
      </div>

      <div className="glass-card" style={{marginBottom:'20px', background: 'linear-gradient(to bottom, #f8f9fa, #eef2f3)'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px'}}>
              <h3 style={{margin:0, color:'#2c3e50', display:'flex', alignItems:'center', gap:'5px'}}>
                  📡 即時庫存戰情 
              </h3>
              <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                  {lastUpdated && <span style={{fontSize:'0.75rem', color:'#888'}}>更新: {lastUpdated}</span>}
                  <button onClick={fetchLivePrices} disabled={isFetching || holdingSymbols.length === 0} style={{background: isFetching ? '#ccc' : '#3498db', color:'white', border:'none', padding:'4px 10px', borderRadius:'12px', fontSize:'0.8rem', cursor: isFetching ? 'wait' : 'pointer'}}>
                      {isFetching ? '抓取中...' : '🔄 更新'}
                  </button>
              </div>
          </div>

          {renderHoldings()}

          {holdingSymbols.length > 0 && (
             <div style={{marginTop:'15px', paddingTop:'15px', borderTop:'1px dashed #ccc', textAlign:'right'}}>
                <span style={{fontSize:'0.85rem', color:'#666'}}>預估總未實現損益 (已扣元大稅費)：</span>
                <span style={{fontWeight:'bold', fontSize:'1.2rem', color: totalUnrealizedPnL >= 0 ? '#2ecc71' : '#e74c3c', marginLeft:'10px'}}>
                    {totalUnrealizedPnL > 0 ? '+' : ''}{formatMoney(totalUnrealizedPnL)}
                </span>
             </div>
          )}
      </div>

      {totalPrincipal > 0 && (
          <div className="glass-card" style={{marginBottom:'20px', display:'flex', flexWrap:'wrap', alignItems:'center'}}>
              <div style={{flex:1, minWidth:'150px', height:'150px', display:'flex', justifyContent:'center'}}>
                  <Doughnut data={chartData} options={{ maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } }} />
              </div>
              <div style={{flex:1, minWidth:'150px', padding:'10px'}}>
                  {['stock', 'fund', 'deposit', 'other'].map((type, idx) => {
                      const colors = ['#ff9f43', '#54a0ff', '#2ecc71', '#c8d6e5'];
                      const labels = ['股票', '基金', '定存', '其他'];
                      const val = currentData[type];
                      if (val === 0) return null;
                      const percentage = ((val / totalPrincipal) * 100).toFixed(1);
                      return (
                          <div key={type} style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px'}}>
                              <div style={{display:'flex', alignItems:'center', gap:'8px'}}><div style={{width:'12px', height:'12px', borderRadius:'50%', background:colors[idx]}}></div><span style={{fontWeight:'bold', color:'#555', fontSize:'0.9rem'}}>{labels[idx]}</span></div>
                              <div style={{fontWeight:'bold', color:'#333', fontSize:'0.9rem'}}>{formatMoney(val)}</div>
                          </div>
                      );
                  })}
              </div>
          </div>
      )}

      <div className="glass-card" style={{ padding: '12px 15px', marginBottom: '20px', borderLeft: '5px solid #3498db' }}>
          <div style={{color:'#555', fontWeight:'bold', marginBottom:'8px', fontSize:'0.9rem'}}>🔍 歷史買賣區間</div>
          <div style={{display:'flex', flexWrap:'wrap', gap:'8px', alignItems:'center'}}>
              <input type="date" value={dateRange.start} onChange={(e) => setDateRange(prev => ({...prev, start: e.target.value}))} className="glass-input" style={{margin:0, padding:'6px 10px', flex:1, minWidth:'110px', fontSize:'0.85rem'}} />
              <span style={{color:'#888', fontSize:'0.85rem'}}>至</span>
              <input type="date" value={dateRange.end} onChange={(e) => setDateRange(prev => ({...prev, end: e.target.value}))} className="glass-input" style={{margin:0, padding:'6px 10px', flex:1, minWidth:'110px', fontSize:'0.85rem'}} />
              <button onClick={() => setDateRange({ start: '', end: '' })} className="glass-btn" style={{padding:'6px 12px', fontSize:'0.85rem', background: isAllTime ? '#e2e8f0' : '#fff', color:'#333', border:'1px solid #ccc'}}>清除</button>
          </div>
      </div>

      <div className="glass-card" style={{marginBottom:'20px'}}>
          <h3 style={{marginTop:0, marginBottom:'15px', fontSize:'1.1rem', color:'#555', borderBottom:'1px solid #eee', paddingBottom:'10px'}}>{isAllTime ? '📝 近期買賣紀錄' : '📝 區間買賣紀錄'}</h3>
          {displayHistory.length === 0 ? (
              <div style={{textAlign:'center', color:'#888', padding:'20px'}}>{isAllTime ? '尚無交易紀錄' : '在這個時間範圍內沒有買賣紀錄喔！'}</div>
          ) : (
              displayHistory.map((r, idx) => {
                  let actionSign = ''; let amountStr = ''; let amountColor = '#333';
                  
                  if (r.type.includes('buy')) { actionSign = '買入'; amountStr = `-${formatMoney(r.total)}`; amountColor = '#1d1d1f'; } 
                  else if (r.type.includes('sell') || r.type === 'liquidate') { actionSign = '變現'; amountStr = `+${formatMoney(r.total)}`; amountColor = '#2ecc71'; } 
                  else if (r.type.includes('profit')) { actionSign = '當沖獲利'; amountStr = `+${formatMoney(r.total)}`; amountColor = '#2ecc71'; } 
                  else if (r.type.includes('loss')) { actionSign = '當沖虧損'; amountStr = `-${formatMoney(r.total)}`; amountColor = '#e74c3c'; }

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