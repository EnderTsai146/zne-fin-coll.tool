// src/components/MonthlyView.jsx
import React, { useState, useMemo } from 'react';
import { 
  Chart as ChartJS, 
  ArcElement, 
  Tooltip, 
  Legend, 
  CategoryScale, 
  LinearScale, 
  BarElement 
} from 'chart.js';
import { Pie, Bar } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const formatMoney = (num) => "$" + Number(num).toLocaleString();

const MonthlyView = ({ assets, onDelete, setAssets, sendLineNotification, currentUser }) => {
  const history = assets.monthlyExpenses || [];
  
  const [viewMode, setViewMode] = useState('chart');
  
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 7)); // 預設本月
  const [filterType, setFilterType] = useState('all');   // all, income, expense, invest
  const [filterUser, setFilterUser] = useState('all');   // all, joint, userA, userB

  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [settlementTarget, setSettlementTarget] = useState(null); 

  // ★ 1. 新增：處理投資類型的專屬顏色
  const getTypeColor = (type) => {
    if (type === 'income') return '#2ecc71'; 
    if (type === 'expense') return '#ff6b6b'; 
    if (type === 'spend') return '#ff9f43'; 
    if (type === 'transfer') return '#3498db'; 
    if (type === 'liquidate' || type === 'joint_invest_sell') return '#f1c40f'; // 黃色 (變現)
    if (type === 'joint_invest_buy') return '#8e44ad'; // 紫色 (買入)
    if (type === 'personal_invest_profit') return '#e67e22'; // 橘色 (獲利)
    if (type === 'personal_invest_loss') return '#7f8c8d'; // 灰色 (虧損)
    return '#666';
  };

  const calculateDebt = (userKey) => {
    return history
        .filter(r => r.advancedBy === userKey && r.isSettled === false)
        .reduce((sum, r) => sum + Number(r.total), 0);
  };

  const getDebtList = (userKey) => {
    return history.filter(r => r.advancedBy === userKey && r.isSettled === false);
  };

