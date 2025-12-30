// src/pages/Accounting.jsx
import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid'; // 產生唯一ID用

function Accounting({ data, updateData, month }) {
  const [form, setForm] = useState({
    who: 'joint', // joint, ende, ziheng
    type: 'expense', // income, expense
    amount: '',
    note: ''
  });

  // 提交新的一筆紀錄
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.amount || !form.note) return alert("請輸入金額和備註");

    const newRecord = {
      id: uuidv4(),
      date: new Date().toISOString(), // 紀錄當下時間
      ...form,
      amount: Number(form.amount)
    };

    // 寫入資料庫路徑：/month/who/records/id
    const path = `${form.who}/records/${newRecord.id}`;
    updateData(path, newRecord);

    // 清空輸入框
    setForm({ ...form, amount: '', note: '' });
  };

  // 刪除紀錄
  const handleDelete = (who, id) => {
    if(window.confirm('確定要刪除這筆紀錄嗎？')) {
        updateData(`${who}/records/${id}`, null); // 設為 null 就是刪除
    }
  };

  // 投資更新
  const handleInvestUpdate = (key, value) => {
      updateData(`joint/${key}`, Number(value));
  };

  const inputStyle = { padding: '10px', borderRadius: '8px', border: '1px solid #ddd', width: '100%', boxSizing: 'border-box', marginBottom: '10px' };
  const btnStyle = { width: '100%', padding: '12px', background: '#2196F3', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '1rem' };

  // 產生列表的輔助函式
  const renderList = (who, title, color) => {
      const records = data[who]?.records || {};
      const list = Object.values(records).sort((a,b) => b.date.localeCompare(a.date)); // 照時間倒序

      return (
        <div style={{ background: 'white', padding: '15px', borderRadius: '10px', marginBottom: '20px', borderLeft: `5px solid ${color}` }}>
            <h3 style={{ margin: '0 0 10px 0' }}>{title}明細</h3>
            {list.length === 0 ? <p style={{color:'#999'}}>本月尚無紀錄</p> : (
                <ul style={{ paddingLeft: '20px', margin: 0 }}>
                    {list.map(item => (
                        <li key={item.id} style={{ marginBottom: '8px', display:'flex', justifyContent:'space-between' }}>
                            <span>
                                <span style={{ color: item.type === 'income' ? 'red' : 'green', fontWeight:'bold', marginRight:'5px' }}>
                                    {item.type === 'income' ? '入' : '出'}
                                </span>
                                {item.note}
                            </span>
                            <span>
                                ${item.amount.toLocaleString()} 
                                <button onClick={() => handleDelete(who, item.id)} style={{marginLeft:'10px', border:'none', background:'transparent', color:'#999'}}>x</button>
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
      );
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h2 style={{ textAlign: 'center' }}>📝 {month} 記帳本</h2>

      {/* 新增紀錄表單 */}
      <div style={{ background: '#e3f2fd', padding: '20px', borderRadius: '15px', marginBottom: '30px' }}>
        <h3 style={{ marginTop: 0 }}>✏️ 新增一筆</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <select style={inputStyle} value={form.who} onChange={e => setForm({...form, who: e.target.value})}>
                <option value="joint">🤝 共同基金</option>
                <option value="ende">👩 恩得個人</option>
                <option value="ziheng">👨 子恆個人</option>
            </select>
            <select style={inputStyle} value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                <option value="expense">💸 支出</option>
                <option value="income">💰 收入</option>
            </select>
        </div>
        <input 
            type="text" 
            placeholder="項目備註 (例如：晚餐、薪水)" 
            style={inputStyle} 
            value={form.note} 
            onChange={e => setForm({...form, note: e.target.value})} 
        />
        <input 
            type="number" 
            placeholder="金額" 
            style={inputStyle} 
            value={form.amount} 
            onChange={e => setForm({...form, amount: e.target.value})} 
        />
        <button style={btnStyle} onClick={handleSubmit}>新增紀錄</button>
      </div>
      
      {/* 共同基金投資設定區 (特別獨立出來) */}
      <div style={{ background: '#fff3e0', padding: '15px', borderRadius: '10px', marginBottom: '30px' }}>
          <h3 style={{margin:'0 0 10px 0', color:'#e65100'}}>📈 共同基金投資更新</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', alignItems:'center' }}>
            <input placeholder="投資位置 (銀行)" value={data.joint?.location || ''} onChange={e => updateData('joint/location', e.target.value)} style={inputStyle} />
            <input type="number" placeholder="總投入本金" value={data.joint?.investCost || ''} onChange={e => handleInvestUpdate('investCost', e.target.value)} style={inputStyle} />
            <input type="number" placeholder="目前總市值" value={data.joint?.investValue || ''} onChange={e => handleInvestUpdate('investValue', e.target.value)} style={inputStyle} />
          </div>
      </div>

      {/* 顯示列表 */}
      {renderList('joint', '🤝 共同基金', '#36A2EB')}
      {renderList('ende', '👩 恩得個人', '#FF6384')}
      {renderList('ziheng', '👨 子恆個人', '#4BC0C0')}

    </div>
  );
}

export default Accounting;