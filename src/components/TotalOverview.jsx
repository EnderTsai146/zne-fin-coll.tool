// src/components/TotalOverview.jsx
import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import {
    Chart as ChartJS, ArcElement, Tooltip, Legend,
    CategoryScale, LinearScale, PointElement, LineElement, Title, Filler
} from 'chart.js';
import { Doughnut, Line } from 'react-chartjs-2';
import { MY_GOOGLE_API_URL } from '../config';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Title, Filler);

const formatMoney = (num) => "$" + Math.round(Number(num)).toLocaleString();
const formatDate = (date) => date.toISOString().split('T')[0];
const TotalOverview = ({ assets, combinedHistory, loadArchiveMonth, isFetchingArchive, setAssets, currentFxRate, setCurrentFxRate, hasNewUpdate, onOpenChangelog }) => {
    // ★ Fix: 將日期移入元件內，避免模組級別變數在跨日後過期
    const today = new Date();
    const [chartDateRange, setChartDateRange] = useState({ start: formatDate(new Date(new Date().setFullYear(new Date().getFullYear() - 1))), end: formatDate(new Date()) });
    const [activeHistory, setActiveHistory] = useState(null);
    const [selectedAuditTrail, setSelectedAuditTrail] = useState(null);
    const [chartViewMode, setChartViewMode] = useState('line'); // Task 3 Stacked Area Toggle
    const [historyDateRange, setHistoryDateRange] = useState({ start: '', end: '' });
    const [backupWarning, setBackupWarning] = useState(false);
    const [selectedChartDate, setSelectedChartDate] = useState('');
    const yesterday = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return d;
    }, []);
    const recordDate = useMemo(() => `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`, [yesterday]);
    // ★ 當用戶點擊折線圖的某一天時，系統自動背景調取那一個月的歸檔紀錄
    useEffect(() => {
        if (selectedChartDate && loadArchiveMonth) {
            loadArchiveMonth(selectedChartDate.slice(0, 7));
        }
    }, [selectedChartDate, loadArchiveMonth]);

    // ★ 當開啟「帳戶變動軌跡明細」時，自動背景載入近三個月的資料，確保滾動平順不斷層
    useEffect(() => {
        if (activeHistory && loadArchiveMonth) {
            const now = new Date();
            for (let i = 0; i < 3; i++) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                loadArchiveMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
            }
        }
    }, [activeHistory, loadArchiveMonth]);

    // ★ 當帳戶明細要求超大範圍時，自動遍歷該區間背景提領
    useEffect(() => {
        if (activeHistory && historyDateRange.start && historyDateRange.end && loadArchiveMonth) {
            let d = new Date(historyDateRange.start);
            const endD = new Date(historyDateRange.end);
            let count = 0;
            while (d <= endD && count < 60) {
                loadArchiveMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                d.setMonth(d.getMonth() + 1);
                count++;
            }
        }
    }, [activeHistory, historyDateRange, loadArchiveMonth]);

    // ★ 儲存包含股票漲跌的「真實總市值」
    const [liveMarketNetWorth, setLiveMarketNetWorth] = useState(0);
    const currentLiveMarketNetWorth = (assets.dailyNetWorth && assets.dailyNetWorth[recordDate]) || liveMarketNetWorth;
    // ★ 新增：背景抓取即時報價的 UI 狀態
    const [isFetchingLive, setIsFetchingLive] = useState(false);
    const [livePrices, setLivePrices] = useState({});

    const isBackingUpRef = useRef(false);
    const todayStr = formatDate(today);

    // ----------------------------------------------------
    // 0. 自動無感備份引擎
    // ----------------------------------------------------
    useEffect(() => {
        if (!assets.monthlyExpenses || assets.monthlyExpenses.length === 0) return;
        if (assets.lastBackupDate === todayStr) return;

        const timer = setTimeout(async () => {
            if (isBackingUpRef.current) return;
            isBackingUpRef.current = true;
            try {
                fetch(MY_GOOGLE_API_URL, {
                    method: 'POST',
                    headers: { "Content-Type": "text/plain;charset=utf-8" },
                    body: JSON.stringify({
                        action: 'backup',
                        date: todayStr,
                        fileName: `自動備份_${todayStr}.json`,
                        assets: assets
                    }),
                    redirect: 'follow'
                }).catch(e => console.log('Background backup error (usually cors/redirect thrown by browser):', e));

                setBackupWarning(false);
                // ★ Fix: 使用 functional update 確保狀態更新順序正確
                setAssets(prev => ({ ...prev, lastBackupDate: todayStr }));
            } finally {
                isBackingUpRef.current = false;
            }
        }, 3000);

        return () => clearTimeout(timer);
    }, [todayStr, setAssets, assets.monthlyExpenses?.length, assets.lastBackupDate]);

    // ----------------------------------------------------
    // 1. 雙幣別資產計算 (直覺相加邏輯)
    // ----------------------------------------------------
    const twdUser1 = assets.userA || 0;
    const usdUser1 = assets.userA_usd || 0;

    const twdUser2 = assets.userB || 0;
    const usdUser2 = assets.userB_usd || 0;

    const twdJoint = assets.jointCash || 0;
    const usdJoint = assets.jointCash_usd || 0;

    const totalTwdCash = twdUser1 + twdUser2 + twdJoint;
    const totalUsdCash = usdUser1 + usdUser2 + usdJoint;

    const totalCashConverted = totalTwdCash + Math.round(totalUsdCash * currentFxRate);

    // Helper function to calculate holdings for a specific owner/payer (FIFO logic)
    // Helper function to calculate holdings for a specific owner/payer (FIFO logic)
    const getStockHoldingsFor = useCallback((target) => {
        const holdings = {};
        
        // 1. 先載入歸檔紀錄累積的持股基底
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
                    if (target === 'jointCash') return ownerStr.includes('共同');
                    if (target === 'userA') return ownerStr.includes('大狗狗');
                    if (target === 'userB') return ownerStr.includes('阿陞');
                    return false;
                };
                if (data.market && matchesOwner(owner)) {
                    if (!holdings[actualSym]) {
                        holdings[actualSym] = {
                            shares: 0,
                            market: data.market || 'TW',
                            lots: []
                        };
                    }
                    holdings[actualSym].shares += (data.shares || 0);
                    holdings[actualSym].lots.push({
                        shares: data.shares || 0,
                        costTwd: data.costTwd || 0
                    });
                }
            });
        }

        // 2. 再疊加目前主文件中的交易紀錄
        const matchesPayer = (payer) => {
            if (!payer) return false;
            if (target === 'jointCash') return payer.includes('共同');
            if (target === 'userA') return payer.includes('大狗狗');
            if (target === 'userB') return payer.includes('阿陞');
            return false;
        };

        const sorted = [...(assets.monthlyExpenses || [])]
            .filter(r => !r.isDeleted && r.symbol && r.payer && matchesPayer(r.payer))
            .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.timestamp || '').localeCompare(b.timestamp || ''));

        sorted.forEach(r => {
            const sym = r.symbol;
            if (!holdings[sym]) {
                holdings[sym] = {
                    shares: 0,
                    market: r.market || 'TW',
                    lots: []
                };
            }
            const h = holdings[sym];
            if (r.market) h.market = r.market;

            if (r.type.includes('buy')) {
                const shares = Number(r.shares) || 0;
                const totalTwd = Number(r.total) || 0;
                h.lots.push({ shares, costTwd: totalTwd });
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
                        lot.shares -= remaining;
                        remaining = 0;
                    }
                }
                h.shares -= sellShares;
            }
        });

        // 清理已完全賣出的持倉，並計算成本
        Object.keys(holdings).forEach(k => {
            if (holdings[k].shares <= 0.0001) {
                delete holdings[k];
            } else {
                holdings[k].costTwd = holdings[k].lots.reduce((s, l) => s + l.costTwd, 0);
            }
        });

        return holdings;
    }, [assets.monthlyExpenses, assets.currentStockHoldings]);

    const stockHoldingsUser1 = useMemo(() => getStockHoldingsFor('userA'), [getStockHoldingsFor]);
    const stockHoldingsUser2 = useMemo(() => getStockHoldingsFor('userB'), [getStockHoldingsFor]);
    const stockHoldingsJoint = useMemo(() => getStockHoldingsFor('jointCash'), [getStockHoldingsFor]);

    const getStockMarketValueFor = useCallback((holdings, prices, fxRate) => {
        let val = 0;
        Object.entries(holdings).forEach(([sym, holding]) => {
            const price = prices[sym];
            if (price !== undefined && price > 0) {
                let symVal = price * holding.shares;
                if (holding.market === 'TW') {
                    const fee = Math.max(20, Math.floor(symVal * 0.001425 * 0.6));
                    const tax = Math.floor(symVal * 0.003);
                    val += (symVal - fee - tax);
                } else {
                    const feeUsd = symVal * 0.001;
                    val += (symVal - feeUsd) * fxRate;
                }
            } else {
                val += (holding.costTwd || 0);
            }
        });
        return Math.round(val);
    }, []);

    const liveInvestUser1 = getStockMarketValueFor(stockHoldingsUser1, livePrices, currentFxRate) + (assets.userInvestments?.userA?.fund || 0) + (assets.userInvestments?.userA?.deposit || 0) + (assets.userInvestments?.userA?.other || 0);
    const liveInvestUser2 = getStockMarketValueFor(stockHoldingsUser2, livePrices, currentFxRate) + (assets.userInvestments?.userB?.fund || 0) + (assets.userInvestments?.userB?.deposit || 0) + (assets.userInvestments?.userB?.other || 0);
    const liveInvestJoint = getStockMarketValueFor(stockHoldingsJoint, livePrices, currentFxRate) + (assets.jointInvestments?.fund || 0) + (assets.jointInvestments?.deposit || 0) + (assets.jointInvestments?.other || 0);
    const totalInvestLive = liveInvestUser1 + liveInvestUser2 + liveInvestJoint;
    const totalAssetsLive = totalCashConverted + totalInvestLive;

    const totalStockMarketValue = useMemo(() => {
        return getStockMarketValueFor(stockHoldingsUser1, livePrices, currentFxRate) +
               getStockMarketValueFor(stockHoldingsUser2, livePrices, currentFxRate) +
               getStockMarketValueFor(stockHoldingsJoint, livePrices, currentFxRate);
    }, [stockHoldingsUser1, stockHoldingsUser2, stockHoldingsJoint, livePrices, currentFxRate, getStockMarketValueFor]);

    const sumInvestments = (invObj) => Object.values(invObj || {}).reduce((sum, val) => sum + val, 0);
    const investUser1 = sumInvestments(assets.userInvestments?.userA);
    const investUser2 = sumInvestments(assets.userInvestments?.userB);
    const investJoint = sumInvestments(assets.jointInvestments);
    const totalInvest = investUser1 + investUser2 + investJoint;

    // 總資產本金 (現金 + 投入本金)
    const totalAssets = totalCashConverted + totalInvest;

    const assetTypes = [
        { key: 'cash', label: '台幣現金', color: '#2ecc71', val: totalTwdCash },
        { key: 'usd', label: '美金現鈔', color: '#f1c40f', val: Math.round(totalUsdCash * currentFxRate) },
        { key: 'stock', label: '股票', color: '#ff9f43', val: totalStockMarketValue },
        { key: 'fund', label: '基金', color: '#54a0ff', val: (assets.userInvestments?.userA?.fund || 0) + (assets.userInvestments?.userB?.fund || 0) + (assets.jointInvestments?.fund || 0) },
        { key: 'deposit', label: '定存', color: '#9b59b6', val: (assets.userInvestments?.userA?.deposit || 0) + (assets.userInvestments?.userB?.deposit || 0) + (assets.jointInvestments?.deposit || 0) },
        { key: 'other', label: '其他', color: '#c8d6e5', val: (assets.userInvestments?.userA?.other || 0) + (assets.userInvestments?.userB?.other || 0) + (assets.jointInvestments?.other || 0) }
    ];

    const activeAssets = assetTypes.filter(a => a.val > 0);
    const doughnutData = {
        labels: activeAssets.map(a => a.label),
        datasets: [{ data: activeAssets.map(a => a.val), backgroundColor: activeAssets.map(a => a.color), borderWidth: 0, hoverOffset: 4 }]
    };

    const stockHoldings = useMemo(() => {
        // ★ 先載入歸檔紀錄累積的持股基底
        const holdings = {};
        if (assets.currentStockHoldings) {
            Object.entries(assets.currentStockHoldings).forEach(([key, data]) => {
                let actualSym = key;
                if (key.includes('_')) {
                    actualSym = key.split('_').slice(1).join('_');
                }
                if (!holdings[actualSym]) {
                    holdings[actualSym] = { shares: 0, market: data.market || 'TW' };
                }
                holdings[actualSym].shares += (data.shares || 0);
            });
        }
        // 再疊加目前主文件中的交易紀錄
        (assets.monthlyExpenses || []).filter(r => !r.isDeleted).forEach(r => {
            if (!r.symbol) return;
            const sym = r.symbol;
            if (!holdings[sym]) holdings[sym] = { shares: 0, market: r.market || 'TW' };
            if (r.type.includes('buy')) holdings[sym].shares += (Number(r.shares) || 0);
            else if (r.type.includes('sell')) holdings[sym].shares -= (Number(r.shares) || 0);
        });
        Object.keys(holdings).forEach(k => { if (holdings[k].shares <= 0.0001) delete holdings[k]; });
        return holdings;
    }, [assets.monthlyExpenses, assets.currentStockHoldings]);

    // ----------------------------------------------------
    // 2. 每日打卡快照引擎 (抓取真實市場現值)
    // ----------------------------------------------------


    const hasSnapshot = (assets.dailyNetWorth || {})[recordDate];
    const isFetchingSnapshotRef = useRef(false);



    useEffect(() => {
        if (!assets.monthlyExpenses || assets.monthlyExpenses.length === 0) return;

        const fetchPricesAndSnapshot = async () => {
            setIsFetchingLive(true); // ★ 顯示載入中 UI
            try {
                const symbols = Object.keys(stockHoldings);
                let fxRate = currentFxRate || 31.5;

                const allSymbols = symbols.length > 0 ? [...symbols, 'TWD=X'].join(',') : 'TWD=X';
                const res = await fetch(`${MY_GOOGLE_API_URL}?symbols=${allSymbols}`, { redirect: 'follow' });
                if (!res.ok) throw new Error('API 連線失敗');
                const data = await res.json();

                if (data?.quoteResponse?.result) {
                    const quotes = data.quoteResponse.result;
                    const fxQuote = quotes.find(q => q.symbol === 'TWD=X');
                    if (fxQuote) {
                        fxRate = fxQuote.regularMarketPrice || fxQuote.regularMarketPreviousClose || 31.5;
                        setCurrentFxRate(fxRate);
                    }

                    const newPrices = {};
                    let stockMarketValue = 0;
                    symbols.forEach(sym => {
                        const q = quotes.find(q => q.symbol === sym);
                        if (q) {
                            const price = q.regularMarketPrice || q.regularMarketPreviousClose || 0;
                            newPrices[sym] = price;
                            const holding = stockHoldings[sym];
                            let val = price * holding.shares;
                            if (holding.market === 'TW') {
                                const fee = Math.max(20, Math.floor(val * 0.001425 * 0.6));
                                const tax = Math.floor(val * 0.003);
                                stockMarketValue += (val - fee - tax);
                            } else {
                                const feeUsd = val * 0.001;
                                stockMarketValue += (val - feeUsd) * fxRate;
                            }
                        }
                    });
                    setLivePrices(newPrices);

                    // 如果今日還沒有快照，且非正在寫入中，則自動快照存檔
                    if (!hasSnapshot && !isFetchingSnapshotRef.current) {
                        isFetchingSnapshotRef.current = true;
                        const usdCashTwd = Math.round(((assets.userA_usd || 0) + (assets.userB_usd || 0) + (assets.jointCash_usd || 0)) * fxRate);
                        const nonStockInvest = totalInvest - ((assets.userInvestments?.userA?.stock || 0) + (assets.userInvestments?.userB?.stock || 0) + (assets.jointInvestments?.stock || 0));
                        const finalNetWorth = Math.round(totalTwdCash + usdCashTwd + nonStockInvest + stockMarketValue);

                        setLiveMarketNetWorth(finalNetWorth);
                        setAssets(prev => ({ ...prev, dailyNetWorth: { ...(prev.dailyNetWorth || {}), [recordDate]: finalNetWorth } }));
                    }
                }
            } catch (e) {
                console.error("快照/獲取即時價格失敗:", e);
            } finally {
                isFetchingSnapshotRef.current = false;
                setIsFetchingLive(false); // ★ 隱藏載入中 UI
            }
        };
        fetchPricesAndSnapshot();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasSnapshot, recordDate, Object.keys(stockHoldings).join(',')]);

    // ----------------------------------------------------
    // 3. 繪製折線圖資料
    // ----------------------------------------------------
    const historyData = useMemo(() => {
        const getDeepCopy = (obj) => structuredClone(obj);

        const getAssetsTotal = (state) => {
            if (!state) return 0;
            const twd = (state.userA || 0) + (state.userB || 0) + (state.jointCash || 0);
            const usd = (state.userA_usd || 0) + (state.userB_usd || 0) + (state.jointCash_usd || 0);
            const invest = sumInvestments(state.jointInvestments) + sumInvestments(state.userInvestments?.userA) + sumInvestments(state.userInvestments?.userB);
            return twd + Math.round(usd * currentFxRate) + invest;
        };

        const chartDataPoints = {};
        const categoriesDataPoints = {
            cash: {},
            usd: {},
            stock: {},
            fund: {},
            deposit: {},
            other: {}
        };

        const sortedRecords = [...(combinedHistory || [])]
            .filter(r => !r.isDeleted && r.auditTrail?.after && r.auditTrail?.before)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || new Date(a.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());

        let allDates = [...new Set([formatDate(today), ...sortedRecords.map(r => r.date), ...Object.keys(assets.dailyNetWorth || {})])].sort();

        let currentBal = currentLiveMarketNetWorth > 0 ? currentLiveMarketNetWorth : totalAssets;

        let currentBalances = {
            userA: assets.userA || 0,
            userA_usd: assets.userA_usd || 0,
            userB: assets.userB || 0,
            userB_usd: assets.userB_usd || 0,
            jointCash: assets.jointCash || 0,
            jointCash_usd: assets.jointCash_usd || 0,
            userInvestments: getDeepCopy(assets.userInvestments || {
                userA: { stock: 0, fund: 0, deposit: 0, other: 0 },
                userB: { stock: 0, fund: 0, deposit: 0, other: 0 }
            }),
            jointInvestments: getDeepCopy(assets.jointInvestments || {
                stock: 0, fund: 0, deposit: 0, other: 0
            })
        };

        for (let i = allDates.length - 1; i >= 0; i--) {
            const d = allDates[i];

            if (assets.dailyNetWorth && assets.dailyNetWorth[d]) {
                currentBal = assets.dailyNetWorth[d];
            }

            chartDataPoints[d] = currentBal;

            // Reconstruct categories (clamped to 0)
            const twdCashVal = Math.max(0, currentBalances.userA + currentBalances.userB + currentBalances.jointCash);
            const usdCashVal = Math.max(0, Math.round((currentBalances.userA_usd + currentBalances.userB_usd + currentBalances.jointCash_usd) * currentFxRate));
            const stockVal = Math.max(0, (currentBalances.userInvestments?.userA?.stock || 0) + (currentBalances.userInvestments?.userB?.stock || 0) + (currentBalances.jointInvestments?.stock || 0));
            const fundVal = Math.max(0, (currentBalances.userInvestments?.userA?.fund || 0) + (currentBalances.userInvestments?.userB?.fund || 0) + (currentBalances.jointInvestments?.fund || 0));
            const depositVal = Math.max(0, (currentBalances.userInvestments?.userA?.deposit || 0) + (currentBalances.userInvestments?.userB?.deposit || 0) + (currentBalances.jointInvestments?.deposit || 0));
            const otherVal = Math.max(0, (currentBalances.userInvestments?.userA?.other || 0) + (currentBalances.userInvestments?.userB?.other || 0) + (currentBalances.jointInvestments?.other || 0));

            categoriesDataPoints.cash[d] = twdCashVal;
            categoriesDataPoints.usd[d] = usdCashVal;
            categoriesDataPoints.stock[d] = stockVal;
            categoriesDataPoints.fund[d] = fundVal;
            categoriesDataPoints.deposit[d] = depositVal;
            categoriesDataPoints.other[d] = otherVal;

            const dayRecords = sortedRecords.filter(r => r.date === d);
            let dayNetChange = 0;
            dayRecords.forEach(r => {
                dayNetChange += (getAssetsTotal(r.auditTrail.after) - getAssetsTotal(r.auditTrail.before));

                if (r.auditTrail?.before && r.auditTrail?.after) {
                    const before = r.auditTrail.before;
                    const after = r.auditTrail.after;
                    
                    currentBalances.userA -= ((after.userA || 0) - (before.userA || 0));
                    currentBalances.userA_usd -= ((after.userA_usd || 0) - (before.userA_usd || 0));
                    currentBalances.userB -= ((after.userB || 0) - (before.userB || 0));
                    currentBalances.userB_usd -= ((after.userB_usd || 0) - (before.userB_usd || 0));
                    currentBalances.jointCash -= ((after.jointCash || 0) - (before.jointCash || 0));
                    currentBalances.jointCash_usd -= ((after.jointCash_usd || 0) - (before.jointCash_usd || 0));
                    
                    if (after.userInvestments && before.userInvestments) {
                        ['userA', 'userB'].forEach(usr => {
                            ['stock', 'fund', 'deposit', 'other'].forEach(k => {
                                if (currentBalances.userInvestments[usr]) {
                                    currentBalances.userInvestments[usr][k] -= (((after.userInvestments[usr]?.[k] || 0) - (before.userInvestments[usr]?.[k] || 0)));
                                }
                            });
                        });
                    }
                    if (after.jointInvestments && before.jointInvestments) {
                        ['stock', 'fund', 'deposit', 'other'].forEach(k => {
                            currentBalances.jointInvestments[k] -= (((after.jointInvestments[k] || 0) - (before.jointInvestments[k] || 0)));
                        });
                    }
                }
            });

            // Clamp balances to 0 to prevent negative values from audit trail mismatches or manual calibrations
            currentBalances.userA = Math.max(0, currentBalances.userA);
            currentBalances.userA_usd = Math.max(0, currentBalances.userA_usd);
            currentBalances.userB = Math.max(0, currentBalances.userB);
            currentBalances.userB_usd = Math.max(0, currentBalances.userB_usd);
            currentBalances.jointCash = Math.max(0, currentBalances.jointCash);
            currentBalances.jointCash_usd = Math.max(0, currentBalances.jointCash_usd);
            
            if (currentBalances.userInvestments) {
                ['userA', 'userB'].forEach(usr => {
                    if (currentBalances.userInvestments[usr]) {
                        ['stock', 'fund', 'deposit', 'other'].forEach(k => {
                            currentBalances.userInvestments[usr][k] = Math.max(0, currentBalances.userInvestments[usr][k]);
                        });
                    }
                });
            }
            if (currentBalances.jointInvestments) {
                ['stock', 'fund', 'deposit', 'other'].forEach(k => {
                    currentBalances.jointInvestments[k] = Math.max(0, currentBalances.jointInvestments[k]);
                });
            }

            currentBal = Math.max(0, currentBal - dayNetChange);
        }

        let labels = Object.keys(chartDataPoints).sort();

        if (chartDateRange.start) {
            let startValue = 0;
            const startBalances = { cash: 0, usd: 0, stock: 0, fund: 0, deposit: 0, other: 0 };
            for (let i = labels.length - 1; i >= 0; i--) {
                if (labels[i] <= chartDateRange.start) { 
                    startValue = chartDataPoints[labels[i]]; 
                    startBalances.cash = categoriesDataPoints.cash[labels[i]] || 0;
                    startBalances.usd = categoriesDataPoints.usd[labels[i]] || 0;
                    startBalances.stock = categoriesDataPoints.stock[labels[i]] || 0;
                    startBalances.fund = categoriesDataPoints.fund[labels[i]] || 0;
                    startBalances.deposit = categoriesDataPoints.deposit[labels[i]] || 0;
                    startBalances.other = categoriesDataPoints.other[labels[i]] || 0;
                    break; 
                }
            }
            labels = labels.filter(d => d >= chartDateRange.start);
            if (labels.length === 0 || labels[0] > chartDateRange.start) {
                labels.unshift(chartDateRange.start); 
                chartDataPoints[chartDateRange.start] = startValue;
                categoriesDataPoints.cash[chartDateRange.start] = startBalances.cash;
                categoriesDataPoints.usd[chartDateRange.start] = startBalances.usd;
                categoriesDataPoints.stock[chartDateRange.start] = startBalances.stock;
                categoriesDataPoints.fund[chartDateRange.start] = startBalances.fund;
                categoriesDataPoints.deposit[chartDateRange.start] = startBalances.deposit;
                categoriesDataPoints.other[chartDateRange.start] = startBalances.other;
            }
        }
        if (chartDateRange.end) {
            labels = labels.filter(d => d <= chartDateRange.end);
            if (labels.length === 0 || labels[labels.length - 1] < chartDateRange.end) {
                labels.push(chartDateRange.end);
                let endValue = totalAssets;
                const endBalances = { cash: totalTwdCash, usd: Math.round(totalUsdCash * currentFxRate), stock: (assets.userInvestments?.userA?.stock || 0) + (assets.userInvestments?.userB?.stock || 0) + (assets.jointInvestments?.stock || 0), fund: (assets.userInvestments?.userA?.fund || 0) + (assets.userInvestments?.userB?.fund || 0) + (assets.jointInvestments?.fund || 0), deposit: (assets.userInvestments?.userA?.deposit || 0) + (assets.userInvestments?.userB?.deposit || 0) + (assets.jointInvestments?.deposit || 0), other: (assets.userInvestments?.userA?.other || 0) + (assets.userInvestments?.userB?.other || 0) + (assets.jointInvestments?.other || 0) };
                for (let i = 0; i < Object.keys(chartDataPoints).sort().length; i++) {
                    const lD = Object.keys(chartDataPoints).sort()[i];
                    if (lD <= chartDateRange.end) {
                        endValue = chartDataPoints[lD];
                        endBalances.cash = categoriesDataPoints.cash[lD] || 0;
                        endBalances.usd = categoriesDataPoints.usd[lD] || 0;
                        endBalances.stock = categoriesDataPoints.stock[lD] || 0;
                        endBalances.fund = categoriesDataPoints.fund[lD] || 0;
                        endBalances.deposit = categoriesDataPoints.deposit[lD] || 0;
                        endBalances.other = categoriesDataPoints.other[lD] || 0;
                    }
                }
                chartDataPoints[chartDateRange.end] = endValue;
                categoriesDataPoints.cash[chartDateRange.end] = endBalances.cash;
                categoriesDataPoints.usd[chartDateRange.end] = endBalances.usd;
                categoriesDataPoints.stock[chartDateRange.end] = endBalances.stock;
                categoriesDataPoints.fund[chartDateRange.end] = endBalances.fund;
                categoriesDataPoints.deposit[chartDateRange.end] = endBalances.deposit;
                categoriesDataPoints.other[chartDateRange.end] = endBalances.other;
            }
        }

        const data = labels.map(d => chartDataPoints[d]);
        return { labels, data, categories: categoriesDataPoints };
    }, [assets.monthlyExpenses, assets.dailyNetWorth, combinedHistory, totalAssets, chartDateRange, currentFxRate, currentLiveMarketNetWorth, totalTwdCash, totalUsdCash, assets.userInvestments, assets.jointInvestments]);

    const lineChartData = {
        labels: historyData.labels,
        datasets: [{
            label: '總資產現值',
            data: historyData.data,
            borderColor: '#667eea',
            backgroundColor: 'rgba(102, 126, 234, 0.15)',
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: '#764ba2',
            borderWidth: 2,
            pointHoverRadius: 6
        }]
    };

    const stackedChartData = {
        labels: historyData.labels,
        datasets: [
            {
                label: '台幣現金',
                data: historyData.labels.map(d => historyData.categories.cash[d] || 0),
                borderColor: '#2ecc71',
                backgroundColor: 'rgba(46, 204, 113, 0.45)',
                fill: 'origin',
                tension: 0.3,
                pointRadius: 2
            },
            {
                label: '美金現鈔',
                data: historyData.labels.map(d => historyData.categories.usd[d] || 0),
                borderColor: '#f1c40f',
                backgroundColor: 'rgba(241, 196, 15, 0.45)',
                fill: 'origin',
                tension: 0.3,
                pointRadius: 2
            },
            {
                label: '股票',
                data: historyData.labels.map(d => historyData.categories.stock[d] || 0),
                borderColor: '#ff9f43',
                backgroundColor: 'rgba(255, 159, 67, 0.45)',
                fill: 'origin',
                tension: 0.3,
                pointRadius: 2
            },
            {
                label: '基金',
                data: historyData.labels.map(d => historyData.categories.fund[d] || 0),
                borderColor: '#54a0ff',
                backgroundColor: 'rgba(84, 160, 255, 0.45)',
                fill: 'origin',
                tension: 0.3,
                pointRadius: 2
            },
            {
                label: '定存',
                data: historyData.labels.map(d => historyData.categories.deposit[d] || 0),
                borderColor: '#9b59b6',
                backgroundColor: 'rgba(155, 89, 182, 0.45)',
                fill: 'origin',
                tension: 0.3,
                pointRadius: 2
            },
            {
                label: '其他',
                data: historyData.labels.map(d => historyData.categories.other[d] || 0),
                borderColor: '#c8d6e5',
                backgroundColor: 'rgba(200, 214, 229, 0.45)',
                fill: 'origin',
                tension: 0.3,
                pointRadius: 2
            }
        ]
    };

    const stackedChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: true,
                position: 'top',
                labels: { color: 'rgba(255, 255, 255, 0.85)', font: { size: 10 } }
            },
            tooltip: {
                mode: 'index',
                intersect: false,
                backgroundColor: 'rgba(28, 28, 30, 0.95)',
                titleColor: '#ffffff',
                bodyColor: '#ffffff',
                borderColor: 'rgba(255, 255, 255, 0.12)',
                borderWidth: 1,
                padding: 10,
                cornerRadius: 8,
                callbacks: {
                    label: (ctx) => ` ${ctx.dataset.label}: ${formatMoney(ctx.raw)}`
                }
            }
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { color: 'rgba(255, 255, 255, 0.6)', font: { size: 9 } }
            },
            y: {
                stacked: true,
                grid: { color: 'rgba(255, 255, 255, 0.06)' },
                ticks: { color: 'rgba(255, 255, 255, 0.6)', font: { size: 9 } }
            }
        }
    };


    const lineChartOptions = {
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(28, 28, 30, 0.85)',
                titleColor: '#ffffff',
                bodyColor: '#ffffff',
                borderColor: 'rgba(255, 255, 255, 0.15)',
                borderWidth: 1,
                padding: 10,
                cornerRadius: 8,
                titleFont: { size: 13, weight: 'bold' },
                bodyFont: { size: 12 },
                callbacks: { label: (ctx) => formatMoney(ctx.raw) }
            }
        },
        scales: {
            x: { grid: { display: false }, ticks: { maxTicksLimit: 6, maxRotation: 0, font: { size: 10 }, color: 'rgba(235,235,245,0.6)' } },
            y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { callback: (value) => '$' + (value / 10000).toFixed(0) + '萬', font: { size: 10 }, color: 'rgba(235,235,245,0.6)' } }
        },
        onClick: (evt, elements) => {
            if (elements.length > 0) setSelectedChartDate(historyData.labels[elements[0].index]);
            else setSelectedChartDate(null);
        }
    };

    const formatDateTime = (ts) => {
        if (!ts) return ''; const d = new Date(ts);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
    };

    const hasInvDiff = (b, a) => {
        const bInv = b || {}; const aInv = a || {};
        return (bInv.stock || 0) !== (aInv.stock || 0) || (bInv.fund || 0) !== (aInv.fund || 0) || (bInv.deposit || 0) !== (aInv.deposit || 0) || (bInv.other || 0) !== (aInv.other || 0);
    };

    // ----------------------------------------------------
    // 4. 精準科目的歷史軌跡
    // ----------------------------------------------------
    const getAccountHistory = () => {
        if (!activeHistory) return [];
        let filtered = (combinedHistory || []);

        filtered = filtered.filter(r => {
            if (!r.auditTrail || !r.auditTrail.before || !r.auditTrail.after) return false;
            const b = r.auditTrail.before; const a = r.auditTrail.after;
            if (activeHistory === 'userA') return b.userA !== a.userA || (b.userA_usd || 0) !== (a.userA_usd || 0) || hasInvDiff(b.userInvestments?.userA, a.userInvestments?.userA);
            if (activeHistory === 'userB') return b.userB !== a.userB || (b.userB_usd || 0) !== (a.userB_usd || 0) || hasInvDiff(b.userInvestments?.userB, a.userInvestments?.userB);
            if (activeHistory === 'jointCash') return b.jointCash !== a.jointCash || (b.jointCash_usd || 0) !== (a.jointCash_usd || 0) || hasInvDiff(b.jointInvestments, a.jointInvestments);
            return false;
        });

        if (historyDateRange.start) filtered = filtered.filter(r => (r.date || r.month) >= historyDateRange.start);
        if (historyDateRange.end) filtered = filtered.filter(r => (r.date || r.month) <= historyDateRange.end);

        let patchedFiltered = filtered.map(r => ({ ...r, auditTrail: r.auditTrail ? { before: { ...r.auditTrail.before }, after: { ...r.auditTrail.after } } : null }));
        patchedFiltered.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());

        for (let i = 0; i < patchedFiltered.length; i++) {
            const r = patchedFiltered[i];
            const b = r.auditTrail?.before; const a = r.auditTrail?.after;
            if (b && a && b.userInvestments === undefined) {
                let olderInvestments = null; let olderJoint = null;
                for (let j = i + 1; j < patchedFiltered.length; j++) {
                    const older = patchedFiltered[j];
                    if (older.auditTrail?.after?.userInvestments !== undefined) {
                        olderInvestments = older.auditTrail.after.userInvestments; olderJoint = older.auditTrail.after.jointInvestments; break;
                    }
                }
                if (!olderInvestments) { olderInvestments = assets.userInvestments || { userA: {}, userB: {} }; olderJoint = assets.jointInvestments || {}; }
                b.userInvestments = olderInvestments; a.userInvestments = olderInvestments; b.jointInvestments = olderJoint; a.jointInvestments = olderJoint;
            }
        }
        return patchedFiltered;
    };

    const handleToggleHistory = (account) => {
        if (activeHistory === account) { setActiveHistory(null); }
        else { setActiveHistory(account); setHistoryDateRange({ start: '', end: '' }); }
    };
    // ★ Fix: 將 getAccountHistory 包裹在 useMemo 中，避免每次 render 都重新計算 O(n²)
    const specificHistory = useMemo(() => getAccountHistory(), [activeHistory, combinedHistory, historyDateRange, assets]);

    // ----------------------------------------------------
    // 5. 繪製折線圖點擊後的「變動分析卡片」
    // ----------------------------------------------------
    const renderChartDetails = () => {
        if (!selectedChartDate) return null;
        const idx = historyData.labels.indexOf(selectedChartDate);
        if (idx === -1) return null;

        const currentVal = historyData.data[idx];
        const prevVal = idx > 0 ? historyData.data[idx - 1] : currentVal;
        const diff = currentVal - prevVal;

        const dayRecords = (combinedHistory || []).filter(r => !r.isDeleted && r.date === selectedChartDate)
            .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());

        let netTransactions = 0;
        dayRecords.forEach(r => {
            const isRealOutflow = ['spend', 'expense', 'fixed'].includes(r.type);
            const isRealInflow = ['income', 'personal_invest_profit'].includes(r.type);
            const isRealLoss = ['personal_invest_loss'].includes(r.type);

            if (isRealOutflow || isRealLoss) netTransactions -= Number(r.total);
            else if (isRealInflow) netTransactions += Number(r.total);
        });

        const marketFluctuation = diff - netTransactions;

        // ★ 判斷是否有可靠的快照數據來計算市場波動
        const hasCurrentSnapshot = !!(assets.dailyNetWorth && assets.dailyNetWorth[selectedChartDate]);
        const prevDate = idx > 0 ? historyData.labels[idx - 1] : null;
        const hasPrevSnapshot = !!(prevDate && assets.dailyNetWorth && assets.dailyNetWorth[prevDate]);
        const hasSnapshotData = hasCurrentSnapshot || hasPrevSnapshot;

        return (
            <div style={{ marginTop: '15px', padding: '16px', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--accent-purple)', background: 'rgba(255,255,255,0.06)', animation: 'slideDown 0.3s ease-out' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h4 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1rem', fontWeight: '700' }}>
                        📅 {selectedChartDate} 資產變動分析 {isFetchingArchive && <span style={{ fontSize: '0.7rem', color: 'var(--accent-blue)', animation: 'pulse 1.5s infinite' }}>(載入歷史中...)</span>}
                    </h4>
                    <button onClick={() => setSelectedChartDate(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-secondary)' }}>✖</button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                    <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>總資產變動: </div>
                    <div style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: '0.84rem', fontWeight: '700', background: diff >= 0 ? 'rgba(52,199,89,0.12)' : 'rgba(255,59,48,0.10)', color: diff >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                        較前一日 {diff >= 0 ? '+' : ''}{formatMoney(diff)}
                    </div>
                </div>

                <div style={{ marginBottom: '12px', background: 'rgba(255,255,255,0.06)', padding: '12px', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', borderBottom: '0.5px solid rgba(255,255,255,0.08)', paddingBottom: '4px', marginBottom: '6px' }}>
                        📝 當日人為操作 (實質淨額影響: <span style={{ color: netTransactions >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: '700' }}>{netTransactions >= 0 ? '+' : ''}{formatMoney(netTransactions)}</span>)
                    </div>
                    {dayRecords.length === 0 ? (
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', textAlign: 'center', padding: '10px 0' }}>{isFetchingArchive ? '努力從冷倉庫撈取資料中...' : '當日無任何紀錄'}</div>
                    ) : dayRecords.map((r, i) => {
                        const isExternalOut = ['spend', 'expense', 'fixed', 'personal_invest_loss'].includes(r.type);
                        const isExternalIn = ['income', 'personal_invest_profit'].includes(r.type);

                        let sign = ''; let color = 'var(--text-secondary)'; let isNeutral = true;
                        if (isExternalOut) { sign = '-'; color = '#ff6b6b'; isNeutral = false; }
                        else if (isExternalIn) { sign = '+'; color = 'var(--accent-green)'; isNeutral = false; }
                        else if (r.type === 'calibrate') { sign = '⚖️ '; color = 'var(--text-tertiary)'; }
                        else if (r.type.includes('sell')) { sign = '+'; color = 'var(--accent-teal)'; }
                        else if (r.type.includes('buy')) { sign = '-'; color = 'var(--accent-teal)'; }
                        else { sign = '🔄 '; color = 'var(--accent-purple)'; }

                        return (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px', alignItems: 'center' }}>
                                <span style={{ color: isNeutral ? 'var(--text-secondary)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                                    {r.note || r.category} {isNeutral && <span style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', marginLeft: '5px' }}>(轉換/校正)</span>}
                                </span>
                                <span style={{ color: color, fontWeight: isNeutral ? 'normal' : 'bold' }}>{sign}{formatMoney(r.total)}</span>
                            </div>
                        );
                    })}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.88rem', color: 'var(--text-secondary)', borderTop: '0.5px solid rgba(255,255,255,0.08)', paddingTop: '10px' }}>
                    <span>📈 市場與匯率波動估算</span>
                    {hasSnapshotData ? (
                        <span style={{ fontWeight: '700', fontSize: '1.05rem', color: marketFluctuation >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                            {marketFluctuation >= 0 ? '+' : ''}{formatMoney(marketFluctuation)}
                        </span>
                    ) : (
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                            ⚠️ 無快照 · 僅帳面變動
                        </span>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="page-transition-enter">
            {backupWarning && (
                <div style={{ background: 'var(--accent-red)', color: 'white', padding: '10px 15px', borderRadius: 'var(--radius-sm)', marginBottom: '15px', fontSize: '0.88rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>⚠️ 警告：無法連線至 Google 雲端備份伺服器。請手動備份。</span>
                    <button onClick={() => setBackupWarning(false)} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '10px' }}>
                <h1 className="page-title" style={{ margin: 0 }}>總資產概況</h1>
                <button
                    className="glass-btn"
                    style={{
                        fontSize: '0.8rem',
                        padding: '6px 12px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        borderRadius: 'var(--radius-pill, 99px)',
                        border: '1px solid var(--glass-border)',
                        background: 'var(--glass-bg)',
                        color: 'var(--text-primary)',
                        WebkitTextFillColor: 'var(--text-primary)',
                        position: 'relative',
                        transition: 'all 0.2s ease'
                    }}
                    onClick={onOpenChangelog}
                >
                    📢 更新日誌
                    {hasNewUpdate && (
                        <span style={{
                            background: 'var(--accent-red, #ff3b30)',
                            color: 'white',
                            WebkitTextFillColor: 'white',
                            fontSize: '0.62rem',
                            fontWeight: '800',
                            padding: '2px 6px',
                            borderRadius: '10px',
                            lineHeight: '1',
                            animation: 'pulseRed 2s infinite',
                            boxShadow: '0 0 8px rgba(255, 59, 48, 0.6)',
                            display: 'inline-block'
                        }}>
                            New
                        </span>
                    )}
                </button>
            </div>

            {/* 【第一層】雙人總資產大看板 */}
            <div className="glass-card card-animate" style={{ marginBottom: '18px', textAlign: 'center', padding: '28px 18px' }}>
                <div style={{ fontSize: '0.88rem', opacity: 0.85, marginBottom: '5px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                    <span className="nobrk">雙人總資產</span> <span className="nobrk">(即時市值估算)</span>
                    {isFetchingLive && <span className="nobrk" style={{ fontSize: '0.73rem', background: 'rgba(120,120,128,0.12)', padding: '2px 8px', borderRadius: 'var(--radius-pill)', marginLeft: '5px' }}>🔄 更新報價中...</span>}
                </div>
                <div style={{ fontSize: '2.4rem', fontWeight: '800', letterSpacing: '-0.02em' }}>
                    {formatMoney(totalAssetsLive)}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '15px', fontSize: '0.82rem', flexWrap: 'wrap' }}>
                    <div className="nobrk" style={{ background: 'rgba(120,120,128,0.12)', padding: '5px 14px', borderRadius: 'var(--radius-pill)', backdropFilter: 'blur(4px)' }}>💰 總現金 {formatMoney(totalCashConverted)}</div>
                    <div className="nobrk" style={{ background: 'rgba(120,120,128,0.12)', padding: '5px 14px', borderRadius: 'var(--radius-pill)', backdropFilter: 'blur(4px)' }}>📈 總市值 {formatMoney(totalInvestLive)}</div>
                </div>

                {totalAssetsLive > 0 && totalAssetsLive !== totalAssets && (
                    <div style={{ marginTop: '15px', paddingTop: '12px', borderTop: '1px solid var(--glass-border)', fontSize: '0.84rem', display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '4px' }}>
                        <span className="nobrk">📊 包含投資未實現損益：</span>
                        <span className="nobrk" style={{ fontWeight: '800', color: totalAssetsLive >= totalAssets ? 'var(--accent-green)' : '#ff6b6b', fontSize: '1rem' }}>
                            {totalAssetsLive >= totalAssets ? '+' : ''}{formatMoney(totalAssetsLive - totalAssets)}
                        </span>
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: activeHistory ? '10px' : '18px', flexWrap: 'wrap' }}>
                <div className="glass-card card-animate" style={{ flex: 1, minWidth: '105px', padding: '12px', borderTop: '3px solid var(--accent-pink)', background: activeHistory === 'userA' ? 'rgba(255,59,48,0.04)' : undefined }}>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: '600', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span className="nobrk">大狗狗🐕</span>
                        <span className="nobrk" style={{ fontSize: '0.63rem', fontWeight: '400' }}>(依即時市值)</span>
                    </div>
                    <div className="nobrk" style={{ fontSize: '1.15rem', fontWeight: '700', color: 'var(--text-primary)', margin: '5px 0' }}>{formatMoney(twdUser1 + Math.round(usdUser1 * currentFxRate) + liveInvestUser1)}</div>
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-tertiary)', marginBottom: '10px', lineHeight: '1.4' }}>
                        <span className="nobrk">現 {formatMoney(twdUser1)}</span><br />
                        <span className="nobrk">美 ${usdUser1.toFixed(2)}</span><br />
                        <span className="nobrk">值 {formatMoney(liveInvestUser1)}</span>
                    </div>
                    <button onClick={() => handleToggleHistory('userA')} className={activeHistory === 'userA' ? 'glass-btn glass-btn-cta' : 'glass-btn'} style={{ width: '100%', padding: '6px', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{activeHistory === 'userA' ? '收起' : '🔍 紀錄'}</button>
                </div>

                <div className="glass-card card-animate" style={{ flex: 1, minWidth: '105px', padding: '12px', borderTop: '3px solid var(--accent-orange)', background: activeHistory === 'jointCash' ? 'rgba(255,149,0,0.04)' : undefined }}>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: '600', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span className="nobrk">🏫 共同</span>
                        <span className="nobrk" style={{ fontSize: '0.63rem', fontWeight: '400' }}>(依即時市值)</span>
                    </div>
                    <div className="nobrk" style={{ fontSize: '1.15rem', fontWeight: '700', color: 'var(--text-primary)', margin: '5px 0' }}>{formatMoney(twdJoint + Math.round(usdJoint * currentFxRate) + liveInvestJoint)}</div>
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-tertiary)', marginBottom: '10px', lineHeight: '1.4' }}>
                        <span className="nobrk">現 {formatMoney(twdJoint)}</span><br />
                        <span className="nobrk">美 ${usdJoint.toFixed(2)}</span><br />
                        <span className="nobrk">值 {formatMoney(liveInvestJoint)}</span>
                    </div>
                    <button onClick={() => handleToggleHistory('jointCash')} className={activeHistory === 'jointCash' ? 'glass-btn glass-btn-cta' : 'glass-btn'} style={{ width: '100%', padding: '6px', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{activeHistory === 'jointCash' ? '收起' : '🔍 紀錄'}</button>
                </div>

                <div className="glass-card card-animate" style={{ flex: 1, minWidth: '105px', padding: '12px', borderTop: '3px solid var(--accent-green)', background: activeHistory === 'userB' ? 'rgba(52,199,89,0.04)' : undefined }}>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: '600', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span className="nobrk">阿陞🐶</span>
                        <span className="nobrk" style={{ fontSize: '0.63rem', fontWeight: '400' }}>(依即時市值)</span>
                    </div>
                    <div className="nobrk" style={{ fontSize: '1.15rem', fontWeight: '700', color: 'var(--text-primary)', margin: '5px 0' }}>{formatMoney(twdUser2 + Math.round(usdUser2 * currentFxRate) + liveInvestUser2)}</div>
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-tertiary)', marginBottom: '10px', lineHeight: '1.4' }}>
                        <span className="nobrk">現 {formatMoney(twdUser2)}</span><br />
                        <span className="nobrk">美 ${usdUser2.toFixed(2)}</span><br />
                        <span className="nobrk">值 {formatMoney(liveInvestUser2)}</span>
                    </div>
                    <button onClick={() => handleToggleHistory('userB')} className={activeHistory === 'userB' ? 'glass-btn glass-btn-cta' : 'glass-btn'} style={{ width: '100%', padding: '6px', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{activeHistory === 'userB' ? '收起' : '🔍 紀錄'}</button>
                </div>
            </div>
            {activeHistory && (
                <div className="glass-card card-animate" style={{ marginBottom: '18px', borderLeft: `4px solid ${activeHistory === 'userA' ? 'var(--accent-pink)' : activeHistory === 'userB' ? 'var(--accent-green)' : 'var(--accent-orange)'}` }}>
                    <div style={{ fontWeight: '700', color: 'var(--text-primary)', marginBottom: '10px', fontSize: '1rem' }}>
                        📝 {activeHistory === 'userA' ? '大狗狗🐕' : activeHistory === 'userB' ? '阿陞🐶' : '共同'} 變動明細
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '15px' }}>
                        <input type="date" value={historyDateRange.start} onChange={(e) => setHistoryDateRange(prev => ({ ...prev, start: e.target.value }))} className="glass-input" style={{ margin: 0, padding: '6px 10px', flex: 1, minWidth: '110px', fontSize: '0.84rem' }} />
                        <span style={{ color: 'var(--text-tertiary)', fontSize: '0.84rem' }}>至</span>
                        <input type="date" value={historyDateRange.end} onChange={(e) => setHistoryDateRange(prev => ({ ...prev, end: e.target.value }))} className="glass-input" style={{ margin: 0, padding: '6px 10px', flex: 1, minWidth: '110px', fontSize: '0.84rem' }} />
                        <button onClick={() => setHistoryDateRange({ start: '', end: '' })} className="glass-btn" style={{ padding: '6px 12px', fontSize: '0.82rem' }}>清除</button>
                    </div>

                    <div style={{ maxHeight: '450px', overflowY: 'auto', paddingRight: '5px' }}>
                        {specificHistory.length > 0 ? (
                            specificHistory.map((record, idx) => {
                                const b = record.auditTrail?.before; const a = record.auditTrail?.after;
                                let bCash = 0, aCash = 0, bInv = 0, aInv = 0, bUsd = 0, aUsd = 0;
                                let cashDiff = 0, invDiff = 0, usdDiff = 0; let label = "";

                                if (b && a) {
                                    if (activeHistory === 'userA') {
                                        label = "大狗狗🐕"; bCash = b.userA || 0; aCash = a.userA || 0; bUsd = b.userA_usd || 0; aUsd = a.userA_usd || 0;
                                        bInv = sumInvestments(b.userInvestments?.userA); aInv = sumInvestments(a.userInvestments?.userA);
                                    } else if (activeHistory === 'userB') {
                                        label = "阿陞🐶"; bCash = b.userB || 0; aCash = a.userB || 0; bUsd = b.userB_usd || 0; aUsd = a.userB_usd || 0;
                                        bInv = sumInvestments(b.userInvestments?.userB); aInv = sumInvestments(a.userInvestments?.userB);
                                    } else if (activeHistory === 'jointCash') {
                                        label = "共同"; bCash = b.jointCash || 0; aCash = a.jointCash || 0; bUsd = b.jointCash_usd || 0; aUsd = a.jointCash_usd || 0;
                                        bInv = sumInvestments(b.jointInvestments); aInv = sumInvestments(a.jointInvestments);
                                    }
                                    cashDiff = aCash - bCash; invDiff = aInv - bInv; usdDiff = aUsd - bUsd;
                                    if (invDiff === 0 && (record.type.includes('invest_buy') || record.type.includes('invest_sell'))) {
                                        if (record.type.includes('buy')) invDiff = Number(record.total);
                                        if (record.type.includes('sell')) invDiff = -Number(record.principal);
                                        bInv = aInv - invDiff;
                                    }
                                }

                                return (
                                    <div 
                                        key={idx} 
                                        style={{ 
                                            padding: '12px 14px', 
                                            background: 'rgba(255, 255, 255, 0.02)',
                                            border: '1px solid rgba(255, 255, 255, 0.05)',
                                            borderRadius: '12px',
                                            marginBottom: '10px', 
                                            display: 'flex', 
                                            flexDirection: 'column', 
                                            gap: '8px', 
                                            opacity: record.isDeleted ? 0.5 : 1 
                                        }}
                                    >
                                        {/* Top Metadata Row */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', color: 'var(--text-tertiary)', borderBottom: '1px solid rgba(255, 255, 255, 0.04)', paddingBottom: '6px' }}>
                                            <span className="nobrk" style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>
                                                📅 帳單日: {record.date} {record.isDeleted && <span style={{ color: 'var(--accent-red)', marginLeft: '4px' }}>(已作廢)</span>}
                                            </span>
                                            <span style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                <span className="nobrk">⏱ {formatDateTime(record.timestamp)}</span>
                                                <span className="nobrk">| 👤 {record.operator || '系統'}</span>
                                            </span>
                                        </div>

                                        {/* Main Record Header & Total */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                            <div style={{ color: 'var(--text-primary)', fontSize: '0.86rem', fontWeight: '700', wordBreak: 'break-word', textDecoration: record.isDeleted ? 'line-through' : 'none' }}>
                                                📝 {record.note || record.category}
                                            </div>
                                            <div className="nobrk" style={{ fontSize: '0.86rem', fontWeight: '700', color: 'var(--text-primary)', textDecoration: record.isDeleted ? 'line-through' : 'none' }}>
                                                總額: {formatMoney(record.total)}
                                            </div>
                                        </div>

                                        {/* Balance Differences Row */}
                                        {(cashDiff !== 0 || usdDiff !== 0 || invDiff !== 0) && (
                                            <div style={{ display: 'flex', gap: '6px 12px', flexWrap: 'wrap', fontSize: '0.78rem' }}>
                                                {cashDiff !== 0 && (
                                                    <span className="nobrk" style={{ color: cashDiff > 0 ? 'var(--accent-green)' : '#ff6b6b', fontWeight: '600' }}>
                                                        [{label}現鈔] {cashDiff > 0 ? '增加' : '扣除'} {cashDiff > 0 ? '+' : ''}{formatMoney(cashDiff)}
                                                    </span>
                                                )}
                                                {usdDiff !== 0 && (
                                                    <span className="nobrk" style={{ color: usdDiff > 0 ? 'var(--accent-green)' : '#ff6b6b', fontWeight: '600' }}>
                                                        [{label}美金] {usdDiff > 0 ? '增加' : '扣除'} {usdDiff > 0 ? '+' : ''}${usdDiff.toFixed(2)}
                                                    </span>
                                                )}
                                                {invDiff !== 0 && (
                                                    <span className="nobrk" style={{ color: invDiff > 0 ? 'var(--accent-green)' : '#ff6b6b', fontWeight: '600' }}>
                                                        [{label}投資] {invDiff > 0 ? '增加' : '扣除'} {invDiff > 0 ? '+' : ''}{formatMoney(invDiff)}
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        {/* Audit Trail Box */}
                                        {b && a && (
                                            <div style={{ 
                                                fontSize: '0.74rem', 
                                                background: 'rgba(0, 0, 0, 0.15)', 
                                                padding: '8px 12px', 
                                                borderRadius: '8px', 
                                                border: '1px solid rgba(255, 255, 255, 0.04)', 
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '4px'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-tertiary)', flexWrap: 'wrap', gap: '4px' }}>
                                                    <span className="nobrk">變動前：</span>
                                                    <span style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                        <span className="nobrk">現 {formatMoney(bCash)}</span>
                                                        <span className="nobrk">| 美 ${bUsd.toFixed(2)}</span>
                                                        <span className="nobrk">| 投 {formatMoney(bInv)}</span>
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '600', color: 'var(--text-secondary)', flexWrap: 'wrap', gap: '4px' }}>
                                                    <span className="nobrk">變動後：</span>
                                                    <span style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', color: 'var(--text-primary)' }}>
                                                        <span className="nobrk">現 {formatMoney(aCash)}</span>
                                                        <span className="nobrk">| 美 ${aUsd.toFixed(2)}</span>
                                                        <span className="nobrk">| 投 {formatMoney(aInv)}</span>
                                                    </span>
                                                </div>
                                                {b.accounts && (
                                                    <button 
                                                        onClick={() => setSelectedAuditTrail(record.auditTrail)}
                                                        style={{
                                                            background: 'rgba(0,122,255,0.08)',
                                                            color: 'var(--accent-blue)',
                                                            border: 'none',
                                                            borderRadius: '6px',
                                                            padding: '4px 8px',
                                                            fontSize: '0.68rem',
                                                            fontWeight: '700',
                                                            cursor: 'pointer',
                                                            marginTop: '4px',
                                                            alignSelf: 'flex-start'
                                                        }}
                                                    >
                                                        🔍 查看多帳戶變動明細
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        ) : (<div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '20px' }}>此區間尚無變動紀錄</div>)}
                    </div>
                </div>
            )}

            {/* 🏦 帳戶資產概況 (Apple HIG Widget Card) */}
            <div className="glass-card card-animate" style={{ marginBottom: '18px', padding: '16px 18px' }}>
                <h3 style={{ marginTop: 0, marginBottom: '14px', fontSize: '0.96rem', fontWeight: '800', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    🏦 帳戶資產概況
                </h3>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: '10px'
                }}>
                  {(assets.accounts || []).map(acc => {
                    const isCredit = acc.type === 'credit';
                    const ownerLabel = acc.owner === 'joint' ? '共同' : (acc.owner === 'userA' ? '大狗狗' : '阿陞');
                    const balanceColor = isCredit ? '#ff9500' : '#8effa2';
                    
                    let typeIcon = '🏦';
                    if (acc.type === 'cash') typeIcon = '💵';
                    else if (acc.type === 'credit') typeIcon = '💳';
                    else if (acc.type === 'virtual') typeIcon = '📱';

                    return (
                      <div 
                        key={acc.id} 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'space-between',
                          padding: '10px 12px', 
                          borderRadius: '12px', 
                          border: '0.5px solid rgba(255,255,255,0.06)', 
                          backgroundColor: 'rgba(255,255,255,0.02)' 
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                          <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{typeIcon}</span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: '700', fontSize: '0.82rem', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {acc.nickname}
                            </div>
                            <div style={{ fontSize: '0.64rem', color: 'var(--text-tertiary)', marginTop: '1px' }}>
                              {ownerLabel} · {acc.name || '帳戶'}
                            </div>
                          </div>
                        </div>
                        <span style={{ fontWeight: '800', fontSize: '0.86rem', color: balanceColor, flexShrink: 0, marginLeft: '8px' }}>
                          ${acc.balance.toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
            </div>

            {/* 【第三層】資產分佈圓餅圖 */}
            <div className="glass-card card-animate" style={{ marginBottom: '18px', display: 'flex', flexWrap: 'nowrap', alignItems: 'center', gap: '15px' }}>
                <div style={{ flexShrink: 0, width: '120px', height: '120px', display: 'flex', justifyContent: 'center' }}>
                    {activeAssets.length > 0 ? (<Doughnut data={doughnutData} options={{
                        maintainAspectRatio: false,
                        cutout: '70%',
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                backgroundColor: 'rgba(28, 28, 30, 0.85)',
                                titleColor: '#ffffff',
                                bodyColor: '#ffffff',
                                borderColor: 'rgba(255, 255, 255, 0.15)',
                                borderWidth: 1,
                                padding: 10,
                                cornerRadius: 8,
                                titleFont: { size: 13, weight: 'bold' },
                                bodyFont: { size: 12 },
                                callbacks: {
                                    label: (ctx) => ` ${ctx.label}: ${formatMoney(ctx.raw)}`
                                }
                            }
                        }
                    }} />) : (<div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-tertiary)' }}>尚無資產</div>)}
                </div>
                <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {activeAssets.map((asset) => (
                        <div key={asset.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: asset.color, flexShrink: 0 }}></div>
                                <span style={{ fontWeight: '600', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>{asset.label}</span>
                            </div>
                            <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.92rem' }}>{formatMoney(asset.val)}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* 【第四層】互動式資產成長趨勢折線圖 */}
            <div className="glass-card card-animate" style={{ marginBottom: '18px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.95rem' }}>📈 資產變動與配置趨勢</div>
                    <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '20px', padding: '2px', display: 'flex', gap: '2px' }}>
                        <button onClick={() => setChartViewMode('line')} style={{ background: chartViewMode === 'line' ? 'rgba(255,255,255,0.12)' : 'transparent', border: 'none', borderRadius: '12px', padding: '4px 10px', fontSize: '0.78rem', fontWeight: '600', color: chartViewMode === 'line' ? '#fff' : '#8e8e93', cursor: 'pointer' }}>趨勢線</button>
                        <button onClick={() => setChartViewMode('stacked')} style={{ background: chartViewMode === 'stacked' ? 'rgba(255,255,255,0.12)' : 'transparent', border: 'none', borderRadius: '12px', padding: '4px 10px', fontSize: '0.78rem', fontWeight: '600', color: chartViewMode === 'stacked' ? '#fff' : '#8e8e93', cursor: 'pointer' }}>配置比例</button>
                    </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '15px' }}>
                    <input type="date" value={chartDateRange.start} onChange={(e) => setChartDateRange(prev => ({ ...prev, start: e.target.value }))} className="glass-input" style={{ margin: 0, padding: '6px 10px', flex: 1, minWidth: '110px', fontSize: '0.84rem' }} />
                    <span style={{ color: 'var(--text-tertiary)', fontSize: '0.84rem' }}>至</span>
                    <input type="date" value={chartDateRange.end} onChange={(e) => setChartDateRange(prev => ({ ...prev, end: e.target.value }))} className="glass-input" style={{ margin: 0, padding: '6px 10px', flex: 1, minWidth: '110px', fontSize: '0.84rem' }} />
                </div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '15px' }}>
                    <button onClick={() => setChartDateRange({ start: formatDate(lastYear), end: formatDate(today) })} className="glass-btn" style={{ flex: 1, padding: '6px', fontSize: '0.82rem' }}>近一年</button>
                    <button onClick={() => setChartDateRange({ start: '', end: '' })} className="glass-btn" style={{ flex: 1, padding: '6px', fontSize: '0.82rem' }}>全部時間</button>
                </div>

                <div style={{ height: '220px', width: '100%', cursor: 'pointer' }}>
                    {chartViewMode === 'line' ? (
                        <Line data={lineChartData} options={lineChartOptions} />
                    ) : (
                        <Line data={stackedChartData} options={stackedChartOptions} />
                    )}
                </div>

                {renderChartDetails()}
            </div>

            {/* 📋 更新日誌與使用教學彈窗 */}
            
            {/* 📊 帳戶餘額變動詳情彈窗 */}
            {selectedAuditTrail && (
                <div className="liquid-modal-overlay" onClick={() => setSelectedAuditTrail(null)}>
                    <div className="liquid-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px', width: '92%', maxHeight: '80vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <div style={{ fontWeight: '850', fontSize: '1.1rem', color: '#fff' }} className="liquid-modal-title">
                                📊 帳戶餘額變動詳情
                            </div>
                            <button onClick={() => setSelectedAuditTrail(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '1.3rem', cursor: 'pointer' }}>✕</button>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>
                            {(() => {
                                const beforeAccs = selectedAuditTrail.before?.accounts || [];
                                const afterAccs = selectedAuditTrail.after?.accounts || [];
                                
                                const changes = [];
                                afterAccs.forEach(afterAcc => {
                                    const beforeAcc = beforeAccs.find(b => b.id === afterAcc.id);
                                    const beforeBal = beforeAcc ? beforeAcc.balance : 0;
                                    const afterBal = afterAcc.balance;
                                    const diff = afterBal - beforeBal;
                                    if (diff !== 0) {
                                        changes.push({
                                            nickname: afterAcc.nickname,
                                            currency: afterAcc.currency,
                                            before: beforeBal,
                                            after: afterBal,
                                            diff: diff,
                                            owner: afterAcc.owner
                                        });
                                    }
                                });

                                if (changes.length === 0) {
                                    return <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textAlign: 'center', padding: '12px' }}>此交易無帳戶餘額異動</div>;
                                }

                                return changes.map((c, i) => {
                                    const diffColor = c.diff > 0 ? '#30d158' : '#ff453a';
                                    const diffSign = c.diff > 0 ? '+' : '';
                                    const ownerLabel = c.owner === 'joint' ? '共同' : (c.owner === 'userA' ? '大狗狗' : '阿陞');
                                    return (
                                        <div key={i} style={{ padding: '10px 12px', borderRadius: '10px', border: '0.5px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                <strong style={{ fontSize: '0.82rem', color: '#fff' }}>{c.nickname}</strong>
                                                <span style={{ fontSize: '0.64rem', color: 'var(--text-tertiary)', background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: '4px' }}>{ownerLabel}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem' }}>
                                                <span style={{ color: 'var(--text-secondary)' }}>
                                                    <span style={{ textDecoration: 'line-through', opacity: 0.6 }}>${c.before.toLocaleString()}</span>
                                                    <span style={{ margin: '0 6px' }}>➡️</span>
                                                    <strong>${c.after.toLocaleString()}</strong>
                                                </span>
                                                <span style={{ color: diffColor, fontWeight: '750' }}>
                                                    ({diffSign}${c.diff.toLocaleString()} {c.currency})
                                                </span>
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>

                        <button onClick={() => setSelectedAuditTrail(null)} className="glass-btn primary-gradient-btn" style={{ width: '100%', height: '40px', borderRadius: '10px', marginTop: '16px', fontWeight: '800' }}>
                            確定返回
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
};

export default TotalOverview;