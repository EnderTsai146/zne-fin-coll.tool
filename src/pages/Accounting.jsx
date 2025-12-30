// src/pages/Accounting.jsx
import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

function Accounting({ data, updateData, month }) {
  const [form, setForm] = useState({ who: 'joint', type: 'expense', amount: '', note: '' });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.amount || !form.note) return alert("請輸入金額和備註");
    const newRecord = { id: uuidv4(), date: new Date().toISOString(), ...form, amount: Number(form.amount) };
    updateData(`${form.who}/records/${newRecord.id}`, newRecord);
    setForm({ ...form, amount: '', note: '' });
  };

  const handleDelete = (who, id) => {
    if(window.confirm('確定要刪除這筆紀錄嗎？')) updateData(`${who}/records/${id}`, null);
  };

  const handleInvestUpdate = (key, value) => {
      updateData(`joint/${key}`, Number(value));
  };

  const renderList = (who, title, color) => {
      const records = data[who]?.records || {};
      const list = Object.values(records).sort((a,b) => b.date.localeCompare(a.date));
      return (
        <div className="glass-card" style={{ borderLeft: `5px solid ${color}` }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>{title}明細</h3>
            {list.length === 0 ? <p style={{color:'#777', textAlign:'center'}}>本月尚無紀錄</p> : (
                <ul style={{ paddingLeft: '0', margin: 0, listStyle:'none' }}>
                    {list.map(item => (
                        <li key={item.id} style={{ marginBottom: '10px', padding:'10px', background:'rgba(255,255,255,0.3)', borderRadius:'10px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                            <span style={{display:'flex', alignItems:'center'}}>
                                <span style={{ color: item.type === 'income' ? '#ff4d4f' : '#52c41a', fontWeight:'bold', marginRight:'10px', fontSize:'1.2rem' }}>
                                    {item.type === 'income' ? '↓ 入' : '↑ 出'}
                                </span>
                                <span style={{fontSize:'1.1rem', color:'#333'}}>{item.note}</span>
                            </span>
                            <span style={{fontWeight:'bold', color:'#333'}}>
                                ${item.amount.toLocaleString()} 
                                <button onClick={() => handleDelete(who, item.id)} style={{marginLeft:'15px', border:'none', background:'rgba(0,0,0,0.1)', color:'#555', width:'24px', height:'24px', borderRadius:'12px', cursor:'pointer'}}>x</button>
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
      );
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <h2 style={{ textAlign: 'center', marginBottom:'25px' }}>📝 {month} 記帳本</h2>

      <div className="glass-card" style={{background:'rgba(255, 255, 255, 0.4)'}}>
        <h3 style={{ marginTop: 0, color:'#2c3e50' }}>✏️ 新增一筆</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <select className="glass-input" value={form.who} onChange={e => setForm({...form, who: e.target.value})}>
                <option value="joint">🤝 共同基金</option>
                <option value="ende">👩 恩得個人</option>
                <option value="ziheng">👨 子恆個人</option>
            </select>
            <select className="glass-input" value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                <option value="expense">💸 支出</option>
                <option value="income">💰 收入</option>
            </select>
        </div>
        <input type="text" placeholder="項目備註 (例如：晚餐、薪水)" className="glass-input" value={form.note} onChange={e => setForm({...form, note: e.target.value})} />
        <input type="number" placeholder="金額" className="glass-input" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} />
        <button className="glass-btn" style={{width:'100%', background:'rgba(33, 150, 243, 0.7)'}} onClick={handleSubmit}>新增紀錄</button>
      </div>
      
      <div className="glass-card" style={{ background: 'rgba(255, 243, 224, 0.4)', border:'1px solid rgba(255, 152, 0, 0.3)' }}>
          <h3 style={{margin:'0 0 15px 0', color:'#e65100'}}>📈 共同基金投資更新</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
            <input placeholder="投資位置 (銀行)" value={data.joint?.location || ''} onChange={e => updateData('joint/location', e.target.value)} className="glass-input" style={{marginBottom:0}} />
            <input type="number" placeholder="總投入本金" value={data.joint?.investCost || ''} onChange={e => handleInvestUpdate('investCost', e.target.value)} className="glass-input" style={{marginBottom:0}} />
            <input type="number" placeholder="目前總市值" value={data.joint?.investValue || ''} onChange={e => handleInvestUpdate('investValue', e.target.value)} className="glass-input" style={{marginBottom:0}} />
          </div>
      </div>

      {renderList('joint', '🤝 共同基金', '#36A2EB')}
      {renderList('ende', '👩 恩得個人', '#FF6384')}
      {renderList('ziheng', '👨 子恆個人', '#4BC0C0')}
    </div>
  );
}

export default Accounting;