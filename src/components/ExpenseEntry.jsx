// src/components/ExpenseEntry.jsx
import React, { useState } from 'react';

const formatMoney = (num) => "$" + Number(num).toLocaleString();

// 高質感膠囊按鈕元件
const SegmentedControl = ({ options, value, onChange }) => (
  <div style={{ display: 'flex', background: 'rgba(0,0,0,0.05)', borderRadius: '12px', padding: '4px', gap: '4px', flexWrap: 'wrap' }}>
    {options.map(opt => {
      const isSelected = value === opt.value;
      return (
        <div
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            flex: 1, 
            textAlign: 'center', 
            padding: '8px 4px', 
            borderRadius: '8px', 
            fontSize: '0.85rem', 
            fontWeight: isSelected ? 'bold' : 'normal', 
            cursor: 'pointer', 
            minWidth: '55px', 
            background: isSelected ? '#fff' : 'transparent', 
            color: isSelected ? '#333' : '#666', 
            boxShadow: isSelected ? '0 2px 8px rgba(0,0,0,0.1)' : 'none', 
            transition: 'all 0.2s ease', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center'
          }}
        >
          {opt.label}
        </div>
      );
    })}
  </div>
);
const addMonthsSafe = (dateStr, months) => {
    let d = new Date(dateStr);
    let targetMonth = d.getMonth() + months;
    let targetYear = d.getFullYear();
    let expectedMonth = targetMonth % 12;
    if (expectedMonth < 0) expectedMonth += 12;
    let newD = new Date(targetYear, targetMonth, d.getDate());
    if (newD.getMonth() !== expectedMonth) {
        newD = new Date(targetYear, targetMonth + 1, 0);
    }
    const offset = newD.getTimezoneOffset()
    newD = new Date(newD.getTime() - (offset*60*1000))
    return newD.toISOString().split('T')[0];
};

