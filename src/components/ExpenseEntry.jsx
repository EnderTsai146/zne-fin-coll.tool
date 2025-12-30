// src/components/ExpenseEntry.jsx
import React, { useState } from 'react';

const formatMoney = (num) => "$" + Number(num).toLocaleString();

const ExpenseEntry = ({ onAddExpense }) => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [payer, setPayer] = useState('heng'); 
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
    
    const confirmMsg = `【確認記帳】\n\n日期：${date}\n付款人：${payerName}\n總金額：${formatMoney(total)}\n\n確定要扣款嗎？`;
    if (!window.confirm(confirmMsg)) return;
    
    onAddExpense(date, expenses, total, payer);
  };

  return (
    <div className="glass-card">
      <h1 className="page-title" style={{fontSize:'1.8rem', marginBottom:'20px'}}>個人記帳</h1>
      <p style={{ color: '#666', marginBottom: '20px', textAlign:'center' }}>請輸入支出總額，將從個人帳戶扣除</p>

      {/* ★ 修改重點：改用 Grid 佈局，強制一行顯示，比例為 6:4 */}
      <div style={{
          display: 'grid', 
          gridTemplateColumns: '6fr 4fr', // 左邊日期佔 60%，右邊人名佔 40%
          gap: '10px', // 間距縮小一點，爭取空間
          marginBottom: '20px'
      }}>
        
        <div>
            <label style={{display:'block', marginBottom:'5px'}}>交易日期</label>
            {/* 為了讓日期在手機上不要太肥，這裡可以稍微把 padding 改小一點點 (原本是 class 定義的 14px) */}
            <input 
                type="date" 
                className="glass-input" 
                style={{minWidth: 0, padding: '12px 10px'}} // 微調內距
                value={date} 
                onChange={(e) => setDate(e.target.value)}
            />
        </div>
        
        <div>
            <label style={{display:'block', marginBottom:'5px'}}>付款人</label>
            <select 
                className="glass-input" 
                style={{minWidth: 0, padding: '12px 10px'}} // 微調內距
                value={payer} 
                onChange={(e)=>setPayer(e.target.value)}
            >
                <option value="heng">恆恆🐶</option>
                <option value="de">得得🐕</option>
            </select>
        </div>
      </div>

      <hr style={{ border: '0', borderTop: '1px solid rgba(0,0,0,0.1)', margin: '20px 0' }} />

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

      <div style={{ marginTop: '20px', padding: '15px', background: 'rgba(255,255,255,0.5)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>總支出：</span>
        <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ff6b6b' }}>
          {formatMoney(calculateTotal())}
        </span>
      </div>

      <button className="glass-btn" style={{ width: '100%', marginTop: '20px', background: '#ff7675' }} onClick={handleSubmit}>
        確認扣款
      </button>
    </div>
  );
};

export default ExpenseEntry;