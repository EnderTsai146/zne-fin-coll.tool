// src/pages/History.jsx
import React from 'react';

function History({ currentMonth, setMonth }) {
  const handleMonthChange = (offset) => {
    const d = new Date(currentMonth + '-01');
    d.setMonth(d.getMonth() + offset);
    setMonth(d.toISOString().slice(0, 7));
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
      <h2 style={{marginBottom:'25px'}}>📅 時光機</h2>
      
      <div className="glass-card">
        <p style={{color: '#555', marginBottom: '20px', fontSize:'1.1rem'}}>
          目前的帳本月份：<br/>
          <strong style={{color: '#2196F3', fontSize:'2.5rem', textShadow:'0 2px 10px rgba(33,150,243,0.3)'}}>{currentMonth}</strong>
        </p>

        <div style={{ display: 'flex', gap: '15px', marginBottom: '25px' }}>
          <button className="glass-btn" style={{flex:1, background:'rgba(33, 150, 243, 0.5)'}} onClick={() => handleMonthChange(-1)}>⬅️ 上個月</button>
          <button className="glass-btn" style={{flex:1, background:'rgba(33, 150, 243, 0.5)'}} onClick={() => handleMonthChange(1)}>下個月 ➡️</button>
        </div>

        <div style={{borderTop:'1px solid rgba(0,0,0,0.1)', paddingtop:'20px'}}>
            <label style={{ display: 'block', marginBottom: '15px', fontWeight: 'bold', color:'#555' }}>或是直接跳轉到：</label>
            <input type="month" value={currentMonth} onChange={(e) => e.target.value && setMonth(e.target.value)} className="glass-input" style={{textAlign:'center', fontSize:'1.2rem'}} />
        </div>
      </div>
    </div>
  );
}

export default History;