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
  onTransaction,
  setAssets,
  currentUser,
  customAlert,
  customConfirm,
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
    const [syncBatchDate, setSyncBatchDate] = useState(true);
    const [batchItemsState, setBatchItemsState] = useState([]);
    const [explanationModalData, setExplanationModalData] = useState(null);
    const [itemizedModalRecord, setItemizedModalRecord] = useState(null);

    // Infinite scroll & lazy load states
    const [renderCount, setRenderCount] = useState(30);
    const loadMoreRef = useRef(null);

    const openNecessityExplanation = (itemNec, recordContext = {}) => {
        if (!itemNec) return;
        setExplanationModalData({
            ...itemNec,
            recordContext
        });
    };

    const openDetailModal = (item) => {
        setDetailModalRecord(item);
        if (item.isBatchGroup) {
            setEditDate(item.date);
            setSyncBatchDate(true);
            setBatchItemsState(item.records.map(r => ({
                originalIndex: r.originalIndex,
                _context: r._context,
                id: r.id,
                cat: r.subCategory || r.category || '支出',
                amount: r.total,
                date: r.date,
                note: r.note || '',
                originalDate: r.date,
                originalNote: r.note || '',
                isDeleted: !!(r.isDeleted || r.category === '作廢退款'),
                rawRecord: r
            })));
        } else {
            const siblings = item.batchId ? history.filter(r => r.batchId === item.batchId) : [];
            if (siblings.length > 1) {
                setEditDate(item.date);
                setSyncBatchDate(true);
                setBatchItemsState(siblings.map(r => ({
                    originalIndex: r.originalIndex,
                    _context: r._context,
                    id: r.id,
                    cat: r.subCategory || r.category || '支出',
                    amount: r.total,
                    date: r.date,
                    note: r.note || '',
                    originalDate: r.date,
                    originalNote: r.note || '',
                    isDeleted: !!(r.isDeleted || r.category === '作廢退款'),
                    isCurrentTarget: r.originalIndex === item.originalIndex,
                    rawRecord: r
                })));
            } else {
                setEditDate(item.date);
                setEditNote(item.note || '');
                setBatchItemsState([]);
            }
        }
    };

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
                if (filterType === 'transfer' && record.type !== 'transfer' && record.category !== '資產劃撥') return false;
                if (filterType === 'exchange' && record.type !== 'exchange' && record.category !== '貨幣換匯') return false;
                if (filterType === 'calibrate' && record.type !== 'calibrate' && record.category !== '餘額校正' && !record.note?.includes('校正')) return false;
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

    // Group shopping cart batch items together in the list view
    const groupedDisplayHistory = useMemo(() => {
        const result = [];
        const seenBatchIds = new Set();

        sortedHistory.forEach(record => {
            if (record.batchId) {
                if (seenBatchIds.has(record.batchId)) {
                    return;
                }
                const batchMembers = sortedHistory.filter(r => r.batchId === record.batchId);
                if (batchMembers.length > 1) {
                    seenBatchIds.add(record.batchId);
                    const activeMembers = batchMembers.filter(r => !r.isDeleted && r.category !== '作廢退款');
                    const totalAmt = activeMembers.length > 0 
                        ? activeMembers.reduce((s, r) => s + (r.total || 0), 0)
                        : batchMembers.reduce((s, r) => s + (r.total || 0), 0);
                    const isAllDeleted = batchMembers.every(r => r.isDeleted || r.category === '作廢退款');
                    result.push({
                        isBatchGroup: true,
                        batchId: record.batchId,
                        date: record.date,
                        month: record.month,
                        type: record.type,
                        category: record.category,
                        payer: record.payer,
                        operator: record.operator,
                        accountId: record.accountId,
                        targetAccountId: record.targetAccountId,
                        total: totalAmt,
                        records: batchMembers,
                        isDeleted: isAllDeleted,
                        originalIndex: record.originalIndex,
                        _context: record._context,
                        auditTrail: record.auditTrail,
                        timestamp: record.timestamp
                    });
                    return;
                }
            }
            result.push(record);
        });
        return result;
    }, [sortedHistory]);

    // Auto-switch month & reset filters when a new record timestamp is provided
    useEffect(() => {
        if (!newlyAddedRecordTimestamp) return;

        const targetRecord = history.find(r => 
            r.timestamp === newlyAddedRecordTimestamp ||
            (r.batchItems && r.batchId && r.timestamp === newlyAddedRecordTimestamp)
        );

        if (targetRecord) {
            const targetMonth = targetRecord.month || targetRecord.date?.slice(0, 7);
            if (targetMonth && targetMonth !== filterDate) {
                setFilterDate(targetMonth);
                if (loadArchiveMonth) loadArchiveMonth(targetMonth);
            }
            setViewMode('list');
            setFilterType('all');
            setFilterUser('all');
            setFilterNecessity('all');
            setSearchTerm('');
            setMinAmount('');
            setMaxAmount('');
        }
    }, [newlyAddedRecordTimestamp, history, filterDate, loadArchiveMonth]);

    // Auto-scroll to the newly added record or batch group card
    useEffect(() => {
        if (!newlyAddedRecordTimestamp || viewMode !== 'list') return;

        const targetIndex = groupedDisplayHistory.findIndex(r => 
            r.timestamp === newlyAddedRecordTimestamp ||
            (r.records && r.records.some(sub => sub.timestamp === newlyAddedRecordTimestamp))
        );

        if (targetIndex !== -1) {
            if (targetIndex >= renderCount) {
                setRenderCount(targetIndex + 20);
            }

            // Smoothly scroll into view with slight delay to ensure DOM render
            const timer = setTimeout(() => {
                const el = document.querySelector('.newly-added-highlight');
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 180);

            return () => clearTimeout(timer);
        }
    }, [newlyAddedRecordTimestamp, groupedDisplayHistory, viewMode, renderCount]);

    // Infinite scroll observer
    useEffect(() => {
        setRenderCount(30); // Reset when filter changes
    }, [filterDate, filterType, filterUser, filterNecessity, searchTerm, minAmount, maxAmount]);

    useEffect(() => {
        if (viewMode !== 'list') return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                setRenderCount(prev => Math.min(prev + 30, groupedDisplayHistory.length));
            }
        }, { threshold: 0.1 });
        if (loadMoreRef.current) observer.observe(loadMoreRef.current);
        return () => observer.disconnect();
    }, [groupedDisplayHistory, viewMode]);

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

        if (onTransaction) {
            onTransaction(finalAssets, settlementLog);
        } else if (setAssets) {
            setAssets(finalAssets);
        }
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
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', display: 'block', marginBottom: '4px' }}>收支對象</label>
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
                            <option value="need">必要 (Need)</option>
                            <option value="want">選擇性 (Want)</option>
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

                    {groupedDisplayHistory.length === 0 ? (
                        <div className="glass-card" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.88rem' }}>
                            📭 本月無符合篩選條件的交易紀錄
                        </div>
                    ) : (
                        <>
                            {groupedDisplayHistory.slice(0, renderCount).map((record, rIdx) => {
                                const isDeleted = record.isDeleted || record.category === '作廢退款';
                                const itemNec = dynamicNecessityMap[record.originalIndex] || { needAmount: record.total, wantAmount: 0 };
                                const isNeed = itemNec.needAmount > 0;
                                const isWant = itemNec.wantAmount > 0;
                                
                                const highlightClass = (newlyAddedRecordTimestamp && (
                                    record.timestamp === newlyAddedRecordTimestamp ||
                                    (record.records && record.records.some(sub => sub.timestamp === newlyAddedRecordTimestamp))
                                )) ? 'newly-added-highlight' : '';

                                // CASE 1: GROUPED SHOPPING CART BATCH CARD
                                if (record.isBatchGroup) {
                                    return (
                                        <div
                                            key={`batch_${record.batchId}_${rIdx}`}
                                            className={`glass-card ${highlightClass}`}
                                            onClick={() => {
                                                if (!isDeleted) {
                                                    openDetailModal(record);
                                                }
                                            }}
                                            style={{
                                                padding: '14px 16px',
                                                marginBottom: '12px',
                                                cursor: isDeleted ? 'default' : 'pointer',
                                                opacity: isDeleted ? 0.45 : 1,
                                                borderLeft: isDeleted ? '3px solid #8e8e93' : '3px solid #ff9f0a',
                                                background: 'linear-gradient(135deg, rgba(255, 159, 10, 0.07) 0%, rgba(255, 255, 255, 0.02) 100%)',
                                                transition: 'transform 0.2s ease, background-color 0.2s ease'
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <div style={{ minWidth: 0, flex: 1 }}>
                                                    {/* Header badges */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                                                        <span style={{
                                                            fontSize: '0.64rem',
                                                            background: record.type === 'spend' ? 'rgba(0,122,255,0.15)' : 'rgba(175,82,222,0.15)',
                                                            color: record.type === 'spend' ? '#007AFF' : '#AF52DE',
                                                            padding: '1px 6px',
                                                            borderRadius: '4px',
                                                            fontWeight: '700'
                                                        }}>
                                                            {record.category || '支出'}
                                                        </span>
                                                        <span style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>
                                                            {record.date}
                                                        </span>
                                                        <span style={{
                                                            fontSize: '0.62rem',
                                                            background: 'rgba(255,159,10,0.18)',
                                                            color: '#ff9f0a',
                                                            border: '0.5px solid rgba(255,159,10,0.4)',
                                                            padding: '1px 6px',
                                                            borderRadius: '4px',
                                                            fontWeight: '800'
                                                        }}>
                                                            🛒 購物車整批結帳 (共 {record.records.length} 筆)
                                                        </span>
                                                        {isDeleted && (
                                                            <span style={{ fontSize: '0.6rem', backgroundColor: '#8e8e93', color: '#000', padding: '1px 5px', borderRadius: '4px', fontWeight: '800' }}>
                                                                已作廢
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Sub-items Preview List */}
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', margin: '6px 0 8px 0', background: 'rgba(0,0,0,0.22)', padding: '8px 10px', borderRadius: '10px', border: '0.5px solid rgba(255,255,255,0.06)' }}>
                                                        {record.records.map((sub, sIdx) => {
                                                            const isSubDeleted = sub.isDeleted || sub.category === '作廢退款';
                                                            return (
                                                                <div key={sIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', opacity: isSubDeleted ? 0.45 : 1 }}>
                                                                    <span style={{ color: isSubDeleted ? '#8e8e93' : '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: isSubDeleted ? 'line-through' : 'none' }}>
                                                                        <span style={{ color: isSubDeleted ? '#8e8e93' : '#ff9f0a', marginRight: '4px' }}>•</span>
                                                                        <strong style={{ opacity: 0.9 }}>{sub.subCategory || sub.category}</strong>
                                                                        {sub.note && sub.note !== (sub.subCategory || sub.category) ? <span style={{ opacity: 0.7, marginLeft: '4px' }}>({sub.note.replace(`${sub.subCategory} - `, '')})</span> : ''}
                                                                        {isSubDeleted && <span style={{ fontSize: '0.62rem', color: '#8e8e93', marginLeft: '4px' }}>(已作廢)</span>}
                                                                    </span>
                                                                    <span style={{ color: isSubDeleted ? '#8e8e93' : 'rgba(255,255,255,0.9)', fontWeight: '700', marginLeft: '8px', flexShrink: 0, textDecoration: isSubDeleted ? 'line-through' : 'none' }}>
                                                                        ${sub.total.toLocaleString()}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    {/* Account line */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                                        {(() => {
                                                            const sourceAcc = assets.accounts?.find(a => a.id === record.accountId);
                                                            if (sourceAcc) {
                                                                const ownerLabel = sourceAcc.owner === 'joint' ? '共同' : (sourceAcc.owner === 'userA' ? '大狗狗' : '阿陞');
                                                                return (
                                                                    <span>
                                                                        交易帳戶：<strong style={{ color: '#8effa2' }}>{sourceAcc.icon || '🏦'} {sourceAcc.nickname}</strong> <span style={{ opacity: 0.6, fontSize: '0.64rem' }}>({ownerLabel})</span>
                                                                    </span>
                                                                );
                                                            }
                                                            return <span>交易帳戶：<strong style={{ color: 'var(--text-tertiary)' }}>{record.payer || '無'}</strong></span>;
                                                        })()}
                                                    </div>
                                                </div>

                                                {/* Right Column: Amount & Member */}
                                                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                                                    <div style={{ fontSize: '1.02rem', fontWeight: '850', color: '#ff9f0a' }}>
                                                        -${record.total.toLocaleString()}
                                                    </div>
                                                    <div style={{ fontSize: '0.66rem', color: 'var(--text-tertiary)', marginTop: '3px' }}>
                                                        {record.payer || '無'}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Dynamic Need/Want pill rendering for Batch */}
                                            {!isDeleted && (() => {
                                                let bNeed = 0;
                                                let bWant = 0;
                                                const subBreakdowns = [];
                                                record.records?.forEach(sub => {
                                                    if (!sub.isDeleted && sub.category !== '作廢退款') {
                                                        const subNec = dynamicNecessityMap[sub.originalIndex] || { needAmount: sub.total, wantAmount: 0 };
                                                        bNeed += subNec.needAmount || 0;
                                                        bWant += subNec.wantAmount || 0;
                                                        if (subNec.categoryBreakdown) {
                                                            subBreakdowns.push(...subNec.categoryBreakdown.map(cb => ({ ...cb, subNote: sub.note })));
                                                        }
                                                    }
                                                });
                                                if (bNeed === 0 && bWant === 0) return null;

                                                const handleBatchTagClick = (e) => {
                                                    e.stopPropagation();
                                                    setExplanationModalData({
                                                        isBatch: true,
                                                        needAmount: bNeed,
                                                        wantAmount: bWant,
                                                        total: record.total,
                                                        date: record.date,
                                                        batchCount: record.records?.length || 0,
                                                        statusType: bWant === 0 ? 'full_need' : (bNeed > 0 ? 'partial' : 'full_want'),
                                                        statusBadge: bWant === 0 
                                                            ? { label: '批次全額穩健必要', color: '#30d158', bg: 'rgba(52,199,89,0.12)', border: 'rgba(52,199,89,0.3)', icon: '🟢' }
                                                            : (bNeed > 0 
                                                                ? { label: '批次跨越進度上限（含潛在必要）', color: '#ff9f0a', bg: 'rgba(255,159,10,0.12)', border: 'rgba(255,159,10,0.3)', icon: '🟡' }
                                                                : { label: '批次進度超前消費（選擇性）', color: '#ff2d55', bg: 'rgba(255,45,85,0.12)', border: 'rgba(255,45,85,0.3)', icon: '🔴' }
                                                            ),
                                                        summaryExplanation: `此購物車批次整批結帳金額為 $${record.total.toLocaleString()} TWD，共 ${record.records?.length} 筆明細。經系統逐筆計算當日時間進度與各分類可用預算後，合計認列必要 $${bNeed.toLocaleString()}，超前選擇性 $${bWant.toLocaleString()}。`,
                                                        summaryAdvice: bWant > 0 
                                                            ? '💡 購物車中部分品項超前使用了後續日子的預算（潛在必要），若屬於整週大採買，後續幾天維持節流即可在月底保持平衡！'
                                                            : '🟢 整批購物車明細皆在各分類截至當天的累積可用預算內，消費健康無虞！',
                                                        categoryBreakdown: subBreakdowns,
                                                        recordContext: { title: '🛒 購物車整批結帳', note: record.note, date: record.date }
                                                    });
                                                };

                                                return (
                                                    <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                                                        {bNeed > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={handleBatchTagClick}
                                                                style={{ background: 'rgba(52,199,89,0.1)', color: '#30d158', padding: '2px 8px', borderRadius: '6px', fontWeight: '700', fontSize: '0.66rem', border: '0.5px solid rgba(52,199,89,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                                                                title="點擊查看預算判定原因與分析"
                                                            >
                                                                <span>必要 ${bNeed.toLocaleString()}</span>
                                                                <span style={{ fontSize: '0.6rem', opacity: 0.8 }}>ℹ️</span>
                                                            </button>
                                                        )}
                                                        {bWant > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={handleBatchTagClick}
                                                                style={{ background: 'rgba(255,45,85,0.1)', color: '#ff2d55', padding: '2px 8px', borderRadius: '6px', fontWeight: '700', fontSize: '0.66rem', border: '0.5px solid rgba(255,45,85,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                                                                title="點擊查看預算判定原因與分析"
                                                            >
                                                                <span>選擇 ${bWant.toLocaleString()}</span>
                                                                <span style={{ fontSize: '0.6rem', opacity: 0.8 }}>ℹ️</span>
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    );
                                }

                                // CASE 2: SINGLE TRANSACTION CARD
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
                                                openDetailModal(record);
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
                                                {/* Line 1: Type / Category & Date & Batch Info */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                                    <span style={{
                                                        fontSize: '0.64rem',
                                                        background: record.type === 'income'
                                                            ? 'rgba(48,209,88,0.12)'
                                                            : (record.type === 'expense'
                                                                ? ((record.payer || '').includes('大狗') ? 'rgba(175,82,222,0.12)' : 'rgba(48,209,88,0.12)')
                                                                : (record.type === 'spend' ? 'rgba(0,122,255,0.12)' : 'rgba(255,255,255,0.08)')),
                                                        color: record.type === 'income'
                                                            ? '#30D158'
                                                            : (record.type === 'expense'
                                                                ? ((record.payer || '').includes('大狗') ? '#AF52DE' : '#30D158')
                                                                : (record.type === 'spend' ? '#007AFF' : 'var(--text-secondary)')),
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
                                                
                                                {/* Line 2: Note / Description & Itemized Link */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                    <span style={{ fontWeight: '700', fontSize: '0.88rem', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {record.note || record.category}
                                                    </span>
                                                    {Array.isArray(record.itemizedBreakdown) && record.itemizedBreakdown.length > 0 && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setItemizedModalRecord(record);
                                                            }}
                                                            style={{
                                                                background: 'none',
                                                                border: 'none',
                                                                padding: '0 2px',
                                                                color: '#64d2ff',
                                                                fontSize: '0.74rem',
                                                                textDecoration: 'underline',
                                                                cursor: 'pointer',
                                                                fontWeight: '700',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '2px'
                                                            }}
                                                        >
                                                            <span>📋</span>
                                                            <span>查看細項 ({record.itemizedBreakdown.length}項)</span>
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Line 3: Account info change */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                                    {(() => {
                                                        const sourceAcc = assets.accounts?.find(a => a.id === record.accountId);
                                                        const accName = sourceAcc ? `${sourceAcc.icon || '🏦'} ${sourceAcc.nickname}` : '';
                                                        if (accName) {
                                                            const ownerLabel = sourceAcc.owner === 'joint' ? '共同' : (sourceAcc.owner === 'userA' ? '大狗狗' : '阿陞');
                                                            return (
                                                                <span>
                                                                    💳 交易帳戶：<strong style={{ color: '#8effa2' }}>{accName}</strong> <span style={{ opacity: 0.6, fontSize: '0.64rem' }}>({ownerLabel})</span>
                                                                </span>
                                                            );
                                                        }
                                                        return <span>💳 交易帳戶：<strong style={{ color: 'var(--text-tertiary)' }}>{record.payer || '無'}</strong></span>;
                                                    })()}
                                                </div>
                                            </div>

                                            {/* Right Column: Amount & Member */}
                                            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                                                <div style={{ fontSize: '0.94rem', fontWeight: '800', color: amountColor }}>
                                                    {sign}{formatMoney(record.total)}
                                                </div>
                                                <div style={{ fontSize: '0.66rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                                    {record.payer || '無'}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Dynamic Need/Want pill rendering (Only if not deleted/income) */}
                                        {!isDeleted && record.type !== 'income' && (
                                            <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                                                {isNeed && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            openNecessityExplanation(itemNec, { title: record.category, note: record.note, date: record.date });
                                                        }}
                                                        style={{ background: 'rgba(52,199,89,0.1)', color: '#30d158', padding: '2px 8px', borderRadius: '6px', fontWeight: '700', fontSize: '0.66rem', border: '0.5px solid rgba(52,199,89,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                                                        title="點擊查看預算判定原因與分析"
                                                    >
                                                        <span>必要 ${itemNec.needAmount.toLocaleString()}</span>
                                                        <span style={{ fontSize: '0.6rem', opacity: 0.8 }}>ℹ️</span>
                                                    </button>
                                                )}
                                                {isWant && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            openNecessityExplanation(itemNec, { title: record.category, note: record.note, date: record.date });
                                                        }}
                                                        style={{ background: 'rgba(255,45,85,0.1)', color: '#ff2d55', padding: '2px 8px', borderRadius: '6px', fontWeight: '700', fontSize: '0.66rem', border: '0.5px solid rgba(255,45,85,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                                                        title="點擊查看預算判定原因與分析"
                                                    >
                                                        <span>選擇 ${itemNec.wantAmount.toLocaleString()}</span>
                                                        <span style={{ fontSize: '0.6rem', opacity: 0.8 }}>ℹ️</span>
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            
                            {renderCount < groupedDisplayHistory.length && (
                                <div ref={loadMoreRef} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)', fontSize: '0.82rem', fontWeight: '600' }}>
                                    捲動載入更多 ({renderCount}/{groupedDisplayHistory.length})
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
                        <div style={{ fontWeight: '800', fontSize: '0.92rem', color: '#fff', marginBottom: '14px' }}>支出分類佔比 ({currentMonthLabel})</div>
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
                        <div style={{ fontWeight: '800', fontSize: '0.92rem', color: '#fff', marginBottom: '14px' }}>每日支出趨勢 ({currentMonthLabel})</div>
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
                            <div className="glass-card" style={{ padding: '18px', borderLeft: '4px solid var(--accent-purple)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <div>
                                        <h4 style={{ margin: 0, fontWeight: '800', color: '#fff', fontSize: '0.94rem' }}>大狗狗</h4>
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
                                        <button className="glass-btn" style={{ padding: '6px 14px', fontSize: '0.8rem', fontWeight: '700', color: 'var(--accent-green)', borderColor: 'rgba(52,199,89,0.3)', backgroundColor: 'rgba(52,199,89,0.08)' }} onClick={() => handleSettle('userA')}>
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
                                        <h4 style={{ margin: 0, fontWeight: '800', color: '#fff', fontSize: '0.94rem' }}>阿陞</h4>
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
                            <span className="card-sheet-title">{settlementTarget === 'userA' ? '大狗狗' : '阿陞'} 的代墊明細</span>
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
                    <div
                        className="liquid-modal-card"
                        onClick={e => e.stopPropagation()}
                        style={{
                            maxWidth: '440px',
                            width: '92%',
                            maxHeight: '88vh',
                            display: 'flex',
                            flexDirection: 'column',
                            padding: '18px 16px',
                            boxSizing: 'border-box',
                            overflow: 'hidden',
                            gap: '0px'
                        }}
                    >
                        
                        {/* Modal Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
                            <div style={{ fontWeight: '850', fontSize: '1.12rem', color: '#fff' }} className="liquid-modal-title">
                                {batchItemsState.length > 1 ? '購物車批次明細 & 管理' : '交易詳細資訊 & 管理'}
                            </div>
                            <button onClick={() => setDetailModalRecord(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '1.4rem', cursor: 'pointer', padding: '0 4px' }}>✕</button>
                        </div>

                        {/* Scrollable Modal Content */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 2px' }}>
                            
                            {/* Summary Card */}
                            <div className="inset-group-card" style={{ flexShrink: 0, padding: '12px 14px', backgroundColor: 'rgba(255,255,255,0.02)', marginBottom: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                                        {batchItemsState.length > 1 ? '批次總金額' : '交易金額'}
                                    </span>
                                    <strong style={{ fontSize: '1.12rem', color: detailModalRecord.type === 'income' ? '#30d158' : (batchItemsState.length > 1 ? '#ff9f0a' : '#fff') }}>
                                        {(() => {
                                            if (batchItemsState.length > 1) {
                                                const activeTotal = batchItemsState.filter(it => !it.isDeleted).reduce((s, it) => s + it.amount, 0);
                                                return `-$${activeTotal.toLocaleString()} TWD`;
                                            }
                                            return `${detailModalRecord.type === 'income' ? '+' : '-'}$${detailModalRecord.total.toLocaleString()} TWD`;
                                        })()}
                                    </strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                                    <span style={{ color: 'var(--text-tertiary)' }}>交易分類</span>
                                    <span style={{ color: '#fff', fontWeight: '600' }}>
                                        {detailModalRecord.category} {batchItemsState.length > 1 ? `(共 ${batchItemsState.filter(it => !it.isDeleted).length}/${batchItemsState.length} 筆有效明細)` : ''}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                                    <span style={{ color: 'var(--text-tertiary)' }}>記錄成員</span>
                                    <span style={{ color: '#fff' }}>{detailModalRecord.payer || '無'} {detailModalRecord.operator ? `(${detailModalRecord.operator})` : ''}</span>
                                </div>
                            </div>

                            {/* BATCH EDITOR: WHEN RECORD CONTAINS MULTIPLE CART ITEMS */}
                            {batchItemsState.length > 1 ? (
                                <>
                                    {/* Batch Date & Sync Switch */}
                                    <div className="inset-group-card" style={{ flexShrink: 0, padding: '12px 14px', background: 'rgba(255,255,255,0.02)', marginBottom: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.82rem', color: '#fff', fontWeight: '750' }}>批次同步日期</span>
                                            <input 
                                                type="date"
                                                value={editDate}
                                                onChange={e => {
                                                    const newD = e.target.value;
                                                    setEditDate(newD);
                                                    if (syncBatchDate) {
                                                        setBatchItemsState(prev => prev.map(item => item.isDeleted ? item : ({ ...item, date: newD })));
                                                    }
                                                }}
                                                style={{ background: 'none', border: 'none', color: '#fff', textAlign: 'right', outline: 'none', fontSize: '0.86rem', fontFamily: 'var(--font-family)' }}
                                            />
                                        </div>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', color: '#ff9f0a', cursor: 'pointer', background: 'rgba(255,159,10,0.1)', padding: '6px 10px', borderRadius: '8px', border: '0.5px solid rgba(255,159,10,0.25)' }}>
                                            <input 
                                                type="checkbox"
                                                checked={syncBatchDate}
                                                onChange={e => {
                                                    const checked = e.target.checked;
                                                    setSyncBatchDate(checked);
                                                    if (checked) {
                                                        setBatchItemsState(prev => prev.map(item => item.isDeleted ? item : ({ ...item, date: editDate })));
                                                    }
                                                }}
                                                style={{ cursor: 'pointer', accentColor: '#ff9f0a' }}
                                            />
                                            <span>自動同步此日期至各筆明細</span>
                                        </label>
                                    </div>

                                    {/* Itemized Note & Detail Inputs */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
                                        <div style={{ fontSize: '0.76rem', color: 'rgba(255,255,255,0.55)', fontWeight: '750', display: 'flex', justifyContent: 'space-between', padding: '0 2px' }}>
                                            <span>批次各項目明細</span>
                                            <span>共 {batchItemsState.length} 筆</span>
                                        </div>

                                        {batchItemsState.map((item, idx) => {
                                            const isItemDeleted = item.isDeleted;
                                            return (
                                                <div key={idx} style={{
                                                    background: isItemDeleted ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.03)',
                                                    border: isItemDeleted ? '1px dashed rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.08)',
                                                    borderRadius: '12px',
                                                    padding: '12px 14px',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '10px',
                                                    opacity: isItemDeleted ? 0.45 : 1,
                                                    position: 'relative',
                                                    flexShrink: 0
                                                }}>
                                                    {/* Row 1: Item #, Category, Amount and Single Item Void Button */}
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <span style={{ fontSize: '0.74rem', color: isItemDeleted ? '#8e8e93' : '#ff9f0a', fontWeight: '800' }}>#{idx + 1}</span>
                                                            <strong style={{ fontSize: '0.86rem', color: isItemDeleted ? '#8e8e93' : '#fff', textDecoration: isItemDeleted ? 'line-through' : 'none' }}>
                                                                {item.cat}
                                                            </strong>
                                                            {isItemDeleted ? (
                                                                <span style={{ fontSize: '0.62rem', background: '#8e8e93', color: '#000', padding: '1px 5px', borderRadius: '4px', fontWeight: '800' }}>
                                                                    已作廢
                                                                </span>
                                                            ) : (() => {
                                                                const subNec = dynamicNecessityMap[item.originalIndex] || { needAmount: item.amount, wantAmount: 0 };
                                                                return (
                                                                    <div style={{ display: 'flex', gap: '4px' }}>
                                                                        {subNec.needAmount > 0 && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    openNecessityExplanation(subNec, { title: item.cat, note: item.note, date: item.date });
                                                                                }}
                                                                                style={{ fontSize: '0.6rem', background: 'rgba(52,199,89,0.12)', color: '#30d158', padding: '2px 6px', borderRadius: '4px', fontWeight: '750', border: '0.5px solid rgba(52,199,89,0.25)', cursor: 'pointer' }}
                                                                                title="點擊查看此明細判定原因"
                                                                            >
                                                                                必要 ${subNec.needAmount.toLocaleString()} ℹ️
                                                                            </button>
                                                                        )}
                                                                        {subNec.wantAmount > 0 && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    openNecessityExplanation(subNec, { title: item.cat, note: item.note, date: item.date });
                                                                                }}
                                                                                style={{ fontSize: '0.6rem', background: 'rgba(255,45,85,0.12)', color: '#ff2d55', padding: '2px 6px', borderRadius: '4px', fontWeight: '750', border: '0.5px solid rgba(255,45,85,0.25)', cursor: 'pointer' }}
                                                                                title="點擊查看此明細判定原因"
                                                                            >
                                                                                選擇 ${subNec.wantAmount.toLocaleString()} ℹ️
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>

                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <span style={{ fontSize: '0.88rem', fontWeight: '800', color: isItemDeleted ? '#8e8e93' : '#fff', textDecoration: isItemDeleted ? 'line-through' : 'none' }}>
                                                                ${item.amount.toLocaleString()} TWD
                                                            </span>

                                                            {/* Single Void Action Button */}
                                                            {!isItemDeleted && (
                                                                <button
                                                                    type="button"
                                                                    onClick={async (e) => {
                                                                        e.stopPropagation();
                                                                        const msg = `確定要單獨作廢此筆明細？\n\n• 第 ${idx + 1} 筆：【${item.cat} $${item.amount.toLocaleString()} TWD】\n  備註：${item.note || '(無)'}\n\n系統將自動退款 $${item.amount.toLocaleString()} TWD 回原帳戶，其他購物車項目將保持不變。`;
                                                                        if (await customConfirm(msg, "單獨作廢明細確認")) {
                                                                            await onDelete(item._context);
                                                                            setBatchItemsState(prev => prev.map((it, i) => i === idx ? { ...it, isDeleted: true } : it));
                                                                        }
                                                                    }}
                                                                    className="glass-btn"
                                                                    style={{
                                                                        padding: '3px 8px',
                                                                        fontSize: '0.68rem',
                                                                        fontWeight: '750',
                                                                        color: '#ff453a',
                                                                        borderColor: 'rgba(255,69,58,0.3)',
                                                                        background: 'rgba(255,69,58,0.1)',
                                                                        borderRadius: '6px'
                                                                    }}
                                                                >
                                                                    單獨作廢
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                    
                                                    {/* Row 2: Note Input */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.25)', padding: '7px 10px', borderRadius: '8px', border: '0.5px solid rgba(255,255,255,0.08)' }}>
                                                        <span style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>備註:</span>
                                                        <input 
                                                            type="text"
                                                            disabled={isItemDeleted}
                                                            value={item.note}
                                                            onChange={e => {
                                                                const val = e.target.value;
                                                                setBatchItemsState(prev => prev.map((it, i) => i === idx ? { ...it, note: val } : it));
                                                            }}
                                                            placeholder="請輸入品名/備註"
                                                            style={{ background: 'transparent', border: 'none', color: isItemDeleted ? '#8e8e93' : '#fff', fontSize: '0.82rem', outline: 'none', width: '100%' }}
                                                        />
                                                    </div>

                                                    {/* Row 3: Individual Date Input */}
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', padding: '4px 6px', background: 'rgba(255,255,255,0.015)', borderRadius: '6px' }}>
                                                        <span style={{ color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <span>明細日期:</span>
                                                        </span>
                                                        <input 
                                                            type="date"
                                                            disabled={isItemDeleted}
                                                            value={item.date}
                                                            onChange={e => {
                                                                const val = e.target.value;
                                                                setBatchItemsState(prev => prev.map((it, i) => i === idx ? { ...it, date: val } : it));
                                                                if (syncBatchDate && val !== editDate) {
                                                                    setSyncBatchDate(false);
                                                                }
                                                            }}
                                                            style={{ background: 'none', border: 'none', color: isItemDeleted ? '#8e8e93' : '#fff', textAlign: 'right', outline: 'none', fontSize: '0.78rem', fontFamily: 'var(--font-family)', cursor: isItemDeleted ? 'default' : 'pointer' }}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            ) : (
                                /* SINGLE TRANSACTION EDITOR */
                                <>
                                    {/* Necessity Split Display */}
                                    {detailModalRecord.type !== 'income' && detailModalRecord.category !== '作廢退款' && (() => {
                                        const itemNec = dynamicNecessityMap[detailModalRecord.originalIndex] || { needAmount: detailModalRecord.total, wantAmount: 0 };
                                        const hasNeed = itemNec.needAmount > 0;
                                        const hasWant = itemNec.wantAmount > 0;
                                        
                                        return (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)', fontWeight: '750' }}>預算需求分析</div>
                                                    <button
                                                        type="button"
                                                        onClick={() => openNecessityExplanation(itemNec, { title: detailModalRecord.category, note: detailModalRecord.note, date: detailModalRecord.date })}
                                                        style={{ background: 'none', border: 'none', color: '#0a84ff', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                                                    >
                                                        <span>點擊查看智慧解讀</span>
                                                        <span>➔</span>
                                                    </button>
                                                </div>
                                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                    {hasNeed && (
                                                        <button
                                                            type="button"
                                                            onClick={() => openNecessityExplanation(itemNec, { title: detailModalRecord.category, note: detailModalRecord.note, date: detailModalRecord.date })}
                                                            style={{ fontSize: '0.76rem', background: 'rgba(52,199,89,0.12)', color: '#30d158', padding: '5px 12px', borderRadius: 'var(--radius-pill)', fontWeight: '750', border: '0.5px solid rgba(52,199,89,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                        >
                                                            <span>必要支出: ${itemNec.needAmount.toLocaleString()} TWD</span>
                                                            <span style={{ fontSize: '0.65rem' }}>ℹ️</span>
                                                        </button>
                                                    )}
                                                    {hasWant && (
                                                        <button
                                                            type="button"
                                                            onClick={() => openNecessityExplanation(itemNec, { title: detailModalRecord.category, note: detailModalRecord.note, date: detailModalRecord.date })}
                                                            style={{ fontSize: '0.76rem', background: 'rgba(255,45,85,0.12)', color: '#ff2d55', padding: '5px 12px', borderRadius: 'var(--radius-pill)', fontWeight: '750', border: '0.5px solid rgba(255,45,85,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                        >
                                                            <span>選擇性支出: ${itemNec.wantAmount.toLocaleString()} TWD</span>
                                                            <span style={{ fontSize: '0.65rem' }}>ℹ️</span>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* Editable Fields */}
                                    <div className="inset-group-card" style={{ marginBottom: 0, background: 'rgba(255,255,255,0.02)' }}>
                                        <div style={{ padding: '8px 12px', fontSize: '0.74rem', color: 'var(--text-tertiary)', borderBottom: '0.5px solid rgba(255,255,255,0.06)', display: 'flex', gap: '4px', alignItems: 'center' }}>
                                            <span>編輯交易屬性 (金額與帳戶屬唯讀)</span>
                                        </div>
                                        <div className="inset-group-row" style={{ padding: '12px 14px', minHeight: '48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span className="inset-group-label" style={{ fontSize: '0.82rem' }}>交易日期</span>
                                            <span className="inset-group-value">
                                                <input 
                                                    type="date" 
                                                    style={{ background: 'none', border: 'none', color: '#fff', textAlign: 'right', outline: 'none', fontSize: '0.85rem', fontFamily: 'var(--font-family)' }} 
                                                    value={editDate} 
                                                    onChange={e => setEditDate(e.target.value)} 
                                                />
                                            </span>
                                        </div>
                                        <div className="inset-group-row" style={{ padding: '12px 14px', minHeight: '48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span className="inset-group-label" style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>交易備註</span>
                                            <span className="inset-group-value" style={{ flex: 1, marginLeft: '16px' }}>
                                                <input 
                                                    type="text" 
                                                    className="inset-group-input" 
                                                    value={editNote} 
                                                    onChange={e => setEditNote(e.target.value)} 
                                                    placeholder="請輸入交易備註" 
                                                    style={{ fontSize: '0.85rem', textAlign: 'right', width: '100%' }}
                                                />
                                            </span>
                                        </div>
                                    </div>

                                    {/* Itemized Breakdown Section in Detail Modal */}
                                    {Array.isArray(detailModalRecord.itemizedBreakdown) && detailModalRecord.itemizedBreakdown.length > 0 && (
                                        <div style={{
                                            background: 'rgba(10, 132, 255, 0.06)',
                                            border: '1px solid rgba(10, 132, 255, 0.2)',
                                            borderRadius: '12px',
                                            padding: '12px 14px',
                                            marginTop: '6px'
                                        }}>
                                            <div style={{ fontSize: '0.8rem', fontWeight: '800', color: '#64d2ff', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span>🧾</span>
                                                <span>小票分項明細 (共 {detailModalRecord.itemizedBreakdown.length} 項)</span>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                {detailModalRecord.itemizedBreakdown.map((it, idx) => (
                                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '4px 0', borderBottom: '1px dashed rgba(255,255,255,0.06)' }}>
                                                        <span style={{ color: '#fff' }}>#{idx + 1} {it.name}</span>
                                                        <span style={{ fontWeight: '750', color: '#8effa2', fontFamily: 'monospace' }}>${Number(it.amount).toLocaleString()} TWD</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

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

                                if (changes.length === 0 && detailModalRecord.auditTrail.before && detailModalRecord.auditTrail.after) {
                                    const summaryKeys = [
                                        { key: 'userA', label: '大狗狗 (TWD)', currency: 'TWD' },
                                        { key: 'userB', label: '阿陞 (TWD)', currency: 'TWD' },
                                        { key: 'jointCash', label: '共同現金 (TWD)', currency: 'TWD' },
                                        { key: 'userA_usd', label: '大狗狗 (USD)', currency: 'USD' },
                                        { key: 'userB_usd', label: '阿陞 (USD)', currency: 'USD' },
                                        { key: 'jointCash_usd', label: '共同現金 (USD)', currency: 'USD' }
                                    ];
                                    const b = detailModalRecord.auditTrail.before || {};
                                    const a = detailModalRecord.auditTrail.after || {};
                                    summaryKeys.forEach(k => {
                                        const bVal = Number(b[k.key]) || 0;
                                        const aVal = Number(a[k.key]) || 0;
                                        const diff = aVal - bVal;
                                        if (diff !== 0) {
                                            changes.push({
                                                nickname: k.label,
                                                currency: k.currency,
                                                before: bVal,
                                                after: aVal,
                                                diff: diff,
                                                owner: k.key.includes('userA') ? 'userA' : (k.key.includes('userB') ? 'userB' : 'joint')
                                            });
                                        }
                                    });
                                }

                                if (changes.length === 0) return null;

                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontWeight: '750' }}>帳戶餘額變動軌跡</div>
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
                            {detailModalRecord.isDeleted || (batchItemsState.length > 1 && batchItemsState.every(it => it.isDeleted)) ? (
                                <div style={{
                                    flex: 1,
                                    padding: '12px 0',
                                    borderRadius: '10px',
                                    textAlign: 'center',
                                    fontSize: '0.86rem',
                                    fontWeight: '600',
                                    color: 'rgba(255,255,255,0.4)',
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.08)'
                                }}>
                                    此交易（或全批次項目）已被作廢
                                </div>
                            ) : detailModalRecord.category === '作廢退款' ? (
                                <div style={{
                                    flex: 1,
                                    padding: '12px 0',
                                    borderRadius: '10px',
                                    textAlign: 'center',
                                    fontSize: '0.86rem',
                                    fontWeight: '600',
                                    color: 'rgba(255,255,255,0.4)',
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.08)'
                                }}>
                                    作廢退款紀錄不可再次作廢
                                </div>
                            ) : (
                                <button
                                    onClick={async () => {
                                        if (batchItemsState.length > 1) {
                                            const activeItems = batchItemsState.filter(it => !it.isDeleted);
                                            if (activeItems.length === 0) {
                                                await customAlert("本批次所有項目皆已被作廢！");
                                                return;
                                            }
                                            const activeTotal = activeItems.reduce((s, it) => s + it.amount, 0);
                                            const batchContexts = activeItems.map(it => it._context);
                                            if (await customConfirm(`確定要作廢此購物車剩餘之整批交易 (共 ${activeItems.length} 筆，合計 $${activeTotal.toLocaleString()} TWD)？\n系統將自動反向退款沖銷，恢復到交易前狀態。`)) {
                                                await onDelete({
                                                    batchContexts
                                                });
                                                setDetailModalRecord(null);
                                            }
                                        } else {
                                            const rec = detailModalRecord;
                                            if (rec.isSettled && rec.advancedBy) {
                                                await customAlert("此筆消費已被「結清」！\n請先在流水帳中作廢「系統結算」紀錄，才能作廢此筆消費。");
                                                return;
                                            }
                                            if (await customConfirm(`確定要作廢此筆紀錄？\n系統將自動反向退款沖銷，恢復到交易前狀態。`)) {
                                                await onDelete(rec._context);
                                                setDetailModalRecord(null);
                                            }
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
                                    {batchItemsState.length > 1 ? '作廢剩餘整批' : '作廢此交易'}
                                </button>
                            )}

                            <button
                                onClick={async () => {
                                    if (batchItemsState.length > 1) {
                                        // BATCH SAVE
                                        const changes = [];
                                        const batchUpdates = [];

                                        batchItemsState.forEach((item, idx) => {
                                            if (item.isDeleted) return; // Skip voided items

                                            const finalDate = syncBatchDate ? editDate : (item.date || editDate);
                                            const finalNote = (item.note || '').trim();
                                            const dateChanged = item.originalDate !== finalDate;
                                            const noteChanged = item.originalNote !== finalNote;

                                            if (dateChanged || noteChanged) {
                                                const itemChanges = [];
                                                if (dateChanged) itemChanges.push(`日期：${item.originalDate} ➡️ ${finalDate}`);
                                                if (noteChanged) itemChanges.push(`備註：${item.originalNote || '(無)'} ➡️ ${finalNote || '(無)'}`);
                                                changes.push(`• 第 ${idx + 1} 筆【${item.cat} $${item.amount}】：\n  ` + itemChanges.join('\n  '));
                                            }

                                            batchUpdates.push({
                                                context: item._context,
                                                originalIndex: item.originalIndex,
                                                date: finalDate,
                                                note: finalNote
                                            });
                                        });

                                        if (changes.length === 0) {
                                            await customAlert("您尚未修改任何有效項目的日期或備註內容。", "提示");
                                            return;
                                        }

                                        const activeTotal = batchItemsState.filter(it => !it.isDeleted).reduce((s, it) => s + it.amount, 0);
                                        const confirmMsg = `📝 請確認即將修改的購物車批次項目：\n\n` +
                                            changes.join('\n\n') +
                                            `\n\n🛒 批次有效總金額：$${activeTotal.toLocaleString()} TWD\n` +
                                            `確定要套用並儲存這些修改嗎？`;

                                        if (await customConfirm(confirmMsg, "儲存批次修改確認")) {
                                            onEdit(detailModalRecord._context, {
                                                batchUpdates
                                            });
                                            setDetailModalRecord(null);
                                        }
                                    } else {
                                        // SINGLE SAVE
                                        const origDate = detailModalRecord.date || '';
                                        const origNote = detailModalRecord.note || '';
                                        const trimmedNote = editNote.trim();

                                        const changes = [];
                                        if (origDate !== editDate) {
                                            changes.push(`📅 交易日期：${origDate || '(無)'} ➡️ ${editDate}`);
                                        }
                                        if (origNote !== trimmedNote) {
                                            changes.push(`📝 交易備註：${origNote || '(無)'} ➡️ ${trimmedNote || '(無)'}`);
                                        }

                                        if (changes.length === 0) {
                                            await customAlert("⚠️ 您尚未修改任何欄位內容（日期與備註均未變更）。", "提示");
                                            return;
                                        }

                                        const confirmMsg = `📝 請確認即將修改的項目：\n\n` +
                                            changes.join('\n') +
                                            `\n\n💰 交易金額：$${detailModalRecord.total.toLocaleString()} TWD\n` +
                                            `🏷️ 交易分類：${detailModalRecord.category}\n\n` +
                                            `確定要套用並儲存這些修改嗎？`;

                                        if (await customConfirm(confirmMsg, "儲存修改確認")) {
                                            onEdit(detailModalRecord._context, {
                                                index: detailModalRecord.originalIndex,
                                                date: editDate,
                                                note: trimmedNote
                                            });
                                            setDetailModalRecord(null);
                                        }
                                    }
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

            {/* INTELLIGENT BUDGET & NECESSITY EXPLANATION MODAL */}
            {explanationModalData && createPortal(
                <div className="liquid-modal-overlay" onClick={() => setExplanationModalData(null)} style={{ zIndex: 11000 }}>
                    <div
                        className="liquid-modal-card"
                        onClick={e => e.stopPropagation()}
                        style={{
                            maxWidth: '460px',
                            width: '92%',
                            maxHeight: '88vh',
                            display: 'flex',
                            flexDirection: 'column',
                            padding: '20px 18px',
                            boxSizing: 'border-box',
                            overflow: 'hidden',
                            gap: '0px'
                        }}
                    >
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
                            <div style={{ fontWeight: '850', fontSize: '1.08rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>🧠</span>
                                <span>智慧預算分析與判定解讀</span>
                            </div>
                            <button onClick={() => setExplanationModalData(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '1.4rem', cursor: 'pointer', padding: '0 4px' }}>✕</button>
                        </div>

                        {/* Scrollable Content */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 2px' }}>
                            
                            {/* 1. Status & Split Overview */}
                            <div style={{
                                background: explanationModalData.statusBadge?.bg || 'rgba(255,255,255,0.04)',
                                border: `1px solid ${explanationModalData.statusBadge?.border || 'rgba(255,255,255,0.1)'}`,
                                borderRadius: '14px',
                                padding: '14px 16px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px',
                                flexShrink: 0
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.86rem', fontWeight: '800', color: explanationModalData.statusBadge?.color || '#fff', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <span>{explanationModalData.statusBadge?.icon}</span>
                                        <span>{explanationModalData.statusBadge?.label}</span>
                                    </span>
                                    <span style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.6)' }}>
                                        📅 {explanationModalData.date || '當日'} (第 {explanationModalData.dayOfMonth || 1}/{explanationModalData.totalDays || 30} 天)
                                    </span>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '0.5px solid rgba(255,255,255,0.08)', paddingTop: '8px' }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                                        {explanationModalData.recordContext?.title && <span>【{explanationModalData.recordContext.title}】</span>}
                                        {explanationModalData.recordContext?.note && <span>{explanationModalData.recordContext.note}</span>}
                                    </div>
                                    <div style={{ fontSize: '1.18rem', fontWeight: '850', color: '#fff' }}>
                                        ${explanationModalData.total?.toLocaleString()} TWD
                                    </div>
                                </div>

                                {/* Progress Bar Split */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden', display: 'flex' }}>
                                        <div style={{ width: `${Math.round((explanationModalData.needAmount / (explanationModalData.total || 1)) * 100)}%`, background: '#30d158', transition: 'width 0.3s ease' }} />
                                        <div style={{ width: `${Math.round((explanationModalData.wantAmount / (explanationModalData.total || 1)) * 100)}%`, background: '#ff2d55', transition: 'width 0.3s ease' }} />
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem' }}>
                                        <span style={{ color: '#30d158', fontWeight: '750' }}>
                                            必要: ${explanationModalData.needAmount?.toLocaleString()} ({Math.round((explanationModalData.needAmount / (explanationModalData.total || 1)) * 100)}%)
                                        </span>
                                        <span style={{ color: '#ff2d55', fontWeight: '750' }}>
                                            選擇: ${explanationModalData.wantAmount?.toLocaleString()} ({Math.round((explanationModalData.wantAmount / (explanationModalData.total || 1)) * 100)}%)
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* 2. Detailed Scenario Breakdown Cards */}
                            {explanationModalData.categoryBreakdown && explanationModalData.categoryBreakdown.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flexShrink: 0 }}>
                                    <div style={{ fontSize: '0.76rem', color: 'rgba(255,255,255,0.55)', fontWeight: '750', padding: '0 2px' }}>
                                        📊 分類日額度滾動拆解 (方案 A 演算法)
                                    </div>

                                    {explanationModalData.categoryBreakdown.map((catItem, idx) => (
                                        <div key={idx} className="inset-group-card" style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.025)', marginBottom: 0, display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <strong style={{ fontSize: '0.88rem', color: '#fff' }}>🏷️ {catItem.category} {catItem.subNote ? `(${catItem.subNote})` : ''}</strong>
                                                <span style={{ fontSize: '0.88rem', fontWeight: '800', color: '#fff' }}>${catItem.amount.toLocaleString()} TWD</span>
                                            </div>

                                            {/* Math Grid */}
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', background: 'rgba(0,0,0,0.2)', padding: '8px 10px', borderRadius: '8px', fontSize: '0.72rem' }}>
                                                <div style={{ color: 'var(--text-secondary)' }}>
                                                    月度總預算: <strong style={{ color: '#fff' }}>${catItem.monthlyBudget.toLocaleString()}</strong>
                                                </div>
                                                <div style={{ color: 'var(--text-secondary)' }}>
                                                    每日平均配額: <strong style={{ color: '#0a84ff' }}>${catItem.dailyLimit.toLocaleString()}/天</strong>
                                                </div>
                                                <div style={{ color: 'var(--text-secondary)' }}>
                                                    截至當日累計上限: <strong style={{ color: '#30d158' }}>${catItem.maxAllowedCumulativeNeed.toLocaleString()}</strong>
                                                </div>
                                                <div style={{ color: 'var(--text-secondary)' }}>
                                                    此筆前已用必要: <strong style={{ color: '#ff9f0a' }}>${catItem.spentNeedSoFar.toLocaleString()}</strong>
                                                </div>
                                            </div>

                                            <div style={{ fontSize: '0.76rem', color: 'rgba(255,255,255,0.85)', lineHeight: '1.45', background: 'rgba(255,255,255,0.02)', padding: '6px 8px', borderRadius: '6px' }}>
                                                {catItem.explanation}
                                            </div>

                                            {catItem.advice && (
                                                <div style={{ fontSize: '0.74rem', color: '#ffd60a', lineHeight: '1.4', background: 'rgba(255,214,10,0.08)', padding: '6px 8px', borderRadius: '6px', border: '0.5px solid rgba(255,214,10,0.2)' }}>
                                                    {catItem.advice}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* 3. Global AI Financial Tip */}
                            {explanationModalData.summaryAdvice && (!explanationModalData.categoryBreakdown || explanationModalData.categoryBreakdown.length === 0) && (
                                <div style={{ background: 'rgba(10,132,255,0.08)', border: '1px solid rgba(10,132,255,0.25)', borderRadius: '12px', padding: '12px 14px', fontSize: '0.78rem', color: '#64d2ff', lineHeight: '1.5', flexShrink: 0 }}>
                                    {explanationModalData.summaryAdvice}
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div style={{ paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
                            <button
                                type="button"
                                onClick={() => setExplanationModalData(null)}
                                className="liquid-modal-btn liquid-btn-confirm"
                                style={{ width: '100%', padding: '11px', fontSize: '0.88rem', fontWeight: '750', borderRadius: '12px' }}
                            >
                                我知道了
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* 🧾 Itemized Breakdown Modal (小票分項明細彈窗) */}
            {itemizedModalRecord && createPortal(
                <div className="liquid-modal-overlay" style={{ zIndex: 12000 }} onClick={() => setItemizedModalRecord(null)}>
                    <div
                        className="liquid-modal-card"
                        style={{ maxWidth: '440px', width: '92%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '1.3rem' }}>🧾</span>
                                <div>
                                    <div style={{ fontWeight: '850', fontSize: '1rem', color: '#fff' }}>消費分項小票明細</div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{itemizedModalRecord.date} · {itemizedModalRecord.category}</div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setItemizedModalRecord(null)}
                                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: '30px', height: '30px', color: '#fff', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Content List */}
                        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {itemizedModalRecord.note && (
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: '8px' }}>
                                    📝 備註：<strong>{itemizedModalRecord.note}</strong>
                                </div>
                            )}

                            <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '12px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {(itemizedModalRecord.itemizedBreakdown || []).map((item, idx) => (
                                        <div
                                            key={idx}
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '8px 10px',
                                                background: 'rgba(255,255,255,0.03)',
                                                borderRadius: '8px',
                                                fontSize: '0.84rem'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.72rem', fontWeight: '700' }}>#{idx + 1}</span>
                                                <span style={{ color: '#fff', fontWeight: '600' }}>{item.name}</span>
                                            </div>
                                            <span style={{ fontWeight: '850', color: '#8effa2', fontFamily: 'monospace' }}>
                                                ${Number(item.amount).toLocaleString()}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed rgba(255,255,255,0.15)', fontWeight: '850', fontSize: '0.94rem' }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>小票合計 (共 {itemizedModalRecord.itemizedBreakdown?.length || 0} 項)</span>
                                    <span style={{ color: '#8effa2', fontSize: '1.1rem' }}>${Number(itemizedModalRecord.total).toLocaleString()} TWD</span>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                type="button"
                                onClick={() => setItemizedModalRecord(null)}
                                className="glass-btn primary-gradient-btn"
                                style={{ padding: '8px 20px', borderRadius: '10px', fontSize: '0.82rem', fontWeight: '800' }}
                            >
                                關閉
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