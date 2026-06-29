// src/components/ReviewView.jsx
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';

const formatMoney = (num) => "$" + Math.round(Number(num)).toLocaleString();

/* ── Animated counter hook ── */
const useCountUp = (target, duration = 1400, trigger = true) => {
  const [value, setValue] = useState(0);
  const rafRef = useRef(null);
  useEffect(() => {
    if (!trigger) return;
    const start = performance.now();
    const from = 0;
    const to = Number(target) || 0;
    const step = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(from + (to - from) * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration, trigger]);
  return trigger ? value : 0;
};

/* ── Intersection observer for scroll reveal ── */
const useReveal = (threshold = 0.15) => {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.unobserve(el); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
};

/* ── Animated number display ── */
const AnimNum = ({ value, prefix = '$', suffix = '', duration = 1400 }) => {
  const [ref, visible] = useReveal(0.3);
  const animated = useCountUp(value, duration, visible);
  return <span ref={ref}>{prefix}{animated.toLocaleString()}{suffix}</span>;
};

/* ── Section wrapper with scroll‑reveal ── */
const Section = ({ children, delay = 0, className = '' }) => {
  const [ref, visible] = useReveal(0.08);
  return (
    <div
      ref={ref}
      className={`review-section ${visible ? 'review-section-visible' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
};

// SF Symbols style line SVGs (HIG 3)
const getCategoryIconSVG = (catName, color = 'currentColor') => {
  if (catName.includes('餐') || catName.includes('食') || catName.includes('喝')) {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: '6px' }}>
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9z" />
        <path d="M12 2v6" />
        <path d="M12 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
      </svg>
    );
  }
  if (catName.includes('物') || catName.includes('用') || catName.includes('娛') || catName.includes('樂')) {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: '6px' }}>
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>
    );
  }
  if (catName.includes('固定') || catName.includes('租') || catName.includes('費') || catName.includes('水') || catName.includes('電') || catName.includes('稅')) {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: '6px' }}>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    );
  }
  if (catName.includes('投') || catName.includes('理') || catName.includes('金') || catName.includes('股')) {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: '6px' }}>
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    );
  }
  if (catName.includes('育') || catName.includes('孩') || catName.includes('女')) {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: '6px' }}>
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    );
  }
  if (catName.includes('寵') || catName.includes('貓') || catName.includes('狗')) {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: '6px' }}>
        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
        <path d="M8 14s1.5 2 4 2 4-2 4-2" />
        <line x1="9" y1="9" x2="9.01" y2="9" />
        <line x1="15" y1="9" x2="15.01" y2="9" />
      </svg>
    );
  }
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: '6px' }}>
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="4" y1="15" x2="20" y2="15" />
      <line x1="10" y1="3" x2="8" y2="21" />
      <line x1="16" y1="3" x2="14" y2="21" />
    </svg>
  );
};

/* ══════════════════════════════════════════
   Main component
   ══════════════════════════════════════════ */
const ReviewView = ({ assets, combinedHistory, loadArchiveMonth }) => {
  const getDefaultMonth = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const [selectedMonth, setSelectedMonth] = useState(getDefaultMonth);

  useEffect(() => {
    if (loadArchiveMonth) loadArchiveMonth(selectedMonth);
  }, [selectedMonth, loadArchiveMonth]);

  /* ── Compute all statistics ── */
  const stats = useMemo(() => {
    const records = (combinedHistory || []).filter(
      r => (r.month || (r.date || '').slice(0, 7)) === selectedMonth && !r.isDeleted
    );

    // ---------- Income / Expense ----------
    let totalIncome = 0, totalExpense = 0;
    let incomeUserA = 0, incomeUserB = 0;

    // Task 1: Dynamic categories setup
    const dynamicCategories = assets?.config?.categories || ["餐飲食品", "生活用品", "固定費用", "投資理財", "其他"];
    const catTotals = {};
    const catItems = {};
    dynamicCategories.forEach(cat => {
      catTotals[cat] = 0;
      catItems[cat] = [];
    });
    if (!catTotals["其他"]) {
      catTotals["其他"] = 0;
      catItems["其他"] = [];
    }

    let expenseUserA = 0, expenseUserB = 0, expenseJoint = 0;
    const userAItems = [], userBItems = [], jointItems = [];
    let biggestSpend = null;

    const [yearStr, monthStr] = selectedMonth.split('-');
    const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
    const now = new Date();
    const realCurMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let daysPassed = daysInMonth;
    if (selectedMonth === realCurMonth) daysPassed = now.getDate() || 1;
    else if (selectedMonth > realCurMonth) daysPassed = 1;

    const classifyAndPush = (cat, amount, r) => {
      if (catTotals[cat] !== undefined) {
        catTotals[cat] += amount;
        catItems[cat].push({ note: r.note || r.category, amount });
      } else {
        catTotals["其他"] += amount;
        catItems["其他"].push({ note: r.note || r.category, amount });
      }
    };

    records.forEach(r => {
      if (r.type === 'income') {
        totalIncome += r.total;
        if ((r.payer || '').includes('大狗狗') || (r.payer || '').includes('用戶1') || (r.payer || '').includes('userA')) incomeUserA += r.total;
        else if ((r.payer || '').includes('阿陞') || (r.payer || '').includes('用戶2') || (r.payer || '').includes('userB')) incomeUserB += r.total;
      } else if (r.type === 'expense' || r.type === 'spend') {
        totalExpense += r.total;

        // Track biggest single spend
        if (!biggestSpend || r.total > biggestSpend.total) biggestSpend = r;

        // Per‑account breakdown
        if (r.type === 'spend') {
          expenseJoint += r.total;
          jointItems.push(r);
        } else if (r.type === 'expense') {
          if ((r.payer || '').includes('大狗狗') || (r.payer || '').includes('用戶1') || (r.payer || '').includes('userA')) { expenseUserA += r.total; userAItems.push(r); }
          else if ((r.payer || '').includes('阿陞') || (r.payer || '').includes('用戶2') || (r.payer || '').includes('userB')) { expenseUserB += r.total; userBItems.push(r); }
        }

        // Category classification (Task 1 dynamic alignment)
        if (r.type === 'expense' && r.details) {
          dynamicCategories.forEach(cat => {
            if (cat.includes('餐') || cat.includes('食') || cat.includes('喝')) {
              classifyAndPush(cat, r.details.food || 0, r);
            } else if (cat.includes('購') || cat.includes('用') || cat.includes('玩') || cat.includes('樂')) {
              classifyAndPush(cat, r.details.shopping || 0, r);
            } else if (cat.includes('固定') || cat.includes('租') || cat.includes('費') || cat.includes('水') || cat.includes('電') || cat.includes('稅')) {
              classifyAndPush(cat, r.details.fixed || 0, r);
            } else if (cat.includes('其他')) {
              classifyAndPush(cat, r.details.other || 0, r);
            }
          });
        } else if (r.type === 'spend') {
          const note = r.note || '';
          const sub = r.subCategory || '其他';
          if (catTotals[sub] !== undefined) {
            classifyAndPush(sub, r.total, r);
          } else {
            const match = dynamicCategories.find(c => sub.includes(c) || c.includes(sub));
            if (match) classifyAndPush(match, r.total, r);
            else classifyAndPush("其他", r.total, r);
          }
        }
      }
    });

    const savings = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0 ? ((savings / totalIncome) * 100).toFixed(1) : '0.0';

    const annualReturn = 0.095;
    const years = 10;
    const futureValue = Math.round(Math.max(savings, 0) * Math.pow(1 + annualReturn, years));

    // Dynamic Advice Lines based on category ratios
    const adviceLines = [];
    const catEntries = Object.entries(catTotals).filter(([, v]) => v > 0);
    catEntries.sort((a, b) => b[1] - a[1]);
    catEntries.forEach(([cat, val]) => {
      const pct = totalExpense > 0 ? ((val / totalExpense) * 100) : 0;
      if ((cat.includes('餐') || cat.includes('食')) && pct > 45) {
        adviceLines.push({ text: `🍔 【${cat}】佔比 ${pct.toFixed(0)}%，偏高！試著多自己煮飯、減少外食。`, type: 'warn' });
      } else if ((cat.includes('購') || cat.includes('用')) && pct > 30) {
        adviceLines.push({ text: `🛍️ 【${cat}】佔 ${pct.toFixed(0)}%，可以建立「冷靜期」清單，24 小時後再決定要不要買。`, type: 'warn' });
      } else if ((cat.includes('固定') || cat.includes('費')) && pct > 50) {
        adviceLines.push({ text: `🏠 【${cat}】超過一半 (${pct.toFixed(0)}%)，考慮審視訂閱或合約是否能精簡。`, type: 'warn' });
      } else if (pct <= 25) {
        adviceLines.push({ text: `✅ 【${cat}】佔比 ${pct.toFixed(0)}%，控制得當，請繼續保持！`, type: 'ok' });
      }
    });
    if (savings > 0 && Number(savingsRate) >= 20) adviceLines.push({ text: `🎉 本月儲蓄率 ${savingsRate}%，太棒了！持續維持就能加速累積資產。`, type: 'ok' });
    else if (savings <= 0) adviceLines.push({ text: `⚠️ 本月入不敷出，建議盡速檢視必要性支出並設定預算上限。`, type: 'warn' });

    // Per‑category top items
    const topByCategory = {};
    Object.keys(catItems).forEach(cat => {
      const sorted = [...catItems[cat]].sort((a, b) => b.amount - a.amount);
      topByCategory[cat] = sorted.slice(0, 5);
    });

    const topUserA = [...userAItems].sort((a, b) => b.total - a.total).slice(0, 5);
    const topUserB = [...userBItems].sort((a, b) => b.total - a.total).slice(0, 5);
    const topJoint = [...jointItems].sort((a, b) => b.total - a.total).slice(0, 5);

    return {
      totalIncome, totalExpense, savings, savingsRate, futureValue,
      catTotals, topByCategory, biggestSpend,
      expenseUserA, expenseUserB, expenseJoint,
      topUserA, topUserB, topJoint,
      adviceLines, daysInMonth, daysPassed,
      incomeUserA, incomeUserB,
    };
  }, [combinedHistory, selectedMonth, assets]);

  const changeMonth = useCallback((delta) => {
    setSelectedMonth(prev => {
      const [y, m] = prev.split('-').map(Number);
      const d = new Date(y, m - 1 + delta, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
  }, []);

  const monthLabel = (() => {
    const [y, m] = selectedMonth.split('-');
    return `${y} 年 ${parseInt(m)} 月`;
  })();

  const getCatColorAndGradient = (catName) => {
    if (catName.includes('餐') || catName.includes('食') || catName.includes('喝')) {
      return { color: '#ff9f43', gradient: 'linear-gradient(135deg, rgba(255,159,67,0.15), rgba(255,159,67,0.04))' };
    }
    if (catName.includes('購') || catName.includes('用') || catName.includes('娛') || catName.includes('樂')) {
      return { color: '#54a0ff', gradient: 'linear-gradient(135deg, rgba(84,160,255,0.15), rgba(84,160,255,0.04))' };
    }
    if (catName.includes('固定') || catName.includes('租') || catName.includes('費') || catName.includes('水') || catName.includes('電') || catName.includes('稅')) {
      return { color: '#ff6b6b', gradient: 'linear-gradient(135deg, rgba(255,107,107,0.15), rgba(255,107,107,0.04))' };
    }
    if (catName.includes('投') || catName.includes('理') || catName.includes('金') || catName.includes('股')) {
      return { color: '#af52de', gradient: 'linear-gradient(135deg, rgba(175,82,222,0.15), rgba(175,82,222,0.04))' };
    }
    return { color: '#c8d6e5', gradient: 'linear-gradient(135deg, rgba(200,214,229,0.15), rgba(200,214,229,0.04))' };
  };

  return (
    <div className="review-container">
      {/* ═══ Header & Month Selector ═══ */}
      <Section>
        <h1 className="page-title" style={{ marginBottom: 0 }}>每月回顧</h1>
        <div className="review-month-nav">
          <button className="glass-btn" style={{ padding: '8px 16px', fontSize: '1.1rem' }} onClick={() => changeMonth(-1)}>◀</button>
          <div className="review-month-label">{monthLabel}</div>
          <button className="glass-btn" style={{ padding: '8px 16px', fontSize: '1.1rem' }} onClick={() => changeMonth(1)}>▶</button>
        </div>
      </Section>

      {/* ═══ 1. Summary Hero ═══ */}
      <Section delay={60}>
        <div className="glass-card review-hero">
          <div className="review-hero-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
              <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
              <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
            </svg>
            總收支概況
          </div>
          <div className="review-hero-grid">
            <div className="review-hero-item review-hero-income">
              <div className="review-hero-label">總收入</div>
              <div className="review-hero-value" style={{ color: 'var(--accent-green)' }}>
                <AnimNum value={stats.totalIncome} />
              </div>
              <div className="review-hero-sub" style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '4px' }}>
                <span className="nobrk">大狗狗 🐕: {formatMoney(stats.incomeUserA)}</span>
                <span className="nobrk">｜</span>
                <span className="nobrk">阿陞 🐶: {formatMoney(stats.incomeUserB)}</span>
              </div>
            </div>
            <div className="review-hero-item review-hero-expense">
              <div className="review-hero-label">總支出</div>
              <div className="review-hero-value" style={{ color: 'var(--accent-red)' }}>
                <AnimNum value={stats.totalExpense} />
              </div>
              <div className="review-hero-sub">日均: {formatMoney(Math.round(stats.totalExpense / stats.daysPassed))}/天</div>
            </div>
          </div>
          <div className="review-savings-bar">
            <div className="review-savings-badge" style={{
              background: stats.savings >= 0
                ? 'linear-gradient(135deg, rgba(0,122,255,0.18), rgba(88,86,214,0.12))'
                : 'linear-gradient(135deg, rgba(255,59,48,0.15), rgba(255,59,48,0.06))',
              borderColor: stats.savings >= 0 ? 'rgba(0,122,255,0.3)' : 'rgba(255,59,48,0.25)'
            }}>
              <span className="review-savings-icon" style={{ display: 'flex', alignItems: 'center' }}>
                {stats.savings >= 0 ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-red)" strokeWidth="2.5">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                )}
              </span>
              <div>
                <div className="review-savings-label">{stats.savings >= 0 ? '本月結餘 (存下的錢)' : '本月超支'}</div>
                <div className="review-savings-value" style={{ color: stats.savings >= 0 ? 'var(--accent-blue)' : 'var(--accent-red)' }}>
                  <AnimNum value={Math.abs(stats.savings)} prefix={stats.savings >= 0 ? '+$' : '-$'} />
                </div>
              </div>
              <div className="review-savings-rate">儲蓄率<br /><strong>{stats.savingsRate}%</strong></div>
            </div>
          </div>
        </div>
      </Section>

      {/* ═══ 2. Category Analysis ═══ */}
      {Object.entries(stats.catTotals).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([cat, total], idx) => {
        const cfg = getCatColorAndGradient(cat);
        const pct = stats.totalExpense > 0 ? ((total / stats.totalExpense) * 100).toFixed(1) : '0';
        const dailyAvg = Math.round(total / stats.daysPassed);
        const items = stats.topByCategory[cat] || [];
        return (
          <Section key={cat} delay={120 + idx * 80}>
            <div className="glass-card" style={{ background: cfg.gradient, borderLeft: `4px solid ${cfg.color}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {getCategoryIconSVG(cat, cfg.color)} 
                  {cat}
                </h3>
                <span style={{ background: `${cfg.color}22`, color: cfg.color, padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: '0.78rem', fontWeight: 700 }}>佔比 {pct}%</span>
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
                <div className="review-stat-chip">
                  <span className="review-stat-chip-label">總花費</span>
                  <span className="review-stat-chip-value" style={{ color: cfg.color }}><AnimNum value={total} duration={1200} /></span>
                </div>
                <div className="review-stat-chip">
                  <span className="review-stat-chip-label">日均花費</span>
                  <span className="review-stat-chip-value">{formatMoney(dailyAvg)}</span>
                </div>
              </div>
              {items.length > 0 && (
                <div className="review-item-list">
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginBottom: '6px', fontWeight: 600 }}>品項明細 (前 5 高)</div>
                  {items.map((it, i) => (
                    <div key={i} className="review-item-row">
                      <span className="review-item-name">{it.note}</span>
                      <span className="review-item-amount">{formatMoney(it.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>
        );
      })}

      {/* ═══ 3. Biggest Single Spend ═══ */}
      {stats.biggestSpend && (
        <Section delay={200}>
          <div className="glass-card" style={{ borderLeft: '4px solid var(--accent-pink)', background: 'linear-gradient(135deg, rgba(255,45,85,0.10), rgba(255,45,85,0.03))' }}>
            <h3 style={{ margin: '0 0 10px 0', fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent-pink)" strokeWidth="2.5">
                <circle cx="12" cy="8" r="7" />
                <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
              </svg>
              本月單筆最高支出
            </h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{stats.biggestSpend.note || stats.biggestSpend.category}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: '3px' }}>{stats.biggestSpend.date} · {stats.biggestSpend.payer}</div>
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-pink)' }}>
                <AnimNum value={stats.biggestSpend.total} duration={1600} />
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* ═══ 4. Per-Account Analysis ═══ */}
      <Section delay={280}>
        <div className="glass-card">
          <h3 style={{ margin: '0 0 16px 0', fontWeight: 700, fontSize: '1.05rem' }}>👥 雙人帳戶消費分析</h3>
          {[
            { label: '大狗狗 🐕', total: stats.expenseUserA, items: stats.topUserA, color: 'var(--accent-pink)', borderColor: 'rgba(255,45,85,0.25)' },
            { label: '阿陞 🐶', total: stats.expenseUserB, items: stats.topUserB, color: 'var(--accent-green)', borderColor: 'rgba(52,199,89,0.25)' },
            { label: '共同帳戶 🏫', total: stats.expenseJoint, items: stats.topJoint, color: 'var(--accent-orange)', borderColor: 'rgba(255,149,0,0.25)' },
          ].map((acc, idx) => (
            <div key={idx} className="review-account-block" style={{ borderColor: acc.borderColor }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{acc.label}</span>
                <span style={{ fontWeight: 800, color: acc.color, fontSize: '1.1rem' }}>
                  <AnimNum value={acc.total} duration={1200} />
                </span>
              </div>
              {acc.items.length > 0 && (
                <div className="review-item-list" style={{ marginTop: '4px' }}>
                  {acc.items.map((r, i) => (
                    <div key={i} className="review-item-row">
                      <span className="review-item-name">{r.note || r.category} <span style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>{r.date}</span></span>
                      <span className="review-item-amount">{formatMoney(r.total)}</span>
                    </div>
                  ))}
                </div>
              )}
              {acc.total === 0 && <div style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', textAlign: 'center', padding: '8px 0' }}>本月無支出紀錄</div>}
            </div>
          ))}
        </div>
      </Section>

      {/* ═══ 5. Spending Advice ═══ */}
      {stats.adviceLines.length > 0 && (
        <Section delay={360}>
          <div className="glass-card" style={{ borderLeft: '4px solid var(--accent-yellow)' }}>
            <h3 style={{ margin: '0 0 14px 0', fontWeight: 700, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
              馬鈴薯管家的理財分析與建議
            </h3>
            {stats.adviceLines.map((a, i) => (
              <div key={i} className="review-advice-row" style={{
                background: a.type === 'warn' ? 'rgba(255,149,0,0.06)' : 'rgba(52,199,89,0.06)',
                borderColor: a.type === 'warn' ? 'rgba(255,149,0,0.15)' : 'rgba(52,199,89,0.15)'
              }}>
                {a.text}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ═══ 6. Investment Encouragement ═══ */}
      {stats.savings > 0 && (
        <Section delay={440}>
          <div className="glass-card review-invest-card">
            <div className="review-invest-glow" />
            <h3 style={{ margin: '0 0 8px 0', fontWeight: 800, fontSize: '1.1rem', position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                <polyline points="17 6 23 6 23 12" />
              </svg>
              如果把結餘拿去複利投資...
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 18px 0', lineHeight: 1.6, position: 'relative', zIndex: 1 }}>
              若將本月結餘 {formatMoney(stats.savings)} 投入台灣標竿 0050 ETF<br />
              (依歷史長期含息年化報酬率 <strong style={{ color: '#30d158' }}>9.5%</strong> 複利計算)
            </p>
            <div className="review-invest-result">
              <div className="review-invest-label">10 年後複利滾存價值</div>
              <div className="review-invest-value">
                <AnimNum value={stats.futureValue} />
              </div>
              <div className="review-invest-growth">
                淨資產增加 <AnimNum value={stats.futureValue - stats.savings} prefix="+$" />
                <span style={{ marginLeft: '6px', fontSize: '0.82rem', opacity: 0.8 }}>
                  ({((stats.futureValue / stats.savings - 1) * 100).toFixed(0)}%)
                </span>
              </div>
            </div>
            <p style={{ fontSize: '0.73rem', color: 'var(--text-tertiary)', margin: '14px 0 0 0', textAlign: 'center', position: 'relative', zIndex: 1 }}>
              💡 存下的每一塊錢都是你未來經濟獨立的基石！
            </p>
          </div>
        </Section>
      )}

      {/* ═══ Empty state ═══ */}
      {stats.totalIncome === 0 && stats.totalExpense === 0 && (
        <Section>
          <div className="glass-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🥔</div>
            <div style={{ color: 'var(--text-tertiary)', fontSize: '0.95rem' }}>本月尚無帳務紀錄。</div>
          </div>
        </Section>
      )}

      {/* Bottom spacer */}
      <div style={{ height: 40 }} />
    </div>
  );
};

export default ReviewView;
