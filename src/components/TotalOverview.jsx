// src/components/TotalOverview.jsx
import React, { useState } from 'react';

const TotalOverview = ({ assets, setAssets }) => {
  const formatMoney = (num) => "$" + Math.round(Number(num)).toLocaleString();
  const roi = assets.roi || { stock: 0, fund: 0, deposit: 0, other: 0 };
  const history = assets.monthlyExpenses || [];
  
  // 🛡️ 防呆機制：確保舊資料也有投資欄位
  const safeInvestments = assets.jointInvestments || { stock: 0, fund: 0, deposit: 0, other: 0 };

  const [ledgerModal, setLedgerModal] = useState(null); // 'jointCash', 'userA', 'userB'

  const getEstValue = (type) => {
    const principal = safeInvestments[type] || 0;
    const rate = roi[type] || 0;
    return principal * (1 + rate / 100);
  };

  const handleRoiChange = (type, value) => {
    const newAssets = { ...assets };
    if (!newAssets.roi) newAssets.roi = {};
    newAssets.roi[type] = parseFloat(value) || 0;
    setAssets(newAssets);
  };

  const totalJointInvestPrincipal = Object.values(safeInvestments).reduce((a, b) => a + b, 0);
  const totalEstValue = getEstValue('stock') + getEstValue('fund') + getEstValue('deposit') + getEstValue('other');
  
  // ★ 修復白畫面元兇：補上遺漏的未實現損益計算變數！
  const totalUnrealizedPL = totalEstValue - totalJointInvestPrincipal;
  
  const totalAssets = (assets.userA || 0) + (assets.userB || 0) + (assets.jointCash || 0) + totalEstValue;

  // ★ 根據「資金快照」動態產生分類帳 (Ledger)
  const getLedgerRecords = (accountKey) => {
    let records = [];
    history.forEach(r => {
      // 1. 正常的交易軌跡
      if (r.auditTrail) {
        const diff = (r.auditTrail.after[accountKey] || 0) - (r.auditTrail.before[accountKey] || 0);
        if (diff !== 0) {
          records.push({ ...r, isReversal: false, diff, balance: r.auditTrail.after[accountKey] });
        }
      }
      // 2. 被刪除/作廢時的退款軌跡
      if (r.isDeleted && r.deleteAuditTrail) {
        const diff = (r.deleteAuditTrail.after[accountKey] || 0) - (r.deleteAuditTrail.before[accountKey] || 0);
        if (diff !== 0) {
           records.push({ 
             ...r, isReversal: true, diff, 
             balance: r.deleteAuditTrail.after[accountKey], 
             actionName: '作廢退款',
             timestamp: r.deleteTimestamp // 使用作廢當下的時間
           });
        }
      }
    });
    return records.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
  };

  const accountNames = { jointCash: '共同現金', userA: '恆恆🐶', userB: '得得🐕' };

  return (
    <div>
      <h1 className="page-title">資產總覽</h1>

      {/* 1. 總資產概況 */}
      <div className="glass-card" style={{ textAlign: 'center', background: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)', color: '#fff', border: 'none' }}>
        <h2 style={{ color: '#fff', marginBottom: '10px', textShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>💰 雙人總資產</h2>
        <div style={{ fontSize: '3rem', fontWeight: '800', textShadow: '0 2px 10px rgba(0,0,0,0.2)' }}>
          {formatMoney(totalAssets)}
        </div>
      </div>

      {/* 2. 共同資產 */}
      <div className="glass-card">
        <h3>🏫 共同資產</h3>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', background: 'rgba(255,255,255,0.5)', borderRadius: '16px', marginBottom: '15px' }}>
          <div>
            <div style={{fontSize:'1rem', fontWeight:'bold', color:'#555', display:'flex', alignItems:'center', gap:'10px'}}>
              共同現金
              <button className="glass-btn" style={{padding:'2px 8px', fontSize:'0.75rem', background:'rgba(0,0,0,0.05)', color:'#666', boxShadow:'none'}} onClick={() => setLedgerModal('jointCash')}>
                 🔍 詳情
              </button>
            </div>
            <div style={{fontSize:'1.8rem', fontWeight:'bold', color:'#17c9b2'}}>{formatMoney(assets.jointCash || 0)}</div>
          </div>
        </div>

        <div style={{ padding: '15px', background: 'rgba(255,255,255,0.5)', borderRadius: '16px' }}>
          <div style={{display:'flex', justifyContent:'space-between', marginBottom:'15px', alignItems:'flex-end'}}>
             <div style={{fontSize:'1rem', fontWeight:'bold', color:'#555'}}>共同投資部位</div>
             <div style={{textAlign:'right'}}>
                <div style={{fontSize:'1.3rem', fontWeight:'bold', color:'#8e44ad'}}>{formatMoney(totalEstValue)}</div>
                <div style={{fontSize:'0.8rem', color: totalUnrealizedPL >= 0 ? '#e67e22' : '#2ecc71'}}>
                    (未實現損益: {totalUnrealizedPL >= 0 ? '+' : ''}{formatMoney(totalUnrealizedPL)})
                </div>
             </div>
          </div>

          <div style={{display:'grid', gap:'10px'}}>
            {['stock', 'fund', 'deposit', 'other'].map(type => {
                const typeLabel = { stock: '股票', fund: '基金', deposit: '定存', other: '其他' }[type];
                return (
                    <div key={type} style={{display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(255,255,255,0.6)', padding:'8px 12px', borderRadius:'10px'}}>
                        <span style={{fontWeight:'bold', width:'50px'}}>{typeLabel}</span>
                        <div style={{display:'flex', alignItems:'center', gap:'5px', flex:1, justifyContent:'center'}}>
                            <span style={{fontSize:'0.8rem', color:'#888'}}>投報率</span>
                            <input 
                                type="number" 
                                value={roi[type] || ''} 
                                onChange={(e)=>handleRoiChange(type, e.target.value)}
                                placeholder="0"
                                style={{width:'45px', padding:'4px', borderRadius:'6px', border:'1px solid #ddd', textAlign:'center', fontSize:'0.9rem'}}
                            />
                            <span style={{fontSize:'0.8rem', color:'#888'}}>%</span>
                        </div>
                        <span style={{fontWeight:'500', minWidth:'60px', textAlign:'right'}}>{formatMoney(getEstValue(type))}</span>
                    </div>
                );
            })}
          </div>
        </div>
      </div>

      {/* 3. 個人資產狀況 */}
      <div className="glass-card">
        <h3>🐶 個人資產 (未劃撥)</h3>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '15px', background: 'rgba(255,255,255,0.5)', borderRadius: '16px' }}>
          <div style={{textAlign:'center', width:'48%'}}>
              <div style={{fontSize:'1.1rem', fontWeight:'bold', marginBottom:'5px', display:'flex', justifyContent:'center', alignItems:'center', gap:'5px'}}>
                  恆恆🐶
                  <button className="glass-btn" style={{padding:'2px 6px', fontSize:'0.7rem', background:'rgba(0,0,0,0.05)', color:'#666', boxShadow:'none'}} onClick={() => setLedgerModal('userA')}>🔍</button>
              </div>
              <div style={{fontSize:'1.5rem', color:'#667eea'}}>{formatMoney(assets.userA || 0)}</div>
          </div>
          <div style={{width:'1px', background:'#ddd'}}></div>
          <div style={{textAlign:'center', width:'48%'}}>
              <div style={{fontSize:'1.1rem', fontWeight:'bold', marginBottom:'5px', display:'flex', justifyContent:'center', alignItems:'center', gap:'5px'}}>
                  得得🐕
                  <button className="glass-btn" style={{padding:'2px 6px', fontSize:'0.7rem', background:'rgba(0,0,0,0.05)', color:'#666', boxShadow:'none'}} onClick={() => setLedgerModal('userB')}>🔍</button>
              </div>
              <div style={{fontSize:'1.5rem', color:'#764ba2'}}>{formatMoney(assets.userB || 0)}</div>
          </div>
        </div>
      </div>

      {/* ★ 分類帳詳情 Modal */}
      {ledgerModal && (
         <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.6)', zIndex:1000, display:'flex', justifyContent:'center', alignItems:'center', padding:'20px' }} onClick={() => setLedgerModal(null)}>
             <div className="glass-card" style={{width:'100%', maxWidth:'500px', maxHeight:'85vh', overflowY:'auto', background:'white'}} onClick={e => e.stopPropagation()}>
                 <h3 style={{marginTop:0, borderBottom:'1px solid #eee', paddingBottom:'10px'}}>
                    📖 {accountNames[ledgerModal]} 的變動軌跡
                 </h3>
                 <div style={{marginBottom:'20px'}}>
                     {getLedgerRecords(ledgerModal).length === 0 ? (
                         <div style={{textAlign:'center', color:'#888', padding:'20px'}}>目前還沒有變動紀錄喔！(舊紀錄不含快照)</div>
                     ) : (
                         getLedgerRecords(ledgerModal).map((r, idx) => (
                             <div key={idx} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px dashed #eee'}}>
                                 <div style={{flex: 1}}>
                                     <div style={{fontSize:'0.8rem', color:'#888'}}>{new Date(r.timestamp).toLocaleString('zh-TW', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})}</div>
                                     <div style={{fontWeight:'bold', color: r.isReversal ? '#e74c3c' : '#444'}}>
                                         {r.isReversal ? r.actionName : (r.note === '月結記帳' ? '日記帳' : r.note)}
                                     </div>
                                 </div>
                                 <div style={{textAlign:'right'}}>
                                     <div style={{fontWeight:'bold', color: r.diff > 0 ? '#2ecc71' : '#e74c3c'}}>
                                         {r.diff > 0 ? '+' : ''}{formatMoney(r.diff)}
                                     </div>
                                     <div style={{fontSize:'0.75rem', color:'#666'}}>
                                         餘額: {formatMoney(r.balance)}
                                     </div>
                                 </div>
                             </div>
                         ))
                     )}
                 </div>
                 <button className="glass-btn" style={{width:'100%', background:'#666'}} onClick={() => setLedgerModal(null)}>關閉</button>
             </div>
         </div>
       )}
    </div>
  );
};

export default TotalOverview;