// ★ 修正：真實發生資金流動 (共同現金 -> 個人)
  const handleSettle = (targetUser) => {
    const targetName = targetUser === 'userA' ? '恆恆' : '得得';
    const debtAmount = calculateDebt(targetUser);
    
    if (debtAmount === 0) return alert("目前沒有未結清的款項喔！");
    if (assets.jointCash < debtAmount) return alert(`❌ 共同現金餘額不足以結清 (需 $${debtAmount.toLocaleString()})！`);

    const confirmMsg = `【確認結清】\n\n要將 ${targetName} 代墊的 $${debtAmount.toLocaleString()} 標記為「已結清」嗎？\n\n(這將會從「共同現金」扣除該金額，並加回「${targetName}」的個人帳戶)`;
    if (!window.confirm(confirmMsg)) return;

    // 執行轉帳
    const newAssets = { ...assets };
    newAssets.jointCash -= debtAmount;
    newAssets[targetUser] += debtAmount;

    // 更新狀態
    const newHistory = newAssets.monthlyExpenses.map(record => {
        if (record.advancedBy === targetUser && record.isSettled === false) {
            return { ...record, isSettled: true }; 
        }
        return record;
    });
    newAssets.monthlyExpenses = newHistory;

    setAssets(newAssets); // 這會同時觸發雲端存檔
    
    if (sendLineNotification) {
        sendLineNotification({
            title: "✅ 代墊款結清",
            amount: `$${debtAmount.toLocaleString()}`,
            category: "帳務結算",
            note: `共同帳戶已實際撥款給 ${targetName}。`,
            date: new Date().toISOString().split('T')[0],
            color: "#2ecc71",
            operator: currentUser || "系統"
        });
    }

    alert("✅ 結清完成！資金已轉移，並發送通知。");
    setShowSettlementModal(false);
  };

  const handleDeleteClick = (originalIndex, record) => {
    const confirmMsg = `【危險動作】\n\n您確定要刪除這筆紀錄嗎？\n\n日期：${record.date}\n項目：${record.note}\n金額：${formatMoney(record.total)}\n\n⚠️ 刪除後，系統將自動復原金額。`;
    if (window.confirm(confirmMsg)) {
        onDelete(originalIndex);
    }
  };

  // --- 數據統計 (Dashboard) ---
  // ★ 2. 這裡原本的邏輯只有抓 income 和 expense/spend，所以新的投資標籤會自動被排除，完美解決你的痛點！
  const dashboardData = useMemo(() => {
    const monthRecords = history.filter(r => r.month === selectedMonth);

    const stats = {
        income: { total: 0, userA: 0, userB: 0 },
        expense: { total: 0, joint: 0, userA: 0, userB: 0 }
    };
    
    let dailyData = {};  
    const catStats = { '餐費':0, '購物':0, '固定費用':0, '其他':0 };

    monthRecords.forEach(r => {
        const day = parseInt(r.date.split('-')[2]); 
        
        if (r.type === 'income') {
            stats.income.total += r.total;
            if (r.payer.includes('恆恆')) stats.income.userA += r.total;
            else if (r.payer.includes('得得')) stats.income.userB += r.total;
        }
        else if (r.type === 'expense' || r.type === 'spend') {
            stats.expense.total += r.total;
            dailyData[day] = (dailyData[day] || 0) + r.total;

            if (r.type === 'spend') {
                stats.expense.joint += r.total;
            } else if (r.type === 'expense') {
                if (r.payer.includes('恆恆')) stats.expense.userA += r.total;
                else if (r.payer.includes('得得')) stats.expense.userB += r.total;
            }

            if (r.type === 'expense' && r.details) {
                catStats['餐費'] += Number(r.details.food || 0);
                catStats['購物'] += Number(r.details.shopping || 0);
                catStats['固定費用'] += Number(r.details.fixed || 0);
                catStats['其他'] += Number(r.details.other || 0);
            } else if (r.type === 'spend') {
                const note = r.note || '';
                if (note.includes('餐費')) catStats['餐費'] += r.total;
                else if (note.includes('購物')) catStats['購物'] += r.total;
                else if (note.includes('固定')) catStats['固定費用'] += r.total;
                else catStats['其他'] += r.total;
            }
        }
    });

    const pieData = {
        labels: Object.keys(catStats),
        datasets: [{
            data: Object.values(catStats),
            backgroundColor: ['#ff9f43', '#54a0ff', '#ff6b6b', '#c8d6e5'],
            borderWidth: 1,
        }],
    };

    const daysInMonth = new Date(selectedMonth.split('-')[0], selectedMonth.split('-')[1], 0).getDate();
    const barLabels = Array.from({length: daysInMonth}, (_, i) => i + 1);
    const barValues = barLabels.map(day => dailyData[day] || 0);

    const barChartData = {
        labels: barLabels,
        datasets: [{
            label: '每日支出',
            data: barValues,
            backgroundColor: '#17c9b2',
            borderRadius: 4,
        }]
    };

    return { stats, pieData, barChartData };
  }, [history, selectedMonth]);

  // --- 進階篩選邏輯 (流水帳用) ---
  const historyWithIndex = history.map((record, index) => ({ ...record, originalIndex: index }));
  const filteredHistory = historyWithIndex.filter(record => {
    const recordMonth = record.month || record.date.slice(0, 7);
    if (recordMonth !== filterDate) return false;

    // ★ 3. 新增：支援篩選「投資」紀錄
    if (filterType === 'income') {
        if (record.type !== 'income') return false;
    } else if (filterType === 'expense') {
        if (record.type !== 'expense' && record.type !== 'spend') return false;
    } else if (filterType === 'invest') {
        const investTypes = ['liquidate', 'joint_invest_buy', 'joint_invest_sell', 'personal_invest_profit', 'personal_invest_loss'];
        if (!investTypes.includes(record.type)) return false;
    }

    if (filterUser !== 'all') {
        const payer = record.payer || '';
        if (filterUser === 'joint') {
            if (record.type !== 'spend' && record.category !== '共同支出' && !record.type.includes('joint_invest')) return false;
        }
        else if (filterUser === 'userA') {
            if (!payer.includes('恆恆') && !payer.includes('userA')) return false;
        }
        else if (filterUser === 'userB') {
            if (!payer.includes('得得') && !payer.includes('userB')) return false;
        }
    }

    return true;
  });

  return (
    <div>
       <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px'}}>
         <h1 className="page-title" style={{margin:0}}>財務戰情室</h1>
         <div style={{background:'rgba(255,255,255,0.3)', borderRadius:'20px', padding:'4px', display:'flex'}}>
            {['chart', 'list'].map(mode => (
                <button 
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    style={{
                        background: viewMode === mode ? '#fff' : 'transparent',
                        border:'none', borderRadius:'16px', padding:'6px 12px', cursor:'pointer', fontWeight:'bold',
                        color: viewMode === mode ? '#333' : '#666', boxShadow: viewMode === mode ? '0 2px 5px rgba(0,0,0,0.1)' : 'none'
                    }}
                >
                    {mode === 'chart' ? '儀表板' : '流水帳'}
                </button>
            ))}
         </div>
       </div>
       
       {viewMode === 'chart' && (
         <div style={{animation: 'fadeIn 0.5s'}}>
            <div className="glass-card" style={{padding:'10px', textAlign:'center', marginBottom:'15px', display:'flex', justifyContent:'center', alignItems:'center', gap:'10px'}}>
                <label style={{fontWeight:'bold', color:'#555'}}>分析月份：</label>
                <input type="month" className="glass-input" style={{width:'auto', margin:0, padding:'5px 10px'}} value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
            </div>

            <div style={{display:'flex', gap:'10px', marginBottom:'15px'}}>
                <div className="glass-card" style={{flex:1, padding:'15px', textAlign:'center', background:'linear-gradient(135deg, #a8e6cf 0%, #dcedc1 100%)'}}>
                    <div style={{fontSize:'0.8rem', color:'#1d1d1f', opacity:0.7}}>本月總收入</div>
                    <div style={{fontSize:'1.3rem', fontWeight:'bold', color:'#06c755', marginBottom:'5px'}}>{formatMoney(dashboardData.stats.income.total)}</div>
                    <div style={{fontSize:'0.75rem', color:'#444', borderTop:'1px solid rgba(0,0,0,0.1)', paddingTop:'5px'}}>
                        恆: {formatMoney(dashboardData.stats.income.userA)} <br/> 
                        得: {formatMoney(dashboardData.stats.income.userB)}
                    </div>
                </div>

                <div className="glass-card" style={{flex:1, padding:'15px', textAlign:'center', background:'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)'}}>
                    <div style={{fontSize:'0.8rem', color:'#1d1d1f', opacity:0.7}}>本月總支出</div>
                    <div style={{fontSize:'1.3rem', fontWeight:'bold', color:'#ef454d', marginBottom:'5px'}}>{formatMoney(dashboardData.stats.expense.total)}</div>
                    <div style={{fontSize:'0.75rem', color:'#444', borderTop:'1px solid rgba(0,0,0,0.1)', paddingTop:'5px'}}>
                        共: {formatMoney(dashboardData.stats.expense.joint)} <br/>
                        恆: {formatMoney(dashboardData.stats.expense.userA)} | 得: {formatMoney(dashboardData.stats.expense.userB)}
                    </div>
                </div>
            </div>

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
                                {debt > 0 ? (
                                    <div style={{fontSize:'0.8rem', color:'#888', textDecoration:'underline', cursor:'pointer'}} onClick={() => { setSettlementTarget(user); setShowSettlementModal(true); }}>
                                        查看明細
                                    </div>
                                ) : (
                                    <div style={{fontSize:'0.8rem', color:'#2ecc71'}}>✨ 已全數結清</div>
                                )}
                            </div>
                            <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                <span style={{fontSize:'1.2rem', fontWeight:'bold', color: debt>0 ? '#e67e22' : '#ccc'}}>{formatMoney(debt)}</span>
                                {debt > 0 && (
                                    <button className="glass-btn" style={{padding:'5px 10px', fontSize:'0.8rem', background:'#2ecc71', color:'white', border:'none'}} onClick={() => handleSettle(user)}>
                                        結清
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {dashboardData.stats.expense.total === 0 ? (
                <div className="glass-card" style={{textAlign:'center', padding:'30px', color:'#888'}}>
                    🦕 這個月還沒有支出紀錄喔！
                </div>
            ) : (
                <>
                    <div className="glass-card" style={{marginBottom:'15px'}}>
                        <h4 style={{margin:'0 0 10px 0', textAlign:'center', color:'#666'}}>支出結構</h4>
                        <div style={{height:'250px', display:'flex', justifyContent:'center'}}>
                            <Pie data={dashboardData.pieData} options={{ maintainAspectRatio: false }} />
                        </div>
                    </div>
                    <div className="glass-card">
                        <h4 style={{margin:'0 0 10px 0', textAlign:'center', color:'#666'}}>每日支出趨勢</h4>
                        <div style={{height:'200px'}}>
                            <Bar data={dashboardData.barChartData} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }} />
                        </div>
                    </div>
                </>
            )}
         </div>
       )}

       {viewMode === 'list' && (
         <>
            <div className="glass-card" style={{padding:'15px', marginBottom:'20px'}}>
                <div style={{display:'flex', gap:'10px', flexWrap:'wrap'}}>
                    <input 
                        type="month" 
                        className="glass-input" 
                        style={{flex:'2', minWidth:'120px', margin:0, padding:'8px'}} 
                        value={filterDate}
                        onChange={(e) => setFilterDate(e.target.value)}
                    />
                    
                    <select 
                        className="glass-input" 
                        style={{flex:'1', minWidth:'80px', margin:0, padding:'8px'}}
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                    >
                        <option value="all">全部類型</option>
                        <option value="expense">支出 (共+個)</option>
                        <option value="income">收入</option>
                        <option value="invest">投資 (買賣/損益)</option>
                    </select>
                    
                    <select 
                        className="glass-input" 
                        style={{flex:'1', minWidth:'80px', margin:0, padding:'8px'}}
                        value={filterUser}
                        onChange={(e) => setFilterUser(e.target.value)}
                    >
                        <option value="all">所有人</option>
                        <option value="joint">共同帳戶</option>
                        <option value="userA">恆恆</option>
                        <option value="userB">得得</option>
                    </select>
                </div>
            </div>

            {filteredHistory.length === 0 ? (
                <div className="glass-card" style={{textAlign:'center', color: '#888'}}>
                    <p>📭 沒有符合篩選條件的紀錄</p>
                </div>
            ) : (
                [...filteredHistory].reverse().map((record) => {
                  // ★ 4. 新增：聰明判斷正負號
                  const isPositive = ['income', 'liquidate', 'joint_invest_sell', 'personal_invest_profit'].includes(record.type);
                  const showSign = isPositive ? '+' : '-';
                  const amountColor = isPositive ? '#2ecc71' : '#1d1d1f';

                  return (
                    <div key={record.originalIndex} className="glass-card" style={{ marginBottom: '15px', borderLeft: `5px solid ${getTypeColor(record.type)}`, position: 'relative', paddingBottom: '10px' }}>
                        <button 
                            onClick={() => handleDeleteClick(record.originalIndex, record)}
                            style={{
                                position: 'absolute', top: '15px', right: '15px',
                                background: 'rgba(255, 0, 0, 0.1)', border: 'none', borderRadius: '50%',
                                width: '30px', height: '30px', cursor: 'pointer', color: 'red',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', zIndex: 10
                            }}
                        >
                            🗑️
                        </button>

                        <div style={{ paddingBottom: '5px' }}>
                            <div style={{display:'flex', alignItems:'center', gap:'10px', marginBottom:'8px', flexWrap:'wrap'}}>
                                <span style={{fontWeight:'bold', fontSize:'1.1rem', fontFamily:'monospace', color:'#444'}}>
                                    {record.date || record.month} 
                                </span>
                                <span style={{fontSize:'0.8rem', color:'white', background: getTypeColor(record.type), padding:'2px 8px', borderRadius:'10px', fontWeight:'600'}}>
                                    {record.category}
                                </span>
                                {record.advancedBy && (
                                    <span style={{
                                        fontSize:'0.75rem', 
                                        border: record.isSettled ? '1px solid #2ecc71' : '1px solid #f39c12',
                                        color: record.isSettled ? '#2ecc71' : '#f39c12',
                                        padding:'1px 6px', borderRadius:'10px', background:'#fff', fontWeight:'bold'
                                    }}>
                                        {record.advancedBy === 'userA' ? '恆恆' : '得得'}墊付 
                                        {record.isSettled ? ' (已結)' : ' (未結)'}
                                    </span>
                                )}
                            </div>

                            <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end', paddingRight: '40px', marginBottom:'5px'}}>
                                <span style={{fontSize:'1.1rem', color:'#1d1d1f', fontWeight:'700'}}>
                                    {record.note === '月結記帳' ? '日記帳' : record.note}
                                </span>
                                <span style={{fontSize:'1.6rem', fontWeight:'800', color: amountColor}}>
                                    {showSign}{formatMoney(record.total)}
                                </span>
                            </div>

                            <div style={{fontSize:'0.85rem', color:'#888', display:'flex', alignItems:'center', gap:'5px', marginTop:'5px'}}>
                                {record.payer === '共同帳戶' ? (
                                    <span style={{background:'#eee', padding:'2px 6px', borderRadius:'4px'}}>🏫 共同帳戶</span>
                                ) : (
                                    <span style={{background:'#e8f0fe', color:'#1967d2', padding:'2px 6px', borderRadius:'4px'}}>
                                        👤 {record.payer}
                                    </span>
                                )}
                            </div>

                            {record.type === 'expense' && record.details && (
                                <div style={{
                                    marginTop: '10px',
                                    fontSize:'0.9rem', 
                                    color:'#666', 
                                    display:'grid', 
                                    gridTemplateColumns:'1fr 1fr', 
                                    gap:'5px', 
                                    background:'rgba(255,255,255,0.4)', 
                                    padding:'8px', 
                                    borderRadius:'8px'
                                }}>
                                    <span>🍱 餐費: {formatMoney(record.details.food || 0)}</span>
                                    <span>🛍️ 購物: {formatMoney(record.details.shopping || 0)}</span>
                                    <span>📱 固定: {formatMoney(record.details.fixed || 0)}</span>
                                    <span>🧩 其他: {formatMoney(record.details.other || 0)}</span>
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
         <div style={{
             position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.6)', zIndex:1000,
             display:'flex', justifyContent:'center', alignItems:'center', padding:'20px'
         }} onClick={() => setShowSettlementModal(false)}>
             <div className="glass-card" style={{width:'100%', maxWidth:'400px', maxHeight:'80vh', overflowY:'auto', background:'white'}} onClick={e => e.stopPropagation()}>
                 <h3 style={{marginTop:0, borderBottom:'1px solid #eee', paddingBottom:'10px'}}>
                    {settlementTarget === 'userA' ? '恆恆' : '得得'} 的代墊明細
                 </h3>
                 <div style={{marginBottom:'20px'}}>
                     {getDebtList(settlementTarget).map((r, idx) => (
                         <div key={idx} style={{display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px dashed #eee', fontSize:'0.9rem'}}>
                             <div>
                                 <span style={{color:'#888', marginRight:'10px'}}>{r.date}</span>
                                 <span>{r.note}</span>
                             </div>
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