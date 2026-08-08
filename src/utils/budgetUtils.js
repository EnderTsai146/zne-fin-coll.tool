// src/utils/budgetUtils.js

export const getBudgetForMonth = (assets, monthStr) => {
  if (assets?.budgets && assets.budgets[monthStr]) {
    return assets.budgets[monthStr];
  }
  
  const currentMonthStr = new Date().toISOString().slice(0, 7);
  // Carry over logic: Only active for months that have already started (<= currentMonthStr)
  if (monthStr <= currentMonthStr && assets?.budgets) {
    const sortedMonths = Object.keys(assets.budgets).sort();
    const prevMonths = sortedMonths.filter(m => m < monthStr);
    if (prevMonths.length > 0) {
      const closestMonth = prevMonths[prevMonths.length - 1];
      return assets.budgets[closestMonth];
    }
  }
  
  // Default fallback: return 0 for all categories since no budget has been set
  const categories = assets?.config?.categories || ["餐費", "購物", "娛樂", "固定費用", "其他"];
  const zeroMapping = {};
  categories.forEach(cat => {
    zeroMapping[cat] = 0;
  });
  return zeroMapping;
};

export const getRecordMainCategory = (r) => {
  if (r.type === 'spend' || r.type === 'expense') {
    let sub = r.subCategory || r.category || r.note || '其他';
    if (sub.includes('固定') || sub.includes('帳單') || sub.includes('電信') || sub.includes('水電') || sub.includes('房租') || sub.includes('訂閱')) return '固定費用';
    if (sub.includes('餐') || sub.includes('食') || sub.includes('喝')) return '餐費';
    if (sub.includes('購') || sub.includes('用') || sub.includes('生')) return '購物';
    if (sub.includes('玩') || sub.includes('樂') || sub.includes('娛')) return '娛樂';
    return '其他';
  } else if (r.type === 'expense' && r.details) {
    const fixed = Number(r.details.fixed || 0);
    const food = Number(r.details.food || 0);
    const shopping = Number(r.details.shopping || 0);
    const entertainment = Number(r.details.entertainment || 0);
    const other = Number(r.details.other || 0);
    const maxVal = Math.max(fixed, food, shopping, entertainment, other);
    if (maxVal === fixed) return '固定費用';
    if (maxVal === food) return '餐費';
    if (maxVal === shopping) return '購物';
    if (maxVal === entertainment) return '娛樂';
    return '其他';
  }
  return '其他';
};

export const getDailyBudgetLimit = (assets, monthStr, category) => {
  if (!assets?.budgets || !monthStr || typeof monthStr !== 'string' || !monthStr.includes('-')) return 0;
  const budgets = getBudgetForMonth(assets, monthStr);
  const budgetVal = budgets[category] || 0;
  if (budgetVal <= 0) return 0;
  
  const parts = monthStr.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) return 0;
  
  const daysInMonth = new Date(year, month, 0).getDate();
  return isNaN(daysInMonth) || daysInMonth <= 0 ? 0 : (budgetVal / daysInMonth);
};

export const computeDynamicNecessities = (records, assets) => {
  // Sort history chronologically to compute running sum correctly
  const sorted = [...records]
    .map((r, idx) => ({ ...r, originalIndex: idx }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());
    
  const monthlySpentNeed = {}; // key: "YYYY-MM:Category", val: cumulative spent need amount in month
  const results = {}; // Map of record originalIndex to { needAmount, wantAmount }
  
  sorted.forEach(r => {
    if (r.isDeleted) {
      results[r.originalIndex] = { needAmount: 0, wantAmount: 0 };
      return;
    }
    if (r.type !== 'expense' && r.type !== 'spend') {
      results[r.originalIndex] = { needAmount: 0, wantAmount: 0 };
      return;
    }
    
    const m = r.month || r.date.slice(0, 7);
    
    let itemNeedTotal = 0;
    let itemWantTotal = 0;
    
    const details = r.details || {};
    const catAmounts = [];
    
    if (details.food || details.shopping || details.entertainment || details.other) {
      if (details.food) catAmounts.push({ category: '餐費', amount: Number(details.food) });
      if (details.shopping) catAmounts.push({ category: '購物', amount: Number(details.shopping) });
      if (details.entertainment) catAmounts.push({ category: '娛樂', amount: Number(details.entertainment) });
      if (details.other) catAmounts.push({ category: '其他', amount: Number(details.other) });
    } else {
      const cat = getRecordMainCategory(r);
      catAmounts.push({ category: cat, amount: r.total });
    }
    
    catAmounts.forEach(({ category, amount }) => {
      // Get monthly budget for this category in month m
      const budgets = getBudgetForMonth(assets, m);
      const monthlyBudget = budgets[category] || 0;
      const key = `${m}:${category}`;
      const spentNeedInMonth = monthlySpentNeed[key] || 0;
      
      if (monthlyBudget <= 0) {
        itemWantTotal += amount;
      } else {
        const allowedNeed = Math.max(0, monthlyBudget - spentNeedInMonth);
        const needAmt = Math.min(amount, allowedNeed);
        const wantAmt = amount - needAmt;
        
        itemNeedTotal += needAmt;
        itemWantTotal += wantAmt;
        
        monthlySpentNeed[key] = spentNeedInMonth + needAmt;
      }
    });
    
    const roundedNeed = Math.round(itemNeedTotal);
    const roundedWant = Math.max(0, Math.round(r.total - roundedNeed));
    results[r.originalIndex] = {
      needAmount: roundedNeed,
      wantAmount: roundedWant
    };
  });
  
  return results;
};
