// src/components/AssetTransfer.jsx
import React, { useState, useRef, useEffect } from 'react';

const formatMoney = (num) => "$" + Number(num).toLocaleString();

// 🚀 你的專屬 Google API
const MY_GOOGLE_API_URL = "https://script.google.com/macros/s/AKfycbwK8pr2bfUqC6GnLYwYerjiS_wtt5sk_ZJD4A-xKR2ACA2v64aYXNeRyu1qp1uVRWTdzg/exec";

const SegmentedControl = ({ options, value, onChange, disabledValue }) => (
  <div style={{ display: 'flex', background: 'rgba(0,0,0,0.05)', borderRadius: '12px', padding: '4px', gap: '4px', flexWrap: 'wrap' }}>
    {options.map(opt => {
      const isSelected = value === opt.value;
      const isDisabled = disabledValue && disabledValue === opt.value;
      return (
        <div
          key={opt.value}
          onClick={() => !isDisabled && onChange(opt.value)}
          style={{
            flex: 1, textAlign: 'center', padding: '8px 4px', borderRadius: '8px',
            fontSize: '0.85rem', fontWeight: isSelected ? 'bold' : 'normal',
            cursor: isDisabled ? 'not-allowed' : 'pointer', minWidth: '60px',
            background: isSelected ? '#fff' : 'transparent',
            color: isSelected ? '#333' : isDisabled ? '#ccc' : '#666',
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

const AssetTransfer = ({ assets, onTransaction, setAssets }) => {
  const [activeTab, setActiveTab] = useState('invest'); 
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);
  const fileInputRef = useRef(null);

  const [incomeUser, setIncomeUser] = useState('userA');
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomeNote, setIncomeNote] = useState('');

  const [transSource, setTransSource] = useState('userA');
  const [transAmount, setTransAmount] = useState('');

  // 💱 換匯專屬 State
  const [exchangeSource, setExchangeSource] = useState('userA');
  const [exchangeDir, setExchangeDir] = useState('TWD_TO_USD');
  const [exchangeTwd, setExchangeTwd] = useState('');
  const [exchangeUsd, setExchangeUsd] = useState('');

  // ★ ⚖️ 餘額校正專屬 State
  const [calibAccount, setCalibAccount] = useState('userA');
  const [calibTwd, setCalibTwd] = useState('');
  const [calibUsd, setCalibUsd] = useState('');

  const [investAccount, setInvestAccount] = useState('jointCash'); 
  const [investAction, setInvestAction] = useState('buy'); 
  const [investType, setInvestType] = useState('stock');
  const [investAmount, setInvestAmount] = useState(''); 
  const [investPrincipal, setInvestPrincipal] = useState(''); 
  const [dayTradeResult, setDayTradeResult] = useState('profit'); 

  const [stockMarket, setStockMarket] = useState('TW'); 
  const [settleCurrency, setSettleCurrency] = useState('TWD'); 
  const [usInvestPrincipalUsd, setUsInvestPrincipalUsd] = useState(''); 

  const [stockSymbol, setStockSymbol] = useState('');
  const [stockShares, setStockShares] = useState('');
  const [stockPrice, setStockPrice] = useState('');
  const [usTotalUsd, setUsTotalUsd] = useState(''); 
  const [usFxRate, setUsFxRate] = useState('31.5');
  
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (stockSymbol.length >= 1 && showDropdown) {
        setIsSearching(true);
        try {
          const res = await fetch(`${MY_GOOGLE_API_URL}?search=${encodeURIComponent(stockSymbol)}`, { redirect: 'follow' });
          const data = await res.json();
          if (data && data.quotes) setSearchResults(data.quotes.filter(q => q.quoteType === 'EQUITY' || q.quoteType === 'ETF' || q.quoteType === 'MUTUALFUND'));
          else setSearchResults([]); 
        } catch(err) { setSearchResults([]); }
        setIsSearching(false);
      } else { setSearchResults([]); }
    }, 600); 
    return () => clearTimeout(timer);
  }, [stockSymbol, showDropdown]);

  useEffect(() => {
    if (investType !== 'stock' || investAction === 'day_trade' || stockMarket === 'US') return;
    const p = Number(stockPrice) || 0;
    const s = Number(stockShares) || 0;
    if (p === 0 || s === 0) return;
    const baseAmount = p * s;
    const fee = Math.max(20, Math.floor(baseAmount * 0.001425 * 0.6));
    if (investAction === 'buy') setInvestAmount(Math.round(baseAmount + fee).toString());
    else if (investAction === 'sell') {
        const tax = Math.floor(baseAmount * 0.003); 
        setInvestAmount(Math.round(baseAmount - fee - tax).toString());
    }
  }, [stockPrice, stockShares, stockMarket, investAction, investType]);

  const getDeepCopy = (obj) => JSON.parse(JSON.stringify(obj));

  const handleIncomeSubmit = () => {
    const val = parseInt(incomeAmount);
    if (!val || val <= 0) return alert("請輸入有效金額");
    const userName = incomeUser === 'userA' ? '恆恆🐶' : '得得🐕';
    if (!window.confirm(`確定要記錄 ${userName} 收入 ${formatMoney(val)} 嗎？`)) return;
    const newAssets = getDeepCopy(assets);
    newAssets[incomeUser] += val;
    onTransaction(newAssets, { type: 'income', category: '個人收入', payer: userName, total: val, note: incomeNote.trim() || '一般收入', month: txDate.slice(0, 7), date: txDate });
    alert(`✅ 已記錄收入：${formatMoney(val)}`);
    setIncomeAmount(''); setIncomeNote('');
  };

  const handleTransfer = () => {
    const val = parseInt(transAmount);
    if (!val || val <= 0) return alert("請輸入有效金額");
    if (assets[transSource] < val) return alert("❌ 個人餘額不足！");
    const userName = transSource === 'userA' ? '恆恆🐶' : '得得🐕';
    if (!window.confirm(`確定要從 ${userName} 上繳 ${formatMoney(val)} 至共同帳戶嗎？`)) return;
    const newAssets = getDeepCopy(assets);
    newAssets[transSource] -= val;
    newAssets.jointCash += val;
    onTransaction(newAssets, { type: 'transfer', category: '資產劃撥', payer: userName, total: val, note: `轉移至 共同現金`, month: txDate.slice(0, 7), date: txDate });
    alert("✅ 劃撥成功！");
    setTransAmount('');
  };

  const handleExchange = () => {
    if (!exchangeTwd || !exchangeUsd) return alert("請輸入台幣與美金金額");
    const twd = parseInt(exchangeTwd);
    const usd = parseFloat(exchangeUsd);
    const newAssets = getDeepCopy(assets);
    const accountName = exchangeSource === 'jointCash' ? '共同帳戶' : (exchangeSource === 'userA' ? '恆恆🐶' : '得得🐕');

    if (exchangeDir === 'TWD_TO_USD') {
        if ((newAssets[exchangeSource] || 0) < twd) return alert(`❌ ${accountName} 台幣餘額不足！`);
        newAssets[exchangeSource] -= twd;
        newAssets[`${exchangeSource}_usd`] = (newAssets[`${exchangeSource}_usd`] || 0) + usd;
        onTransaction(newAssets, { type: 'exchange', category: '貨幣換匯', payer: accountName, accountKey: exchangeSource, total: twd, usdAmount: usd, note: `台幣換美金 (買入 $${usd} USD)`, date: txDate });
    } else {
        if ((newAssets[`${exchangeSource}_usd`] || 0) < usd) return alert(`❌ ${accountName} 美金餘額不足！`);
        newAssets[`${exchangeSource}_usd`] -= usd;
        newAssets[exchangeSource] += twd;
        onTransaction(newAssets, { type: 'exchange', category: '貨幣換匯', payer: accountName, accountKey: exchangeSource, total: twd, usdAmount: usd, note: `美金換台幣 (賣出 $${usd} USD)`, date: txDate });
    }
    alert("✅ 換匯成功！");
    setExchangeTwd(''); setExchangeUsd('');
  };

  // ★ 處理餘額校正邏輯
  const handleCalibrate = () => {
    if (calibTwd === '' && calibUsd === '') return alert("請至少輸入一項實際餘額");

    const currentTwd = assets[calibAccount] || 0;
    const currentUsd = assets[`${calibAccount}_usd`] || 0;

    const newTwd = calibTwd !== '' ? parseInt(calibTwd) : currentTwd;
    const newUsd = calibUsd !== '' ? parseFloat(calibUsd) : currentUsd;

    const twdDiff = newTwd - currentTwd;
    const usdDiff = newUsd - currentUsd;

    if (twdDiff === 0 && usdDiff === 0) return alert("輸入的餘額與目前帳面相同，無需校正");

    const accountName = calibAccount === 'jointCash' ? '共同帳戶' : (calibAccount === 'userA' ? '恆恆🐶' : '得得🐕');
    
    let diffNotes = [];
    if (twdDiff !== 0) diffNotes.push(`台幣 ${twdDiff > 0 ? '+' : ''}${twdDiff}`);
    if (usdDiff !== 0) diffNotes.push(`美金 ${usdDiff > 0 ? '+' : ''}${usdDiff.toFixed(2)}`);

    if (!window.confirm(`確定要將 ${accountName} 的餘額校正為：\n台幣: ${formatMoney(newTwd)}\n美金: $${newUsd.toFixed(2)} USD\n\n(系統將自動調整: ${diffNotes.join(' / ')})`)) return;

    const newAssets = getDeepCopy(assets);
    newAssets[calibAccount] = newTwd;
    newAssets[`${calibAccount}_usd`] = newUsd;

    onTransaction(newAssets, { 
        type: 'calibrate', 
        category: '餘額校正', 
        payer: accountName, 
        accountKey: calibAccount, 
        total: Math.abs(twdDiff), // 外層 total 顯示台幣變動絕對值
        twdDiff: twdDiff,
        usdDiff: usdDiff,
        note: `系統校正 (${diffNotes.join(', ')})`, 
        date: txDate 
    });

    alert("✅ 餘額校正完成！");
    setCalibTwd('');
    setCalibUsd('');
  };

  const handleInvestSubmit = () => {
    const newAssets = getDeepCopy(assets);
    if (!newAssets.userInvestments) newAssets.userInvestments = { userA: { stock:0, fund:0, deposit:0, other:0 }, userB: { stock:0, fund:0, deposit:0, other:0 } };
    const isJoint = investAccount === 'jointCash';
    const accountName = isJoint ? '共同帳戶🏫' : (investAccount === 'userA' ? '恆恆🐶' : '得得🐕');
    
    let finalSymbol = stockSymbol ? stockSymbol.toUpperCase().trim() : '';
    if (investType === 'stock' && stockMarket === 'TW' && finalSymbol && !finalSymbol.includes('.')) {
        finalSymbol += '.TW';
        if (investAction === 'buy') window.alert(`💡 已自動將代號補齊為「${finalSymbol}」\n\n⚠️ 若為上櫃公司(如坤悅)，字尾必須是 .TWO 才能抓到股價。`);
    }
    const label = investType === 'stock' && finalSymbol ? finalSymbol : { stock: '股票', fund: '基金', deposit: '定存', other: '其他' }[investType];

    if (investAction === 'day_trade') {
        const val = parseInt(investAmount); if (!val || val <= 0) return alert("請輸入金額！");
        const isProfit = dayTradeResult === 'profit';
        if (!isProfit && newAssets[investAccount] < val) return alert(`❌ ${accountName} 現金不足以支付當沖虧損！`);
        if (!window.confirm(`確定執行當沖結算：${accountName} ${isProfit ? '賺' : '賠'} ${formatMoney(val)} 嗎？`)) return;

        if (isProfit) newAssets[investAccount] += val; else newAssets[investAccount] -= val;
        onTransaction(newAssets, { type: isProfit ? 'personal_invest_profit' : 'personal_invest_loss', category: '當沖結算', payer: accountName, accountKey: investAccount, investType, total: val, note: `當沖${isProfit ? '賺' : '賠'} - ${label}`, month: txDate.slice(0, 7), date: txDate, symbol: finalSymbol });
        alert(`⚡ 當沖結算完成！`);
        setInvestAmount(''); setStockSymbol(''); setStockPrice(''); setStockShares(''); setUsTotalUsd('');
        return;
    }

    if (investType === 'stock' && stockMarket === 'US') {
        const costUsd = parseFloat(usTotalUsd);
        if (!costUsd) return alert("請輸入美金總額");
        const equivalentTwd = Math.round(costUsd * Number(usFxRate || 31.5)); 

        if (investAction === 'buy') {
            if (settleCurrency === 'USD') {
                if ((newAssets[`${investAccount}_usd`] || 0) < costUsd) return alert(`❌ ${accountName} 美金餘額不足！`);
                if (!window.confirm(`確定用「美金帳戶」買入「${label}」\n扣除美金：$${costUsd} USD 嗎？`)) return;

                newAssets[`${investAccount}_usd`] -= costUsd;
                if (isJoint) newAssets.jointInvestments[investType] += equivalentTwd; else newAssets.userInvestments[investAccount][investType] += equivalentTwd;

                onTransaction(newAssets, { type: isJoint ? 'joint_invest_buy' : 'personal_invest_buy', category: '投資買入', payer: isJoint ? '共同帳戶' : accountName, accountKey: investAccount, investType, total: equivalentTwd, usdAmount: costUsd, note: `買入 ${label} (美金交割 $${costUsd})`, date: txDate, symbol: finalSymbol, shares: Number(stockShares), market: stockMarket, buyPrice: Number(stockPrice) });
            } else {
                const val = parseInt(investAmount); if (!val) return alert("請輸入台幣扣款總額");
                if (newAssets[investAccount] < val) return alert(`❌ ${accountName} 台幣餘額不足！`);
                if (!window.confirm(`確定用「台幣帳戶」買入「${label}」\n扣除台幣：${formatMoney(val)} 嗎？`)) return;

                newAssets[investAccount] -= val;
                if (isJoint) newAssets.jointInvestments[investType] += val; else newAssets.userInvestments[investAccount][investType] += val;

                onTransaction(newAssets, { type: isJoint ? 'joint_invest_buy' : 'personal_invest_buy', category: '投資買入', payer: isJoint ? '共同帳戶' : accountName, accountKey: investAccount, investType, total: val, note: `買入 ${label} (台幣交割)`, date: txDate, symbol: finalSymbol, shares: Number(stockShares), market: stockMarket, buyPrice: Number(stockPrice) });
            }
            alert(`✅ 成功買入 ${label}！`);
            
        } else if (investAction === 'sell') {
            const principalTwd = parseInt(investPrincipal);
            if (!principalTwd) return alert("為維持對帳準確，請輸入這批股票當初大約的「台幣本金」！");
            
            const currentPrincipal = isJoint ? newAssets.jointInvestments[investType] : newAssets.userInvestments[investAccount][investType];
            if (currentPrincipal < principalTwd) return alert(`❌ 帳面本金僅剩 ${formatMoney(currentPrincipal)}，無法扣除 ${formatMoney(principalTwd)}！`);

            const principalUsd = parseFloat(usInvestPrincipalUsd);
            if (!principalUsd) return alert("請輸入元大顯示的「美金成本」以計算獲利！");

            const profitUsd = costUsd - principalUsd;
            const profitNote = profitUsd >= 0 ? `(賺 $${profitUsd.toFixed(2)} USD)` : `(賠 $${Math.abs(profitUsd).toFixed(2)} USD)`;

            if (settleCurrency === 'USD') {
                if (!window.confirm(`確定賣出「${label}」？\n美金入帳：$${costUsd}\n結算：${profitNote}\n並從帳面扣除台幣本金：${formatMoney(principalTwd)} 嗎？`)) return;

                newAssets[`${investAccount}_usd`] = (newAssets[`${investAccount}_usd`] || 0) + costUsd;
                if (isJoint) newAssets.jointInvestments[investType] -= principalTwd; else newAssets.userInvestments[investAccount][investType] -= principalTwd;

                onTransaction(newAssets, { type: isJoint ? 'joint_invest_sell' : 'personal_invest_sell', category: '投資變現', payer: isJoint ? '共同帳戶' : accountName, accountKey: investAccount, investType, total: equivalentTwd, principal: principalTwd, usdAmount: costUsd, note: `賣出 ${label} (美金交割) ${profitNote}`, date: txDate, symbol: finalSymbol, shares: Number(stockShares) });
            } else {
                const proceedsTwd = parseInt(investAmount); if (!proceedsTwd) return alert("請輸入拿回的台幣總額");
                if (!window.confirm(`確定賣出「${label}」？\n台幣入帳：${formatMoney(proceedsTwd)}\n結算：${profitNote}\n並從帳面扣除台幣本金：${formatMoney(principalTwd)} 嗎？`)) return;

                newAssets[investAccount] += proceedsTwd;
                if (isJoint) newAssets.jointInvestments[investType] -= principalTwd; else newAssets.userInvestments[investAccount][investType] -= principalTwd;

                onTransaction(newAssets, { type: isJoint ? 'joint_invest_sell' : 'personal_invest_sell', category: '投資變現', payer: isJoint ? '共同帳戶' : accountName, accountKey: investAccount, investType, total: proceedsTwd, principal: principalTwd, note: `賣出 ${label} (台幣交割) ${profitNote}`, date: txDate, symbol: finalSymbol, shares: Number(stockShares) });
            }
            alert(`🔄 成功變現！${profitNote}`);
        }
        setInvestAmount(''); setInvestPrincipal(''); setStockPrice(''); setStockShares(''); setStockSymbol(''); setUsTotalUsd(''); setUsInvestPrincipalUsd('');
        return;
    }

    const val = parseInt(investAmount); 
    if (!val || val <= 0) return alert("請確認最終金額！");

    if (investAction === 'buy') {
        if (newAssets[investAccount] < val) return alert(`❌ ${accountName} 台幣餘額不足！`);
        if (!window.confirm(`確定用「${accountName}」買入「${label}」\n總交割金額：${formatMoney(val)} 嗎？`)) return;

        newAssets[investAccount] -= val;
        if (isJoint) newAssets.jointInvestments[investType] += val; else newAssets.userInvestments[investAccount][investType] += val;

        onTransaction(newAssets, { type: isJoint ? 'joint_invest_buy' : 'personal_invest_buy', category: '投資買入', payer: isJoint ? '共同帳戶' : accountName, accountKey: investAccount, investType, total: val, note: `買入 ${label}`, month: txDate.slice(0, 7), date: txDate, symbol: finalSymbol, shares: Number(stockShares), market: stockMarket, buyPrice: Number(stockPrice) });
        alert(`✅ 成功買入 ${label}！`);

    } else if (investAction === 'sell') {
        const principalVal = parseInt(investPrincipal);
        if (!principalVal) return alert("請輸入這批股票的台幣本金！");

        const currentPrincipal = isJoint ? newAssets.jointInvestments[investType] : newAssets.userInvestments[investAccount][investType];
        if (currentPrincipal < principalVal) return alert(`❌ 帳面本金僅剩 ${formatMoney(currentPrincipal)}，無法扣除 ${formatMoney(principalVal)}！`);

        const profit = val - principalVal;
        const profitNote = profit >= 0 ? `(賺 ${formatMoney(profit)})` : `(賠 ${formatMoney(Math.abs(profit))})`;
        if (!window.confirm(`確定賣出「${label}」？\n拿回台幣：${formatMoney(val)}\n扣除本金：${formatMoney(principalVal)}\n結算：${profitNote} 嗎？`)) return;

        newAssets[investAccount] += val;
        if (isJoint) newAssets.jointInvestments[investType] -= principalVal; else newAssets.userInvestments[investAccount][investType] -= principalVal;

        onTransaction(newAssets, { type: isJoint ? 'joint_invest_sell' : 'personal_invest_sell', category: '投資變現', payer: isJoint ? '共同帳戶' : accountName, accountKey: investAccount, investType, total: val, principal: principalVal, note: `賣出 ${label} ${profitNote}`, month: txDate.slice(0, 7), date: txDate, symbol: finalSymbol, shares: Number(stockShares) });
        alert(`🔄 成功變現！${profitNote}`);
    }
    setInvestAmount(''); setInvestPrincipal(''); setStockPrice(''); setStockShares(''); setStockSymbol(''); setUsTotalUsd('');
  };

  const handleExport = () => {
    const json = JSON.stringify(assets, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = `雙人資產備份_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const handleImportClick = () => fileInputRef.current.click();
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.userA === undefined) return alert("❌ 格式錯誤！");
        if (window.confirm("⚠️ 警告：這將會「覆蓋」所有資料！確定還原嗎？")) { setAssets(data); alert("✅ 還原成功！"); }
      } catch (err) { alert("❌ 讀取失敗。"); }
    };
    reader.readAsText(file); e.target.value = '';
  };

  const [isManualBackingUp, setIsManualBackingUp] = useState(false);
  const handleManualBackup = async () => {
      setIsManualBackingUp(true);
      try {
          const now = new Date();
          const todayDate = now.toISOString().split('T')[0];
          const timeStr = `${String(now.getHours()).padStart(2, '0')}點${String(now.getMinutes()).padStart(2, '0')}分${String(now.getSeconds()).padStart(2, '0')}秒`;
          
          const res = await fetch(MY_GOOGLE_API_URL, {
              method: 'POST',
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify({ action: 'backup', date: todayDate, fileName: `手動備份_${todayDate}_${timeStr}.json`, assets: assets }),
              redirect: 'follow'
          });
          const text = await res.text();
          if(text.includes('success')) alert('✅ 成功備份至 Google 雲端硬碟！請至雲端硬碟確認檔案。');
          else throw new Error("API 錯誤");
      } catch(e) { alert('❌ 備份失敗，請檢查網路'); } 
      finally { setIsManualBackingUp(false); }
  };

  return (
    <div>
      <h1 className="page-title">資產操作</h1>
      
      {/* 導覽列加入校正功能 */}
      <div style={{display:'flex', gap:'10px', marginBottom:'20px', flexWrap: 'wrap'}}>
        <button className={`glass-btn ${activeTab==='invest'?'':'inactive'}`} onClick={()=>setActiveTab('invest')} style={{flex:1, minWidth:'80px'}}>投資買賣</button>
        <button className={`glass-btn ${activeTab==='exchange'?'':'inactive'}`} onClick={()=>setActiveTab('exchange')} style={{flex:1, minWidth:'80px', background: activeTab==='exchange' ? '#a0d2eb' : ''}}>💱 換匯</button>
        <button className={`glass-btn ${activeTab==='transfer'?'':'inactive'}`} onClick={()=>setActiveTab('transfer')} style={{flex:1, minWidth:'80px'}}>上繳公庫</button>
        <button className={`glass-btn ${activeTab==='income'?'':'inactive'}`} onClick={()=>setActiveTab('income')} style={{flex:1, minWidth:'80px'}}>一般收入</button>
        <button className={`glass-btn ${activeTab==='calibrate'?'':'inactive'}`} onClick={()=>setActiveTab('calibrate')} style={{flex:1, minWidth:'80px'}}>⚖️ 校正</button>
      </div>

      <div className="glass-card" style={{ padding: '15px 20px', marginBottom: '20px', borderLeft: '5px solid #667eea', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <label style={{fontWeight:'bold', fontSize:'1.1rem', margin:0}}>📅 交易日期</label>
        <input type="date" className="glass-input" style={{width:'auto', marginBottom:0, padding:'8px 12px'}} value={txDate} onChange={(e) => setTxDate(e.target.value)} />
      </div>

      {activeTab === 'invest' && (
        <div className="glass-card" style={{border:'1px solid #b78af7'}}>
          <h3 style={{marginBottom: '15px', marginTop:0}}>📈 投資操作中心</h3>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{display:'block', marginBottom:'8px', color:'#555', fontSize:'0.9rem'}}>操作帳戶</label>
            <SegmentedControl options={[{ label: '🏫 共同', value: 'jointCash' }, { label: '🐶 恆恆', value: 'userA' }, { label: '🐕 得得', value: 'userB' }]} value={investAccount} onChange={(val) => { setInvestAccount(val); if (val === 'jointCash' && investAction === 'day_trade') setInvestAction('buy'); }} />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{display:'block', marginBottom:'8px', color:'#555', fontSize:'0.9rem'}}>動作</label>
            <SegmentedControl options={[{ label: '📥 買入', value: 'buy' }, { label: '📤 賣出', value: 'sell' }, { label: '⚡ 當沖', value: 'day_trade' }]} value={investAction} onChange={setInvestAction} disabledValue={investAccount === 'jointCash' ? 'day_trade' : null} />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{display:'block', marginBottom:'8px', color:'#555', fontSize:'0.9rem'}}>標的類型</label>
            <SegmentedControl options={[{ label: '股票', value: 'stock' }, { label: '基金', value: 'fund' }, { label: '定存', value: 'deposit' }, { label: '其他', value: 'other' }]} value={investType} onChange={setInvestType} />
          </div>

          {investType === 'stock' && (
             <div style={{background:'rgba(183, 138, 247, 0.1)', padding:'15px', borderRadius:'12px', marginBottom:'15px'}}>
                <div style={{ marginBottom: '10px' }}>
                  <SegmentedControl options={[{ label: '🇹🇼 台股', value: 'TW' }, { label: '🇺🇸 美股複委託', value: 'US' }]} value={stockMarket} onChange={setStockMarket} />
                </div>
                
                {stockMarket === 'US' && (
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{fontSize:'0.8rem', color:'#666', display:'block', marginBottom:'4px'}}>交割帳戶 (扣除/拿回的錢包)</label>
                    <SegmentedControl options={[{label:'🇹🇼 台幣帳戶', value:'TWD'}, {label:'🇺🇸 美金帳戶', value:'USD'}]} value={settleCurrency} onChange={setSettleCurrency} />
                  </div>
                )}
                
                <div style={{display:'flex', gap:'10px', marginBottom:'10px'}}>
                   <div style={{flex:1, position: 'relative'}}>
                     <label style={{fontSize:'0.8rem', color:'#666'}}>股票代號/名稱</label>
                     <input type="text" className="glass-input" value={stockSymbol} onChange={e => { setStockSymbol(e.target.value.toUpperCase()); setShowDropdown(true); }} onFocus={() => setShowDropdown(true)} onBlur={() => setTimeout(() => setShowDropdown(false), 200)} placeholder="例: NVDA" />
                     {showDropdown && (searchResults.length > 0 || isSearching) && (
                         <div style={{position: 'absolute', top: '100%', left: 0, right: 0, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)', zIndex: 50, borderRadius: '8px', boxShadow: '0 8px 20px rgba(0,0,0,0.15)', overflow: 'hidden', marginTop: '4px', border: '1px solid #ddd'}}>
                             {isSearching ? <div style={{padding:'10px', fontSize:'0.85rem', color:'#888', textAlign:'center'}}>📡 尋找股號中...</div> : searchResults.map((item, idx) => ( <div key={idx} onClick={() => { setStockSymbol(item.symbol); setShowDropdown(false); }} style={{padding: '10px 12px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}> <strong style={{color:'#8e44ad', fontSize:'0.9rem'}}>{item.symbol}</strong> <span style={{color:'#666', fontSize:'0.75rem', textAlign:'right', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', marginLeft:'10px'}}> {item.shortname || item.longname} </span> </div> ))}
                         </div>
                     )}
                   </div>
                   <div style={{flex:1}}>
                     <label style={{fontSize:'0.8rem', color:'#666'}}>交易股數</label>
                     <input type="number" className="glass-input" value={stockShares} onChange={e=>setStockShares(e.target.value)} placeholder="例: 10" />
                   </div>
                </div>

                {stockMarket === 'US' ? (
                    <div style={{display:'flex', flexWrap:'wrap', gap:'10px'}}>
                       <div style={{flex:1, minWidth:'100px'}}>
                         <label style={{fontSize:'0.8rem', color:'#666'}}>單價 (USD)</label>
                         <input type="number" className="glass-input" value={stockPrice} onChange={e=>setStockPrice(e.target.value)} placeholder="170" />
                       </div>
                       <div style={{flex:1, minWidth:'120px'}}>
                         <label style={{fontSize:'0.8rem', color:'#e67e22', fontWeight:'bold'}}>{investAction === 'buy' ? '總額含息費(USD)' : '賣出總得(USD)'}</label>
                         <input type="number" className="glass-input" style={{borderColor:'#e67e22'}} value={usTotalUsd} onChange={e=>{
                            setUsTotalUsd(e.target.value);
                            if(settleCurrency === 'TWD') setInvestAmount(Math.round(Number(e.target.value) * Number(usFxRate)).toString());
                         }} placeholder="依元大輸入" />
                       </div>
                       <div style={{flex:1, minWidth:'80px'}}>
                         <label style={{fontSize:'0.8rem', color:'#e67e22', fontWeight:'bold'}}>成交匯率</label>
                         <input type="number" className="glass-input" style={{borderColor:'#e67e22'}} value={usFxRate} onChange={e=>{
                            setUsFxRate(e.target.value);
                            if(settleCurrency === 'TWD') setInvestAmount(Math.round(Number(usTotalUsd) * Number(e.target.value)).toString());
                         }} placeholder="31.5" />
                       </div>
                    </div>
                ) : (
                    <div style={{display:'flex', gap:'10px'}}>
                       <div style={{flex:1}}>
                         <label style={{fontSize:'0.8rem', color:'#666'}}>成交單價 (TWD)</label>
                         <input type="number" className="glass-input" value={stockPrice} onChange={e=>setStockPrice(e.target.value)} placeholder="輸入單價" />
                       </div>
                    </div>
                )}
             </div>
          )}

          {investAction === 'day_trade' && (
             <div style={{ marginBottom: '15px' }}>
                <label style={{display:'block', marginBottom:'8px', color:'#555', fontSize:'0.9rem'}}>當沖結果</label>
                <SegmentedControl options={[{ label: '📈 賺錢', value: 'profit' }, { label: '📉 賠錢', value: 'loss' }]} value={dayTradeResult} onChange={setDayTradeResult} />
             </div>
          )}

          {(!stockMarket || stockMarket === 'TW' || (stockMarket === 'US' && settleCurrency === 'TWD')) && (
            <div style={{ marginBottom: '15px' }}>
              <label style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end'}}>
                 <span>{investAction === 'buy' ? '最終交割總額 (台幣)' : investAction === 'sell' ? '最終拿回現金 (台幣)' : '結算淨差額 (台幣)'}</span>
              </label>
              <input type="number" inputMode="numeric" className="glass-input" style={{fontSize:'1.2rem', fontWeight:'bold', color:'#2c3e50'}} value={investAmount} onChange={(e)=>setInvestAmount(e.target.value)} placeholder="0" />
            </div>
          )}

          {investAction === 'sell' && stockMarket === 'TW' && (
             <div style={{ marginBottom: '15px', padding:'10px', background:'rgba(241, 196, 15, 0.1)', borderRadius:'8px', border:'1px dashed #f1c40f' }}>
               <label style={{color:'#b7791f', fontWeight:'bold'}}>⚠️ 這批賣掉的資產，當初買入的「本金(台幣)」是多少？</label>
               <input type="number" inputMode="numeric" className="glass-input" style={{margin:'5px 0', border:'1px solid #f1c40f'}} value={investPrincipal} onChange={(e)=>setInvestPrincipal(e.target.value)} placeholder="請輸入扣除本金" />
             </div>
          )}

          {investAction === 'sell' && stockMarket === 'US' && (
             <div style={{ marginBottom: '15px', padding:'10px', background:'rgba(241, 196, 15, 0.1)', borderRadius:'8px', border:'1px dashed #f1c40f' }}>
               <label style={{color:'#b7791f', fontWeight:'bold', fontSize:'0.95rem'}}>⚠️ 賣出美股成本計算</label>
               <div style={{marginTop:'8px'}}>
                   <label style={{fontSize:'0.8rem', color:'#666'}}>元大顯示的「美金持有成本」<span style={{color:'#e74c3c'}}>(必填計算獲利)</span></label>
                   <input type="number" className="glass-input" style={{margin:'5px 0', borderColor:'#f1c40f'}} value={usInvestPrincipalUsd} onChange={(e)=>setUsInvestPrincipalUsd(e.target.value)} placeholder="例: 800" />
               </div>
               <div style={{marginTop:'8px'}}>
                   <label style={{fontSize:'0.8rem', color:'#666'}}>這批股票當初投入的「大約台幣本金」<br/><span style={{fontSize:'0.7rem'}}>(用於精準扣除系統帳面總投資額)</span></label>
                   <input type="number" className="glass-input" style={{margin:'5px 0', borderColor:'#f1c40f'}} value={investPrincipal} onChange={(e)=>setInvestPrincipal(e.target.value)} placeholder="例: 25200" />
               </div>
             </div>
          )}
          
          <button className="glass-btn" style={{width:'100%', background: investAction === 'buy' ? 'linear-gradient(135deg, #a8e6cf 0%, #dcedc1 100%)' : investAction === 'sell' ? 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)' : '#ffeaa7', color:'#333', fontWeight:'bold'}} onClick={handleInvestSubmit}>
            {investAction === 'buy' ? `確認買入 (${settleCurrency === 'USD' ? '美金扣款' : '台幣交割'})` : investAction === 'sell' ? '確認賣出並結算' : '⚡ 確認當沖結算'}
          </button>
        </div>
      )}

      {/* 💱 外幣換匯中心 */}
      {activeTab === 'exchange' && (
        <div className="glass-card" style={{border:'1px solid #3498db'}}>
          <h3 style={{marginBottom: '15px', marginTop:0}}>💱 外幣換匯中心</h3>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{display:'block', marginBottom:'8px', color:'#555', fontSize:'0.9rem'}}>操作帳戶</label>
            <SegmentedControl options={[{ label: '🏫 共同', value: 'jointCash' }, { label: '🐶 恆恆', value: 'userA' }, { label: '🐕 得得', value: 'userB' }]} value={exchangeSource} onChange={setExchangeSource} />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{display:'block', marginBottom:'8px', color:'#555', fontSize:'0.9rem'}}>換匯方向</label>
            <SegmentedControl options={[{ label: '🇹🇼 台幣 ➔ 🇺🇸 美金', value: 'TWD_TO_USD' }, { label: '🇺🇸 美金 ➔ 🇹🇼 台幣', value: 'USD_TO_TWD' }]} value={exchangeDir} onChange={setExchangeDir} />
          </div>

          <div style={{display:'flex', gap:'10px', marginBottom:'15px'}}>
             <div style={{flex:1}}>
               <label style={{fontSize:'0.8rem', color:'#666'}}>台幣總額</label>
               <input type="number" className="glass-input" value={exchangeTwd} onChange={e=>setExchangeTwd(e.target.value)} placeholder="例: 31500" />
             </div>
             <div style={{flex:1}}>
               <label style={{fontSize:'0.8rem', color:'#666'}}>美金總額 (USD)</label>
               <input type="number" className="glass-input" value={exchangeUsd} onChange={e=>setExchangeUsd(e.target.value)} placeholder="例: 1000" />
             </div>
          </div>
          
          <button className="glass-btn" style={{width:'100%', background: '#3498db', color:'#fff', fontWeight:'bold'}} onClick={handleExchange}>確認換匯</button>
        </div>
      )}

      {/* ★ ⚖️ 餘額校正中心 */}
      {activeTab === 'calibrate' && (
        <div className="glass-card" style={{border:'1px solid #95a5a6'}}>
          <h3 style={{marginBottom: '15px', marginTop:0}}>⚖️ 餘額校正回歸</h3>
          <p style={{fontSize:'0.8rem', color:'#888', marginBottom:'15px'}}>用於修正手續費、匯差等造成的帳面微小落差，此操作<strong style={{color:'#e74c3c'}}>不會</strong>計入當月收支與預算。</p>

          <div style={{ marginBottom: '15px' }}>
            <label style={{display:'block', marginBottom:'8px', color:'#555', fontSize:'0.9rem'}}>校正帳戶</label>
            <SegmentedControl options={[{ label: '🏫 共同', value: 'jointCash' }, { label: '🐶 恆恆', value: 'userA' }, { label: '🐕 得得', value: 'userB' }]} value={calibAccount} onChange={setCalibAccount} />
          </div>

          <div style={{display:'flex', gap:'10px', marginBottom:'15px'}}>
             <div style={{flex:1, padding:'10px', background:'rgba(0,0,0,0.03)', borderRadius:'8px', textAlign:'center'}}>
               <div style={{fontSize:'0.8rem', color:'#666'}}>目前台幣帳面</div>
               <div style={{fontSize:'1.2rem', fontWeight:'bold', color:'#2c3e50'}}>{formatMoney(assets[calibAccount] || 0)}</div>
             </div>
             <div style={{flex:1, padding:'10px', background:'rgba(0,0,0,0.03)', borderRadius:'8px', textAlign:'center'}}>
               <div style={{fontSize:'0.8rem', color:'#666'}}>目前美金帳面</div>
               <div style={{fontSize:'1.2rem', fontWeight:'bold', color:'#2c3e50'}}>${(assets[`${calibAccount}_usd`] || 0).toFixed(2)}</div>
             </div>
          </div>

          <div style={{display:'flex', gap:'10px', marginBottom:'15px'}}>
             <div style={{flex:1}}>
               <label style={{fontSize:'0.8rem', color:'#666'}}>輸入實際台幣餘額<br/><span style={{fontSize:'0.7rem'}}>(留空代表不修改)</span></label>
               <input type="number" className="glass-input" style={{marginTop:'4px'}} value={calibTwd} onChange={e=>setCalibTwd(e.target.value)} placeholder={`例: ${assets[calibAccount] || 0}`} />
             </div>
             <div style={{flex:1}}>
               <label style={{fontSize:'0.8rem', color:'#666'}}>輸入實際美金餘額<br/><span style={{fontSize:'0.7rem'}}>(留空代表不修改)</span></label>
               <input type="number" className="glass-input" style={{marginTop:'4px'}} value={calibUsd} onChange={e=>setCalibUsd(e.target.value)} placeholder={`例: ${(assets[`${calibAccount}_usd`] || 0).toFixed(2)}`} />
             </div>
          </div>
          
          <button className="glass-btn" style={{width:'100%', background: '#95a5a6', color:'#fff', fontWeight:'bold'}} onClick={handleCalibrate}>確認校正</button>
        </div>
      )}

      {activeTab === 'transfer' && (
        <div className="glass-card"><h3 style={{marginBottom:'15px',marginTop:0}}>💸 上繳公庫</h3>
          <div style={{marginBottom:'15px'}}><label>來源</label><SegmentedControl options={[{label:`恆恆🐶`,value:'userA'},{label:`得得🐕`,value:'userB'}]} value={transSource} onChange={setTransSource} /></div>
          <div style={{marginBottom:'15px'}}><label>金額</label><input type="number" className="glass-input" value={transAmount} onChange={(e)=>setTransAmount(e.target.value)} placeholder="0"/></div>
          <button className="glass-btn" style={{width:'100%'}} onClick={handleTransfer}>確認上繳</button>
        </div>
      )}
      
      {activeTab === 'income' && (
        <div className="glass-card"><h3 style={{marginBottom:'15px',marginTop:0}}>💰 一般收入</h3>
          <div style={{marginBottom:'15px'}}><label>戶頭</label><SegmentedControl options={[{label:`恆恆🐶`,value:'userA'},{label:`得得🐕`,value:'userB'}]} value={incomeUser} onChange={setIncomeUser} /></div>
          <div style={{marginBottom:'15px'}}><label>金額</label><input type="number" className="glass-input" value={incomeAmount} onChange={(e)=>setIncomeAmount(e.target.value)} placeholder="輸入金額"/></div>
          <div style={{marginBottom:'15px'}}><label>備註</label><input type="text" className="glass-input" value={incomeNote} onChange={(e)=>setIncomeNote(e.target.value)} placeholder="例如：3月薪水"/></div>
          <button className="glass-btn" style={{width:'100%'}} onClick={handleIncomeSubmit}>確認收入入帳</button>
        </div>
      )}

      <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: '1px solid rgba(0,0,0,0.1)' }}>
        <h3 style={{color:'#666', marginBottom:'15px'}}>💾 資料管理</h3>
        <div style={{display:'flex', gap:'15px', marginBottom:'10px'}}>
            <button className="glass-btn" style={{flex:1, background: '#1d1d1f', color:'white', fontSize:'0.9rem'}} onClick={handleExport}>📥 匯出</button>
            <button className="glass-btn" style={{flex:1, background: 'rgba(255,255,255,0.8)', color:'#1d1d1f', border:'1px solid #ccc', fontSize:'0.9rem'}} onClick={handleImportClick}>📤 匯入</button>
            <input type="file" ref={fileInputRef} style={{display:'none'}} accept=".json" onChange={handleFileChange} />
        </div>
        <button onClick={handleManualBackup} disabled={isManualBackingUp} className="glass-btn" style={{width:'100%', background: '#3498db', color:'white', fontWeight:'bold', border:'none'}}>
            {isManualBackingUp ? '備份中...' : '☁️ 手動備份至雲端'}
        </button>
      </div>
    </div>
  );
};

export default AssetTransfer;