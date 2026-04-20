// src/components/AssetTransfer.jsx
import React, { useState, useRef, useEffect } from 'react';
import SegmentedControl from './SegmentedControl';
import { MY_GOOGLE_API_URL } from '../config';

const formatMoney = (num) => "$" + Math.round(Number(num)).toLocaleString();



const AssetTransfer = ({ assets, onTransaction, setAssets, currentFxRate }) => {
  const [activeTab, setActiveTab] = useState('invest');
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);
  const fileInputRef = useRef(null);

  const [incomeUser, setIncomeUser] = useState(null);
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomeNote, setIncomeNote] = useState('');

  const [transSource, setTransSource] = useState(null);
  const [transAmount, setTransAmount] = useState('');

  // 💱 換匯專屬 State
  const [exchangeSource, setExchangeSource] = useState(null);
  const [exchangeDir, setExchangeDir] = useState(null);
  const [exchangeTwd, setExchangeTwd] = useState('');
  const [exchangeUsd, setExchangeUsd] = useState('');

  // ⚖️ 餘額校正專屬 State
  const [calibAccount, setCalibAccount] = useState(null);
  const [calibTwd, setCalibTwd] = useState('');
  const [calibUsd, setCalibUsd] = useState('');

  const [investAccount, setInvestAccount] = useState(null);
  const [investAction, setInvestAction] = useState(null);
  const [investType, setInvestType] = useState(null);
  const [investAmount, setInvestAmount] = useState('');
  const [investPrincipal, setInvestPrincipal] = useState('');
  const [dayTradeResult, setDayTradeResult] = useState(null);
  const [investCart, setInvestCart] = useState([]);

  const [stockMarket, setStockMarket] = useState(null);
  const [settleCurrency, setSettleCurrency] = useState(null);
  const [usInvestPrincipalUsd, setUsInvestPrincipalUsd] = useState('');

  const [stockSymbol, setStockSymbol] = useState('');
  const [stockShares, setStockShares] = useState('');
  const [stockPrice, setStockPrice] = useState('');
  const [usTotalUsd, setUsTotalUsd] = useState('');
  const [usFxRate, setUsFxRate] = useState(currentFxRate ? currentFxRate.toString() : '31.5');

  // Sync usFxRate with currentFxRate when it changes from external background fetch
  useEffect(() => {
    if (currentFxRate) {
      setUsFxRate(currentFxRate.toString());
    }
  }, [currentFxRate]);

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
        } catch (err) { setSearchResults([]); }
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
    if (!incomeUser) return alert("請選擇戶頭！");
    const val = parseInt(incomeAmount);
    if (!val || val <= 0) return alert("請輸入有效金額");
    const userName = incomeUser === 'userA' ? '恆恆🐶' : '得得🐕';
    if (!window.confirm(`確定要記錄 ${userName} 收入 ${formatMoney(val)} 嗎？`)) return;
    const newAssets = getDeepCopy(assets);
    newAssets[incomeUser] += val;
    onTransaction(newAssets, { type: 'income', category: '個人收入', payer: userName, total: val, note: incomeNote.trim() || '一般收入', month: txDate.slice(0, 7), date: txDate });
    alert(`✅ 已記錄收入：${formatMoney(val)}`);
    setIncomeAmount(''); setIncomeNote(''); setIncomeUser(null);
  };

  const handleTransfer = () => {
    if (!transSource) return alert("請選擇來源！");
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
    setTransAmount(''); setTransSource(null);
  };

  const handleExchange = () => {
    if (!exchangeSource) return alert("請選擇操作帳戶！");
    if (!exchangeDir) return alert("請選擇換匯方向！");
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
    setExchangeSource(null); setExchangeDir(null);
  };

  const handleCalibrate = () => {
    if (!calibAccount) return alert("請選擇校正帳戶！");
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
      total: Math.abs(twdDiff),
      twdDiff: twdDiff,
      usdDiff: usdDiff,
      note: `系統校正 (${diffNotes.join(', ')})`,
      date: txDate
    });

    alert("✅ 餘額校正完成！");
    setCalibTwd('');
    setCalibUsd('');
    setCalibAccount(null);
  };

  const handleAddInvestCart = () => {
    if (!investAccount) return alert("請選擇操作帳戶！");
    if (!investAction) return alert("請選擇動作！");
    if (!investType) return alert("請選擇標的類型！");
    if (investType === 'stock' && !stockMarket) return alert("請選擇股票市場！");
    if (investType === 'stock' && stockMarket === 'US' && !settleCurrency) return alert("請選擇交割帳戶！");
    if (investAction === 'day_trade' && !dayTradeResult) return alert("請選擇當沖結果！");

    // ★ Context-aware validation: only require fields relevant to the current path
    const isUsStock = investType === 'stock' && stockMarket === 'US';
    const isUsdSettle = isUsStock && settleCurrency === 'USD';
    const isTwdSettle = isUsStock && settleCurrency === 'TWD';

    if (isUsStock) {
      // US stock always needs USD total
      const usdVal = parseFloat(usTotalUsd);
      if (!usdVal || usdVal <= 0) return alert("請確認美金總額 (USD)！");

      if (isUsdSettle && investAction === 'buy') {
        // USD settlement buy: only needs usTotalUsd — no investAmount, no FX rate needed
        // Auto-compute investAmount (台幣本金) for bookkeeping using current FX rate
        const autoTwd = Math.round(usdVal * Number(usFxRate || currentFxRate || 31.5));
        if (!investAmount || parseInt(investAmount) <= 0) {
          setInvestAmount(autoTwd.toString());
        }
      } else if (isTwdSettle && investAction === 'buy') {
        // TWD settlement buy: needs investAmount (台幣交割額) + usFxRate
        const val = parseInt(investAmount);
        if (!val || val <= 0) return alert("請確認台幣交割總額！");
      } else if (investAction === 'sell') {
        // US stock sell: needs usInvestPrincipalUsd. investPrincipal is only required for TWD settle
        if (!usInvestPrincipalUsd) return alert("請輸入美金成本！");
        if (isTwdSettle) {
          if (!investPrincipal) return alert("請輸入扣除台幣本金！");
          const val = parseInt(investAmount);
          if (!val || val <= 0) return alert("請確認台幣收回總額！");
        }
      }
    } else if (investAction === 'day_trade') {
      const val = parseInt(investAmount);
      if (!val || val <= 0) return alert("請輸入當沖淨差額！");
    } else {
      // TW stock or non-stock (fund/deposit/other)
      const val = parseInt(investAmount);
      if (!val || val <= 0) return alert("請確認收支總額！");
      // TW stock sell needs principal
      if (investType === 'stock' && stockMarket === 'TW' && investAction === 'sell') {
        if (!investPrincipal) return alert("請輸入扣除台幣本金！");
      }
    }
    
    let finalSymbol = stockSymbol ? stockSymbol.toUpperCase().trim() : '';
    if (investType === 'stock' && stockMarket === 'TW' && finalSymbol && !finalSymbol.includes('.')) {
      finalSymbol += '.TW';
    }

    let finalInvestAmount = investAmount;
    if (isUsdSettle && investAction === 'buy' && (!finalInvestAmount || parseInt(finalInvestAmount) <= 0)) {
      finalInvestAmount = Math.round(parseFloat(usTotalUsd) * Number(usFxRate || currentFxRate || 31.5)).toString();
    }
    
    let finalInvestPrincipal = investPrincipal;
    if (isUsdSettle && investAction === 'sell' && (!finalInvestPrincipal || parseInt(finalInvestPrincipal) <= 0)) {
      finalInvestPrincipal = Math.round(parseFloat(usInvestPrincipalUsd) * Number(usFxRate || currentFxRate || 31.5)).toString();
    }

    setInvestCart([...investCart, {
        id: Date.now(),
        investAccount,
        investAction,
        investType,
        stockMarket,
        settleCurrency,
        stockSymbol: finalSymbol,
        stockShares,
        stockPrice,
        usTotalUsd,
        usFxRate: usFxRate || (currentFxRate || 31.5).toString(),
        investAmount: finalInvestAmount,
        investPrincipal: finalInvestPrincipal,
        usInvestPrincipalUsd,
        dayTradeResult
    }]);

    setInvestAmount(''); setInvestPrincipal(''); setStockPrice(''); setStockShares(''); setStockSymbol(''); setUsTotalUsd(''); setUsInvestPrincipalUsd('');
    // 依要求：保留 investType, stockMarket, settleCurrency, investAction, investAccount, dayTradeResult 的選項進度
  };

  const handleInvestSubmit = () => {
    const items = [...investCart];
    // Check if there's unsaved data in the form (either investAmount or usTotalUsd has value)
    if ((investAmount && parseInt(investAmount) > 0) || (usTotalUsd && parseFloat(usTotalUsd) > 0)) {
      return alert("請先點擊「➕ 暫存此筆」，將資料加入清單後再送出喔！");
    }
    if (items.length === 0) return alert("暫存清單沒有任何項目！");

    const newAssets = getDeepCopy(assets);
    if (!newAssets.userInvestments) newAssets.userInvestments = { userA: { stock: 0, fund: 0, deposit: 0, other: 0 }, userB: { stock: 0, fund: 0, deposit: 0, other: 0 } };

    const transactionRecords = [];
    let summaryNotes = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const { investAccount, investAction, investType, stockMarket, settleCurrency, stockSymbol, stockShares, stockPrice, usTotalUsd, usFxRate, investAmount, investPrincipal, usInvestPrincipalUsd, dayTradeResult } = item;

      const isJoint = investAccount === 'jointCash';
      const accountName = isJoint ? '共同帳戶🏫' : (investAccount === 'userA' ? '恆恆🐶' : '得得🐕');
      const label = investType === 'stock' && stockSymbol ? stockSymbol : { stock: '股票', fund: '基金', deposit: '定存', other: '其他' }[investType];
      
      const val = parseInt(investAmount);

      if (investAction === 'day_trade') {
        const isProfit = dayTradeResult === 'profit';
        if (!isProfit && newAssets[investAccount] < val) return alert(`❌ 第 ${i+1} 筆錯誤：${accountName} 現金不足以支付當沖虧損！`);
        
        if (isProfit) newAssets[investAccount] += val; else newAssets[investAccount] -= val;
        transactionRecords.push({ type: isProfit ? 'personal_invest_profit' : 'personal_invest_loss', category: '當沖結算', payer: accountName, accountKey: investAccount, investType, total: val, note: `當沖${isProfit ? '賺' : '賠'} - ${label}`, date: txDate, symbol: stockSymbol });
        summaryNotes.push(`當沖 ${label} ${isProfit ? '賺' : '賠'} ${formatMoney(val)}`);
        continue;
      }

      if (investType === 'stock' && stockMarket === 'US') {
        const costUsd = parseFloat(usTotalUsd) || 0;
        const equivalentTwd = Math.round(costUsd * Number(usFxRate || 31.5));

        if (investAction === 'buy') {
          if (settleCurrency === 'USD') {
            if ((newAssets[`${investAccount}_usd`] || 0) < costUsd) return alert(`❌ 第 ${i+1} 筆錯誤：${accountName} 美金餘額不足！`);
            newAssets[`${investAccount}_usd`] -= costUsd;
            if (isJoint) newAssets.jointInvestments[investType] += equivalentTwd; else newAssets.userInvestments[investAccount][investType] += equivalentTwd;
            transactionRecords.push({ type: isJoint ? 'joint_invest_buy' : 'personal_invest_buy', category: '投資買入', payer: isJoint ? '共同帳戶' : accountName, accountKey: investAccount, investType, total: equivalentTwd, usdAmount: costUsd, note: `買入 ${label}`, date: txDate, symbol: stockSymbol, shares: Number(stockShares), market: stockMarket, buyPrice: Number(stockPrice) });
          } else {
            if (newAssets[investAccount] < val) return alert(`❌ 第 ${i+1} 筆錯誤：${accountName} 台幣餘額不足！`);
            newAssets[investAccount] -= val;
            if (isJoint) newAssets.jointInvestments[investType] += val; else newAssets.userInvestments[investAccount][investType] += val;
            transactionRecords.push({ type: isJoint ? 'joint_invest_buy' : 'personal_invest_buy', category: '投資買入', payer: isJoint ? '共同帳戶' : accountName, accountKey: investAccount, investType, total: val, usdAmount: costUsd, note: `買入 ${label} (台幣交割)`, date: txDate, symbol: stockSymbol, shares: Number(stockShares), market: stockMarket, buyPrice: Number(stockPrice) });
          }
          summaryNotes.push(`買入 ${label}`);
        } else if (investAction === 'sell') {
          const principalTwd = parseInt(investPrincipal);
          const currentPrincipal = isJoint ? newAssets.jointInvestments[investType] : newAssets.userInvestments[investAccount][investType];
          if (currentPrincipal < principalTwd) return alert(`❌ 第 ${i+1} 筆錯誤：帳面本金僅剩 ${formatMoney(currentPrincipal)}，無法扣除 ${formatMoney(principalTwd)}！`);

          const principalUsd = parseFloat(usInvestPrincipalUsd);
          const profitUsd = costUsd - principalUsd;
          const profitNote = profitUsd >= 0 ? `(賺 $${profitUsd.toFixed(2)} USD)` : `(賠 $${Math.abs(profitUsd).toFixed(2)} USD)`;

          if (settleCurrency === 'USD') {
            newAssets[`${investAccount}_usd`] = (newAssets[`${investAccount}_usd`] || 0) + costUsd;
            if (isJoint) newAssets.jointInvestments[investType] -= principalTwd; else newAssets.userInvestments[investAccount][investType] -= principalTwd;
            transactionRecords.push({ type: isJoint ? 'joint_invest_sell' : 'personal_invest_sell', category: '投資變現', payer: isJoint ? '共同帳戶' : accountName, accountKey: investAccount, investType, total: equivalentTwd, principal: principalTwd, usdAmount: costUsd, note: `賣出 ${label} ${profitNote}`, date: txDate, symbol: stockSymbol, shares: Number(stockShares) });
          } else {
            newAssets[investAccount] += val;
            if (isJoint) newAssets.jointInvestments[investType] -= principalTwd; else newAssets.userInvestments[investAccount][investType] -= principalTwd;
            transactionRecords.push({ type: isJoint ? 'joint_invest_sell' : 'personal_invest_sell', category: '投資變現', payer: isJoint ? '共同帳戶' : accountName, accountKey: investAccount, investType, total: val, principal: principalTwd, usdAmount: costUsd, note: `賣出 ${label} (台幣交割) ${profitNote}`, date: txDate, symbol: stockSymbol, shares: Number(stockShares) });
          }
          summaryNotes.push(`賣出 ${label} ${profitNote}`);
        }
        continue;
      }

      if (investAction === 'buy') {
        if (newAssets[investAccount] < val) return alert(`❌ 第 ${i+1} 筆錯誤：${accountName} 台幣餘額不足！`);
        newAssets[investAccount] -= val;
        if (isJoint) newAssets.jointInvestments[investType] += val; else newAssets.userInvestments[investAccount][investType] += val;
        transactionRecords.push({ type: isJoint ? 'joint_invest_buy' : 'personal_invest_buy', category: '投資買入', payer: isJoint ? '共同帳戶' : accountName, accountKey: investAccount, investType, total: val, note: `買入 ${label}`, date: txDate, symbol: stockSymbol, shares: Number(stockShares), market: stockMarket, buyPrice: Number(stockPrice) });
        summaryNotes.push(`買入 ${label}`);

      } else if (investAction === 'sell') {
        const principalVal = parseInt(investPrincipal);
        const currentPrincipal = isJoint ? newAssets.jointInvestments[investType] : newAssets.userInvestments[investAccount][investType];
        if (currentPrincipal < principalVal) return alert(`❌ 第 ${i+1} 筆錯誤：帳面本金僅剩 ${formatMoney(currentPrincipal)}，無法扣除 ${formatMoney(principalVal)}！`);

        const profit = val - principalVal;
        const profitNote = profit >= 0 ? `(賺 ${formatMoney(profit)})` : `(賠 ${formatMoney(Math.abs(profit))})`;
        newAssets[investAccount] += val;
        if (isJoint) newAssets.jointInvestments[investType] -= principalVal; else newAssets.userInvestments[investAccount][investType] -= principalVal;
        transactionRecords.push({ type: isJoint ? 'joint_invest_sell' : 'personal_invest_sell', category: '投資變現', payer: isJoint ? '共同帳戶' : accountName, accountKey: investAccount, investType, total: val, principal: principalVal, note: `賣出 ${label} ${profitNote}`, date: txDate, symbol: stockSymbol, shares: Number(stockShares) });
        summaryNotes.push(`賣出 ${label} ${profitNote}`);
      }
    }

    if (!window.confirm(`確定將這 ${items.length} 筆一起送出嗎？\n\n預計的動作有：\n${summaryNotes.join('\n')}`)) return;

    onTransaction(newAssets, transactionRecords);
    alert(`✅ 已成功批次處理 ${items.length} 筆投資操作！`);
    setInvestCart([]);
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
      if (text.includes('success')) alert('✅ 成功備份至 Google 雲端硬碟！請至雲端硬碟確認檔案。');
      else throw new Error("API 錯誤");
    } catch (e) { alert('❌ 備份失敗，請檢查網路'); }
    finally { setIsManualBackingUp(false); }
  };

  return (
    <div className="page-transition-enter">
      <h1 className="page-title">資產操作</h1>

      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '18px',
          overflowX: 'auto',
          paddingBottom: '4px',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        <button className={`glass-btn ${activeTab === 'invest' ? '' : 'inactive'}`} onClick={() => setActiveTab('invest')} style={{ flex: '0 0 auto', whiteSpace: 'nowrap', padding: '9px 16px', fontSize:'0.88rem' }}>📈 投資</button>
        <button className={`glass-btn ${activeTab === 'exchange' ? '' : 'inactive'}`} onClick={() => setActiveTab('exchange')} style={{ flex: '0 0 auto', whiteSpace: 'nowrap', padding: '9px 16px', fontSize:'0.88rem' }}>💱 換匯</button>
        <button className={`glass-btn ${activeTab === 'transfer' ? '' : 'inactive'}`} onClick={() => setActiveTab('transfer')} style={{ flex: '0 0 auto', whiteSpace: 'nowrap', padding: '9px 16px', fontSize:'0.88rem' }}>💸 上繳</button>
        <button className={`glass-btn ${activeTab === 'income' ? '' : 'inactive'}`} onClick={() => setActiveTab('income')} style={{ flex: '0 0 auto', whiteSpace: 'nowrap', padding: '9px 16px', fontSize:'0.88rem' }}>💰 收入</button>
        <button className={`glass-btn ${activeTab === 'calibrate' ? '' : 'inactive'}`} onClick={() => setActiveTab('calibrate')} style={{ flex: '0 0 auto', whiteSpace: 'nowrap', padding: '9px 16px', fontSize:'0.88rem' }}>⚖️ 校正</button>
      </div>

      <div className="glass-card card-animate" style={{ padding: '12px 16px', marginBottom: '18px', borderLeft: '4px solid var(--accent-indigo)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={{ fontWeight: '600', fontSize: '1rem', margin: 0, color:'var(--text-primary)' }}>📅 交易日期</label>
        <input type="date" className="glass-input" style={{ width: 'auto', marginBottom: 0, padding: '8px 12px' }} value={txDate} onChange={(e) => setTxDate(e.target.value)} />
      </div>

      {activeTab === 'invest' && (
        <div className="glass-card card-animate">
          <h3 style={{ marginBottom: '15px', marginTop: 0, fontWeight:'700' }}>📈 投資操作中心</h3>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight:'600' }}>操作帳戶</label>
            <SegmentedControl options={[{ label: '🏫 共同', value: 'jointCash' }, { label: '🐶 恆恆', value: 'userA' }, { label: '🐕 得得', value: 'userB' }]} value={investAccount} onChange={(val) => { setInvestAccount(val); if (val === 'jointCash' && investAction === 'day_trade') setInvestAction('buy'); }} />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight:'600' }}>動作</label>
            <SegmentedControl options={[{ label: '📥 買入', value: 'buy' }, { label: '📤 賣出', value: 'sell' }, { label: '⚡ 當沖', value: 'day_trade' }]} value={investAction} onChange={setInvestAction} disabledValue={investAccount === 'jointCash' ? 'day_trade' : null} />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight:'600' }}>標的類型</label>
            <SegmentedControl options={[{ label: '股票', value: 'stock' }, { label: '基金', value: 'fund' }, { label: '定存', value: 'deposit' }, { label: '其他', value: 'other' }]} value={investType} onChange={setInvestType} />
          </div>

          {investType === 'stock' && (
            <div style={{ background: 'rgba(88,86,214,0.06)', padding: '15px', borderRadius: 'var(--radius-sm)', marginBottom: '15px' }}>
              <div style={{ marginBottom: '10px' }}>
                <SegmentedControl options={[{ label: '🇹🇼 台股', value: 'TW' }, { label: '🇺🇸 美股複委託', value: 'US' }]} value={stockMarket} onChange={setStockMarket} />
              </div>

              {stockMarket === 'US' && (
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>交割帳戶 (扣除/拿回的錢包)</label>
                  <SegmentedControl options={[{ label: '🇹🇼 台幣帳戶', value: 'TWD' }, { label: '🇺🇸 美金帳戶', value: 'USD' }]} value={settleCurrency} onChange={setSettleCurrency} />
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>股票代號/名稱</label>
                  <input type="text" className="glass-input" value={stockSymbol} onChange={e => { setStockSymbol(e.target.value.toUpperCase()); setShowDropdown(true); }} onFocus={() => setShowDropdown(true)} onBlur={() => setTimeout(() => setShowDropdown(false), 200)} placeholder="例: NVDA" />
                  {showDropdown && (searchResults.length > 0 || isSearching) && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)', zIndex: 50, borderRadius: '8px', boxShadow: '0 8px 20px rgba(0,0,0,0.15)', overflow: 'hidden', marginTop: '4px', border: '1px solid #ddd' }}>
                      {isSearching ? <div style={{ padding: '10px', fontSize: '0.84rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>📡 尋找股號中...</div> : searchResults.map((item, idx) => (<div key={idx} onClick={() => { setStockSymbol(item.symbol); setShowDropdown(false); }} style={{ padding: '10px 12px', borderBottom: '0.5px solid rgba(0,0,0,0.04)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}> <strong style={{ color: 'var(--accent-purple)', fontSize: '0.88rem' }}>{item.symbol}</strong> <span style={{ color: 'var(--text-secondary)', fontSize: '0.73rem', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginLeft: '10px' }}> {item.shortname || item.longname} </span> </div>))}
                    </div>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>交易股數</label>
                  <input type="number" className="glass-input" value={stockShares} onChange={e => setStockShares(e.target.value)} placeholder="例: 10" />
                </div>
              </div>

              {stockMarket === 'US' ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ flex: 1, minWidth: '100px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>單價 (USD)</label>
                    <input type="number" className="glass-input" value={stockPrice} onChange={e => setStockPrice(e.target.value)} placeholder="170" />
                  </div>
                  <div style={{ flex: 1, minWidth: '120px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--accent-orange)', fontWeight: '700' }}>{investAction === 'buy' ? '總額含息費(USD)' : '賣出總得(USD)'}</label>
                    <input type="number" className="glass-input" style={{ borderColor: 'var(--accent-orange)' }} value={usTotalUsd} onChange={e => {
                      setUsTotalUsd(e.target.value);
                      if (settleCurrency === 'TWD') setInvestAmount(Math.round(Number(e.target.value) * Number(usFxRate)).toString());
                    }} placeholder="依元大輸入" />
                  </div>
                  {/* ★ Only show exchange rate when TWD settlement is selected (USD settlement doesn't need it) */}
                  {settleCurrency === 'TWD' && (
                    <div style={{ flex: 1, minWidth: '80px' }}>
                      <label style={{ fontSize: '0.78rem', color: 'var(--accent-orange)', fontWeight: '700' }}>成交匯率</label>
                      <input type="number" className="glass-input" style={{ borderColor: 'var(--accent-orange)' }} value={usFxRate} onChange={e => {
                        setUsFxRate(e.target.value);
                        setInvestAmount(Math.round(Number(usTotalUsd) * Number(e.target.value)).toString());
                      }} placeholder="31.5" />
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>成交單價 (TWD)</label>
                    <input type="number" className="glass-input" value={stockPrice} onChange={e => setStockPrice(e.target.value)} placeholder="輸入單價" />
                  </div>
                </div>
              )}
            </div>
          )}

          {investAction === 'day_trade' && (
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight:'600' }}>當沖結果</label>
              <SegmentedControl options={[{ label: '📈 賺錢', value: 'profit' }, { label: '📉 賠錢', value: 'loss' }]} value={dayTradeResult} onChange={setDayTradeResult} />
            </div>
          )}

          {/* ★ Show TWD amount field: always for non-US, for US only when TWD settlement, or for day_trade */}
          {(investType !== 'stock' || !stockMarket || stockMarket === 'TW' || (stockMarket === 'US' && settleCurrency === 'TWD') || investAction === 'day_trade') && (
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <span>{investAction === 'buy' ? '最終交割總額 (台幣)' : investAction === 'sell' ? '最終拿回現金 (台幣)' : '結算淨差額 (台幣)'}</span>
              </label>
              <input type="number" inputMode="numeric" className="glass-input" style={{ fontSize: '1.15rem', fontWeight: '700', color: 'var(--text-primary)' }} value={investAmount} onChange={(e) => setInvestAmount(e.target.value)} placeholder="0" />
            </div>
          )}

          {investAction === 'sell' && stockMarket === 'TW' && (
            <div style={{ marginBottom: '15px', padding: '12px', background: 'rgba(255,204,0,0.06)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--accent-yellow)' }}>
              <label style={{ color: 'var(--accent-orange)', fontWeight: '700' }}>⚠️ 這批賣掉的資產，當初買入的「本金(台幣)」是多少？</label>
              <input type="number" inputMode="numeric" className="glass-input" style={{ margin: '5px 0', border: '1px solid var(--accent-yellow)' }} value={investPrincipal} onChange={(e) => setInvestPrincipal(e.target.value)} placeholder="請輸入扣除本金" />
            </div>
          )}

          {investAction === 'sell' && stockMarket === 'US' && (
            <div style={{ marginBottom: '15px', padding: '12px', background: 'rgba(255,204,0,0.06)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--accent-yellow)' }}>
              <label style={{ color: 'var(--accent-orange)', fontWeight: '700', fontSize: '0.92rem' }}>⚠️ 賣出美股成本計算</label>
              <div style={{ marginTop: '8px' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>元大顯示的「美金持有成本」<span style={{ color: 'var(--accent-red)' }}>(必填計算獲利)</span></label>
                <input type="number" className="glass-input" style={{ margin: '5px 0', borderColor: 'var(--accent-yellow)' }} value={usInvestPrincipalUsd} onChange={(e) => setUsInvestPrincipalUsd(e.target.value)} placeholder="例: 800" />
              </div>
              {settleCurrency !== 'USD' ? (
                <div style={{ marginTop: '8px' }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>這批股票當初投入的「大約台幣本金」<br /><span style={{ fontSize: '0.7rem' }}>(用於精準扣除系統帳面總投資額)</span></label>
                  <input type="number" className="glass-input" style={{ margin: '5px 0', borderColor: 'var(--accent-yellow)' }} value={investPrincipal} onChange={(e) => setInvestPrincipal(e.target.value)} placeholder="例: 25200" />
                </div>
              ) : (
                <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-tertiary)', background: 'rgba(255,255,255,0.4)', padding: '6px', borderRadius: '4px' }}>
                  💡 美金交割模式下，系統會直接依當前匯率自動換算並扣除台幣帳面本金，無需手動輸入。
                </div>
              )}
            </div>
          )}

          <div style={{display:'flex', gap:'6px', marginBottom:'15px'}}>
            <button className="glass-btn" style={{flex:1, fontSize:'0.88rem'}} onClick={handleAddInvestCart}>
              ➕ 暫存此筆
            </button>
            {investCart.length > 0 && <button className="glass-btn glass-btn-danger" style={{padding:'8px 12px', fontSize:'0.88rem'}} onClick={()=>setInvestCart([])}>🗑️ 清空</button>}
          </div>

          {investCart.length > 0 && (
             <div style={{background:'rgba(88,86,214,0.05)', padding:'12px', borderRadius:'var(--radius-sm)', marginBottom:'15px', border:'1px solid rgba(88,86,214,0.12)', animation:'slideDown 0.3s ease-out'}}>
                 <div style={{fontSize:'0.84rem', color:'var(--text-secondary)', marginBottom:'8px', fontWeight:'600'}}>🛒 本次批次明細 ({investCart.length}筆)：</div>
                 {investCart.map(item => (
                     <div key={item.id} style={{display:'flex', justifyContent:'space-between', fontSize:'0.9rem', marginBottom:'6px', borderBottom:'0.5px solid rgba(0,0,0,0.04)', paddingBottom:'4px'}}>
                         <span style={{color:'var(--text-primary)'}}>
                           <span style={{background:'rgba(120,120,128,0.08)', padding:'2px 6px', borderRadius:'6px', fontSize:'0.73rem', marginRight:'5px', fontWeight:'500'}}>
                             {item.investAction === 'buy' ? '買入' : item.investAction === 'sell' ? '賣出' : '當沖'}
                           </span>
                           <span style={{fontSize:'0.75rem', color:'var(--accent-indigo)', marginRight:'5px', fontWeight:'600'}}>
                             [{item.investAccount === 'jointCash' ? '🏫 共同' : (item.investAccount === 'userA' ? '🐶 恆恆' : '🐕 得得')}]
                           </span>
                           {item.stockSymbol || { stock: '股票', fund: '基金', deposit: '定存', other: '其他' }[item.investType]}
                         </span>
                         <span style={{fontWeight:'500'}}>
                           {formatMoney(item.investAmount)} {item.investAction === 'sell' ? '(收回)' : '(支出)'}
                           <button onClick={()=>setInvestCart(investCart.filter(i => i.id !== item.id))} style={{border:'none', background:'none', color:'var(--accent-red)', marginLeft:'5px', cursor:'pointer', fontSize:'0.85rem'}}>✖</button>
                         </span>
                     </div>
                 ))}
             </div>
          )}

          <button className="glass-btn glass-btn-cta" style={{ width: '100%', fontWeight: '700' }} onClick={handleInvestSubmit}>
            ✅ 確認批次送出 ({investCart.length} 筆)
          </button>
        </div>
      )}

      {activeTab === 'exchange' && (
        <div className="glass-card card-animate">
          <h3 style={{ marginBottom: '15px', marginTop: 0, fontWeight:'700' }}>💱 外幣換匯中心</h3>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight:'600' }}>操作帳戶</label>
            <SegmentedControl options={[{ label: '🏫 共同', value: 'jointCash' }, { label: '🐶 恆恆', value: 'userA' }, { label: '🐕 得得', value: 'userB' }]} value={exchangeSource} onChange={setExchangeSource} />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight:'600' }}>換匯方向</label>
            <SegmentedControl options={[{ label: '🇹🇼 台幣 ➔ 🇺🇸 美金', value: 'TWD_TO_USD' }, { label: '🇺🇸 美金 ➔ 🇹🇼 台幣', value: 'USD_TO_TWD' }]} value={exchangeDir} onChange={setExchangeDir} />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight:'600' }}>台幣總額</label>
              <input type="number" className="glass-input" value={exchangeTwd} onChange={e => setExchangeTwd(e.target.value)} placeholder="例: 31500" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight:'600' }}>美金總額 (USD)</label>
              <input type="number" className="glass-input" value={exchangeUsd} onChange={e => setExchangeUsd(e.target.value)} placeholder="例: 1000" />
            </div>
          </div>

          <button className="glass-btn glass-btn-cta" style={{ width: '100%', fontWeight: '700' }} onClick={handleExchange}>確認換匯</button>
        </div>
      )}

      {activeTab === 'calibrate' && (
        <div className="glass-card card-animate">
          <h3 style={{ marginBottom: '15px', marginTop: 0, fontWeight:'700' }}>⚖️ 餘額校正回歸</h3>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '15px', lineHeight:'1.5' }}>用於修正手續費、匯差等造成的帳面微小落差，此操作<strong style={{ color: 'var(--accent-red)' }}>不會</strong>計入當月收支與預算。</p>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight:'600' }}>校正帳戶</label>
            <SegmentedControl options={[{ label: '🏫 共同', value: 'jointCash' }, { label: '🐶 恆恆', value: 'userA' }, { label: '🐕 得得', value: 'userB' }]} value={calibAccount} onChange={setCalibAccount} />
          </div>

          {calibAccount ? (
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
              <div style={{ flex: 1, padding: '12px', background: 'rgba(120,120,128,0.04)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight:'500' }}>目前台幣帳面</div>
                <div style={{ fontSize: '1.15rem', fontWeight: '700', color: 'var(--text-primary)', marginTop:'4px' }}>{formatMoney(assets[calibAccount] || 0)}</div>
              </div>
              <div style={{ flex: 1, padding: '12px', background: 'rgba(120,120,128,0.04)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight:'500' }}>目前美金帳面</div>
                <div style={{ fontSize: '1.15rem', fontWeight: '700', color: 'var(--text-primary)', marginTop:'4px' }}>${(assets[`${calibAccount}_usd`] || 0).toFixed(2)}</div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '18px', color: 'var(--text-tertiary)', fontSize: '0.88rem', marginBottom: '15px' }}>↑ 請先選擇要校正的帳戶</div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight:'600' }}>輸入實際台幣餘額<br /><span style={{ fontSize: '0.7rem', fontWeight:'400' }}>(留空代表不修改)</span></label>
              <input type="number" className="glass-input" style={{ marginTop: '4px' }} value={calibTwd} onChange={e => setCalibTwd(e.target.value)} placeholder={`例: ${assets[calibAccount] || 0}`} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight:'600' }}>輸入實際美金餘額<br /><span style={{ fontSize: '0.7rem', fontWeight:'400' }}>(留空代表不修改)</span></label>
              <input type="number" className="glass-input" style={{ marginTop: '4px' }} value={calibUsd} onChange={e => setCalibUsd(e.target.value)} placeholder={`例: ${(assets[`${calibAccount}_usd`] || 0).toFixed(2)}`} />
            </div>
          </div>

          <button className="glass-btn glass-btn-cta" style={{ width: '100%', fontWeight: '700' }} onClick={handleCalibrate}>確認校正</button>
        </div>
      )}

      {activeTab === 'transfer' && (
        <div className="glass-card card-animate"><h3 style={{ marginBottom: '15px', marginTop: 0, fontWeight:'700' }}>💸 上繳公庫</h3>
          <div style={{ marginBottom: '15px' }}><label style={{fontSize:'0.84rem', color:'var(--text-secondary)', fontWeight:'600'}}>來源</label><SegmentedControl options={[{ label: `恆恆🐶`, value: 'userA' }, { label: `得得🐕`, value: 'userB' }]} value={transSource} onChange={setTransSource} /></div>
          <div style={{ marginBottom: '15px' }}><label style={{fontSize:'0.84rem', color:'var(--text-secondary)', fontWeight:'600'}}>金額</label><input type="number" className="glass-input" value={transAmount} onChange={(e) => setTransAmount(e.target.value)} placeholder="0" /></div>
          <button className="glass-btn glass-btn-cta" style={{ width: '100%', fontWeight:'700' }} onClick={handleTransfer}>確認上繳</button>
        </div>
      )}

      {activeTab === 'income' && (
        <div className="glass-card card-animate"><h3 style={{ marginBottom: '15px', marginTop: 0, fontWeight:'700' }}>💰 一般收入</h3>
          <div style={{ marginBottom: '15px' }}><label style={{fontSize:'0.84rem', color:'var(--text-secondary)', fontWeight:'600'}}>戶頭</label><SegmentedControl options={[{ label: `恆恆🐶`, value: 'userA' }, { label: `得得🐕`, value: 'userB' }]} value={incomeUser} onChange={setIncomeUser} /></div>
          <div style={{ marginBottom: '15px' }}><label style={{fontSize:'0.84rem', color:'var(--text-secondary)', fontWeight:'600'}}>金額</label><input type="number" className="glass-input" value={incomeAmount} onChange={(e) => setIncomeAmount(e.target.value)} placeholder="輸入金額" /></div>
          <div style={{ marginBottom: '15px' }}><label style={{fontSize:'0.84rem', color:'var(--text-secondary)', fontWeight:'600'}}>備註</label><input type="text" className="glass-input" value={incomeNote} onChange={(e) => setIncomeNote(e.target.value)} placeholder="例如：3月薪水" /></div>
          <button className="glass-btn glass-btn-cta" style={{ width: '100%', fontWeight:'700' }} onClick={handleIncomeSubmit}>確認收入入帳</button>
        </div>
      )}

      <div style={{ marginTop: '36px', paddingTop: '20px', borderTop: '0.5px solid rgba(0,0,0,0.06)' }}>
        <h3 style={{ color: 'var(--text-secondary)', marginBottom: '15px', fontWeight:'700' }}>💾 資料管理</h3>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '10px' }}>
          <button className="glass-btn" style={{ flex: 1, fontSize: '0.88rem' }} onClick={handleExport}>📥 匯出</button>
          <button className="glass-btn" style={{ flex: 1, fontSize: '0.88rem' }} onClick={handleImportClick}>📤 匯入</button>
          <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".json" onChange={handleFileChange} />
        </div>
        <button onClick={handleManualBackup} disabled={isManualBackingUp} className="glass-btn glass-btn-cta" style={{ width: '100%', fontWeight: '700' }}>
          {isManualBackingUp ? '備份中...' : '☁️ 手動備份至雲端'}
        </button>
      </div>
    </div>
  );
};

export default AssetTransfer;