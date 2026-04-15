// src/components/InvestmentView.jsx
import React, { useState, useMemo, useEffect } from 'react';
import { MY_GOOGLE_API_URL } from '../config';

const formatMoney = (num) => "$" + Math.round(Number(num)).toLocaleString();
const formatUsd = (num) => `$${Number(num).toFixed(2)}`;

const InvestmentView = ({ assets }) => {
  const [activeTab, setActiveTab] = useState('jointCash'); 
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [expandedSymbol, setExpandedSymbol] = useState(null);

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

  // ★ 修正核心：使用 FIFO 計算正確的持倉成本（含歸檔基底支援）
  const stockHoldings = useMemo(() => {
      const holdings = {};
      // ★ 先載入歸檔紀錄累積的持股基底
      if (assets.currentStockHoldings) {
          Object.entries(assets.currentStockHoldings).forEach(([key, data]) => {
              let owner = '共同帳戶';
              let actualSym = key;
              
              if (key.includes('_')) {
                  const parts = key.split('_');
                  owner = parts[0];
                  actualSym = parts.slice(1).join('_');
              }
              
              // Map the owner to the currentHistoryFilter ('恆恆', '得得', '共同帳戶')
              const ownerMatch = owner.replace(/🐶|🐕/g, '');
              
              if (data.market && currentHistoryFilter.includes(ownerMatch)) {
                  holdings[actualSym] = {
                      shares: data.shares || 0,
                      market: data.market,
                      lots: [{
                          shares: data.shares || 0,
                          costTwd: data.costTwd || 0,
                          costUsd: data.costUsd || 0,
                          priceUsd: 0,
                          priceTwd: 0
                      }],
                      realizedProfitUsd: 0,
                      realizedProfitTwd: 0,
                  };
              }
          });
      }
      // 按日期排序，確保 FIFO 正確
      const sorted = [...history]
        .filter(r => !r.isDeleted && r.symbol && r.payer && r.payer.includes(currentHistoryFilter))
        .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.timestamp || '').localeCompare(b.timestamp || ''));
      
      sorted.forEach(r => {
          const sym = r.symbol;
          if (!holdings[sym]) holdings[sym] = {
            shares: 0,
            market: r.market || 'TW',
            // 用 lots 陣列追蹤每筆買入，方便 FIFO 計算
            lots: [],
            realizedProfitUsd: 0,
            realizedProfitTwd: 0,
          };
          const h = holdings[sym];
          // 更新 market：如果後來的記錄有 market 資訊，覆蓋
          if (r.market) h.market = r.market;
          
          if (r.type.includes('buy')) {
              const shares = Number(r.shares) || 0;
              const totalTwd = Number(r.total) || 0;
              const totalUsd = Number(r.usdAmount) || 0;
              const buyPriceUsd = Number(r.buyPrice) || 0;
              
              h.lots.push({
                shares,
                costTwd: totalTwd,
                costUsd: totalUsd,
                priceUsd: buyPriceUsd,
                priceTwd: shares > 0 ? totalTwd / shares : 0,
              });
              h.shares += shares;
          } else if (r.type.includes('sell')) {
              const sellShares = Number(r.shares) || 0;
              let remaining = sellShares;
              
              // FIFO: 從最早的 lot 開始扣除
              while (remaining > 0 && h.lots.length > 0) {
                const lot = h.lots[0];
                if (lot.shares <= remaining) {
                  remaining -= lot.shares;
                  h.lots.shift();
                } else {
                  // 部分賣出此 lot
                  const fraction = remaining / lot.shares;
                  lot.costTwd -= lot.costTwd * fraction;
                  lot.costUsd -= lot.costUsd * fraction;
                  lot.shares -= remaining;
                  remaining = 0;
                }
              }
              h.shares -= sellShares;
          }
      });
      
      // 清理已完全賣出的持倉
      Object.keys(holdings).forEach(k => { 
        if (holdings[k].shares <= 0) {
          delete holdings[k]; 
        }
      });
      return holdings;
  }, [history, currentHistoryFilter, assets.currentStockHoldings]);

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

  // ★ 計算持倉列表（以 USD 為核心計算，轉台幣僅做展示）
  let stockMarketValue = 0;
  let totalUnrealizedProfit = 0;
  
  const holdingList = Object.keys(stockHoldings).map(sym => {
      const holding = stockHoldings[sym];
      if (holding.shares <= 0) return null;
      
      const currentPriceUsd = livePrices[sym] || 0;
      const isUS = holding.market === 'US';
      
      // 從 lots 計算正確的總成本
      const totalCostUsd = holding.lots.reduce((s, l) => s + l.costUsd, 0);
      const totalCostTwd = holding.lots.reduce((s, l) => s + l.costTwd, 0);
      
      // 均價
      const avgCostUsd = holding.shares > 0 ? totalCostUsd / holding.shares : 0;
      const avgCostTwd = holding.shares > 0 ? totalCostTwd / holding.shares : 0;
      
      // 市值計算
      let marketValueUsd = 0;
      let marketValueTwd = 0;

      if (isUS) {
        // 美股：市價為 USD，轉台幣用匯率
        marketValueUsd = currentPriceUsd * holding.shares;
        marketValueTwd = marketValueUsd * liveFx;
        
        // 損益使用 USD 計算（和投資先生一致）
        const profitUsd = marketValueUsd - totalCostUsd;
        const profitTwd = profitUsd * liveFx;
        const profitPercent = totalCostUsd > 0 ? (profitUsd / totalCostUsd) * 100 : 0;

        stockMarketValue += marketValueTwd;
        totalUnrealizedProfit += profitTwd;

        return {
          sym,
          shares: holding.shares,
          market: 'US',
          currentPriceUsd,
          currentPriceTwd: currentPriceUsd * liveFx,
          avgCostUsd,
          avgCostTwd: avgCostUsd * liveFx,
          marketValueUsd,
          marketValueTwd,
          totalCostUsd,
          totalCostTwd: totalCostUsd * liveFx,
          profitUsd,
          profitTwd,
          profitPercent,
        };
      } else {
        // 台股：市價為 TWD
        const rawMarketValue = currentPriceUsd * holding.shares; // currentPriceUsd 其實是 TWD price for TW stocks
        const fee = Math.max(20, Math.floor(rawMarketValue * 0.001425 * 0.6));
        const tax = Math.floor(rawMarketValue * 0.003);
        marketValueTwd = rawMarketValue - fee - tax;
        
        const profitTwd = marketValueTwd - totalCostTwd;
        const profitPercent = totalCostTwd > 0 ? (profitTwd / totalCostTwd) * 100 : 0;

        stockMarketValue += marketValueTwd;
        totalUnrealizedProfit += profitTwd;

        return {
          sym,
          shares: holding.shares,
          market: 'TW',
          currentPriceTwd: currentPriceUsd,  // TW stocks: price is already TWD
          avgCostTwd,
          marketValueTwd,
          totalCostTwd,
          profitTwd,
          profitPercent,
        };
      }
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

  // ★ 類投資先生風格的持股卡片
  const StockCard = ({ h }) => {
    const isExpanded = expandedSymbol === h.sym;
    const isUS = h.market === 'US';
    const isProfit = isUS ? h.profitUsd >= 0 : h.profitTwd >= 0;
    const profitColor = isProfit ? 'var(--accent-green)' : 'var(--accent-red)';
    
    return (
      <div 
        style={{
          background: 'rgba(120,120,128,0.04)',
          borderRadius: 'var(--radius-md)',
          marginBottom: '10px',
          overflow: 'hidden',
          border: '0.5px solid rgba(120,120,128,0.08)',
          transition: 'all 0.25s ease',
        }}
      >
        {/* 主列：點擊展開/收起 */}
        <div 
          onClick={() => setExpandedSymbol(isExpanded ? null : h.sym)}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto auto',
            alignItems: 'center',
            padding: '14px 16px',
            cursor: 'pointer',
            gap: '12px',
          }}
        >
          {/* 左：名稱 */}
          <div>
            <div style={{ fontWeight: '700', fontSize: '1.05rem', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              {h.sym}
              {isUS && <span style={{ fontSize: '0.65rem', color: 'var(--accent-orange)', marginLeft: '6px', fontWeight: '500', verticalAlign: 'middle' }}>美國</span>}
            </div>
          </div>

          {/* 中：市價 / 均價 / 股數 */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)' }}>
              {isUS ? formatUsd(h.currentPriceUsd) : formatMoney(h.currentPriceTwd)}
            </div>
            <div style={{ fontSize: '0.73rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
              {isUS ? formatUsd(h.avgCostUsd) : formatMoney(h.avgCostTwd)}
            </div>
          </div>

          {/* 右上：股數 / 損益 */}
          <div style={{ textAlign: 'right', minWidth: '80px' }}>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>
              {h.shares} 股
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: '700', color: profitColor }}>
              {isUS 
                ? `${isProfit ? '+' : ''}${formatUsd(h.profitUsd)}`
                : `${isProfit ? '+' : ''}${formatMoney(h.profitTwd)}`
              }
            </div>
            <div style={{ fontSize: '0.73rem', fontWeight: '600', color: profitColor }}>
              {h.profitPercent >= 0 ? '+' : ''}{h.profitPercent.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* 標頭說明列 */}
        {!isExpanded && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto auto',
            padding: '0 16px 8px',
            gap: '12px',
          }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)' }}></div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>市價 / 均價</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', textAlign: 'right' }}>股數 / 損益</div>
          </div>
        )}

        {/* 展開區：總市值 / 總成本 */}
        {isExpanded && (
          <div style={{
            padding: '0 16px 14px',
            borderTop: '0.5px solid rgba(120,120,128,0.1)',
            animation: 'slideUpFade 0.25s ease-out',
          }}>
            <div style={{ paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {isUS && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>總市值 (USD)</span>
                    <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{formatUsd(h.marketValueUsd)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>總市值 (TWD)</span>
                    <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{formatMoney(h.marketValueTwd)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>總成本 (USD)</span>
                    <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{formatUsd(h.totalCostUsd)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>總成本 (TWD)</span>
                    <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{formatMoney(h.totalCostTwd)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>損益 (TWD)</span>
                    <span style={{ fontWeight: '700', color: profitColor }}>{h.profitTwd >= 0 ? '+' : ''}{formatMoney(h.profitTwd)}</span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textAlign: 'right', marginTop: '2px' }}>
                    *匯率：USD/TWD {liveFx.toFixed(2)}
                  </div>
                </>
              )}
              {!isUS && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>總市值 (TWD)</span>
                    <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{formatMoney(h.marketValueTwd)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>總成本 (TWD)</span>
                    <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{formatMoney(h.totalCostTwd)}</span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textAlign: 'right', marginTop: '2px' }}>
                    *市值已扣估算手續費與證交稅
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

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
              <>
                {/* 欄位標頭 */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto',
                  padding: '0 16px 8px',
                  gap: '12px',
                  fontSize: '0.7rem',
                  color: 'var(--text-tertiary)',
                  fontWeight: '500',
                }}>
                  <div>名稱</div>
                  <div style={{ textAlign: 'center' }}>市價 / 均價</div>
                  <div style={{ textAlign: 'right' }}>股數 / 損益</div>
                </div>
                {holdingList.map((h, idx) => <StockCard key={h.sym} h={h} />)}
              </>
          )}

          <div style={{marginTop:'15px', paddingTop:'15px', borderTop:'0.5px solid rgba(255,255,255,0.06)'}}>
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
                      <div key={idx} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'0.5px solid rgba(255,255,255,0.06)'}}>
                          <div>
                              <div style={{fontSize:'0.78rem', color:'var(--text-tertiary)'}}>{r.date || r.month}</div>
                              <div style={{fontWeight:'600', color:'var(--text-primary)'}}>{r.note} <span style={{fontSize:'0.73rem', color:'var(--text-tertiary)', fontWeight:'400'}}>({actionSign})</span></div>
                              {r.symbol && <div style={{fontSize:'0.73rem', color:'var(--accent-blue)', marginTop:'2px'}}>{r.symbol} | {r.shares}股</div>}
                          </div>
                          <div style={{textAlign:'right'}}>
                              <div style={{fontWeight:'700', fontSize:'1.05rem', color: amountColor}}>{amountStr}</div>
                              {r.usdAmount && <div style={{fontSize:'0.73rem', color:'var(--accent-orange)', fontWeight:'600'}}>(含美金 ${r.usdAmount.toFixed(2)})</div>}
                              {profitStr && <div style={{fontSize:'0.73rem', color: profitStr.includes('賺') ? 'var(--accent-green)' : 'var(--accent-red)'}}>{ profitStr}</div>}
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