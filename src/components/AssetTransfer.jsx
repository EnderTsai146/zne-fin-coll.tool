// src/components/AssetTransfer.jsx
import React, { useState, useRef } from 'react';

const formatMoney = (num) => "$" + Number(num).toLocaleString();

// 接收 setAssets 以便進行「匯入還原」操作
const AssetTransfer = ({ assets, onTransaction, setAssets }) => {
  const [activeTab, setActiveTab] = useState('income');
  
  // 全域交易日期 (預設為今天)
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);

  // 隱藏的檔案上傳欄位 (用於匯入)
  const fileInputRef = useRef(null);

  // 狀態
  const [incomeUser, setIncomeUser] = useState('userA');
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomeNote, setIncomeNote] = useState('');

  const [transSource, setTransSource] = useState('userA');
  const [transTarget, setTransTarget] = useState('jointCash');
  const [transInvestType, setTransInvestType] = useState('stock');
  const [transAmount, setTransAmount] = useState('');

  // 共同支出相關狀態
  const [withdrawType, setWithdrawType] = useState('spend');
  const [withdrawSource, setWithdrawSource] = useState('jointCash');
  const [withdrawInvestSource, setWithdrawInvestSource] = useState('stock');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  // ★ 新增：共同支出類別
  const [spendCategory, setSpendCategory] = useState('餐費');

  // 1. 新增個人收入
  const handleAddIncome = () => {
    const val = parseInt(incomeAmount);
    if (!val || val <= 0) return alert("請輸入有效金額");
    
    const payerName = incomeUser === 'userA' ? '恆恆🐶' : '得得🐕';
    const finalNote = incomeNote.trim() || '薪資/收入';

    const confirmMsg = `【確認存入】\n\n日期：${txDate}\n對象：${payerName}\n來源：${finalNote}\n金額：${formatMoney(val)}\n\n確定要執行嗎？`;
    if (!window.confirm(confirmMsg)) return;

    const newAssets = { ...assets };
    newAssets[incomeUser] += val;
    
    onTransaction(newAssets, {
      type: 'income',
      category: '個人收入',
      payer: payerName,
      total: val,
      note: finalNote,
      month: txDate.slice(0, 7),
      date: txDate
    });

    alert(`💰 已存入 ${formatMoney(val)}`);
    setIncomeAmount('');
    setIncomeNote('');
  };

  // 2. 劃撥 (個人 -> 共同)
  const handleTransfer = () => {
    const val = parseInt(transAmount);
    if (!val || val <= 0) return alert("請輸入有效金額");
    if (assets[transSource] < val) return alert("❌ 個人餘額不足！");

    const payerName = transSource === 'userA' ? '恆恆🐶' : '得得🐕';
    let targetName = "共同現金";
    if (transTarget === 'jointInvest') targetName = `共同投資-${transInvestType}`;

    const confirmMsg = `【確認劃撥】\n\n日期：${txDate}\n從：${payerName}\n轉入：${targetName}\n金額：${formatMoney(val)}\n\n確定要執行嗎？`;
    if (!window.confirm(confirmMsg)) return;

    const newAssets = { ...assets };
    newAssets[transSource] -= val;
    
    if (transTarget === 'jointCash') {
      newAssets.jointCash += val;
    } else {
      newAssets.jointInvestments[transInvestType] += val;
    }

    onTransaction(newAssets, {
      type: 'transfer',
      category: '資產劃撥',
      payer: payerName,
      total: val,
      note: `轉移至 ${targetName}`,
      month: txDate.slice(0, 7),
      date: txDate
    });

    alert("✅ 劃撥成功！");
    setTransAmount('');
  };

  // 3. 共同資產支出/變現
  const handleWithdraw = () => {
    const val = parseInt(withdrawAmount);
    if (!val || val <= 0) return alert("請輸入有效金額");

    const newAssets = { ...assets };
    const selectedMonth = txDate.slice(0, 7);

    // 情境 A: 共同現金 -> 花掉
    if (withdrawType === 'spend') {
        if (newAssets.jointCash < val) return alert("❌ 共同現金不足！");

        // ★ 修改確認訊息，加入類別
        const confirmMsg = `【確認共同支出】\n\n日期：${txDate}\n來源：共同現金\n類別：${spendCategory}\n金額：${formatMoney(val)}\n\n確定要扣款嗎？`;
        if (!window.confirm(confirmMsg)) return;

        newAssets.jointCash -= val;
        
        onTransaction(newAssets, {
          type: 'spend',
          category: '共同支出',
          payer: '共同帳戶',
          total: val,
          note: spendCategory, // ★ 將選擇的類別記錄在備註中
          month: selectedMonth,
          date: txDate
        });
        alert(`💸 已支出 ${formatMoney(val)} (${spendCategory})`);
    } 
    // 情境 B: 投資變現
    else {
        const roi = (assets.roi && assets.roi[withdrawInvestSource]) || 0;
        const principal = newAssets.jointInvestments[withdrawInvestSource];
        const estValue = principal * (1 + roi / 100);

        if (estValue < val) return alert(`❌ 餘額不足！\n該項目預估現值僅為 ${formatMoney(estValue)}`);

        const confirmMsg = `【確認投資變現】\n\n日期：${txDate}\n賣出項目：${withdrawInvestSource}\n變現金額：${formatMoney(val)}\n(將轉入共同現金)\n\n確定要執行嗎？`;
        if (!window.confirm(confirmMsg)) return;

        const principalToDeduct = val / (1 + roi / 100);
        newAssets.jointInvestments[withdrawInvestSource] -= principalToDeduct;
        newAssets.jointCash += val;

        onTransaction(newAssets, {
            type: 'liquidate',
            category: '投資變現',
            payer: '共同帳戶',
            total: val,
            note: `賣出 ${withdrawInvestSource} (獲利實現)`,
            month: selectedMonth,
            date: txDate
        });
        alert(`🔄 已將 ${formatMoney(val)} 變現至共同現金！`);
    }
    setWithdrawAmount('');
  };

  // --- 資料匯出 (備份) ---
  const handleExport = () => {
    const fileName = `雙人資產備份_${new Date().toISOString().split('T')[0]}.json`;
    const json = JSON.stringify(assets, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = href;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- 資料匯入 (還原) ---
  const handleImportClick = () => {
    fileInputRef.current.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedData = JSON.parse(event.target.result);
        
        if (importedData.userA === undefined || importedData.monthlyExpenses === undefined) {
            alert("❌ 檔案格式錯誤！這似乎不是本系統的備份檔。");
            return;
        }

        if (window.confirm("⚠️ 警告：匯入將會「覆蓋」目前所有的資料！\n\n確定要還原備份嗎？")) {
            if (setAssets) {
                setAssets(importedData);
                alert("✅ 資料還原成功！");
            } else {
                alert("⚠️ 系統錯誤：無法寫入資料 (setAssets 未定義)");
            }
        }
      } catch (error) {
        alert("❌ 讀取失敗，檔案可能已損毀。");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div>
      <h1 className="page-title">資產操作</h1>
      
      {/* 1. 分頁按鈕 */}
      <div style={{display:'flex', gap:'10px', marginBottom:'20px'}}>
        <button className={`glass-btn ${activeTab==='income'?'':'inactive'}`} onClick={()=>setActiveTab('income')} style={{flex:1}}>存入個人</button>
        <button className={`glass-btn ${activeTab==='transfer'?'':'inactive'}`} onClick={()=>setActiveTab('transfer')} style={{flex:1}}>轉入共同</button>
        <button className={`glass-btn ${activeTab==='withdraw'?'':'inactive'}`} onClick={()=>setActiveTab('withdraw')} style={{flex:1}}>共同支出</button>
      </div>

      {/* 2. 交易日期 */}
      <div className="glass-card" style={{ padding: '15px 20px', marginBottom: '20px', borderLeft: '5px solid #667eea', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <label style={{fontWeight:'bold', fontSize:'1.1rem'}}>📅 交易日期</label>
        <input 
            type="date" 
            className="glass-input" 
            style={{width:'auto', marginBottom:0, padding:'8px 12px'}} 
            value={txDate} 
            onChange={(e) => setTxDate(e.target.value)} 
        />
      </div>

      {/* 3. 操作區塊 */}
      
      {/* 存入個人 */}
      {activeTab === 'income' && (
        <div className="glass-card">
          <h3>💰 領錢了！(新增收入)</h3>
          
          <div style={{ marginBottom: '15px' }}>
            <label>存入誰的戶頭？</label>
            <select className="glass-input" value={incomeUser} onChange={(e)=>setIncomeUser(e.target.value)}>
              <option value="userA">恆恆🐶</option>
              <option value="userB">得得🐕</option>
            </select>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label>備註 (來源)</label>
            <input 
                type="text" 
                className="glass-input" 
                value={incomeNote} 
                onChange={(e)=>setIncomeNote(e.target.value)} 
                placeholder="例如：薪資、股利、獎金..." 
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label>金額 {incomeAmount && <span style={{color:'#666', fontSize:'0.9rem'}}>({formatMoney(incomeAmount)})</span>}</label>
            <input 
                type="number" 
                inputMode="numeric" 
                className="glass-input" 
                value={incomeAmount} 
                onChange={(e)=>setIncomeAmount(e.target.value)} 
                placeholder="輸入金額" 
            />
          </div>
          <button className="glass-btn" style={{width:'100%'}} onClick={handleAddIncome}>確認存入</button>
        </div>
      )}

      {/* 劃撥 */}
      {activeTab === 'transfer' && (
        <div className="glass-card">
          <h3>💸 上繳公庫 (個人 ➔ 共同)</h3>
          <div style={{ marginBottom: '15px' }}>
            <label>來源</label>
            <select className="glass-input" value={transSource} onChange={(e) => setTransSource(e.target.value)}>
              <option value="userA">恆恆🐶 ({formatMoney(assets.userA)})</option>
              <option value="userB">得得🐕 ({formatMoney(assets.userB)})</option>
            </select>
          </div>
          <div style={{ marginBottom: '15px' }}>
            <label>目標</label>
            <select className="glass-input" value={transTarget} onChange={(e) => setTransTarget(e.target.value)}>
              <option value="jointCash">共同現金</option>
              <option value="jointInvest">共同投資</option>
            </select>
          </div>
          {transTarget === 'jointInvest' && (
             <div style={{ marginBottom: '15px' }}>
                <label>投資項目</label>
                <select className="glass-input" value={transInvestType} onChange={(e) => setTransInvestType(e.target.value)}>
                  <option value="stock">股票</option>
                  <option value="fund">基金</option>
                  <option value="deposit">定存</option>
                  <option value="other">其他</option>
                </select>
             </div>
          )}
          <div style={{ marginBottom: '15px' }}>
            <label>金額 {transAmount && <span style={{color:'#666', fontSize:'0.9rem'}}>({formatMoney(transAmount)})</span>}</label>
            <input 
                type="number" 
                inputMode="numeric" 
                className="glass-input" 
                value={transAmount} 
                onChange={(e)=>setTransAmount(e.target.value)} 
                placeholder="0" 
            />
          </div>
          <button className="glass-btn" style={{width:'100%'}} onClick={handleTransfer}>確認劃撥</button>
        </div>
      )}

      {/* 共同支出/變現 */}
      {activeTab === 'withdraw' && (
        <div className="glass-card" style={{border:'1px solid #ffb3b3'}}>
          <h3>📤 共同資產變動</h3>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{display:'block', marginBottom:'5px', fontWeight:'bold'}}>1. 操作類型</label>
            <select 
                className="glass-input" 
                value={withdrawType} 
                onChange={(e) => {
                    const newType = e.target.value;
                    setWithdrawType(newType);
                    if (newType === 'liquidate') {
                        setWithdrawSource('jointInvest');
                    } else {
                        setWithdrawSource('jointCash');
                    }
                }}
            >
              <option value="spend">💸 直接花費 (從現金支出)</option>
              <option value="liquidate">🔄 投資變現 (賣出換現金)</option>
            </select>
          </div>

          {/* ★ 新增：當選擇「直接花費」時，顯示類別選單 */}
          {withdrawType === 'spend' && (
            <>
              <div style={{ marginBottom: '15px' }}>
                <label style={{display:'block', marginBottom:'5px', fontWeight:'bold'}}>2. 支出類別</label>
                <select className="glass-input" value={spendCategory} onChange={(e) => setSpendCategory(e.target.value)}>
                  <option value="餐費">餐費</option>
                  <option value="購物">購物</option>
                  <option value="固定費用">固定費用</option>
                  <option value="其他">其他</option>
                </select>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{display:'block', marginBottom:'5px', fontWeight:'bold'}}>3. 扣款來源</label>
                <select className="glass-input" value={withdrawSource} onChange={(e) => setWithdrawSource(e.target.value)}>
                  <option value="jointCash">共同現金</option>
                </select>
              </div>
            </>
          )}

          {(withdrawType === 'liquidate' || withdrawSource === 'jointInvest') && (
             <div style={{ marginBottom: '15px', padding:'15px', background:'rgba(255,255,255,0.4)', borderRadius:'12px', border:'1px dashed #999' }}>
                <label style={{display:'block', marginBottom:'5px', fontWeight:'bold', color:'#d63031'}}>
                    2. 選擇要賣出的資產
                </label>
                <select className="glass-input" value={withdrawInvestSource} onChange={(e) => setWithdrawInvestSource(e.target.value)}>
                  <option value="stock">股票</option>
                  <option value="fund">基金</option>
                  <option value="deposit">定存</option>
                  <option value="other">其他</option>
                </select>
             </div>
          )}

          <div style={{ marginBottom: '15px' }}>
            <label>{withdrawType === 'spend' ? '4. 金額' : '3. 金額'} {withdrawAmount && <span style={{color:'#666', fontSize:'0.9rem'}}>({formatMoney(withdrawAmount)})</span>}</label>
            <input 
                type="number" 
                inputMode="numeric"
                className="glass-input" 
                value={withdrawAmount} 
                onChange={(e)=>setWithdrawAmount(e.target.value)} 
                placeholder="0" 
            />
          </div>
          
          <button className="glass-btn" style={{width:'100%', background:'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)', color:'#d63031'}} onClick={handleWithdraw}>
            {withdrawType === 'liquidate' ? '確認變現 (以現值計算)' : '確認支出'}
          </button>
        </div>
      )}

      {/* 資料管理區塊 */}
      <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: '1px solid rgba(0,0,0,0.1)' }}>
        <h3 style={{color:'#666', marginBottom:'15px'}}>💾 資料管理</h3>
        
        <div style={{display:'flex', gap:'15px'}}>
            <button className="glass-btn" style={{flex:1, background: '#1d1d1f', color:'white', fontSize:'0.9rem'}} onClick={handleExport}>
                📥 匯出備份
            </button>
            <button className="glass-btn" style={{flex:1, background: 'rgba(255,255,255,0.8)', color:'#1d1d1f', border:'1px solid #ccc', fontSize:'0.9rem'}} onClick={handleImportClick}>
                📤 匯入還原
            </button>
            <input type="file" ref={fileInputRef} style={{display:'none'}} accept=".json" onChange={handleFileChange} />
        </div>
      </div>

    </div>
  );
};

export default AssetTransfer;