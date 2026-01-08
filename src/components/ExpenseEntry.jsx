// src/components/ExpenseEntry.jsx
import React, { useState } from 'react';

const formatMoney = (num) => "$" + Number(num).toLocaleString();

const ExpenseEntry = ({ onAddExpense }) => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [payer, setPayer] = useState('heng'); 
  // ★ 新增：備註狀態
  const [note, setNote] = useState('');
  
  const [expenses, setExpenses] = useState({
    food: '', shopping: '', fixed: '', other: ''
  });

  const calculateTotal = () => {
    return Number(expenses.food || 0) + Number(expenses.shopping || 0) + Number(expenses.fixed || 0) + Number(expenses.other || 0);
  };

  const handleSubmit = () => {
    const total = calculateTotal();
    if (total === 0) return alert("請輸入支出金額");

    const payerName = payer === 'heng' ? '恆恆🐶' : '得得🐕';
    
    // ★ 處理備註：如果有填就用填的，沒填就預設為「個人支出」
    const finalNote = note.trim() || '個人支出';

    const confirmMsg = `【確認記帳】\n\n日期：${date}\n付款人：${payerName}\n備註：${finalNote}\n總金額：${formatMoney(total)}\n\n確定要扣款嗎？`;
    if (!window.confirm(confirmMsg)) return;
    
    // ★ 將 finalNote 作為第 5 個參數傳出去
    onAddExpense(date, expenses, total, payer, finalNote);
    
    // 清空金額與備註 (保留日期與付款人設定，方便連續記帳)
    setExpenses({ food: '', shopping: '', fixed: '', other: '' });
    setNote('');
  };

  return (
    <div className="glass-card">
      <h1 className="page-title" style={{fontSize:'1.8rem', marginBottom:'10px'}}>個人日記帳</h1>
      <p style={{ color: '#666', marginBottom: '20px', textAlign:'center', fontSize:'0.9rem' }}>
        隨手記一筆，輕鬆掌握開銷。
      </p>

      {/* 第一區塊：日期與對象 */}
      <div style={{
          display: 'grid', 
          gridTemplateColumns: '6fr 4fr', 
          gap: '10px', 
          marginBottom: '15px'
      }}>
        <div>
            <label style={{display:'block', marginBottom:'5px', fontWeight:'bold', color:'#555'}}>交易日期</label>
            <input 
                type="date" 
                className="glass-input" 
                style={{minWidth: 0, padding: '12px 10px', width: '100%'}} 
                value={date} 
                onChange={(e) => setDate(e.target.value)}
            />
        </div>
        
        <div>
            <label style={{display:'block', marginBottom:'5px', fontWeight:'bold', color:'#555'}}>付款人</label>
            <select 
                className="glass-input" 
                style={{minWidth: 0, padding: '13px 10px', width: '100%'}} 
                value={payer} 
                onChange={(e)=>setPayer(e.target.value)}
            >
                <option value="heng">恆恆🐶</option>
                <option value="de">得得🐕</option>
            </select>
        </div>
      </div>

      {/* ★ 新增：備註輸入框 (放在金額輸入之前，符合直覺) */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{display:'block', marginBottom:'5px', fontWeight:'bold', color:'#555'}}>備註 (項目)</label>
        <input 
            type="text" 
            className="glass-input" 
            placeholder="例如：午餐、全聯、加油..." 
            value={note} 
            onChange={(e) => setNote(e.target.value)} 
        />
      </div>

      <hr style={{ border: '0', borderTop: '1px solid rgba(0,0,0,0.1)', margin: '20px 0' }} />

      {/* 金額輸入區塊 */}
      <div style={{ display: 'grid', gap: '15px' }}>
        <div>
          <label>
            🍱 餐費 
            {expenses.food && <span style={{color:'#666', fontSize:'0.9rem', marginLeft:'8px'}}>({formatMoney(expenses.food)})</span>}
          </label>
          <input 
            type="number" 
            inputMode="numeric" 
            className="glass-input" 
            placeholder="0" 
            value={expenses.food} 
            onChange={(e)=>setExpenses({...expenses, food: e.target.value})} 
          />
        </div>

        <div>
          <label>
            🛍️ 購物
            {expenses.shopping && <span style={{color:'#666', fontSize:'0.9rem', marginLeft:'8px'}}>({formatMoney(expenses.shopping)})</span>}
          </label>
          <input 
            type="number" 
            inputMode="numeric"
            className="glass-input" 
            placeholder="0" 
            value={expenses.shopping} 
            onChange={(e)=>setExpenses({...expenses, shopping: e.target.value})} 
          />
        </div>

        <div>
          <label>
            📱 固定費用
            {expenses.fixed && <span style={{color:'#666', fontSize:'0.9rem', marginLeft:'8px'}}>({formatMoney(expenses.fixed)})</span>}
          </label>
          <input 
            type="number" 
            inputMode="numeric"
            className="glass-input" 
            placeholder="0" 
            value={expenses.fixed} 
            onChange={(e)=>setExpenses({...expenses, fixed: e.target.value})} 
          />
        </div>

        <div>
          <label>
            🧩 其他
            {expenses.other && <span style={{color:'#666', fontSize:'0.9rem', marginLeft:'8px'}}>({formatMoney(expenses.other)})</span>}
          </label>
          <input 
            type="number" 
            inputMode="numeric"
            className="glass-input" 
            placeholder="0" 
            value={expenses.other} 
            onChange={(e)=>setExpenses({...expenses, other: e.target.value})} 
          />
        </div>
      </div>

      {/* 總結區塊 */}
      <div style={{ marginTop: '20px', padding: '15px', background: 'rgba(255,255,255,0.5)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>總支出：</span>
        <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ff6b6b' }}>
          {formatMoney(calculateTotal())}
        </span>
      </div>

      <button className="glass-btn" style={{ width: '100%', marginTop: '20px', background: '#ff7675' }} onClick={handleSubmit}>
        確認記帳
      </button>
    </div>
  );
};

export default ExpenseEntry;