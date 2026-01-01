// src/components/MonthlyView.jsx
import React, { useState, useMemo } from 'react';
// 引入 Chart.js 相關套件
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';

// 註冊圖表元件
ChartJS.register(ArcElement, Tooltip, Legend);

const formatMoney = (num) => "$" + Number(num).toLocaleString();

const MonthlyView = ({ assets, onDelete }) => {
  const history = assets.monthlyExpenses || [];
  
  // --- 狀態管理 ---
  const [viewMode, setViewMode] = useState('list'); // 'list' 或 'chart'
  const [searchTerm, setSearchTerm] = useState('');
  // 預設選擇當前月份 (格式 YYYY-MM)
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));

  // --- 輔助函式 ---
  const getTypeColor = (type) => {
    if (type === 'income') return '#2ecc71'; 
    if (type === 'expense') return '#ff6b6b'; 
    if (type === 'spend') return '#ff9f43'; // 共同支出
    if (type === 'transfer') return '#3498db'; 
    if (type === 'liquidate') return '#f1c40f'; 
    return '#666';
  };

  const handleDeleteClick = (originalIndex, record) => {
    const confirmMsg = `【危險動作】\n\n您確定要刪除這筆紀錄嗎？\n\n日期：${record.date}\n項目：${record.note}\n金額：${formatMoney(record.total)}\n\n⚠️ 刪除後，系統將自動復原金額。`;
    if (window.confirm(confirmMsg)) {
        onDelete(originalIndex);
    }
  };

  // 加上原始索引以確保刪除正確
  const historyWithIndex = history.map((record, index) => ({ ...record, originalIndex: index }));

  // --- 篩選邏輯 (列表模式用) ---
  const filteredHistory = historyWithIndex.filter(record => {
    const term = searchTerm.toLowerCase();
    const matchAll = 
        (record.date?.includes(term)) ||
        (record.month?.includes(term)) ||
        (record.payer?.includes(term)) ||
        (record.operator?.includes(term)) ||
        (record.category?.includes(term)) ||
        (record.note?.toLowerCase().includes(term));
    return matchAll;
  });

  // --- 統計邏輯 (圖表模式用) ---
  const chartData = useMemo(() => {
    // 1. 初始化累計物件
    const stats = {
        '餐費': 0,
        '購物': 0,
        '固定費用': 0,
        '其他': 0,
        '總支出': 0
    };

    // 2. 篩選出「選定月份」且為「支出性質」的紀錄
    const targetRecords = history.filter(r => 
        r.month === selectedMonth && (r.type === 'expense' || r.type === 'spend')
    );

    // 3. 開始分類累加
    targetRecords.forEach(record => {
        // 情境 A: 個人支出 (原本就有 details 細項)
        if (record.type === 'expense' && record.details) {
            stats['餐費'] += Number(record.details.food || 0);
            stats['購物'] += Number(record.details.shopping || 0);
            stats['固定費用'] += Number(record.details.fixed || 0);
            stats['其他'] += Number(record.details.other || 0);
            stats['總支出'] += Number(record.total || 0);
        }
        // 情境 B: 共同支出 (透過 note 判斷類別)
        else if (record.type === 'spend') {
            const note = record.note || '';
            const val = Number(record.total || 0);
            stats['總支出'] += val;

            if (note.includes('餐費')) stats['餐費'] += val;
            else if (note.includes('購物')) stats['購物'] += val;
            else if (note.includes('固定')) stats['固定費用'] += val;
            else stats['其他'] += val; // 沒寫或歸類為其他
        }
    });

    return {
        labels: ['餐費', '購物', '固定費用', '其他'],
        datasets: [
            {
                data: [stats['餐費'], stats['購物'], stats['固定費用'], stats['其他']],
                backgroundColor: [
                    '#ff9f43', // 餐費 (橘)
                    '#54a0ff', // 購物 (藍)
                    '#ff6b6b', // 固定 (紅)
                    '#c8d6e5', // 其他 (灰)
                ],
                borderWidth: 1,
            },
        ],
        total: stats['總支出']
    };
  }, [history, selectedMonth]);

  return (
    <div>
       <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px'}}>
         <h1 className="page-title" style={{margin:0}}>歷史紀錄</h1>
         
         {/* 檢視模式切換按鈕 */}
         <div style={{background:'rgba(255,255,255,0.3)', borderRadius:'20px', padding:'4px', display:'flex'}}>
            <button 
                onClick={() => setViewMode('list')}
                style={{
                    background: viewMode === 'list' ? '#fff' : 'transparent',
                    border:'none', borderRadius:'16px', padding:'6px 12px', cursor:'pointer', fontWeight:'bold',
                    color: viewMode === 'list' ? '#333' : '#666', boxShadow: viewMode === 'list' ? '0 2px 5px rgba(0,0,0,0.1)' : 'none'
                }}
            >
                清單
            </button>
            <button 
                onClick={() => setViewMode('chart')}
                style={{
                    background: viewMode === 'chart' ? '#fff' : 'transparent',
                    border:'none', borderRadius:'16px', padding:'6px 12px', cursor:'pointer', fontWeight:'bold',
                    color: viewMode === 'chart' ? '#333' : '#666', boxShadow: viewMode === 'chart' ? '0 2px 5px rgba(0,0,0,0.1)' : 'none'
                }}
            >
                圖表
            </button>
         </div>
       </div>
       
       {/* === 圖表模式 === */}
       {viewMode === 'chart' && (
         <div className="glass-card" style={{animation: 'fadeIn 0.5s'}}>
            <div style={{marginBottom:'20px', textAlign:'center'}}>
                <label style={{marginRight:'10px', fontWeight:'bold', color:'#555'}}>選擇月份：</label>
                <input 
                    type="month" 
                    className="glass-input" 
                    style={{width:'auto', display:'inline-block', margin:0}}
                    value={selectedMonth} 
                    onChange={(e) => setSelectedMonth(e.target.value)} 
                />
            </div>

            {chartData.total === 0 ? (
                <div style={{textAlign:'center', padding:'40px', color:'#888'}}>
                    🦕 這個月還沒有任何支出紀錄喔！
                </div>
            ) : (
                <>
                    <div style={{height:'300px', display:'flex', justifyContent:'center'}}>
                        <Pie data={chartData} options={{ maintainAspectRatio: false }} />
                    </div>
                    <div style={{textAlign:'center', marginTop:'20px', fontSize:'1.2rem', fontWeight:'bold', color:'#444'}}>
                        本月總支出：{formatMoney(chartData.total)}
                    </div>
                </>
            )}
         </div>
       )}

       {/* === 列表模式 (原本的內容) === */}
       {viewMode === 'list' && (
         <>
            <div className="glass-card" style={{padding:'15px', display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px'}}>
                <span style={{fontSize:'1.2rem'}}>🔍</span>
                <input 
                    type="text" 
                    className="glass-input" 
                    style={{margin:0, border:'none', background:'transparent'}}
                    placeholder="搜尋操作者、帳戶、項目..." 
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
                    
                    {/* 刪除按鈕 */}
                    <button 
                        onClick={() => handleDeleteClick(record.originalIndex, record)}
                        style={{
                            position: 'absolute', top: '15px', right: '15px',
                            background: 'rgba(255, 0, 0, 0.1)', border: 'none', borderRadius: '50%',
                            width: '30px', height: '30px', cursor: 'pointer', color: 'red',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', zIndex: 10
                        }}
                        title="刪除"
                    >
                        🗑️
                    </button>

                    {/* 資訊區塊 */}
                    <div style={{ paddingBottom: '10px' }}>
                        <div style={{display:'flex', alignItems:'center', gap:'10px', marginBottom:'12px'}}>
                            <span style={{fontWeight:'bold', fontSize:'1.1rem', fontFamily:'monospace', color:'#444'}}>
                                {record.date || record.month} 
                            </span>
                            <span style={{fontSize:'0.8rem', color:'white', background: getTypeColor(record.type), padding:'2px 8px', borderRadius:'10px', fontWeight:'600'}}>
                                {record.category}
                            </span>
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

                    {/* 詳細細項顯示 */}
                    {record.type === 'expense' && record.details && (
                        <div style={{fontSize:'0.9rem', color:'#666', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'5px', marginBottom:'10px', background:'rgba(255,255,255,0.4)', padding:'8px', borderRadius:'8px'}}>
                        <span>🍱 餐費: {formatMoney(record.details.food)}</span>
                        <span>🛍️ 購物: {formatMoney(record.details.shopping)}</span>
                        <span>📱 固定: {formatMoney(record.details.fixed)}</span>
                        <span>🧩 其他: {formatMoney(record.details.other)}</span>
                        </div>
                    )}

                    {/* 底部資訊列 */}
                    <div style={{
                        marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(0,0,0,0.05)', 
                        display:'flex', justifyContent:'space-between', alignItems: 'center', fontSize: '0.85rem', color: '#888'
                    }}>
                        <div style={{display:'flex', alignItems:'center', gap:'5px'}}>
                            <span>💳 歸屬帳戶：</span>
                            <span style={{fontWeight:'bold', color:'#333', background:'rgba(0,0,0,0.03)', padding:'2px 6px', borderRadius:'4px'}}>
                                {record.payer}
                            </span>
                        </div>
                        <div style={{display:'flex', alignItems:'center', gap:'5px'}}>
                            <span>👨‍💻 操作者：</span>
                            <span style={{fontWeight:'bold', color:'#1967d2', background:'#e8f0fe', padding:'2px 6px', borderRadius:'4px'}}>
                                {record.operator || '未知'}
                            </span>
                        </div>
                    </div>
                </div>
                ))
            )}
         </>
       )}
    </div>
  );
};

export default MonthlyView;