const ExpenseEntry = ({ assets, setAssets, onAddExpense, onAddJointExpense }) => {
  const [activeTab, setActiveTab] = useState('joint'); 
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);

  // 共同花費 State
  const [jointAdvanced, setJointAdvanced] = useState(null);
  const [jointCat, setJointCat] = useState(null);
  const [jointAmount, setJointAmount] = useState('');
  const [jointNote, setJointNote] = useState('');
  const [jointCart, setJointCart] = useState([]); 

  // 個人花費 State
  const [persUser, setPersUser] = useState(null); 
  const [persCat, setPersCat] = useState(null);
  const [persAmount, setPersAmount] = useState('');
  const [persNote, setPersNote] = useState('');
  const [persCart, setPersCart] = useState([]); 

  // 定期帳單 State
  const [showAddBill, setShowAddBill] = useState(false);
  const [billName, setBillName] = useState('');
  const [billScope, setBillScope] = useState('joint');
  const [billPayer, setBillPayer] = useState('jointCash');
  const [billType, setBillType] = useState('fixed'); 
  const [billAmount, setBillAmount] = useState('');
  const [billCycle, setBillCycle] = useState(1); 
  const [billNextDate, setBillNextDate] = useState(txDate);
  const [editingBillId, setEditingBillId] = useState(null);

  const safeBills = assets?.bills || [];
  const todayStr = new Date().toISOString().split('T')[0];
  
  // 判斷帳單是否在 3 天內即將到期
  const isApproaching = (dateStr) => {
    return Math.ceil((new Date(dateStr) - new Date(todayStr)) / (1000 * 60 * 60 * 24)) <= 3;
  };

  // --- 共同記帳邏輯 ---
  const handleAddJointCart = () => {
      if (!jointCat) return alert("請選擇分類！");
      if (!jointAmount || isNaN(jointAmount) || Number(jointAmount) <= 0) return alert("請輸入有效金額！");
      setJointCart([...jointCart, { id: Date.now(), cat: jointCat, amount: Number(jointAmount), note: jointNote }]);
      setJointAmount(''); 
      setJointNote(''); 
      setJointCat(null);
  };
  
  const handleRemoveJointCart = (id) => {
      setJointCart(jointCart.filter(i => i.id !== id));
  };

  const handleJointSubmit = () => {
    if (!jointAdvanced) return alert("請選擇付款方式 (誰墊付/共同出)！");
    const finalItems = [...jointCart];
    if (jointAmount) {
      if (isNaN(jointAmount) || Number(jointAmount) <= 0) return alert("請輸入有效金額！");
      if (!jointCat) return alert("最後一筆輸入尚未選擇分類！");
      finalItems.push({ cat: jointCat, amount: Number(jointAmount), note: jointNote });
    }
    if (finalItems.length === 0) return alert("請輸入花費金額或加入暫存！");

    const total = finalItems.reduce((sum, item) => sum + item.amount, 0);
    const isMulti = finalItems.length > 1;
    const mainCat = isMulti ? '多筆合併' : finalItems[0].cat;
    
    const finalNote = finalItems.map(i => { 
      let s = isMulti ? `[${i.cat}] $${i.amount}` : ''; 
      if (i.note) s += (s ? ` - ${i.note}` : i.note); 
      if (!s) s = i.cat; 
      return s; 
    }).join('，');
    
    onAddJointExpense(txDate, mainCat, total, jointAdvanced, finalNote);
    
    setJointCart([]); 
    setJointAmount(''); 
    setJointNote(''); 
    setJointCat(null);
    setJointAdvanced(null);
  };

  // --- 個人記帳邏輯 ---
  const handleAddPersCart = () => {
      if (!persCat) return alert("請選擇分類！");
      if (!persAmount || isNaN(persAmount) || Number(persAmount) <= 0) return alert("請輸入有效金額！");
      setPersCart([...persCart, { id: Date.now(), cat: persCat, amount: Number(persAmount), note: persNote }]);
      setPersAmount(''); 
      setPersNote(''); 
      setPersCat(null);
  };
  
  const handleRemovePersCart = (id) => {
      setPersCart(persCart.filter(i => i.id !== id));
  };

  const handlePersonalSubmit = () => {
    if (!persUser) return alert("請選擇記誰的帳！");
    const finalItems = [...persCart];
    if (persAmount) {
      if (isNaN(persAmount) || Number(persAmount) <= 0) return alert("請輸入有效金額！");
      if (!persCat) return alert("最後一筆輸入尚未選擇分類！");
      finalItems.push({ cat: persCat, amount: Number(persAmount), note: persNote });
    }
    if (finalItems.length === 0) return alert("請輸入花費金額或加入暫存！");

    const total = finalItems.reduce((sum, item) => sum + item.amount, 0);
    const isMulti = finalItems.length > 1;
    const finalNote = finalItems.map(i => { 
      let s = isMulti ? `[${i.cat}] $${i.amount}` : ''; 
      if (i.note) s += (s ? ` - ${i.note}` : i.note); 
      if (!s) s = i.cat; 
      return s; 
    }).join('，');

    const expenseData = { food: 0, shopping: 0, fixed: 0, other: 0 };
    const catMap = { '餐費': 'food', '購物': 'shopping', '固定費用': 'fixed', '固定': 'fixed', '其他': 'other' };
    
    finalItems.forEach(i => { 
      expenseData[catMap[i.cat] || 'other'] += i.amount; 
    });

    onAddExpense(txDate, expenseData, total, persUser, finalNote);
    
    setPersCart([]); 
    setPersAmount(''); 
    setPersNote(''); 
    setPersCat(null);
    setPersUser(null);
  };

  const handleSaveNewBill = () => {
      if (!setAssets) return alert("❌ 系統錯誤：未取得資料庫權限，請確認 App.jsx 是否已更新！");
      if (!billName) return alert("請填寫帳單名稱！");
      if (billType === 'fixed' && (!billAmount || isNaN(billAmount))) return alert("固定帳單請輸入金額！");
      
      const updatedBillData = { 
        name: billName, 
        scope: billScope, 
        payer: billPayer, 
        type: billType, 
        amount: billType === 'fixed' ? Number(billAmount) : 0, 
        cycle: Number(billCycle), 
        nextDate: billNextDate 
      };
      
      if (editingBillId) {
          const updatedBills = safeBills.map(b => b.id === editingBillId ? { ...b, ...updatedBillData } : b);
          setAssets({ ...assets, bills: updatedBills });
          alert("✅ 帳單修改成功！");
      } else {
          const newBill = { id: Date.now().toString(), ...updatedBillData };
          setAssets({ ...assets, bills: [...safeBills, newBill] });
          alert("✅ 帳單設定成功！");
      }
      
      setShowAddBill(false); 
      setEditingBillId(null);
      setBillName(''); 
      setBillAmount('');
  };

  const handleEditBill = (bill) => {
      setBillName(bill.name);
      setBillScope(bill.scope);
      setBillPayer(bill.payer);
      setBillType(bill.type);
      setBillAmount(bill.amount > 0 ? bill.amount : '');
      setBillCycle(bill.cycle);
      setBillNextDate(bill.nextDate);
      setEditingBillId(bill.id);
      setShowAddBill(true);
  };

  const handlePayBill = (bill) => {
      if (!setAssets) return alert("❌ 系統錯誤：未取得資料庫權限！");
      
      let finalAmount = bill.amount;
      if (bill.type === 'variable') {
          const input = window.prompt(`請輸入【${bill.name}】本期的實際扣款金額：`);
          if (!input || isNaN(input)) return alert("❌ 已取消或金額無效");
          finalAmount = Number(input);
      }
      
      if (finalAmount <= 0) return alert("金額無效");
      if (!window.confirm(`確定要認列【${bill.name}】扣款 ${formatMoney(finalAmount)} 嗎？`)) return;

      // 🛡️ 修復 Race Condition：把更新後的 bills 陣列當作參數一起丟給 App.jsx
      const nextDateStr = addMonthsSafe(bill.nextDate, bill.cycle);
      const updatedBills = safeBills.map(b => b.id === bill.id ? { ...b, nextDate: nextDateStr } : b);

      if (bill.scope === 'joint') {
          onAddJointExpense(todayStr, '固定費用', finalAmount, bill.payer, `[定期帳單] ${bill.name}`, updatedBills);
      } else {
          const userKey = bill.payer === 'userA' ? 'heng' : 'de';
          onAddExpense(todayStr, { fixed: finalAmount }, finalAmount, userKey, `[定期帳單] ${bill.name}`, updatedBills);
      }
  };

  const handleDeleteBill = (id) => {
      if (!setAssets) return alert("❌ 系統錯誤：未取得資料庫權限！");
      if(!window.confirm("⚠️ 確定要刪除這個帳單提醒嗎？")) return;
      setAssets({ ...assets, bills: safeBills.filter(b => b.id !== id) });
  };

  return (
    <div style={{animation: 'fadeIn 0.5s'}}>
      <h1 className="page-title">記帳</h1>

      <div style={{display:'flex', gap:'10px', marginBottom:'20px'}}>
        <button className={`glass-btn ${activeTab==='joint'?'':'inactive'}`} onClick={()=>setActiveTab('joint')} style={{flex:1, padding:'8px 0'}}>🏫 共同</button>
        <button className={`glass-btn ${activeTab==='personal'?'':'inactive'}`} onClick={()=>setActiveTab('personal')} style={{flex:1, padding:'8px 0'}}>👤 個人</button>
        <button className={`glass-btn ${activeTab==='bills'?'':'inactive'}`} onClick={()=>setActiveTab('bills')} style={{flex:1, padding:'8px 0', border: safeBills.some(b => isApproaching(b.nextDate)) ? '1px solid #e67e22' : 'none'}}>
            📅 帳單 {safeBills.some(b => isApproaching(b.nextDate)) && '🔴'}
        </button>
      </div>

      {activeTab !== 'bills' && (
        <div className="glass-card" style={{ padding: '12px 15px', marginBottom: '20px', borderLeft: '5px solid #667eea', display:'flex', flexWrap:'wrap', alignItems:'center', justifyContent:'space-between', gap:'10px' }}>
          <label style={{fontWeight:'bold', fontSize:'1.05rem', margin:0}}>📅 消費日期</label>
          <input type="date" className="glass-input" style={{flex:1, minWidth:'140px', maxWidth:'100%', margin:0, padding:'8px 12px', boxSizing:'border-box'}} value={txDate} onChange={(e) => setTxDate(e.target.value)} />
        </div>
      )}

      {/* 🏫 共同記帳面板 */}
      {activeTab === 'joint' && (
        <div className="glass-card" style={{border:'1px solid #a8e6cf'}}>
          <h3 style={{marginTop:0, marginBottom:'15px', color:'#555'}}>🏫 共同花費</h3>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{display:'block', marginBottom:'8px', color:'#555', fontSize:'0.9rem'}}>分類</label>
            <SegmentedControl options={[{ label: '🍔 餐費', value: '餐費' }, { label: '🛍️ 購物', value: '購物' }, { label: '🏠 固定', value: '固定費用' }, { label: '📦 其他', value: '其他' }]} value={jointCat} onChange={setJointCat} />
          </div>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{display:'block', marginBottom:'8px', color:'#555', fontSize:'0.9rem'}}>付款方式 (誰先付的？)</label>
            <SegmentedControl options={[{ label: '🏫 共同直接付', value: 'jointCash' }, { label: '🐶 恆恆代墊', value: 'userA' }, { label: '🐕 得得代墊', value: 'userB' }]} value={jointAdvanced} onChange={setJointAdvanced} />
          </div>
          
          <div style={{display:'flex', flexWrap:'wrap', gap:'10px', marginBottom:'10px'}}>
            <div style={{flex:1, minWidth:'100px'}}>
                <label style={{fontSize:'0.85rem'}}>金額</label>
                <input type="number" inputMode="numeric" className="glass-input" style={{boxSizing:'border-box'}} value={jointAmount} onChange={(e)=>setJointAmount(e.target.value)} placeholder="0" />
            </div>
            <div style={{flex:2, minWidth:'150px'}}>
                <label style={{fontSize:'0.85rem'}}>備註 (選填)</label>
                <input type="text" className="glass-input" style={{boxSizing:'border-box'}} value={jointNote} onChange={(e)=>setJointNote(e.target.value)} placeholder="例如：全聯買菜" />
            </div>
          </div>
          
          <div style={{display:'flex', gap:'5px', marginBottom:'15px'}}>
            <button className="glass-btn" style={{flex:1, background:'rgba(0,0,0,0.05)', color:'#555', border:'1px dashed #ccc', fontSize:'0.9rem'}} onClick={handleAddJointCart}>
              ➕ 暫存此筆，繼續加入下一筆
            </button>
            {jointCart.length > 0 && <button className="glass-btn" style={{padding:'8px 12px', background:'rgba(231, 76, 60, 0.1)', color:'#e74c3c', border:'1px dashed #e74c3c', fontSize:'0.9rem'}} onClick={()=>setJointCart([])}>🗑️ 清空全部暫存</button>}
          </div>
          
          {jointCart.length > 0 && (
             <div style={{background:'rgba(168, 230, 207, 0.15)', padding:'10px', borderRadius:'8px', marginBottom:'15px', border:'1px solid rgba(168, 230, 207, 0.5)'}}>
                 <div style={{fontSize:'0.85rem', color:'#666', marginBottom:'8px'}}>🛒 本次合併明細：</div>
                 {jointCart.map(item => (
                     <div key={item.id} style={{display:'flex', justifyContent:'space-between', fontSize:'0.9rem', marginBottom:'6px', borderBottom:'1px dashed #eee', paddingBottom:'4px'}}>
                         <span style={{color:'#444'}}>
                           <span style={{background:'#fff', padding:'2px 6px', borderRadius:'4px', fontSize:'0.75rem', marginRight:'5px'}}>{item.cat}</span>
                           {item.note}
                         </span>
                         <span>
                           {formatMoney(item.amount)} 
                           <button onClick={()=>handleRemoveJointCart(item.id)} style={{border:'none', background:'none', color:'#e74c3c', marginLeft:'5px', cursor:'pointer'}}>✖</button>
                         </span>
                     </div>
                 ))}
             </div>
          )}
          
          <button className="glass-btn" style={{width:'100%', background:'linear-gradient(135deg, #a8e6cf 0%, #dcedc1 100%)', color:'#333', fontWeight:'bold', fontSize:'1.1rem'}} onClick={handleJointSubmit}>
            確認記帳 (總計: {formatMoney(jointCart.reduce((s,i)=>s+i.amount, 0) + (Number(jointAmount)||0))})
          </button>
        </div>
      )}

      {/* 👤 個人記帳面板 */}
      {activeTab === 'personal' && (
        <div className="glass-card" style={{border:'1px solid #ff9a9e'}}>
          <h3 style={{marginTop:0, marginBottom:'15px', color:'#555'}}>👤 個人日記帳</h3>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{display:'block', marginBottom:'8px', color:'#555', fontSize:'0.9rem'}}>記誰的帳？</label>
            <SegmentedControl options={[{ label: '🐶 恆恆', value: 'heng' }, { label: '🐕 得得', value: 'de' }]} value={persUser} onChange={setPersUser} />
          </div>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{display:'block', marginBottom:'8px', color:'#555', fontSize:'0.9rem'}}>分類</label>
            <SegmentedControl options={[{ label: '🍔 餐費', value: '餐費' }, { label: '🛍️ 購物', value: '購物' }, { label: '🏠 固定', value: '固定' }, { label: '📦 其他', value: '其他' }]} value={persCat} onChange={setPersCat} />
          </div>
          
          <div style={{display:'flex', flexWrap:'wrap', gap:'10px', marginBottom:'10px'}}>
            <div style={{flex:1, minWidth:'100px'}}>
                <label style={{fontSize:'0.85rem'}}>金額</label>
                <input type="number" inputMode="numeric" className="glass-input" style={{boxSizing:'border-box'}} value={persAmount} onChange={(e)=>setPersAmount(e.target.value)} placeholder="0" />
            </div>
            <div style={{flex:2, minWidth:'150px'}}>
                <label style={{fontSize:'0.85rem'}}>備註 (選填)</label>
                <input type="text" className="glass-input" style={{boxSizing:'border-box'}} value={persNote} onChange={(e)=>setPersNote(e.target.value)} placeholder="例如：手搖飲" />
            </div>
          </div>
          
          <div style={{display:'flex', gap:'5px', marginBottom:'15px'}}>
            <button className="glass-btn" style={{flex:1, background:'rgba(0,0,0,0.05)', color:'#555', border:'1px dashed #ccc', fontSize:'0.9rem'}} onClick={handleAddPersCart}>
              ➕ 暫存此筆，繼續加入下一筆
            </button>
            {persCart.length > 0 && <button className="glass-btn" style={{padding:'8px 12px', background:'rgba(231, 76, 60, 0.1)', color:'#e74c3c', border:'1px dashed #e74c3c', fontSize:'0.9rem'}} onClick={()=>setPersCart([])}>🗑️ 清空全部暫存</button>}
          </div>
          
          {persCart.length > 0 && (
             <div style={{background:'rgba(255, 154, 158, 0.15)', padding:'10px', borderRadius:'8px', marginBottom:'15px', border:'1px solid rgba(255, 154, 158, 0.5)'}}>
                 <div style={{fontSize:'0.85rem', color:'#666', marginBottom:'8px'}}>🛒 本次合併明細：</div>
                 {persCart.map(item => (
                     <div key={item.id} style={{display:'flex', justifyContent:'space-between', fontSize:'0.9rem', marginBottom:'6px', borderBottom:'1px dashed #eee', paddingBottom:'4px'}}>
                         <span style={{color:'#444'}}>
                           <span style={{background:'#fff', padding:'2px 6px', borderRadius:'4px', fontSize:'0.75rem', marginRight:'5px'}}>{item.cat}</span>
                           {item.note}
                         </span>
                         <span>
                           {formatMoney(item.amount)} 
                           <button onClick={()=>handleRemovePersCart(item.id)} style={{border:'none', background:'none', color:'#e74c3c', marginLeft:'5px', cursor:'pointer'}}>✖</button>
                         </span>
                     </div>
                 ))}
             </div>
          )}
          
          <button className="glass-btn" style={{width:'100%', background:'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)', color:'#333', fontWeight:'bold', fontSize:'1.1rem'}} onClick={handlePersonalSubmit}>
            確認記帳 (總計: {formatMoney(persCart.reduce((s,i)=>s+i.amount, 0) + (Number(persAmount)||0))})
          </button>
        </div>
      )}

      {/* 📅 帳單管家面板 */}
      {activeTab === 'bills' && (
        <div>
           {!showAddBill && (
              <button className="glass-btn" style={{width:'100%', marginBottom:'20px', background:'#fff', border:'1px dashed #ccc'}} onClick={() => setShowAddBill(true)}>
                ➕ 新增定期帳單 / 訂閱
              </button>
           )}
           
           {showAddBill && (
              <div className="glass-card" style={{marginBottom:'20px', border:'1px solid #3498db'}}>
                  <h4 style={{marginTop:0, color:'#3498db'}}>{editingBillId ? '✏️ 編輯帳單設定' : '➕ 新增帳單設定'}</h4>
                  <input type="text" className="glass-input" placeholder="帳單名稱 (例: Netflix, 水費)" value={billName} onChange={e=>setBillName(e.target.value)} />
                  
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{fontSize:'0.85rem', color:'#666'}}>帳單歸屬</label>
                    <SegmentedControl options={[{ label: '共同帳戶', value: 'jointCash' }, { label: '恆恆個人', value: 'userA' }, { label: '得得個人', value: 'userB' }]} value={billPayer} onChange={(v) => { setBillPayer(v); setBillScope(v === 'jointCash' ? 'joint' : 'personal'); }} />
                  </div>
                  
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{fontSize:'0.85rem', color:'#666'}}>金額類型</label>
                    <SegmentedControl options={[{ label: '固定金額 (如訂閱)', value: 'fixed' }, { label: '變動金額 (如水電)', value: 'variable' }]} value={billType} onChange={setBillType} />
                  </div>
                  
                  {billType === 'fixed' && (
                    <input type="number" inputMode="numeric" className="glass-input" placeholder="請輸入每期固定金額" value={billAmount} onChange={e=>setBillAmount(e.target.value)} />
                  )}
                  
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{fontSize:'0.85rem', color:'#666'}}>繳費週期</label>
                    <SegmentedControl options={[{ label: '每月', value: 1 }, { label: '每兩月', value: 2 }, { label: '每年', value: 12 }]} value={billCycle} onChange={setBillCycle} />
                  </div>
                  
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{fontSize:'0.85rem', color:'#666'}}>「下次」預計扣款日</label>
                    <input type="date" className="glass-input" style={{width:'100%', boxSizing:'border-box'}} value={billNextDate} onChange={e=>setBillNextDate(e.target.value)} />
                  </div>
                  
                  <div style={{display:'flex', gap:'10px'}}>
                      <button className="glass-btn" style={{flex:1, background:'#eee', color:'#333'}} onClick={() => { setShowAddBill(false); setEditingBillId(null); setBillName(''); setBillAmount(''); }}>取消</button>
                      <button className="glass-btn" style={{flex:1, background:'#3498db', color:'#fff'}} onClick={handleSaveNewBill}>儲存設定</button>
                  </div>
              </div>
           )}
           
           <h3 style={{color:'#555', marginBottom:'15px'}}>📋 我的帳單清單</h3>
           {safeBills.length === 0 ? ( 
             <div style={{textAlign:'center', color:'#888', padding:'20px'}}>還沒有設定任何定期帳單喔！</div> 
           ) : (
               safeBills.sort((a, b) => new Date(a.nextDate) - new Date(b.nextDate)).map(bill => {
                   const alert = isApproaching(bill.nextDate);
                   return (
                       <div key={bill.id} className="glass-card" style={{marginBottom:'15px', borderLeft: alert ? '5px solid #e67e22' : '5px solid #2ecc71', position:'relative'}}>
                           <div style={{position:'absolute', top:'10px', right:'10px', display:'flex', gap:'5px'}}>
                               <button onClick={() => handleEditBill(bill)} style={{background:'transparent', border:'none', color:'#3498db', cursor:'pointer', fontSize:'1rem'}}>✏️</button>
                               <button onClick={() => handleDeleteBill(bill.id)} style={{background:'transparent', border:'none', color:'#ccc', cursor:'pointer', fontSize:'1rem'}}>✖</button>
                           </div>
                           <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'10px', paddingRight:'50px'}}>
                               <div>
                                   <div style={{fontWeight:'bold', fontSize:'1.1rem', color:'#333'}}>{bill.name}</div>
                                   <div style={{fontSize:'0.8rem', color:'#666', marginTop:'4px'}}>
                                     {bill.payer === 'jointCash' ? '🏫 共同扣款' : (bill.payer === 'userA' ? '🐶 恆恆付' : '🐕 得得付')} | {bill.cycle === 1 ? '每月' : bill.cycle === 2 ? '每兩月' : '每年'}
                                   </div>
                               </div>
                               <div style={{textAlign:'right'}}>
                                   <div style={{fontWeight:'bold', color: alert ? '#e67e22' : '#2ecc71'}}>{bill.type === 'fixed' ? formatMoney(bill.amount) : '金額變動'}</div>
                               </div>
                           </div>
                           <div style={{background: alert ? 'rgba(230, 126, 34, 0.1)' : 'rgba(0,0,0,0.03)', padding:'10px', borderRadius:'8px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                               <div>
                                   <div style={{fontSize:'0.75rem', color: alert ? '#d35400' : '#888'}}>下次扣款日</div>
                                   <div style={{fontWeight:'bold', color: alert ? '#d35400' : '#555'}}>{bill.nextDate} {alert && '⚠️ 即將到期'}</div>
                               </div>
                               <button className="glass-btn" style={{padding:'6px 12px', fontSize:'0.85rem', background: alert ? '#e67e22' : '#fff', color: alert ? '#fff' : '#333', border: alert ? 'none' : '1px solid #ccc'}} onClick={() => handlePayBill(bill)}>
                                 ✅ 一鍵認列
                               </button>
                           </div>
                       </div>
                   );
               })
           )}
        </div>
      )}
    </div>
  );
};

export default ExpenseEntry;