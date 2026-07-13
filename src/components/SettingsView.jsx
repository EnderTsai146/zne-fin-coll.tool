// src/components/SettingsView.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { db } from '../firebase';
import { collection, query, orderBy, limit, getDocs, startAfter, where } from 'firebase/firestore';
import { getBudgetForMonth } from '../utils/budgetUtils';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const SettingsView = ({
  assets,
  saveToCloud,
  currentUser,
  operatorName,
  customAlert,
  customConfirm,
  activeSubTab,
  setActiveSubTab,
  logOperation,
  onRequestNotificationPermission,
  fcmDiagnostic = { status: 'checking', token: null, error: null },
  onSendTestPush
}) => {
  
  // --- Push Notification Permission States & Handlers ---
  const [notificationPermission, setNotificationPermission] = useState('default');
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isTestingPush, setIsTestingPush] = useState(false);

  const handleSendTestPushClick = async () => {
    if (isTestingPush) return;
    setIsTestingPush(true);
    try {
      if (onSendTestPush) {
        await onSendTestPush();
      }
    } catch (e) {
      console.error(e);
    } finally {
      // 3秒後重新啟用按鈕，防止連續點按
      setTimeout(() => {
        setIsTestingPush(false);
      }, 3000);
    }
  };


  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    } else {
      setNotificationPermission('unsupported');
    }
  }, []);

  const handleEnableNotification = async () => {
    setIsSubscribing(true);
    try {
      if (onRequestNotificationPermission) {
        const perm = await onRequestNotificationPermission();
        setNotificationPermission(perm);
        if (perm === 'granted') {
          await customAlert("✅ 啟用成功！您已開啟推播通知。");
        } else if (perm === 'denied') {
          await customAlert("⚠️ 您拒絕了通知權限，若要接收通知，請至瀏覽器或系統通知設定中重新允許。");
        }
      }
    } catch (err) {
      console.error(err);
      await customAlert("❌ 啟用通知失敗：" + err.message);
    }
    setIsSubscribing(false);
  };
  
  // --- 1. 預算設定 State ---
  const currentMonthStr = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const [selectedBudgetMonth, setSelectedBudgetMonth] = useState(currentMonthStr);
  const [showAllHistory, setShowAllHistory] = useState(false);
  
  // Category inputs
  const dynamicCategories = assets?.config?.categories || ["餐費", "購物", "娛樂", "其他"];
  const [budgetInputs, setBudgetInputs] = useState({});

  const isConfiguredInDb = assets?.budgets && assets.budgets[selectedBudgetMonth] !== undefined;
  const [isCreatingFutureBudget, setIsCreatingFutureBudget] = useState(false);

  useEffect(() => {
    setIsCreatingFutureBudget(false);
  }, [selectedBudgetMonth]);

  const handleDeleteFutureBudget = async () => {
    if (!await customConfirm(`⚠️ 確定要刪除【${selectedBudgetMonth}】的預算設定嗎？\n刪除後，該月份將回復為未設定狀態（將預設延續前一月的預算）。`)) return;
    
    const updatedBudgets = { ...(assets.budgets || {}) };
    delete updatedBudgets[selectedBudgetMonth];
    
    const finalAssets = {
      ...assets,
      budgets: updatedBudgets
    };
    
    const logDetail = `刪除【${selectedBudgetMonth}】類別預算設定`;
    const finalAssetsWithLog = logOperation ? logOperation(finalAssets, 'budget_delete', logDetail) : finalAssets;
    
    saveToCloud(finalAssetsWithLog);
    await customAlert(`🗑️ 【${selectedBudgetMonth}】預算已刪除。`);
  };

  // Populate inputs when month or assets changes
  useEffect(() => {
    const isFuture = selectedBudgetMonth > currentMonthStr;
    const isConfigured = assets?.budgets && assets.budgets[selectedBudgetMonth] !== undefined;
    
    let initialInputs = {};
    if (isFuture && !isConfigured && !isCreatingFutureBudget) {
      dynamicCategories.forEach(cat => {
        initialInputs[cat] = 0;
      });
    } else {
      let baseBudgets = {};
      if (isCreatingFutureBudget) {
        if (assets?.budgets) {
          const sorted = Object.keys(assets.budgets).sort();
          const prev = sorted.filter(m => m < selectedBudgetMonth);
          if (prev.length > 0) {
            baseBudgets = assets.budgets[prev[prev.length - 1]];
          }
        }
        if (Object.keys(baseBudgets).length === 0) {
          const portion = Math.round((assets?.monthlyBudget || 25000) / dynamicCategories.length);
          dynamicCategories.forEach(cat => {
            baseBudgets[cat] = portion;
          });
        }
      } else {
        baseBudgets = getBudgetForMonth(assets, selectedBudgetMonth);
      }
      
      dynamicCategories.forEach(cat => {
        initialInputs[cat] = baseBudgets[cat] !== undefined ? baseBudgets[cat] : 0;
      });
    }
    setBudgetInputs(initialInputs);
  }, [selectedBudgetMonth, assets, dynamicCategories, isCreatingFutureBudget, currentMonthStr]);

  const isPastMonth = selectedBudgetMonth < currentMonthStr;

  const handleInputChange = (cat, val) => {
    const num = Number(val.replace(/[^\d]/g, '')) || 0;
    setBudgetInputs(prev => ({
      ...prev,
      [cat]: num
    }));
  };

  const handleSaveBudget = async () => {
    if (isPastMonth) {
      await customAlert("⚠️ 歷史預算已鎖定，不可修改！");
      return;
    }
    
    const updatedBudgets = {
      ...(assets.budgets || {}),
      [selectedBudgetMonth]: budgetInputs
    };

    const finalAssets = {
      ...assets,
      budgets: updatedBudgets
    };

    const logDetail = `更新【${selectedBudgetMonth}】類別預算設定：${Object.entries(budgetInputs).map(([cat, val]) => `${cat} $${val.toLocaleString()}`).join(', ')}`;
    const finalAssetsWithLog = logOperation ? logOperation(finalAssets, 'budget_update', logDetail) : finalAssets;

    saveToCloud(finalAssetsWithLog);
    setIsCreatingFutureBudget(false);
    await customAlert(`💾 【${selectedBudgetMonth}】預算設定儲存成功！`);
  };

  // Build past 6 months list for the line chart
  const chartMonths = useMemo(() => {
    const list = [];
    const d = new Date();
    // Show 4 months in past, current month, and 1 month in future
    for (let i = 4; i >= -1; i--) {
      const temp = new Date(d.getFullYear(), d.getMonth() - i, 1);
      list.push(temp.toISOString().slice(0, 7));
    }
    return list;
  }, []);

  // Get all historical months that actually have configured budgets, plus the current month
  const allBudgetMonths = useMemo(() => {
    const monthsSet = new Set();
    if (assets?.budgets) {
      Object.keys(assets.budgets).forEach(m => monthsSet.add(m));
    }
    monthsSet.add(currentMonthStr);
    
    // Sort chronologically descending (newest first)
    const sorted = Array.from(monthsSet).sort().reverse();
    return sorted;
  }, [assets, currentMonthStr]);

  const visibleMonths = useMemo(() => {
    return showAllHistory ? allBudgetMonths : allBudgetMonths.slice(0, 5);
  }, [allBudgetMonths, showAllHistory]);

  const chartData = useMemo(() => {
    const colors = {
      "餐費": { border: '#ff9f0a', bg: 'rgba(255, 159, 10, 0.05)' },
      "購物": { border: '#0a84ff', bg: 'rgba(10, 132, 255, 0.05)' },
      "娛樂": { border: '#30d158', bg: 'rgba(48, 209, 88, 0.05)' },
      "其他": { border: '#bf5af2', bg: 'rgba(191, 90, 242, 0.05)' }
    };

    const datasets = dynamicCategories.map(cat => {
      const catColor = colors[cat] || { border: '#8e8e93', bg: 'rgba(142, 142, 147, 0.05)' };
      return {
        label: cat,
        data: chartMonths.map(m => {
          const budgets = getBudgetForMonth(assets, m);
          return budgets[cat] || 0;
        }),
        borderColor: catColor.border,
        backgroundColor: catColor.bg,
        borderWidth: 2,
        tension: 0.2,
        fill: false,
        pointBackgroundColor: catColor.border,
        pointHoverRadius: 6
      };
    });

    return {
      labels: chartMonths,
      datasets
    };
  }, [chartMonths, assets, dynamicCategories]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: { color: 'rgba(255,255,255,0.7)', font: { size: 10, family: 'var(--font-family)' } }
      },
      tooltip: {
        backgroundColor: 'rgba(18, 18, 18, 0.95)',
        titleColor: '#ffffff',
        bodyColor: 'rgba(255,255,255,0.85)',
        borderColor: 'rgba(255,255,255,0.15)',
        borderWidth: 1,
        titleFont: { family: 'var(--font-family)' },
        bodyFont: { family: 'var(--font-family)' },
        callbacks: {
          label: function(context) {
            return ` ${context.dataset.label}: $${context.parsed.y.toLocaleString()}`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.06)' },
        ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10, family: 'var(--font-family)' } }
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.06)' },
        ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10, family: 'var(--font-family)' } }
      }
    }
  };



  // --- 3. Operation Logs State & Logic ---
  const [dbLogs, setDbLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [lastVisibleDoc, setLastVisibleDoc] = useState(null);
  const [hasMoreLogs, setHasMoreLogs] = useState(true);

  // Search & Filter state variables
  const [logSearchText, setLogSearchText] = useState('');
  const [logFilterAction, setLogFilterAction] = useState('all');
  const [logFilterOperator, setLogFilterOperator] = useState('all');
  const [logStartDate, setLogStartDate] = useState('');
  const [logEndDate, setLogEndDate] = useState('');

  const filteredLogs = useMemo(() => {
    return dbLogs.filter(log => {
      const matchesSearch = logSearchText 
        ? (log.detail?.toLowerCase().includes(logSearchText.toLowerCase()) || log.operator?.toLowerCase().includes(logSearchText.toLowerCase())) 
        : true;
      const matchesAction = logFilterAction === 'all' ? true : log.action === logFilterAction;
      const matchesOperator = logFilterOperator === 'all' ? true : (
        logFilterOperator === 'userA' ? (log.operator?.includes('大狗狗') || log.operator === 'userA') :
        logFilterOperator === 'userB' ? (log.operator?.includes('阿陞') || log.operator === 'userB') :
        logFilterOperator === 'system' ? (log.operator?.includes('系統') || log.operator === 'system' || !log.operator) : true
      );
      return matchesSearch && matchesAction && matchesOperator;
    });
  }, [dbLogs, logSearchText, logFilterAction, logFilterOperator]);

  const fetchLogs = async (isInitial = false) => {
    if (loadingLogs) return;
    setLoadingLogs(true);
    try {
      const logsRef = collection(db, "finance", "data", "operationsLog");
      let q;

      const queryConstraints = [orderBy("timestamp", "desc")];
      if (logStartDate) {
        queryConstraints.push(where("timestamp", ">=", logStartDate + "T00:00:00"));
      }
      if (logEndDate) {
        queryConstraints.push(where("timestamp", "<=", logEndDate + "T23:59:59.999Z"));
      }

      if (isInitial) {
        queryConstraints.push(limit(20));
        q = query(logsRef, ...queryConstraints);
      } else if (lastVisibleDoc) {
        queryConstraints.push(startAfter(lastVisibleDoc), limit(20));
        q = query(logsRef, ...queryConstraints);
      } else {
        setLoadingLogs(false);
        return;
      }

      const querySnapshot = await getDocs(q);
      const newLogs = [];
      querySnapshot.forEach((doc) => {
        newLogs.push({ id: doc.id, ...doc.data() });
      });

      if (querySnapshot.docs.length < 20) {
        setHasMoreLogs(false);
      } else {
        setHasMoreLogs(true);
      }

      if (querySnapshot.docs.length > 0) {
        setLastVisibleDoc(querySnapshot.docs[querySnapshot.docs.length - 1]);
      }

      if (isInitial) {
        setDbLogs(newLogs);
      } else {
        setDbLogs(prev => [...prev, ...newLogs]);
      }
    } catch (err) {
      console.error("Error fetching logs: ", err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'logs') {
      fetchLogs(true);
    } else {
      setDbLogs([]);
      setLastVisibleDoc(null);
      setHasMoreLogs(true);
      setLogSearchText('');
      setLogFilterAction('all');
      setLogFilterOperator('all');
      setLogStartDate('');
      setLogEndDate('');
    }
  }, [activeSubTab, logStartDate, logEndDate]);

  const formatTimestamp = (isoStr) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dateVal = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${dateVal} ${h}:${min}:${s}`;
  };

  const getTimelineDotClass = (action) => {
    if (action === 'delete') return 'timeline-dot delete';
    if (action === 'settle' || action === 'income') return 'timeline-dot settle';
    if (action === 'transfer' || action === 'exchange') return 'timeline-dot transfer';
    if (action === 'calibrate') return 'timeline-dot calibrate';
    return 'timeline-dot';
  };

  return (
    <div className="page-transition-enter" style={{ padding: '0 16px' }}>
      <h1 className="page-title">管家設定</h1>

      {/* Settings Navigation Sub-Tabs */}
      <div className="settings-tabs" style={{ marginBottom: '20px', overflowX: 'auto', whiteSpace: 'nowrap' }}>
        <button className={`settings-tab-btn ${activeSubTab === 'budget' ? 'active' : ''}`} onClick={() => setActiveSubTab('budget')}>預算設定</button>
        <button className={`settings-tab-btn ${activeSubTab === 'guide' ? 'active' : ''}`} onClick={() => setActiveSubTab('guide')}>操作指南</button>
        <button className={`settings-tab-btn ${activeSubTab === 'faq' ? 'active' : ''}`} onClick={() => setActiveSubTab('faq')}>常見問題</button>
        <button className={`settings-tab-btn ${activeSubTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveSubTab('logs')}>歷史軌跡</button>
        <button className={`settings-tab-btn ${activeSubTab === 'info' ? 'active' : ''}`} onClick={() => setActiveSubTab('info')}>系統資訊</button>
      </div>

      {/* Tab Contents */}
      <div className="settings-tab-content" style={{ paddingBottom: '30px' }}>
        
        {/* === 1. 預算設定 === */}
        {activeSubTab === 'budget' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Monthly Budget Editor Card */}
            <div className="glass-card" style={{ padding: '20px', position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ fontWeight: '700', fontSize: '1rem', color: '#fff' }}>🎯 類別預算設定</div>
                <input 
                  type="month" 
                  value={selectedBudgetMonth}
                  onChange={(e) => setSelectedBudgetMonth(e.target.value)}
                  className="glass-input" 
                  style={{ width: '130px', margin: 0, padding: '4px 8px', fontSize: '0.85rem' }} 
                />
              </div>

              {isPastMonth && (
                <div style={{
                  background: 'rgba(255, 69, 58, 0.12)',
                  color: '#ff453a',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  marginBottom: '16px',
                  border: '1px solid rgba(255, 69, 58, 0.25)'
                }}>
                  🔒 歷史預算已鎖定，超過當月份不可修改。
                </div>
              )}

              {/* Future Month Status Message */}
              {!isPastMonth && selectedBudgetMonth > currentMonthStr && !isConfiguredInDb && !isCreatingFutureBudget && (
                <div style={{
                  background: 'rgba(10, 132, 255, 0.12)',
                  color: '#0a84ff',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  marginBottom: '16px',
                  border: '1px solid rgba(10, 132, 255, 0.25)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <span>📅 此月份尚未建立專屬預算，系統將自動延續上一個月的設定。</span>
                  <button
                    onClick={() => setIsCreatingFutureBudget(true)}
                    className="glass-btn"
                    style={{
                      alignSelf: 'flex-start',
                      padding: '4px 12px',
                      fontSize: '0.78rem',
                      margin: 0,
                      background: 'rgba(10, 132, 255, 0.2)',
                      borderColor: 'rgba(10, 132, 255, 0.4)',
                      color: '#0a84ff',
                      fontWeight: '700'
                    }}
                  >
                    建立此月份專屬預算
                  </button>
                </div>
              )}

              {/* Show edit inputs only if not blocked by unconfigured future month */}
              {(isPastMonth || selectedBudgetMonth <= currentMonthStr || isConfiguredInDb || isCreatingFutureBudget) ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {dynamicCategories.map(cat => (
                      <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: '600' }}>
                          {cat === '餐費' ? '🍲 ' : cat === '購物' ? '🛍️ ' : cat === '娛樂' ? '✨ ' : '⚙️ '}
                          {cat} 預算
                        </span>
                        <input 
                          type="text"
                          inputMode="numeric"
                          value={budgetInputs[cat] !== undefined ? `$${budgetInputs[cat].toLocaleString()}` : '$0'}
                          onChange={(e) => handleInputChange(cat, e.target.value)}
                          disabled={isPastMonth}
                          className="glass-input"
                          style={{
                            width: '120px',
                            textAlign: 'right',
                            margin: 0,
                            fontWeight: '700',
                            fontSize: '0.95rem',
                            color: isPastMonth ? 'var(--text-tertiary)' : '#fff',
                            background: isPastMonth ? 'rgba(255,255,255,0.02)' : undefined,
                            border: isPastMonth ? '1px dashed rgba(255,255,255,0.08)' : undefined
                          }}
                        />
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                    {!isPastMonth && (
                      <button 
                        onClick={handleSaveBudget} 
                        className="glass-btn glass-btn-cta" 
                        style={{ flex: 1, fontWeight: '700', margin: 0 }}
                      >
                        確認儲存預算設定
                      </button>
                    )}
                    
                    {/* Delete button for configured future months */}
                    {!isPastMonth && selectedBudgetMonth > currentMonthStr && isConfiguredInDb && (
                      <button 
                        onClick={handleDeleteFutureBudget} 
                        className="glass-btn" 
                        style={{
                          fontWeight: '700',
                          margin: 0,
                          color: '#ff453a',
                          borderColor: 'rgba(255, 69, 58, 0.4)',
                          background: 'rgba(255, 69, 58, 0.1)'
                        }}
                      >
                        🗑️ 刪除預算
                      </button>
                    )}
                  </div>
                </>
              ) : null}
            </div>

            {/* Budget Details Table */}
            <div className="glass-card" style={{ padding: '16px' }}>
              <div style={{ fontWeight: '700', fontSize: '0.9rem', marginBottom: '10px', color: '#fff' }}>📋 預算明細清單</div>
              <div style={{ 
                overflowX: 'auto', 
                maxHeight: showAllHistory ? '260px' : 'none', 
                overflowY: showAllHistory ? 'auto' : 'visible',
                scrollbarWidth: 'thin', 
                WebkitOverflowScrolling: 'touch' 
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left' }}>
                      <th style={{ padding: '6px 4px', whiteSpace: 'nowrap', position: 'sticky', top: 0, backgroundColor: 'rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', zIndex: 1 }}>月份</th>
                      {dynamicCategories.map(cat => <th key={cat} style={{ padding: '6px 4px', textAlign: 'right', whiteSpace: 'nowrap', position: 'sticky', top: 0, backgroundColor: 'rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', zIndex: 1 }}>{cat}</th>)}
                      <th style={{ padding: '6px 4px', textAlign: 'right', color: '#fff', whiteSpace: 'nowrap', position: 'sticky', top: 0, backgroundColor: 'rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', zIndex: 1 }}>總預算</th>

                    </tr>
                  </thead>
                  <tbody>
                    {visibleMonths.map(m => {
                      const budgets = getBudgetForMonth(assets, m);
                      const total = Object.values(budgets).reduce((s, v) => s + Number(v || 0), 0);
                      const isMonthPast = m < currentMonthStr;
                      return (
                        <tr key={m} style={{ borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '8px 4px', fontWeight: '600', color: isMonthPast ? 'var(--text-tertiary)' : 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                            {m} {isMonthPast ? '🔒' : ''}
                          </td>
                          {dynamicCategories.map(cat => (
                            <td key={cat} style={{ padding: '8px 4px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                              ${(budgets[cat] || 0).toLocaleString()}
                            </td>
                          ))}
                          <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: '700', color: 'var(--accent-blue)', whiteSpace: 'nowrap' }}>
                            ${total.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {allBudgetMonths.length > 5 && (
                <button 
                  onClick={() => setShowAllHistory(!showAllHistory)}
                  className="glass-btn"
                  style={{
                    width: '100%',
                    marginTop: '12px',
                    padding: '8px 0',
                    fontSize: '0.78rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    color: 'var(--text-secondary)'
                  }}
                >
                  {showAllHistory ? '收起部分歷史 ▴' : `顯示其餘 ${allBudgetMonths.length - 5} 個月 ▾`}
                </button>
              )}
            </div>

            {/* Historical Budget Chart */}
            <div className="glass-card" style={{ padding: '16px' }}>
              <div style={{ fontWeight: '700', fontSize: '0.9rem', marginBottom: '12px', color: '#fff' }}>📈 歷史預算變化趨勢</div>
              <div style={{ height: '180px', position: 'relative' }}>
                <Line data={chartData} options={chartOptions} />
              </div>
            </div>
          </div>
        )}



        {/* === 3. 操作指南 === */}
        {activeSubTab === 'guide' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="glass-card" style={{ padding: '16px' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#ffffff', fontSize: '0.9rem', fontWeight: '600' }}>
                個人記帳與共同代墊之分流
              </h4>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'rgba(255, 255, 255, 0.6)', lineHeight: '1.6' }}>
                登錄交易時，須於「付款方式」欄位選定帳戶。若屬個人私帳，請選擇個人帳戶，該筆金額將直接自個人帳戶扣除。若為共同支出且由個人（大狗狗或阿陞）代墊，系統在暫存或送出時會先啟動「前端餘額阻斷校驗」，檢查代墊人帳戶之可用餘額是否足夠；確認足夠後，系統會自該代墊人的個人帳戶執行扣減，並將代墊款項記入共同待結帳目中。
              </p>
            </div>
            <div className="glass-card" style={{ padding: '16px' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#ffffff', fontSize: '0.9rem', fontWeight: '600' }}>
                代墊款項結清與審計追蹤
              </h4>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'rgba(255, 255, 255, 0.6)', lineHeight: '1.6' }}>
                前往「回顧與資料庫」的「財務資料庫」子分頁可查閱全時間未結清之代墊明細。點選「結清」後，系統會自動自「共同現金」帳戶撥款並加回原代墊人的個人帳戶中。此操作會在背景寫入該時間點的資產分佈快照（Audit Trail），為後續對帳與帳務變更提供完整的審計歷史紀錄。
              </p>
            </div>
            <div className="glass-card" style={{ padding: '16px' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#ffffff', fontSize: '0.9rem', fontWeight: '600' }}>
                投資庫存與先進先出 (FIFO) 估算
              </h4>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'rgba(255, 255, 255, 0.6)', lineHeight: '1.6' }}>
                於投資交易介面中，利用股票代號自動完成欄位輸入標的，即可暫存並批次提交交易紀錄。當執行「賣出」時，系統會自動預填歷史取得之台幣或美金成本，藉此推算庫存損益與歷史持有均價。
              </p>
            </div>
          </div>
        )}

        {/* === 4. 常見問題 === */}
        {activeSubTab === 'faq' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="glass-card" style={{ padding: '16px' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#ffffff', fontSize: '0.88rem', fontWeight: '600', lineHeight: '1.4' }}>
                Q：為什麼系統禁止我直接修改歷史紀錄的「金額」或「帳戶」？
              </h4>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.6)', lineHeight: '1.6' }}>
                A：為確保會計帳務之安全性與資料一致性，系統設有防護機制，禁止直接修改已寫入的歷史交易金額或關聯帳戶。直接修改歷史資料會破壞前後期帳務審計，並產生無法對帳的「幽靈帳」。維持原始數據（Raw Data）的不可變性是確保資產追蹤平順之核心基礎。
              </p>
            </div>
            <div className="glass-card" style={{ padding: '16px' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#ffffff', fontSize: '0.88rem', fontWeight: '600', lineHeight: '1.4' }}>
                Q：如果記錯金額或扣錯帳戶，我該如何修正？
              </h4>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.6)', lineHeight: '1.6' }}>
                A：請使用「作廢退款」之二階段修正機制：點選該筆紀錄右側的垃圾桶圖示，並填寫作廢原因。系統將自動產生一筆方向相反的沖銷分錄，將資金全數退回原始錢包；沖銷完成後，請重新登錄正確的交易帳目。
              </p>
            </div>
            <div className="glass-card" style={{ padding: '16px' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#ffffff', fontSize: '0.88rem', fontWeight: '600', lineHeight: '1.4' }}>
                Q：為什麼美股部位的未實現損益，跟券商 App 顯示的有一點點落差？
              </h4>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.6)', lineHeight: '1.6' }}>
                A：本系統是以實際歷史批次交易紀錄進行先進先出 (FIFO) 之精準成本估算，且市值已自動扣除預估的複委託手續費。若與券商 App 存在微幅落差，屬合理計算景深，您亦可利用資產操作面板中的「校正回歸」功能進行微調。
              </p>
            </div>
            <div className="glass-card" style={{ padding: '16px' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#ffffff', fontSize: '0.88rem', fontWeight: '600', lineHeight: '1.4' }}>
                Q：什麼是「餘額校正」，它會影響我本月的收支預算進度嗎？
              </h4>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.6)', lineHeight: '1.6' }}>
                A：「餘額校正」（校正回歸）僅用於修正零星匯差、非預期手續費等帳面誤差。此操作在會計科目上歸類為獨立修正屬性，不會計入當月的日常支出預算或現金流統計。
              </p>
            </div>
          </div>
        )}

        {/* === 5. 歷史軌跡 === */}
        {activeSubTab === 'logs' && (
          <div className="glass-card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              
              {/* Filters grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '4px' }}>
                <select 
                  value={logFilterOperator} 
                  onChange={(e) => setLogFilterOperator(e.target.value)} 
                  className="glass-input" 
                  style={{ margin: 0, padding: '6px 10px', fontSize: '0.78rem', height: '36px', borderRadius: '8px' }}
                >
                  <option value="all">👥 所有操作者</option>
                  <option value="userA">🐕 大狗狗</option>
                  <option value="userB">🐶 阿陞</option>
                  <option value="system">🤖 系統 / 其他</option>
                </select>
                
                <select 
                  value={logFilterAction} 
                  onChange={(e) => setLogFilterAction(e.target.value)} 
                  className="glass-input" 
                  style={{ margin: 0, padding: '6px 10px', fontSize: '0.78rem', height: '36px', borderRadius: '8px' }}
                >
                  <option value="all">🛠️ 所有動作</option>
                  <option value="transaction">🔄 記帳變動</option>
                  <option value="delete">🗑️ 作廢刪除</option>
                  <option value="expense_add">💰 新增支出</option>
                  <option value="login">🔑 登入異動</option>
                  <option value="calibrate">⚖️ 餘額校正</option>
                </select>
              </div>

              {/* Date range pickers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '4px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', paddingLeft: '4px' }}>📅 起始日期</span>
                  <input 
                    type="date" 
                    value={logStartDate} 
                    onChange={(e) => setLogStartDate(e.target.value)} 
                    className="glass-input" 
                    style={{ margin: 0, padding: '6px 8px', fontSize: '0.8rem', height: '36px', borderRadius: '8px' }}
                  />
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', paddingLeft: '4px' }}>📅 結束日期</span>
                  <input 
                    type="date" 
                    value={logEndDate} 
                    onChange={(e) => setLogEndDate(e.target.value)} 
                    className="glass-input" 
                    style={{ margin: 0, padding: '6px 8px', fontSize: '0.8rem', height: '36px', borderRadius: '8px' }}
                  />
                </div>
              </div>

              <input 
                type="text" 
                placeholder="🔍 輸入關鍵字搜尋已載入軌跡..." 
                value={logSearchText} 
                onChange={(e) => setLogSearchText(e.target.value)} 
                className="glass-input" 
                style={{ width: '100%', boxSizing: 'border-box', margin: '0 0 6px 0', padding: '8px 12px', fontSize: '0.82rem', borderRadius: '8px' }}
              />

              <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', display: 'flex', justifyContent: 'space-between', padding: '0 4px', marginBottom: '4px' }}>
                <span>已載入: {dbLogs.length} 筆</span>
                <span>符合搜尋: {filteredLogs.length} 筆</span>
              </div>

              {loadingLogs && dbLogs.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.84rem', padding: '40px 0' }}>載入中...</div>
              ) : dbLogs.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.84rem', padding: '40px 0' }}>目前尚無操作紀錄。</div>
              ) : filteredLogs.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.84rem', padding: '40px 0' }}>無符合條件的軌跡。</div>
              ) : (
                <>
                  <div className="timeline-list" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                    {filteredLogs.slice(0, 200).map((log, idx) => (
                      <div key={log.id || idx} className="timeline-item">
                        <div className={getTimelineDotClass(log.action)} />
                        <div className="timeline-meta">
                          <span className="timeline-operator">{log.operator}</span>
                          <span>{formatTimestamp(log.timestamp)}</span>
                        </div>
                        <div className="timeline-desc" style={{ wordBreak: 'break-all' }}>{log.detail}</div>
                      </div>
                    ))}
                    {filteredLogs.length > 200 && (
                      <div style={{ textAlign: 'center', fontSize: '0.74rem', color: 'var(--text-tertiary)', padding: '12px 0', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
                        ⚠️ 僅顯示最新的 200 筆軌跡（尚有 {filteredLogs.length - 200} 筆未列出）
                      </div>
                    )}
                  </div>
                  {hasMoreLogs && (
                    <button
                      onClick={() => fetchLogs(false)}
                      disabled={loadingLogs}
                      className="glass-btn"
                      style={{
                        width: '100%',
                        padding: '10px',
                        borderRadius: '12px',
                        fontSize: '0.8rem',
                        color: 'var(--text-primary)',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        cursor: 'pointer',
                        marginTop: '8px'
                      }}
                    >
                      {loadingLogs ? '載入中...' : '載入先前軌跡'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* === 6. 系統資訊 === */}
        {activeSubTab === 'info' && (() => {
          let statusText = '偵測中...';
          let statusColor = 'var(--text-secondary)';
          let showBtn = false;
          if (notificationPermission === 'granted') {
            statusText = '已開啟通知 系統運作中 ✅';
            statusColor = 'var(--accent-green)';
          } else if (notificationPermission === 'denied') {
            statusText = '通知已遭封鎖 ❌ (請至瀏覽器設定允許)';
            statusColor = 'var(--accent-red)';
          } else if (notificationPermission === 'unsupported') {
            statusText = '不支援通知 🚫';
            statusColor = 'var(--text-tertiary)';
          } else {
            statusText = '尚未啟用通知 🔔';
            statusColor = 'var(--accent-orange)';
            showBtn = true;
          }
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px' }}>
                  <span>系統版本</span>
                  <span style={{ color: '#ffffff', fontWeight: '600' }}>v2.5.0 ( potato-steward-budget )</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px' }}>
                  <span>資料庫狀態</span>
                  <span style={{ color: window.location.hostname === 'localhost' ? 'var(--accent-orange)' : 'var(--accent-green)', fontWeight: '600' }}>
                    {window.location.hostname === 'localhost' ? '本地模擬開發模式' : '雲端 Firestore 連線中'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px' }}>
                  <span>目前操作者</span>
                  <span style={{ color: '#ffffff', fontWeight: '600' }}>{operatorName}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px' }}>
                  <span>綁定帳號</span>
                  <span style={{ color: '#ffffff', fontWeight: '600', fontSize: '0.78rem' }}>{currentUser?.email || '無'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>歷史明細總數</span>
                  <span style={{ color: '#ffffff', fontWeight: '600' }}>{assets.monthlyExpenses?.length || 0} 筆</span>
                </div>
              </div>

              {/* Notification card panel */}
              <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontWeight: '700', fontSize: '0.9rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  🔔 裝置推播通知
                </div>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)', lineHeight: '1.5' }}>
                  當交易紀錄產生異動（新增支出、劃撥或修改時），綁定的所有裝置都將即時收到系統推播橫幅。
                </p>
                
                {/* Status breakdown list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)', fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>瀏覽器權限</span>
                    <span style={{ fontWeight: '700', color: notificationPermission === 'granted' ? 'var(--accent-green)' : (notificationPermission === 'denied' ? 'var(--accent-red)' : 'var(--accent-orange)') }}>
                      {notificationPermission === 'granted' ? '已允許 ✅' : (notificationPermission === 'denied' ? '已拒絕/封鎖 ❌' : '尚未授權 🔔')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>FCM 狀態</span>
                    <span style={{ fontWeight: '700', color: fcmDiagnostic.status === 'ready' ? 'var(--accent-green)' : (fcmDiagnostic.status === 'failed' ? 'var(--accent-red)' : 'var(--accent-orange)') }}>
                      {fcmDiagnostic.status === 'ready' ? '連線就緒 ✅' : (fcmDiagnostic.status === 'fetching' ? '取得 Token 中...' : (fcmDiagnostic.status === 'checking' ? '檢測中...' : '尚未連線 ⚠️'))}
                    </span>
                  </div>
                  {fcmDiagnostic.token && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>裝置 Token</span>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                        {fcmDiagnostic.token.substring(0, 15)}...
                      </span>
                    </div>
                  )}
                  {fcmDiagnostic.error && (
                    <div style={{ marginTop: '4px', padding: '8px', borderRadius: '6px', backgroundColor: 'rgba(255, 69, 58, 0.1)', color: 'var(--accent-red)', fontSize: '0.72rem', wordBreak: 'break-all' }}>
                      ⚠️ 診斷錯誤資訊：{fcmDiagnostic.error}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleEnableNotification}
                    disabled={isSubscribing || fcmDiagnostic.status === 'fetching'}
                    className="glass-btn"
                    style={{
                      flex: 1,
                      padding: '10px 0',
                      borderRadius: '12px',
                      fontSize: '0.8rem',
                      fontWeight: '700',
                      color: '#fff',
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)',
                      borderColor: 'rgba(255,255,255,0.1)',
                      cursor: 'pointer',
                    }}
                  >
                    {isSubscribing ? '啟動中...' : (notificationPermission === 'granted' ? '重新綁定裝置 🔄' : '啟用推播通知 🔔')}
                  </button>

                  {fcmDiagnostic.status === 'ready' && onSendTestPush && (
                    <button
                      onClick={handleSendTestPushClick}
                      disabled={isTestingPush}
                      className="glass-btn"
                      style={{
                        flex: 1,
                        padding: '10px 0',
                        borderRadius: '12px',
                        fontSize: '0.8rem',
                        fontWeight: '700',
                        color: '#fff',
                        background: isTestingPush
                          ? 'linear-gradient(135deg, rgba(142,142,147,0.7) 0%, rgba(142,142,147,0.5) 100%)'
                          : 'linear-gradient(135deg, rgba(52,199,89,0.7) 0%, rgba(48,209,88,0.5) 100%)',
                        borderColor: isTestingPush ? 'rgba(142,142,147,0.4)' : 'rgba(52,199,89,0.4)',
                        cursor: isTestingPush ? 'not-allowed' : 'pointer',
                        boxShadow: isTestingPush ? 'none' : '0 4px 15px rgba(52,199,89,0.2)',
                        opacity: isTestingPush ? 0.7 : 1
                      }}
                    >
                      {isTestingPush ? '發送中... ⏳' : '發送測試推播 🚀'}
                    </button>
                  )}

                </div>

                <p style={{ margin: '4px 0 0 0', fontSize: '0.7rem', color: 'var(--text-tertiary)', lineHeight: '1.4', fontStyle: 'italic' }}>
                  * 註：iOS 及 macOS 設備需先透過 Safari 將本網站「加入主畫面/加入 Dock (安裝為 PWA)」後，才能完整啟用並接收系統背景推播。
                </p>
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
};

export default SettingsView;
