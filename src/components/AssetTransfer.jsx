// src/components/AssetTransfer.jsx
import React, { useState, useRef, useEffect } from 'react';

const formatMoney = (num) => "$" + Number(num).toLocaleString();

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

  const [investAccount, setInvestAccount] = useState('jointCash'); 
  const [investAction, setInvestAction] = useState('buy'); 
  const [investType, setInvestType] = useState('stock');
  const [investAmount, setInvestAmount] = useState(''); 
  const [investPrincipal, setInvestPrincipal] = useState(''); 
  const [dayTradeResult, setDayTradeResult] = useState('profit'); 

  const [stockMarket, setStockMarket] = useState('TW'); 
  const [stockSymbol, setStockSymbol] = useState('');
  const [stockShares, setStockShares] = useState('');
  const [stockPrice, setStockPrice] = useState('');
  
  // ★ 新增：美股精準輸入狀態
  const [usTotalUsd, setUsTotalUsd] = useState(''); 
  const [usFxRate, setUsFxRate] = useState('31.5');
  
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // 智慧搜尋引擎
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (stockSymbol.length >= 1 && showDropdown) {
        setIsSearching(true);
        try {
          const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(`https://query2.finance.yahoo.com/v1/finance/search?q=${stockSymbol}&quotesCount=6`)}`);
          const data = await res.json();
          if (data.quotes) setSearchResults(data.quotes.filter(q => q.quoteType === 'EQUITY' || q.quoteType === 'ETF'));
        } catch(err) { console.error("搜尋失敗:", err); }
        setIsSearching(false);
      } else { setSearchResults([]); }
    }, 500);
    return () => clearTimeout(timer);
  }, [stockSymbol, showDropdown]);

  // ★ 台股自動精算引擎 (美股改為手動輸入精準相乘)
  useEffect(() => {
    if (investType !== 'stock' || investAction === 'day_trade') return;
    if (stockMarket === 'US') return; // 美股交給手動輸入聯動，不在此自動覆蓋

    const p = Number(stockPrice) || 0;
    const s = Number(stockShares) || 0;
    if (p === 0 || s === 0) return;

    if (stockMarket === 'TW') {
        const baseAmount = p * s;
        const fee = Math.max(20, Math.floor(baseAmount * 0.001425 * 0.6));
        if (investAction === 'buy') {
            setInvestAmount(Math.round(baseAmount + fee).toString());
        } else if (investAction === 'sell') {
            const tax = Math.floor(baseAmount * 0.003); 
            setInvestAmount(Math.round(baseAmount - fee - tax).toString());
        }
    }
  }, [stockPrice, stockShares, stockMarket, investAction, investType]);

  const handleIncomeSubmit = () => {
    const val = parseInt(incomeAmount);
    if (!val || val <= 0) return alert("請輸入有效金額");
    const userName = incomeUser === 'userA' ? '恆恆🐶' : '得得🐕';
    if (!window.confirm(`確定要記錄 ${userName} 收入 ${formatMoney(val)} 嗎？`)) return;
    const newAssets = { ...assets };
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
    const newAssets = { ...assets };
    newAssets[transSource] -= val;
    newAssets.jointCash += val;
    onTransaction(newAssets, { type: 'transfer', category: '資產劃撥', payer: userName, total: val, note: `轉移至 共同現金`, month: txDate.slice(0, 7), date: txDate });
    alert("✅ 劃撥成功！");
    setTransAmount('');
  };

  const handleInvestSubmit = () => {
    const val = parseInt(investAmount); 
    if (!val || val <= 0) return alert("請確認最終台幣金額！");

    const newAssets = { ...assets };
    if (!newAssets.userInvestments) newAssets.userInvestments = { userA: { stock:0, fund:0, deposit:0, other:0 }, userB: { stock:0, fund:0, deposit:0, other:0 } };

    const isJoint = investAccount === 'jointCash';
    const accountName = isJoint ? '共同帳戶🏫' : (investAccount === 'userA' ? '恆恆🐶' : '得得🐕');
    const label = investType === 'stock' && stockSymbol ? `${stockSymbol.toUpperCase()}` : { stock: '股票', fund: '基金', deposit: '定存', other: '其他' }[investType];

    if (investAction === 'day_trade') {
        const isProfit = dayTradeResult === 'profit';
        if (!isProfit && newAssets[investAccount] < val) return alert(`❌ ${accountName} 現金不足以支付當沖虧損！`);
        if (!window.confirm(`確定執行當沖結算：${accountName} ${isProfit ? '賺' : '賠'} ${formatMoney(val)} 嗎？`)) return;

        if (isProfit) newAssets[investAccount] += val; else newAssets[investAccount] -= val;

        onTransaction(newAssets, {
            type: isProfit ? 'personal_invest_profit' : 'personal_invest_loss',
            category: '當沖結算', payer: accountName, accountKey: investAccount, investType, total: val,
            note: `當沖${isProfit ? '賺' : '賠'} - ${label}`, month: txDate.slice(0, 7), date: txDate, symbol: stockSymbol.toUpperCase()
        });
        alert(`⚡ 當沖結算完成！`);
        setInvestAmount(''); setStockSymbol(''); setStockPrice(''); setStockShares(''); setUsTotalUsd('');
        return;
    }

    if (investAction === 'buy') {
        if (newAssets[investAccount] < val) return alert(`❌ ${accountName} 現金餘額不足以交割！`);
        if (!window.confirm(`確定用「${accountName}」買入「${label}」\n總交割金額：${formatMoney(val)} 嗎？`)) return;

        newAssets[investAccount] -= val;
        if (isJoint) newAssets.jointInvestments[investType] += val; else newAssets.userInvestments[investAccount][investType] += val;

        onTransaction(newAssets, {
            type: isJoint ? 'joint_invest_buy' : 'personal_invest_buy',
            category: '投資買入', payer: isJoint ? '共同帳戶' : accountName, accountKey: investAccount, investType,
            total: val, note: `買入 ${label}`, month: txDate.slice(0, 7), date: txDate,
            symbol: stockSymbol.toUpperCase(), shares: Number(stockShares), market: stockMarket,
            buyPrice: Number(stockPrice)
        });
        alert(`✅ 成功買入 ${label}！`);

    } else if (investAction === 'sell') {
        const principalVal = parseInt(investPrincipal);
        if (isNaN(principalVal) || principalVal < 0) return alert("請輸入這批股票當初的「買入成本(本金)」！");

        const currentPrincipal = isJoint ? newAssets.jointInvestments[investType] : newAssets.userInvestments[investAccount][investType];
        if (currentPrincipal < principalVal) return alert(`❌ ${accountName} 帳面本金僅剩 ${formatMoney(currentPrincipal)}，無法扣除 ${formatMoney(principalVal)}！`);

        const profit = val - principalVal;
        const profitNote = profit >= 0 ? `(賺 ${formatMoney(profit)})` : `(賠 ${formatMoney(Math.abs(profit))})`;
        if (!window.confirm(`確定賣出「${label}」？\n拿回現金：${formatMoney(val)}\n扣除本金：${formatMoney(principalVal)}\n結算：${profitNote}\n確定執行嗎？`)) return;

        newAssets[investAccount] += val;
        if (isJoint) newAssets.jointInvestments[investType] -= principalVal; else newAssets.userInvestments[investAccount][investType] -= principalVal;

        onTransaction(newAssets, {
            type: isJoint ? 'joint_invest_sell' : 'personal_invest_sell',
            category: '投資變現', payer: isJoint ? '共同帳戶' : accountName, accountKey: investAccount, investType,
            total: val, principal: principalVal, note: `賣出 ${label} ${profitNote}`, month: txDate.slice(0, 7), date: txDate,
            symbol: stockSymbol.toUpperCase(), shares: Number(stockShares)
        });
        alert(`🔄 成功變現 ${formatMoney(val)}！結算：${profitNote}`);
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

  return (
    <div>
      <h1 className="page-title">資產操作</h1>
      
      <div style={{display:'flex', gap:'10px', marginBottom:'20px'}}>
        <button className={`glass-btn ${activeTab==='invest'?'':'inactive'}`} onClick={()=>setActiveTab('invest')} style={{flex:1}}>投資買賣</button>
        <button className={`glass-btn ${activeTab==='transfer'?'':'inactive'}`} onClick={()=>setActiveTab('transfer')} style={{flex:1}}>上繳公庫</button>
        <button className={`glass-btn ${activeTab==='income'?'':'inactive'}`} onClick={()=>setActiveTab('income')} style={{flex:1}}>一般收入</button>
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
                
                <div style={{display:'flex', gap:'10px', marginBottom:'10px'}}>
                   <div style={{flex:1, position: 'relative'}}>
                     <label style={{fontSize:'0.8rem', color:'#666'}}>股票代號/名稱</label>
                     <input type="text" className="glass-input" value={stockSymbol} onChange={e => { setStockSymbol(e.target.value.toUpperCase()); setShowDropdown(true); }} onFocus={() => setShowDropdown(true)} onBlur={() => setTimeout(() => setShowDropdown(false), 200)} placeholder="例: AAPL" />
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

                {/* ★ 美股精準輸入區塊 */}
                {stockMarket === 'US' ? (
                    <div style={{display:'flex', flexWrap:'wrap', gap:'10px'}}>
                       <div style={{flex:1, minWidth:'100px'}}>
                         <label style={{fontSize:'0.8rem', color:'#666'}}>單價 (USD)</label>
                         <input type="number" className="glass-input" value={stockPrice} onChange={e=>setStockPrice(e.target.value)} placeholder="170" />
                       </div>
                       <div style={{flex:1, minWidth:'120px'}}>
                         <label style={{fontSize:'0.8rem', color:'#666', color:'#e67e22', fontWeight:'bold'}}>總額含息費 (USD)</label>
                         <input type="number" className="glass-input" style={{borderColor:'#e67e22'}} value={usTotalUsd} onChange={e=>{
                            setUsTotalUsd(e.target.value);
                            setInvestAmount(Math.round(Number(e.target.value) * Number(usFxRate)).toString());
                         }} placeholder="依元大輸入" />
                       </div>
                       <div style={{flex:1, minWidth:'80px'}}>
                         <label style={{fontSize:'0.8rem', color:'#666', color:'#e67e22', fontWeight:'bold'}}>成交匯率</label>
                         <input type="number" className="glass-input" style={{borderColor:'#e67e22'}} value={usFxRate} onChange={e=>{
                            setUsFxRate(e.target.value);
                            setInvestAmount(Math.round(Number(usTotalUsd) * Number(e.target.value)).toString());
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

          <div style={{ marginBottom: '15px' }}>
            <label style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end'}}>
               <span>{investAction === 'buy' ? '最終交割總額 (台幣)' : investAction === 'sell' ? '最終拿回現金 (台幣)' : '結算淨差額 (台幣)'}</span>
            </label>
            <input type="number" inputMode="numeric" className="glass-input" style={{fontSize:'1.2rem', fontWeight:'bold', color:'#2c3e50'}} value={investAmount} onChange={(e)=>setInvestAmount(e.target.value)} placeholder="0" />
            {investType === 'stock' && investAction !== 'day_trade' && (
                <div style={{fontSize:'0.75rem', color:'#888', marginTop:'4px'}}>
                   {stockMarket === 'US' ? '* 系統已根據美金總額與匯率精準換算' : '* 系統已為您試算手續費，若有尾數落差可直接修改上方金額'}
                </div>
            )}
          </div>

          {investAction === 'sell' && (
             <div style={{ marginBottom: '15px', padding:'10px', background:'rgba(241, 196, 15, 0.1)', borderRadius:'8px', border:'1px dashed #f1c40f' }}>
               <label style={{color:'#b7791f', fontWeight:'bold'}}>⚠️ 這批賣掉的資產，當初買入的「本金(台幣)」是多少？</label>
               <input type="number" inputMode="numeric" className="glass-input" style={{margin:'5px 0', border:'1px solid #f1c40f'}} value={investPrincipal} onChange={(e)=>setInvestPrincipal(e.target.value)} placeholder="請輸入扣除本金" />
             </div>
          )}
          
          <button className="glass-btn" style={{width:'100%', background: investAction === 'buy' ? 'linear-gradient(135deg, #a8e6cf 0%, #dcedc1 100%)' : investAction === 'sell' ? 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)' : '#ffeaa7', color:'#333', fontWeight:'bold'}} onClick={handleInvestSubmit}>
            {investAction === 'buy' ? '確認交割買入' : investAction === 'sell' ? '確認賣出並結算' : '⚡ 確認當沖結算'}
          </button>
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
        <div style={{display:'flex', gap:'15px'}}>
            <button className="glass-btn" style={{flex:1, background: '#1d1d1f', color:'white', fontSize:'0.9rem'}} onClick={handleExport}>📥 匯出</button>
            <button className="glass-btn" style={{flex:1, background: 'rgba(255,255,255,0.8)', color:'#1d1d1f', border:'1px solid #ccc', fontSize:'0.9rem'}} onClick={handleImportClick}>📤 匯入</button>
            <input type="file" ref={fileInputRef} style={{display:'none'}} accept=".json" onChange={handleFileChange} />
        </div>
      </div>
    </div>
  );
};

export default AssetTransfer;