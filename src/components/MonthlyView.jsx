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
    const [debtScope, setDebtScope] = useState('all'); // 'all' (全期歷史未結) | 'month' (當月未結) | 'history' (歷史結清紀錄)
    const [expandedDebtMonths, setExpandedDebtMonths] = useState({}); // Month expansion toggles for detailed breakdown

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
                itemizedBreakdown: r.itemizedBreakdown,
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
                    itemizedBreakdown: r.itemizedBreakdown,
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


    // --- 🤝 共同支出代墊結算核心計算與辨識引擎 ---
    // 智慧辨識一筆共同支出是誰代墊（支援 advancedBy、帳戶歸屬、以及付款人名稱多層防禦判定）
    const getRecordAdvanceUser = useCallback((record) => {
        if (!record || record.type !== 'spend' || record.isDeleted) return null;
        
        // 1. 直接指定之代墊人
        if (record.advancedBy === 'userA') return 'userA';
        if (record.advancedBy === 'userB') return 'userB';
        if (record.advancedBy === 'jointCash') return null; // 共同現金公費直付，非個人代墊
        
        // 2. 依據扣款帳戶之歸屬判斷 (若非 joint 則視為該個人代墊)
        if (record.accountId && Array.isArray(assets?.accounts)) {
            const acc = assets.accounts.find(a => a.id === record.accountId);
            if (acc) {
                if (acc.owner === 'userA') return 'userA';
                if (acc.owner === 'userB') return 'userB';
                if (acc.owner === 'joint') return null;
            }
        }
        
        // 3. 依據付款人名稱判斷
        const p = record.payer || '';
        if (p.includes('大狗') || p.includes('大狗狗') || p === 'userA') return 'userA';
        if (p.includes('阿陞') || p === 'userB') return 'userB';
        if (p.includes('共同') || p.includes('貓頭鷹')) return null;
        
        // 4. 依據操作者判定
        if (record.operator?.includes('大狗') || record.operator === 'userA') return 'userA';
        if (record.operator?.includes('阿陞') || record.operator === 'userB') return 'userB';
        
        return null;
    }, [assets?.accounts]);

    // 取得單筆共同支出的代墊結算狀態與視覺標籤
    const getRecordSettlementInfo = useCallback((record) => {
        if (!record || record.type !== 'spend' || record.isDeleted) return null;
        const advUser = getRecordAdvanceUser(record);
        if (!advUser) {
            return {
                isJointDirect: true,
                label: '🦉 共同現金直付',
                color: '#64d2ff',
                bg: 'rgba(100, 210, 255, 0.12)',
                border: 'rgba(100, 210, 255, 0.35)'
            };
        }
        const advName = advUser === 'userA' ? '大狗狗' : '阿陞';
        if (record.isSettled) {
            return {
                isSettled: true,
                advUser,
                advName,
                label: `✅ 已代墊結清 (${advName}代墊)`,
                color: '#30d158',
                bg: 'rgba(48, 209, 88, 0.15)',
                border: 'rgba(48, 209, 88, 0.35)',
                settleId: record.settleId || record.settlementId
            };
        }
        return {
            isSettled: false,
            advUser,
            advName,
            label: `⏳ 待代墊結算 (${advName}代墊)`,
            color: '#ff9f0a',
            bg: 'rgba(255, 159, 10, 0.15)',
            border: 'rgba(255, 159, 10, 0.4)'
        };
    }, [getRecordAdvanceUser]);

    // 全期歷史中所有「待結算代墊共同支出」明細 (跨越所有月份，不漏掉任何歷史帳目)
    const allUnsettledDebts = useMemo(() => {
        return historyWithIndex.filter(r => {
            if (r.isDeleted) return false;
            if (r.type !== 'spend') return false;
            if (r.isSettled) return false;
            const advUser = getRecordAdvanceUser(r);
            return !!advUser;
        });
    }, [historyWithIndex, getRecordAdvanceUser]);

    // 當前選取範圍（全期 vs 當月）下的待結清清單
    const activeUnsettledDebts = useMemo(() => {
        if (debtScope === 'month') {
            return allUnsettledDebts.filter(r => r.month === filterDate || r.date?.startsWith(filterDate));
        }
        return allUnsettledDebts;
    }, [allUnsettledDebts, debtScope, filterDate]);

    // 歷史所有已完成結算的紀錄清單 (type === 'settlement' 或 type === 'settle')
    const settledHistoryLogs = useMemo(() => {
        return historyWithIndex.filter(r => {
            if (r.isDeleted) return false;
            return r.type === 'settlement' || r.type === 'settle' || r.category === '代墊結清';
        }).sort((a, b) => new Date(b.date || b.timestamp || 0) - new Date(a.date || a.timestamp || 0));
    }, [historyWithIndex]);

    // 計算雙方待結款項與相互對沖抵銷淨額 (Net Offset Summary)
    const settlementSummary = useMemo(() => {
        const userADebts = activeUnsettledDebts.filter(r => getRecordAdvanceUser(r) === 'userA');
        const userBDebts = activeUnsettledDebts.filter(r => getRecordAdvanceUser(r) === 'userB');

        const totalA = userADebts.reduce((sum, r) => sum + (Number(r.total) || 0), 0);
        const totalB = userBDebts.reduce((sum, r) => sum + (Number(r.total) || 0), 0);

        const diff = totalA - totalB; // 正數代表大狗狗代墊較多，阿陞需轉帳給大狗狗；負數代表阿陞代墊較多
        const absDiff = Math.abs(diff);
        const netPayAmount = Math.round(absDiff / 2);

        let payer = null;
        let receiver = null;
        let payerKey = null;
        let receiverKey = null;

        if (diff > 0) {
            payer = '阿陞 🐶';
            payerKey = 'userB';
            receiver = '大狗狗 🐕';
            receiverKey = 'userA';
        } else if (diff < 0) {
            payer = '大狗狗 🐕';
            payerKey = 'userA';
            receiver = '阿陞 🐶';
            receiverKey = 'userB';
        }

        // 按月份分組統整明細
        const groupByMonth = (list) => {
            const map = {};
            list.forEach(item => {
                const m = item.month || (item.date ? item.date.slice(0, 7) : '未分類');
                if (!map[m]) map[m] = { month: m, total: 0, items: [] };
                map[m].total += (Number(item.total) || 0);
                map[m].items.push(item);
            });
            return Object.values(map).sort((a, b) => b.month.localeCompare(a.month));
        };

        return {
            userADebts,
            userBDebts,
            userAMonths: groupByMonth(userADebts),
            userBMonths: groupByMonth(userBDebts),
            totalA,
            totalB,
            countA: userADebts.length,
            countB: userBDebts.length,
            totalCount: userADebts.length + userBDebts.length,
            diff,
            absDiff,
            netPayAmount,
            payer,
            receiver,
            payerKey,
            receiverKey,
            isBalanced: totalA > 0 && totalA === totalB,
            isEmpty: totalA === 0 && totalB === 0
        };
    }, [activeUnsettledDebts, getRecordAdvanceUser]);

    // 取得指定使用者的待結清清單（支援全期或當月範圍）
    const getDebtList = (user) => {
        return activeUnsettledDebts.filter(r => getRecordAdvanceUser(r) === user);
    };

    // ⚡ 雙向對沖一鍵合併結清 (結清雙方所有待結款項，相互抵銷，只轉移支付淨差額)
    const handleDualSettle = async () => {
        const { userADebts, userBDebts, totalA, totalB, countA, countB, totalCount, netPayAmount, payer, receiver, payerKey, receiverKey } = settlementSummary;
        if (totalCount === 0) {
            await customAlert("目前沒有任何待結算的代墊款項！");
            return;
        }

        const targetDebts = [...userADebts, ...userBDebts];
        const targetIndices = new Set(targetDebts.map(d => d.originalIndex));

        let confirmMsg = `確定辦理【${debtScope === 'all' ? '🌐 全期歷史未結' : `📅 ${filterDate} 當月`}】雙向代墊合併結清嗎？\n\n`;
        confirmMsg += `• 🐕 大狗狗 累計代墊：${formatMoney(totalA)} (${countA} 筆)\n`;
        confirmMsg += `• 🐶 阿陞 累計代墊：${formatMoney(totalB)} (${countB} 筆)\n\n`;
        
        if (netPayAmount > 0) {
            confirmMsg += `👉 相互對沖抵銷後：應由【${payer}】轉帳支付給【${receiver}】 $${netPayAmount.toLocaleString()} 元。\n\n`;
        } else {
            confirmMsg += `👉 雙方代墊總額剛好平衡，直接對沖結清！\n\n`;
        }
        confirmMsg += `本次將一次將 ${totalCount} 筆共同支出代墊明細全數標記為已結清。`;

        if (!(await customConfirm(confirmMsg, "雙向對沖一鍵結清"))) return;

        const settleId = generateSettleId();
        const nowIso = new Date().toISOString();
        const todayStr = nowIso.split('T')[0];

        const updatedHistory = history.map(r => {
            if (targetIndices.has(r.originalIndex)) {
                return {
                    ...r,
                    isSettled: true,
                    settleId: settleId,
                    settlementId: settleId,
                    settledAt: nowIso
                };
            }
            return r;
        });

        const settlementLog = {
            id: settleId,
            date: todayStr,
            month: todayStr.slice(0, 7),
            type: 'settlement',
            category: '代墊結清',
            total: netPayAmount,
            payer: payer || '雙方結清',
            receiver: receiver || '雙方結清',
            settledUser: receiverKey || null,
            operator: currentUser?.email?.split('@')[0] || '系統',
            note: `[代墊結清] 結清大狗狗代墊 $${totalA.toLocaleString()} (${countA}筆) 與 阿陞代墊 $${totalB.toLocaleString()} (${countB}筆)，對沖後由 ${payer || '雙方'} 轉付 ${receiver || '雙方'} $${netPayAmount.toLocaleString()}`,
            timestamp: nowIso,
            settleId: settleId,
            settlementId: settleId,
            settledCount: totalCount,
            settleScope: debtScope
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

        await customAlert(`🎉 雙向對沖結清完成！\n共結清 ${totalCount} 筆代墊明細。\n結算紀錄已建立，流水帳狀態已全數同步更新。`, "結清成功");
    };

    // 單方獨立結清 (保留作為彈性備用選項)
    const handleSettle = async (user) => {
        const debts = getDebtList(user);
        const totalDebt = debts.reduce((sum, r) => sum + (Number(r.total) || 0), 0);
        const half = Math.round(totalDebt / 2);

        const label = user === 'userA' ? '大狗狗 🐕' : '阿陞 🐶';
        const partnerLabel = user === 'userA' ? '阿陞 🐶' : '大狗狗 🐕';
        
        const confirmMsg = `確定單獨為 ${label} 辦理一鍵結清嗎？\n本次結清 ${debts.length} 筆，代墊總額 ${formatMoney(totalDebt)}。\n應由 ${partnerLabel} 轉移支付半數 $${half.toLocaleString()} 元。`;
        
        if (!(await customConfirm(confirmMsg, "單方一鍵結清"))) return;

        const settleId = generateSettleId();
        const nowIso = new Date().toISOString();
        const todayStr = nowIso.split('T')[0];

        const targetIndices = new Set(debts.map(d => d.originalIndex));
        const updatedHistory = history.map(r => {
            if (targetIndices.has(r.originalIndex)) {
                return { ...r, isSettled: true, settleId: settleId, settlementId: settleId, settledAt: nowIso };
            }
            return r;
        });

        const settlementLog = {
            id: settleId,
            date: todayStr,
            month: todayStr.slice(0, 7),
            type: 'settlement',
            category: '代墊結清',
            total: half,
            payer: partnerLabel,
            receiver: label,
            settledUser: user,
            operator: currentUser?.email?.split('@')[0] || '系統',
            note: `[單方代墊結清] 結清${label}代墊的 ${debts.length} 筆帳目 (代墊總額: $${totalDebt.toLocaleString()})，由 ${partnerLabel} 支付 $${half.toLocaleString()}`,
            timestamp: nowIso,
            settleId: settleId,
            settlementId: settleId,
            settledCount: debts.length
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
        await customAlert(`🎉 結清成功！已生成一筆結清紀錄。`, "結清成功");
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
                                                        {/* Settlement Badge for Batch */}
                                                        {(() => {
                                                            const spendSubs = record.records?.filter(r => r.type === 'spend' && !r.isDeleted && r.category !== '作廢退款') || [];
                                                            if (spendSubs.length === 0) return null;
                                                            const allSettled = spendSubs.every(r => r.isSettled);
                                                            return (
                                                                <span style={{
                                                                    fontSize: '0.62rem',
                                                                    background: allSettled ? 'rgba(48,209,88,0.15)' : 'rgba(255,159,10,0.15)',
                                                                    color: allSettled ? '#30d158' : '#ff9f0a',
                                                                    border: allSettled ? '0.5px solid rgba(48,209,88,0.35)' : '0.5px solid rgba(255,159,10,0.4)',
                                                                    padding: '1px 6px',
                                                                    borderRadius: '4px',
                                                                    fontWeight: '750'
                                                                }}>
                                                                    {allSettled ? '✅ 代墊已結清' : '⏳ 含待結算代墊'}
                                                                </span>
                                                            );
                                                        })()}
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
                                                            const hasItemized = Array.isArray(sub.itemizedBreakdown) && sub.itemizedBreakdown.length > 0;
                                                            return (
                                                                <div key={sIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', opacity: isSubDeleted ? 0.45 : 1 }}>
                                                                    <span style={{ color: isSubDeleted ? '#8e8e93' : '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: isSubDeleted ? 'line-through' : 'none', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                                                        <span>
                                                                            <span style={{ color: isSubDeleted ? '#8e8e93' : '#ff9f0a', marginRight: '4px' }}>•</span>
                                                                            <strong style={{ opacity: 0.9 }}>{sub.subCategory || sub.category}</strong>
                                                                            {sub.note && sub.note !== (sub.subCategory || sub.category) ? <span style={{ opacity: 0.7, marginLeft: '4px' }}>({sub.note.replace(`${sub.subCategory} - `, '')})</span> : ''}
                                                                            {isSubDeleted && <span style={{ fontSize: '0.62rem', color: '#8e8e93', marginLeft: '4px' }}>(已作廢)</span>}
                                                                        </span>
                                                                        {hasItemized && !isSubDeleted && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setItemizedModalRecord(sub);
                                                                                }}
                                                                                style={{
                                                                                    background: 'rgba(100, 210, 255, 0.12)',
                                                                                    border: '0.5px solid rgba(100, 210, 255, 0.3)',
                                                                                    borderRadius: '4px',
                                                                                    padding: '1px 5px',
                                                                                    color: '#64d2ff',
                                                                                    fontSize: '0.65rem',
                                                                                    cursor: 'pointer',
                                                                                    fontWeight: '750',
                                                                                    display: 'inline-flex',
                                                                                    alignItems: 'center',
                                                                                    gap: '2px',
                                                                                    marginLeft: '4px'
                                                                                }}
                                                                                title="查看此明細小票分項"
                                                                            >
                                                                                <span>🧾</span>
                                                                                <span>小票 ({sub.itemizedBreakdown.length}項)</span>
                                                                            </button>
                                                                        )}
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
                                                    {/* Settlement Status Badge for Spend / Joint Expenses */}
                                                    {(() => {
                                                        const settleInfo = getRecordSettlementInfo(record);
                                                        if (!settleInfo) return null;
                                                        return (
                                                            <span style={{
                                                                fontSize: '0.62rem',
                                                                background: settleInfo.bg,
                                                                color: settleInfo.color,
                                                                border: `0.5px solid ${settleInfo.border}`,
                                                                padding: '1px 6px',
                                                                borderRadius: '4px',
                                                                fontWeight: '750'
                                                            }}>
                                                                {settleInfo.label}
                                                            </span>
                                                        );
                                                    })()}
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

            {/* VIEW MODE 3: DEBT SETTLEMENT (代墊結算全新升級版) */}
            {viewMode === 'debts' && (
                <div className="slide-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    
                    {/* Scope Selector: All-time vs Current Month vs Settlement History */}
                    <div style={{
                        display: 'flex',
                        gap: '6px',
                        background: 'rgba(255, 255, 255, 0.04)',
                        padding: '4px',
                        borderRadius: '12px',
                        border: '1px solid rgba(255, 255, 255, 0.08)'
                    }}>
                        <button
                            type="button"
                            onClick={() => setDebtScope('all')}
                            style={{
                                flex: 1.2,
                                padding: '8px 6px',
                                fontSize: '0.78rem',
                                borderRadius: '8px',
                                border: 'none',
                                background: debtScope === 'all' ? 'rgba(10, 132, 255, 0.25)' : 'transparent',
                                color: debtScope === 'all' ? '#64d2ff' : 'var(--text-secondary)',
                                fontWeight: debtScope === 'all' ? '800' : '600',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px'
                            }}
                        >
                            <span>🌐 全期未結</span>
                            <span style={{ fontSize: '0.68rem', opacity: 0.85, background: debtScope === 'all' ? 'rgba(100,210,255,0.2)' : 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: '10px' }}>
                                {allUnsettledDebts.length}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setDebtScope('month')}
                            style={{
                                flex: 1,
                                padding: '8px 6px',
                                fontSize: '0.78rem',
                                borderRadius: '8px',
                                border: 'none',
                                background: debtScope === 'month' ? 'rgba(10, 132, 255, 0.25)' : 'transparent',
                                color: debtScope === 'month' ? '#64d2ff' : 'var(--text-secondary)',
                                fontWeight: debtScope === 'month' ? '800' : '600',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px'
                            }}
                        >
                            <span>📅 當月 ({filterDate.slice(5)}月)</span>
                            <span style={{ fontSize: '0.68rem', opacity: 0.85, background: debtScope === 'month' ? 'rgba(100,210,255,0.2)' : 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: '10px' }}>
                                {allUnsettledDebts.filter(r => r.month === filterDate || r.date?.startsWith(filterDate)).length}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setDebtScope('history')}
                            style={{
                                flex: 1,
                                padding: '8px 6px',
                                fontSize: '0.78rem',
                                borderRadius: '8px',
                                border: 'none',
                                background: debtScope === 'history' ? 'rgba(10, 132, 255, 0.25)' : 'transparent',
                                color: debtScope === 'history' ? '#64d2ff' : 'var(--text-secondary)',
                                fontWeight: debtScope === 'history' ? '800' : '600',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px'
                            }}
                        >
                            <span>📜 歷史結清</span>
                            <span style={{ fontSize: '0.68rem', opacity: 0.85, background: debtScope === 'history' ? 'rgba(100,210,255,0.2)' : 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: '10px' }}>
                                {settledHistoryLogs.length}
                            </span>
                        </button>
                    </div>

                    {/* VIEW SUBMODE A: ACTIVE UNSETTLED MASTER CARD & BREAKDOWNS */}
                    {debtScope !== 'history' && (
                        <>
                            {/* MASTER CARD: 雙向相互對沖淨額主卡片 */}
                            <div className="glass-card" style={{
                                padding: '18px 16px',
                                border: settlementSummary.isEmpty ? '1px solid rgba(48, 209, 88, 0.3)' : '1px solid rgba(100, 210, 255, 0.3)',
                                background: settlementSummary.isEmpty
                                    ? 'linear-gradient(135deg, rgba(48, 209, 88, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%)'
                                    : 'linear-gradient(135deg, rgba(10, 132, 255, 0.12) 0%, rgba(175, 82, 222, 0.08) 100%)',
                                position: 'relative',
                                overflow: 'hidden'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '1.2rem' }}>⚖️</span>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: '850', color: '#fff' }}>
                                                {debtScope === 'all' ? '全期代墊雙向對沖結算' : `${currentMonthLabel} 代墊對沖結算`}
                                            </h3>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                                                {debtScope === 'all' ? '自動整合歷史所有未結共同支出，自動相互抵銷' : '僅結算當月之未結共同支出'}
                                            </span>
                                        </div>
                                    </div>
                                    <span style={{
                                        fontSize: '0.68rem',
                                        fontWeight: '800',
                                        padding: '2px 8px',
                                        borderRadius: '12px',
                                        background: settlementSummary.isEmpty ? 'rgba(48, 209, 88, 0.15)' : 'rgba(255, 159, 10, 0.15)',
                                        color: settlementSummary.isEmpty ? '#30d158' : '#ff9f0a',
                                        border: settlementSummary.isEmpty ? '0.5px solid rgba(48, 209, 88, 0.4)' : '0.5px solid rgba(255, 159, 10, 0.4)'
                                    }}>
                                        {settlementSummary.isEmpty ? '✅ 帳務已平' : `待結清 ${settlementSummary.totalCount} 筆`}
                                    </span>
                                </div>

                                {/* Comparison Grid */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr 1fr',
                                    gap: '10px',
                                    marginBottom: '14px'
                                }}>
                                    {/* User A Block */}
                                    <div style={{
                                        background: 'rgba(0, 0, 0, 0.25)',
                                        border: '0.5px solid rgba(175, 82, 222, 0.35)',
                                        borderRadius: '12px',
                                        padding: '12px 10px',
                                        textAlign: 'center'
                                    }}>
                                        <div style={{ fontSize: '0.74rem', color: '#bf5af2', fontWeight: '800', marginBottom: '2px' }}>
                                            🐕 大狗狗 累計代墊
                                        </div>
                                        <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#fff' }}>
                                            ${settlementSummary.totalA.toLocaleString()}
                                        </div>
                                        <div style={{ fontSize: '0.66rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                                            共 {settlementSummary.countA} 筆 (半數: ${Math.round(settlementSummary.totalA / 2).toLocaleString()})
                                        </div>
                                    </div>

                                    {/* User B Block */}
                                    <div style={{
                                        background: 'rgba(0, 0, 0, 0.25)',
                                        border: '0.5px solid rgba(48, 209, 88, 0.35)',
                                        borderRadius: '12px',
                                        padding: '12px 10px',
                                        textAlign: 'center'
                                    }}>
                                        <div style={{ fontSize: '0.74rem', color: '#30d158', fontWeight: '800', marginBottom: '2px' }}>
                                            🐶 阿陞 累計代墊
                                        </div>
                                        <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#fff' }}>
                                            ${settlementSummary.totalB.toLocaleString()}
                                        </div>
                                        <div style={{ fontSize: '0.66rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                                            共 {settlementSummary.countB} 筆 (半數: ${Math.round(settlementSummary.totalB / 2).toLocaleString()})
                                        </div>
                                    </div>
                                </div>

                                {/* Net Result & One-Click Settle Action Box */}
                                {settlementSummary.isEmpty ? (
                                    <div style={{
                                        textAlign: 'center',
                                        padding: '14px 10px',
                                        background: 'rgba(48, 209, 88, 0.1)',
                                        borderRadius: '12px',
                                        border: '0.5px solid rgba(48, 209, 88, 0.25)',
                                        color: '#30d158',
                                        fontSize: '0.85rem',
                                        fontWeight: '750'
                                    }}>
                                        🎉 目前無任何待結算的共同代墊款項！雙方帳務乾淨平衡。
                                    </div>
                                ) : settlementSummary.isBalanced ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        <div style={{
                                            background: 'rgba(48, 209, 88, 0.12)',
                                            border: '1px solid rgba(48, 209, 88, 0.3)',
                                            borderRadius: '12px',
                                            padding: '12px 14px',
                                            textAlign: 'center'
                                        }}>
                                            <div style={{ fontSize: '0.78rem', color: '#30d158', fontWeight: '800' }}>
                                                ⚖️ 雙方代墊總額剛好平衡！
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.85)', marginTop: '4px' }}>
                                                雙方各自代墊 ${settlementSummary.totalA.toLocaleString()}，互相抵銷後差額為 $0，無需任何轉帳。
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleDualSettle}
                                            className="glass-btn"
                                            style={{
                                                width: '100%',
                                                padding: '12px',
                                                fontSize: '0.9rem',
                                                fontWeight: '850',
                                                background: 'linear-gradient(135deg, #30d158 0%, #28cd41 100%)',
                                                color: '#000',
                                                border: 'none',
                                                borderRadius: '12px',
                                                cursor: 'pointer',
                                                boxShadow: '0 4px 15px rgba(48, 209, 88, 0.3)'
                                            }}
                                        >
                                            ⚡ 一鍵平衡歸零結清 (沖銷 {settlementSummary.totalCount} 筆)
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        <div style={{
                                            background: 'rgba(0, 0, 0, 0.35)',
                                            border: '1px solid rgba(255, 159, 10, 0.4)',
                                            borderRadius: '12px',
                                            padding: '14px',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}>
                                            <div>
                                                <div style={{ fontSize: '0.74rem', color: '#ff9f0a', fontWeight: '800' }}>
                                                    👉 相互抵銷後結算指示
                                                </div>
                                                <div style={{ fontSize: '0.92rem', fontWeight: '850', color: '#fff', marginTop: '3px' }}>
                                                    應由 <span style={{ color: '#ff9f0a' }}>{settlementSummary.payer}</span> 轉帳給 <span style={{ color: '#64d2ff' }}>{settlementSummary.receiver}</span>
                                                </div>
                                                <div style={{ fontSize: '0.66rem', color: 'var(--text-tertiary)', marginTop: '3px' }}>
                                                    公式：|${settlementSummary.totalA.toLocaleString()} - ${settlementSummary.totalB.toLocaleString()}| ÷ 2 = ${settlementSummary.netPayAmount.toLocaleString()}
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '1.45rem', fontWeight: '950', color: '#ff9f0a', fontFamily: 'monospace' }}>
                                                    ${settlementSummary.netPayAmount.toLocaleString()}
                                                </div>
                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)' }}>應付淨額 TWD</div>
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={handleDualSettle}
                                            className="glass-btn"
                                            style={{
                                                width: '100%',
                                                padding: '12px',
                                                fontSize: '0.92rem',
                                                fontWeight: '850',
                                                background: 'linear-gradient(135deg, #ff9f0a 0%, #ff643b 100%)',
                                                color: '#000',
                                                border: 'none',
                                                borderRadius: '12px',
                                                cursor: 'pointer',
                                                boxShadow: '0 4px 18px rgba(255, 159, 10, 0.35)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '6px'
                                            }}
                                        >
                                            <span>⚡ 一鍵雙向對沖結清</span>
                                            <span style={{ fontSize: '0.8rem', opacity: 0.9 }}>
                                                ({settlementSummary.payer} ➔ {settlementSummary.receiver} ${settlementSummary.netPayAmount.toLocaleString()})
                                            </span>
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* USER A ITEM DETAILS ACCORDION CARD */}
                            <div className="glass-card" style={{ padding: '16px', borderLeft: '4px solid #bf5af2' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <div>
                                        <h4 style={{ margin: 0, fontWeight: '850', color: '#fff', fontSize: '0.94rem' }}>
                                            🐕 大狗狗 的代墊清單
                                        </h4>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                                            大狗狗為「共同支出」代墊之未結款項
                                        </span>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontWeight: '850', fontSize: '1.18rem', color: '#bf5af2' }}>
                                            ${settlementSummary.totalA.toLocaleString()}
                                        </div>
                                        <span style={{ fontSize: '0.64rem', color: 'var(--text-tertiary)' }}>
                                            共 {settlementSummary.countA} 筆
                                        </span>
                                    </div>
                                </div>

                                {settlementSummary.countA === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '16px', color: '#30d158', fontSize: '0.8rem', fontWeight: '700' }}>
                                        ✅ 大狗狗目前無任何未結清代墊
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {settlementSummary.userAMonths.map(mGroup => {
                                            const isExpanded = expandedDebtMonths[`userA_${mGroup.month}`] !== false; // Default expanded
                                            return (
                                                <div key={mGroup.month} style={{ background: 'rgba(0,0,0,0.22)', borderRadius: '10px', border: '0.5px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                                    <div
                                                        onClick={() => setExpandedDebtMonths(prev => ({ ...prev, [`userA_${mGroup.month}`]: !isExpanded }))}
                                                        style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: 'rgba(255,255,255,0.03)' }}
                                                    >
                                                        <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <span>{isExpanded ? '▼' : '▶'}</span>
                                                            <span>📅 {mGroup.month}</span>
                                                            <span style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', fontWeight: 'normal' }}>({mGroup.items.length} 筆)</span>
                                                        </span>
                                                        <span style={{ fontSize: '0.84rem', fontWeight: '800', color: '#bf5af2' }}>
                                                            ${mGroup.total.toLocaleString()}
                                                        </span>
                                                    </div>

                                                    {isExpanded && (
                                                        <div style={{ padding: '4px 10px 8px 10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                            {mGroup.items.map((r, idx) => {
                                                                const sourceAcc = assets.accounts?.find(a => a.id === r.accountId);
                                                                return (
                                                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 4px', borderBottom: idx < mGroup.items.length - 1 ? '1px dashed rgba(255,255,255,0.05)' : 'none' }}>
                                                                        <div style={{ minWidth: 0, flex: 1, paddingRight: '8px' }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#fff' }}>
                                                                                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.7rem' }}>{r.date}</span>
                                                                                <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.note || r.category}</strong>
                                                                                {Array.isArray(r.itemizedBreakdown) && r.itemizedBreakdown.length > 0 && (
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => setItemizedModalRecord(r)}
                                                                                        style={{ background: 'rgba(100,210,255,0.12)', border: '0.5px solid rgba(100,210,255,0.3)', color: '#64d2ff', fontSize: '0.62rem', padding: '1px 5px', borderRadius: '4px', cursor: 'pointer' }}
                                                                                    >
                                                                                        🧾 小票
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                            {sourceAcc && (
                                                                                <div style={{ fontSize: '0.66rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                                                                    扣款：{sourceAcc.icon || '🏦'} {sourceAcc.nickname}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        <div style={{ fontSize: '0.86rem', fontWeight: '800', color: '#fff', flexShrink: 0 }}>
                                                                            ${r.total.toLocaleString()}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}

                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', paddingTop: '6px' }}>
                                            <div
                                                style={{ fontSize: '0.76rem', color: 'var(--accent-blue)', textDecoration: 'underline', cursor: 'pointer', fontWeight: '600' }}
                                                onClick={() => { setSettlementTarget('userA'); setShowSettlementModal(true); }}
                                            >
                                                📄 查看大狗狗完整對帳單
                                            </div>
                                            <button
                                                className="glass-btn"
                                                style={{ padding: '5px 12px', fontSize: '0.76rem', fontWeight: '700', color: '#bf5af2', borderColor: 'rgba(191,90,242,0.3)', backgroundColor: 'rgba(191,90,242,0.08)' }}
                                                onClick={() => handleSettle('userA')}
                                            >
                                                單獨結清大狗狗
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* USER B ITEM DETAILS ACCORDION CARD */}
                            <div className="glass-card" style={{ padding: '16px', borderLeft: '4px solid #30d158' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <div>
                                        <h4 style={{ margin: 0, fontWeight: '850', color: '#fff', fontSize: '0.94rem' }}>
                                            🐶 阿陞 的代墊清單
                                        </h4>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                                            阿陞為「共同支出」代墊之未結款項
                                        </span>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontWeight: '850', fontSize: '1.18rem', color: '#30d158' }}>
                                            ${settlementSummary.totalB.toLocaleString()}
                                        </div>
                                        <span style={{ fontSize: '0.64rem', color: 'var(--text-tertiary)' }}>
                                            共 {settlementSummary.countB} 筆
                                        </span>
                                    </div>
                                </div>

                                {settlementSummary.countB === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '16px', color: '#30d158', fontSize: '0.8rem', fontWeight: '700' }}>
                                        ✅ 阿陞目前無任何未結清代墊
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {settlementSummary.userBMonths.map(mGroup => {
                                            const isExpanded = expandedDebtMonths[`userB_${mGroup.month}`] !== false; // Default expanded
                                            return (
                                                <div key={mGroup.month} style={{ background: 'rgba(0,0,0,0.22)', borderRadius: '10px', border: '0.5px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                                    <div
                                                        onClick={() => setExpandedDebtMonths(prev => ({ ...prev, [`userB_${mGroup.month}`]: !isExpanded }))}
                                                        style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: 'rgba(255,255,255,0.03)' }}
                                                    >
                                                        <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <span>{isExpanded ? '▼' : '▶'}</span>
                                                            <span>📅 {mGroup.month}</span>
                                                            <span style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', fontWeight: 'normal' }}>({mGroup.items.length} 筆)</span>
                                                        </span>
                                                        <span style={{ fontSize: '0.84rem', fontWeight: '800', color: '#30d158' }}>
                                                            ${mGroup.total.toLocaleString()}
                                                        </span>
                                                    </div>

                                                    {isExpanded && (
                                                        <div style={{ padding: '4px 10px 8px 10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                            {mGroup.items.map((r, idx) => {
                                                                const sourceAcc = assets.accounts?.find(a => a.id === r.accountId);
                                                                return (
                                                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 4px', borderBottom: idx < mGroup.items.length - 1 ? '1px dashed rgba(255,255,255,0.05)' : 'none' }}>
                                                                        <div style={{ minWidth: 0, flex: 1, paddingRight: '8px' }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#fff' }}>
                                                                                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.7rem' }}>{r.date}</span>
                                                                                <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.note || r.category}</strong>
                                                                                {Array.isArray(r.itemizedBreakdown) && r.itemizedBreakdown.length > 0 && (
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => setItemizedModalRecord(r)}
                                                                                        style={{ background: 'rgba(100,210,255,0.12)', border: '0.5px solid rgba(100,210,255,0.3)', color: '#64d2ff', fontSize: '0.62rem', padding: '1px 5px', borderRadius: '4px', cursor: 'pointer' }}
                                                                                    >
                                                                                        🧾 小票
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                            {sourceAcc && (
                                                                                <div style={{ fontSize: '0.66rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                                                                    扣款：{sourceAcc.icon || '🏦'} {sourceAcc.nickname}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        <div style={{ fontSize: '0.86rem', fontWeight: '800', color: '#fff', flexShrink: 0 }}>
                                                                            ${r.total.toLocaleString()}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}

                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', paddingTop: '6px' }}>
                                            <div
                                                style={{ fontSize: '0.76rem', color: 'var(--accent-blue)', textDecoration: 'underline', cursor: 'pointer', fontWeight: '600' }}
                                                onClick={() => { setSettlementTarget('userB'); setShowSettlementModal(true); }}
                                            >
                                                📄 查看阿陞完整對帳單
                                            </div>
                                            <button
                                                className="glass-btn"
                                                style={{ padding: '5px 12px', fontSize: '0.76rem', fontWeight: '700', color: '#30d158', borderColor: 'rgba(52,199,89,0.3)', backgroundColor: 'rgba(52,199,89,0.08)' }}
                                                onClick={() => handleSettle('userB')}
                                            >
                                                單獨結清阿陞
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* VIEW SUBMODE B: HISTORICAL SETTLEMENT LOGS */}
                    {debtScope === 'history' && (
                        <div className="glass-card" style={{ padding: '18px 16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: '850', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span>📜</span>
                                        <span>歷史代墊結清紀錄</span>
                                    </h3>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                                        過去所有已完成的代墊結清交易
                                    </span>
                                </div>
                                <span style={{ fontSize: '0.72rem', color: '#64d2ff', fontWeight: '800', background: 'rgba(100,210,255,0.12)', padding: '2px 8px', borderRadius: '10px' }}>
                                    共 {settledHistoryLogs.length} 筆紀錄
                                </span>
                            </div>

                            {settledHistoryLogs.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>
                                    尚未有任何歷史代墊結清紀錄
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {settledHistoryLogs.map((log, lIdx) => (
                                        <div
                                            key={lIdx}
                                            style={{
                                                background: 'rgba(0,0,0,0.25)',
                                                border: '1px solid rgba(48, 209, 88, 0.25)',
                                                borderRadius: '12px',
                                                padding: '12px 14px',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '6px'
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span style={{ background: 'rgba(48,209,88,0.15)', color: '#30d158', fontSize: '0.68rem', fontWeight: '800', padding: '1px 6px', borderRadius: '5px' }}>
                                                        🤝 代墊結清
                                                    </span>
                                                    <span style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>
                                                        {log.date}
                                                    </span>
                                                </div>
                                                <strong style={{ fontSize: '1rem', color: '#30d158', fontFamily: 'monospace' }}>
                                                    ${(log.total || 0).toLocaleString()} TWD
                                                </strong>
                                            </div>
                                            <div style={{ fontSize: '0.82rem', color: '#fff', fontWeight: '600' }}>
                                                {log.note || '共同支出代墊款結清'}
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.68rem', color: 'var(--text-tertiary)', borderTop: '0.5px solid rgba(255,255,255,0.05)', paddingTop: '6px' }}>
                                                <span>付款方：<strong style={{ color: 'rgba(255,255,255,0.8)' }}>{log.payer || '無'}</strong></span>
                                                <span>結算單號：<code style={{ color: '#64d2ff' }}>{log.settleId || log.settlementId || log.id || 'N/A'}</code></span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                </div>
            )}

            {/* HIG 5: Card Sheet Settlement Details Modal (Bottom Sheet style) */}
            {showSettlementModal && settlementTarget && createPortal(
                <div className="card-sheet-overlay active" onClick={() => setShowSettlementModal(false)}>
                    <div className="card-sheet active" onClick={e => e.stopPropagation()}>
                        <div className="card-sheet-indicator" />
                        <div className="card-sheet-header">
                            <button className="card-sheet-btn-text" onClick={() => setShowSettlementModal(false)}>關閉</button>
                            <span className="card-sheet-title">{settlementTarget === 'userA' ? '大狗狗' : '阿陞'} 的代墊明細 ({debtScope === 'all' ? '全期未結' : `${filterDate} 當月`})</span>
                            <span style={{ width: '40px' }} />
                        </div>

                        <div className="card-sheet-content" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                            <div className="inset-group-card">
                                {getDebtList(settlementTarget).length === 0 ? (
                                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>
                                        無任何待結清明細
                                    </div>
                                ) : (
                                    getDebtList(settlementTarget).map((r, idx) => {
                                        const sourceAcc = assets.accounts?.find(a => a.id === r.accountId);
                                        return (
                                            <div key={idx} className="inset-group-row" style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ minWidth: 0, flex: 1, paddingRight: '10px' }}>
                                                    <div className="inset-group-label" style={{ fontSize: '0.86rem', color: '#fff' }}>
                                                        <span style={{ color: 'var(--text-tertiary)', marginRight: '8px', fontSize: '0.78rem' }}>{r.date}</span>
                                                        {r.note || r.category}
                                                    </div>
                                                    {sourceAcc && (
                                                        <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                                            扣款帳戶：{sourceAcc.icon || '🏦'} {sourceAcc.nickname}
                                                        </div>
                                                    )}
                                                </div>
                                                <span className="inset-group-value" style={{ fontWeight: '800', color: '#fff', fontSize: '0.92rem' }}>
                                                    {formatMoney(r.total)}
                                                </span>
                                            </div>
                                        );
                                    })
                                )}
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
                                {/* Joint / Advance Settlement Status */}
                                {detailModalRecord.type === 'spend' && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', borderTop: '0.5px solid rgba(255,255,255,0.06)', paddingTop: '6px' }}>
                                        <span style={{ color: 'var(--text-tertiary)' }}>🤝 代墊結算狀態</span>
                                        {(() => {
                                            const settleInfo = getRecordSettlementInfo(detailModalRecord);
                                            if (!settleInfo) return <span style={{ color: 'var(--text-secondary)' }}>一般支出</span>;
                                            if (settleInfo.isJointDirect) {
                                                return <span style={{ color: '#64d2ff', fontWeight: '750' }}>🦉 共同公費直付 (非代墊)</span>;
                                            }
                                            if (settleInfo.isSettled) {
                                                return (
                                                    <span style={{ color: '#30d158', fontWeight: '750' }}>
                                                        ✅ 已結清 ({settleInfo.advName}代墊{settleInfo.settleId ? ` / 單號: ${settleInfo.settleId.slice(0, 14)}...` : ''})
                                                    </span>
                                                );
                                            }
                                            const half = Math.round((detailModalRecord.total || 0) / 2);
                                            const partner = settleInfo.advUser === 'userA' ? '阿陞' : '大狗狗';
                                            return (
                                                <span style={{ color: '#ff9f0a', fontWeight: '750' }}>
                                                    ⏳ 待代墊結算 ({settleInfo.advName}代墊，待{partner}支付 ${half.toLocaleString()})
                                                </span>
                                            );
                                        })()}
                                    </div>
                                )}
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

                                                    {/* Row 4: Itemized Breakdown if present */}
                                                    {(() => {
                                                        const rawBreakdown = item.itemizedBreakdown || item.rawRecord?.itemizedBreakdown;
                                                        if (!Array.isArray(rawBreakdown) || rawBreakdown.length === 0) return null;
                                                        return (
                                                            <div style={{
                                                                background: 'rgba(10, 132, 255, 0.06)',
                                                                border: '1px solid rgba(10, 132, 255, 0.2)',
                                                                borderRadius: '10px',
                                                                padding: '10px 12px',
                                                                marginTop: '4px'
                                                            }}>
                                                                <div style={{ fontSize: '0.76rem', fontWeight: '800', color: '#64d2ff', marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                        <span>🧾</span>
                                                                        <span>小票分項明細 (共 {rawBreakdown.length} 項)</span>
                                                                    </span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setItemizedModalRecord({
                                                                                ...item,
                                                                                itemizedBreakdown: rawBreakdown,
                                                                                category: item.cat,
                                                                                total: item.amount,
                                                                                note: item.note,
                                                                                date: item.date
                                                                            });
                                                                        }}
                                                                        style={{ background: 'none', border: 'none', color: '#64d2ff', fontSize: '0.7rem', textDecoration: 'underline', cursor: 'pointer', fontWeight: '750' }}
                                                                    >
                                                                        彈窗查看
                                                                    </button>
                                                                </div>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                    {rawBreakdown.map((it, sIdx) => {
                                                                        const itAmt = Number(it.amount) || 0;
                                                                        return (
                                                                            <div key={sIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', padding: '3px 0', borderBottom: '1px dashed rgba(255,255,255,0.06)' }}>
                                                                                <span style={{ color: '#fff' }}>#{sIdx + 1} {it.name}</span>
                                                                                {itAmt === 0 ? (
                                                                                    <span style={{ fontWeight: '750', color: '#64d2ff', fontFamily: 'monospace', fontSize: '0.72rem', background: 'rgba(100,210,255,0.12)', padding: '1px 5px', borderRadius: '4px' }}>🎁 $0</span>
                                                                                ) : itAmt < 0 ? (
                                                                                    <span style={{ fontWeight: '750', color: '#ff453a', fontFamily: 'monospace', fontSize: '0.72rem', background: 'rgba(255,69,58,0.12)', padding: '1px 5px', borderRadius: '4px' }}>🏷️ -${Math.abs(itAmt).toLocaleString()}</span>
                                                                                ) : (
                                                                                    <span style={{ fontWeight: '750', color: '#8effa2', fontFamily: 'monospace' }}>+${itAmt.toLocaleString()}</span>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}
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
                                                {detailModalRecord.itemizedBreakdown.map((it, idx) => {
                                                    const itAmt = Number(it.amount) || 0;
                                                    return (
                                                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', padding: '4px 0', borderBottom: '1px dashed rgba(255,255,255,0.06)' }}>
                                                            <span style={{ color: '#fff' }}>#{idx + 1} {it.name}</span>
                                                            {itAmt === 0 ? (
                                                                <span style={{ fontWeight: '750', color: '#64d2ff', fontFamily: 'monospace', fontSize: '0.76rem', background: 'rgba(100,210,255,0.12)', padding: '1px 6px', borderRadius: '5px' }}>
                                                                    🎁 $0 (贈品)
                                                                </span>
                                                            ) : itAmt < 0 ? (
                                                                <span style={{ fontWeight: '750', color: '#ff453a', fontFamily: 'monospace', fontSize: '0.76rem', background: 'rgba(255,69,58,0.12)', padding: '1px 6px', borderRadius: '5px' }}>
                                                                    🏷️ -${Math.abs(itAmt).toLocaleString()} (折扣)
                                                                </span>
                                                            ) : (
                                                                <span style={{ fontWeight: '750', color: '#8effa2', fontFamily: 'monospace' }}>
                                                                    +${itAmt.toLocaleString()} TWD
                                                                </span>
                                                            )}
                                                        </div>
                                                    );
                                                })}
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
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{itemizedModalRecord.date} · {itemizedModalRecord.subCategory || itemizedModalRecord.category}</div>
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
                                    {(itemizedModalRecord.itemizedBreakdown || []).map((item, idx) => {
                                        const itemAmt = Number(item.amount) || 0;
                                        return (
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
                                                {itemAmt === 0 ? (
                                                    <span style={{ fontWeight: '850', color: '#64d2ff', fontFamily: 'monospace', fontSize: '0.78rem', background: 'rgba(100,210,255,0.12)', padding: '2px 8px', borderRadius: '6px' }}>
                                                        🎁 $0 (贈品)
                                                    </span>
                                                ) : itemAmt < 0 ? (
                                                    <span style={{ fontWeight: '850', color: '#ff453a', fontFamily: 'monospace', fontSize: '0.78rem', background: 'rgba(255,69,58,0.12)', padding: '2px 8px', borderRadius: '6px' }}>
                                                        🏷️ -${Math.abs(itemAmt).toLocaleString()} (折扣)
                                                    </span>
                                                ) : (
                                                    <span style={{ fontWeight: '850', color: '#8effa2', fontFamily: 'monospace' }}>
                                                        +${itemAmt.toLocaleString()}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed rgba(255,255,255,0.15)', fontWeight: '850', fontSize: '0.94rem' }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>小票合計 (共 {itemizedModalRecord.itemizedBreakdown?.length || 0} 項)</span>
                                    <span style={{ color: '#8effa2', fontSize: '1.1rem' }}>${Number(itemizedModalRecord.total !== undefined ? itemizedModalRecord.total : itemizedModalRecord.amount).toLocaleString()} TWD</span>
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