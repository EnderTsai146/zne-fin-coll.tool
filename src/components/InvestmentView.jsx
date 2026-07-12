// src/components/InvestmentView.jsx
import React, { useState, useMemo, useEffect } from 'react';
import SegmentedControl from './SegmentedControl';
import { MY_GOOGLE_API_URL } from '../config';

const formatMoney = (num) => "$" + Math.round(Number(num)).toLocaleString();
const formatUsd = (num) => `$${Number(num).toFixed(2)}`;

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

const InvestmentView = ({
  assets,
  setAssets,
  isFetchingArchive,
  newlyAddedInvestSymbol,
  newlyAddedInvestPayer,
  operatorName,
  customAlert,
  customConfirm,
  customPrompt,
  currentFxRate,
  onTransaction
}) => {
  const [viewTab, setViewTab] = useState('dashboard'); // 'dashboard', 'trade'
  
  // Dashboard states
  const [activeTab, setActiveTab] = useState('jointCash'); // 'jointCash', 'userA', 'userB'
  const [prevPayer, setPrevPayer] = useState(null);

  if (newlyAddedInvestPayer !== prevPayer) {
    setPrevPayer(newlyAddedInvestPayer);
    if (newlyAddedInvestPayer) {
      setActiveTab(newlyAddedInvestPayer);
    }
  }

  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [expandedSymbol, setExpandedSymbol] = useState(null);

  const [livePrices, setLivePrices] = useState({});
  const [liveFx, setLiveFx] = useState(31.5);
  const [isFetching, setIsFetching] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  // Trade form states
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);
  const [investAction, setInvestAction] = useState('buy'); // 'buy', 'sell', 'day_trade'
  const [investType, setInvestType] = useState('stock'); // 'stock', 'fund', 'deposit', 'other'
  const [stockMarket, setStockMarket] = useState('TW'); // 'TW', 'US'
  const [settleCurrency, setSettleCurrency] = useState('TWD'); // 'TWD', 'USD'
  const [stockSymbol, setStockSymbol] = useState('');
  const [stockShares, setStockShares] = useState('');
  const [stockPrice, setStockPrice] = useState('');
  const [usTotalUsd, setUsTotalUsd] = useState('');
  const [investAmount, setInvestAmount] = useState('');
  const [investPrincipal, setInvestPrincipal] = useState('');
  const [usInvestPrincipalUsd, setUsInvestPrincipalUsd] = useState('');
  const [dayTradeResult, setDayTradeResult] = useState('profit'); // 'profit', 'loss'

  // Account binding
  const [selectedAccountId, setSelectedAccountId] = useState('');
  
  const accounts = assets?.accounts || [];
  const userKey = operatorName.includes('大狗狗') ? 'userA' : 'userB';

  // Search suggest states
  const [searchResults, setSearchResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // Auto calculate total for US Stock
  useEffect(() => {
    if (stockMarket === 'US') {
      const shares = Number(stockShares) || 0;
      const price = parseMoney(stockPrice);
      if (shares && price) {
        const total = shares * price;
        setUsTotalUsd(formatInputMoney(total));
        // Auto convert to TWD estimate
        const twdEstimate = Math.round(total * (currentFxRate || liveFx || 31.5));
        setInvestAmount(formatInputMoney(twdEstimate));
      }
    }
  }, [stockShares, stockPrice, stockMarket, currentFxRate, liveFx]);

  // Handle symbol search
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (stockSymbol && stockSymbol.length >= 2) {
        performSearch(stockSymbol);
      } else {
        setSearchResults([]);
      }
    }, 400);
    return () => clearTimeout(delayDebounce);
  }, [stockSymbol]);

  const performSearch = async (val) => {
    setIsSearching(true);
    try {
      const response = await fetch(`${MY_GOOGLE_API_URL}?search=${encodeURIComponent(val)}`);
      const data = await response.json();
      if (data && data.quotes) {
        setSearchResults(data.quotes.slice(0, 5));
      }
    } catch (e) {
      console.error("Search failed:", e);
    } finally {
      setIsSearching(false);
    }
  };

  // Invest Cart state
  const [investCart, setInvestCart] = useState([]);

  // Filter accounts for select
  const filteredAccounts = useMemo(() => {
    // Determine target owner based on the selected target tab/owner context in the form
    // Actually let user select any account they own or joint accounts
    return accounts.filter(a => {
      // Allow only cash / bank / virtual accounts (or credit cards for payment)
      if (investAction === 'buy') {
        // Can buy stocks/funds using bank or credit cards (if credit cards, it counts as debt)
        return true;
      }
      // Selling must deposit into cash/bank/virtual
      return a.type !== 'credit';
    });
  }, [accounts, investAction]);

  // FIFO Calculations
  const history = useMemo(() => assets.monthlyExpenses || [], [assets.monthlyExpenses]);
  const safeJoint = assets.jointInvestments || { stock: 0, fund: 0, deposit: 0, other: 0 };
  const safeUserA = assets.userInvestments?.userA || { stock: 0, fund: 0, deposit: 0, other: 0 };
  const safeUserB = assets.userInvestments?.userB || { stock: 0, fund: 0, deposit: 0, other: 0 };

  const currentData = activeTab === 'jointCash' ? safeJoint : (activeTab === 'userA' ? safeUserA : safeUserB);
  const currentHistoryFilter = activeTab === 'jointCash' ? '共同' : (activeTab === 'userA' ? '大狗狗' : '阿陞');
  
  const matchesPayer = (payer) => {
    if (!payer) return false;
    if (activeTab === 'jointCash') return payer.includes('共同');
    if (activeTab === 'userA') return payer.includes('大狗狗');
    if (activeTab === 'userB') return payer.includes('阿陞');
    return false;
  };

  const stockHoldings = useMemo(() => {
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
        const matchesOwner = (ownerStr) => {
          if (!ownerStr) return false;
          if (activeTab === 'jointCash') return ownerStr.includes('共同');
          if (activeTab === 'userA') return ownerStr.includes('大狗狗');
          if (activeTab === 'userB') return ownerStr.includes('阿陞');
          return false;
        };
        if (data.market && matchesOwner(owner)) {
          holdings[actualSym] = {
            shares: data.shares || 0,
            market: data.market,
            lots: [{
              shares: data.shares || 0,
              costTwd: data.costTwd || 0,
              costUsd: data.costUsd || 0,
              priceUsd: 0,
              priceTwd: 0
            }],
            realizedProfitUsd: 0,
            realizedProfitTwd: 0,
          };
        }
      });
    }

    const sorted = [...history]
      .filter(r => !r.isDeleted && r.symbol && r.payer && matchesPayer(r.payer))
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.timestamp || '').localeCompare(b.timestamp || ''));

    sorted.forEach(r => {
      const sym = r.symbol;
      if (!holdings[sym]) holdings[sym] = {
        shares: 0,
        market: r.market || 'TW',
        lots: [],
        realizedProfitUsd: 0,
        realizedProfitTwd: 0,
      };
      const h = holdings[sym];
      h.market = r.market || h.market;

      if (r.type?.includes('buy')) {
        h.shares += Number(r.shares);
        h.lots.push({
          shares: Number(r.shares),
          costTwd: Number(r.total),
          costUsd: Number(r.usdAmount || 0),
          priceUsd: r.price || 0,
          priceTwd: 0
        });
      } else if (r.type?.includes('sell')) {
        let sellQty = Number(r.shares);
        let revenueTwd = Number(r.total);
        let revenueUsd = Number(r.usdAmount || 0);
        let totalCostTwd = 0;
        let totalCostUsd = 0;

        while (sellQty > 0 && h.lots.length > 0) {
          const lot = h.lots[0];
          if (lot.shares <= sellQty) {
            totalCostTwd += lot.costTwd;
            totalCostUsd += lot.costUsd;
            sellQty -= lot.shares;
            h.lots.shift();
          } else {
            const fraction = sellQty / lot.shares;
            totalCostTwd += lot.costTwd * fraction;
            totalCostUsd += lot.costUsd * fraction;
            lot.shares -= sellQty;
            lot.costTwd -= lot.costTwd * fraction;
            lot.costUsd -= lot.costUsd * fraction;
            sellQty = 0;
          }
        }
        h.shares -= Number(r.shares);
        h.realizedProfitTwd += (revenueTwd - totalCostTwd);
        h.realizedProfitUsd += (revenueUsd - totalCostUsd);
      }
    });

    Object.keys(holdings).forEach(k => {
      if (holdings[k].shares <= 0) delete holdings[k];
    });

    return holdings;
  }, [history, assets.currentStockHoldings, activeTab]);

  const hasHoldings = Object.keys(stockHoldings).length > 0;

  // Sync quotes
  const fetchQuotes = async () => {
    if (!hasHoldings) return;
    setIsFetching(true);
    try {
      const querySymbols = Object.keys(stockHoldings).map(sym => {
        if (stockHoldings[sym].market === 'TW') {
          return sym.includes('.') ? sym : `${sym}.TW`;
        }
        return sym;
      });

      // Add exchange rate quote query
      const allSymbols = querySymbols.length > 0 ? [...querySymbols, 'TWD=X'].join(',') : 'TWD=X';

      const res = await fetch(`${MY_GOOGLE_API_URL}?symbols=${encodeURIComponent(allSymbols)}`, { redirect: 'follow' });
      const data = await res.json();

      if (data?.quoteResponse?.result) {
        const prices = {};
        let usdFx = 31.5;
        data.quoteResponse.result.forEach(item => {
          const sym = item.symbol;
          const cleanSym = sym.replace('.TW', '');
          prices[sym] = item.regularMarketPrice || item.regularMarketPreviousClose || 0;
          prices[cleanSym] = item.regularMarketPrice || item.regularMarketPreviousClose || 0;
          if (sym === 'TWD=X' || sym === 'USDTWD=X') {
            usdFx = item.regularMarketPrice || item.regularMarketPreviousClose || 31.5;
          }
        });
        setLivePrices(prices);
        setLiveFx(usdFx);
        setLastUpdated(new Date().toLocaleTimeString());
      }
    } catch (e) {
      console.error("Fetch quote error:", e);
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    fetchQuotes();
  }, [refreshKey, hasHoldings]);

  // Calculate Net Worth & Profits
  const holdingList = useMemo(() => {
    return Object.entries(stockHoldings).map(([sym, data]) => {
      const shares = data.shares;
      const totalCostTwd = data.lots.reduce((s, l) => s + l.costTwd, 0);
      const totalCostUsd = data.lots.reduce((s, l) => s + l.costUsd, 0);
      const avgCostTwd = shares > 0 ? totalCostTwd / shares : 0;
      const avgCostUsd = shares > 0 ? totalCostUsd / shares : 0;

      const curPrice = livePrices[sym] || (data.market === 'US' ? avgCostUsd : avgCostTwd);
      let marketValue = 0;
      let profitTwd = 0;
      let profitRate = 0;

      if (data.market === 'US') {
        const mvUsd = shares * curPrice;
        marketValue = Math.round(mvUsd * (currentFxRate || liveFx || 31.5));
        profitTwd = marketValue - totalCostTwd;
      } else {
        marketValue = Math.round(shares * curPrice);
        profitTwd = marketValue - totalCostTwd;
      }

      profitRate = totalCostTwd > 0 ? (profitTwd / totalCostTwd) * 100 : 0;

      return {
        sym,
        market: data.market,
        shares,
        totalCostTwd,
        avgCost: data.market === 'US' ? avgCostUsd : avgCostTwd,
        curPrice,
        marketValue,
        profitTwd,
        profitRate
      };
    });
  }, [stockHoldings, livePrices, liveFx, currentFxRate]);

  const stockNetWorth = holdingList.reduce((sum, h) => sum + h.marketValue, 0);
  const totalInvestAssetVal = stockNetWorth + (currentData.fund || 0) + (currentData.deposit || 0) + (currentData.other || 0);

  const filteredHistory = useMemo(() => {
    return history
      .filter(r => !r.isDeleted && r.symbol && r.payer && matchesPayer(r.payer))
      .filter(r => {
        if (dateRange.start && r.date < dateRange.start) return false;
        if (dateRange.end && r.date > dateRange.end) return false;
        return true;
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.timestamp || '').localeCompare(a.timestamp || ''));
  }, [history, dateRange, activeTab]);

  // Trade Cart Handlers
  const handleAddInvestCart = async () => {
    if (!selectedAccountId) {
      await customAlert("請選擇交割/支付帳戶！");
      return;
    }
    if (investType === 'stock' && !stockSymbol.trim()) {
      await customAlert("請輸入股票代號！");
      return;
    }
    const sharesNum = Number(stockShares) || 0;
    const priceNum = parseMoney(stockPrice);
    const twdTotal = parseMoney(investAmount);
    const usdTotal = parseMoney(usTotalUsd);

    if (investType === 'stock' && (!sharesNum || !priceNum)) {
      await customAlert("股數與單價不可為 0！");
      return;
    }
    if (investType !== 'stock' && !twdTotal) {
      await customAlert("請填寫交易金額！");
      return;
    }

    const targetAccount = accounts.find(a => a.id === selectedAccountId);

    const payload = {
      id: Date.now().toString(),
      accountId: selectedAccountId,
      accountNickname: targetAccount.nickname,
      investAction,
      investType,
      stockMarket,
      stockSymbol: stockSymbol.trim(),
      stockShares: sharesNum,
      stockPrice: priceNum,
      settleCurrency,
      usTotalUsd: usdTotal,
      investAmount: twdTotal,
      usFxRate: currentFxRate || liveFx || 31.5,
      investPrincipal: parseMoney(investPrincipal),
      usInvestPrincipalUsd: parseMoney(usInvestPrincipalUsd),
      dayTradeResult
    };

    setInvestCart([...investCart, payload]);

    // Clear inputs
    setStockSymbol('');
    setStockShares('');
    setStockPrice('');
    setUsTotalUsd('');
    setInvestAmount('');
    setInvestPrincipal('');
    setUsInvestPrincipalUsd('');
  };

  const handleRemoveCartItem = (id) => {
    setInvestCart(investCart.filter(item => item.id !== id));
  };

  const handleInvestSubmit = async () => {
    if (investCart.length === 0) {
      await customAlert("暫存清單中沒有任何交易項目！請先輸入並點擊「➕ 暫存此筆」。");
      return;
    }

    const confirmMsg = `確定要送出這 ${investCart.length} 筆投資交易並扣/入帳嗎？`;
    if (!(await customConfirm(confirmMsg, "送出交易"))) return;

    let updatedAccounts = [...accounts];
    let newAssets = {
      ...assets,
      jointInvestments: { ...safeJoint },
      userInvestments: assets.userInvestments
        ? JSON.parse(JSON.stringify(assets.userInvestments))
        : { userA: { stock: 0, fund: 0, deposit: 0, other: 0 }, userB: { stock: 0, fund: 0, deposit: 0, other: 0 } }
    };
    
    let transactionRecords = [];

    for (const item of investCart) {
      const payerAcc = updatedAccounts.find(a => a.id === item.accountId);
      const isJoint = payerAcc.owner === 'joint';
      const payerName = isJoint ? '共同帳戶' : (payerAcc.owner === 'userA' ? '大狗狗🐕' : '阿陞🐶');
      
      const invTypeKey = item.investType === 'fund' ? 'fund' : (item.investType === 'deposit' ? 'deposit' : (item.investType === 'other' ? 'other' : 'stock'));

      let record = {
        date: txDate,
        month: txDate.slice(0, 7),
        type: `${payerAcc.owner === 'joint' ? 'joint' : 'personal'}_invest_${item.investAction}`,
        payer: payerName,
        accountId: item.accountId,
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

      // Mathematical logic for Buy/Sell/Day-trade
      if (item.investAction === 'buy') {
        const deductAmount = item.stockMarket === 'US' && item.settleCurrency === 'USD' ? item.usTotalUsd : item.investAmount;
        
        // Deduct from account balance
        updatedAccounts = updatedAccounts.map(a => {
          if (a.id === item.accountId) return { ...a, balance: a.balance - deductAmount };
          return a;
        });

        // Add to investment portfolio cost
        const costTwd = item.stockMarket === 'US' && item.settleCurrency === 'USD' ? Math.round(item.usTotalUsd * item.usFxRate) : item.investAmount;
        if (isJoint) {
          newAssets.jointInvestments[invTypeKey] = (newAssets.jointInvestments[invTypeKey] || 0) + costTwd;
        } else {
          const ownerKey = payerAcc.owner;
          newAssets.userInvestments[ownerKey][invTypeKey] = (newAssets.userInvestments[ownerKey][invTypeKey] || 0) + costTwd;
        }

        record.total = costTwd;
        record.note = `${item.stockMarket === 'US' ? '美股' : '台股'}買入 (代碼: ${item.stockSymbol || '無'}, 帳戶: ${item.accountNickname})`;
      } else if (item.investAction === 'sell') {
        const addAmount = item.stockMarket === 'US' && item.settleCurrency === 'USD' ? item.usTotalUsd : item.investAmount;

        // Add to account balance
        updatedAccounts = updatedAccounts.map(a => {
          if (a.id === item.accountId) return { ...a, balance: a.balance + addAmount };
          return a;
        });

        // Deduct principal cost from portfolio
        let principalTwd = item.investPrincipal;
        if (item.stockMarket === 'US' && item.settleCurrency === 'USD') {
          principalTwd = Math.round(item.usInvestPrincipalUsd * item.usFxRate);
        }

        if (isJoint) {
          newAssets.jointInvestments[invTypeKey] = Math.max(0, (newAssets.jointInvestments[invTypeKey] || 0) - principalTwd);
        } else {
          const ownerKey = payerAcc.owner;
          newAssets.userInvestments[ownerKey][invTypeKey] = Math.max(0, (newAssets.userInvestments[ownerKey][invTypeKey] || 0) - principalTwd);
        }

        record.note = `${item.stockMarket === 'US' ? '美股' : '台股'}賣出 (代碼: ${item.stockSymbol || '無'}, 帳戶: ${item.accountNickname})`;
      } else if (item.investAction === 'day_trade') {
        const isProfit = item.dayTradeResult === 'profit';
        updatedAccounts = updatedAccounts.map(a => {
          if (a.id === item.accountId) {
            return { ...a, balance: isProfit ? a.balance + item.investAmount : a.balance - item.investAmount };
          }
          return a;
        });
        record.note = `當沖結算 (標的: ${item.stockSymbol}, 帳戶: ${item.accountNickname}, 結果: ${isProfit ? '獲利' : '虧損'})`;
      }

      transactionRecords.push(record);
    }

    // Save with new accounts list
    newAssets.accounts = updatedAccounts;
    onTransaction(newAssets, transactionRecords);
    
    setInvestCart([]);
    setViewTab('dashboard');
    await customAlert("🎉 投資交易執行成功，帳戶餘額已自動更新！");
  };

  // Render Subcomponent StockCard
  const StockCard = ({ h }) => {
    const isExpanded = expandedSymbol === h.sym;
    const isUs = h.market === 'US';
    const profitColor = h.profitTwd >= 0 ? '#34c759' : '#ff453a';
    const profitSign = h.profitTwd >= 0 ? '+' : '';

    return (
      <div className="glass-card" style={{ padding: '12px 14px', marginBottom: '8px', cursor: 'pointer' }} onClick={() => setExpandedSymbol(isExpanded ? null : h.sym)}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '12px', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: '800', fontSize: '0.9rem', color: '#fff' }}>{h.sym}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{isUs ? '🇺🇸 美股複委託' : '🇹🇼 台灣股市'}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: '600', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
              {isUs ? formatUsd(h.curPrice) : formatMoney(h.curPrice)}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
              均價: {isUs ? formatUsd(h.avgCost) : formatMoney(h.avgCost)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: '750', fontSize: '0.82rem', color: 'var(--text-primary)' }}>{h.shares.toLocaleString()} 股</div>
            <div style={{ fontWeight: '700', fontSize: '0.74rem', color: profitColor }}>
              {profitSign}{h.profitTwd.toLocaleString()} ({profitSign}{h.profitRate.toFixed(2)}%)
            </div>
          </div>
        </div>

        {isExpanded && (
          <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '0.5px solid rgba(255,255,255,0.06)', fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>投入台幣本金:</span>
              <span style={{ fontWeight: '600' }}>${Math.round(h.totalCostTwd).toLocaleString()} TWD</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>目前市值估算:</span>
              <span style={{ fontWeight: '600', color: 'var(--accent-blue)' }}>${Math.round(h.marketValue).toLocaleString()} TWD</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="overview-container" style={{ paddingBottom: '90px' }}>
      
      {/* Header Banner */}
      <div className="header-glass-banner" style={{ marginBottom: '20px' }}>
        <div className="banner-glow-spot" />
        <h2 style={{ fontSize: '1.4rem', fontWeight: '850', color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          📈 投資理財資產
        </h2>
        <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)', margin: '4px 0 0 0' }}>
          同步美股台股行情與持倉本金，追蹤即時獲利
        </p>

        {/* Total Investment Asset Valuation */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginTop: '16px' }}>
          <div className="networth-sub-card">
            <span className="networth-sub-label">投資總淨值 (TWD)</span>
            <span className="networth-sub-val" style={{ color: '#8effa2', fontSize: '1.15rem' }}>
              ${Math.round(totalInvestAssetVal).toLocaleString()}
            </span>
          </div>
          <div className="networth-sub-card">
            <span className="networth-sub-label">股票持倉市值 (TWD)</span>
            <span className="networth-sub-val" style={{ color: '#5ec2ff', fontSize: '1.15rem' }}>
              ${Math.round(stockNetWorth).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Main Tab Controls */}
      <div style={{ padding: '0 4px', marginBottom: '16px' }}>
        <SegmentedControl
          options={[
            { label: '📊 投資持倉總覽', value: 'dashboard' },
            { label: '📥 交易登錄中心', value: 'trade' }
          ]}
          value={viewTab}
          onChange={setViewTab}
        />
      </div>

      {/* VIEW TAB 1: DASHBOARD */}
      {viewTab === 'dashboard' && (
        <div className="slide-in">
          {/* Owner Tab */}
          <div style={{ marginBottom: '15px' }}>
            <SegmentedControl
              options={[
                { label: '共同 🏫', value: 'jointCash' },
                { label: '大狗狗 🐕', value: 'userA' },
                { label: '阿陞 🐶', value: 'userB' }
              ]}
              value={activeTab}
              onChange={setActiveTab}
            />
          </div>

          {/* Sync Button */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', padding: '0 4px' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
              {lastUpdated ? `行情更新於: ${lastUpdated}` : '尚未獲取即時行情'}
            </span>
            <button
              onClick={() => setRefreshKey(prev => prev + 1)}
              disabled={isFetching || !hasHoldings}
              className="glass-btn"
              style={{
                fontSize: '0.76rem',
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                color: isFetching ? 'var(--text-tertiary)' : 'var(--text-primary)'
              }}
            >
              🔄 {isFetching ? '更新中...' : '同步即時行情'}
            </button>
          </div>

          {/* Stock Holdings List */}
          <div className="glass-card card-animate" style={{ padding: '16px', marginBottom: '18px' }}>
            <h3 style={{ marginTop: 0, marginBottom: '12px', fontWeight: '750', fontSize: '0.96rem' }}>💎 股票/ETF 持倉明細</h3>
            
            {isFetchingArchive && (
              <div style={{
                padding: '8px',
                fontSize: '0.82rem',
                color: 'var(--accent-blue)',
                textAlign: 'center',
                background: 'rgba(0,122,255,0.06)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '12px',
                animation: 'pulseGlow 2s infinite',
                border: '1px solid rgba(0,122,255,0.15)'
              }}>
                📡 正在從歷史資料庫同步歸檔數據，持倉成本估算中...
              </div>
            )}

            {holdingList.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '12px', fontSize: '0.9rem' }}>目前沒有持股</div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', padding: '0 16px 8px', gap: '12px', fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: '500' }}>
                  <div>名稱</div>
                  <div style={{ textAlign: 'center' }}>市價 / 均價</div>
                  <div style={{ textAlign: 'right' }}>股數 / 損益</div>
                </div>
                {holdingList.map(h => <StockCard key={h.sym} h={h} />)}
              </>
            )}

            {/* Non-stock portfolio fields */}
            <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
              <h4 style={{ margin: '0 0 10px 0', color: 'var(--text-secondary)', fontSize: '0.88rem', fontWeight: '600' }}>非股票資產 (依系統登錄台幣本金)</h4>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                <span>基金</span>
                <span style={{ fontWeight: '600' }}>{formatMoney(currentData.fund || 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                <span>定存</span>
                <span style={{ fontWeight: '600' }}>{formatMoney(currentData.deposit || 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                <span>其他</span>
                <span style={{ fontWeight: '600' }}>{formatMoney(currentData.other || 0)}</span>
              </div>
            </div>
          </div>

          {/* Historical Logs */}
          <div className="glass-card card-animate" style={{ marginBottom: '18px' }}>
            <h3 style={{ marginTop: 0, marginBottom: '15px', fontWeight: '700' }}>📜 歷史交易紀錄</h3>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '15px' }}>
              <input type="date" value={dateRange.start} onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))} className="glass-input" style={{ margin: 0, padding: '5px 8px', flex: 1, minWidth: '110px', fontSize: '0.82rem' }} />
              <span style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>至</span>
              <input type="date" value={dateRange.end} onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))} className="glass-input" style={{ margin: 0, padding: '5px 8px', flex: 1, minWidth: '110px', fontSize: '0.82rem' }} />
              <button onClick={() => setDateRange({ start: '', end: '' })} className="glass-btn" style={{ padding: '5px 10px', fontSize: '0.78rem' }}>清除</button>
            </div>

            {filteredHistory.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '20px', fontSize: '0.9rem' }}>此區間尚無投資紀錄</div>
            ) : (
              filteredHistory.map((r, idx) => {
                let actionSign = ''; let amountColor = 'var(--text-primary)'; let amountStr = formatMoney(r.total);

                if (r.type.includes('buy')) { actionSign = '買入'; amountColor = 'var(--accent-purple)'; amountStr = '-' + amountStr; }
                else if (r.type.includes('sell')) { actionSign = '賣出'; amountColor = 'var(--accent-yellow)'; amountStr = '+' + amountStr; }
                else if (r.type.includes('profit')) { actionSign = '當沖賺'; amountColor = 'var(--accent-orange)'; amountStr = '+' + amountStr; }
                else if (r.type.includes('loss')) { actionSign = '當沖賠'; amountColor = 'var(--text-tertiary)'; amountStr = '-' + amountStr; }

                let profitStr = '';
                if (r.type.includes('sell')) {
                  const p = (Number(r.total) || 0) - (Number(r.principal) || Number(r.total));
                  if (p !== 0) profitStr = p > 0 ? `(賺 ${formatMoney(p)})` : `(賠 ${formatMoney(Math.abs(p))})`;
                }

                return (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
                    <div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{r.date || r.month}</div>
                      <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{r.note} <span style={{ fontSize: '0.73rem', color: 'var(--text-tertiary)', fontWeight: '400' }}>({actionSign})</span></div>
                      {r.symbol && <div style={{ fontSize: '0.73rem', color: 'var(--accent-blue)', marginTop: '2px' }}>{r.symbol} | {r.shares}股</div>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: '700', fontSize: '1.05rem', color: amountColor }}>{amountStr}</div>
                      {!!r.usdAmount && <div style={{ fontSize: '0.73rem', color: 'var(--accent-orange)', fontWeight: '600' }}>(含美金 ${r.usdAmount.toFixed(2)})</div>}
                      {profitStr && <div style={{ fontSize: '0.73rem', color: profitStr.includes('賺') ? 'var(--accent-green)' : 'var(--accent-red)' }}>{profitStr}</div>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* VIEW TAB 2: TRADE ENTRY */}
      {viewTab === 'trade' && (
        <div className="slide-in">
          {/* Trade Inputs Panel */}
          <div className="glass-card" style={{ padding: '20px 18px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📥 登錄投資交易
            </h3>

            <div className="inset-group-card">
              {/* Date */}
              <div className="inset-group-row">
                <span className="inset-group-label">📅 交易日期</span>
                <span className="inset-group-value">
                  <input type="date" style={{ background: 'none', border: 'none', color: '#fff', textAlign: 'right', outline: 'none' }} value={txDate} onChange={(e) => setTxDate(e.target.value)} />
                </span>
              </div>

              {/* Action */}
              <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>交易動作</span>
                <SegmentedControl options={[{ label: '📥 買入', value: 'buy' }, { label: '📤 賣出', value: 'sell' }, { label: '⚡ 當沖', value: 'day_trade' }]} value={investAction} onChange={setInvestAction} />
              </div>

              {/* Asset Type */}
              <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>標的類型</span>
                <SegmentedControl options={[{ label: '股票', value: 'stock' }, { label: '基金', value: 'fund' }, { label: '定存', value: 'deposit' }, { label: '其他', value: 'other' }]} value={investType} onChange={setInvestType} />
              </div>

              {/* Market (for Stock) */}
              {investType === 'stock' && (
                <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                  <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>市場</span>
                  <SegmentedControl options={[{ label: '🇹🇼 台股', value: 'TW' }, { label: '🇺🇸 美股複委託', value: 'US' }]} value={stockMarket} onChange={setStockMarket} />
                </div>
              )}

              {/* Settle Currency (for US Stock) */}
              {investType === 'stock' && stockMarket === 'US' && (
                <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                  <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>交割幣別</span>
                  <SegmentedControl options={[{ label: '台幣扣款', value: 'TWD' }, { label: '美金扣款', value: 'USD' }]} value={settleCurrency} onChange={setSettleCurrency} />
                </div>
              )}

              {/* Payoff Account Selector */}
              <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>交割 / 支付帳戶</span>
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="glass-input"
                  style={{ width: '100%', height: '36px', borderRadius: '8px' }}
                >
                  <option value="">-- 選擇支付/交割帳戶 --</option>
                  {filteredAccounts
                    .filter(a => settleCurrency === 'USD' && stockMarket === 'US' ? a.currency === 'USD' : a.currency === 'TWD')
                    .map(a => (
                      <option key={a.id} value={a.id}>
                        {a.nickname} (${a.balance.toLocaleString()} {a.currency})
                      </option>
                    ))}
                </select>
              </div>

              {/* Stock Details */}
              {investType === 'stock' && (
                <>
                  <div className="inset-group-row" style={{ position: 'relative' }}>
                    <span className="inset-group-label">股票代號</span>
                    <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                      <input type="text" className="inset-group-input" value={stockSymbol} onChange={e => { setStockSymbol(e.target.value.toUpperCase()); setShowDropdown(true); }} onFocus={() => setShowDropdown(true)} onBlur={() => setTimeout(() => setShowDropdown(false), 200)} placeholder="例: NVDA" />
                      {showDropdown && (searchResults.length > 0 || isSearching) && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'rgba(28,28,30,0.96)', backdropFilter: 'blur(20px)', zIndex: 100, borderRadius: '12px', boxShadow: '0 8px 25px rgba(0,0,0,0.3)', overflow: 'hidden', marginTop: '4px', border: '1px solid rgba(255,255,255,0.12)' }}>
                          {isSearching ? (
                            <div style={{ padding: '12px', fontSize: '0.8rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>尋找中...</div>
                          ) : searchResults.map((item, idx) => (
                            <div key={idx} onClick={() => { setStockSymbol(item.symbol); setShowDropdown(false); }} style={{ padding: '10px 14px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <strong style={{ color: 'var(--accent-blue)', fontSize: '0.86rem' }}>{item.symbol}</strong>
                              <span style={{ color: 'var(--text-secondary)', fontSize: '0.73rem' }}>{item.shortname || item.longname}</span>
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
                        <span className="inset-group-label" style={{ color: 'var(--accent-orange)' }}>美金總金額 (USD)</span>
                        <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                          <input type="text" inputMode="decimal" className="inset-group-input" style={{ color: 'var(--accent-orange)', fontWeight: '700' }} value={usTotalUsd} onChange={e => setUsTotalUsd(formatInputMoney(e.target.value))} placeholder="$0" />
                        </span>
                      </div>

                      <div className="inset-group-row" style={{ background: 'rgba(0,122,255,0.02)' }}>
                        <span className="inset-group-label" style={{ color: 'var(--accent-blue)' }}>折合台幣總額 (估計)</span>
                        <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                          <input type="text" inputMode="decimal" className="inset-group-input" style={{ color: 'var(--accent-blue)', fontWeight: '700' }} value={investAmount} onChange={e => setInvestAmount(formatInputMoney(e.target.value))} placeholder="$0" />
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="inset-group-row">
                      <span className="inset-group-label">台幣成交單價</span>
                      <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                        <input type="text" inputMode="decimal" className="inset-group-input" value={stockPrice} onChange={e => setStockPrice(formatInputMoney(e.target.value))} placeholder="$0.00" />
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* TWD Total Amount (except for US Stock buying) */}
              {!(investType === 'stock' && stockMarket === 'US') && (
                <div className="inset-group-row">
                  <span className="inset-group-label">交易金額 (TWD)</span>
                  <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                    <input type="text" inputMode="numeric" className="inset-group-input" value={investAmount} onChange={e => setInvestAmount(formatInputMoney(e.target.value))} placeholder="$0" />
                  </span>
                </div>
              )}

              {/* Sell details - realized principal */}
              {investAction === 'sell' && (
                <>
                  {stockMarket === 'US' && settleCurrency === 'USD' ? (
                    <div className="inset-group-row" style={{ background: 'rgba(255,45,85,0.02)' }}>
                      <span className="inset-group-label" style={{ color: '#ff2d55' }}>原本買入美金本金 (USD)</span>
                      <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                        <input type="text" inputMode="decimal" className="inset-group-input" style={{ color: '#ff2d55' }} value={usInvestPrincipalUsd} onChange={e => setUsInvestPrincipalUsd(formatInputMoney(e.target.value))} placeholder="$0.00" />
                      </span>
                    </div>
                  ) : (
                    <div className="inset-group-row" style={{ background: 'rgba(255,45,85,0.02)' }}>
                      <span className="inset-group-label" style={{ color: '#ff2d55' }}>原本買入台幣本金 (TWD)</span>
                      <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                        <input type="text" inputMode="numeric" className="inset-group-input" style={{ color: '#ff2d55' }} value={investPrincipal} onChange={e => setInvestPrincipal(formatInputMoney(e.target.value))} placeholder="$0" />
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* Day trade result (for day trade) */}
              {investAction === 'day_trade' && (
                <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                  <span className="inset-group-label" style={{ alignSelf: 'flex-start' }}>當沖盈虧</span>
                  <SegmentedControl options={[{ label: '💹 獲利賺錢', value: 'profit' }, { label: '📉 虧損賠錢', value: 'loss' }]} value={dayTradeResult} onChange={setDayTradeResult} />
                </div>
              )}

            </div>

            {/* Add to list button */}
            <button onClick={handleAddInvestCart} className="glass-btn" style={{ width: '100%', height: '42px', borderRadius: '10px', marginTop: '16px', fontWeight: '800', borderColor: 'var(--accent-blue)', color: 'var(--accent-blue)' }}>
              ➕ 暫存此筆交易
            </button>
          </div>

          {/* Cart display */}
          {investCart.length > 0 && (
            <div className="glass-card" style={{ padding: '16px', marginTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontWeight: '800', fontSize: '0.9rem', color: '#fff' }}>📝 待確認交易項目 ({investCart.length} 筆)</span>
                <button onClick={() => setInvestCart([])} style={{ background: 'none', border: 'none', color: '#ff453a', fontSize: '0.74rem', fontWeight: '600', cursor: 'pointer' }}>全部清除</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {investCart.map((item) => {
                  const isBuy = item.investAction === 'buy';
                  const actionLabel = isBuy ? '買入' : (item.investAction === 'sell' ? '賣出' : '當沖');
                  const actionColor = isBuy ? '#c196ff' : (item.investAction === 'sell' ? '#ffd88d' : '#ff9c8d');
                  
                  return (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', borderRadius: '8px', border: '0.5px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                      <div>
                        <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#fff' }}>
                          <span style={{ color: actionColor, marginRight: '6px' }}>[{actionLabel}]</span>
                          {item.investType === 'stock' ? `${item.stockSymbol} (${item.stockShares}股)` : item.investType.toUpperCase()}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                          支付帳戶: {item.accountNickname}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: '750', fontSize: '0.86rem', color: '#fff' }}>
                            ${item.investAmount.toLocaleString()} TWD
                          </div>
                          {item.stockMarket === 'US' && (
                            <div style={{ fontSize: '0.66rem', color: 'var(--accent-orange)' }}>
                              ${item.usTotalUsd.toLocaleString()} USD
                            </div>
                          )}
                        </div>
                        <button onClick={() => handleRemoveCartItem(item.id)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '1.1rem', cursor: 'pointer', padding: '0 4px' }}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button onClick={handleInvestSubmit} className="glass-btn primary-gradient-btn" style={{ width: '100%', height: '44px', borderRadius: '12px', marginTop: '16px', fontWeight: '800' }}>
                🚀 確定送出批次交易
              </button>
            </div>
          )}

        </div>
      )}

    </div>
  );
};

export default InvestmentView;