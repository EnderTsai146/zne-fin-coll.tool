// src/components/InvestmentView.jsx
import React, { useState, useMemo } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

const formatMoney = (num) => "$" + Math.round(Number(num)).toLocaleString();

const InvestmentView = ({ assets }) => {
  const [activeTab, setActiveTab] = useState('jointCash'); // 'jointCash', 'userA', 'userB'
  
  // ★ 升級：改用「起訖日期 (Date Range)」狀態
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  const history = assets.monthlyExpenses || [];
  const safeJoint = assets.jointInvestments || { stock: 0, fund: 0, deposit: 0, other: 0 };
  const safeUserA = assets.userInvestments?.userA || { stock: 0, fund: 0, deposit: 0, other: 0 };
  const safeUserB = assets.userInvestments?.userB || { stock: 0, fund: 0, deposit: 0, other: 0 };

  const currentData = activeTab === 'jointCash' ? safeJoint : (activeTab === 'userA' ? safeUserA : safeUserB);
  const accountName = activeTab === 'jointCash' ? '🏫 共同投資' : (activeTab === 'userA' ? '🐶 恆恆個人' : '🐕 得得個人');
  
  // 1. 計算目前持有的總本金 (現況，不受日期過濾影響)
  const totalPrincipal = Object.values(currentData).reduce((a, b) => a + b, 0);

  // 2. 嚴格過濾：徹底排除作廢紀錄，並只留下當前帳戶的投資紀錄
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

  // 3. ★ 根據選擇的「日期區間」進行精準篩選
  const filteredHistory = useMemo(() => {
      return accountHistory.filter(r => {
          // 確保紀錄有完整日期，如果只有月份 (舊資料) 則預設為該月 1 號
          const rDate = r.date || `${r.month}-01`;
          
          if (dateRange.start && rDate < dateRange.start) return false;
          if (dateRange.end && rDate > dateRange.end) return false;
          
          return true;
      });
  }, [accountHistory, dateRange]);

  // 4. 自動計算「已實現損益」 (會隨區間篩選精準變動)
  const realizedProfit = useMemo(() => {
      return filteredHistory.reduce((sum, r) => {
          if (r.type.includes('sell')) {
              const profit = (Number(r.total) || 0) - (Number(r.principal) || Number(r.total));
              return sum + profit;
          }
          if (r.type === 'personal_invest_profit') return sum + (Number(r.total) || 0);
          if (r.type === 'personal_invest_loss') return sum - (Number(r.total) || 0);
          
          return sum;
      }, 0);
  }, [filteredHistory]);

  // 5. 圓餅圖資料
  const chartData = {
      labels: ['股票', '基金', '定存', '其他'],
      datasets: [{
          data: [currentData.stock, currentData.fund, currentData.deposit, currentData.other],
          backgroundColor: ['#ff9f43', '#54a0ff', '#2ecc71', '#c8d6e5'],
          borderWidth: 0,
          hoverOffset: 4
      }]
  };

  // 6. 準備顯示用的列表 (動態標籤與數量限制)
  const isAllTime = !dateRange.start && !dateRange.end;
  const displayHistory = isAllTime
      ? [...filteredHistory].reverse().slice(0, 30) // 看全部時最多顯示 30 筆避免滑太久
      : [...filteredHistory].reverse(); // 選擇特定區間時，顯示區間內所有明細

  const profitLabel = isAllTime ? '累計已實現損益' : '區間已實現損益';
  const listLabel = isAllTime ? '📝 近期買賣紀錄' : '📝 區間買賣紀錄';

  return (
    <div style={{animation: 'fadeIn 0.5s'}}>
      <h1 className="page-title">投資戰情室</h1>

      {/* 帳戶切換按鈕 */}
      <div style={{display:'flex', gap:'10px', marginBottom:'20px'}}>
        <button className={`glass-btn ${activeTab==='jointCash'?'':'inactive'}`} onClick={()=>setActiveTab('jointCash')} style={{flex:1, padding:'8px 0'}}>🏫 共同</button>
        <button className={`glass-btn ${activeTab==='userA'?'':'inactive'}`} onClick={()=>setActiveTab('userA')} style={{flex:1, padding:'8px 0'}}>🐶 恆恆</button>
        <button className={`glass-btn ${activeTab==='userB'?'':'inactive'}`} onClick={()=>setActiveTab('userB')} style={{flex:1, padding:'8px 0'}}>🐕 得得</button>
      </div>

      {/* ★ 升級：自訂日期區間篩選器 (支援手機版折行) */}
      <div className="glass-card" style={{ padding: '12px 15px', marginBottom: '20px', borderLeft: '5px solid #3498db' }}>
          <div style={{color:'#555', fontWeight:'bold', marginBottom:'8px', fontSize:'0.9rem'}}>🔍 自訂時間範圍</div>
          <div style={{display:'flex', flexWrap:'wrap', gap:'8px', alignItems:'center'}}>
              <input 
                  type="date" 
                  value={dateRange.start} 
                  onChange={(e) => setDateRange(prev => ({...prev, start: e.target.value}))}
                  className="glass-input"
                  style={{margin:0, padding:'6px 10px', flex:1, minWidth:'110px', fontSize:'0.85rem'}}
              />
              <span style={{color:'#888', fontSize:'0.85rem'}}>至</span>
              <input 
                  type="date" 
                  value={dateRange.end} 
                  onChange={(e) => setDateRange(prev => ({...prev, end: e.target.value}))}
                  className="glass-input"
                  style={{margin:0, padding:'6px 10px', flex:1, minWidth:'110px', fontSize:'0.85rem'}}
              />
              <button 
                  onClick={() => setDateRange({ start: '', end: '' })} 
                  className="glass-btn"
                  style={{padding:'6px 12px', fontSize:'0.85rem', background: isAllTime ? '#e2e8f0' : '#fff', color:'#333', border:'1px solid #ccc'}}
              >
                  清除/看全部
              </button>
          </div>
      </div>

      <h3 style={{color:'#555', margin:'0 0 15px 0', textAlign:'center'}}>{accountName} 的資產現況</h3>

      {/* 關鍵數據看板 */}
      <div style={{display:'flex', gap:'10px', marginBottom:'20px'}}>
          <div className="glass-card" style={{flex:1, textAlign:'center', padding:'15px'}}>
              <div style={{fontSize:'0.85rem', color:'#888', marginBottom:'5px'}}>目前投入本金</div>
              <div style={{fontSize:'1.5rem', fontWeight:'bold', color:'#34495e'}}>{formatMoney(totalPrincipal)}</div>
          </div>
          <div className="glass-card" style={{flex:1, textAlign:'center', padding:'15px', background: realizedProfit >= 0 ? 'rgba(46, 204, 113, 0.1)' : 'rgba(231, 76, 60, 0.1)', border: realizedProfit >= 0 ? '1px solid #2ecc71' : '1px solid #e74c3c'}}>
              <div style={{fontSize:'0.85rem', color: realizedProfit >= 0 ? '#27ae60' : '#c0392b', marginBottom:'5px'}}>{profitLabel}</div>
              <div style={{fontSize:'1.5rem', fontWeight:'bold', color: realizedProfit >= 0 ? '#2ecc71' : '#e74c3c'}}>
                  {realizedProfit > 0 ? '+' : ''}{formatMoney(realizedProfit)}
              </div>
          </div>
      </div>

      {/* 圓餅圖與資產明細 (不受日期影響) */}
      {totalPrincipal === 0 ? (
          <div className="glass-card" style={{textAlign:'center', padding:'40px', color:'#888', marginBottom:'20px'}}>
              <div style={{fontSize:'2rem', marginBottom:'10px'}}>🌱</div>
              目前還沒有任何投資部位喔！<br/>去「操作」頁面買入一些資產吧！
          </div>
      ) : (
          <div className="glass-card" style={{marginBottom:'20px', display:'flex', flexWrap:'wrap', alignItems:'center'}}>
              <div style={{flex:1, minWidth:'200px', height:'200px', display:'flex', justifyContent:'center'}}>
                  <Doughnut data={chartData} options={{ maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } }} />
              </div>
              <div style={{flex:1, minWidth:'200px', padding:'10px'}}>
                  {['stock', 'fund', 'deposit', 'other'].map((type, idx) => {
                      const colors = ['#ff9f43', '#54a0ff', '#2ecc71', '#c8d6e5'];
                      const labels = ['股票', '基金', '定存', '其他'];
                      const val = currentData[type];
                      if (val === 0) return null;
                      const percentage = ((val / totalPrincipal) * 100).toFixed(1);
                      return (
                          <div key={type} style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px'}}>
                              <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                                  <div style={{width:'12px', height:'12px', borderRadius:'50%', background:colors[idx]}}></div>
                                  <span style={{fontWeight:'bold', color:'#555'}}>{labels[idx]}</span>
                                  <span style={{fontSize:'0.75rem', color:'#888'}}>{percentage}%</span>
                              </div>
                              <div style={{fontWeight:'bold', color:'#333'}}>{formatMoney(val)}</div>
                          </div>
                      );
                  })}
              </div>
          </div>
      )}

      {/* 近期變動明細 (受日期影響) */}
      <div className="glass-card" style={{marginBottom:'20px'}}>
          <h3 style={{marginTop:0, marginBottom:'15px', fontSize:'1.1rem', color:'#555', borderBottom:'1px solid #eee', paddingBottom:'10px'}}>{listLabel}</h3>
          {displayHistory.length === 0 ? (
              <div style={{textAlign:'center', color:'#888', padding:'20px'}}>
                  {isAllTime ? '尚無交易紀錄' : '在這個時間範圍內沒有買賣紀錄喔！'}
              </div>
          ) : (
              displayHistory.map((r, idx) => {
                  const isSell = r.type.includes('sell') || r.type.includes('profit') || r.type.includes('loss');
                  const color = isSell ? '#f1c40f' : '#8e44ad';
                  const sign = isSell ? '變現' : '買入';
                  
                  // 計算單筆損益
                  let profitStr = '';
                  if (r.type.includes('sell')) {
                      const p = (Number(r.total) || 0) - (Number(r.principal) || Number(r.total));
                      if (p !== 0) profitStr = p > 0 ? `(賺 ${formatMoney(p)})` : `(賠 ${formatMoney(Math.abs(p))})`;
                  }

                  return (
                      <div key={idx} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px dashed #eee'}}>
                          <div>
                              <div style={{fontSize:'0.8rem', color:'#888'}}>{r.date || r.month}</div>
                              <div style={{fontWeight:'bold', color:'#444'}}>{r.note}</div>
                          </div>
                          <div style={{textAlign:'right'}}>
                              <div style={{fontWeight:'bold', color: color}}>{sign} {formatMoney(r.total)}</div>
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