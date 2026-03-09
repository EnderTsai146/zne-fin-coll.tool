// src/components/InvestmentView.jsx
import React, { useState, useMemo } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

const formatMoney = (num) => "$" + Math.round(Number(num)).toLocaleString();

const InvestmentView = ({ assets }) => {
  const [activeTab, setActiveTab] = useState('jointCash'); // 'jointCash', 'userA', 'userB'

  const history = assets.monthlyExpenses || [];
  const safeJoint = assets.jointInvestments || { stock: 0, fund: 0, deposit: 0, other: 0 };
  const safeUserA = assets.userInvestments?.userA || { stock: 0, fund: 0, deposit: 0, other: 0 };
  const safeUserB = assets.userInvestments?.userB || { stock: 0, fund: 0, deposit: 0, other: 0 };

  const currentData = activeTab === 'jointCash' ? safeJoint : (activeTab === 'userA' ? safeUserA : safeUserB);
  const accountName = activeTab === 'jointCash' ? '🏫 共同投資' : (activeTab === 'userA' ? '🐶 恆恆個人' : '🐕 得得個人');
  
  // 1. 計算目前持有的總本金
  const totalPrincipal = Object.values(currentData).reduce((a, b) => a + b, 0);

  // 2. 自動計算「累計已實現損益」 (從歷史變現紀錄中反推：拿回現金 - 扣除本金)
  const realizedProfit = useMemo(() => {
      return history.reduce((sum, r) => {
          if (r.isDeleted) return sum;
          
          const isJointSell = activeTab === 'jointCash' && r.type === 'joint_invest_sell';
          const isPersonalSell = (activeTab === 'userA' || activeTab === 'userB') && r.type === 'personal_invest_sell' && r.accountKey === activeTab;
          
          // 相容舊版的個人純損益紀錄
          const payerName = activeTab === 'userA' ? '恆恆' : '得得';
          const isOldPersonalProfit = (activeTab === 'userA' || activeTab === 'userB') && r.type === 'personal_invest_profit' && (r.payer && r.payer.includes(payerName));
          const isOldPersonalLoss = (activeTab === 'userA' || activeTab === 'userB') && r.type === 'personal_invest_loss' && (r.payer && r.payer.includes(payerName));

          if (isJointSell || isPersonalSell) {
              const profit = (Number(r.total) || 0) - (Number(r.principal) || Number(r.total));
              return sum + profit;
          }
          if (isOldPersonalProfit) return sum + (Number(r.total) || 0);
          if (isOldPersonalLoss) return sum - (Number(r.total) || 0);
          
          return sum;
      }, 0);
  }, [history, activeTab]);

  // 3. 圓餅圖資料
  const chartData = {
      labels: ['股票', '基金', '定存', '其他'],
      datasets: [{
          data: [currentData.stock, currentData.fund, currentData.deposit, currentData.other],
          backgroundColor: ['#ff9f43', '#54a0ff', '#2ecc71', '#c8d6e5'],
          borderWidth: 0,
          hoverOffset: 4
      }]
  };

  // 4. 篩選該帳戶的近期投資動作 (買入/變現)
  const recentHistory = useMemo(() => {
     return history.filter(r => {
         if (r.isDeleted) return false;
         if (activeTab === 'jointCash') {
             return r.type === 'joint_invest_buy' || r.type === 'joint_invest_sell';
         } else {
             const payerName = activeTab === 'userA' ? '恆恆' : '得得';
             return (r.accountKey === activeTab && r.type.includes('personal_invest_')) ||
                    (r.payer && r.payer.includes(payerName) && (r.type === 'personal_invest_profit' || r.type === 'personal_invest_loss'));
         }
     }).reverse().slice(0, 15); // 顯示最近 15 筆
  }, [history, activeTab]);

  return (
    <div style={{animation: 'fadeIn 0.5s'}}>
      <h1 className="page-title">投資戰情室</h1>

      {/* 帳戶切換按鈕 */}
      <div style={{display:'flex', gap:'10px', marginBottom:'20px'}}>
        <button className={`glass-btn ${activeTab==='jointCash'?'':'inactive'}`} onClick={()=>setActiveTab('jointCash')} style={{flex:1, padding:'8px 0'}}>🏫 共同</button>
        <button className={`glass-btn ${activeTab==='userA'?'':'inactive'}`} onClick={()=>setActiveTab('userA')} style={{flex:1, padding:'8px 0'}}>🐶 恆恆</button>
        <button className={`glass-btn ${activeTab==='userB'?'':'inactive'}`} onClick={()=>setActiveTab('userB')} style={{flex:1, padding:'8px 0'}}>🐕 得得</button>
      </div>

      <h3 style={{color:'#555', marginBottom:'15px', textAlign:'center'}}>{accountName} 的投資組合</h3>

      {/* 關鍵數據看板 */}
      <div style={{display:'flex', gap:'10px', marginBottom:'20px'}}>
          <div className="glass-card" style={{flex:1, textAlign:'center', padding:'15px'}}>
              <div style={{fontSize:'0.85rem', color:'#888', marginBottom:'5px'}}>累積投入本金</div>
              <div style={{fontSize:'1.5rem', fontWeight:'bold', color:'#34495e'}}>{formatMoney(totalPrincipal)}</div>
          </div>
          <div className="glass-card" style={{flex:1, textAlign:'center', padding:'15px', background: realizedProfit >= 0 ? 'rgba(46, 204, 113, 0.1)' : 'rgba(231, 76, 60, 0.1)', border: realizedProfit >= 0 ? '1px solid #2ecc71' : '1px solid #e74c3c'}}>
              <div style={{fontSize:'0.85rem', color: realizedProfit >= 0 ? '#27ae60' : '#c0392b', marginBottom:'5px'}}>累計已實現損益</div>
              <div style={{fontSize:'1.5rem', fontWeight:'bold', color: realizedProfit >= 0 ? '#2ecc71' : '#e74c3c'}}>
                  {realizedProfit > 0 ? '+' : ''}{formatMoney(realizedProfit)}
              </div>
          </div>
      </div>

      {/* 圓餅圖與資產明細 */}
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

      {/* 近期變動明細 */}
      <div className="glass-card" style={{marginBottom:'20px'}}>
          <h3 style={{marginTop:0, marginBottom:'15px', fontSize:'1.1rem', color:'#555', borderBottom:'1px solid #eee', paddingBottom:'10px'}}>📝 近期買賣紀錄</h3>
          {recentHistory.length === 0 ? (
              <div style={{textAlign:'center', color:'#888', padding:'10px'}}>尚無交易紀錄</div>
          ) : (
              recentHistory.map((r, idx) => {
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