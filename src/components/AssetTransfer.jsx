// src/components/AssetTransfer.jsx
import React, { useState, useRef } from 'react';

const formatMoney = (num) => "$" + Number(num).toLocaleString();

const AssetTransfer = ({ assets, onTransaction, setAssets }) => {
  const [activeTab, setActiveTab] = useState('personal');
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);
  const fileInputRef = useRef(null);

  // --- 狀態：個人資金操作 ---
  const [personalAction, setPersonalAction] = useState('income'); // income, profit, loss
  const [personalUser, setPersonalUser] = useState('userA');
  const [personalAmount, setPersonalAmount] = useState('');
  const [personalNote, setPersonalNote] = useState('');

  // --- 狀態：上繳公庫 ---
  const [transSource, setTransSource] = useState('userA');
  const [transAmount, setTransAmount] = useState('');

  // --- 狀態：共同投資操作 ---
  const [investAction, setInvestAction] = useState('buy'); // buy, sell
  const [investType, setInvestType] = useState('stock');
  const [investAmount, setInvestAmount] = useState('');

  // 1. 個人資金操作 (包含投資損益)
  const handlePersonalSubmit = () => {
    const val = parseInt(personalAmount);
    if (!val || val <= 0) return alert("請輸入有效金額");
    
    const userName = personalUser === 'userA' ? '恆恆🐶' : '得得🐕';
    const newAssets = { ...assets };

    let recordType = 'income';
    let recordCategory = '個人收入';
    let finalNote = personalNote.trim() || '薪資/收入';

    if (personalAction === 'loss') {
        if (newAssets[personalUser] < val) return alert(`❌ ${userName} 的餘額不足以認列虧損！`);
        newAssets[personalUser] -= val;
        recordType = 'personal_invest_loss';
        recordCategory = '投資虧損';
        finalNote = personalNote.trim() || '投資虧損';
    } else {
        newAssets[personalUser] += val;
        if (personalAction === 'profit') {
            recordType = 'personal_invest_profit';
            recordCategory = '投資獲利';
            finalNote = personalNote.trim() || '投資獲利';
        }
    }

    const confirmMsg = `【確認個人資金變動】\n\n日期：${txDate}\n對象：${userName}\n類型：${recordCategory}\n金額：${formatMoney(val)}\n\n確定要執行嗎？`;
    if (!window.confirm(confirmMsg)) return;

    onTransaction(newAssets, {
      type: recordType,
      category: recordCategory,
      payer: userName,
      total: val,
      note: finalNote,
      month: txDate.slice(0, 7),
      date: txDate
    });

    alert(`✅ 已記錄 ${recordCategory}：${formatMoney(val)}`);
    setPersonalAmount('');
    setPersonalNote('');
  };

  // 2. 上繳公庫 (個人 -> 共同現金)
  const handleTransfer = () => {
    const val = parseInt(transAmount);
    if (!val || val <= 0) return alert("請輸入有效金額");
    if (assets[transSource] < val) return alert("❌ 個人餘額不足！");

    const userName = transSource === 'userA' ? '恆恆🐶' : '得得🐕';
    const confirmMsg = `【確認上繳公庫】\n\n日期：${txDate}\n從：${userName}\n轉入：共同現金\n金額：${formatMoney(val)}\n\n確定要執行嗎？`;
    if (!window.confirm(confirmMsg)) return;

    const newAssets = { ...assets };
    newAssets[transSource] -= val;
    newAssets.jointCash += val;

    onTransaction(newAssets, {
      type: 'transfer',
      category: '資產劃撥',
      payer: userName,
      total: val,
      note: `轉移至 共同現金`,
      month: txDate.slice(0, 7),
      date: txDate
    });

    alert("✅ 劃撥成功！");
    setTransAmount('');
  };

  // 3. 共同投資操作 (一鍵買賣)
  const handleInvestSubmit = () => {
    const val = parseInt(investAmount);
    if (!val || val <= 0) return alert("請輸入有效金額");

    const newAssets = { ...assets };
    const typeLabelMap = { stock: '股票', fund: '基金', deposit: '定存', other: '其他' };
    const label = typeLabelMap[investType];

    if (investAction === 'buy') {
        if (newAssets.jointCash < val) return alert("❌ 共同現金餘額不足！無法買入投資。");
        
        const confirmMsg = `【確認買入投資】\n\n將從「共同現金」扣款，買入「${label}」\n金額：${formatMoney(val)}\n\n確定要執行嗎？`;
        if (!window.confirm(confirmMsg)) return;

        newAssets.jointCash -= val;
        newAssets.jointInvestments[investType] += val;

        onTransaction(newAssets, {
            type: 'joint_invest_buy',
            category: '投資買入',
            payer: '共同帳戶',
            investType: investType,
            total: val,
            note: `買入 ${label}`,
            month: txDate.slice(0, 7),
            date: txDate
        });
        alert(`✅ 成功買入 ${label} ${formatMoney(val)}`);

    } else {
        // 賣出變現邏輯 (含 ROI 計算)
        const roi = (assets.roi && assets.roi[investType]) || 0;
        const principal = newAssets.jointInvestments[investType];
        const estValue = principal * (1 + roi / 100);

        if (estValue < val) return alert(`❌ 該投資項目的預估現值僅為 ${formatMoney(estValue)}，無法變現這麼多！`);

        const confirmMsg = `【確認投資變現】\n\n賣出「${label}」並轉回「共同現金」\n變現金額：${formatMoney(val)}\n\n確定要執行嗎？`;
        if (!window.confirm(confirmMsg)) return;

        const principalToDeduct = val / (1 + roi / 100);
        newAssets.jointInvestments[investType] -= principalToDeduct;
        newAssets.jointCash += val;

        onTransaction(newAssets, {
            type: 'joint_invest_sell',
            category: '投資變現',
            payer: '共同帳戶',
            investType: investType,
            total: val,
            note: `賣出 ${label} (轉回現金)`,
            month: txDate.slice(0, 7),
            date: txDate
        });
        alert(`🔄 成功變現 ${formatMoney(val)} 至共同現金！`);
    }
    setInvestAmount('');
  };

  // --- 資料匯出入 (維持不變) ---
  const handleExport = () => {
    const fileName = `雙人資產備份_${new Date().toISOString().split('T')[0]}.json`;
    const json = JSON.stringify(assets, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href; link.download = fileName;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };
  const handleImportClick = () => fileInputRef.current.click();
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedData = JSON.parse(event.target.result);
        if (importedData.userA === undefined) return alert("❌ 檔案格式錯誤！");
        if (window.confirm("⚠️ 警告：匯入將會「覆蓋」目前所有的資料！\n\n確定要還原備份嗎？")) {
            setAssets(importedData);
            alert("✅ 資料還原成功！");
        }
      } catch (error) { alert("❌ 讀取失敗。"); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div>
      <h1 className="page-title">資產操作</h1>
      
      {/* 分頁按鈕 */}
      <div style={{display:'flex', gap:'10px', marginBottom:'20px'}}>
        <button className={`glass-btn ${activeTab==='personal'?'':'inactive'}`} onClick={()=>setActiveTab('personal')} style={{flex:1}}>👤 個人資金</button>
        <button className={`glass-btn ${activeTab==='transfer'?'':'inactive'}`} onClick={()=>setActiveTab('transfer')} style={{flex:1}}>📥 上繳公庫</button>
        <button className={`glass-btn ${activeTab==='invest'?'':'inactive'}`} onClick={()=>setActiveTab('invest')} style={{flex:1}}>📈 共同投資</button>
      </div>

      <div className="glass-card" style={{ padding: '15px 20px', marginBottom: '20px', borderLeft: '5px solid #667eea', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <label style={{fontWeight:'bold', fontSize:'1.1rem'}}>📅 交易日期</label>
        <input type="date" className="glass-input" style={{width:'auto', marginBottom:0, padding:'8px 12px'}} value={txDate} onChange={(e) => setTxDate(e.target.value)} />
      </div>

      {/* 1. 個人資金區塊 */}
      {activeTab === 'personal' && (
        <div className="glass-card">
          <h3 style={{marginBottom: '15px'}}>💰 個人資金變動 (含投資)</h3>
          
          <div style={{ marginBottom: '15px' }}>
            <label>操作類型</label>
            <select className="glass-input" value={personalAction} onChange={(e)=>setPersonalAction(e.target.value)}>
              <option value="income">💵 一般收入 (薪水/獎金)</option>
              <option value="profit">📈 個人投資獲利 (股票當沖賺錢等)</option>
              <option value="loss">📉 個人投資虧損 (認賠殺出等)</option>
            </select>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label>對象戶頭</label>
            <select className="glass-input" value={personalUser} onChange={(e)=>setPersonalUser(e.target.value)}>
              <option value="userA">恆恆🐶 ({formatMoney(assets.userA)})</option>
              <option value="userB">得得🐕 ({formatMoney(assets.userB)})</option>
            </select>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label>備註 (可選)</label>
            <input type="text" className="glass-input" value={personalNote} onChange={(e)=>setPersonalNote(e.target.value)} placeholder="例如：1月薪資、台積電當沖..." />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label>金額</label>
            <input type="number" inputMode="numeric" className="glass-input" value={personalAmount} onChange={(e)=>setPersonalAmount(e.target.value)} placeholder="輸入金額" />
          </div>
          
          <button className="glass-btn" style={{width:'100%', background: personalAction === 'loss' ? '#ff7675' : ''}} onClick={handlePersonalSubmit}>
            確認送出
          </button>
        </div>
      )}

      {/* 2. 上繳公庫 */}
      {activeTab === 'transfer' && (
        <div className="glass-card">
          <h3 style={{marginBottom: '15px'}}>💸 上繳公庫 (個人 ➔ 共同現金)</h3>
          <div style={{ marginBottom: '15px' }}>
            <label>來源 (誰繳的？)</label>
            <select className="glass-input" value={transSource} onChange={(e) => setTransSource(e.target.value)}>
              <option value="userA">恆恆🐶 ({formatMoney(assets.userA)})</option>
              <option value="userB">得得🐕 ({formatMoney(assets.userB)})</option>
            </select>
          </div>
          <div style={{ marginBottom: '15px' }}>
            <label>金額</label>
            <input type="number" inputMode="numeric" className="glass-input" value={transAmount} onChange={(e)=>setTransAmount(e.target.value)} placeholder="0" />
          </div>
          <button className="glass-btn" style={{width:'100%'}} onClick={handleTransfer}>確認上繳</button>
        </div>
      )}

      {/* 3. 共同投資 */}
      {activeTab === 'invest' && (
        <div className="glass-card" style={{border:'1px solid #b78af7'}}>
          <h3 style={{marginBottom: '15px'}}>📈 共同投資買賣</h3>
          
          <div style={{ marginBottom: '15px', display:'flex', gap:'10px' }}>
            <div style={{flex:1}}>
                <label>動作</label>
                <select className="glass-input" value={investAction} onChange={(e)=>setInvestAction(e.target.value)}>
                  <option value="buy">📥 買入 (扣除現金)</option>
                  <option value="sell">📤 賣出 (退回現金)</option>
                </select>
            </div>
            <div style={{flex:1}}>
                <label>資產項目</label>
                <select className="glass-input" value={investType} onChange={(e)=>setInvestType(e.target.value)}>
                  <option value="stock">股票</option>
                  <option value="fund">基金</option>
                  <option value="deposit">定存</option>
                  <option value="other">其他</option>
                </select>
            </div>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label>{investAction === 'buy' ? '買入總金額' : '變現提領金額'} {investAmount && <span style={{color:'#666', fontSize:'0.9rem'}}>({formatMoney(investAmount)})</span>}</label>
            <input type="number" inputMode="numeric" className="glass-input" value={investAmount} onChange={(e)=>setInvestAmount(e.target.value)} placeholder="0" />
            
            {investAction === 'sell' && (
                <div style={{fontSize:'0.8rem', color:'#d63031', marginTop:'5px'}}>
                    * 賣出時將依照您在總覽設定的「預估報酬率」按比例扣除投資本金。
                </div>
            )}
          </div>
          
          <button className="glass-btn" style={{width:'100%', background: investAction === 'buy' ? 'linear-gradient(135deg, #a8e6cf 0%, #dcedc1 100%)' : 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)', color:'#333'}} onClick={handleInvestSubmit}>
            {investAction === 'buy' ? '確認買入' : '確認賣出變現'}
          </button>
        </div>
      )}

      {/* 資料備份區 */}
      <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: '1px solid rgba(0,0,0,0.1)' }}>
        <h3 style={{color:'#666', marginBottom:'15px'}}>💾 資料管理</h3>
        <div style={{display:'flex', gap:'15px'}}>
            <button className="glass-btn" style={{flex:1, background: '#1d1d1f', color:'white', fontSize:'0.9rem'}} onClick={handleExport}>📥 匯出備份</button>
            <button className="glass-btn" style={{flex:1, background: 'rgba(255,255,255,0.8)', color:'#1d1d1f', border:'1px solid #ccc', fontSize:'0.9rem'}} onClick={handleImportClick}>📤 匯入還原</button>
            <input type="file" ref={fileInputRef} style={{display:'none'}} accept=".json" onChange={handleFileChange} />
        </div>
      </div>
    </div>
  );
};

export default AssetTransfer;