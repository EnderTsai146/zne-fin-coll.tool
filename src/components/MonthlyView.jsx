// src/components/MonthlyView.jsx
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement } from 'chart.js';
import { Pie, Bar } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const formatMoney = (num) => "$" + Number(num).toLocaleString();

const MonthlyView = ({ assets, onDelete, onEdit, setAssets, sendLineNotification, currentUser, getUpdatedAssetsWithLineCount }) => {
  const history = assets.monthlyExpenses || [];
  
  const [viewMode, setViewMode] = useState('chart');
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 7)); 
  const [filterType, setFilterType] = useState('all');   
  const [filterUser, setFilterUser] = useState('all');   

  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [settlementTarget, setSettlementTarget] = useState(null); 

  const [editModalData, setEditModalData] = useState(null);

  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [tempBudget, setTempBudget] = useState(assets.monthlyBudget || 40000);
  const currentBudget = assets.monthlyBudget || 40000;

  const handleSaveBudget = () => { setAssets({ ...assets, monthlyBudget: Number(tempBudget) }); setIsEditingBudget(false); };

  // ★ 增加校正專屬顏色標籤
  const getTypeColor = (type) => {
    if (type === 'income') return '#2ecc71'; 
    if (type === 'expense') return '#ff6b6b'; 
    if (type === 'spend') return '#ff9f43'; 
    if (type === 'transfer' || type === 'exchange') return '#3498db'; 
    if (type === 'calibrate') return '#95a5a6'; // 校正為低調的灰色
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

    // Fix #8: 結清功能尊重批次模式
    const settlePayload = { title: "✅ 代墊款結清", amount: `$${debtAmount.toLocaleString()}`, category: "帳務結算", note: `共同帳戶已實際撥款給 ${targetName}。`, date: timestamp.split('T')[0], color: "#2ecc71", operator: currentUser || "系統" };

    if (assets.lineConfig?.batchMode) {
      newAssets.pendingLineNotifications = [...(newAssets.pendingLineNotifications || []), settlePayload];
    } else {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const curCount = (newAssets.lineNotifCount?.month === currentMonth) ? (newAssets.lineNotifCount.count || 0) : 0;
      newAssets.lineNotifCount = { month: currentMonth, count: curCount + 1 };
      if (sendLineNotification) sendLineNotification(settlePayload);
    }

    setAssets(newAssets);
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
        // ★ 校正並不會被算入任何 income 或 expense
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
        const investTypes = ['liquidate', 'joint_invest_buy', 'joint_invest_sell', 'personal_invest_profit', 'personal_invest_loss', 'personal_invest_buy', 'personal_invest_sell', 'exchange', 'calibrate'];
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

  // Fix #16: 虛擬捲動 — 漸進式載入
  const [renderCount, setRenderCount] = useState(15);
  const loadMoreRef = useRef(null);

  // 當篩選條件變更時重置顯示數量
  useEffect(() => { setRenderCount(15); }, [filterDate, filterType, filterUser]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) setRenderCount(prev => prev + 15); },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  });

  const sortedHistory = useMemo(() => 
    [...filteredHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()),
    [filteredHistory]
  );
  const visibleHistory = sortedHistory.slice(0, renderCount);

  return (
    <div>
       <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px'}}>
         <h1 className="page-title" style={{margin:0}}>財務資料庫</h1>
         <div style={{background:'rgba(255,255,255,0.3)', borderRadius:'20px', padding:'4px', display:'flex'}}>
            {['chart', 'list'].map(mode => (
                <button key={mode} onClick={() => setViewMode(mode)} style={{ background: viewMode === mode ? 'rgba(255,255,255,0.6)' : 'transparent', border:'none', borderRadius:'var(--radius-pill)', padding:'6px 14px', cursor:'pointer', fontWeight:'600', color: viewMode === mode ? 'var(--text-primary)' : 'var(--text-tertiary)', boxShadow: viewMode === mode ? '0 2px 8px rgba(0,0,0,0.06)' : 'none', backdropFilter: viewMode === mode ? 'blur(8px)' : 'none' }}>
                    {mode === 'chart' ? '儀表板' : '流水帳'}
                </button>
            ))}
         </div>
       </div>
       
       {viewMode === 'chart' && (
         <div className="page-transition-enter">
            <div className="glass-card" style={{padding:'10px', textAlign:'center', marginBottom:'15px', display:'flex', justifyContent:'center', alignItems:'center', gap:'10px'}}>
                <label style={{fontWeight:'600', color:'var(--text-secondary)'}}>分析月份：</label><input type="month" className="glass-input" style={{width:'auto', margin:0, padding:'5px 10px'}} value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
            </div>

            <div className="glass-card" style={{padding:'15px', marginBottom:'15px'}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px'}}>
                    <h3 style={{margin:0, fontSize:'1.05rem', fontWeight:'700'}}>🎯 本月預算進度</h3>
                    {isEditingBudget ? (
                        <div style={{display:'flex', gap:'5px', alignItems:'center'}}>
                            <input type="number" className="glass-input" style={{margin:0, padding:'4px 8px', width:'100px'}} value={tempBudget} onChange={e => setTempBudget(e.target.value)} />
                            <button className="glass-btn" style={{padding:'4px 10px', fontSize:'0.8rem'}} onClick={handleSaveBudget}>儲存</button>
                        </div>
                    ) : (
                        <div style={{fontSize:'0.88rem', color:'var(--text-tertiary)', cursor:'pointer', background:'rgba(120,120,128,0.06)', padding:'4px 10px', borderRadius:'var(--radius-xs)'}} onClick={() => setIsEditingBudget(true)}>
                            設定預算: {formatMoney(currentBudget)} ✏️
                        </div>
                    )}
                </div>
                <div style={{background:'rgba(0,0,0,0.05)', borderRadius:'10px', height:'14px', width:'100%', overflow:'hidden'}}>
                    <div style={{background: progressColor, width: `${budgetPercent}%`, height:'100%', transition:'width 0.5s ease'}}></div>
                </div>
                <div style={{display:'flex', justifyContent:'space-between', marginTop:'8px', fontSize:'0.84rem', color:'var(--text-secondary)', fontWeight:'500'}}>
                    <span>已花 {formatMoney(dashboardData.stats.expense.total)}</span><span>剩餘 {formatMoney(Math.max(currentBudget - dashboardData.stats.expense.total, 0))} ({budgetPercent}%)</span>
                </div>
            </div>

            <div style={{display:'flex', gap:'10px', marginBottom:'15px', flexWrap:'wrap'}}>
                <div className="glass-card card-animate" style={{flex:1, minWidth:'120px', padding:'15px', textAlign:'center', background:'linear-gradient(135deg, rgba(52,199,89,0.12), rgba(52,199,89,0.04))'}}>
                    <div style={{fontSize:'0.78rem', color:'var(--text-secondary)', fontWeight:'500'}}>總收入</div>
                    <div style={{fontSize:'1.25rem', fontWeight:'700', color:'var(--accent-green)', marginBottom:'5px'}}>{formatMoney(dashboardData.stats.income.total)}</div>
                    <div style={{fontSize:'0.73rem', color:'var(--text-tertiary)', borderTop:'0.5px solid rgba(0,0,0,0.04)', paddingTop:'5px'}}>恆: {formatMoney(dashboardData.stats.income.userA)} | 得: {formatMoney(dashboardData.stats.income.userB)}</div>
                </div>
                <div className="glass-card card-animate" style={{flex:1, minWidth:'120px', padding:'15px', textAlign:'center', background:'linear-gradient(135deg, rgba(255,59,48,0.1), rgba(255,59,48,0.03))'}}>
                    <div style={{fontSize:'0.78rem', color:'var(--text-secondary)', fontWeight:'500'}}>總支出</div>
                    <div style={{fontSize:'1.25rem', fontWeight:'700', color:'var(--accent-red)', marginBottom:'5px'}}>{formatMoney(dashboardData.stats.expense.total)}</div>
                    <div style={{fontSize:'0.73rem', color: dashboardData.momColor, fontWeight:'600', borderTop:'0.5px solid rgba(0,0,0,0.04)', paddingTop:'5px'}}>
                        {dashboardData.momText}
                    </div>
                </div>
                <div className="glass-card card-animate" style={{flex:1, minWidth:'140px', padding:'15px', textAlign:'center', background:'linear-gradient(135deg, rgba(88,86,214,0.1), rgba(0,122,255,0.06))'}}>
                    <div style={{fontSize:'0.78rem', color:'var(--text-secondary)', fontWeight:'500'}}>淨現金流 (本月存下)</div>
                    <div style={{fontSize:'1.25rem', fontWeight:'700', color: dashboardData.netCashFlow >= 0 ? 'var(--accent-blue)' : 'var(--accent-red)', marginBottom:'5px'}}>
                        {dashboardData.netCashFlow > 0 ? '+' : ''}{formatMoney(dashboardData.netCashFlow)}
                    </div>
                    <div style={{fontSize:'0.78rem', color:'var(--text-tertiary)', borderTop:'0.5px solid rgba(0,0,0,0.04)', paddingTop:'5px'}}>儲蓄率: <span style={{fontWeight:'700', color:'var(--accent-blue)'}}>{dashboardData.savingsRate}%</span></div>
                </div>
            </div>

            {dashboardData.stats.expense.total === 0 ? (
                <div className="glass-card" style={{textAlign:'center', padding:'30px', color:'var(--text-tertiary)'}}>🦕 這個月還沒有有效的支出紀錄喔！</div>
            ) : (
                <>
                    <div style={{display:'flex', gap:'10px', marginBottom:'15px', flexWrap:'wrap'}}>
                        <div className="glass-card" style={{flex:1, minWidth:'250px'}}>
                            <h4 style={{margin:'0 0 10px 0', textAlign:'center', color:'var(--text-secondary)', fontWeight:'600'}}>支出結構</h4>
                            <div style={{height:'200px', display:'flex', justifyContent:'center'}}><Pie data={dashboardData.pieData} options={{ maintainAspectRatio: false }} /></div>
                        </div>
                        <div className="glass-card" style={{flex:1.5, minWidth:'250px'}}>
                            <h4 style={{margin:'0 0 10px 0', textAlign:'center', color:'var(--text-secondary)', fontWeight:'600'}}>💸 花費排行榜 & 抓漏</h4>
                            <div>
                                {dashboardData.leaderboard.map((item, idx) => (
                                    <div key={idx} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'0.5px solid rgba(0,0,0,0.04)'}}>
                                        <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                            <span style={{fontSize:'1.2rem'}}>{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🔹'}</span>
                                            <div>
                                                <div style={{fontWeight:'600', color:'var(--text-primary)'}}>{item.name}</div>
                                                <div style={{fontSize:'0.68rem', color:'var(--text-tertiary)'}}>佔總額 {item.percentage}%</div>
                                            </div>
                                        </div>
                                        <div style={{textAlign:'right'}}>
                                            <div style={{fontWeight:'700', color:'var(--accent-red)'}}>{formatMoney(item.amount)}</div>
                                            <div style={{fontSize:'0.73rem', color:'var(--text-secondary)'}}>日均消耗: <span style={{fontWeight:'600'}}>{formatMoney(item.dailyAvg)}</span></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="glass-card">
                        <h4 style={{margin:'0 0 10px 0', textAlign:'center', color:'var(--text-secondary)', fontWeight:'600'}}>每日支出趨勢</h4>
                        <div style={{height:'200px'}}><Bar data={dashboardData.barChartData} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }} /></div>
                    </div>
                </>
            )}

            <div className="glass-card card-animate" style={{marginBottom:'15px', borderLeft:'4px solid var(--accent-yellow)'}}>
                <h3 style={{marginTop:0, fontSize:'0.95rem', color:'var(--accent-orange)', fontWeight:'700', display:'flex', alignItems:'center'}}>
                    🤝 代墊款結算中心 <span style={{fontSize:'0.68rem', marginLeft:'5px', background:'var(--accent-yellow)', color:'white', padding:'2px 6px', borderRadius:'var(--radius-pill)', fontWeight:'600'}}>All Time</span>
                </h3>
                {['userA', 'userB'].map(user => {
                    const debt = calculateDebt(user);
                    const name = user === 'userA' ? '恆恆' : '得得';
                    return (
                        <div key={user} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom: '0.5px solid rgba(0,0,0,0.04)'}}>
                            <div>
                                <div style={{fontWeight:'600', color:'var(--text-primary)'}}>{name} 墊付未結</div>
                                {debt > 0 ? ( <div style={{fontSize:'0.78rem', color:'var(--text-tertiary)', textDecoration:'underline', cursor:'pointer'}} onClick={() => { setSettlementTarget(user); setShowSettlementModal(true); }}>查看明細</div> ) : ( <div style={{fontSize:'0.78rem', color:'var(--accent-green)'}}>✨ 已全數結清</div> )}
                            </div>
                            <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                <span style={{fontSize:'1.15rem', fontWeight:'700', color: debt>0 ? 'var(--accent-orange)' : 'var(--text-tertiary)'}}>{formatMoney(debt)}</span>
                                {debt > 0 && <button className="glass-btn glass-btn-cta" style={{padding:'5px 12px', fontSize:'0.78rem'}} onClick={() => handleSettle(user)}>結清</button>}
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
                        <option value="invest">投資、外幣與系統</option>
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
                <div className="glass-card" style={{textAlign:'center', color: 'var(--text-tertiary)'}}><p>📭 沒有符合篩選條件的紀錄</p></div>
            ) : (
                <>
                {visibleHistory.map((record) => {
                  let showSign = ''; let amountColor = 'var(--text-primary)';
                  if (['income', 'liquidate', 'joint_invest_sell', 'personal_invest_profit', 'personal_invest_sell'].includes(record.type)) { showSign = '+'; amountColor = 'var(--accent-green)'; } 
                  else if (['expense', 'personal_invest_loss', 'spend', 'joint_invest_buy', 'personal_invest_buy'].includes(record.type)) { showSign = '-'; amountColor = 'var(--text-primary)'; } 
                  else if (['settle', 'transfer', 'exchange', 'calibrate'].includes(record.type)) { 
                      showSign = '🔄 '; 
                      amountColor = record.type === 'calibrate' ? 'var(--text-tertiary)' : 'var(--accent-blue)'; 
                  }
                  
                  const isDeleted = record.isDeleted;
                  const opacity = isDeleted ? 0.6 : 1;
                  const textDeco = isDeleted ? 'line-through' : 'none';
                  if (isDeleted) amountColor = '#aaa';
                  const borderColor = isDeleted ? '#ccc' : getTypeColor(record.type);

                  return (
                    <div key={record.originalIndex} className="glass-card" style={{ marginBottom: '15px', borderLeft: `4px solid ${borderColor}`, position: 'relative', paddingBottom: '10px', opacity: opacity }}>
                        <div style={{ position: 'absolute', top: '15px', right: '15px', display:'flex', gap:'8px', alignItems:'center', zIndex: 10 }}>
                            {record.type === 'settle' && !isDeleted && ( <div style={{ background: 'rgba(52,199,89,0.08)', color: 'var(--accent-green)', padding: '2px 8px', borderRadius: 'var(--radius-pill)', fontSize: '0.73rem', fontWeight: '600' }}>✅ 系統結算</div> )}
                            {!isDeleted ? (
                                <>
                                  <button onClick={() => setEditModalData({ index: record.originalIndex, date: record.date || record.month, category: record.category, note: record.note })} style={{ background: 'rgba(0,122,255,0.08)', border: 'none', borderRadius: '50%', width: '30px', height: '30px', cursor: 'pointer', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>✏️</button>
                                  <button onClick={() => { if(window.confirm(`⚠️ 確認作廢此筆紀錄？\n作廢後系統會自動將金額加回或扣除，恢復到交易前的狀態。`)) onDelete(record.originalIndex); }} style={{ background: 'rgba(255, 0, 0, 0.1)', border: 'none', borderRadius: '50%', width: '30px', height: '30px', cursor: 'pointer', color: 'red', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>🗑️</button>
                                </>
                            ) : (
                                <div style={{ background: 'rgba(255,149,0,0.1)', color: 'var(--accent-orange)', padding: '2px 8px', borderRadius: 'var(--radius-pill)', fontSize: '0.73rem', fontWeight: '600' }}>🚫 已作廢</div>
                            )}
                        </div>

                        <div style={{ paddingBottom: '5px' }}>
                            <div style={{display:'flex', alignItems:'center', gap:'10px', marginBottom:'8px', flexWrap:'wrap'}}>
                                <span style={{fontWeight:'700', fontSize:'1.05rem', fontFamily:'monospace', color:'var(--text-primary)', textDecoration: textDeco}}>{record.date || record.month}</span>
                                <span style={{fontSize:'0.8rem', color:'white', background: borderColor, padding:'2px 8px', borderRadius:'10px', fontWeight:'600'}}>{record.category}</span>
                                {record.advancedBy && (
                                    <span style={{ fontSize:'0.73rem', border: record.isSettled ? '1px solid var(--accent-green)' : '1px solid var(--accent-orange)', color: record.isSettled ? 'var(--accent-green)' : 'var(--accent-orange)', padding:'1px 6px', borderRadius:'var(--radius-pill)', background:'rgba(255,255,255,0.6)', fontWeight:'600' }}>
                                        {record.advancedBy === 'userA' ? '恆恆' : '得得'}墊付 {record.isSettled ? ' (已結)' : ' (未結)'}
                                    </span>
                                )}
                            </div>

                            <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end', paddingRight: '70px', marginBottom:'5px'}}>
                                <span style={{fontSize:'1.05rem', color:'var(--text-primary)', fontWeight:'700', textDecoration: textDeco}}>{record.note === '月結記帳' ? '日記帳' : record.note}</span>
                                <div style={{textAlign: 'right'}}>
                                    <span style={{fontSize:'1.6rem', fontWeight:'800', color: amountColor, textDecoration: textDeco}}>{showSign}{formatMoney(record.total)}</span>
                                    {record.usdAmount && (
                                        <div style={{fontSize: '0.82rem', color: isDeleted ? 'var(--text-tertiary)' : 'var(--accent-orange)', fontWeight: '600', textDecoration: textDeco}}>
                                            (含美金 ${record.usdAmount.toFixed(2)} USD)
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div style={{fontSize:'0.82rem', color:'var(--text-tertiary)', display:'flex', alignItems:'center', gap:'5px', marginTop:'5px'}}>
                                {record.payer === '共同帳戶' ? <span style={{background:'rgba(120,120,128,0.06)', padding:'2px 6px', borderRadius:'var(--radius-xs)', textDecoration: textDeco}}>🏫 共同帳戶</span> : <span style={{background:'rgba(0,122,255,0.06)', color:'var(--accent-blue)', padding:'2px 6px', borderRadius:'var(--radius-xs)', textDecoration: textDeco}}>👤 {record.payer}</span>}
                            </div>
                            
                            {isDeleted && ( <div style={{ marginTop: '10px', fontSize: '0.82rem', color: 'var(--accent-red)', background: 'rgba(255,59,48,0.06)', padding: '8px', borderRadius: 'var(--radius-xs)', border: '1px dashed var(--accent-red)' }}><strong>作廢原因：</strong> {record.deleteReason}</div> )}

                            {record.auditTrail && !isDeleted && (
                                <div style={{ marginTop: '10px', fontSize:'0.78rem', color:'var(--text-secondary)', background:'rgba(120,120,128,0.04)', padding:'10px', borderRadius:'var(--radius-xs)', borderTop:'0.5px solid rgba(0,0,0,0.04)' }}>
                                    <div style={{marginBottom:'6px', fontWeight:'600', color:'var(--text-primary)'}}>🔍 交易前後餘額對比：</div>
                                    <div style={{display:'flex', flexDirection:'column', gap:'4px'}}>
                                        {record.auditTrail.after.jointCash !== record.auditTrail.before.jointCash && (() => {
                                            const diff = (record.auditTrail.after.jointCash || 0) - (record.auditTrail.before.jointCash || 0);
                                            return <div>🏫 共同現金: <span style={{textDecoration:'line-through', color:'var(--text-tertiary)'}}>{formatMoney(record.auditTrail.before.jointCash || 0)}</span> ➡️ <span style={{fontWeight:'600', color: diff > 0 ? 'var(--accent-green)' : 'var(--accent-red)'}}>{formatMoney(record.auditTrail.after.jointCash || 0)}</span> <span style={{fontSize:'0.73rem', color: diff > 0 ? 'var(--accent-green)' : 'var(--accent-red)'}}>({diff > 0 ? '+' : ''}{formatMoney(diff)})</span></div>;
                                        })()}
                                        
                                        {record.auditTrail.after.userA !== record.auditTrail.before.userA && (() => {
                                            const diff = (record.auditTrail.after.userA || 0) - (record.auditTrail.before.userA || 0);
                                            return <div>🐶 恆恆台幣: <span style={{textDecoration:'line-through', color:'var(--text-tertiary)'}}>{formatMoney(record.auditTrail.before.userA || 0)}</span> ➡️ <span style={{fontWeight:'600', color: diff > 0 ? 'var(--accent-green)' : 'var(--accent-red)'}}>{formatMoney(record.auditTrail.after.userA || 0)}</span> <span style={{fontSize:'0.73rem', color: diff > 0 ? 'var(--accent-green)' : 'var(--accent-red)'}}>({diff > 0 ? '+' : ''}{formatMoney(diff)})</span></div>;
                                        })()}

                                        {(record.auditTrail.after.userA_usd || 0) !== (record.auditTrail.before.userA_usd || 0) && (() => {
                                            const diff = (record.auditTrail.after.userA_usd || 0) - (record.auditTrail.before.userA_usd || 0);
                                            return <div>🐶 恆恆美金: <span style={{textDecoration:'line-through', color:'var(--text-tertiary)'}}>${(record.auditTrail.before.userA_usd || 0).toFixed(2)}</span> ➡️ <span style={{fontWeight:'600', color: diff > 0 ? 'var(--accent-green)' : 'var(--accent-red)'}}>${(record.auditTrail.after.userA_usd || 0).toFixed(2)}</span> <span style={{fontSize:'0.73rem', color: diff > 0 ? 'var(--accent-green)' : 'var(--accent-red)'}}>({diff > 0 ? '+' : ''}${diff.toFixed(2)})</span></div>;
                                        })()}
                                        
                                        {record.auditTrail.after.userB !== record.auditTrail.before.userB && (() => {
                                            const diff = (record.auditTrail.after.userB || 0) - (record.auditTrail.before.userB || 0);
                                            return <div>🐕 得得台幣: <span style={{textDecoration:'line-through', color:'var(--text-tertiary)'}}>{formatMoney(record.auditTrail.before.userB || 0)}</span> ➡️ <span style={{fontWeight:'600', color: diff > 0 ? 'var(--accent-green)' : 'var(--accent-red)'}}>{formatMoney(record.auditTrail.after.userB || 0)}</span> <span style={{fontSize:'0.73rem', color: diff > 0 ? 'var(--accent-green)' : 'var(--accent-red)'}}>({diff > 0 ? '+' : ''}{formatMoney(diff)})</span></div>;
                                        })()}

                                        {(record.auditTrail.after.userB_usd || 0) !== (record.auditTrail.before.userB_usd || 0) && (() => {
                                            const diff = (record.auditTrail.after.userB_usd || 0) - (record.auditTrail.before.userB_usd || 0);
                                            return <div>🐕 得得美金: <span style={{textDecoration:'line-through', color:'var(--text-tertiary)'}}>${(record.auditTrail.before.userB_usd || 0).toFixed(2)}</span> ➡️ <span style={{fontWeight:'600', color: diff > 0 ? 'var(--accent-green)' : 'var(--accent-red)'}}>${(record.auditTrail.after.userB_usd || 0).toFixed(2)}</span> <span style={{fontSize:'0.73rem', color: diff > 0 ? 'var(--accent-green)' : 'var(--accent-red)'}}>({diff > 0 ? '+' : ''}${diff.toFixed(2)})</span></div>;
                                        })()}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                  );
                })}
                {renderCount < sortedHistory.length && (
                  <div ref={loadMoreRef} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)', fontSize: '0.84rem' }}>
                    ⬇️ 捲動載入更多 ({renderCount}/{sortedHistory.length})
                  </div>
                )}
                </>
            )}
         </>
       )}

       {editModalData && (
         <div className="modal-backdrop" onClick={() => setEditModalData(null)}>
             <div className="modal-content glass-card" onClick={e => e.stopPropagation()}>
                 <h3 style={{marginTop:0, color:'var(--accent-blue)', fontWeight:'700'}}>✏️ 修改文字紀錄</h3>
                 
                 <div style={{background: 'rgba(255,59,48,0.06)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,59,48,0.15)', marginBottom: '16px'}}>
                     <p style={{fontSize:'0.84rem', color:'var(--accent-red)', margin:0, fontWeight:'600'}}>⚠️ 會計安全鎖定</p>
                     <p style={{fontSize:'0.78rem', color:'var(--text-secondary)', margin:'5px 0 0 0'}}>為避免產生幽靈帳，系統禁止直接修改「金額」與「帳戶」。<br/>若金額輸入錯誤，請取消修改，並將原紀錄「作廢🗑️」後重新記帳。</p>
                 </div>
                 
                 <div style={{marginBottom:'10px'}}>
                     <label style={{fontSize:'0.84rem', color:'var(--text-secondary)', fontWeight:'600'}}>日期</label>
                     <input type="date" className="glass-input" value={editModalData.date} onChange={e => setEditModalData({...editModalData, date: e.target.value})} style={{width:'100%', boxSizing:'border-box'}} />
                 </div>
                 
                 <div style={{marginBottom:'10px'}}>
                     <label style={{fontSize:'0.84rem', color:'var(--text-secondary)', fontWeight:'600'}}>分類</label>
                     <input type="text" className="glass-input" value={editModalData.category} onChange={e => setEditModalData({...editModalData, category: e.target.value})} style={{width:'100%', boxSizing:'border-box'}} />
                 </div>
                 
                 <div style={{marginBottom:'18px'}}>
                     <label style={{fontSize:'0.84rem', color:'var(--text-secondary)', fontWeight:'600'}}>備註</label>
                     <input type="text" className="glass-input" value={editModalData.note} onChange={e => setEditModalData({...editModalData, note: e.target.value})} style={{width:'100%', boxSizing:'border-box'}} />
                 </div>

                 <div style={{display:'flex', gap:'10px'}}>
                     <button className="glass-btn" style={{flex:1}} onClick={() => setEditModalData(null)}>取消</button>
                     <button className="glass-btn glass-btn-cta" style={{flex:1}} onClick={() => { onEdit(editModalData.index, editModalData); setEditModalData(null); }}>儲存修改</button>
                 </div>
             </div>
         </div>
       )}

       {showSettlementModal && settlementTarget && (
         <div className="modal-backdrop" onClick={() => setShowSettlementModal(false)}>
             <div className="modal-content glass-card" style={{maxHeight:'80vh', overflowY:'auto'}} onClick={e => e.stopPropagation()}>
                 <h3 style={{marginTop:0, borderBottom:'0.5px solid rgba(0,0,0,0.06)', paddingBottom:'10px', fontWeight:'700'}}>{settlementTarget === 'userA' ? '恆恆' : '得得'} 的代墊明細</h3>
                 <div style={{marginBottom:'20px'}}>
                     {getDebtList(settlementTarget).map((r, idx) => (
                         <div key={idx} style={{display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'0.5px solid rgba(0,0,0,0.04)', fontSize:'0.9rem'}}>
                             <div><span style={{color:'var(--text-tertiary)', marginRight:'10px'}}>{r.date}</span><span>{r.note}</span></div>
                             <div style={{fontWeight:'600'}}>{formatMoney(r.total)}</div>
                         </div>
                     ))}
                 </div>
                 <button className="glass-btn" style={{width:'100%'}} onClick={() => setShowSettlementModal(false)}>關閉</button>
             </div>
         </div>
       )}
    </div>
  );
};

export default MonthlyView;