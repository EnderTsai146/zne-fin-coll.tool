// src/pages/History.jsx
import React from 'react';

function History({ currentMonth, setMonth }) {
  
  // 切換到上個月或下個月的邏輯
  const handleMonthChange = (offset) => {
    const d = new Date(currentMonth + '-01'); // 把目前的 "2025-12" 轉成日期物件
    d.setMonth(d.getMonth() + offset); // 加一個月或減一個月
    const newMonth = d.toISOString().slice(0, 7); // 轉回 "YYYY-MM" 格式
    setMonth(newMonth);
  };

  // 處理直接從月曆選日期的邏輯
  const handlePickerChange = (e) => {
    if (e.target.value) {
      setMonth(e.target.value);
    }
  };

  const btnStyle = {
    padding: '10px 20px',
    fontSize: '1.2rem',
    background: '#2196F3',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    flex: 1
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
      <h2>📅 時光機</h2>
      <p style={{color: '#666', marginBottom: '20px'}}>
        目前的帳本月份：<strong style={{color: '#2196F3', fontSize:'1.5rem'}}>{currentMonth}</strong>
      </p>

      {/* 控制面板 */}
      <div style={{ background: 'white', padding: '20px', borderRadius: '15px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
        
        {/* 上下月切換按鈕 */}
        <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
          <button style={btnStyle} onClick={() => handleMonthChange(-1)}>
            ⬅️ 上個月
          </button>
          <button style={btnStyle} onClick={() => handleMonthChange(1)}>
            下個月 ➡️
          </button>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '20px 0' }} />

        {/* 直接指定月份 (原生日期選擇器) */}
        <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>或是直接跳轉到：</label>
        <input 
          type="month" 
          value={currentMonth} 
          onChange={handlePickerChange}
          style={{
            padding: '10px',
            fontSize: '1.2rem',
            width: '100%',
            boxSizing: 'border-box',
            borderRadius: '8px',
            border: '1px solid #ccc'
          }} 
        />
        
        <p style={{ marginTop: '15px', fontSize: '0.9rem', color: '#999' }}>
          💡 小撇步：你可以切換到未來的月份來規劃預算，也可以回到過去查看歷史紀錄。
        </p>
      </div>
    </div>
  );
}

export default History;