// src/components/ExpenseEntry.jsx
import React, { useState } from 'react';

const formatMoney = (num) => "$" + Number(num).toLocaleString();

const ExpenseEntry = ({ onAddExpense, onAddJointExpense }) => {
  // 控制要在哪個分頁 ('personal' 或 'joint')
  const [activeTab, setActiveTab] = useState('personal');

  // 共用的日期狀態
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  // --- 個人記帳狀態 ---
  const [payer, setPayer] = useState('heng'); 
  const [note, setNote] = useState('');
  const [expenses, setExpenses] = useState({ food: '', shopping: '', fixed: '', other: '' });

  // --- 共同支出狀態 ---
  const [jointCategory, setJointCategory] = useState('餐費');
  const [jointNote, setJointNote] = useState('');
  const [jointAmount, setJointAmount] = useState('');
  const [advancedBy, setAdvancedBy] = useState('jointCash'); // 預設共同帳戶直接付

  // 計算個人支出總和
  const calculateTotal = () => {
    return Number(expenses.food || 0) + Number(expenses.shopping || 0) + Number(expenses.fixed || 0) + Number(expenses.other || 0);
  };

  // 送出個人記帳
  const handlePersonalSubmit = () => {
    const total = calculateTotal();
    if (total === 0) return alert("請輸入支出金額");

    const payerName = payer === 'heng' ? '恆恆🐶' : '得得🐕';
    const finalNote = note.trim() || '個人支出';

    const confirmMsg = `【確認個人記帳】\n\n日期：${date}\n付款人：${payerName}\n備註：${finalNote}\n總金額：${formatMoney(total)}\n\n確定要扣款嗎？`;
    if (!window.confirm(confirmMsg)) return;
    
    onAddExpense(date, expenses, total, payer, finalNote);
    
    setExpenses({ food: '', shopping: '', fixed: '', other: '' });
    setNote('');
  };

  // 送出共同記帳
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
        <button 
            className={`glass-btn ${activeTab==='personal'?'':'inactive'}`} 
            onClick={()=>setActiveTab('personal')} 
            style={{flex:1}}
        >
            👤 個人支出
        </button>
        <button 
            className={`glass-btn ${activeTab==='joint'?'':'inactive'}`} 
            onClick={()=>setActiveTab('joint')} 
            style={{flex:1}}
        >
            🏫 共同支出
        </button>
      </div>

      {/* 共用日期選擇 */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{display:'block', marginBottom:'5px', fontWeight:'bold', color:'#555'}}>📅 交易日期</label>
        <input 
            type="date" 
            className="glass-input" 
            style={{width: '100%', padding: '12px 10px'}} 
            value={date} 
            onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <hr style={{ border: '0', borderTop: '1px solid rgba(0,0,0,0.1)', margin: '20px 0' }} />

      {/* ================= 個人記帳區塊 ================= */}
      {activeTab === 'personal' && (
        <div style={{ animation: 'fadeIn 0.3s' }}>
          <div style={{ marginBottom: '15px' }}>
            <label style={{display:'block', marginBottom:'5px', fontWeight:'bold', color:'#555'}}>👤 付款人 (扣誰的錢？)</label>
            <select className="glass-input" value={payer} onChange={(e)=>setPayer(e.target.value)}>
                <option value="heng">恆恆🐶</option>
                <option value="de">得得🐕</option>
            </select>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{display:'block', marginBottom:'5px', fontWeight:'bold', color:'#555'}}>📝 備註 (項目)</label>
            <input type="text" className="glass-input" placeholder="例如：午餐、全聯..." value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div style={{ display: 'grid', gap: '15px' }}>
            <div>
              <label>🍱 餐費 {expenses.food && <span style={{color:'#666', fontSize:'0.9rem'}}>({formatMoney(expenses.food)})</span>}</label>
              <input type="number" inputMode="numeric" className="glass-input" placeholder="0" value={expenses.food} onChange={(e)=>setExpenses({...expenses, food: e.target.value})} />
            </div>
            <div>
              <label>🛍️ 購物 {expenses.shopping && <span style={{color:'#666', fontSize:'0.9rem'}}>({formatMoney(expenses.shopping)})</span>}</label>
              <input type="number" inputMode="numeric" className="glass-input" placeholder="0" value={expenses.shopping} onChange={(e)=>setExpenses({...expenses, shopping: e.target.value})} />
            </div>
            <div>
              <label>📱 固定費用 {expenses.fixed && <span style={{color:'#666', fontSize:'0.9rem'}}>({formatMoney(expenses.fixed)})</span>}</label>
              <input type="number" inputMode="numeric" className="glass-input" placeholder="0" value={expenses.fixed} onChange={(e)=>setExpenses({...expenses, fixed: e.target.value})} />
            </div>
            <div>
              <label>🧩 其他 {expenses.other && <span style={{color:'#666', fontSize:'0.9rem'}}>({formatMoney(expenses.other)})</span>}</label>
              <input type="number" inputMode="numeric" className="glass-input" placeholder="0" value={expenses.other} onChange={(e)=>setExpenses({...expenses, other: e.target.value})} />
            </div>
          </div>

          <div style={{ marginTop: '20px', padding: '15px', background: 'rgba(255,255,255,0.5)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>總支出：</span>
            <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ff6b6b' }}>{formatMoney(calculateTotal())}</span>
          </div>

          <button className="glass-btn" style={{ width: '100%', marginTop: '20px', background: '#ff7675' }} onClick={handlePersonalSubmit}>
            確認個人記帳
          </button>
        </div>
      )}

      {/* ================= 共同支出區塊 ================= */}
      {activeTab === 'joint' && (
        <div style={{ animation: 'fadeIn 0.3s' }}>
          <div style={{ marginBottom: '15px' }}>
            <label style={{display:'block', marginBottom:'5px', fontWeight:'bold', color:'#555'}}>🏷️ 支出類別</label>
            <select className="glass-input" value={jointCategory} onChange={(e) => setJointCategory(e.target.value)}>
              <option value="餐費">餐費</option>
              <option value="購物">購物</option>
              <option value="固定費用">固定費用</option>
              <option value="其他">其他</option>
            </select>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{display:'block', marginBottom:'5px', fontWeight:'bold', color:'#555'}}>📝 備註 (細項)</label>
            <input type="text" className="glass-input" placeholder="例如：麥當勞、衛生紙..." value={jointNote} onChange={(e)=>setJointNote(e.target.value)} />
          </div>

          <div style={{ marginBottom: '15px', padding:'10px', background:'rgba(255, 230, 0, 0.15)', borderRadius:'8px', border:'1px dashed #f1c40f' }}>
            <label style={{display:'block', marginBottom:'5px', fontWeight:'bold', color:'#b7791f'}}>🤝 實際付款人 (誰出的錢？)</label>
            <select className="glass-input" value={advancedBy} onChange={(e) => setAdvancedBy(e.target.value)} style={{border:'1px solid #f1c40f'}}>
              <option value="jointCash">🏫 共同帳戶直接付 (不記債)</option>
              <option value="userA">🐶 恆恆先墊 (記為未結清)</option>
              <option value="userB">🐕 得得先墊 (記為未結清)</option>
            </select>
            <div style={{fontSize:'0.8rem', color:'#888', marginTop:'5px'}}>* 若選擇「先墊」，系統會記錄這筆款項尚未從共同帳戶撥款。</div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{display:'block', marginBottom:'5px', fontWeight:'bold', color:'#555'}}>💰 金額 {jointAmount && <span style={{color:'#666', fontSize:'0.9rem'}}>({formatMoney(jointAmount)})</span>}</label>
            <input type="number" inputMode="numeric" className="glass-input" placeholder="0" value={jointAmount} onChange={(e)=>setJointAmount(e.target.value)} />
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