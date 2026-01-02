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

// ★ 接收 sendLineNotification 和 currentUser
const MonthlyView = ({ assets, onDelete, setAssets, sendLineNotification, currentUser }) => {
  const history = assets.monthlyExpenses || [];
  
  const [viewMode, setViewMode] = useState('chart');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [settlementTarget, setSettlementTarget] = useState(null); 

  const getTypeColor = (type) => {
    if (type === 'income') return '#2ecc71'; 
    if (type === 'expense') return '#ff6b6b'; 
    if (type === 'spend') return '#ff9f43'; 
    if (type === 'transfer') return '#3498db'; 
    if (type === 'liquidate') return '#f1c40f'; 
    return '#666';
  };

  // --- 計算債務 ---
  const calculateDebt = (userKey) => {
    return history
        .filter(r => r.advancedBy === userKey && r.isSettled === false)
        .reduce((sum, r) => sum + Number(r.total), 0);
  };

  const getDebtList = (userKey) => {
    return history.filter(r => r.advancedBy === userKey && r.isSettled === false);
  };

  // --- 核心邏輯：代墊款結清 (含通知) ---
  const handleSettle = (targetUser) => {
    const targetName = targetUser === 'userA' ? '恆恆' : '得得';
    const debtAmount = calculateDebt(targetUser);
    
    if (debtAmount === 0) return alert("目前沒有未結清的款項喔！");

    const confirmMsg = `【確認結清】\n\n要將 ${targetName} 代墊的 $${debtAmount.toLocaleString()} 標記為「已結清」嗎？\n\n(這代表共同帳戶已經撥款給他了)`;
    if (!window.confirm(confirmMsg)) return;

    // 1. 更新資料庫
    const newHistory = history.map(record => {
        if (record.advancedBy === targetUser && record.isSettled === false) {
            return { ...record, isSettled: true }; 
        }
        return record;
    });

    setAssets({ ...assets, monthlyExpenses: newHistory });
    
    // 2. ★ 發送 LINE 通知 (新增這段)
    if (sendLineNotification) {
        sendLineNotification({
            title: "代墊款結清",
            amount: `$${debtAmount.toLocaleString()}`,
            category: "帳務結算",
            note: `共同帳戶已撥款給 ${targetName}，帳務已歸零。`,
            date: new Date().toISOString().split('T')[0],
            color: "#2ecc71", // 綠色代表完成
            operator: currentUser || "系統"
        });
    }

    alert("✅ 結清完成！已發送通知。");
    setShowSettlementModal(false);
  };

  const handleDeleteClick = (originalIndex, record) => {
    const confirmMsg = `【危險動作】\n\n您確定要刪除這筆紀錄嗎？\n\n日期：${record.date}\n項目：${record.note}\n金額：${formatMoney(record.total)}\n\n⚠️ 刪除後，系統將自動復原金額。`;
    if (window.confirm(confirmMsg)) {
        onDelete(originalIndex);
    }
  };

  // --- 數據統計 (Dashboard) ---
  const dashboardData = useMemo(() => {
    const monthRecords = history.filter(r => r.month === selectedMonth);

    let totalIncome = 0;
    let totalExpense = 0; 
    let dailyData = {};  
    const catStats = { '餐費':0, '購物':0, '固定費用':0, '其他':0 };

    monthRecords.forEach(r => {
        const day = parseInt(r.date.split('-')[2]); 
        
        if (r.type === 'income') {
            totalIncome += r.total;
        }
        else if (r.type === 'expense' || r.type === 'spend') {
            totalExpense += r.total;
            dailyData[day] = (dailyData[day] || 0) + r.total;

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

    return { totalIncome, totalExpense, pieData, barChartData };
  }, [history, selectedMonth]);

  // --- 搜尋邏輯 ---
  const historyWithIndex = history.map((record, index) => ({ ...record, originalIndex: index }));
  const filteredHistory = historyWithIndex.filter(record => {
    const term = searchTerm.toLowerCase();
    return (
        record.date?.includes(term) ||
        record.month?.includes(term) ||
        record.payer?.includes(term) ||
        record.category?.includes(term) ||
        record.note?.toLowerCase().includes(term) ||
        (record.advancedBy && "代墊".includes(term))
    );
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
       
       {/* 戰情室儀表板 */}
       {viewMode === 'chart' && (
         <div style={{animation: 'fadeIn 0.5s'}}>
            <div className="glass-card" style={{padding:'10px', textAlign:'center', marginBottom:'15px', display:'flex', justifyContent:'center', alignItems:'center', gap:'10px'}}>
                <label style={{fontWeight:'bold', color:'#555'}}>分析月份：</label>
                <input type="month" className="glass-input" style={{width:'auto', margin:0, padding:'5px 10px'}} value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
            </div>

            <div style={{display:'flex', gap:'10px', marginBottom:'15px'}}>
                <div className="glass-card" style={{flex:1, padding:'15px', textAlign:'center', background:'linear-gradient(135deg, #a8e6cf 0%, #dcedc1 100%)'}}>
                    <div style={{fontSize:'0.8rem', color:'#1d1d1f', opacity:0.7}}>本月收入</div>
                    <div style={{fontSize:'1.3rem', fontWeight:'bold', color:'#06c755'}}>{formatMoney(dashboardData.totalIncome)}</div>
                </div>
                <div className="glass-card" style={{flex:1, padding:'15px', textAlign:'center', background:'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)'}}>
                    <div style={{fontSize:'0.8rem', color:'#1d1d1f', opacity:0.7}}>本月支出</div>
                    <div style={{fontSize:'1.3rem', fontWeight:'bold', color:'#ef454d'}}>{formatMoney(dashboardData.totalExpense)}</div>
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
                                    <button 
                                        className="glass-btn" 
                                        style={{padding:'5px 10px', fontSize:'0.8rem', background:'#2ecc71', color:'white', border:'none'}}
                                        onClick={() => handleSettle(user)}
                                    >
                                        結清
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {dashboardData.totalExpense === 0 ? (
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
                            <Bar 
                                data={dashboardData.barChartData} 
                                options={{ 
                                    maintainAspectRatio: false,
                                    plugins: { legend: { display: false } },
                                    scales: { y: { beginAtZero: true } }
                                }} 
                            />
                        </div>
                    </div>
                </>
            )}
         </div>
       )}

       {/* 流水帳清單 */}
       {viewMode === 'list' && (
         <>
            <div className="glass-card" style={{padding:'15px', display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px'}}>
                <span style={{fontSize:'1.2rem'}}>🔍</span>
                <input 
                    type="text" 
                    className="glass-input" 
                    style={{margin:0, border:'none', background:'transparent'}}
                    placeholder="搜尋項目、代墊、金額..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {filteredHistory.length === 0 ? (
                <div className="glass-card" style={{textAlign:'center', color: '#888'}}>
                <p>找不到相關紀錄。</p>
                </div>
            ) : (
                [...filteredHistory].reverse().map((record) => (
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

                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end', paddingRight: '40px'}}>
                            <span style={{fontSize:'1.1rem', color:'#1d1d1f', fontWeight:'700'}}>
                                {record.note}
                            </span>
                            <span style={{fontSize:'1.6rem', fontWeight:'800', color: (record.type==='income' || record.type==='liquidate') ? '#2ecc71' : '#1d1d1f'}}>
                                {(record.type === 'income' || record.type === 'liquidate') ? '+' : '-'}
                                {formatMoney(record.total)}
                            </span>
                        </div>
                    </div>
                </div>
                ))
            )}
         </>
       )}

       {/* 明細彈出視窗 */}
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