// src/components/ExpenseEntry.jsx
import React, { useState } from 'react';

const formatMoney = (num) => "$" + Number(num).toLocaleString();

const ExpenseEntry = ({ onAddExpense, onAddJointExpense }) => {
  const [activeTab, setActiveTab] = useState('personal');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  // --- ★ 個人記帳狀態 (升級為批次模式) ---
  const [payer, setPayer] = useState('heng'); 
  const [items, setItems] = useState([
    { id: Date.now(), category: 'food', name: '', amount: '' }
  ]);

  // --- 共同支出狀態 (保持原樣) ---
  const [jointCategory, setJointCategory] = useState('餐費');
  const [jointNote, setJointNote] = useState('');
  const [jointAmount, setJointAmount] = useState('');
  const [advancedBy, setAdvancedBy] = useState('jointCash'); 

  // --- ★ 批次記帳操作邏輯 ---
  const handleAddItem = () => {
    setItems([...items, { id: Date.now() + Math.random(), category: 'food', name: '', amount: '' }]);
  };

  const handleRemoveItem = (id) => {
    if (items.length > 1) {
      setItems(items.filter(item => item.id !== id));
    }
  };

  const handleItemChange = (id, field, value) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  };

  const handlePersonalSubmit = () => {
    const total = calculateTotal();
    if (total === 0) return alert("請至少輸入一筆有效的支出金額喔！");

    // 1. 整理給圓餅圖的分類數據 (不破壞原儀表板邏輯)
    const expenseData = { food: 0, shopping: 0, fixed: 0, other: 0 };
    // 2. 整理 Line 通知與流水帳的備註明細
    const noteParts = [];

    items.forEach(item => {
      const val = Number(item.amount) || 0;
      if (val > 0) {
        expenseData[item.category] += val;
        
        // 如果沒填品項名稱，就用預設類別名代替
        const catName = item.category === 'food' ? '餐費' : item.category === 'shopping' ? '購物' : item.category === 'fixed' ? '固定' : '其他';
        const itemName = item.name.trim() || catName;
        noteParts.push(`${itemName} $${val}`);
      }
    });

    const payerName = payer === 'heng' ? '恆恆🐶' : '得得🐕';
    const finalNote = noteParts.length > 0 ? noteParts.join('、') : '個人批次支出';

    const confirmMsg = `【確認個人批次記帳】\n\n日期：${date}\n付款人：${payerName}\n明細：${finalNote}\n總金額：${formatMoney(total)}\n\n確定要扣款嗎？`;
    if (!window.confirm(confirmMsg)) return;
    
    // 送出給 App.jsx
    onAddExpense(date, expenseData, total, payer, finalNote);
    
    // 記帳成功後，清空輸入框恢復預設 1 筆
    setItems([{ id: Date.now(), category: 'food', name: '', amount: '' }]);
  };

  // --- 共同記帳邏輯 ---
  const handleJointSubmit = () => {
    const val = Number(jointAmount);
    if (!val || val <= 0) return alert("請輸入有效金額");

    const confirmMsg = `【確認共同支出】\n\n日期：${date}\n項目：${jointCategory} ${jointNote ? '- ' + jointNote : ''}\n金額：${formatMoney(val)}\n\n確定要記錄嗎？`;
    if (!window.confirm(confirmMsg)) return;

    onAddJointExpense(date, jointCategory, jointAmount, advancedBy, jointNote);

    setJointAmount('');
    setJointNote('');
  };

  return (
    <div className="glass-card">
      <h1 className="page-title" style={{fontSize:'1.8rem', marginBottom:'10px'}}>隨手記帳</h1>
      
      {/* 分頁切換按鈕 */}
      <div style={{display:'flex', gap:'10px', marginBottom:'20px'}}>
        <button className={`glass-btn ${activeTab==='personal'?'':'inactive'}`} onClick={()=>setActiveTab('personal')} style={{flex:1}}>👤 個人支出</button>
        <button className={`glass-btn ${activeTab==='joint'?'':'inactive'}`} onClick={()=>setActiveTab('joint')} style={{flex:1}}>🏫 共同支出</button>
      </div>

      {/* 共用日期選擇 */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{display:'block', marginBottom:'5px', fontWeight:'bold', color:'#555'}}>📅 交易日期</label>
        <input type="date" className="glass-input" style={{width: '100%', padding: '12px 10px', margin:0}} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <hr style={{ border: '0', borderTop: '1px solid rgba(0,0,0,0.1)', margin: '20px 0' }} />

      {/* ================= 個人記帳區塊 (批次升級版) ================= */}
      {activeTab === 'personal' && (
        <div style={{ animation: 'fadeIn 0.3s' }}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{display:'block', marginBottom:'5px', fontWeight:'bold', color:'#555'}}>👤 付款人 (扣誰的錢？)</label>
            <select className="glass-input" style={{margin:0}} value={payer} onChange={(e)=>setPayer(e.target.value)}>
                <option value="heng">恆恆🐶</option>
                <option value="de">得得🐕</option>
            </select>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{display:'block', marginBottom:'10px', fontWeight:'bold', color:'#555'}}>🛒 批次消費明細</label>
            
            {items.map((item, index) => (
              <div key={item.id} style={{ display: 'flex', gap: '8px', marginBottom: '10px', alignItems: 'center', background: 'rgba(255,255,255,0.3)', padding: '10px', borderRadius: '12px' }}>
                <select 
                    value={item.category} 
                    onChange={(e) => handleItemChange(item.id, 'category', e.target.value)} 
                    className="glass-input" 
                    style={{ flex: 1, margin: 0, padding: '10px 5px', fontSize:'0.9rem' }}
                >
                  <option value="food">🍱 餐費</option>
                  <option value="shopping">🛍️ 購物</option>
                  <option value="fixed">📱 固定</option>
                  <option value="other">🧩 其他</option>
                </select>
                
                <input 
                    type="text" 
                    placeholder="品項 (選填)" 
                    value={item.name} 
                    onChange={(e) => handleItemChange(item.id, 'name', e.target.value)} 
                    className="glass-input" 
                    style={{ flex: 1.5, margin: 0, padding: '10px' }} 
                />
                
                <input 
                    type="number" 
                    inputMode="numeric" 
                    placeholder="金額" 
                    value={item.amount} 
                    onChange={(e) => handleItemChange(item.id, 'amount', e.target.value)} 
                    className="glass-input" 
                    style={{ flex: 1.2, margin: 0, padding: '10px' }} 
                />
                
                {items.length > 1 && (
                  <button onClick={() => handleRemoveItem(item.id)} style={{ background: 'transparent', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: '1.2rem', padding: '0 5px', transition: 'transform 0.2s' }}>
                    ✖
                  </button>
                )}
              </div>
            ))}
            
            <button className="glass-btn" style={{ width: '100%', marginTop: '10px', background: 'rgba(255,255,255,0.7)', color: '#1967d2', border: '1px dashed #1967d2', padding: '10px' }} onClick={handleAddItem}>
              ➕ 再新增一筆消費
            </button>
          </div>

          <div style={{ marginTop: '20px', padding: '15px', background: 'rgba(255,255,255,0.5)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>總支出：</span>
            <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ff6b6b' }}>{formatMoney(calculateTotal())}</span>
          </div>

          <button className="glass-btn" style={{ width: '100%', marginTop: '20px', background: '#ff7675' }} onClick={handlePersonalSubmit}>
            確認送出 (共 {items.length} 筆)
          </button>
        </div>
      )}

      {/* ================= 共同支出區塊 (保持不變) ================= */}
      {activeTab === 'joint' && (
        <div style={{ animation: 'fadeIn 0.3s' }}>
          <div style={{ marginBottom: '15px' }}>
            <label style={{display:'block', marginBottom:'5px', fontWeight:'bold', color:'#555'}}>🏷️ 支出類別</label>
            <select className="glass-input" style={{margin:0}} value={jointCategory} onChange={(e) => setJointCategory(e.target.value)}>
              <option value="餐費">餐費</option>
              <option value="購物">購物</option>
              <option value="固定費用">固定費用</option>
              <option value="其他">其他</option>
            </select>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{display:'block', marginBottom:'5px', fontWeight:'bold', color:'#555'}}>📝 備註 (細項)</label>
            <input type="text" className="glass-input" style={{margin:0}} placeholder="例如：麥當勞、衛生紙..." value={jointNote} onChange={(e)=>setJointNote(e.target.value)} />
          </div>

          <div style={{ marginBottom: '15px', padding:'10px', background:'rgba(255, 230, 0, 0.15)', borderRadius:'8px', border:'1px dashed #f1c40f' }}>
            <label style={{display:'block', marginBottom:'5px', fontWeight:'bold', color:'#b7791f'}}>🤝 實際付款人 (誰出的錢？)</label>
            <select className="glass-input" value={advancedBy} onChange={(e) => setAdvancedBy(e.target.value)} style={{margin:0, border:'1px solid #f1c40f'}}>
              <option value="jointCash">🏫 共同帳戶直接付 (不記債)</option>
              <option value="userA">🐶 恆恆先墊 (記為未結清)</option>
              <option value="userB">🐕 得得先墊 (記為未結清)</option>
            </select>
            <div style={{fontSize:'0.8rem', color:'#888', marginTop:'5px'}}>* 若選擇「先墊」，系統會記錄這筆款項尚未從共同帳戶撥款。</div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{display:'block', marginBottom:'5px', fontWeight:'bold', color:'#555'}}>💰 金額 {jointAmount && <span style={{color:'#666', fontSize:'0.9rem'}}>({formatMoney(jointAmount)})</span>}</label>
            <input type="number" inputMode="numeric" className="glass-input" style={{margin:0}} placeholder="0" value={jointAmount} onChange={(e)=>setJointAmount(e.target.value)} />
          </div>

          <button className="glass-btn" style={{ width: '100%', background: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)', color:'#d63031' }} onClick={handleJointSubmit}>
            確認共同支出
          </button>
        </div>
      )}
    </div>
  );
};

export default ExpenseEntry;