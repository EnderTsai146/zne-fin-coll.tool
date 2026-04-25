// src/components/ReviewView.jsx
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';

const formatMoney = (num) => "$" + Math.round(Number(num)).toLocaleString();

/* ── Animated counter hook ── */
const useCountUp = (target, duration = 1400, trigger = true) => {
  const [value, setValue] = useState(0);
  const rafRef = useRef(null);
  useEffect(() => {
    if (!trigger) { setValue(0); return; }
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
  return value;
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

/* ══════════════════════════════════════════
   Main component
   ══════════════════════════════════════════ */
const ReviewView = ({ assets, combinedHistory, loadArchiveMonth }) => {
  // Default to previous month
  const getDefaultMonth = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const [selectedMonth, setSelectedMonth] = useState(getDefaultMonth);

  // Auto‑load archive for selected month
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
    const catTotals = { '餐費': 0, '購物': 0, '固定費用': 0, '其他': 0 };
    const catItems = { '餐費': [], '購物': [], '固定費用': [], '其他': [] };
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

    records.forEach(r => {
      if (r.type === 'income') {
        totalIncome += r.total;
        if ((r.payer || '').includes('恆恆')) incomeUserA += r.total;
        else if ((r.payer || '').includes('得得')) incomeUserB += r.total;
      } else if (r.type === 'expense' || r.type === 'spend') {
        totalExpense += r.total;

        // Track biggest single spend
        if (!biggestSpend || r.total > biggestSpend.total) biggestSpend = r;

        // Per‑account breakdown
        if (r.type === 'spend') {
          expenseJoint += r.total;
          jointItems.push(r);
        } else if (r.type === 'expense') {
          if ((r.payer || '').includes('恆恆')) { expenseUserA += r.total; userAItems.push(r); }
          else if ((r.payer || '').includes('得得')) { expenseUserB += r.total; userBItems.push(r); }
        }

        // Category classification
        const classifyAndPush = (cat, amount, r) => {
          catTotals[cat] = (catTotals[cat] || 0) + amount;
          catItems[cat] = catItems[cat] || [];
          catItems[cat].push({ note: r.note || r.category, amount });
        };

        if (r.type === 'expense' && r.details) {
          if (r.details.food) classifyAndPush('餐費', r.details.food, r);
          if (r.details.shopping) classifyAndPush('購物', r.details.shopping, r);
          if (r.details.fixed) classifyAndPush('固定費用', r.details.fixed, r);
          if (r.details.other) classifyAndPush('其他', r.details.other, r);
        } else if (r.type === 'spend') {
          const note = r.note || '';
          const sub = r.subCategory;
          if (sub) {
            classifyAndPush(sub === '固定費用' ? '固定費用' : (sub || '其他'), r.total, r);
          } else if (note.includes('餐費')) classifyAndPush('餐費', r.total, r);
          else if (note.includes('購物')) classifyAndPush('購物', r.total, r);
          else if (note.includes('固定')) classifyAndPush('固定費用', r.total, r);
          else classifyAndPush('其他', r.total, r);
        }
      }
    });

    const savings = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0 ? ((savings / totalIncome) * 100).toFixed(1) : '0.0';

    // Compound interest: savings × (1 + 0.095)^10
    const annualReturn = 0.095;
    const years = 10;
    const futureValue = Math.round(Math.max(savings, 0) * Math.pow(1 + annualReturn, years));

    // Spending advice
    const adviceLines = [];
    const catEntries = Object.entries(catTotals).filter(([, v]) => v > 0);
    catEntries.sort((a, b) => b[1] - a[1]);
    catEntries.forEach(([cat, val]) => {
      const pct = totalExpense > 0 ? ((val / totalExpense) * 100) : 0;
      if (cat === '餐費' && pct > 45) adviceLines.push({ text: `🍔 餐費佔比 ${pct.toFixed(0)}%，偏高！試著多自己煮飯、減少外食。`, type: 'warn' });
      else if (cat === '購物' && pct > 30) adviceLines.push({ text: `🛍️ 購物佔 ${pct.toFixed(0)}%，可以建立「冷靜期」清單，24 小時後再決定要不要買。`, type: 'warn' });
      else if (cat === '固定費用' && pct > 50) adviceLines.push({ text: `🏠 固定費用超過一半 (${pct.toFixed(0)}%)，考慮審視訂閱或合約是否能精簡。`, type: 'warn' });
      else if (cat === '其他' && pct > 35) adviceLines.push({ text: `📦 「其他」花費偏高 (${pct.toFixed(0)}%)，建議細分類別來追蹤這些花在哪。`, type: 'warn' });
      else if (pct <= 25) adviceLines.push({ text: `✅ ${cat}佔比 ${pct.toFixed(0)}%，控制得宜，繼續保持！`, type: 'ok' });
    });
    if (savings > 0 && Number(savingsRate) >= 20) adviceLines.push({ text: `🎉 本月儲蓄率 ${savingsRate}%，太棒了！持續維持就能加速累積資產。`, type: 'ok' });
    else if (savings <= 0) adviceLines.push({ text: `⚠️ 本月入不敷出，建議盡速檢視必要性支出並設定預算上限。`, type: 'warn' });

    // Per‑category top items
    const topByCategory = {};
    Object.keys(catItems).forEach(cat => {
      const sorted = [...catItems[cat]].sort((a, b) => b.amount - a.amount);
      topByCategory[cat] = sorted.slice(0, 5);
    });

    // Per‑account biggest
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
  }, [combinedHistory, selectedMonth]);

  /* ── Month navigation ── */
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

  /* ── Category config ── */
  const catConfig = {
    '餐費': { icon: '🍔', color: '#ff9f43', gradient: 'linear-gradient(135deg, rgba(255,159,67,0.15), rgba(255,159,67,0.04))' },
    '購物': { icon: '🛍️', color: '#54a0ff', gradient: 'linear-gradient(135deg, rgba(84,160,255,0.15), rgba(84,160,255,0.04))' },
    '固定費用': { icon: '🏠', color: '#ff6b6b', gradient: 'linear-gradient(135deg, rgba(255,107,107,0.15), rgba(255,107,107,0.04))' },
    '其他': { icon: '📦', color: '#c8d6e5', gradient: 'linear-gradient(135deg, rgba(200,214,229,0.15), rgba(200,214,229,0.04))' },
  };

  /* ── Render ── */
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
          <div className="review-hero-title">💰 總收支概況</div>
          <div className="review-hero-grid">
            <div className="review-hero-item review-hero-income">
              <div className="review-hero-label">總收入</div>
              <div className="review-hero-value" style={{ color: 'var(--accent-green)' }}>
                <AnimNum value={stats.totalIncome} />
              </div>
              <div className="review-hero-sub">恆: {formatMoney(stats.incomeUserA)} ｜ 得: {formatMoney(stats.incomeUserB)}</div>
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
              <span className="review-savings-icon">{stats.savings >= 0 ? '🎉' : '⚠️'}</span>
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
        const cfg = catConfig[cat] || catConfig['其他'];
        const pct = stats.totalExpense > 0 ? ((total / stats.totalExpense) * 100).toFixed(1) : '0';
        const dailyAvg = Math.round(total / stats.daysPassed);
        const items = stats.topByCategory[cat] || [];
        return (
          <Section key={cat} delay={120 + idx * 80}>
            <div className="glass-card" style={{ background: cfg.gradient, borderLeft: `4px solid ${cfg.color}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1.05rem' }}>{cfg.icon} {cat}</h3>
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
            <h3 style={{ margin: '0 0 10px 0', fontWeight: 700, fontSize: '1rem' }}>👑 本月單筆最高花費</h3>
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
          <h3 style={{ margin: '0 0 16px 0', fontWeight: 700, fontSize: '1.05rem' }}>👥 帳戶消費分析</h3>
          {[
            { label: '🐕 得得', total: stats.expenseUserB, items: stats.topUserB, color: 'var(--accent-green)', borderColor: 'rgba(52,199,89,0.25)' },
            { label: '🐶 恆恆', total: stats.expenseUserA, items: stats.topUserA, color: 'var(--accent-pink)', borderColor: 'rgba(255,45,85,0.25)' },
            { label: '🏫 共同帳戶', total: stats.expenseJoint, items: stats.topJoint, color: 'var(--accent-orange)', borderColor: 'rgba(255,149,0,0.25)' },
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
            <h3 style={{ margin: '0 0 14px 0', fontWeight: 700, fontSize: '1.05rem' }}>🧠 馬鈴薯管家的消費建議</h3>
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
            <h3 style={{ margin: '0 0 8px 0', fontWeight: 800, fontSize: '1.1rem', position: 'relative', zIndex: 1 }}>
              🚀 如果把結餘拿去投資...
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 18px 0', lineHeight: 1.6, position: 'relative', zIndex: 1 }}>
              若將本月結餘 {formatMoney(stats.savings)} 單筆投入 0050 ETF<br />
              (以歷史 10 年平均含息年化報酬率 <strong style={{ color: 'var(--accent-green)' }}>9.5%</strong> 計算)
            </p>
            <div className="review-invest-result">
              <div className="review-invest-label">10 年後預估價值</div>
              <div className="review-invest-value">
                <AnimNum value={stats.futureValue} duration={2200} />
              </div>
              <div className="review-invest-growth">
                成長 <AnimNum value={stats.futureValue - stats.savings} prefix="+$" duration={2200} />
                <span style={{ marginLeft: '6px', fontSize: '0.82rem', opacity: 0.8 }}>
                  ({((stats.futureValue / stats.savings - 1) * 100).toFixed(0)}%)
                </span>
              </div>
            </div>
            <p style={{ fontSize: '0.73rem', color: 'var(--text-tertiary)', margin: '14px 0 0 0', textAlign: 'center', position: 'relative', zIndex: 1 }}>
              💡 每月存下的錢都是未來的自己在感謝你！
            </p>
          </div>
        </Section>
      )}

      {/* ═══ Empty state ═══ */}
      {stats.totalIncome === 0 && stats.totalExpense === 0 && (
        <Section>
          <div className="glass-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🥔</div>
            <div style={{ color: 'var(--text-tertiary)', fontSize: '0.95rem' }}>這個月還沒有任何紀錄喔！</div>
          </div>
        </Section>
      )}

      {/* Bottom spacer */}
      <div style={{ height: 40 }} />
    </div>
  );
};

export default ReviewView;
