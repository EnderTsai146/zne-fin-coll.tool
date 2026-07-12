// src/components/MonthlyView.jsx
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { computeDynamicNecessities } from '../utils/budgetUtils';
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

const MonthlyView = ({
  assets,
  combinedHistory,
  loadArchiveMonth,
  onDelete,
  onEdit,
  setAssets,
  currentUser,
  customAlert,
  customConfirm,
  logOperation,
  newlyAddedRecordTimestamp
}) => {
    const history = useMemo(() => combinedHistory || [], [combinedHistory]);
    const historyWithIndex = useMemo(() => history.map((record, index) => ({ ...record, originalIndex: index })), [history]);

    const [viewMode, setViewMode] = useState('list');
    const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 7));
    const [filterType, setFilterType] = useState('all');
    const [filterUser, setFilterUser] = useState('all');
    const [filterNecessity, setFilterNecessity] = useState('all');

    // Advanced search & filter states
    const [searchTerm, setSearchTerm] = useState('');
    const [minAmount, setMinAmount] = useState('');
    const [maxAmount, setMaxAmount] = useState('');

    const [showSettlementModal, setShowSettlementModal] = useState(false);
    const [settlementTarget, setSettlementTarget] = useState(null);

    // Unified Detail & Edit modal states
    const [detailModalRecord, setDetailModalRecord] = useState(null);
    const [editDate, setEditDate] = useState('');
    const [editNote, setEditNote] = useState('');

    const dynamicNecessityMap = useMemo(() => {
        return computeDynamicNecessities(historyWithIndex, assets);
    }, [historyWithIndex, assets]);

    // Unify month filter & default to the latest month with data if current month is empty
    const defaultAttempted = useRef(false);
    useEffect(() => {
        if (history.length > 0 && !defaultAttempted.current) {
            const currentMonthStr = new Date().toISOString().slice(0, 7);
            const currentMonthHasData = history.some(r => (r.month || r.date?.slice(0, 7)) === currentMonthStr);
            if (!currentMonthHasData) {
                const months = history.map(r => r.month || r.date?.slice(0, 7)).filter(Boolean);
                if (months.length > 0) {
                    const sorted = [...new Set(months)].sort();
                    const latest = sorted[sorted.length - 1];
                    setFilterDate(latest);
                }
            }
            defaultAttempted.current = true;
        }
    }, [history]);

    // Apply filters
    const filteredHistory = useMemo(() => {
        return historyWithIndex.filter(record => {
            // Month filter
            const recMonth = record.month || record.date?.slice(0, 7);
            if (recMonth !== filterDate) return false;
            
            // Type filter
            if (filterType !== 'all') {
                if (filterType === 'expense' && record.type !== 'expense' && record.type !== 'spend') return false;
                if (filterType === 'income' && record.type !== 'income') return false;
                if (filterType === 'transfer' && record.type !== 'transfer') return false;
                if (filterType === 'exchange' && record.type !== 'exchange') return false;
                if (filterType === 'calibrate' && record.type !== 'calibrate') return false;
            }
            
            // User filter
            if (filterUser !== 'all') {
                const payer = record.payer || '';
                if (filterUser === 'joint') {
                    if (record.type !== 'spend' && record.category !== '共同支出' && !record.type.includes('joint_invest')) return false;
                } else if (filterUser === 'userA') {
                    if (!payer.includes('大狗狗') && !payer.includes('用戶1') && !payer.includes('userA')) return false;
                } else if (filterUser === 'userB') {
                    if (!payer.includes('阿陞') && !payer.includes('用戶2') && !payer.includes('userB')) return false;
                }
            }

            // Necessity filter using split object
            if (filterNecessity !== 'all') {
                const itemNec = dynamicNecessityMap[record.originalIndex] || { needAmount: record.total, wantAmount: 0 };
                if (filterNecessity === 'need' && !(itemNec.needAmount > 0)) return false;
                if (filterNecessity === 'want' && !(itemNec.wantAmount > 0)) return false;
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
    }, [historyWithIndex, filterDate, filterType, filterUser, filterNecessity, searchTerm, minAmount, maxAmount, dynamicNecessityMap]);

    // Sort: newest first
    const sortedHistory = useMemo(() => {
        return [...filteredHistory].sort((a, b) => {
            const dateA = a.date || '';
            const dateB = b.date || '';
            if (dateA !== dateB) return dateB.localeCompare(dateA);
            const tsA = a.timestamp || '';
            const tsB = b.timestamp || '';
            return tsB.localeCompare(tsA);
        });
    }, [filteredHistory]);

    // Infinite scroll
    const [renderCount, setRenderCount] = useState(30);
    const loadMoreRef = useRef(null);

    useEffect(() => {
        setRenderCount(30); // Reset when filter changes
    }, [filterDate, filterType, filterUser, filterNecessity, searchTerm, minAmount, maxAmount]);

    useEffect(() => {
        if (viewMode !== 'list') return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                setRenderCount(prev => Math.min(prev + 30, sortedHistory.length));
            }
        }, { threshold: 0.1 });
        if (loadMoreRef.current) observer.observe(loadMoreRef.current);
        return () => observer.disconnect();
    }, [sortedHistory, viewMode]);

    // Block page scrolling when overlay modals are open
    useEffect(() => {
        const shouldLock = !!detailModalRecord || showSettlementModal;
        if (shouldLock) {
            document.body.classList.add('modal-open');
        } else {
            document.body.classList.remove('modal-open');
        }
        return () => {
            document.body.classList.remove('modal-open');
        };
    }, [detailModalRecord, showSettlementModal]);

    // Math stats for filtered records
    const totals = useMemo(() => {
        let personal = 0;
        let joint = 0;
        let income = 0;
        let transfer = 0;
        let exchange = 0;
        let calibrate = 0;
        let userAPersonal = 0;
        let userBPersonal = 0;
        
        filteredHistory.forEach(r => {
            if (r.isDeleted) return;
            if (r.type === 'expense') {
                personal += r.total;
                const payer = r.payer || '';
                if (payer.includes('大狗狗') || payer.includes('userA')) {
                    userAPersonal += r.total;
                } else if (payer.includes('阿陞') || payer.includes('userB')) {
                    userBPersonal += r.total;
                }
            }
            else if (r.type === 'spend') joint += r.total;
            else if (r.type === 'income') income += r.total;
            else if (r.type === 'transfer') transfer += r.total;
            else if (r.type === 'exchange') exchange += r.total;
            else if (r.type === 'calibrate') calibrate += r.total;
        });
        
        return { personal, joint, income, transfer, exchange, calibrate, userAPersonal, userBPersonal };
    }, [filteredHistory]);

    // Pie chart helper datasets
    const categoryDistribution = useMemo(() => {
        const categories = {};
        filteredHistory.forEach(r => {
            if (r.isDeleted) return;
            if (r.type !== 'expense' && r.type !== 'spend') return;
            
            const details = r.details || {};
            if (details.food) categories['餐費'] = (categories['餐費'] || 0) + Number(details.food);
            if (details.shopping) categories['購物'] = (categories['購物'] || 0) + Number(details.shopping);
            if (details.entertainment) categories['娛樂'] = (categories['娛樂'] || 0) + Number(details.entertainment);
            
            const otherVal = Number(details.other || 0) + Number(details.fixed || 0);
            if (otherVal > 0) categories['其他'] = (categories['其他'] || 0) + otherVal;
            
            if (!details.food && !details.shopping && !details.entertainment && !details.other) {
                const legacyCat = r.category || '其他';
                categories[legacyCat] = (categories[legacyCat] || 0) + r.total;
            }
        });
        
        const labels = Object.keys(categories);
        const data = Object.values(categories);
        const colors = ['#ff2d55', '#ff9500', '#af52de', '#8e8e93', '#30d158', '#0a84ff'];
        
        return {
            labels,
            datasets: [{
                data,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 0
            }]
        };
    }, [filteredHistory]);

    // Bar chart daily spending
    const dailySpendingData = useMemo(() => {
        const days = {};
        filteredHistory.forEach(r => {
            if (r.isDeleted) return;
            if (r.type !== 'expense' && r.type !== 'spend') return;
            const d = r.date || '其他';
            days[d] = (days[d] || 0) + r.total;
        });
        const labels = Object.keys(days).sort();
        const data = labels.map(l => days[l]);
        
        return {
            labels,
            datasets: [{
                label: '每日支出',
                data,
                backgroundColor: 'rgba(10, 132, 255, 0.6)',
                borderRadius: 4
            }]
        };
    }, [filteredHistory]);

    // Payers distribution stats
    const payerStats = useMemo(() => {
        let dogTwd = 0;
        let shengTwd = 0;
        
        filteredHistory.forEach(r => {
            if (r.isDeleted) return;
            if (r.type !== 'expense' && r.type !== 'spend') return;
            const payer = r.payer || '';
            if (payer.includes('大狗狗') || payer.includes('用戶1') || payer.includes('userA')) {
                dogTwd += r.total;
            } else if (payer.includes('阿陞') || payer.includes('用戶2') || payer.includes('userB')) {
                shengTwd += r.total;
            }
        });
        
        return { dogTwd, shengTwd };
    }, [filteredHistory]);

    // Debt lists calculation
    const getDebtList = (user) => {
        return filteredHistory.filter(r => {
            if (r.isDeleted) return false;
            if (r.type !== 'spend') return false;
            if (r.isSettled) return false;
            if (user === 'userA' && r.advancedBy === 'userA') return true;
            if (user === 'userB' && r.advancedBy === 'userB') return true;
            return false;
        });
    };

    const handleSettle = async (user) => {
        const debts = getDebtList(user);
        const totalDebt = debts.reduce((sum, r) => sum + r.total, 0);
        const half = Math.round(totalDebt / 2);

        const label = user === 'userA' ? '大狗狗 🐕' : '阿陞 🐶';
        const partnerLabel = user === 'userA' ? '阿陞 🐶' : '大狗狗 🐕';
        
        const confirmMsg = `確定為 ${label} 辦理一鍵結清嗎？\n本次結清 ${debts.length} 筆，代墊總額 ${formatMoney(totalDebt)}。\n應由 ${partnerLabel} 轉移支付半數 $${half.toLocaleString()} 元。`;
        
        if (!(await customConfirm(confirmMsg, "一鍵結清"))) return;

        // Reset and update state
        const settleId = generateSettleId();
        const updatedHistory = history.map(r => {
            const match = debts.some(d => d.originalIndex === r.originalIndex);
            if (match) {
                return { ...r, isSettled: true, settlementId: settleId };
            }
            return r;
        });

        // Add settlement log record
        const settlementLog = {
            date: new Date().toISOString().split('T')[0],
            month: filterDate,
            type: 'settlement',
            category: '代墊結清',
            total: half,
            payer: partnerLabel,
            operator: currentUser,
            note: `[代墊結清] 結清${label}代墊的 ${debts.length} 筆帳目 (代墊總額: $${totalDebt.toLocaleString()})`,
            timestamp: new Date().toISOString()
        };

        const finalAssets = {
            ...assets,
            monthlyExpenses: [
                ...updatedHistory,
                settlementLog
            ]
        };

        setAssets(finalAssets);
        onTransaction(finalAssets, settlementLog);
        await customAlert(`🎉 結清成功！已生成一筆結清紀錄。`);
    };

    const currentMonthLabel = filterDate.replace('-', ' 年 ') + ' 月';

    return (
        <div className="overview-container" style={{ paddingBottom: '90px' }}>
            
            {/* Unified Top Banner */}
            <div className="header-glass-banner" style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div className="banner-glow-spot" />
                <h2 style={{ fontSize: '1.4rem', fontWeight: '850', color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    📖 財務流水帳 & 報表
                </h2>
                <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)', margin: 0 }}>
                    查詢、作廢交易紀錄，以及月度數據分析
                </p>
            </div>

            {/* Filter controls widget */}
            <div className="glass-card" style={{ marginBottom: '18px', padding: '14px 16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                    <div>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', display: 'block', marginBottom: '4px' }}>📅 查詢月份</label>
                        <input
                            type="month"
                            value={filterDate}
                            onChange={(e) => {
                                setFilterDate(e.target.value);
                                if (loadArchiveMonth) loadArchiveMonth(e.target.value);
                            }}
                            className="glass-input"
                            style={{ width: '100%', margin: 0, padding: '0 8px', height: '38px', fontSize: '0.82rem' }}
                        />
                    </div>
                    <div>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', display: 'block', marginBottom: '4px' }}>📊 交易類型</label>
                        <select
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                            className="glass-input"
                            style={{ width: '100%', margin: 0, padding: '0 8px', height: '38px', fontSize: '0.82rem' }}
                        >
                            <option value="all">全部類型</option>
                            <option value="expense">個人支出</option>
                            <option value="income">個人收入</option>
                            <option value="transfer">資金劃撥</option>
                            <option value="exchange">貨幣換匯</option>
                            <option value="calibrate">餘額校正</option>
                        </select>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                    <div>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', display: 'block', marginBottom: '4px' }}>👤 收支對象</label>
                        <select
                            value={filterUser}
                            onChange={(e) => setFilterUser(e.target.value)}
                            className="glass-input"
                            style={{ width: '100%', margin: 0, padding: '0 8px', height: '38px', fontSize: '0.82rem' }}
                        >
                            <option value="all">全部成員</option>
                            <option value="userA">大狗狗</option>
                            <option value="userB">阿陞</option>
                            <option value="joint">共同/雙方</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', display: 'block', marginBottom: '4px' }}>🎯 需求度篩選</label>
                        <select
                            value={filterNecessity}
                            onChange={(e) => setFilterNecessity(e.target.value)}
                            className="glass-input"
                            style={{ width: '100%', margin: 0, padding: '0 8px', height: '38px', fontSize: '0.82rem' }}
                        >
                            <option value="all">全部</option>
                            <option value="need">🍲 必要 (Need)</option>
                            <option value="want">✨ 選擇性 (Want)</option>
                        </select>
                    </div>
                </div>

                {/* Advanced Search Toggle & Fields */}
                <div style={{ borderTop: '0.5px solid rgba(255,255,255,0.06)', paddingTop: '10px' }}>
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="🔍 輸入備註/分類/對象關鍵字..."
                        className="glass-input"
                        style={{ width: '100%', margin: '0 0 10px 0', padding: '0 12px', height: '36px', fontSize: '0.8rem' }}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <input
                            type="text"
                            value={formatInputMoney(minAmount)}
                            onChange={(e) => setMinAmount(e.target.value)}
                            placeholder="最低金額 $"
                            className="glass-input"
                            style={{ width: '100%', margin: 0, padding: '0 8px', height: '36px', fontSize: '0.8rem' }}
                        />
                        <input
                            type="text"
                            value={formatInputMoney(maxAmount)}
                            onChange={(e) => setMaxAmount(e.target.value)}
                            placeholder="最高金額 $"
                            className="glass-input"
                            style={{ width: '100%', margin: 0, padding: '0 8px', height: '36px', fontSize: '0.8rem' }}
                        />
                    </div>
                </div>
            </div>

            {/* View Mode Tabs: List, Chart, Settlement */}
            <div style={{ padding: '0 4px', marginBottom: '16px', display: 'flex', gap: '8px' }}>
                {['list', 'charts', 'debts'].map(mode => {
                    let label = '📋 流水帳';
                    if (mode === 'charts') label = '📊 分析圖表';
                    if (mode === 'debts') label = '🤝 代墊清算';
                    return (
                        <button
                            key={mode}
                            onClick={() => setViewMode(mode)}
                            className={`glass-btn ${viewMode === mode ? 'active' : ''}`}
                            style={{ flex: 1, fontSize: '0.82rem', fontWeight: '600' }}
                        >
                            {label}
                        </button>
                    );
                })}
            </div>

            {/* VIEW MODE 1: LIST / DATABASE */}
            {viewMode === 'list' && (
                <div className="slide-in">
                    {/* Header Summary Stats */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '10px',
                        marginBottom: '14px'
                    }}>
                        <div className="glass-card" style={{ padding: '12px 10px', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.66rem', color: 'var(--text-tertiary)' }}>個人支出小計</div>
                            <strong style={{ fontSize: '1rem', color: '#fff' }}>{formatMoney(totals.personal)}</strong>
                            <div style={{ fontSize: '0.66rem', color: 'var(--text-tertiary)', marginTop: '4px', borderTop: '0.5px solid rgba(255,255,255,0.06)', paddingTop: '4px', display: 'flex', justifyContent: 'space-between', gap: '4px', paddingLeft: '2px', paddingRight: '2px' }}>
                                <span>🐕 {formatMoney(totals.userAPersonal)}</span>
                                <span>🐶 {formatMoney(totals.userBPersonal)}</span>
                            </div>
                        </div>
                        <div className="glass-card" style={{ padding: '12px', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.66rem', color: 'var(--text-tertiary)' }}>共同支出小計</div>
                            <strong style={{ fontSize: '1rem', color: '#fff' }}>{formatMoney(totals.joint)}</strong>
                        </div>
                    </div>

                    {sortedHistory.length === 0 ? (
                        <div className="glass-card" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.88rem' }}>
                            📭 本月無符合篩選條件的交易紀錄
                        </div>
                    ) : (
                        <>
                            {sortedHistory.slice(0, renderCount).map((record) => {
                                const isDeleted = record.isDeleted || record.category === '作廢退款';
                                const itemNec = dynamicNecessityMap[record.originalIndex] || { needAmount: record.total, wantAmount: 0 };
                                const isNeed = itemNec.needAmount > 0;
                                const isWant = itemNec.wantAmount > 0;
                                
                                const highlightClass = (newlyAddedRecordTimestamp && record.timestamp === newlyAddedRecordTimestamp)
                                    ? 'newly-added-highlight'
                                    : '';

                                // Currency or delta styles
                                let amountColor = '#fff';
                                let sign = '';
                                if (record.type === 'income') {
                                    amountColor = '#30d158';
                                    sign = '+';
                                } else if (record.type === 'expense' || record.type === 'spend') {
                                    amountColor = '#fff';
                                    sign = '-';
                                } else if (record.type === 'calibrate') {
                                    const diff = record.total;
                                    amountColor = diff > 0 ? '#30d158' : '#ff453a';
                                    sign = diff > 0 ? '+' : '';
                                }

                                return (
                                    <div
                                        key={record.originalIndex}
                                        className={`glass-card ${highlightClass}`}
                                        onClick={() => {
                                            if (!isDeleted) {
                                                setDetailModalRecord(record);
                                                setEditDate(record.date);
                                                setEditNote(record.note || '');
                                            }
                                        }}
                                        style={{
                                            padding: '14px 16px',
                                            marginBottom: '10px',
                                            cursor: isDeleted ? 'default' : 'pointer',
                                            opacity: isDeleted ? 0.45 : 1,
                                            borderLeft: isDeleted ? '3px solid #8e8e93' : undefined,
                                            transition: 'transform 0.2s ease, background-color 0.2s ease'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                {/* Line 1: Type / Category & Date */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                                    <span style={{
                                                        fontSize: '0.64rem',
                                                        background: record.type === 'income' ? 'rgba(48,209,88,0.12)' : (record.type === 'expense' ? 'rgba(10,132,255,0.12)' : 'rgba(255,255,255,0.08)'),
                                                        color: record.type === 'income' ? '#30d158' : (record.type === 'expense' ? '#0a84ff' : 'var(--text-secondary)'),
                                                        padding: '1px 6px',
                                                        borderRadius: '4px',
                                                        fontWeight: '700'
                                                    }}>
                                                        {record.category || '交易'}
                                                    </span>
                                                    <span style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>
                                                        {record.date}
                                                    </span>
                                                    {isDeleted && (
                                                        <span style={{ fontSize: '0.6rem', backgroundColor: '#8e8e93', color: '#000', padding: '1px 5px', borderRadius: '4px', fontWeight: '800' }}>
                                                            已作廢
                                                        </span>
                                                    )}
                                                </div>
                                                
                                                {/* Line 2: Note / Description */}
                                                <div style={{ fontWeight: '700', fontSize: '0.88rem', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {record.note || record.category}
                                                </div>
                                            </div>

                                            {/* Right Column: Amount & Member */}
                                            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                                                <div style={{ fontSize: '0.94rem', fontWeight: '800', color: amountColor }}>
                                                    {sign}{formatMoney(record.total)}
                                                </div>
                                                <div style={{ fontSize: '0.66rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                                    👤 {record.payer || '無'}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Dynamic Need/Want pill rendering (Only if not deleted/income) */}
                                        {!isDeleted && record.type !== 'income' && (
                                            <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                                                {isNeed && (
                                                    <span style={{ fontSize: '0.62rem', background: 'rgba(52,199,89,0.08)', color: '#30d158', padding: '1px 6px', borderRadius: '4px', fontWeight: '600' }}>
                                                        🍲 必要 ${itemNec.needAmount.toLocaleString()}
                                                    </span>
                                                )}
                                                {isWant && (
                                                    <span style={{ fontSize: '0.62rem', background: 'rgba(255,45,85,0.08)', color: '#ff2d55', padding: '1px 6px', borderRadius: '4px', fontWeight: '600' }}>
                                                        ✨ 選擇 ${itemNec.wantAmount.toLocaleString()}
                                                    </span>
                                                )}
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
                </div>
            )}

            {/* VIEW MODE 2: CHARTS */}
            {viewMode === 'charts' && (
                <div className="slide-in" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    {/* Category Distribution Chart */}
                    <div className="glass-card" style={{ padding: '18px' }}>
                        <div style={{ fontWeight: '800', fontSize: '0.92rem', color: '#fff', marginBottom: '14px' }}>🍕 支出分類佔比 ({currentMonthLabel})</div>
                        {categoryDistribution.labels.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>本月無支出數據</div>
                        ) : (
                            <div style={{ maxWidth: '280px', margin: '0 auto' }}>
                                <Pie data={categoryDistribution} options={{ plugins: { legend: { labels: { color: '#fff', font: { size: 10 } } } } }} />
                            </div>
                        )}
                    </div>

                    {/* Daily Spending Trend Chart */}
                    <div className="glass-card" style={{ padding: '18px' }}>
                        <div style={{ fontWeight: '800', fontSize: '0.92rem', color: '#fff', marginBottom: '14px' }}>📈 每日支出趨勢 ({currentMonthLabel})</div>
                        {dailySpendingData.labels.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>本月無每日趨勢數據</div>
                        ) : (
                            <div style={{ height: '220px' }}>
                                <Bar data={dailySpendingData} options={{ responsive: true, maintainAspectRatio: false, scales: { x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'var(--text-tertiary)', font: { size: 9 } } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'var(--text-tertiary)', font: { size: 9 } } } }, plugins: { legend: { display: false } } }} />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* VIEW MODE 3: DEBT SETTLEMENT */}
            {viewMode === 'debts' && (
                <div className="slide-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    
                    {/* Visual Card 1: User A */}
                    {(() => {
                        const debts = getDebtList('userA');
                        const debt = debts.reduce((sum, r) => sum + r.total, 0);
                        return (
                            <div className="glass-card" style={{ padding: '18px', borderLeft: '4px solid var(--accent-pink)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <div>
                                        <h4 style={{ margin: 0, fontWeight: '800', color: '#fff', fontSize: '0.94rem' }}>🐕 大狗狗 🐕</h4>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>大狗狗為「共同支出」代墊的未結算明細</span>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontWeight: '850', fontSize: '1.25rem', color: '#fff' }}>{formatMoney(debt)}</div>
                                        <span style={{ fontSize: '0.64rem', color: 'var(--text-tertiary)' }}>累計代墊</span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '0.5px solid rgba(255,255,255,0.06)', paddingTop: '10px', marginTop: '6px' }}>
                                    {debt > 0 ? (
                                        <div style={{ fontSize: '0.78rem', color: 'var(--accent-blue)', textDecoration: 'underline', cursor: 'pointer', fontWeight: '600' }} onClick={() => { setSettlementTarget('userA'); setShowSettlementModal(true); }}>
                                            明細及對帳單
                                        </div>
                                    ) : (
                                        <div style={{ fontSize: '0.78rem', color: '#30d158', fontWeight: '600' }}>已全數清算結案</div>
                                    )}
                                    {debt > 0 && (
                                        <button className="glass-btn" style={{ padding: '6px 14px', fontSize: '0.8rem', fontWeight: '700', color: 'var(--accent-pink)', borderColor: 'rgba(255,45,85,0.3)', backgroundColor: 'rgba(255,45,85,0.08)' }} onClick={() => handleSettle('userA')}>
                                            一鍵結清
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    {/* Visual Card 2: User B */}
                    {(() => {
                        const debts = getDebtList('userB');
                        const debt = debts.reduce((sum, r) => sum + r.total, 0);
                        return (
                            <div className="glass-card" style={{ padding: '18px', borderLeft: '4px solid var(--accent-green)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <div>
                                        <h4 style={{ margin: 0, fontWeight: '800', color: '#fff', fontSize: '0.94rem' }}>🐶 阿陞 🐶</h4>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>阿陞為「共同支出」代墊的未結算明細</span>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontWeight: '850', fontSize: '1.25rem', color: '#fff' }}>{formatMoney(debt)}</div>
                                        <span style={{ fontSize: '0.64rem', color: 'var(--text-tertiary)' }}>累計代墊</span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '0.5px solid rgba(255,255,255,0.06)', paddingTop: '10px', marginTop: '6px' }}>
                                    {debt > 0 ? (
                                        <div style={{ fontSize: '0.78rem', color: 'var(--accent-blue)', textDecoration: 'underline', cursor: 'pointer', fontWeight: '600' }} onClick={() => { setSettlementTarget('userB'); setShowSettlementModal(true); }}>
                                            明細及對帳單
                                        </div>
                                    ) : (
                                        <div style={{ fontSize: '0.78rem', color: '#30d158', fontWeight: '600' }}>已全數清算結案</div>
                                    )}
                                    {debt > 0 && (
                                        <button className="glass-btn" style={{ padding: '6px 14px', fontSize: '0.8rem', fontWeight: '700', color: 'var(--accent-green)', borderColor: 'rgba(52,199,89,0.3)', backgroundColor: 'rgba(52,199,89,0.08)' }} onClick={() => handleSettle('userB')}>
                                            一鍵結清
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                </div>
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

            {/* UNIFIED TRANSACTION DETAILS & MANAGEMENT MODAL */}
            {detailModalRecord && createPortal(
                <div className="liquid-modal-overlay" onClick={() => setDetailModalRecord(null)}>
                    <div className="liquid-modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px', width: '92%', maxHeight: '82vh', display: 'flex', flexDirection: 'column' }}>
                        
                        {/* Modal Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexShrink: 0 }}>
                            <div style={{ fontWeight: '850', fontSize: '1.15rem', color: '#fff' }} className="liquid-modal-title">
                                🔍 交易詳細資訊 & 管理
                            </div>
                            <button onClick={() => setDetailModalRecord(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '1.4rem', cursor: 'pointer', padding: '0 4px' }}>✕</button>
                        </div>

                        {/* Scrollable Modal Content */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '52vh', overflowY: 'auto', paddingRight: '4px', paddingBottom: '10px', flexGrow: 1 }}>
                            
                            {/* Summary Card */}
                            <div className="inset-group-card" style={{ padding: '12px 14px', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>💰 交易金額</span>
                                    <strong style={{ fontSize: '1.05rem', color: detailModalRecord.type === 'income' ? '#30d158' : '#fff' }}>
                                        {detailModalRecord.type === 'income' ? '+' : '-'}${detailModalRecord.total.toLocaleString()} TWD
                                    </strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.78rem' }}>
                                    <span style={{ color: 'var(--text-tertiary)' }}>🏷️ 交易分類</span>
                                    <span style={{ color: '#fff', fontWeight: '600' }}>{detailModalRecord.category}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                                    <span style={{ color: 'var(--text-tertiary)' }}>👤 記錄成員</span>
                                    <span style={{ color: '#fff' }}>{detailModalRecord.payer || '無'} ({detailModalRecord.operator || '無'})</span>
                                </div>
                            </div>

                            {/* Necessity Split Display */}
                            {detailModalRecord.type !== 'income' && detailModalRecord.category !== '作廢退款' && (() => {
                                const itemNec = dynamicNecessityMap[detailModalRecord.originalIndex] || { needAmount: detailModalRecord.total, wantAmount: 0 };
                                const hasNeed = itemNec.needAmount > 0;
                                const hasWant = itemNec.wantAmount > 0;
                                
                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontWeight: '750' }}>🎯 預算需求分析 (自動判定)</div>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            {hasNeed && (
                                                <span style={{ fontSize: '0.74rem', background: 'rgba(52,199,89,0.12)', color: '#30d158', padding: '4px 10px', borderRadius: 'var(--radius-pill)', fontWeight: '700', border: '0.5px solid rgba(52,199,89,0.2)' }}>
                                                    🍲 必要支出: ${itemNec.needAmount.toLocaleString()} TWD
                                                </span>
                                            )}
                                            {hasWant && (
                                                <span style={{ fontSize: '0.74rem', background: 'rgba(255,45,85,0.12)', color: '#ff2d55', padding: '4px 10px', borderRadius: 'var(--radius-pill)', fontWeight: '700', border: '0.5px solid rgba(255,45,85,0.2)' }}>
                                                    ✨ 選擇性支出: ${itemNec.wantAmount.toLocaleString()} TWD
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Editable Fields */}
                            <div className="inset-group-card">
                                <div style={{ padding: '4px 10px 10px 10px', fontSize: '0.74rem', color: 'var(--text-tertiary)', borderBottom: '0.5px solid rgba(255,255,255,0.06)', display: 'flex', gap: '4px', alignItems: 'center' }}>
                                    <span>✏️</span>
                                    <span>編輯交易屬性 (金額與帳戶屬唯讀)</span>
                                </div>
                                <div className="inset-group-row">
                                    <span className="inset-group-label">📅 交易日期</span>
                                    <span className="inset-group-value">
                                        <input 
                                            type="date" 
                                            style={{ background: 'none', border: 'none', color: '#fff', textAlign: 'right', outline: 'none', fontFamily: 'var(--font-family)' }} 
                                            value={editDate} 
                                            onChange={e => setEditDate(e.target.value)} 
                                        />
                                    </span>
                                </div>
                                <div className="inset-group-row">
                                    <span className="inset-group-label">📝 交易備註</span>
                                    <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                                        <input 
                                            type="text" 
                                            className="inset-group-input" 
                                            value={editNote} 
                                            onChange={e => setEditNote(e.target.value)} 
                                            placeholder="請輸入交易備註" 
                                        />
                                    </span>
                                </div>
                            </div>

                            {/* Audit Trail Balance Diffs Section */}
                            {detailModalRecord.auditTrail && (() => {
                                const beforeAccs = detailModalRecord.auditTrail.before?.accounts || [];
                                const afterAccs = detailModalRecord.auditTrail.after?.accounts || [];
                                
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

                                if (changes.length === 0) return null;

                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontWeight: '750' }}>📊 帳戶餘額變動軌跡</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {changes.map((c, i) => {
                                                const diffColor = c.diff > 0 ? '#30d158' : '#ff453a';
                                                const diffSign = c.diff > 0 ? '+' : '';
                                                const ownerLabel = c.owner === 'joint' ? '共同' : (c.owner === 'userA' ? '大狗狗' : '阿陞');
                                                return (
                                                    <div key={i} style={{ padding: '8px 10px', borderRadius: '10px', border: '0.5px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <div style={{ minWidth: 0, flex: 1 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                                                                <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#fff' }}>{c.nickname}</span>
                                                                <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.4)' }}>({ownerLabel})</span>
                                                            </div>
                                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                                                <span style={{ textDecoration: 'line-through', opacity: 0.6 }}>${c.before.toLocaleString()}</span>
                                                                <span style={{ margin: '0 4px' }}>➡️</span>
                                                                <strong>${c.after.toLocaleString()}</strong>
                                                            </div>
                                                        </div>
                                                        <span style={{ color: diffColor, fontWeight: '750', fontSize: '0.78rem' }}>
                                                            {diffSign}${c.diff.toLocaleString()} {c.currency}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })()}

                        </div>

                        {/* Fixed Actions Footer */}
                        <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexShrink: 0 }}>
                            {detailModalRecord.category !== '作廢退款' && (
                                <button
                                    onClick={async () => {
                                        const rec = detailModalRecord;
                                        if (await customConfirm(`⚠️ 確定要作廢此筆紀錄？\n系統將自動反向退款沖銷，恢復到交易前狀態。`)) {
                                            onDelete(rec._context);
                                            setDetailModalRecord(null);
                                        }
                                    }}
                                    className="glass-btn"
                                    style={{
                                        flex: 1,
                                        padding: '12px 0',
                                        borderRadius: '10px',
                                        color: '#ff453a',
                                        borderColor: 'rgba(255,69,58,0.2)',
                                        background: 'rgba(255,69,58,0.08)'
                                    }}
                                >
                                    🗑️ 作廢此交易
                                </button>
                            )}

                            <button
                                onClick={() => {
                                    onEdit(detailModalRecord._context, {
                                        index: detailModalRecord.originalIndex,
                                        date: editDate,
                                        note: editNote
                                    });
                                    setDetailModalRecord(null);
                                }}
                                className="glass-btn primary-gradient-btn"
                                style={{ flex: 2, padding: '12px 0', borderRadius: '10px', fontWeight: '800' }}
                            >
                                💾 儲存修改
                            </button>
                        </div>

                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default MonthlyView;