// src/components/AssetTransfer.jsx
import React, { useState, useRef } from 'react';

const formatMoney = (num) => "$" + Number(num).toLocaleString();

const AssetTransfer = ({ assets, onTransaction, setAssets }) => {
  const [activeTab, setActiveTab] = useState('invest'); 
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);
  const fileInputRef = useRef(null);

  const [incomeUser, setIncomeUser] = useState('userA');
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomeNote, setIncomeNote] = useState('');

  const [transSource, setTransSource] = useState('userA');
  const [transAmount, setTransAmount] = useState('');

  const [investAccount, setInvestAccount] = useState('jointCash'); 
  const [investAction, setInvestAction] = useState('buy'); // 'buy', 'sell', 'day_trade'
  const [investType, setInvestType] = useState('stock');
  const [investAmount, setInvestAmount] = useState(''); 
  const [investPrincipal, setInvestPrincipal] = useState(''); 
  // ★ 新增：當沖結算結果
  const [dayTradeResult, setDayTradeResult] = useState('profit'); 

  // 1. 一般收入操作
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

  // 3. 統一大投資買賣與當沖邏輯
  const handleInvestSubmit = () => {
    const val = parseInt(investAmount);
    if (!val || val <= 0) return alert("請輸入有效金額");

    const newAssets = { ...assets };
    if (!newAssets.userInvestments) {
        newAssets.userInvestments = { userA: { stock:0, fund:0, deposit:0, other:0 }, userB: { stock:0, fund:0, deposit:0, other:0 } };
    }

    const isJoint = investAccount === 'jointCash';
    const accountName = isJoint ? '共同帳戶🏫' : (investAccount === 'userA' ? '恆恆🐶' : '得得🐕');
    const typeLabelMap = { stock: '股票', fund: '基金', deposit: '定存', other: '其他' };
    const label = typeLabelMap[investType];

    // --- ★ 全新：當沖結算引擎 ---
    if (investAction === 'day_trade') {
        if (isJoint) return alert("⚠️ 當沖結算目前僅開放個人帳戶操作！");

        const isProfit = dayTradeResult === 'profit';
        // 防呆：賠錢的時候還是要檢查身上有沒有足夠的現金可以賠
        if (!isProfit && newAssets[investAccount] < val) {
            return alert(`❌ ${accountName} 現金餘額不足以支付當沖虧損！`);
        }

        const confirmMsg = `【確認當沖結算】\n\n對象：${accountName}\n標的：${label}\n結果：${isProfit ? '獲利 (賺)' : '虧損 (賠)'}\n結算差額：${formatMoney(val)}\n\n確定執行嗎？`;
        if (!window.confirm(confirmMsg)) return;

        // 當沖不碰本金，只影響現金餘額
        if (isProfit) newAssets[investAccount] += val;
        else newAssets[investAccount] -= val;

        onTransaction(newAssets, {
            type: isProfit ? 'personal_invest_profit' : 'personal_invest_loss',
            category: '當沖結算',
            payer: accountName,
            accountKey: investAccount,
            investType: investType,
            total: val,
            note: `當沖${isProfit ? '賺' : '賠'} - ${label}`,
            month: txDate.slice(0, 7),
            date: txDate
        });
        
        alert(`⚡ 當沖結算完成！${accountName} 現金已${isProfit ? '增加' : '扣除'} ${formatMoney(val)}`);
        setInvestAmount('');
        return;
    }

    // --- 原本的買賣邏輯 ---
    if (investAction === 'buy') {
        if (newAssets[investAccount] < val) return alert(`❌ ${accountName} 現金餘額不足！無法買入投資。`);
        
        const confirmMsg = `【確認買入投資】\n\n將從「${accountName}」扣款買入「${label}」\n買入金額：${formatMoney(val)}\n\n確定要執行嗎？`;
        if (!window.confirm(confirmMsg)) return;

        newAssets[investAccount] -= val;
        if (isJoint) newAssets.jointInvestments[investType] += val;
        else newAssets.userInvestments[investAccount][investType] += val;

        onTransaction(newAssets, {
            type: isJoint ? 'joint_invest_buy' : 'personal_invest_buy',
            category: '投資買入',
            payer: isJoint ? '共同帳戶' : accountName,
            accountKey: investAccount, 
            investType: investType,
            total: val,
            note: `買入 ${label}`,
            month: txDate.slice(0, 7),
            date: txDate
        });
        alert(`✅ 成功用 ${accountName} 買入 ${label} ${formatMoney(val)}`);

    } else if (investAction === 'sell') {
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
            principal: principalVal, 
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

  // 當選擇共同帳戶時，自動防呆切回「買入」
  const handleAccountChange = (e) => {
      const selectedAccount = e.target.value;
      setInvestAccount(selectedAccount);
      if (selectedAccount === 'jointCash' && investAction === 'day_trade') {
          setInvestAction('buy');
      }
  };

  return (
    <div>
      <h1 className="page-title">資產操作</h1>
      
      <div style={{display:'flex', gap:'10px', marginBottom:'20px'}}>
        <button className={`glass-btn ${activeTab==='invest'?'':'inactive'}`} onClick={()=>setActiveTab('invest')} style={{flex:1}}>投資買賣</button>
        <button className={`glass-btn ${activeTab==='transfer'?'':'inactive'}`} onClick={()=>setActiveTab('transfer')} style={{flex:1}}>上繳公庫</button>
        <button className={`glass-btn ${activeTab==='income'?'':'inactive'}`} onClick={()=>setActiveTab('income')} style={{flex:1}}>一般收入</button>
      </div>

      <div className="glass-card" style={{ padding: '15px 20px', marginBottom: '20px', borderLeft: '5px solid #667eea', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <label style={{fontWeight:'bold', fontSize:'1.1rem'}}>📅 交易日期</label>
        <input type="date" className="glass-input" style={{width:'auto', marginBottom:0, padding:'8px 12px'}} value={txDate} onChange={(e) => setTxDate(e.target.value)} />
      </div>

      {activeTab === 'invest' && (
        <div className="glass-card" style={{border:'1px solid #b78af7'}}>
          <h3 style={{marginBottom: '15px'}}>📈 投資操作中心</h3>
          
          <div style={{ marginBottom: '15px' }}>
            <label>操作帳戶 (用誰的錢買？賣出回到誰的錢包？)</label>
            <select className="glass-input" value={investAccount} onChange={handleAccountChange}>
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
                  <option value="day_trade" disabled={investAccount === 'jointCash'}>⚡ 當沖 (純損益結算)</option>
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

          {/* ★ 新增：當沖專屬選單 */}
          {investAction === 'day_trade' && (
             <div style={{ marginBottom: '15px' }}>
                <label>當沖結果</label>
                <select className="glass-input" value={dayTradeResult} onChange={(e)=>setDayTradeResult(e.target.value)} style={{ border: dayTradeResult === 'profit' ? '1px solid #2ecc71' : '1px solid #e74c3c' }}>
                  <option value="profit">📈 獲利賺錢 (增加現金)</option>
                  <option value="loss">📉 虧損賠錢 (扣除現金)</option>
                </select>
             </div>
          )}

          <div style={{ marginBottom: '15px' }}>
            <label>
              {investAction === 'buy' ? '本次買入「總花費」' : 
               investAction === 'sell' ? '本次賣出「拿回多少現金」' : 
               '當沖結算「淨金額」'} 
               {investAmount && <span style={{color:'#666', fontSize:'0.9rem'}}>({formatMoney(investAmount)})</span>}
            </label>
            <input type="number" inputMode="numeric" className="glass-input" value={investAmount} onChange={(e)=>setInvestAmount(e.target.value)} placeholder="0" />
          </div>

          {investAction === 'sell' && (
             <div style={{ marginBottom: '15px', padding:'10px', background:'rgba(241, 196, 15, 0.1)', borderRadius:'8px', border:'1px dashed #f1c40f' }}>
               <label style={{color:'#b7791f', fontWeight:'bold'}}>⚠️ 這批賣掉的資產，當初買入的「本金」是多少？</label>
               <input type="number" inputMode="numeric" className="glass-input" style={{margin:'5px 0', border:'1px solid #f1c40f'}} value={investPrincipal} onChange={(e)=>setInvestPrincipal(e.target.value)} placeholder="請輸入扣除本金" />
               <div style={{fontSize:'0.8rem', color:'#888'}}>
                  * 系統會將 (拿回現金 - 本金) 自動結算為您的投資損益！
               </div>
             </div>
          )}
          
          <button className="glass-btn" style={{width:'100%', background: investAction === 'buy' ? 'linear-gradient(135deg, #a8e6cf 0%, #dcedc1 100%)' : investAction === 'sell' ? 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)' : '#ffeaa7', color:'#333', fontWeight:'bold'}} onClick={handleInvestSubmit}>
            {investAction === 'buy' ? '確認買入' : investAction === 'sell' ? '確認賣出並結算' : '⚡ 確認當沖結算'}
          </button>
        </div>
      )}

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