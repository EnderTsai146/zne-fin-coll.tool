// src/components/MonthlyView.jsx
import React, { useState, useMemo } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement } from 'chart.js';
import { Pie, Bar } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const formatMoney = (num) => "$" + Number(num).toLocaleString();

const MonthlyView = ({ assets, onDelete, setAssets, sendLineNotification, currentUser }) => {
  const history = assets.monthlyExpenses || [];
  
  const [viewMode, setViewMode] = useState('chart');
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 7)); 
  const [filterType, setFilterType] = useState('all');   
  const [filterUser, setFilterUser] = useState('all');   

  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [settlementTarget, setSettlementTarget] = useState(null); 

  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [tempBudget, setTempBudget] = useState(assets.monthlyBudget || 40000);
  const currentBudget = assets.monthlyBudget || 40000;

  const handleSaveBudget = () => { setAssets({ ...assets, monthlyBudget: Number(tempBudget) }); setIsEditingBudget(false); };

  const getTypeColor = (type) => {
    if (type === 'income') return '#2ecc71'; 
    if (type === 'expense') return '#ff6b6b'; 
    if (type === 'spend') return '#ff9f43'; 
    if (type === 'transfer' || type === 'exchange') return '#3498db'; 
    if (type === 'settle') return '#00b894'; 
    if (type === 'liquidate' || type === 'joint_invest_sell' || type === 'personal_invest_sell') return '#f1c40f'; 
    if (type === 'joint_invest_buy' || type === 'personal_invest_buy') return '#8e44ad'; 
    if (type === 'personal_invest_profit') return '#e67e22'; 
    if (type === 'personal_invest_loss') return '#7f8c8d'; 
    return '#666';
  };

  const calculateDebt = (userKey) => history.filter(r => !r.isDeleted && r.advancedBy === userKey && r.isSettled === false).reduce((sum, r) => sum + Number(r.total), 0);
  const getDebtList = (userKey) => history.filter(r => !r.isDeleted && r.advancedBy === userKey && r.isSettled === false);

  const handleSettle = (targetUser) => {
    const targetName = targetUser === 'userA' ? '恆恆' : '得得';
    const debtAmount = calculateDebt(targetUser);
    if (debtAmount === 0) return alert("目前沒有未結清的款項喔！");
    if (assets.jointCash < debtAmount) return alert(`❌ 共同現金餘額不足以結清 (需 $${debtAmount.toLocaleString()})！`);
    if (!window.confirm(`【確認結清】\n\n要將 ${targetName} 代墊的 $${debtAmount.toLocaleString()} 標記為「已結清」嗎？\n\n(這將會從「共同現金」扣除該金額，並加回「${targetName}」的個人帳戶)`)) return;

    const safeInvestments = assets.jointInvestments || { stock: 0, fund: 0, deposit: 0, other: 0 };
    const snapshotBefore = { userA: assets.userA || 0, userB: assets.userB || 0, userA_usd: assets.userA_usd || 0, userB_usd: assets.userB_usd || 0, jointCash_usd: assets.jointCash_usd || 0, jointCash: assets.jointCash || 0, jointInvestments: { ...safeInvestments } };
    const newAssets = { ...assets };
    newAssets.jointCash -= debtAmount; newAssets[targetUser] += debtAmount;
    const snapshotAfter = { userA: newAssets.userA, userB: newAssets.userB, userA_usd: newAssets.userA_usd || 0, userB_usd: newAssets.userB_usd || 0, jointCash_usd: newAssets.jointCash_usd || 0, jointCash: newAssets.jointCash, jointInvestments: { ...safeInvestments } };

    const currentSettleId = `settle_${Date.now()}`;
    const newHistory = newAssets.monthlyExpenses.map(record => {
        if (!record.isDeleted && record.advancedBy === targetUser && record.isSettled === false) return { ...record, isSettled: true, settleId: currentSettleId }; 
        return record;
    });

    const timestamp = new Date().toISOString();
    newHistory.push({ date: timestamp.split('T')[0], month: timestamp.slice(0, 7), type: 'settle', category: '帳務結算', payer: '共同帳戶', total: debtAmount, note: `撥款結清 ${targetName} 的代墊`, operator: currentUser || "系統", timestamp: timestamp, settledUser: targetUser, settleId: currentSettleId, auditTrail: { before: snapshotBefore, after: snapshotAfter } });

    newAssets.monthlyExpenses = newHistory;
    setAssets(newAssets); 
    if (sendLineNotification) sendLineNotification({ title: "✅ 代墊款結清", amount: `$${debtAmount.toLocaleString()}`, category: "帳務結算", note: `共同帳戶已實際撥款給 ${targetName}。`, date: timestamp.split('T')[0], color: "#2ecc71", operator: currentUser || "系統" });
    alert("✅ 結清完成！資金已轉移，並已產生結清軌跡。"); setShowSettlementModal(false);
  };

  const dashboardData = useMemo(() => {
    const currentMonth = selectedMonth;
    const [yearStr, monthStr] = currentMonth.split('-');
    let date = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1);
    date.setMonth(date.getMonth() - 1);
    const prevMonthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    const monthRecords = history.filter(r => r.month === currentMonth && !r.isDeleted);
    const prevMonthRecords = history.filter(r => r.month === prevMonthStr && !r.isDeleted);

    const stats = { income: { total: 0, userA: 0, userB: 0 }, expense: { total: 0, joint: 0, userA: 0, userB: 0 } };
    let dailyData = {};  
    const catStats = { '餐費':0, '購物':0, '固定費用':0, '其他':0 };

    monthRecords.forEach(r => {
        const day = parseInt(r.date.split('-')[2]); 
        if (r.type === 'income') {
            stats.income.total += r.total;
            if (r.payer.includes('恆恆')) stats.income.userA += r.total; else if (r.payer.includes('得得')) stats.income.userB += r.total;
        } else if (r.type === 'expense' || r.type === 'spend') {
            stats.expense.total += r.total; dailyData[day] = (dailyData[day] || 0) + r.total;
            if (r.type === 'spend') stats.expense.joint += r.total;
            else if (r.type === 'expense') {
                if (r.payer.includes('恆恆')) stats.expense.userA += r.total; else if (r.payer.includes('得得')) stats.expense.userB += r.total;
            }
            if (r.type === 'expense' && r.details) {
                catStats['餐費'] += Number(r.details.food || 0); catStats['購物'] += Number(r.details.shopping || 0); catStats['固定費用'] += Number(r.details.fixed || 0); catStats['其他'] += Number(r.details.other || 0);
            } else if (r.type === 'spend') {
                const note = r.note || '';
                if (note.includes('餐費')) catStats['餐費'] += r.total; else if (note.includes('購物')) catStats['購物'] += r.total; else if (note.includes('固定')) catStats['固定費用'] += r.total; else catStats['其他'] += r.total;
            }
        }
    });

    let prevMonthExpense = 0;
    prevMonthRecords.forEach(r => { if (r.type === 'expense' || r.type === 'spend') prevMonthExpense += r.total; });
    
    const momDiff = stats.expense.total - prevMonthExpense;
    const momText = prevMonthExpense === 0 ? (stats.expense.total > 0 ? '無上月對比資料' : '與上月持平') : (momDiff > 0 ? `⬆️ 比上月多花 $${momDiff.toLocaleString()}` : `⬇️ 比上月省了 $${Math.abs(momDiff).toLocaleString()}`);
    const momColor = momDiff > 0 ? '#e74c3c' : '#2ecc71';

    const netCashFlow = stats.income.total - stats.expense.total;
    const savingsRate = stats.income.total > 0 ? ((netCashFlow / stats.income.total) * 100).toFixed(1) : 0;

    const today = new Date();
    const realCurrentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
    let daysPassed = 1;
    if (currentMonth === realCurrentMonthStr) daysPassed = today.getDate() || 1; else if (currentMonth < realCurrentMonthStr) daysPassed = daysInMonth;

    const leaderboard = Object.entries(catStats).map(([name, amount]) => ({ name, amount, percentage: stats.expense.total > 0 ? ((amount / stats.expense.total) * 100).toFixed(1) : 0, dailyAvg: Math.round(amount / daysPassed) })).filter(item => item.amount > 0).sort((a, b) => b.amount - a.amount);
    const pieData = { labels: Object.keys(catStats), datasets: [{ data: Object.values(catStats), backgroundColor: ['#ff9f43', '#54a0ff', '#ff6b6b', '#c8d6e5'], borderWidth: 1 }] };
    const barLabels = Array.from({length: daysInMonth}, (_, i) => i + 1);
    const barValues = barLabels.map(day => dailyData[day] || 0);
    const barChartData = { labels: barLabels, datasets: [{ label: '每日支出', data: barValues, backgroundColor: '#17c9b2', borderRadius: 4 }] };

    return { stats, pieData, barChartData, momText, momColor, netCashFlow, savingsRate, leaderboard };
  }, [history, selectedMonth]);

  const budgetPercent = Math.min((dashboardData.stats.expense.total / currentBudget) * 100, 100).toFixed(1);
  let progressColor = '#2ecc71'; 
  if (budgetPercent >= 90) progressColor = '#e74c3c'; else if (budgetPercent >= 70) progressColor = '#f39c12'; 

  const historyWithIndex = history.map((record, index) => ({ ...record, originalIndex: index }));
  const filteredHistory = historyWithIndex.filter(record => {
    const recordMonth = record.month || record.date.slice(0, 7);
    if (recordMonth !== filterDate) return false;
    if (filterType === 'income') { if (record.type !== 'income') return false; } 
    else if (filterType === 'expense') { if (record.type !== 'expense' && record.type !== 'spend') return false; } 
    else if (filterType === 'invest') {
        const investTypes = ['liquidate', 'joint_invest_buy', 'joint_invest_sell', 'personal_invest_profit', 'personal_invest_loss', 'personal_invest_buy', 'personal_invest_sell', 'exchange'];
        if (!investTypes.includes(record.type)) return false;
    }
    if (filterUser !== 'all') {
        const payer = record.payer || '';
        if (filterUser === 'joint') { if (record.type !== 'spend' && record.category !== '共同支出' && !record.type.includes('joint_invest')) return false; }
        else if (filterUser === 'userA') { if (!payer.includes('恆恆') && !payer.includes('userA')) return false; }
        else if (filterUser === 'userB') { if (!payer.includes('得得') && !payer.includes('userB')) return false; }
    }
    return true;
  });

  return (
    <div>
       <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px'}}>
         <h1 className="page-title" style={{margin:0}}>財務資料庫</h1>
         <div style={{background:'rgba(255,255,255,0.3)', borderRadius:'20px', padding:'4px', display:'flex'}}>
            {['chart', 'list'].map(mode => (
                <button key={mode} onClick={() => setViewMode(mode)} style={{ background: viewMode === mode ? '#fff' : 'transparent', border:'none', borderRadius:'16px', padding:'6px 12px', cursor:'pointer', fontWeight:'bold', color: viewMode === mode ? '#333' : '#666', boxShadow: viewMode === mode ? '0 2px 5px rgba(0,0,0,0.1)' : 'none' }}>
                    {mode === 'chart' ? '儀表板' : '流水帳'}
                </button>
            ))}
         </div>
       </div>
       
       {viewMode === 'chart' && (
         <div style={{animation: 'fadeIn 0.5s'}}>
            <div className="glass-card" style={{padding:'10px', textAlign:'center', marginBottom:'15px', display:'flex', justifyContent:'center', alignItems:'center', gap:'10px'}}>
                <label style={{fontWeight:'bold', color:'#555'}}>分析月份：</label><input type="month" className="glass-input" style={{width:'auto', margin:0, padding:'5px 10px'}} value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
            </div>

            <div className="glass-card" style={{padding:'15px', marginBottom:'15px'}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px'}}>
                    <h3 style={{margin:0, fontSize:'1.1rem', color:'#555'}}>🎯 本月預算進度</h3>
                    {isEditingBudget ? (
                        <div style={{display:'flex', gap:'5px', alignItems:'center'}}>
                            <input type="number" className="glass-input" style={{margin:0, padding:'4px 8px', width:'100px'}} value={tempBudget} onChange={e => setTempBudget(e.target.value)} />
                            <button className="glass-btn" style={{padding:'4px 10px', fontSize:'0.8rem'}} onClick={handleSaveBudget}>儲存</button>
                        </div>
                    ) : (
                        <div style={{fontSize:'0.9rem', color:'#888', cursor:'pointer', background:'rgba(0,0,0,0.05)', padding:'4px 8px', borderRadius:'8px'}} onClick={() => setIsEditingBudget(true)}>
                            設定預算: {formatMoney(currentBudget)} ✏️
                        </div>
                    )}
                </div>
                <div style={{background:'rgba(0,0,0,0.05)', borderRadius:'10px', height:'14px', width:'100%', overflow:'hidden'}}>
                    <div style={{background: progressColor, width: `${budgetPercent}%`, height:'100%', transition:'width 0.5s ease'}}></div>
                </div>
                <div style={{display:'flex', justifyContent:'space-between', marginTop:'8px', fontSize:'0.85rem', color:'#666', fontWeight:'500'}}>
                    <span>已花 {formatMoney(dashboardData.stats.expense.total)}</span><span>剩餘 {formatMoney(Math.max(currentBudget - dashboardData.stats.expense.total, 0))} ({budgetPercent}%)</span>
                </div>
            </div>

            <div style={{display:'flex', gap:'10px', marginBottom:'15px', flexWrap:'wrap'}}>
                <div className="glass-card" style={{flex:1, minWidth:'120px', padding:'15px', textAlign:'center', background:'linear-gradient(135deg, #a8e6cf 0%, #dcedc1 100%)'}}>
                    <div style={{fontSize:'0.8rem', color:'#1d1d1f', opacity:0.7}}>總收入</div>
                    <div style={{fontSize:'1.3rem', fontWeight:'bold', color:'#06c755', marginBottom:'5px'}}>{formatMoney(dashboardData.stats.income.total)}</div>
                    <div style={{fontSize:'0.75rem', color:'#444', borderTop:'1px solid rgba(0,0,0,0.1)', paddingTop:'5px'}}>恆: {formatMoney(dashboardData.stats.income.userA)} | 得: {formatMoney(dashboardData.stats.income.userB)}</div>
                </div>
                <div className="glass-card" style={{flex:1, minWidth:'120px', padding:'15px', textAlign:'center', background:'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)'}}>
                    <div style={{fontSize:'0.8rem', color:'#1d1d1f', opacity:0.7}}>總支出</div>
                    <div style={{fontSize:'1.3rem', fontWeight:'bold', color:'#ef454d', marginBottom:'5px'}}>{formatMoney(dashboardData.stats.expense.total)}</div>
                    <div style={{fontSize:'0.75rem', color: dashboardData.momColor, fontWeight:'bold', borderTop:'1px solid rgba(0,0,0,0.1)', paddingTop:'5px'}}>
                        {dashboardData.momText}
                    </div>
                </div>
                <div className="glass-card" style={{flex:1, minWidth:'140px', padding:'15px', textAlign:'center', background:'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)'}}>
                    <div style={{fontSize:'0.8rem', color:'#1d1d1f', opacity:0.7}}>淨現金流 (本月存下)</div>
                    <div style={{fontSize:'1.3rem', fontWeight:'bold', color: dashboardData.netCashFlow >= 0 ? '#1967d2' : '#e74c3c', marginBottom:'5px'}}>
                        {dashboardData.netCashFlow > 0 ? '+' : ''}{formatMoney(dashboardData.netCashFlow)}
                    </div>
                    <div style={{fontSize:'0.8rem', color:'#444', borderTop:'1px solid rgba(0,0,0,0.1)', paddingTop:'5px'}}>儲蓄率: <span style={{fontWeight:'bold', color:'#1967d2'}}>{dashboardData.savingsRate}%</span></div>
                </div>
            </div>

            {dashboardData.stats.expense.total === 0 ? (
                <div className="glass-card" style={{textAlign:'center', padding:'30px', color:'#888'}}>🦕 這個月還沒有有效的支出紀錄喔！</div>
            ) : (
                <>
                    <div style={{display:'flex', gap:'10px', marginBottom:'15px', flexWrap:'wrap'}}>
                        <div className="glass-card" style={{flex:1, minWidth:'250px'}}>
                            <h4 style={{margin:'0 0 10px 0', textAlign:'center', color:'#666'}}>支出結構</h4>
                            <div style={{height:'200px', display:'flex', justifyContent:'center'}}><Pie data={dashboardData.pieData} options={{ maintainAspectRatio: false }} /></div>
                        </div>
                        <div className="glass-card" style={{flex:1.5, minWidth:'250px'}}>
                            <h4 style={{margin:'0 0 10px 0', textAlign:'center', color:'#666'}}>💸 花費排行榜 & 抓漏</h4>
                            <div>
                                {dashboardData.leaderboard.map((item, idx) => (
                                    <div key={idx} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px dashed #eee'}}>
                                        <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                            <span style={{fontSize:'1.2rem'}}>{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🔹'}</span>
                                            <div>
                                                <div style={{fontWeight:'bold', color:'#444'}}>{item.name}</div>
                                                <div style={{fontSize:'0.7rem', color:'#888'}}>佔總額 {item.percentage}%</div>
                                            </div>
                                        </div>
                                        <div style={{textAlign:'right'}}>
                                            <div style={{fontWeight:'bold', color:'#e74c3c'}}>{formatMoney(item.amount)}</div>
                                            <div style={{fontSize:'0.75rem', color:'#666'}}>日均消耗: <span style={{fontWeight:'bold'}}>{formatMoney(item.dailyAvg)}</span></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="glass-card">
                        <h4 style={{margin:'0 0 10px 0', textAlign:'center', color:'#666'}}>每日支出趨勢</h4>
                        <div style={{height:'200px'}}><Bar data={dashboardData.barChartData} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }} /></div>
                    </div>
                </>
            )}

            <div className="glass-card" style={{marginBottom:'15px', borderLeft:'5px solid #f1c40f'}}>
                <h3 style={{marginTop:0, fontSize:'1rem', color:'#b7791f', display:'flex', alignItems:'center'}}>
                    🤝 代墊款結算中心 <span style={{fontSize:'0.7rem', marginLeft:'5px', background:'#f1c40f', color:'white', padding:'2px 5px', borderRadius:'4px'}}>All Time</span>
                </h3>
                {['userA', 'userB'].map(user => {
                    const debt = calculateDebt(user);
                    const name = user === 'userA' ? '恆恆' : '得得';
                    return (
                        <div key={user} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom: '1px dashed #eee'}}>
                            <div>
                                <div style={{fontWeight:'bold', color:'#555'}}>{name} 墊付未結</div>
                                {debt > 0 ? ( <div style={{fontSize:'0.8rem', color:'#888', textDecoration:'underline', cursor:'pointer'}} onClick={() => { setSettlementTarget(user); setShowSettlementModal(true); }}>查看明細</div> ) : ( <div style={{fontSize:'0.8rem', color:'#2ecc71'}}>✨ 已全數結清</div> )}
                            </div>
                            <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                <span style={{fontSize:'1.2rem', fontWeight:'bold', color: debt>0 ? '#e67e22' : '#ccc'}}>{formatMoney(debt)}</span>
                                {debt > 0 && <button className="glass-btn" style={{padding:'5px 10px', fontSize:'0.8rem', background:'#2ecc71', color:'white', border:'none'}} onClick={() => handleSettle(user)}>結清</button>}
                            </div>
                        </div>
                    );
                })}
            </div>
         </div>
       )}

       {viewMode === 'list' && (
         <>
            <div className="glass-card" style={{padding:'15px', marginBottom:'20px'}}>
                <div style={{display:'flex', gap:'10px', flexWrap:'wrap'}}>
                    <input type="month" className="glass-input" style={{flex:'2', minWidth:'120px', margin:0, padding:'8px'}} value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
                    <select className="glass-input" style={{flex:'1', minWidth:'80px', margin:0, padding:'8px'}} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                        <option value="all">全部類型</option>
                        <option value="expense">支出</option>
                        <option value="income">收入</option>
                        <option value="invest">投資與外幣</option>
                    </select>
                    <select className="glass-input" style={{flex:'1', minWidth:'80px', margin:0, padding:'8px'}} value={filterUser} onChange={(e) => setFilterUser(e.target.value)}>
                        <option value="all">所有人</option>
                        <option value="joint">共同帳戶</option>
                        <option value="userA">恆恆</option>
                        <option value="userB">得得</option>
                    </select>
                </div>
            </div>

            {filteredHistory.length === 0 ? (
                <div className="glass-card" style={{textAlign:'center', color: '#888'}}><p>📭 沒有符合篩選條件的紀錄</p></div>
            ) : (
                [...filteredHistory].reverse().map((record) => {
                  let showSign = ''; let amountColor = '#1d1d1f';
                  if (['income', 'liquidate', 'joint_invest_sell', 'personal_invest_profit', 'personal_invest_sell'].includes(record.type)) { showSign = '+'; amountColor = '#2ecc71'; } 
                  else if (['expense', 'personal_invest_loss', 'spend', 'joint_invest_buy', 'personal_invest_buy'].includes(record.type)) { showSign = '-'; amountColor = '#1d1d1f'; } 
                  else if (['settle', 'transfer', 'exchange'].includes(record.type)) { showSign = '🔄 '; amountColor = '#3498db'; }
                  
                  const isDeleted = record.isDeleted;
                  const opacity = isDeleted ? 0.6 : 1;
                  const textDeco = isDeleted ? 'line-through' : 'none';
                  if (isDeleted) amountColor = '#aaa';
                  const borderColor = isDeleted ? '#ccc' : getTypeColor(record.type);

                  return (
                    <div key={record.originalIndex} className="glass-card" style={{ marginBottom: '15px', borderLeft: `5px solid ${borderColor}`, position: 'relative', paddingBottom: '10px', opacity: opacity }}>
                        <div style={{ position: 'absolute', top: '15px', right: '15px', display:'flex', gap:'8px', alignItems:'center', zIndex: 10 }}>
                            {record.type === 'settle' && !isDeleted && ( <div style={{ background: '#e0f7fa', color: '#00b894', padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 'bold' }}>✅ 系統結算</div> )}
                            {!isDeleted ? (
                                <button onClick={() => { if(window.confirm(`⚠️ 確認作廢此筆紀錄？`)) onDelete(record.originalIndex); }} style={{ background: 'rgba(255, 0, 0, 0.1)', border: 'none', borderRadius: '50%', width: '30px', height: '30px', cursor: 'pointer', color: 'red', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>🗑️</button>
                            ) : (
                                <div style={{ background: '#ffeaa7', color: '#d35400', padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 'bold' }}>🚫 已作廢</div>
                            )}
                        </div>

                        <div style={{ paddingBottom: '5px' }}>
                            <div style={{display:'flex', alignItems:'center', gap:'10px', marginBottom:'8px', flexWrap:'wrap'}}>
                                <span style={{fontWeight:'bold', fontSize:'1.1rem', fontFamily:'monospace', color:'#444', textDecoration: textDeco}}>{record.date || record.month}</span>
                                <span style={{fontSize:'0.8rem', color:'white', background: borderColor, padding:'2px 8px', borderRadius:'10px', fontWeight:'600'}}>{record.category}</span>
                                {record.advancedBy && (
                                    <span style={{ fontSize:'0.75rem', border: record.isSettled ? '1px solid #2ecc71' : '1px solid #f39c12', color: record.isSettled ? '#2ecc71' : '#f39c12', padding:'1px 6px', borderRadius:'10px', background:'#fff', fontWeight:'bold' }}>
                                        {record.advancedBy === 'userA' ? '恆恆' : '得得'}墊付 {record.isSettled ? ' (已結)' : ' (未結)'}
                                    </span>
                                )}
                            </div>

                            <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end', paddingRight: '40px', marginBottom:'5px'}}>
                                <span style={{fontSize:'1.1rem', color:'#1d1d1f', fontWeight:'700', textDecoration: textDeco}}>{record.note === '月結記帳' ? '日記帳' : record.note}</span>
                                <span style={{fontSize:'1.6rem', fontWeight:'800', color: amountColor, textDecoration: textDeco}}>{showSign}{formatMoney(record.total)}</span>
                            </div>

                            <div style={{fontSize:'0.85rem', color:'#888', display:'flex', alignItems:'center', gap:'5px', marginTop:'5px'}}>
                                {record.payer === '共同帳戶' ? <span style={{background:'#eee', padding:'2px 6px', borderRadius:'4px', textDecoration: textDeco}}>🏫 共同帳戶</span> : <span style={{background:'#e8f0fe', color:'#1967d2', padding:'2px 6px', borderRadius:'4px', textDecoration: textDeco}}>👤 {record.payer}</span>}
                            </div>
                            
                            {isDeleted && ( <div style={{ marginTop: '10px', fontSize: '0.85rem', color: '#e74c3c', background: 'rgba(231, 76, 60, 0.1)', padding: '8px', borderRadius: '8px', border: '1px dashed #e74c3c' }}><strong>作廢原因：</strong> {record.deleteReason}</div> )}

                            {/* 💱 修復：完整支援美金欄位的紀錄顯示 */}
                            {record.auditTrail && !isDeleted && (
                                <div style={{ marginTop: '10px', fontSize:'0.8rem', color:'#666', background:'rgba(0,0,0,0.03)', padding:'10px', borderRadius:'8px', borderTop:'1px dashed #ddd' }}>
                                    <div style={{marginBottom:'6px', fontWeight:'bold', color:'#555'}}>🔍 交易前後餘額對比：</div>
                                    <div style={{display:'flex', flexDirection:'column', gap:'4px'}}>
                                        {record.auditTrail.after.jointCash !== record.auditTrail.before.jointCash && (() => {
                                            const diff = (record.auditTrail.after.jointCash || 0) - (record.auditTrail.before.jointCash || 0);
                                            return <div>🏫 共同現金: <span style={{textDecoration:'line-through', color:'#aaa'}}>{formatMoney(record.auditTrail.before.jointCash || 0)}</span> ➔ <span style={{fontWeight:'bold', color: diff > 0 ? '#2ecc71' : '#e74c3c'}}>{formatMoney(record.auditTrail.after.jointCash || 0)}</span> <span style={{fontSize:'0.75rem', color: diff > 0 ? '#2ecc71' : '#e74c3c'}}>({diff > 0 ? '+' : ''}{formatMoney(diff)})</span></div>;
                                        })()}
                                        
                                        {record.auditTrail.after.userA !== record.auditTrail.before.userA && (() => {
                                            const diff = (record.auditTrail.after.userA || 0) - (record.auditTrail.before.userA || 0);
                                            return <div>🐶 恆恆台幣: <span style={{textDecoration:'line-through', color:'#aaa'}}>{formatMoney(record.auditTrail.before.userA || 0)}</span> ➔ <span style={{fontWeight:'bold', color: diff > 0 ? '#2ecc71' : '#e74c3c'}}>{formatMoney(record.auditTrail.after.userA || 0)}</span> <span style={{fontSize:'0.75rem', color: diff > 0 ? '#2ecc71' : '#e74c3c'}}>({diff > 0 ? '+' : ''}{formatMoney(diff)})</span></div>;
                                        })()}

                                        {(record.auditTrail.after.userA_usd || 0) !== (record.auditTrail.before.userA_usd || 0) && (() => {
                                            const diff = (record.auditTrail.after.userA_usd || 0) - (record.auditTrail.before.userA_usd || 0);
                                            return <div>🐶 恆恆美金: <span style={{textDecoration:'line-through', color:'#aaa'}}>${(record.auditTrail.before.userA_usd || 0).toFixed(2)}</span> ➔ <span style={{fontWeight:'bold', color: diff > 0 ? '#2ecc71' : '#e74c3c'}}>${(record.auditTrail.after.userA_usd || 0).toFixed(2)}</span> <span style={{fontSize:'0.75rem', color: diff > 0 ? '#2ecc71' : '#e74c3c'}}>({diff > 0 ? '+' : ''}${diff.toFixed(2)})</span></div>;
                                        })()}
                                        
                                        {record.auditTrail.after.userB !== record.auditTrail.before.userB && (() => {
                                            const diff = (record.auditTrail.after.userB || 0) - (record.auditTrail.before.userB || 0);
                                            return <div>🐕 得得台幣: <span style={{textDecoration:'line-through', color:'#aaa'}}>{formatMoney(record.auditTrail.before.userB || 0)}</span> ➔ <span style={{fontWeight:'bold', color: diff > 0 ? '#2ecc71' : '#e74c3c'}}>{formatMoney(record.auditTrail.after.userB || 0)}</span> <span style={{fontSize:'0.75rem', color: diff > 0 ? '#2ecc71' : '#e74c3c'}}>({diff > 0 ? '+' : ''}{formatMoney(diff)})</span></div>;
                                        })()}

                                        {(record.auditTrail.after.userB_usd || 0) !== (record.auditTrail.before.userB_usd || 0) && (() => {
                                            const diff = (record.auditTrail.after.userB_usd || 0) - (record.auditTrail.before.userB_usd || 0);
                                            return <div>🐕 得得美金: <span style={{textDecoration:'line-through', color:'#aaa'}}>${(record.auditTrail.before.userB_usd || 0).toFixed(2)}</span> ➔ <span style={{fontWeight:'bold', color: diff > 0 ? '#2ecc71' : '#e74c3c'}}>${(record.auditTrail.after.userB_usd || 0).toFixed(2)}</span> <span style={{fontSize:'0.75rem', color: diff > 0 ? '#2ecc71' : '#e74c3c'}}>({diff > 0 ? '+' : ''}${diff.toFixed(2)})</span></div>;
                                        })()}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                  );
                })
            )}
         </>
       )}

       {showSettlementModal && settlementTarget && (
         <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.6)', zIndex:1000, display:'flex', justifyContent:'center', alignItems:'center', padding:'20px' }} onClick={() => setShowSettlementModal(false)}>
             <div className="glass-card" style={{width:'100%', maxWidth:'400px', maxHeight:'80vh', overflowY:'auto', background:'white'}} onClick={e => e.stopPropagation()}>
                 <h3 style={{marginTop:0, borderBottom:'1px solid #eee', paddingBottom:'10px'}}>{settlementTarget === 'userA' ? '恆恆' : '得得'} 的代墊明細</h3>
                 <div style={{marginBottom:'20px'}}>
                     {getDebtList(settlementTarget).map((r, idx) => (
                         <div key={idx} style={{display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px dashed #eee', fontSize:'0.9rem'}}>
                             <div><span style={{color:'#888', marginRight:'10px'}}>{r.date}</span><span>{r.note}</span></div>
                             <div style={{fontWeight:'bold'}}>{formatMoney(r.total)}</div>
                         </div>
                     ))}
                 </div>
                 <button className="glass-btn" style={{width:'100%', background:'#666'}} onClick={() => setShowSettlementModal(false)}>關閉</button>
             </div>
         </div>
       )}
    </div>
  );
};

export default MonthlyView;