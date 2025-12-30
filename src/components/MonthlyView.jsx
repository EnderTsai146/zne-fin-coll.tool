// src/components/MonthlyView.jsx
import React, { useState } from 'react';

const formatMoney = (num) => "$" + Number(num).toLocaleString();

const MonthlyView = ({ assets, onDelete }) => {
  const history = assets.monthlyExpenses || [];
  const [searchTerm, setSearchTerm] = useState('');

  const getTypeColor = (type) => {
    if (type === 'income') return '#2ecc71'; 
    if (type === 'expense') return '#ff6b6b'; 
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

  const historyWithIndex = history.map((record, index) => ({ ...record, originalIndex: index }));

  const filteredHistory = historyWithIndex.filter(record => {
    const term = searchTerm.toLowerCase();
    const matchDate = record.date?.includes(term); 
    const matchMonth = record.month?.includes(term);
    const matchPayer = record.payer?.includes(term); 
    const matchOperator = record.operator?.includes(term); 
    const matchType = record.category?.includes(term);
    const matchNote = record.note?.toLowerCase().includes(term);
    return matchDate || matchMonth || matchPayer || matchOperator || matchType || matchNote;
  });

  return (
    <div>
       <h1 className="page-title">歷史紀錄搜尋</h1>
       
       <div className="glass-card" style={{padding:'15px', display:'flex', alignItems:'center', gap:'10px'}}>
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
                    position: 'absolute',
                    top: '15px',
                    right: '15px',
                    background: 'rgba(255, 0, 0, 0.1)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '30px',
                    height: '30px',
                    cursor: 'pointer',
                    color: 'red',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1rem',
                    zIndex: 10
                }}
                title="刪除"
             >
                🗑️
             </button>

             {/* 第一區塊：主要資訊 (日期、類別、項目、金額) */}
             <div style={{ paddingBottom: '10px' }}>
                 {/* 日期 + 標籤 */}
                 <div style={{display:'flex', alignItems:'center', gap:'10px', marginBottom:'12px'}}>
                      <span style={{fontWeight:'bold', fontSize:'1.1rem', fontFamily:'monospace', color:'#444'}}>
                        {record.date || record.month} 
                      </span>
                      <span style={{fontSize:'0.8rem', color:'white', background: getTypeColor(record.type), padding:'2px 8px', borderRadius:'10px', fontWeight:'600'}}>
                        {record.category}
                      </span>
                 </div>

                 {/* 項目名稱 + 金額 (左右對齊，字體加大) */}
                 <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end', paddingRight: '40px'}}>
                    <span style={{fontSize:'1.1rem', color:'#1d1d1f', fontWeight:'700'}}>
                        {record.note}
                    </span>
                    <span style={{fontSize:'1.6rem', fontWeight:'800', color: record.type==='income' || record.type==='liquidate' ? '#2ecc71' : '#1d1d1f'}}>
                        {record.type === 'income' ? '+' : record.type === 'liquidate' ? '+' : '-'}
                        {formatMoney(record.total)}
                    </span>
                 </div>
             </div>

             {/* 如果是詳細記帳 (expense)，顯示細項 (放在中間) */}
             {record.type === 'expense' && record.details && (
                <div style={{fontSize:'0.9rem', color:'#666', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'5px', marginBottom:'10px', background:'rgba(255,255,255,0.4)', padding:'8px', borderRadius:'8px'}}>
                  <span>🍱 餐費: {formatMoney(record.details.food)}</span>
                  <span>🛍️ 購物: {formatMoney(record.details.shopping)}</span>
                  <span>📱 固定: {formatMoney(record.details.fixed)}</span>
                  <span>🧩 其他: {formatMoney(record.details.other)}</span>
                </div>
             )}

             {/* 第二區塊：底部資訊列 (Metadata) - 這裡做了排版修正 */}
             <div style={{
                 marginTop: '10px', 
                 paddingTop: '10px', 
                 borderTop: '1px solid rgba(0,0,0,0.05)', 
                 display:'flex', 
                 justifyContent:'space-between',
                 alignItems: 'center',
                 fontSize: '0.85rem',
                 color: '#888'
             }}>
                {/* 左邊：帳戶 (顯示錢包 icon) */}
                <div style={{display:'flex', alignItems:'center', gap:'5px'}}>
                    <span>💳 歸屬帳戶：</span>
                    <span style={{fontWeight:'bold', color:'#333', background:'rgba(0,0,0,0.03)', padding:'2px 6px', borderRadius:'4px'}}>
                        {record.payer}
                    </span>
                </div>

                {/* 右邊：操作者 (顯示電腦 icon) */}
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
    </div>
  );
};

export default MonthlyView;