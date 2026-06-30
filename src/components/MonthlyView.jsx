// src/components/MonthlyView.jsx
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement } from 'chart.js';
import { Pie, Bar } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const formatMoney = (num) => "$" + Number(num).toLocaleString();

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

const generateSettleId = () => `settle_${Date.now()}`;

const MonthlyView = ({ assets, combinedHistory, loadArchiveMonth, onDelete, onEdit, setAssets, sendLineNotification, currentUser, customAlert, customConfirm, logOperation }) => {
    const history = useMemo(() => combinedHistory || [], [combinedHistory]);

    const [viewMode, setViewMode] = useState('chart');
    const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 7));
    const [filterType, setFilterType] = useState('all');
    const [filterUser, setFilterUser] = useState('all');
    const [filterNecessity, setFilterNecessity] = useState('all');

    // Advanced search & filter states
    const [searchTerm, setSearchTerm] = useState('');
    const [minAmount, setMinAmount] = useState('');
    const [maxAmount, setMaxAmount] = useState('');

    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [showSettlementModal, setShowSettlementModal] = useState(false);
    const [settlementTarget, setSettlementTarget] = useState(null);

    const [editModalData, setEditModalData] = useState(null);
    const [activeActionRecord, setActiveActionRecord] = useState(null); // HIG 2 Action Sheet state

    // ★ 當選擇儀表板或列表篩選月份時自動去庫調取歷史檔案
    useEffect(() => {
        if (loadArchiveMonth) loadArchiveMonth(selectedMonth);
    }, [selectedMonth, loadArchiveMonth]);

    useEffect(() => {
        if (loadArchiveMonth) loadArchiveMonth(filterDate);
    }, [filterDate, loadArchiveMonth]);

    // ★ 控制 MonthlyView 本地彈窗開啟時的背景滾動鎖定
    useEffect(() => {
        const shouldLock = !!editModalData || showSettlementModal || !!activeActionRecord;
        if (shouldLock) {
            document.documentElement.classList.add('modal-open');
            document.body.classList.add('modal-open');
        } else {
            document.documentElement.classList.remove('modal-open');
            document.body.classList.remove('modal-open');
        }
        return () => {
            document.documentElement.classList.remove('modal-open');
            document.body.classList.remove('modal-open');
        };
    }, [editModalData, showSettlementModal, activeActionRecord]);

    const [isEditingBudget, setIsEditingBudget] = useState(false);
    const [tempBudget, setTempBudget] = useState(() => formatInputMoney(assets.monthlyBudget || 25000));
    const currentBudget = assets.monthlyBudget || 25000;

    const handleSaveBudget = () => { setAssets({ ...assets, monthlyBudget: parseMoney(tempBudget) }); setIsEditingBudget(false); };

    // ★ 增加校正專屬顏色標籤
    const getTypeColor = (type) => {
        if (type === 'income') return '#2ecc71';
        if (type === 'expense') return '#ff6b6b';
        if (type === 'spend') return '#ff9f43';
        if (type === 'transfer' || type === 'exchange') return '#3498db';
        if (type === 'calibrate') return '#95a5a6'; // 校正為低調的灰色
        if (type === 'settle') return '#00b894';
        if (type === 'liquidate' || type === 'joint_invest_sell' || type === 'personal_invest_sell') return '#f1c40f';
        if (type === 'joint_invest_buy' || type === 'personal_invest_buy') return '#8e44ad';
        if (type === 'personal_invest_profit') return '#e67e22';
        if (type === 'personal_invest_loss') return '#7f8c8d';
        return '#666';
    };

    const calculateDebt = (userKey) => history.filter(r => !r.isDeleted && r.advancedBy === userKey && r.isSettled === false).reduce((sum, r) => sum + Number(r.total), 0);
    const getDebtList = (userKey) => history.filter(r => !r.isDeleted && r.advancedBy === userKey && r.isSettled === false);

    const handleSettle = async (targetUser) => {
        const targetName = targetUser === 'userA' ? '大狗狗 🐕' : '阿陞 🐶';
        const debtAmount = calculateDebt(targetUser);
        if (debtAmount === 0) return await customAlert("目前沒有未結清的款項喔！");
        if (assets.jointCash < debtAmount) return await customAlert(`❌ 共同現金餘額不足以結清 (需 $${debtAmount.toLocaleString()})！`);
        if (!await customConfirm(`【確認結清】\n要將 ${targetName} 代墊的 $${debtAmount.toLocaleString()} 標記為「已結清」嗎？\n(這將會從共同現金扣除，並加回 ${targetName} 的個人帳戶)`)) return;

        const safeInvestments = assets.jointInvestments || { stock: 0, fund: 0, deposit: 0, other: 0 };
        const snapshotBefore = { userA: assets.userA || 0, userB: assets.userB || 0, userA_usd: assets.userA_usd || 0, userB_usd: assets.userB_usd || 0, jointCash_usd: assets.jointCash_usd || 0, jointCash: assets.jointCash || 0, jointInvestments: { ...safeInvestments } };
        const newAssets = { ...assets };
        newAssets.jointCash -= debtAmount; newAssets[targetUser] += debtAmount;
        const snapshotAfter = { userA: newAssets.userA, userB: newAssets.userB, userA_usd: newAssets.userA_usd || 0, userB_usd: newAssets.userB_usd || 0, jointCash_usd: newAssets.jointCash_usd || 0, jointCash: newAssets.jointCash, jointInvestments: { ...safeInvestments } };

        const currentSettleId = generateSettleId();
        const newHistory = newAssets.monthlyExpenses.map(record => {
            if (!record.isDeleted && record.advancedBy === targetUser && record.isSettled === false) return { ...record, isSettled: true, settleId: currentSettleId };
            return record;
        });

        const timestamp = new Date().toISOString();
        newHistory.push({ date: timestamp.split('T')[0], month: timestamp.slice(0, 7), type: 'settle', category: '帳務結算', payer: '共同帳戶', total: debtAmount, note: `撥款結清 ${targetName} 的代墊`, operator: currentUser || "系統", timestamp: timestamp, settledUser: targetUser, settleId: currentSettleId, auditTrail: { before: snapshotBefore, after: snapshotAfter } });

        newAssets.monthlyExpenses = newHistory;

        const settlePayload = { title: "✅ 代墊款結清", amount: `$${debtAmount.toLocaleString()}`, category: "帳務結算", note: `共同帳戶已實際撥款給 ${targetName}。`, date: timestamp.split('T')[0], color: "#2ecc71", operator: currentUser || "系統" };

        if (assets.lineConfig?.batchMode) {
            newAssets.pendingLineNotifications = [...(newAssets.pendingLineNotifications || []), settlePayload];
        } else {
            const currentMonth = new Date().toISOString().slice(0, 7);
            const curCount = (newAssets.lineNotifCount?.month === currentMonth) ? (newAssets.lineNotifCount.count || 0) : 0;
            newAssets.lineNotifCount = { month: currentMonth, count: curCount + 1 };
            if (sendLineNotification) sendLineNotification(settlePayload);
        }

        let loggedAssets = newAssets;
        if (logOperation) {
            loggedAssets = logOperation(newAssets, 'settle', `代墊款結清：共同帳戶撥款 $${debtAmount.toLocaleString()} 給 ${targetName}`);
        }

        setAssets(loggedAssets);
        await customAlert("✅ 結清完成！資金已轉移，並已產生結清軌跡。"); 
        setShowSettlementModal(false);
    };

    const dashboardData = useMemo(() => {
        const currentMonth = selectedMonth;
        const [yearStr, monthStr] = currentMonth.split('-');
        let date = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1);
        date.setMonth(date.getMonth() - 1);
        const prevMonthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

        const monthRecords = history.filter(r => r.month === currentMonth && !r.isDeleted);
        const prevMonthRecords = history.filter(r => r.month === prevMonthStr && !r.isDeleted);

        const stats = { income: { total: 0, userA: 0, userB: 0 }, expense: { total: 0, joint: 0, userA: 0, userB: 0 } };
        let dailyData = {};

        // Task 1: Dynamic Categories alignment
        const dynamicCategories = assets?.config?.categories || ["餐費", "購物", "娛樂", "其他"];
        const catStats = {};
        dynamicCategories.forEach(cat => {
            catStats[cat] = 0;
        });
        if (!catStats["其他"]) catStats["其他"] = 0;

        monthRecords.forEach(r => {
            const day = parseInt(r.date.split('-')[2]);
            if (r.type === 'income') {
                stats.income.total += r.total;
                if (r.payer.includes('大狗狗') || r.payer.includes('用戶1') || r.payer.includes('userA')) stats.income.userA += r.total; 
                else if (r.payer.includes('阿陞') || r.payer.includes('用戶2') || r.payer.includes('userB')) stats.income.userB += r.total;
            } else if (r.type === 'expense' || r.type === 'spend') {
                stats.expense.total += r.total; 
                dailyData[day] = (dailyData[day] || 0) + r.total;
                if (r.type === 'spend') stats.expense.joint += r.total;
                else if (r.type === 'expense') {
                    if (r.payer.includes('大狗狗') || r.payer.includes('用戶1') || r.payer.includes('userA')) stats.expense.userA += r.total; 
                    else if (r.payer.includes('阿陞') || r.payer.includes('用戶2') || r.payer.includes('userB')) stats.expense.userB += r.total;
                }

                if (r.type === 'expense' && r.details) {
                    dynamicCategories.forEach(cat => {
                        if (cat === '餐費') {
                            catStats[cat] += Number(r.details.food || 0);
                        } else if (cat === '購物') {
                            catStats[cat] += Number(r.details.shopping || 0);
                        } else if (cat === '娛樂') {
                            catStats[cat] += Number(r.details.entertainment || 0);
                        } else if (cat === '其他') {
                            catStats[cat] += Number((r.details.other || 0) + (r.details.fixed || 0));
                        }
                    });
                } else if (r.type === 'spend') {
                    let cat = r.subCategory || '其他';
                    if (cat.includes('餐') || cat.includes('食') || cat.includes('喝')) cat = '餐費';
                    else if (cat.includes('購') || cat.includes('用') || cat.includes('生')) cat = '購物';
                    else if (cat.includes('玩') || cat.includes('樂') || cat.includes('娛')) cat = '娛樂';
                    else cat = '其他';

                    if (catStats[cat] !== undefined) {
                        catStats[cat] += r.total;
                    } else {
                        catStats["其他"] += r.total;
                    }
                }
            }
        });

        // Task 3: Compare Month Stats per category
        const prevCatStats = {};
        dynamicCategories.forEach(cat => {
            prevCatStats[cat] = 0;
        });
        if (!prevCatStats["其他"]) prevCatStats["其他"] = 0;

        prevMonthRecords.forEach(r => {
            if (r.type === 'expense' || r.type === 'spend') {
                if (r.type === 'expense' && r.details) {
                    dynamicCategories.forEach(cat => {
                        if (cat === '餐費') {
                            prevCatStats[cat] += Number(r.details.food || 0);
                        } else if (cat === '購物') {
                            prevCatStats[cat] += Number(r.details.shopping || 0);
                        } else if (cat === '娛樂') {
                            prevCatStats[cat] += Number(r.details.entertainment || 0);
                        } else if (cat === '其他') {
                            prevCatStats[cat] += Number((r.details.other || 0) + (r.details.fixed || 0));
                        }
                    });
                } else if (r.type === 'spend') {
                    let cat = r.subCategory || '其他';
                    if (cat.includes('餐') || cat.includes('食') || cat.includes('喝')) cat = '餐費';
                    else if (cat.includes('購') || cat.includes('用') || cat.includes('生')) cat = '購物';
                    else if (cat.includes('玩') || cat.includes('樂') || cat.includes('娛')) cat = '娛樂';
                    else cat = '其他';

                    if (prevCatStats[cat] !== undefined) {
                        prevCatStats[cat] += r.total;
                    } else {
                        prevCatStats["其他"] += r.total;
                    }
                }
            }
        });

        let prevMonthExpense = 0;
        prevMonthRecords.forEach(r => { if (r.type === 'expense' || r.type === 'spend') prevMonthExpense += r.total; });

        const momDiff = stats.expense.total - prevMonthExpense;
        const momText = prevMonthExpense === 0 ? (stats.expense.total > 0 ? '無上月對比資料' : '與上月持平') : (momDiff > 0 ? `比上月多花 $${momDiff.toLocaleString()}` : `比上月省了 $${Math.abs(momDiff).toLocaleString()}`);
        const momColor = momDiff > 0 ? '#ff453a' : '#30d158';

        const netCashFlow = stats.income.total - stats.expense.total;
        const savingsRate = stats.income.total > 0 ? ((netCashFlow / stats.income.total) * 100).toFixed(1) : 0;

        const today = new Date();
        const realCurrentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
        let daysPassed = 1;
        if (currentMonth === realCurrentMonthStr) daysPassed = today.getDate() || 1; else if (currentMonth < realCurrentMonthStr) daysPassed = daysInMonth;

        const leaderboard = Object.entries(catStats).map(([name, amount]) => ({ name, amount, percentage: stats.expense.total > 0 ? ((amount / stats.expense.total) * 100).toFixed(1) : 0, dailyAvg: Math.round(amount / daysPassed) })).filter(item => item.amount > 0).sort((a, b) => b.amount - a.amount);
        
        const pieColors = Object.keys(catStats).map((_, i) => {
            const colors = ['#ff9f43', '#54a0ff', '#ff6b6b', '#10ac84', '#af52de', '#ffcc00', '#5856d6', '#34c759'];
            return colors[i % colors.length];
        });
        const pieData = { labels: Object.keys(catStats), datasets: [{ data: Object.values(catStats), backgroundColor: pieColors, borderWidth: 1 }] };

        const barLabels = Array.from({ length: daysInMonth }, (_, i) => i + 1);
        const barValues = barLabels.map(day => dailyData[day] || 0);
        const barChartData = { labels: barLabels, datasets: [{ label: '每日支出', data: barValues, backgroundColor: '#30d158', borderRadius: 4 }] };

        // Cross-month column chart (Task 3)
        const compChartData = {
            labels: Object.keys(catStats),
            datasets: [
                {
                    label: '上月支出',
                    data: Object.keys(catStats).map(cat => prevCatStats[cat] || 0),
                    backgroundColor: 'rgba(142, 142, 147, 0.4)',
                    borderRadius: 4
                },
                {
                    label: '本月支出',
                    data: Object.values(catStats),
                    backgroundColor: '#0a84ff',
                    borderRadius: 4
                }
            ]
        };

        return { stats, pieData, barChartData, compChartData, momText, momColor, netCashFlow, savingsRate, leaderboard };
    }, [history, selectedMonth, assets]);

    const budgetPercent = Math.min((dashboardData.stats.expense.total / currentBudget) * 100, 100).toFixed(1);
    let progressColor = '#30d158';
    if (budgetPercent >= 90) progressColor = '#ff453a'; else if (budgetPercent >= 70) progressColor = '#ff9f0a';

    const historyWithIndex = history.map((record, index) => ({ ...record, originalIndex: index }));
    const filteredHistory = historyWithIndex.filter(record => {
        const recordMonth = record.month || record.date.slice(0, 7);
        if (recordMonth !== filterDate) return false;
        if (filterType === 'income') { if (record.type !== 'income') return false; }
        else if (filterType === 'expense') { if (record.type !== 'expense' && record.type !== 'spend') return false; }
        else if (filterType === 'invest') {
            const investTypes = ['liquidate', 'joint_invest_buy', 'joint_invest_sell', 'personal_invest_profit', 'personal_invest_loss', 'personal_invest_buy', 'personal_invest_sell', 'exchange', 'calibrate'];
            if (!investTypes.includes(record.type)) return false;
        }
        if (filterUser !== 'all') {
            const payer = record.payer || '';
            if (filterUser === 'joint') { if (record.type !== 'spend' && record.category !== '共同支出' && !record.type.includes('joint_invest')) return false; }
            else if (filterUser === 'userA') { if (!payer.includes('大狗狗') && !payer.includes('用戶1') && !payer.includes('userA')) return false; }
            else if (filterUser === 'userB') { if (!payer.includes('阿陞') && !payer.includes('用戶2') && !payer.includes('userB')) return false; }
        }
        if (filterNecessity !== 'all') {
            const recNecessity = record.necessity || 'need';
            if (recNecessity !== filterNecessity) return false;
        }
        
        // Search & amount filters
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            const noteMatch = record.note ? record.note.toLowerCase().includes(term) : false;
            const catMatch = record.category ? record.category.toLowerCase().includes(term) : false;
            const payerMatch = record.payer ? record.payer.toLowerCase().includes(term) : false;
            const symbolMatch = record.symbol ? record.symbol.toLowerCase().includes(term) : false;
            if (!noteMatch && !catMatch && !payerMatch && !symbolMatch) return false;
        }
        if (minAmount !== '') {
            const minVal = parseMoney(minAmount);
            if (record.total < minVal) return false;
        }
        if (maxAmount !== '') {
            const maxVal = parseMoney(maxAmount);
            if (record.total > maxVal) return false;
        }
        
        return true;
    });

    const [renderCount, setRenderCount] = useState(15);
    const [prevFilterKey, setPrevFilterKey] = useState('');
    const currentFilterKey = `${filterDate}_${filterType}_${filterUser}_${searchTerm}_${minAmount}_${maxAmount}`;
    if (currentFilterKey !== prevFilterKey) {
        setPrevFilterKey(currentFilterKey);
        setRenderCount(15);
    }
    const loadMoreRef = useRef(null);

    const sortedHistory = useMemo(() =>
        [...filteredHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()),
        [filteredHistory]
    );
    const visibleHistory = sortedHistory.slice(0, renderCount);

    useEffect(() => {
        const sentinel = loadMoreRef.current;
        if (!sentinel) return;
        const observer = new IntersectionObserver(
            (entries) => { if (entries[0].isIntersecting) setRenderCount(prev => prev + 15); },
            { threshold: 0.1 }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [filteredHistory.length]);

    const renderActionRecordPreview = (record) => {
        if (!record) return null;
        const isDeleted = record.isDeleted;
        const textDeco = isDeleted ? 'line-through' : 'none';
        const borderColor = getTypeColor(record.type);

        let amountColor = '#ff453a';
        let showSign = '-';
        if (record.type === 'income') {
            amountColor = '#30d158';
            showSign = '+';
        } else if (record.type === 'calibrate') {
            amountColor = 'var(--text-tertiary)';
            showSign = record.total >= 0 ? '+' : '-';
        } else if (record.type.includes('invest_sell') || record.type === 'liquidate' || record.type === 'personal_invest_profit') {
            amountColor = '#30d158';
            showSign = '+';
        } else if (record.type === 'personal_invest_loss') {
            amountColor = '#ff453a';
            showSign = '-';
        } else if (record.type === 'spend' || record.type === 'expense' || record.type.includes('invest_buy') || record.type === 'exchange' || record.type === 'transfer') {
            amountColor = '#ff453a';
            showSign = '-';
        }

        return (
            <div 
                className="glass-card action-sheet-preview-card" 
                style={{ 
                    borderLeft: `4px solid ${borderColor}`, 
                    position: 'relative', 
                    padding: '14px 16px', 
                    width: '100%',
                    boxShadow: `0 12px 30px rgba(0, 0, 0, 0.25), 0 0 15px ${borderColor}2b`,
                    textAlign: 'left',
                    pointerEvents: 'none'
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: '700', fontSize: '0.95rem', color: 'var(--text-primary)', textDecoration: textDeco }}>{record.date || record.month}</span>
                        <span style={{ fontSize: '0.72rem', color: 'white', background: borderColor, padding: '2px 8px', borderRadius: '10px', fontWeight: '700' }}>{record.category}</span>
                        {record.advancedBy && (
                            <span style={{ fontSize: '0.72rem', border: record.isSettled ? '1px solid #30d158' : '1px solid #ff9f0a', color: record.isSettled ? '#30d158' : '#ff9f0a', padding: '1px 6px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', fontWeight: '700' }}>
                                {record.advancedBy === 'userA' ? '大狗狗 🐕' : '阿陞 🐶'}代墊 {record.isSettled ? ' (已結)' : ' (未結)'}
                            </span>
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <span style={{ fontSize: '1rem', color: 'var(--text-primary)', fontWeight: '600', textDecoration: textDeco }}>{record.note === '月結記帳' ? '日常記帳' : record.note}</span>
                    <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '1.4rem', fontWeight: '900', color: amountColor, textDecoration: textDeco, fontFamily: 'monospace' }}>{showSign}{formatMoney(record.total)}</span>
                        {record.usdAmount && (
                            <div style={{ fontSize: '0.8rem', color: '#ff9f0a', fontWeight: '600', textDecoration: textDeco }}>
                                (含美金 ${record.usdAmount.toFixed(2)} USD)
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                    {record.payer === '共同帳戶' ? <span style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '6px' }}>共同出資</span> : <span style={{ background: 'rgba(10,132,255,0.08)', color: '#409eff', padding: '2px 6px', borderRadius: '6px' }}>👤 {record.payer}</span>}
                </div>
            </div>
        );
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h1 className="page-title" style={{ margin: 0 }}>財務資料庫</h1>
                <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '20px', padding: '3px', display: 'flex', gap: '3px' }}>
                    {['chart', 'list'].map(mode => (
                        <button key={mode} onClick={() => setViewMode(mode)} style={{ background: viewMode === mode ? 'rgba(255,255,255,0.12)' : 'transparent', border: 'none', borderRadius: 'var(--radius-pill)', padding: '6px 14px', cursor: 'pointer', fontWeight: '600', color: viewMode === mode ? 'var(--text-primary)' : 'var(--text-tertiary)', fontSize: '0.84rem' }}>
                            {mode === 'chart' ? '儀表板' : '流水帳'}
                        </button>
                    ))}
                </div>
            </div>

            {viewMode === 'chart' && (
                <div className="page-transition-enter">
                    {/* Inset Grouped layout for analytics filters */}
                    <div className="inset-group-card" style={{ marginBottom: '18px' }}>
                        <div className="inset-group-row">
                            <span className="inset-group-label" style={{ fontWeight: '600' }}>📅 分析月份</span>
                            <span className="inset-group-value">
                                <input type="month" style={{ background: 'none', border: 'none', color: '#fff', textAlign: 'right', outline: 'none', fontFamily: 'var(--font-family)' }} value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
                            </span>
                        </div>
                    </div>

                    <div className="glass-card" style={{ padding: '16px', marginBottom: '18px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '800', letterSpacing: '-0.01em' }}>🎯 共同預算進度</h3>
                            {isEditingBudget ? (
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                    <input type="text" inputMode="numeric" className="glass-input" style={{ margin: 0, padding: '4px 8px', width: '100px' }} value={tempBudget} onChange={e => setTempBudget(formatInputMoney(e.target.value))} />
                                    <button className="glass-btn" style={{ padding: '4px 10px', fontSize: '0.8rem', fontWeight: '600' }} onClick={handleSaveBudget}>儲存</button>
                                </div>
                            ) : (
                                <div style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', padding: '4px 10px', borderRadius: '8px', fontWeight: '600' }} onClick={() => { setTempBudget(formatInputMoney(assets.monthlyBudget || 25000)); setIsEditingBudget(true); }}>
                                    設定預算: {formatMoney(currentBudget)} ✏️
                                </div>
                            )}
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '10px', height: '12px', width: '100%', overflow: 'hidden' }}>
                            <div style={{ background: progressColor, width: `${budgetPercent}%`, height: '100%', transition: 'width 0.5s ease' }}></div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: '600' }}>
                            <span>已花 {formatMoney(dashboardData.stats.expense.total)}</span><span>剩餘 {formatMoney(Math.max(currentBudget - dashboardData.stats.expense.total, 0))} ({budgetPercent}%)</span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', marginBottom: '18px', flexWrap: 'wrap' }}>
                        <div className="glass-card card-animate" style={{ flex: 1, minWidth: '120px', padding: '16px', textAlign: 'center', background: 'linear-gradient(135deg, rgba(48,209,88,0.12), rgba(48,209,88,0.02))' }}>
                            <div className="nobrk" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: '600' }}>總收入</div>
                            <div className="nobrk" style={{ fontSize: '1.4rem', fontWeight: '900', color: '#30d158', marginBottom: '5px', letterSpacing: '-0.02em' }}>{formatMoney(dashboardData.stats.income.total)}</div>
                            <div style={{ fontSize: '0.73rem', color: 'var(--text-tertiary)', borderTop: '0.5px solid rgba(255,255,255,0.08)', paddingTop: '6px', display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '4px' }}>
                                <span className="nobrk">大狗狗: {formatMoney(dashboardData.stats.income.userA)}</span>
                                <span className="nobrk">|</span>
                                <span className="nobrk">阿陞: {formatMoney(dashboardData.stats.income.userB)}</span>
                            </div>
                        </div>
                        <div className="glass-card card-animate" style={{ flex: 1, minWidth: '120px', padding: '16px', textAlign: 'center', background: 'linear-gradient(135deg, rgba(255,69,58,0.1), rgba(255,69,58,0.02))' }}>
                            <div className="nobrk" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: '600' }}>總支出</div>
                            <div className="nobrk" style={{ fontSize: '1.4rem', fontWeight: '900', color: '#ff453a', marginBottom: '5px', letterSpacing: '-0.02em' }}>{formatMoney(dashboardData.stats.expense.total)}</div>
                            <div style={{ fontSize: '0.73rem', color: dashboardData.momColor, fontWeight: '700', borderTop: '0.5px solid rgba(255,255,255,0.08)', paddingTop: '6px' }}>
                                <span className="nobrk">{dashboardData.momText}</span>
                            </div>
                        </div>
                        <div className="glass-card card-animate" style={{ flex: 1, minWidth: '140px', padding: '16px', textAlign: 'center', background: 'linear-gradient(135deg, rgba(10,132,255,0.1), rgba(10,132,255,0.02))' }}>
                            <div className="nobrk" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: '600' }}>本月儲蓄 (淨現金流)</div>
                            <div className="nobrk" style={{ fontSize: '1.4rem', fontWeight: '900', color: dashboardData.netCashFlow >= 0 ? '#0a84ff' : '#ff453a', marginBottom: '5px', letterSpacing: '-0.02em' }}>
                                {dashboardData.netCashFlow > 0 ? '+' : ''}{formatMoney(dashboardData.netCashFlow)}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', borderTop: '0.5px solid rgba(255,255,255,0.08)', paddingTop: '6px' }}>
                                <span className="nobrk">儲蓄率: <span style={{ fontWeight: '800', color: '#0a84ff' }}>{dashboardData.savingsRate}%</span></span>
                            </div>
                        </div>
                    </div>

                    {dashboardData.stats.expense.total === 0 ? (
                        <div className="glass-card" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-tertiary)' }}>🦕 本月尚無支出數據登錄。</div>
                    ) : (
                        <>
                            <div style={{ display: 'flex', gap: '12px', marginBottom: '18px', flexWrap: 'wrap' }}>
                                <div className="glass-card" style={{ flex: 1, minWidth: '280px' }}>
                                    <h4 style={{ margin: '0 0 12px 0', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: '700', fontSize: '0.9rem' }}>支出比例分佈</h4>
                                    <div style={{ height: '180px', display: 'flex', justifyContent: 'center' }}><Pie data={dashboardData.pieData} options={{
                                        maintainAspectRatio: false,
                                        plugins: {
                                            legend: {
                                                labels: { color: 'var(--text-secondary)', font: { size: 10 } }
                                            },
                                            tooltip: {
                                                backgroundColor: 'rgba(28, 28, 30, 0.95)',
                                                titleColor: '#ffffff',
                                                bodyColor: '#ffffff',
                                                borderColor: 'rgba(255, 255, 255, 0.12)',
                                                borderWidth: 1,
                                                padding: 10,
                                                cornerRadius: 8,
                                                titleFont: { size: 12, weight: 'bold' },
                                                bodyFont: { size: 11 }
                                            }
                                        }
                                    }} /></div>
                                </div>
                                <div className="glass-card" style={{ flex: 1.5, minWidth: '280px' }}>
                                    <h4 style={{ margin: '0 0 12px 0', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: '700', fontSize: '0.9rem' }}>支出明細排行榜</h4>
                                    <div>
                                        {dashboardData.leaderboard.map((item, idx) => (
                                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '1rem', width: '24px', textAlign: 'center' }}>{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '•'}</span>
                                                    <div>
                                                        <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '0.88rem' }}>{item.name}</div>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>佔比 {item.percentage}%</div>
                                                    </div>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontWeight: '700', color: '#ff453a', fontSize: '0.92rem' }}>{formatMoney(item.amount)}</div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>日均: <span style={{ fontWeight: '600' }}>{formatMoney(item.dailyAvg)}</span></div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Task 3: Cross-month comparison Column Chart */}
                            <div className="glass-card" style={{ marginBottom: '18px' }}>
                                <h4 style={{ margin: '0 0 12px 0', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: '700', fontSize: '0.9rem' }}>📊 本月 vs 上月同分類開銷對比</h4>
                                <div style={{ height: '220px' }}>
                                    <Bar data={dashboardData.compChartData} options={{
                                        maintainAspectRatio: false,
                                        plugins: {
                                            legend: {
                                                labels: { color: 'var(--text-secondary)', font: { size: 10 } }
                                            },
                                            tooltip: {
                                                backgroundColor: 'rgba(28, 28, 30, 0.95)',
                                                titleColor: '#ffffff',
                                                bodyColor: '#ffffff',
                                                borderColor: 'rgba(255, 255, 255, 0.12)',
                                                borderWidth: 1,
                                                padding: 10,
                                                cornerRadius: 8
                                            }
                                        },
                                        scales: {
                                            x: { grid: { display: false }, ticks: { color: 'var(--text-tertiary)', font: { size: 10 } } },
                                            y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: 'var(--text-tertiary)', font: { size: 10 } } }
                                        }
                                    }} />
                                </div>
                            </div>

                            <div className="glass-card" style={{ marginBottom: '18px' }}>
                                <h4 style={{ margin: '0 0 12px 0', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: '700', fontSize: '0.9rem' }}>每日支出趨勢</h4>
                                <div style={{ height: '200px' }}><Bar data={dashboardData.barChartData} options={{
                                    maintainAspectRatio: false,
                                    plugins: {
                                        legend: { display: false },
                                        tooltip: {
                                            backgroundColor: 'rgba(28, 28, 30, 0.95)',
                                            titleColor: '#ffffff',
                                            bodyColor: '#ffffff',
                                            borderColor: 'rgba(255, 255, 255, 0.12)',
                                            borderWidth: 1,
                                            padding: 10,
                                            cornerRadius: 8
                                        }
                                    },
                                    scales: {
                                        x: { grid: { display: false }, ticks: { color: 'var(--text-tertiary)', font: { size: 9 } } },
                                        y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: 'var(--text-tertiary)', font: { size: 9 } } }
                                    }
                                }} /></div>
                            </div>
                        </>
                    )}

                    <div className="glass-card card-animate" style={{ marginBottom: '18px', borderLeft: '4px solid var(--accent-yellow)', padding: '16px' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '0.95rem', color: 'var(--accent-orange)', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                            </svg>
                            代墊款結算中心
                        </h3>
                        {['userA', 'userB'].map(user => {
                            const debt = calculateDebt(user);
                            const name = user === 'userA' ? '大狗狗 🐕' : '阿陞 🐶';
                            return (
                                <div key={user} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
                                    <div>
                                        <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.88rem' }}>{name} 代墊款項</div>
                                        {debt > 0 ? (<div style={{ fontSize: '0.78rem', color: 'var(--accent-blue)', textDecoration: 'underline', cursor: 'pointer', fontWeight: '600' }} onClick={() => { setSettlementTarget(user); setShowSettlementModal(true); }}>明細及對帳單</div>) : (<div style={{ fontSize: '0.78rem', color: '#30d158', fontWeight: '600' }}>已全數清算結案</div>)}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ fontSize: '1.2rem', fontWeight: '800', color: debt > 0 ? 'var(--accent-orange)' : 'var(--text-tertiary)', fontFamily: 'monospace' }}>{formatMoney(debt)}</span>
                                        {debt > 0 && <button className="glass-btn glass-btn-cta" style={{ padding: '6px 14px', fontSize: '0.8rem', fontWeight: '700' }} onClick={() => handleSettle(user)}>一鍵結清</button>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {viewMode === 'list' && (
                <>
                    {/* Inset Grouped lists for database filters */}
                    <div className="inset-group-card" style={{ marginBottom: '18px' }}>
                        <div className="inset-group-row">
                            <span className="inset-group-label">選擇月份</span>
                            <span className="inset-group-value">
                                <input type="month" style={{ background: 'none', border: 'none', color: '#fff', textAlign: 'right', outline: 'none', fontFamily: 'var(--font-family)' }} value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
                            </span>
                        </div>
                        <div className="inset-group-row">
                            <span className="inset-group-label">交易類型</span>
                            <span className="inset-group-value">
                                <select style={{ background: 'none', border: 'none', color: '#fff', textAlign: 'right', outline: 'none', fontSize: '0.88rem', fontFamily: 'var(--font-family)', direction: 'rtl' }} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                                    <option value="all">全部類型</option>
                                    <option value="expense">日常支出</option>
                                    <option value="income">一般收入</option>
                                    <option value="invest">投資與外幣</option>
                                </select>
                            </span>
                        </div>
                        <div className="inset-group-row">
                            <span className="inset-group-label">記帳對象</span>
                            <span className="inset-group-value">
                                <select style={{ background: 'none', border: 'none', color: '#fff', textAlign: 'right', outline: 'none', fontSize: '0.88rem', fontFamily: 'var(--font-family)', direction: 'rtl' }} value={filterUser} onChange={(e) => setFilterUser(e.target.value)}>
                                    <option value="all">全部對象</option>
                                    <option value="joint">共同帳戶 🏫</option>
                                    <option value="userA">大狗狗 🐕</option>
                                    <option value="userB">阿陞 🐶</option>
                                </select>
                            </span>
                        </div>
                        <div className="inset-group-row">
                            <span className="inset-group-label">支出性質</span>
                            <span className="inset-group-value">
                                <select style={{ background: 'none', border: 'none', color: '#fff', textAlign: 'right', outline: 'none', fontSize: '0.88rem', fontFamily: 'var(--font-family)', direction: 'rtl' }} value={filterNecessity} onChange={(e) => setFilterNecessity(e.target.value)}>
                                    <option value="all">全部性質</option>
                                    <option value="need">必要支出 🍲</option>
                                    <option value="want">選擇性消費 ✨</option>
                                </select>
                            </span>
                        </div>
                    </div>

                    <div className="inset-group-card" style={{ marginBottom: '18px' }}>
                        <div className="inset-group-row">
                            <span className="inset-group-label">關鍵字搜尋</span>
                            <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                                <input type="text" placeholder="輸入備註/對象/分類" className="inset-group-input" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                            </span>
                        </div>
                        <div className="inset-group-row">
                            <span className="inset-group-label">金額下限</span>
                            <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                                <input type="text" inputMode="numeric" placeholder="最小金額" className="inset-group-input" value={minAmount} onChange={(e) => setMinAmount(formatInputMoney(e.target.value))} />
                            </span>
                        </div>
                        <div className="inset-group-row">
                            <span className="inset-group-label">金額上限</span>
                            <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                                <input type="text" inputMode="numeric" placeholder="最大金額" className="inset-group-input" value={maxAmount} onChange={(e) => setMaxAmount(formatInputMoney(e.target.value))} />
                            </span>
                        </div>
                    </div>

                    {filteredHistory.length === 0 ? (
                        <div className="glass-card" style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '30px' }}><p>📭 沒有符合篩選條件的交易紀錄。</p></div>
                    ) : (
                        <>
                            <div style={{
                                fontSize: '0.78rem',
                                color: 'var(--text-tertiary)',
                                marginBottom: '10px',
                                paddingLeft: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}>
                                <span>✦ 輕觸任意紀錄可進行修改備註或作廢沖銷</span>
                            </div>
                            {visibleHistory.map((record) => {
                                let showSign = ''; let amountColor = 'var(--text-primary)';
                                if (['income', 'liquidate', 'joint_invest_sell', 'personal_invest_profit', 'personal_invest_sell'].includes(record.type)) { showSign = '+'; amountColor = '#30d158'; }
                                else if (['expense', 'personal_invest_loss', 'spend', 'joint_invest_buy', 'personal_invest_buy'].includes(record.type)) { showSign = '-'; amountColor = 'var(--text-primary)'; }
                                else if (['settle', 'transfer', 'exchange', 'calibrate'].includes(record.type)) {
                                    showSign = '🔄 ';
                                    amountColor = record.type === 'calibrate' ? 'var(--text-tertiary)' : '#0a84ff';
                                }

                                const isDeleted = record.isDeleted;
                                const opacity = isDeleted ? 0.5 : 1;
                                const textDeco = isDeleted ? 'line-through' : 'none';
                                if (isDeleted) amountColor = '#8e8e93';
                                const borderColor = isDeleted ? '#8e8e93' : getTypeColor(record.type);

                                return (
                                    <div 
                                        key={record.originalIndex} 
                                        className="glass-card" 
                                        // HIG 2: Tap list row to open bottom action sheet modal
                                        onClick={() => { if (!isDeleted) setActiveActionRecord(record); }}
                                        style={{ 
                                            marginBottom: '12px', 
                                            borderLeft: `4px solid ${borderColor}`, 
                                            position: 'relative', 
                                            padding: '14px 16px', 
                                            opacity: opacity,
                                            cursor: isDeleted ? 'default' : 'pointer',
                                            transition: 'transform 0.2s ease, background 0.2s ease'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                <span style={{ fontWeight: '700', fontSize: '0.95rem', color: 'var(--text-primary)', textDecoration: textDeco }}>{record.date || record.month}</span>
                                                <span style={{ fontSize: '0.72rem', color: 'white', background: borderColor, padding: '2px 8px', borderRadius: '10px', fontWeight: '700' }}>{record.category}</span>
                                                {record.advancedBy && (
                                                    <span style={{ fontSize: '0.72rem', border: record.isSettled ? '1px solid #30d158' : '1px solid #ff9f0a', color: record.isSettled ? '#30d158' : '#ff9f0a', padding: '1px 6px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', fontWeight: '700' }}>
                                                        {record.advancedBy === 'userA' ? '大狗狗 🐕' : '阿陞 🐶'}代墊 {record.isSettled ? ' (已結)' : ' (未結)'}
                                                    </span>
                                                )}
                                            </div>
                                            {isDeleted && (
                                                <span style={{ background: 'rgba(255,69,58,0.12)', color: '#ff453a', padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: '700' }}>🚫 作廢</span>
                                            )}
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                                            <span style={{ fontSize: '1rem', color: 'var(--text-primary)', fontWeight: '600', textDecoration: textDeco }}>{record.note === '月結記帳' ? '日常記帳' : record.note}</span>
                                            <div style={{ textAlign: 'right' }}>
                                                <span style={{ fontSize: '1.4rem', fontWeight: '900', color: amountColor, textDecoration: textDeco, fontFamily: 'monospace' }}>{showSign}{formatMoney(record.total)}</span>
                                                {record.usdAmount && (
                                                    <div style={{ fontSize: '0.8rem', color: isDeleted ? 'var(--text-tertiary)' : '#ff9f0a', fontWeight: '600', textDecoration: textDeco }}>
                                                        (含美金 ${record.usdAmount.toFixed(2)} USD)
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                                            {record.payer === '共同帳戶' ? <span style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '6px' }}>共同出資</span> : <span style={{ background: 'rgba(10,132,255,0.08)', color: '#409eff', padding: '2px 6px', borderRadius: '6px' }}>👤 {record.payer}</span>}
                                        </div>

                                        {isDeleted && record.deleteReason && (<div style={{ marginTop: '8px', fontSize: '0.78rem', color: '#ff453a', background: 'rgba(255,69,58,0.05)', padding: '8px', borderRadius: '8px', border: '1px dashed rgba(255,69,58,0.15)' }}><strong>作廢原因：</strong> {record.deleteReason}</div>)}

                                        {record.auditTrail && !isDeleted && (
                                            <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.03)', padding: '8px 10px', borderRadius: '8px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
                                                <div style={{ marginBottom: '4px', fontWeight: '700', color: 'var(--text-primary)' }}>餘額變動軌跡：</div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                    {record.auditTrail.after.jointCash !== record.auditTrail.before.jointCash && (() => {
                                                        const diff = (record.auditTrail.after.jointCash || 0) - (record.auditTrail.before.jointCash || 0);
                                                        return <div>共同現金: <span style={{ textDecoration: 'line-through', color: 'var(--text-tertiary)' }}>{formatMoney(record.auditTrail.before.jointCash || 0)}</span> ➡️ <span style={{ fontWeight: '700', color: diff > 0 ? '#30d158' : '#ff453a' }}>{formatMoney(record.auditTrail.after.jointCash || 0)}</span> <span style={{ fontSize: '0.7rem' }}>({diff > 0 ? '+' : ''}{formatMoney(diff)})</span></div>;
                                                    })()}

                                                    {record.auditTrail.after.userA !== record.auditTrail.before.userA && (() => {
                                                        const diff = (record.auditTrail.after.userA || 0) - (record.auditTrail.before.userA || 0);
                                                        return <div>大狗狗: <span style={{ textDecoration: 'line-through', color: 'var(--text-tertiary)' }}>{formatMoney(record.auditTrail.before.userA || 0)}</span> ➡️ <span style={{ fontWeight: '700', color: diff > 0 ? '#30d158' : '#ff453a' }}>{formatMoney(record.auditTrail.after.userA || 0)}</span> <span style={{ fontSize: '0.7rem' }}>({diff > 0 ? '+' : ''}{formatMoney(diff)})</span></div>;
                                                    })()}

                                                    {record.auditTrail.after.userB !== record.auditTrail.before.userB && (() => {
                                                        const diff = (record.auditTrail.after.userB || 0) - (record.auditTrail.before.userB || 0);
                                                        return <div>阿陞: <span style={{ textDecoration: 'line-through', color: 'var(--text-tertiary)' }}>{formatMoney(record.auditTrail.before.userB || 0)}</span> ➡️ <span style={{ fontWeight: '700', color: diff > 0 ? '#30d158' : '#ff453a' }}>{formatMoney(record.auditTrail.after.userB || 0)}</span> <span style={{ fontSize: '0.7rem' }}>({diff > 0 ? '+' : ''}{formatMoney(diff)})</span></div>;
                                                    })()}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {renderCount < sortedHistory.length && (
                                <div ref={loadMoreRef} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)', fontSize: '0.82rem', fontWeight: '600' }}>
                                    捲動載入更多 ({renderCount}/{sortedHistory.length})
                                </div>
                            )}
                        </>
                    )}
                </>
            )}

            {/* HIG 2: Centered Floating Action Menu with Context Highlight Preview */}
            {activeActionRecord && createPortal(
                <div className="action-sheet-overlay" onClick={() => setActiveActionRecord(null)}>
                    <div className="action-sheet-container" onClick={e => e.stopPropagation()}>
                        {/* Selected Item Preview Card */}
                        {renderActionRecordPreview(activeActionRecord)}

                        {/* Floating Action Menu Card */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                            <div className="action-sheet-group" style={{ background: 'rgba(30, 30, 32, 0.95)', border: '1px solid rgba(255, 255, 255, 0.12)', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)' }}>
                                <div className="action-sheet-title" style={{ padding: '12px 16px', fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-secondary)' }}>選擇操作</div>
                                <button className="action-sheet-btn" onClick={() => {
                                    const record = activeActionRecord;
                                    setActiveActionRecord(null);
                                    setEditModalData({ context: record._context, index: record.originalIndex, date: record.date || record.month, category: record.category, note: record.note });
                                }}>
                                    ✏️ 修改備註與日期
                                </button>
                                {activeActionRecord.category !== '作廢退款' && (
                                    <button className="action-sheet-btn destructive" onClick={async () => {
                                        const record = activeActionRecord;
                                        setActiveActionRecord(null);
                                        if (await customConfirm(`⚠️ 確定要作廢此筆紀錄？\n系統將自動反向退款沖銷，恢復到交易前狀態。`)) {
                                            onDelete(record._context);
                                        }
                                    }}>
                                        🗑️ 作廢此筆交易 (產生反向沖銷)
                                    </button>
                                )}
                            </div>
                            <div className="action-sheet-group" style={{ boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)' }}>
                                <button className="action-sheet-btn action-sheet-cancel" onClick={() => setActiveActionRecord(null)}>
                                    取消
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* HIG 5: Card Sheet Edit Modal (Bottom Sheet style) */}
            {editModalData && createPortal(
                <div className="card-sheet-overlay active" onClick={() => setEditModalData(null)}>
                    <div className="card-sheet active" onClick={e => e.stopPropagation()}>
                        <div className="card-sheet-indicator" />
                        <div className="card-sheet-header">
                            <button className="card-sheet-btn-text" onClick={() => setEditModalData(null)}>取消</button>
                            <span className="card-sheet-title">修改文字紀錄</span>
                            <button className="card-sheet-btn-text bold-blue" onClick={() => { onEdit(editModalData.context, editModalData); setEditModalData(null); }}>儲存</button>
                        </div>

                        <div className="card-sheet-content">
                            <div className="inset-group-card" style={{ marginBottom: '16px', background: 'rgba(255,69,58,0.06)', border: '1px solid rgba(255,69,58,0.15)' }}>
                                <div style={{ padding: '12px', fontSize: '0.8rem', color: '#ff453a', lineHeight: '1.4' }}>
                                    <strong>⚠️ 會計安全鎖定</strong><br />
                                    系統禁止直接修改「金額」與「帳戶」。若金額輸入錯誤，請取消修改，並將原紀錄「作廢🗑️」後重新記帳。
                                </div>
                            </div>

                            <div className="inset-group-card">
                                <div className="inset-group-row">
                                    <span className="inset-group-label">📅 交易日期</span>
                                    <span className="inset-group-value">
                                        <input type="date" style={{ background: 'none', border: 'none', color: '#fff', textAlign: 'right', outline: 'none', fontFamily: 'var(--font-family)' }} value={editModalData.date} onChange={e => setEditModalData({ ...editModalData, date: e.target.value })} />
                                    </span>
                                </div>
                                <div className="inset-group-row">
                                    <span className="inset-group-label">🏷️ 分類 (唯讀)</span>
                                    <span className="inset-group-value" style={{ color: 'var(--text-tertiary)' }}>{editModalData.category}</span>
                                </div>
                                <div className="inset-group-row">
                                    <span className="inset-group-label">📝 備註</span>
                                    <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                                        <input type="text" className="inset-group-input" value={editModalData.note} onChange={e => setEditModalData({ ...editModalData, note: e.target.value })} placeholder="例如：手搖杯飲料" />
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* HIG 5: Card Sheet Settlement Details Modal (Bottom Sheet style) */}
            {showSettlementModal && settlementTarget && createPortal(
                <div className="card-sheet-overlay active" onClick={() => setShowSettlementModal(false)}>
                    <div className="card-sheet active" onClick={e => e.stopPropagation()}>
                        <div className="card-sheet-indicator" />
                        <div className="card-sheet-header">
                            <button className="card-sheet-btn-text" onClick={() => setShowSettlementModal(false)}>關閉</button>
                            <span className="card-sheet-title">{settlementTarget === 'userA' ? '大狗狗 🐕' : '阿陞 🐶'} 的代墊明細</span>
                            <span style={{ width: '40px' }} />
                        </div>

                        <div className="card-sheet-content" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                            <div className="inset-group-card">
                                {getDebtList(settlementTarget).map((r, idx) => (
                                    <div key={idx} className="inset-group-row" style={{ padding: '12px 14px' }}>
                                        <span className="inset-group-label" style={{ fontSize: '0.86rem' }}>
                                            <span style={{ color: 'var(--text-tertiary)', marginRight: '8px', fontSize: '0.78rem' }}>{r.date}</span>
                                            {r.note}
                                        </span>
                                        <span className="inset-group-value" style={{ fontWeight: '700' }}>
                                            {formatMoney(r.total)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default MonthlyView;