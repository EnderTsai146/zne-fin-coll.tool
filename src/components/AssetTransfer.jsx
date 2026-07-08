// src/components/AssetTransfer.jsx
import React, { useState, useRef, useEffect } from 'react';
import SegmentedControl from './SegmentedControl';
import { MY_GOOGLE_API_URL } from '../config';

const formatMoney = (num) => "$" + Math.round(Number(num)).toLocaleString();

const formatInputMoney = (valStr) => {
  if (valStr === '' || valStr === undefined || valStr === null) return '';
  const clean = valStr.toString().replace(/[^\d.]/g, '');
  const parts = clean.split('.');
  if (parts.length > 2) {
    parts[1] = parts.slice(1).join('');
  }
  const integerPart = parts[0] ? Number(parts[0]).toLocaleString() : '';
  const decimalPart = parts.length > 1 ? '.' + parts[1] : '';
  return `$${integerPart}${decimalPart}`;
};

const parseMoney = (valStr) => {
  if (!valStr) return 0;
  const clean = valStr.toString().replace(/[^\d.]/g, '');
  return Number(clean) || 0;
};

const AssetTransfer = ({ assets, onTransaction, setAssets, currentFxRate, customAlert, customConfirm }) => {
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
        } catch { setSearchResults([]); }
        setIsSearching(false);
      } else { setSearchResults([]); }
    }, 600);
    return () => clearTimeout(timer);
  }, [stockSymbol, showDropdown]);

  useEffect(() => {
    if (investType !== 'stock' || investAction === 'day_trade' || stockMarket === 'US') return;
    const p = parseMoney(stockPrice);
    const s = Number(stockShares) || 0;
    if (p === 0 || s === 0) return;
    const baseAmount = p * s;
    const fee = Math.max(20, Math.floor(baseAmount * 0.001425 * 0.6));
    if (investAction === 'buy') {
      setInvestAmount(Math.round(baseAmount + fee).toString());
    } else if (investAction === 'sell') {
      const tax = Math.floor(baseAmount * 0.003);
      setInvestAmount(Math.round(baseAmount - fee - tax).toString());
    }
  }, [stockPrice, stockShares, stockMarket, investAction, investType]);

  // Task 2: Real-time US Stocks Pre-fill & Calculations
  useEffect(() => {
    if (investType !== 'stock' || stockMarket !== 'US') return;
    const price = parseMoney(stockPrice);
    const shares = Number(stockShares) || 0;
    if (price <= 0 || shares <= 0) return;

    const computedTotalUsd = Number((price * shares).toFixed(2));
    setUsTotalUsd(formatInputMoney(computedTotalUsd.toString()));

    if (settleCurrency === 'TWD') {
      const rate = Number(usFxRate) || 0;
      if (rate > 0) {
        const computedTotalTWD = Math.round(computedTotalUsd * rate);
        setInvestAmount(formatInputMoney(computedTotalTWD.toString()));
      }
    }
  }, [stockPrice, stockShares, stockMarket, investType, settleCurrency, usFxRate]);

  // ★ 自動 FIFO 成本計算與預填引擎
  useEffect(() => {
    if (investAction !== 'sell' || investType !== 'stock' || !stockSymbol || !stockShares) {
      return;
    }
    const sellSharesNum = Number(stockShares) || 0;
    if (sellSharesNum <= 0) return;

    let finalSymbol = stockSymbol.toUpperCase().trim();
    if (stockMarket === 'TW' && finalSymbol && !finalSymbol.includes('.')) {
      finalSymbol += '.TW';
    }

    const isJoint = investAccount === 'jointCash';
    const currentHistoryFilter = isJoint ? '共同帳戶' : (investAccount === 'userA' ? '大狗狗' : '阿陞');
    
    // 1. 重建此帳戶的持股基準 lots (包含 currentStockHoldings 歸檔基底)
    const holdings = {};
    if (assets.currentStockHoldings) {
      Object.entries(assets.currentStockHoldings).forEach(([key, data]) => {
        let owner = '共同帳戶';
        let actualSym = key;
        if (key.includes('_')) {
          const parts = key.split('_');
          owner = parts[0];
          actualSym = parts.slice(1).join('_');
        }
        const ownerMatch = owner.replace(/🐶|🐕/g, '');
        if (data.market && currentHistoryFilter.includes(ownerMatch)) {
          holdings[actualSym] = {
            shares: data.shares || 0,
            market: data.market,
            lots: [{
              shares: data.shares || 0,
              costTwd: data.costTwd || 0,
              costUsd: data.costUsd || 0,
            }]
          };
        }
      });
    }

    // 2. 疊加未歸檔的歷史 buy / sell 交易明細
    const history = assets.monthlyExpenses || [];
    const sorted = [...history]
      .filter(r => !r.isDeleted && r.symbol && r.payer && r.payer.includes(currentHistoryFilter))
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.timestamp || '').localeCompare(b.timestamp || ''));

    sorted.forEach(r => {
      const sym = r.symbol;
      if (!holdings[sym]) {
        holdings[sym] = {
          shares: 0,
          market: r.market || 'TW',
          lots: [],
        };
      }
      const h = holdings[sym];
      if (r.market) h.market = r.market;

      if (r.type.includes('buy')) {
        const shares = Number(r.shares) || 0;
        const totalTwd = Number(r.total) || 0;
        const totalUsd = Number(r.usdAmount) || 0;
        h.lots.push({
          shares,
          costTwd: totalTwd,
          costUsd: totalUsd,
        });
        h.shares += shares;
      } else if (r.type.includes('sell')) {
        const sellShares = Number(r.shares) || 0;
        let remaining = sellShares;
        while (remaining > 0 && h.lots.length > 0) {
          const lot = h.lots[0];
          if (lot.shares <= remaining) {
            remaining -= lot.shares;
            h.lots.shift();
          } else {
            const fraction = remaining / lot.shares;
            lot.costTwd -= lot.costTwd * fraction;
            lot.costUsd -= lot.costUsd * fraction;
            lot.shares -= remaining;
            remaining = 0;
          }
        }
        h.shares -= sellShares;
      }
    });

    // 3. 計算本次賣出股數的 FIFO 成本
    const h = holdings[finalSymbol];
    if (h && h.shares > 0 && h.lots.length > 0) {
      let remainingToSell = sellSharesNum;
      let totalCostTwd = 0;
      let totalCostUsd = 0;
      
      const tempLots = h.lots.map(l => ({ ...l }));
      for (let i = 0; i < tempLots.length && remainingToSell > 0; i++) {
        const lot = tempLots[i];
        if (lot.shares <= remainingToSell) {
          totalCostTwd += lot.costTwd;
          totalCostUsd += lot.costUsd;
          remainingToSell -= lot.shares;
        } else {
          const fraction = remainingToSell / lot.shares;
          totalCostTwd += lot.costTwd * fraction;
          totalCostUsd += lot.costUsd * fraction;
          remainingToSell = 0;
        }
      }
      setInvestPrincipal(formatInputMoney(Math.round(totalCostTwd).toString()));
      if (stockMarket === 'US') {
        setUsInvestPrincipalUsd(formatInputMoney(Number(totalCostUsd.toFixed(2)).toString()));
      }
    } else {
      setInvestPrincipal('');
      setUsInvestPrincipalUsd('');
    }
  }, [stockSymbol, stockShares, investAccount, investAction, stockMarket, investType, assets.monthlyExpenses, assets.currentStockHoldings]);

  const getDeepCopy = (obj) => structuredClone(obj);

  const handleIncomeSubmit = async () => {
    if (!incomeUser) return await customAlert("請選擇戶頭！");
    const val = parseMoney(incomeAmount);
    if (val <= 0) return await customAlert("請輸入有效的正數金額");
    const userName = incomeUser === 'userA' ? '大狗狗🐕' : '阿陞🐶';
    if (!await customConfirm(`確定要記錄 ${userName} 收入 ${formatMoney(val)} 嗎？`)) return;

    let newAssets = getDeepCopy(assets);
    newAssets[incomeUser] += val;

    onTransaction(newAssets, { type: 'income', category: '個人收入', payer: userName, total: val, note: incomeNote.trim() || '一般收入', month: txDate.slice(0, 7), date: txDate });

    setIncomeAmount('');
    setIncomeNote('');
    setIncomeUser(null);
  };

  const handleTransfer = async () => {
    if (!transSource) return await customAlert("請選擇來源個人帳戶！");
    const val = parseMoney(transAmount);
    if (val <= 0) return await customAlert("請輸入有效的正數金額");
    if (assets[transSource] < val) return await customAlert("個人餘額不足以轉移上繳！");

    const userName = transSource === 'userA' ? '大狗狗🐕' : '阿陞🐶';
    if (!await customConfirm(`確定要將 ${userName} 的 ${formatMoney(val)} 上繳公庫（共同現金）嗎？`)) return;

    let newAssets = getDeepCopy(assets);
    newAssets[transSource] -= val;
    newAssets.jointCash += val;

    onTransaction(newAssets, { type: 'transfer', category: '資產劃撥', payer: userName, total: val, note: `轉移至 共同現金`, month: txDate.slice(0, 7), date: txDate });

    setTransAmount('');
    setTransSource(null);
  };

  const handleExchangeTwdChange = (val) => {
    setExchangeTwd(formatInputMoney(val));
    const cleanTwd = parseMoney(val);
    if (cleanTwd > 0 && currentFxRate > 0) {
      const computedUsd = cleanTwd / currentFxRate;
      setExchangeUsd(formatInputMoney(Number(computedUsd.toFixed(2)).toString()));
    } else if (cleanTwd === 0) {
      setExchangeUsd('');
    }
  };

  const handleExchangeUsdChange = (val) => {
    setExchangeUsd(formatInputMoney(val));
    const cleanUsd = parseMoney(val);
    if (cleanUsd > 0 && currentFxRate > 0) {
      const computedTwd = Math.round(cleanUsd * currentFxRate);
      setExchangeTwd(formatInputMoney(computedTwd.toString()));
    } else if (cleanUsd === 0) {
      setExchangeTwd('');
    }
  };

  const handleExchange = async () => {
    if (!exchangeSource) return await customAlert("請選擇換匯帳戶！");
    if (!exchangeDir) return await customAlert("請選擇換匯方向！");
    const twd = parseMoney(exchangeTwd);
    const usd = parseMoney(exchangeUsd);
    if (twd <= 0 || usd <= 0) return await customAlert("請輸入有效的台幣與美金金額");

    const accountName = exchangeSource === 'jointCash' ? '共同帳戶🏫' : (exchangeSource === 'userA' ? '大狗狗🐕' : '阿陞🐶');
    const isTwdToUsd = exchangeDir === 'TWD_TO_USD';

    if (isTwdToUsd) {
      if (assets[exchangeSource] < twd) return await customAlert("台幣餘額不足！");
    } else {
      const sourceUsdKey = `${exchangeSource}_usd`;
      if ((assets[sourceUsdKey] || 0) < usd) return await customAlert("美金餘額不足！");
    }

    if (!await customConfirm(`確定要在 ${accountName} 換匯嗎？\n${isTwdToUsd ? `台幣 -$${twd.toLocaleString()} ➔ 美金 +$${usd.toLocaleString()} USD` : `美金 -$${usd.toLocaleString()} USD ➔ 台幣 +$${twd.toLocaleString()}`}`)) return;

    let newAssets = getDeepCopy(assets);
    const usdKey = `${exchangeSource}_usd`;
    if (isTwdToUsd) {
      newAssets[exchangeSource] -= twd;
      newAssets[usdKey] = (newAssets[usdKey] || 0) + usd;
      onTransaction(newAssets, { type: 'exchange', category: '貨幣換匯', payer: accountName, accountKey: exchangeSource, total: twd, usdAmount: usd, note: `台幣換美金 (買入 $${usd} USD)`, date: txDate, month: txDate.slice(0, 7) });
    } else {
      newAssets[exchangeSource] += twd;
      newAssets[usdKey] = (newAssets[usdKey] || 0) - usd;
      onTransaction(newAssets, { type: 'exchange', category: '貨幣換匯', payer: accountName, accountKey: exchangeSource, total: twd, usdAmount: usd, note: `美金換台幣 (賣出 $${usd} USD)`, date: txDate, month: txDate.slice(0, 7) });
    }

    setExchangeTwd('');
    setExchangeUsd('');
    setExchangeSource(null);
    setExchangeDir(null);
  };

  const handleCalibrate = async () => {
    if (!calibAccount) return await customAlert("請選擇帳戶！");
    if (!calibTwd && !calibUsd) return await customAlert("請輸入至少一項要校正的值（台幣或美金）");

    const targetTwd = calibTwd ? parseMoney(calibTwd) : assets[calibAccount];
    const targetUsd = calibUsd ? parseMoney(calibUsd) : (assets[`${calibAccount}_usd`] || 0);

    const accountName = calibAccount === 'jointCash' ? '共同帳戶🏫' : (calibAccount === 'userA' ? '大狗狗🐕' : '阿陞🐶');
    if (!await customConfirm(`確定要把 ${accountName} 校正為：\n台幣：${formatMoney(targetTwd)}\n美金：$${targetUsd.toLocaleString()} USD 嗎？`)) return;

    let newAssets = getDeepCopy(assets);
    const diffTwd = targetTwd - (assets[calibAccount] || 0);
    const diffUsd = targetUsd - (assets[`${calibAccount}_usd`] || 0);

    newAssets[calibAccount] = targetTwd;
    newAssets[`${calibAccount}_usd`] = targetUsd;

    onTransaction(newAssets, {
      type: 'calibrate', category: '餘額校正', payer: accountName, accountKey: calibAccount,
      total: Math.abs(diffTwd), usdAmount: Math.abs(diffUsd),
      twdDiff: diffTwd, usdDiff: diffUsd,
      note: `帳戶校正 (台幣異動: ${diffTwd >= 0 ? '+' : ''}${formatMoney(diffTwd)}，美金異動: ${diffUsd >= 0 ? '+' : ''}$${diffUsd.toFixed(2)} USD)`,
      date: txDate, month: txDate.slice(0, 7)
    });

    setCalibTwd('');
    setCalibUsd('');
    setCalibAccount(null);
  };

  const handleAddInvestCart = async () => {
    if (!investAccount) return await customAlert("請選擇帳戶！");
    if (!investAction) return await customAlert("請選擇動作！");
    if (!investType) return await customAlert("請選擇標的類型！");

    let val = parseMoney(investAmount);
    let usTotalUsdNum = parseMoney(usTotalUsd);

    if (investAction === 'day_trade' && !dayTradeResult) {
      return await customAlert("當沖請選擇 賺錢 或是 賠錢！");
    }

    if (investType === 'stock') {
      if (!stockSymbol) return await customAlert("請輸入股票代號！");
      if (!stockShares || Number(stockShares) <= 0) return await customAlert("請輸入有效的交易股數！");
      if (stockMarket === 'US' && !settleCurrency) return await customAlert("請選擇交割幣種！");

      if (stockMarket === 'US') {
        if (settleCurrency === 'USD') {
          val = 0;
          if (usTotalUsdNum <= 0) return await customAlert("美金交割模式下，請輸入有效的美金總額！");
        } else {
          if (val <= 0) return await customAlert("台幣交割模式下，請輸入有效的最終台幣交割額！");
        }
      } else {
        if (val <= 0) return await customAlert("台股交易請輸入有效的最終交割額！");
      }
    } else {
      if (val <= 0) return await customAlert("請輸入有效的總金額！");
    }

    // 購物車餘額分段預檢 (Early cart checks)
    const existingCartSameSource = investCart
      .filter(item => item.investAccount === investAccount)
      .reduce((sum, item) => sum + (item.investAction === 'buy' ? item.investAmount : 0), 0);
    const existingCartSameSourceUsd = investCart
      .filter(item => item.investAccount === investAccount)
      .reduce((sum, item) => sum + (item.investAction === 'buy' ? item.usTotalUsd : 0), 0);

    const proposedTwdTotal = existingCartSameSource + (investAction === 'buy' ? val : 0);
    const currentBalance = assets[investAccount] || 0;
    if (investAction === 'buy' && currentBalance < proposedTwdTotal) {
      const payerName = investAccount === 'jointCash' ? '共同現金🏫' : (investAccount === 'userA' ? '大狗狗🐕' : '阿陞🐶');
      return await customAlert(`❌ 餘額不足！當前 ${payerName} 餘額為 ${formatMoney(currentBalance)}，暫存購物車已累計 ${formatMoney(existingCartSameSource)}，無法再加入 ${formatMoney(val)}`);
    }

    if (investAction === 'buy' && stockMarket === 'US' && settleCurrency === 'USD') {
      const usdBalance = assets[`${investAccount}_usd`] || 0;
      const proposedUsdTotal = existingCartSameSourceUsd + usTotalUsdNum;
      if (usdBalance < proposedUsdTotal) {
        const payerName = investAccount === 'jointCash' ? '共同帳戶🏫' : (investAccount === 'userA' ? '大狗狗🐕' : '阿陞🐶');
        return await customAlert(`❌ 美金餘額不足！當前 ${payerName} 美金餘額為 $${usdBalance} USD，暫存購物車已累計 $${existingCartSameSourceUsd} USD，無法再加入 $${usTotalUsdNum} USD`);
      }
    }

    const payload = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      investAccount, investAction, investType, investAmount: val,
      stockMarket, settleCurrency, usTotalUsd: usTotalUsdNum,
      stockSymbol: stockSymbol.toUpperCase().trim(),
      stockShares: Number(stockShares) || 0,
      stockPrice: parseMoney(stockPrice),
      usFxRate: Number(usFxRate) || 0,
      investPrincipal: parseMoney(investPrincipal),
      usInvestPrincipalUsd: parseMoney(usInvestPrincipalUsd),
      dayTradeResult
    };

    setInvestCart([...investCart, payload]);

    setStockSymbol('');
    setStockShares('');
    setStockPrice('');
    setUsTotalUsd('');
    setInvestAmount('');
    setInvestPrincipal('');
    setUsInvestPrincipalUsd('');
    setDayTradeResult(null);
  };

  const handleInvestSubmit = async () => {
    let finalItems = [...investCart];
    if (investAction && (investAmount || usTotalUsd)) {
      await customAlert("請先點擊「➕ 暫存此筆」將目前的輸入加入暫存明細，或將下方輸入清除後再送出批次交易！");
      return;
    }
    if (finalItems.length === 0) {
      return await customAlert("暫存明細中沒有任何交易！請先輸入並點擊「➕ 暫存此筆」。");
    }

    if (!await customConfirm(`確定要送出這 ${finalItems.length} 筆投資批次交易嗎？`)) return;

    let newAssets = getDeepCopy(assets);
    let transactionRecords = [];

    for (const item of finalItems) {
      const isJoint = item.investAccount === 'jointCash';
      const payerName = isJoint ? '共同帳戶' : (item.investAccount === 'userA' ? '大狗狗🐕' : '阿陞🐶');
      const usdKey = `${item.investAccount}_usd`;
      const invTypeKey = item.investType === 'fund' ? 'fund' : (item.investType === 'deposit' ? 'deposit' : (item.investType === 'other' ? 'other' : 'stock'));

      let record = {
        date: txDate, month: txDate.slice(0, 7),
        type: `${item.investAccount === 'jointCash' ? 'joint' : 'personal'}_invest_${item.investAction}`,
        payer: payerName,
        accountKey: item.investAccount,
        investType: invTypeKey,
        principal: item.investPrincipal || 0,
        total: item.investAmount,
        usdAmount: item.usTotalUsd || 0,
        shares: item.stockShares || 0,
        price: item.stockPrice || 0,
        market: item.stockMarket || 'TW',
        symbol: item.stockSymbol || '',
        settleCurrency: item.settleCurrency || 'TWD',
        category: '投資理財'
      };

      if (item.investAction === 'buy') {
        if (item.stockMarket === 'US' && item.settleCurrency === 'USD') {
          newAssets[usdKey] -= item.usTotalUsd;
          const converted = Math.round(item.usTotalUsd * (currentFxRate || 31.5));
          if (isJoint) {
            newAssets.jointInvestments.stock += converted;
          } else {
            if (!newAssets.userInvestments) newAssets.userInvestments = { userA: {}, userB: {} };
            if (!newAssets.userInvestments[item.investAccount]) newAssets.userInvestments[item.investAccount] = {};
            newAssets.userInvestments[item.investAccount].stock = (newAssets.userInvestments[item.investAccount].stock || 0) + converted;
          }
          record.total = converted;
          record.note = `美股買入 (代碼: ${item.stockSymbol}, ${item.stockShares}股 @ $${item.stockPrice} USD, 美金交割)`;
        } else if (item.stockMarket === 'US' && item.settleCurrency === 'TWD') {
          newAssets[item.investAccount] -= item.investAmount;
          if (isJoint) {
            newAssets.jointInvestments.stock += item.investAmount;
          } else {
            if (!newAssets.userInvestments) newAssets.userInvestments = { userA: {}, userB: {} };
            if (!newAssets.userInvestments[item.investAccount]) newAssets.userInvestments[item.investAccount] = {};
            newAssets.userInvestments[item.investAccount].stock = (newAssets.userInvestments[item.investAccount].stock || 0) + item.investAmount;
          }
          record.note = `美股買入 (代碼: ${item.stockSymbol}, ${item.stockShares}股 @ $${item.stockPrice} USD, 台幣交割, 匯率: ${item.usFxRate})`;
        } else {
          newAssets[item.investAccount] -= item.investAmount;
          if (isJoint) {
            newAssets.jointInvestments[invTypeKey] += item.investAmount;
          } else {
            if (!newAssets.userInvestments) newAssets.userInvestments = { userA: {}, userB: {} };
            if (!newAssets.userInvestments[item.investAccount]) newAssets.userInvestments[item.investAccount] = {};
            newAssets.userInvestments[item.investAccount][invTypeKey] = (newAssets.userInvestments[item.investAccount][invTypeKey] || 0) + item.investAmount;
          }
          record.note = `${item.investType === 'fund' ? '基金' : item.investType === 'deposit' ? '定存' : '台股'}買入 (${item.stockSymbol ? `代碼: ${item.stockSymbol}, ` : ''}${item.stockShares ? `${item.stockShares}股 @ $${item.stockPrice}, ` : ''}台幣支出)`;
        }
      } else if (item.investAction === 'sell') {
        let principalTwd = item.investPrincipal;
        if (item.stockMarket === 'US' && item.settleCurrency === 'USD') {
          newAssets[usdKey] += item.usTotalUsd;
          principalTwd = Math.round(item.usInvestPrincipalUsd * (currentFxRate || 31.5));
          if (isJoint) {
            newAssets.jointInvestments.stock -= principalTwd;
          } else {
            if (!newAssets.userInvestments) newAssets.userInvestments = { userA: {}, userB: {} };
            if (!newAssets.userInvestments[item.investAccount]) newAssets.userInvestments[item.investAccount] = {};
            newAssets.userInvestments[item.investAccount].stock = (newAssets.userInvestments[item.investAccount].stock || 0) - principalTwd;
          }
          record.total = Math.round(item.usTotalUsd * (currentFxRate || 31.5));
          record.note = `美股賣出 (代碼: ${item.stockSymbol}, ${item.stockShares}股 @ $${item.stockPrice} USD, 美金交割, 實現本金 $${item.usInvestPrincipalUsd} USD)`;
        } else if (item.stockMarket === 'US' && item.settleCurrency === 'TWD') {
          newAssets[item.investAccount] += item.investAmount;
          if (isJoint) {
            newAssets.jointInvestments.stock -= principalTwd;
          } else {
            if (!newAssets.userInvestments) newAssets.userInvestments = { userA: {}, userB: {} };
            if (!newAssets.userInvestments[item.investAccount]) newAssets.userInvestments[item.investAccount] = {};
            newAssets.userInvestments[item.investAccount].stock = (newAssets.userInvestments[item.investAccount].stock || 0) - principalTwd;
          }
          record.note = `美股賣出 (代碼: ${item.stockSymbol}, ${item.stockShares}股 @ $${item.stockPrice} USD, 台幣交割, 匯率: ${item.usFxRate}, 實現本金 $${principalTwd})`;
        } else {
          newAssets[item.investAccount] += item.investAmount;
          if (isJoint) {
            newAssets.jointInvestments[invTypeKey] -= principalTwd;
          } else {
            if (!newAssets.userInvestments) newAssets.userInvestments = { userA: {}, userB: {} };
            if (!newAssets.userInvestments[item.investAccount]) newAssets.userInvestments[item.investAccount] = {};
            newAssets.userInvestments[item.investAccount][invTypeKey] = (newAssets.userInvestments[item.investAccount][invTypeKey] || 0) - principalTwd;
          }
          record.note = `${item.investType === 'fund' ? '基金' : item.investType === 'deposit' ? '定存' : '台股'}賣出 (${item.stockSymbol ? `代碼: ${item.stockSymbol}, ` : ''}拿回台幣 ${item.investAmount}, 原本金 ${principalTwd})`;
        }
      } else if (item.investAction === 'day_trade') {
        const isProfit = item.dayTradeResult === 'profit';
        if (isProfit) newAssets[item.investAccount] += item.investAmount;
        else newAssets[item.investAccount] -= item.investAmount;
        record.note = `當沖結算 (標的: ${item.stockSymbol}, 股數: ${item.stockShares}, 結果: ${isProfit ? '獲利' : '虧損'} ${formatMoney(item.investAmount)})`;
      }

      transactionRecords.push(record);
    }

    onTransaction(newAssets, transactionRecords);
    setInvestCart([]);
  };

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(assets, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `potato_financial_backup_${txDate}.json`);
    dlAnchorElem.click();
  };

  const handleImportClick = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const imported = JSON.parse(evt.target.result);
        if (!imported.userA || !imported.userB || !imported.jointCash) {
          return await customAlert("❌ JSON 格式不正確，缺乏必要帳務欄位！");
        }
        if (!await customConfirm("⚠️ 警告：匯入此備份檔案將會覆蓋您當前所有的帳戶餘額與流水帳！確定要繼續嗎？")) return;
        
        // Preserve budgets if the imported backup does not have a budgets field
        if (!imported.budgets && assets.budgets) {
          imported.budgets = assets.budgets;
        }

        setAssets(imported);
        await customAlert("✅ 備份資料覆蓋匯入成功！");
      } catch (err) {
        await customAlert("❌ 讀取檔案失敗：" + err.message);
      }
    };
    reader.readAsText(file);
  };

  const [isManualBackingUp, setIsManualBackingUp] = useState(false);
  const handleManualBackup = async () => {
    setIsManualBackingUp(true);
    try {
      const response = await fetch(MY_GOOGLE_API_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assets)
      });
      console.log("手動備份請求已送出:", response);
      await customAlert("☁️ 備份指令已成功傳送至 Google Apps Script 雲端處理！");
    } catch (err) {
      await customAlert("❌ 雲端備份傳送失敗：" + err.message);
    }
    setIsManualBackingUp(false);
  };

  const existingCartTotal = investCart
    .filter(item => item.investAccount === investAccount)
    .reduce((sum, item) => sum + (item.investAction === 'buy' ? item.investAmount : 0), 0);

  return (
    <div className="page-transition-enter">
      <h1 className="page-title">資產轉帳/投資</h1>

      <div
        className="glass-card"
        style={{
          marginBottom: '18px',
          padding: '6px',
          overflow: 'hidden'
        }}
      >
        <div
          className="segmented-control-container"
          style={{
            display: 'flex',
            gap: '8px',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            WebkitOverflowScrolling: 'touch',
            width: '100%'
          }}
        >
          <button className={`glass-btn ${activeTab === 'invest' ? '' : 'inactive'}`} onClick={() => setActiveTab('invest')} style={{ flex: '0 0 auto', whiteSpace: 'nowrap', padding: '9px 16px', fontSize: '0.88rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
            投資
            {investCart.length > 0 && (
              <span style={{
                marginLeft: '6px',
                background: 'var(--accent-red)',
                color: '#ffffff',
                fontSize: '0.72rem',
                padding: '2px 6px',
                borderRadius: 'var(--radius-pill)',
                fontWeight: '700',
                display: 'inline-block',
                lineHeight: 1
              }}>
                {investCart.length}
              </span>
            )}
          </button>
          <button className={`glass-btn ${activeTab === 'exchange' ? '' : 'inactive'}`} onClick={() => setActiveTab('exchange')} style={{ flex: '0 0 auto', whiteSpace: 'nowrap', padding: '9px 16px', fontSize: '0.88rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
              <polyline points="16 3 21 3 21 8" />
              <line x1="4" y1="20" x2="21" y2="3" />
              <polyline points="8 21 3 21 3 16" />
            </svg>
            換匯
          </button>
          <button className={`glass-btn ${activeTab === 'transfer' ? '' : 'inactive'}`} onClick={() => setActiveTab('transfer')} style={{ flex: '0 0 auto', whiteSpace: 'nowrap', padding: '9px 16px', fontSize: '0.88rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
              <line x1="12" y1="5" x2="12" y2="19" />
              <polyline points="19 12 12 19 5 12" />
            </svg>
            上繳公庫
          </button>
          <button className={`glass-btn ${activeTab === 'income' ? '' : 'inactive'}`} onClick={() => setActiveTab('income')} style={{ flex: '0 0 auto', whiteSpace: 'nowrap', padding: '9px 16px', fontSize: '0.88rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            收入
          </button>
          <button className={`glass-btn ${activeTab === 'calibrate' ? '' : 'inactive'}`} onClick={() => setActiveTab('calibrate')} style={{ flex: '0 0 auto', whiteSpace: 'nowrap', padding: '9px 16px', fontSize: '0.88rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
              <path d="M12 2v20M17 5H9.5A3.5 3.5 0 0 0 6 8.5C6 11 9 12 9 12M2 12h20M5 19h14" />
            </svg>
            校正
          </button>
        </div>
      </div>



      {/* 📈 投資面板 */}
      {activeTab === 'invest' && (
        <div key="invest-panel" className="glass-card card-animate page-transition-enter" style={{ padding: '20px 18px' }}>
          <h3 style={{ marginBottom: '20px', marginTop: 0, fontWeight: '800', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-indigo)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
            投資操作中心
          </h3>

          <div className="inset-group-card">
            <div className="inset-group-row">
              <span className="inset-group-label">📅 交易日期</span>
              <span className="inset-group-value">
                <input type="date" style={{ background: 'none', border: 'none', color: '#fff', textAlign: 'right', outline: 'none', fontFamily: 'var(--font-family)' }} value={txDate} onChange={(e) => setTxDate(e.target.value)} />
              </span>
            </div>
            <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>操作帳戶</span>
              <SegmentedControl options={[{ label: '大狗狗 🐕', value: 'userA' }, { label: '共同帳戶 🏫', value: 'jointCash' }, { label: '阿陞 🐶', value: 'userB' }]} value={investAccount} onChange={(val) => { setInvestAccount(val); if (val === 'jointCash' && investAction === 'day_trade') setInvestAction('buy'); }} />
            </div>

            <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>動作</span>
              <SegmentedControl options={[{ label: '📥 買入', value: 'buy' }, { label: '📤 賣出', value: 'sell' }, { label: '⚡ 當沖', value: 'day_trade' }]} value={investAction} onChange={setInvestAction} disabledValue={investAccount === 'jointCash' ? 'day_trade' : null} />
            </div>

            <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>標的類型</span>
              <SegmentedControl options={[{ label: '股票', value: 'stock' }, { label: '基金', value: 'fund' }, { label: '定存', value: 'deposit' }, { label: '其他', value: 'other' }]} value={investType} onChange={setInvestType} />
            </div>

            {investType === 'stock' && (
              <>
                <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                  <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>市場</span>
                  <SegmentedControl options={[{ label: '🇹🇼 台股', value: 'TW' }, { label: '🇺🇸 美股複委託', value: 'US' }]} value={stockMarket} onChange={setStockMarket} />
                </div>

                {stockMarket === 'US' && (
                  <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                    <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>交割帳戶</span>
                    <SegmentedControl options={[{ label: '台幣帳戶', value: 'TWD' }, { label: '美金帳戶', value: 'USD' }]} value={settleCurrency} onChange={setSettleCurrency} />
                  </div>
                )}

                <div className="inset-group-row" style={{ position: 'relative' }}>
                  <span className="inset-group-label">股票代號/名稱</span>
                  <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                    <input type="text" className="inset-group-input" value={stockSymbol} onChange={e => { setStockSymbol(e.target.value.toUpperCase()); setShowDropdown(true); }} onFocus={() => setShowDropdown(true)} onBlur={() => setTimeout(() => setShowDropdown(false), 200)} placeholder="例: NVDA" />
                    {showDropdown && (searchResults.length > 0 || isSearching) && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'rgba(28,28,30,0.96)', backdropFilter: 'blur(20px)', zIndex: 100, borderRadius: '12px', boxShadow: '0 8px 25px rgba(0,0,0,0.3)', overflow: 'hidden', marginTop: '4px', border: '1px solid rgba(255,255,255,0.12)' }}>
                        {isSearching ? (
                          <div style={{ padding: '12px', fontSize: '0.8rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>尋找中...</div>
                        ) : searchResults.map((item, idx) => (
                          <div key={idx} onClick={() => { setStockSymbol(item.symbol); setShowDropdown(false); }} style={{ padding: '10px 14px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <strong style={{ color: 'var(--accent-blue)', fontSize: '0.86rem' }}>{item.symbol}</strong>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.73rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{item.shortname || item.longname}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </span>
                </div>

                <div className="inset-group-row">
                  <span className="inset-group-label">交易股數</span>
                  <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                    <input type="text" inputMode="numeric" className="inset-group-input" value={stockShares} onChange={e => setStockShares(e.target.value.replace(/[^\d]/g, ''))} placeholder="例: 10" />
                  </span>
                </div>

                {stockMarket === 'US' ? (
                  <>
                    <div className="inset-group-row">
                      <span className="inset-group-label">單價 (USD)</span>
                      <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                        <input type="text" inputMode="decimal" className="inset-group-input" value={stockPrice} onChange={e => setStockPrice(formatInputMoney(e.target.value))} placeholder="$0.00" />
                      </span>
                    </div>

                    <div className="inset-group-row" style={{ background: 'rgba(255,149,0,0.02)' }}>
                      <span className="inset-group-label" style={{ color: 'var(--accent-orange)' }}>預估/實際總額 (USD)</span>
                      <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                        <input type="text" inputMode="decimal" className="inset-group-input" style={{ color: 'var(--accent-orange)', fontWeight: '700' }} value={usTotalUsd} onChange={e => setUsTotalUsd(formatInputMoney(e.target.value))} placeholder="$0" />
                      </span>
                    </div>

                    {settleCurrency === 'TWD' && (
                      <div className="inset-group-row" style={{ background: 'rgba(255,149,0,0.02)' }}>
                        <span className="inset-group-label" style={{ color: 'var(--accent-orange)' }}>成交匯率</span>
                        <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                          <input type="text" inputMode="decimal" className="inset-group-input" style={{ color: 'var(--accent-orange)', fontWeight: '700' }} value={usFxRate} onChange={e => setUsFxRate(e.target.value.replace(/[^\d.]/g, ''))} placeholder="31.5" />
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="inset-group-row">
                    <span className="inset-group-label">成交單價 (TWD)</span>
                    <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                      <input type="text" inputMode="decimal" className="inset-group-input" value={stockPrice} onChange={e => setStockPrice(formatInputMoney(e.target.value))} placeholder="$0" />
                    </span>
                  </div>
                )}
              </>
            )}

            {investAction === 'day_trade' && (
              <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>當沖結果</span>
                <SegmentedControl options={[{ label: '📈 賺錢', value: 'profit' }, { label: '📉 賠錢', value: 'loss' }]} value={dayTradeResult} onChange={setDayTradeResult} />
              </div>
            )}

            {(investType !== 'stock' || !stockMarket || stockMarket === 'TW' || (stockMarket === 'US' && settleCurrency === 'TWD') || investAction === 'day_trade') && (
              <div className="inset-group-row" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <span className="inset-group-label" style={{ fontWeight: '700' }}>
                  {investAction === 'buy' ? '最終交割總額 (台幣)' : investAction === 'sell' ? '最終拿回現金 (台幣)' : '結算淨差額 (台幣)'}
                </span>
                <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                  <input type="text" inputMode="decimal" className="inset-group-input" style={{ fontSize: '1rem', fontWeight: '700' }} value={investAmount} onChange={(e) => setInvestAmount(formatInputMoney(e.target.value))} placeholder="$0" />
                </span>
              </div>
            )}

            {investAction === 'sell' && stockMarket === 'TW' && (
              <div className="inset-group-row" style={{ background: 'rgba(255,204,0,0.04)', flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                <span className="inset-group-label" style={{ color: 'var(--accent-orange)', fontWeight: '700', alignSelf: 'flex-start' }}>原本扣除本金 (台幣) - FIFO已預估</span>
                <input type="text" inputMode="numeric" className="inset-group-input" style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }} value={investPrincipal} onChange={(e) => setInvestPrincipal(formatInputMoney(e.target.value))} placeholder="$0" />
              </div>
            )}

            {investAction === 'sell' && stockMarket === 'US' && (
              <div style={{ background: 'rgba(255,204,0,0.04)', padding: '14px' }}>
                <span style={{ color: 'var(--accent-orange)', fontWeight: '700', fontSize: '0.84rem', display: 'block', marginBottom: '8px' }}>賣出美股成本計算 (台幣/美金本金已自動預填)</span>
                
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>美金持有成本 (USD)</label>
                  <input type="text" inputMode="decimal" className="glass-input" style={{ margin: 0 }} value={usInvestPrincipalUsd} onChange={(e) => setUsInvestPrincipalUsd(formatInputMoney(e.target.value))} placeholder="例: 800" />
                </div>
                {settleCurrency !== 'USD' ? (
                  <div>
                    <label style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>對應原始台幣本金 (TWD)</label>
                    <input type="text" inputMode="numeric" className="glass-input" style={{ margin: 0 }} value={investPrincipal} onChange={(e) => setInvestPrincipal(formatInputMoney(e.target.value))} placeholder="例: 25200" />
                  </div>
                ) : (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', background: 'rgba(255,255,255,0.04)', padding: '6px', borderRadius: '8px', marginTop: '6px' }}>
                    💡 美金交割模式下，系統會直接依匯率扣減台幣投資基準，無需手動調整。
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <button className="glass-btn" style={{ flex: 1, fontSize: '0.88rem', fontWeight: '600' }} onClick={handleAddInvestCart}>
              ➕ 暫存此筆
            </button>
            {investCart.length > 0 && <button className="glass-btn glass-btn-danger" style={{ padding: '8px 16px', fontSize: '0.88rem' }} onClick={() => setInvestCart([])}>清空暫存</button>}
          </div>

          {investCart.length > 0 && (
            <div style={{ background: 'rgba(88,86,214,0.05)', padding: '16px', borderRadius: '14px', marginBottom: '20px', border: '1px solid rgba(88,86,214,0.15)', animation: 'slideDown 0.3s ease-out' }}>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '12px', fontWeight: '700' }}>🛒 本次批次明細 ({investCart.length}筆)：</div>
              {investCart.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.88rem', marginBottom: '8px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', paddingBottom: '6px', gap: '8px' }}>
                  <div style={{ color: 'var(--text-primary)', flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                    <span style={{ 
                      padding: '3px 8px', 
                      borderRadius: '6px', 
                      fontSize: '0.73rem', 
                      fontWeight: '700', 
                      whiteSpace: 'nowrap',
                      background: item.investAction === 'buy' ? 'rgba(0, 122, 255, 0.12)' : (item.investAction === 'sell' ? 'rgba(255, 149, 0, 0.12)' : 'rgba(175, 82, 222, 0.12)'),
                      color: item.investAction === 'buy' ? '#7fc0ff' : (item.investAction === 'sell' ? '#ffb94f' : '#dcb2ff')
                    }}>
                      {item.investAction === 'buy' ? '買入' : item.investAction === 'sell' ? '賣出' : '當沖'}
                    </span>
                    <span style={{ 
                      fontSize: '0.73rem', 
                      fontWeight: '700', 
                      whiteSpace: 'nowrap',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      background: item.investAccount === 'jointCash' ? 'rgba(255, 149, 0, 0.12)' : (item.investAccount === 'userA' ? 'rgba(255, 45, 87, 0.12)' : 'rgba(52, 199, 89, 0.15)'),
                      color: item.investAccount === 'jointCash' ? '#ffb94f' : (item.investAccount === 'userA' ? '#ff8da1' : '#8effa2')
                    }}>
                      {item.investAccount === 'jointCash' ? '共同' : (item.investAccount === 'userA' ? '大狗狗' : '阿陞')}
                    </span>
                    <span style={{ minWidth: 0, wordBreak: 'break-all' }}>
                      {item.stockSymbol || { stock: '股票', fund: '基金', deposit: '定存', other: '其他' }[item.investType]}
                    </span>
                  </div>
                  <div style={{ fontWeight: '600', flexShrink: 0, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{formatMoney(item.investAmount || Math.round(item.usTotalUsd * (currentFxRate || 31.5)))}</span>
                    <button onClick={() => setInvestCart(investCart.filter(i => i.id !== item.id))} style={{ border: 'none', background: 'none', color: 'var(--accent-red)', padding: '2px 6px', cursor: 'pointer', fontSize: '0.9rem' }}>✖</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button className="glass-btn glass-btn-cta" style={{ width: '100%', fontWeight: '700', padding: '14px', borderRadius: '14px' }} onClick={handleInvestSubmit}>
            確認批次送出 ({investCart.length} 筆)
          </button>
        </div>
      )}

      {/* 💱 換匯面板 */}
      {activeTab === 'exchange' && (
        <div key="exchange-panel" className="glass-card card-animate page-transition-enter" style={{ padding: '20px 18px' }}>
          <h3 style={{ marginBottom: '20px', marginTop: 0, fontWeight: '800', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 3 21 3 21 8" />
              <line x1="4" y1="20" x2="21" y2="3" />
              <polyline points="8 21 3 21 3 16" />
            </svg>
            外幣換匯中心
          </h3>

          <div className="inset-group-card">
            <div className="inset-group-row">
              <span className="inset-group-label">📅 交易日期</span>
              <span className="inset-group-value">
                <input type="date" style={{ background: 'none', border: 'none', color: '#fff', textAlign: 'right', outline: 'none', fontFamily: 'var(--font-family)' }} value={txDate} onChange={(e) => setTxDate(e.target.value)} />
              </span>
            </div>
            <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>操作帳戶</span>
              <SegmentedControl options={[{ label: '大狗狗 🐕', value: 'userA' }, { label: '共同帳戶 🏫', value: 'jointCash' }, { label: '阿陞 🐶', value: 'userB' }]} value={exchangeSource} onChange={setExchangeSource} />
            </div>

            <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>換匯方向</span>
              <SegmentedControl options={[{ label: '台幣 ➔ 美金', value: 'TWD_TO_USD' }, { label: '美金 ➔ 台幣', value: 'USD_TO_TWD' }]} value={exchangeDir} onChange={setExchangeDir} />
            </div>

            <div className="inset-group-row">
              <span className="inset-group-label">台幣總額</span>
              <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                <input type="text" inputMode="numeric" className="inset-group-input" value={exchangeTwd} onChange={e => handleExchangeTwdChange(e.target.value)} placeholder="$0" />
              </span>
            </div>

            <div className="inset-group-row">
              <span className="inset-group-label">美金總額 (USD)</span>
              <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                <input type="text" inputMode="decimal" className="inset-group-input" value={exchangeUsd} onChange={e => handleExchangeUsdChange(e.target.value)} placeholder="$0.00" />
              </span>
            </div>
          </div>

          <button className="glass-btn glass-btn-cta" style={{ width: '100%', fontWeight: '700', padding: '14px', borderRadius: '14px' }} onClick={handleExchange}>確認換匯</button>
        </div>
      )}

      {/* ⚖️ 校正面板 */}
      {activeTab === 'calibrate' && (
        <div key="calibrate-panel" className="glass-card card-animate page-transition-enter" style={{ padding: '20px 18px' }}>
          <h3 style={{ marginBottom: '15px', marginTop: 0, fontWeight: '800', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-orange)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M17 5H9.5A3.5 3.5 0 0 0 6 8.5C6 11 9 12 9 12M2 12h20M5 19h14" />
            </svg>
            餘額校正回歸
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: '1.5' }}>用於修正帳務手續費或小數點匯差。此操作僅校正水位，<strong style={{ color: 'var(--accent-orange)' }}>不會</strong>認列入當月收支預算。</p>

          <div className="inset-group-card">
            <div className="inset-group-row">
              <span className="inset-group-label">📅 交易日期</span>
              <span className="inset-group-value">
                <input type="date" style={{ background: 'none', border: 'none', color: '#fff', textAlign: 'right', outline: 'none', fontFamily: 'var(--font-family)' }} value={txDate} onChange={(e) => setTxDate(e.target.value)} />
              </span>
            </div>
            <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>校正帳戶</span>
              <SegmentedControl options={[{ label: '大狗狗 🐕', value: 'userA' }, { label: '共同帳戶 🏫', value: 'jointCash' }, { label: '阿陞 🐶', value: 'userB' }]} value={calibAccount} onChange={setCalibAccount} />
            </div>

            {calibAccount && (
              <>
                <div className="inset-group-row" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <span className="inset-group-label">目前台幣帳面</span>
                  <span className="inset-group-value" style={{ fontWeight: '700' }}>{formatMoney(assets[calibAccount] || 0)}</span>
                </div>
                <div className="inset-group-row" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <span className="inset-group-label">目前美金帳面</span>
                  <span className="inset-group-value" style={{ fontWeight: '700' }}>${(assets[`${calibAccount}_usd`] || 0).toFixed(2)} USD</span>
                </div>
              </>
            )}

            <div className="inset-group-row">
              <span className="inset-group-label">實際台幣餘額</span>
              <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                <input type="text" inputMode="numeric" className="inset-group-input" value={calibTwd} onChange={e => setCalibTwd(formatInputMoney(e.target.value))} placeholder="不修改請留空" />
              </span>
            </div>

            <div className="inset-group-row">
              <span className="inset-group-label">實際美金餘額</span>
              <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                <input type="text" inputMode="decimal" className="inset-group-input" value={calibUsd} onChange={e => setCalibUsd(formatInputMoney(e.target.value))} placeholder="不修改請留空" />
              </span>
            </div>
          </div>

          <button className="glass-btn glass-btn-cta" style={{ width: '100%', fontWeight: '700', padding: '14px', borderRadius: '14px' }} onClick={handleCalibrate}>確認校正</button>
        </div>
      )}

      {/* 💸 上繳面板 */}
      {activeTab === 'transfer' && (
        <div key="transfer-panel" className="glass-card card-animate page-transition-enter" style={{ padding: '20px 18px' }}>
          <h3 style={{ marginBottom: '20px', marginTop: 0, fontWeight: '800', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <polyline points="19 12 12 19 5 12" />
            </svg>
            上繳公庫
          </h3>

          <div className="inset-group-card">
            <div className="inset-group-row">
              <span className="inset-group-label">📅 交易日期</span>
              <span className="inset-group-value">
                <input type="date" style={{ background: 'none', border: 'none', color: '#fff', textAlign: 'right', outline: 'none', fontFamily: 'var(--font-family)' }} value={txDate} onChange={(e) => setTxDate(e.target.value)} />
              </span>
            </div>
            <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>上繳來源</span>
              <SegmentedControl options={[{ label: `大狗狗 🐕`, value: 'userA' }, { label: `阿陞 🐶`, value: 'userB' }]} value={transSource} onChange={setTransSource} />
            </div>

            <div className="inset-group-row">
              <span className="inset-group-label">劃撥金額 (台幣)</span>
              <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                <input type="text" inputMode="numeric" className="inset-group-input" value={transAmount} onChange={(e) => setTransAmount(formatInputMoney(e.target.value))} placeholder="$0" />
              </span>
            </div>
          </div>

          <button className="glass-btn glass-btn-cta" style={{ width: '100%', fontWeight: '700', padding: '14px', borderRadius: '14px' }} onClick={handleTransfer}>確認上繳</button>
        </div>
      )}

      {/* 💰 收入面板 */}
      {activeTab === 'income' && (
        <div key="income-panel" className="glass-card card-animate page-transition-enter" style={{ padding: '20px 18px' }}>
          <h3 style={{ marginBottom: '20px', marginTop: 0, fontWeight: '800', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            一般收入
          </h3>

          <div className="inset-group-card">
            <div className="inset-group-row">
              <span className="inset-group-label">📅 交易日期</span>
              <span className="inset-group-value">
                <input type="date" style={{ background: 'none', border: 'none', color: '#fff', textAlign: 'right', outline: 'none', fontFamily: 'var(--font-family)' }} value={txDate} onChange={(e) => setTxDate(e.target.value)} />
              </span>
            </div>
            <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>入帳戶頭</span>
              <SegmentedControl options={[{ label: `大狗狗 🐕`, value: 'userA' }, { label: `阿陞 🐶`, value: 'userB' }]} value={incomeUser} onChange={setIncomeUser} />
            </div>

            <div className="inset-group-row">
              <span className="inset-group-label">入帳金額</span>
              <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                <input type="text" inputMode="numeric" className="inset-group-input" value={incomeAmount} onChange={(e) => setIncomeAmount(formatInputMoney(e.target.value))} placeholder="$0" />
              </span>
            </div>

            <div className="inset-group-row">
              <span className="inset-group-label">來源備註</span>
              <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                <input type="text" className="inset-group-input" value={incomeNote} onChange={(e) => setIncomeNote(e.target.value)} placeholder="例如：本月薪資入帳" />
              </span>
            </div>
          </div>

          <button className="glass-btn glass-btn-cta" style={{ width: '100%', fontWeight: '700', padding: '14px', borderRadius: '14px' }} onClick={handleIncomeSubmit}>確認收入入帳</button>
        </div>
      )}

      {/* 💾 資料管理 */}
      <div style={{ marginTop: '36px', paddingTop: '20px', borderTop: '0.5px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ color: 'var(--text-secondary)', marginBottom: '15px', fontWeight: '800', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          資料備份與還原
        </h3>
        
        <div style={{ display: 'flex', gap: '12px', marginBottom: '10px' }}>
          <button className="glass-btn" style={{ flex: 1, fontSize: '0.88rem', fontWeight: '600' }} onClick={handleExport}>📥 匯出 JSON</button>
          <button className="glass-btn" style={{ flex: 1, fontSize: '0.88rem', fontWeight: '600' }} onClick={handleImportClick}>📤 匯入 JSON</button>
          <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".json" onChange={handleFileChange} />
        </div>
        <button onClick={handleManualBackup} disabled={isManualBackingUp} className="glass-btn glass-btn-cta" style={{ width: '100%', fontWeight: '700', padding: '12px', borderRadius: '12px' }}>
          {isManualBackingUp ? '備份傳送中...' : '☁️ 手動觸發雲端備份'}
        </button>
      </div>
    </div>
  );
};

export default AssetTransfer;