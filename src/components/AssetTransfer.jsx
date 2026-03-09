// src/components/AssetTransfer.jsx
import React, { useState, useRef } from 'react';

const formatMoney = (num) => "$" + Number(num).toLocaleString();

const AssetTransfer = ({ assets, onTransaction, setAssets }) => {
  const [activeTab, setActiveTab] = useState('invest'); // 預設打開投資
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);
  const fileInputRef = useRef(null);

  // --- 狀態：一般收入操作 (取代原本複雜的個人資金) ---
  const [incomeUser, setIncomeUser] = useState('userA');
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomeNote, setIncomeNote] = useState('');

  // --- 狀態：上繳公庫 ---
  const [transSource, setTransSource] = useState('userA');
  const [transAmount, setTransAmount] = useState('');

  // --- ★ 全新統一投資狀態 ---
  const [investAccount, setInvestAccount] = useState('jointCash'); // 'jointCash', 'userA', 'userB'
  const [investAction, setInvestAction] = useState('buy'); // 'buy', 'sell'
  const [investType, setInvestType] = useState('stock');
  const [investAmount, setInvestAmount] = useState(''); // 買入總花費 / 賣出總拿回現金
  const [investPrincipal, setInvestPrincipal] = useState(''); // 賣出時扣除的本金

  // 1. 一般收入操作 (薪水/紅包)
  const handleIncomeSubmit = () => {
    const val = parseInt(incomeAmount);
    if (!val || val <= 0) return alert("請輸入有效金額");
    
    const userName = incomeUser === 'userA' ? '恆恆🐶' : '得得🐕';
    const confirmMsg = `【確認收入】\n\n日期：${txDate}\n對象：${userName}\n金額：${formatMoney(val)}\n\n確定要執行嗎？`;
    if (!window.confirm(confirmMsg)) return;

    const newAssets = { ...assets };
    newAssets[incomeUser] += val;

    onTransaction(newAssets, {
        type: 'income',
        category: '個人收入',
        payer: userName,
        total: val,
        note: incomeNote.trim() || '一般收入',
        month: txDate.slice(0, 7),
        date: txDate
    });

    alert(`✅ 已記錄收入：${formatMoney(val)}`);
    setIncomeAmount('');
    setIncomeNote('');
  };

  // 2. 上繳公庫
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

  // 3. 統一大投資買賣邏輯
  const handleInvestSubmit = () => {
    const val = parseInt(investAmount);
    if (!val || val <= 0) return alert("請輸入有效金額");

    const newAssets = { ...assets };
    // 安全防呆：如果舊資料沒有這個物件，補齊它
    if (!newAssets.userInvestments) {
        newAssets.userInvestments = { userA: { stock:0, fund:0, deposit:0, other:0 }, userB: { stock:0, fund:0, deposit:0, other:0 } };
    }

    const isJoint = investAccount === 'jointCash';
    const accountName = isJoint ? '共同帳戶🏫' : (investAccount === 'userA' ? '恆恆🐶' : '得得🐕');
    const typeLabelMap = { stock: '股票', fund: '基金', deposit: '定存', other: '其他' };
    const label = typeLabelMap[investType];

    if (investAction === 'buy') {
        if (newAssets[investAccount] < val) return alert(`❌ ${accountName} 現金餘額不足！無法買入投資。`);
        
        const confirmMsg = `【確認買入投資】\n\n將從「${accountName}」扣款買入「${label}」\n買入金額：${formatMoney(val)}\n\n確定要執行嗎？`;
        if (!window.confirm(confirmMsg)) return;

        // 扣除現金，增加本金
        newAssets[investAccount] -= val;
        if (isJoint) newAssets.jointInvestments[investType] += val;
        else newAssets.userInvestments[investAccount][investType] += val;

        onTransaction(newAssets, {
            type: isJoint ? 'joint_invest_buy' : 'personal_invest_buy',
            category: '投資買入',
            payer: isJoint ? '共同帳戶' : accountName,
            accountKey: investAccount, // 重要：刪除時會用到
            investType: investType,
            total: val,
            note: `買入 ${label}`,
            month: txDate.slice(0, 7),
            date: txDate
        });
        alert(`✅ 成功用 ${accountName} 買入 ${label} ${formatMoney(val)}`);

    } else {
        // ★ 賣出變現邏輯 (手動輸入本金，精準算出利潤)
        const principalVal = parseInt(investPrincipal);
        if (isNaN(principalVal) || principalVal < 0) return alert("請輸入本次賣出要扣除的有效「本金金額」！");

        const currentPrincipal = isJoint ? newAssets.jointInvestments[investType] : newAssets.userInvestments[investAccount][investType];

        if (currentPrincipal < principalVal) {
            return alert(`❌ ${accountName} 的 ${label} 本金僅剩 ${formatMoney(currentPrincipal)}，不足以扣除 ${formatMoney(principalVal)}！`);
        }

        const profit = val - principalVal;
        const profitNote = profit >= 0 ? `(賺 ${formatMoney(profit)})` : `(賠 ${formatMoney(Math.abs(profit))})`;

        const confirmMsg = `【確認投資變現】\n\n對象：${accountName}\n賣出資產：${label}\n拿回現金：${formatMoney(val)}\n扣除本金：${formatMoney(principalVal)}\n\n結算：${profitNote}\n\n確定執行嗎？`;
        if (!window.confirm(confirmMsg)) return;

        // 增加現金，扣除本金
        newAssets[investAccount] += val;
        if (isJoint) newAssets.jointInvestments[investType] -= principalVal;
        else newAssets.userInvestments[investAccount][investType] -= principalVal;

        onTransaction(newAssets, {
            type: isJoint ? 'joint_invest_sell' : 'personal_invest_sell',
            category: '投資變現',
            payer: isJoint ? '共同帳戶' : accountName,
            accountKey: investAccount,
            investType: investType,
            total: val,
            principal: principalVal, // 記錄被扣除的本金，未來撤銷才能還原
            note: `賣出 ${label} ${profitNote}`,
            month: txDate.slice(0, 7),
            date: txDate
        });
        alert(`🔄 成功變現 ${formatMoney(val)} 至 ${accountName}！\n結算：${profitNote}`);
    }
    setInvestAmount('');
    setInvestPrincipal('');
  };

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
      
      <div style={{display:'flex', gap:'10px', marginBottom:'20px'}}>
        <button className={`glass-btn ${activeTab==='invest'?'':'inactive'}`} onClick={()=>setActiveTab('invest')} style={{flex:1}}>📈 投資買賣</button>
        <button className={`glass-btn ${activeTab==='transfer'?'':'inactive'}`} onClick={()=>setActiveTab('transfer')} style={{flex:1}}>📥 上繳公庫</button>
        <button className={`glass-btn ${activeTab==='income'?'':'inactive'}`} onClick={()=>setActiveTab('income')} style={{flex:1}}>💰 一般收入</button>
      </div>

      <div className="glass-card" style={{ padding: '15px 20px', marginBottom: '20px', borderLeft: '5px solid #667eea', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <label style={{fontWeight:'bold', fontSize:'1.1rem'}}>📅 交易日期</label>
        <input type="date" className="glass-input" style={{width:'auto', marginBottom:0, padding:'8px 12px'}} value={txDate} onChange={(e) => setTxDate(e.target.value)} />
      </div>

      {/* 3. 統一投資買賣 (放在最前面，因為最常用) */}
      {activeTab === 'invest' && (
        <div className="glass-card" style={{border:'1px solid #b78af7'}}>
          <h3 style={{marginBottom: '15px'}}>📈 投資操作中心</h3>
          
          <div style={{ marginBottom: '15px' }}>
            <label>操作帳戶 (用誰的錢買？賣出回到誰的錢包？)</label>
            <select className="glass-input" value={investAccount} onChange={(e)=>setInvestAccount(e.target.value)}>
              <option value="jointCash">🏫 共同帳戶</option>
              <option value="userA">🐶 恆恆個人</option>
              <option value="userB">🐕 得得個人</option>
            </select>
          </div>

          <div style={{ marginBottom: '15px', display:'flex', gap:'10px' }}>
            <div style={{flex:1}}>
                <label>動作</label>
                <select className="glass-input" value={investAction} onChange={(e)=>setInvestAction(e.target.value)}>
                  <option value="buy">📥 買入 (扣除現金)</option>
                  <option value="sell">📤 賣出 (變現回戶頭)</option>
                </select>
            </div>
            <div style={{flex:1}}>
                <label>標的類型</label>
                <select className="glass-input" value={investType} onChange={(e)=>setInvestType(e.target.value)}>
                  <option value="stock">股票</option>
                  <option value="fund">基金</option>
                  <option value="deposit">定存</option>
                  <option value="other">其他</option>
                </select>
            </div>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label>{investAction === 'buy' ? '本次買入「總花費」' : '本次賣出「拿回多少現金」'} {investAmount && <span style={{color:'#666', fontSize:'0.9rem'}}>({formatMoney(investAmount)})</span>}</label>
            <input type="number" inputMode="numeric" className="glass-input" value={investAmount} onChange={(e)=>setInvestAmount(e.target.value)} placeholder="0" />
          </div>

          {/* ★ 賣出時，讓使用者手動輸入扣除本金，系統幫算損益 */}
          {investAction === 'sell' && (
             <div style={{ marginBottom: '15px', padding:'10px', background:'rgba(241, 196, 15, 0.1)', borderRadius:'8px', border:'1px dashed #f1c40f' }}>
               <label style={{color:'#b7791f', fontWeight:'bold'}}>⚠️ 這批賣掉的資產，當初買入的「本金」是多少？</label>
               <input type="number" inputMode="numeric" className="glass-input" style={{margin:'5px 0', border:'1px solid #f1c40f'}} value={investPrincipal} onChange={(e)=>setInvestPrincipal(e.target.value)} placeholder="請輸入扣除本金" />
               <div style={{fontSize:'0.8rem', color:'#888'}}>
                  * 系統會將 (拿回現金 - 本金) 自動結算為您的投資損益！
               </div>
             </div>
          )}
          
          <button className="glass-btn" style={{width:'100%', background: investAction === 'buy' ? 'linear-gradient(135deg, #a8e6cf 0%, #dcedc1 100%)' : 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)', color:'#333', fontWeight:'bold'}} onClick={handleInvestSubmit}>
            {investAction === 'buy' ? '確認買入' : '確認賣出並結算'}
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

      {/* 1. 一般收入 */}
      {activeTab === 'income' && (
        <div className="glass-card">
          <h3 style={{marginBottom: '15px'}}>💰 一般收入 (薪水/獎金)</h3>
          <div style={{ marginBottom: '15px' }}>
            <label>入帳戶頭</label>
            <select className="glass-input" value={incomeUser} onChange={(e)=>setIncomeUser(e.target.value)}>
              <option value="userA">恆恆🐶 ({formatMoney(assets.userA)})</option>
              <option value="userB">得得🐕 ({formatMoney(assets.userB)})</option>
            </select>
          </div>
          <div style={{ marginBottom: '15px' }}>
            <label>金額</label>
            <input type="number" inputMode="numeric" className="glass-input" value={incomeAmount} onChange={(e)=>setIncomeAmount(e.target.value)} placeholder="輸入金額" />
          </div>
          <div style={{ marginBottom: '15px' }}>
            <label>備註 (可選)</label>
            <input type="text" className="glass-input" value={incomeNote} onChange={(e)=>setIncomeNote(e.target.value)} placeholder="例如：3月薪水" />
          </div>
          <button className="glass-btn" style={{width:'100%'}} onClick={handleIncomeSubmit}>確認收入入帳</button>
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