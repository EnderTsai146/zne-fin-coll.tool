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
            flex: 1, textAlign: 'center', padding: '8px 4px', borderRadius: '8px',
            fontSize: '0.85rem', fontWeight: isSelected ? 'bold' : 'normal',
            cursor: 'pointer', minWidth: '60px',
            background: isSelected ? '#fff' : 'transparent',
            color: isSelected ? '#333' : '#666',
            boxShadow: isSelected ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
            transition: 'all 0.2s ease',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          {opt.label}
        </div>
      );
    })}
  </div>
);

const ExpenseEntry = ({ assets, setAssets, onAddExpense, onAddJointExpense }) => {
  const [activeTab, setActiveTab] = useState('joint'); // 'joint', 'personal', 'bills'
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);

  // --- 共同記帳狀態 ---
  const [jointCat, setJointCat] = useState('餐費');
  const [jointAmount, setJointAmount] = useState('');
  const [jointAdvanced, setJointAdvanced] = useState('jointCash');
  const [jointNote, setJointNote] = useState('');

  // --- 個人記帳狀態 ---
  const [persUser, setPersUser] = useState('heng'); 
  const [persAmount, setPersAmount] = useState('');
  const [persNote, setPersNote] = useState('');

  // --- 📅 帳單管家狀態 ---
  const [showAddBill, setShowAddBill] = useState(false);
  const [billName, setBillName] = useState('');
  const [billScope, setBillScope] = useState('joint'); // 'joint', 'personal'
  const [billPayer, setBillPayer] = useState('jointCash');
  const [billType, setBillType] = useState('fixed'); // 'fixed' (固定金額), 'variable' (變動金額)
  const [billAmount, setBillAmount] = useState('');
  const [billCycle, setBillCycle] = useState(1); // 1=每月, 2=每兩月, 12=每年
  const [billNextDate, setBillNextDate] = useState(txDate);

  const safeBills = assets?.bills || [];
  const todayStr = new Date().toISOString().split('T')[0];

  // 判斷是否即將到期 (3天內或已逾期)
  const isApproaching = (dateStr) => {
      const d1 = new Date(todayStr);
      const d2 = new Date(dateStr);
      return Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24)) <= 3;
  };

  const handleJointSubmit = () => {
    if (!jointAmount || isNaN(jointAmount)) return alert("請輸入有效金額！");
    onAddJointExpense(txDate, jointCat, jointAmount, jointAdvanced, jointNote);
    setJointAmount(''); setJointNote('');
  };

  const handlePersonalSubmit = () => {
    if (!persAmount || isNaN(persAmount)) return alert("請輸入有效金額！");
    onAddExpense(txDate, { other: Number(persAmount) }, Number(persAmount), persUser, persNote);
    setPersAmount(''); setPersNote('');
  };

  // --- 帳單管家核心邏輯 ---
  const handleSaveNewBill = () => {
      if (!billName) return alert("請填寫帳單名稱！");
      if (billType === 'fixed' && (!billAmount || isNaN(billAmount))) return alert("固定帳單請輸入金額！");
      
      const newBill = {
          id: Date.now().toString(),
          name: billName,
          scope: billScope,
          payer: billPayer,
          type: billType,
          amount: billType === 'fixed' ? Number(billAmount) : 0,
          cycle: Number(billCycle),
          nextDate: billNextDate
      };
      
      setAssets({ ...assets, bills: [...safeBills, newBill] });
      setShowAddBill(false);
      setBillName(''); setBillAmount('');
      alert("✅ 帳單設定成功！");
  };

  const handlePayBill = (bill) => {
      let finalAmount = bill.amount;
      
      // 變動金額 (如水電費) 提示手動輸入
      if (bill.type === 'variable') {
          const input = window.prompt(`請輸入【${bill.name}】本期的實際扣款金額：`);
          if (!input || isNaN(input)) return alert("❌ 已取消或金額無效");
          finalAmount = Number(input);
      }
      
      if (finalAmount <= 0) return alert("金額無效");
      if (!window.confirm(`確定要認列【${bill.name}】扣款 ${formatMoney(finalAmount)} 嗎？`)) return;

      // 1. 寫入流水帳 (打上 [定期帳單] 標籤)
      if (bill.scope === 'joint') {
          onAddJointExpense(todayStr, '固定費用', finalAmount, bill.payer, `[定期帳單] ${bill.name}`);
      } else {
          const userKey = bill.payer === 'userA' ? 'heng' : 'de';
          onAddExpense(todayStr, { fixed: finalAmount }, finalAmount, userKey, `[定期帳單] ${bill.name}`);
      }

      // 2. 更新下次扣款日
      let d = new Date(bill.nextDate);
      d.setMonth(d.getMonth() + bill.cycle);
      const nextDateStr = d.toISOString().split('T')[0];

      // 3. 儲存回資料庫
      const newBills = safeBills.map(b => b.id === bill.id ? { ...b, nextDate: nextDateStr } : b);
      setAssets({ ...assets, bills: newBills });
  };

  const handleDeleteBill = (id) => {
      if(!window.confirm("⚠️ 確定要刪除這個帳單提醒嗎？(不會刪除過去的記帳紀錄)")) return;
      setAssets({ ...assets, bills: safeBills.filter(b => b.id !== id) });
  };

  return (
    <div style={{animation: 'fadeIn 0.5s'}}>
      <h1 className="page-title">記帳</h1>

      {/* 頂部導覽 */}
      <div style={{display:'flex', gap:'10px', marginBottom:'20px'}}>
        <button className={`glass-btn ${activeTab==='joint'?'':'inactive'}`} onClick={()=>setActiveTab('joint')} style={{flex:1, padding:'8px 0'}}>🏫 共同</button>
        <button className={`glass-btn ${activeTab==='personal'?'':'inactive'}`} onClick={()=>setActiveTab('personal')} style={{flex:1, padding:'8px 0'}}>👤 個人</button>
        <button className={`glass-btn ${activeTab==='bills'?'':'inactive'}`} onClick={()=>setActiveTab('bills')} style={{flex:1, padding:'8px 0', border: safeBills.some(b => isApproaching(b.nextDate)) ? '1px solid #e67e22' : 'none'}}>
            📅 帳單 {safeBills.some(b => isApproaching(b.nextDate)) && '🔴'}
        </button>
      </div>

      {activeTab !== 'bills' && (
        <div className="glass-card" style={{ padding: '15px 20px', marginBottom: '20px', borderLeft: '5px solid #667eea', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <label style={{fontWeight:'bold', fontSize:'1.1rem', margin:0}}>📅 消費日期</label>
          <input type="date" className="glass-input" style={{width:'auto', margin:0, padding:'6px 10px'}} value={txDate} onChange={(e) => setTxDate(e.target.value)} />
        </div>
      )}

      {/* 🏫 共同記帳面板 */}
      {activeTab === 'joint' && (
        <div className="glass-card" style={{border:'1px solid #a8e6cf'}}>
          <h3 style={{marginTop:0, marginBottom:'15px', color:'#555'}}>🏫 共同花費</h3>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{display:'block', marginBottom:'8px', color:'#555', fontSize:'0.9rem'}}>分類</label>
            <SegmentedControl 
              options={[
                { label: '🍔 餐費', value: '餐費' },
                { label: '🛍️ 購物', value: '購物' },
                { label: '🏠 固定', value: '固定費用' },
                { label: '📦 其他', value: '其他' }
              ]} 
              value={jointCat} onChange={setJointCat} 
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{display:'block', marginBottom:'8px', color:'#555', fontSize:'0.9rem'}}>付款方式 (誰付的錢？)</label>
            <SegmentedControl 
              options={[
                { label: '🏫 共同直接付', value: 'jointCash' },
                { label: '🐶 恆恆代墊', value: 'userA' },
                { label: '🐕 得得代墊', value: 'userB' }
              ]} 
              value={jointAdvanced} onChange={setJointAdvanced} 
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label>金額</label>
            <input type="number" inputMode="numeric" className="glass-input" value={jointAmount} onChange={(e)=>setJointAmount(e.target.value)} placeholder="0" />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label>備註內容</label>
            <input type="text" className="glass-input" value={jointNote} onChange={(e)=>setJointNote(e.target.value)} placeholder="例如：全聯買菜" />
          </div>

          <button className="glass-btn" style={{width:'100%', background:'linear-gradient(135deg, #a8e6cf 0%, #dcedc1 100%)', color:'#333', fontWeight:'bold'}} onClick={handleJointSubmit}>
            確認記帳
          </button>
        </div>
      )}

      {/* 👤 個人記帳面板 */}
      {activeTab === 'personal' && (
        <div className="glass-card" style={{border:'1px solid #ff9a9e'}}>
          <h3 style={{marginTop:0, marginBottom:'15px', color:'#555'}}>👤 個人日記帳</h3>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{display:'block', marginBottom:'8px', color:'#555', fontSize:'0.9rem'}}>記誰的帳？</label>
            <SegmentedControl 
              options={[
                { label: '🐶 恆恆', value: 'heng' },
                { label: '🐕 得得', value: 'de' }
              ]} 
              value={persUser} onChange={setPersUser} 
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label>花費金額</label>
            <input type="number" inputMode="numeric" className="glass-input" value={persAmount} onChange={(e)=>setPersAmount(e.target.value)} placeholder="0" />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label>備註內容</label>
            <input type="text" className="glass-input" value={persNote} onChange={(e)=>setPersNote(e.target.value)} placeholder="例如：買手搖飲" />
          </div>

          <button className="glass-btn" style={{width:'100%', background:'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)', color:'#333', fontWeight:'bold'}} onClick={handlePersonalSubmit}>
            確認記帳
          </button>
        </div>
      )}

      {/* 📅 帳單管家面板 */}
      {activeTab === 'bills' && (
        <div>
           {/* 新增按鈕 */}
           {!showAddBill && (
              <button className="glass-btn" style={{width:'100%', marginBottom:'20px', background:'#fff', border:'1px dashed #ccc'}} onClick={() => setShowAddBill(true)}>
                 ➕ 新增定期帳單 / 訂閱
              </button>
           )}

           {/* 新增帳單表單 */}
           {showAddBill && (
              <div className="glass-card" style={{marginBottom:'20px', border:'1px solid #3498db'}}>
                  <h4 style={{marginTop:0, color:'#3498db'}}>新增帳單設定</h4>
                  <input type="text" className="glass-input" placeholder="帳單名稱 (例: Netflix, 水費)" value={billName} onChange={e=>setBillName(e.target.value)} />
                  
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{fontSize:'0.85rem', color:'#666'}}>帳單歸屬 (從哪裡扣款？)</label>
                    <SegmentedControl 
                      options={[
                        { label: '共同帳戶', value: 'jointCash' },
                        { label: '恆恆個人', value: 'userA' },
                        { label: '得得個人', value: 'userB' }
                      ]} 
                      value={billPayer} onChange={(v) => { setBillPayer(v); setBillScope(v === 'jointCash' ? 'joint' : 'personal'); }} 
                    />
                  </div>

                  <div style={{ marginBottom: '10px' }}>
                    <label style={{fontSize:'0.85rem', color:'#666'}}>金額類型</label>
                    <SegmentedControl 
                      options={[
                        { label: '固定金額 (如訂閱)', value: 'fixed' },
                        { label: '變動金額 (如水電)', value: 'variable' }
                      ]} 
                      value={billType} onChange={setBillType} 
                    />
                  </div>

                  {billType === 'fixed' && (
                      <input type="number" inputMode="numeric" className="glass-input" placeholder="請輸入每期固定金額" value={billAmount} onChange={e=>setBillAmount(e.target.value)} />
                  )}

                  <div style={{ marginBottom: '10px' }}>
                    <label style={{fontSize:'0.85rem', color:'#666'}}>繳費週期</label>
                    <SegmentedControl 
                      options={[
                        { label: '每月', value: 1 },
                        { label: '每兩月', value: 2 },
                        { label: '每年', value: 12 }
                      ]} 
                      value={billCycle} onChange={setBillCycle} 
                    />
                  </div>

                  <div style={{ marginBottom: '15px' }}>
                    <label style={{fontSize:'0.85rem', color:'#666'}}>「下次」預計扣款/繳費日</label>
                    <input type="date" className="glass-input" value={billNextDate} onChange={e=>setBillNextDate(e.target.value)} />
                  </div>

                  <div style={{display:'flex', gap:'10px'}}>
                      <button className="glass-btn" style={{flex:1, background:'#eee', color:'#333'}} onClick={() => setShowAddBill(false)}>取消</button>
                      <button className="glass-btn" style={{flex:1, background:'#3498db', color:'#fff'}} onClick={handleSaveNewBill}>儲存設定</button>
                  </div>
              </div>
           )}

           {/* 帳單列表 */}
           <h3 style={{color:'#555', marginBottom:'15px'}}>📋 我的帳單清單</h3>
           {safeBills.length === 0 ? (
               <div style={{textAlign:'center', color:'#888', padding:'20px'}}>還沒有設定任何定期帳單喔！</div>
           ) : (
               safeBills.sort((a, b) => new Date(a.nextDate) - new Date(b.nextDate)).map(bill => {
                   const alert = isApproaching(bill.nextDate);
                   return (
                       <div key={bill.id} className="glass-card" style={{marginBottom:'15px', borderLeft: alert ? '5px solid #e67e22' : '5px solid #2ecc71', position:'relative'}}>
                           <button onClick={() => handleDeleteBill(bill.id)} style={{position:'absolute', top:'10px', right:'10px', background:'transparent', border:'none', color:'#ccc', cursor:'pointer'}}>✖</button>
                           
                           <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'10px'}}>
                               <div>
                                   <div style={{fontWeight:'bold', fontSize:'1.1rem', color:'#333'}}>{bill.name}</div>
                                   <div style={{fontSize:'0.8rem', color:'#666', marginTop:'4px'}}>
                                       {bill.payer === 'jointCash' ? '🏫 共同扣款' : (bill.payer === 'userA' ? '🐶 恆恆付' : '🐕 得得付')} | 
                                       {bill.cycle === 1 ? ' 每月' : bill.cycle === 2 ? ' 每兩月' : ' 每年'}
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