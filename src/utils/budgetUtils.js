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
  if (r.type === 'expense' && r.details && (r.details.fixed || r.details.food || r.details.shopping || r.details.entertainment || r.details.other)) {
    const fixed = Number(r.details.fixed || 0);
    const food = Number(r.details.food || 0);
    const shopping = Number(r.details.shopping || 0);
    const entertainment = Number(r.details.entertainment || 0);
    const other = Number(r.details.other || 0);
    const maxVal = Math.max(fixed, food, shopping, entertainment, other);
    if (maxVal > 0) {
      if (maxVal === fixed) return '固定費用';
      if (maxVal === food) return '餐費';
      if (maxVal === shopping) return '購物';
      if (maxVal === entertainment) return '娛樂';
      return '其他';
    }
  }

  if (r.type === 'spend' || r.type === 'expense') {
    let sub = r.subCategory || r.category || r.note || '其他';
    if (sub.includes('固定') || sub.includes('帳單') || sub.includes('電信') || sub.includes('水電') || sub.includes('房租') || sub.includes('訂閱')) return '固定費用';
    if (sub.includes('餐') || sub.includes('食') || sub.includes('喝')) return '餐費';
    if (sub.includes('購') || sub.includes('用') || sub.includes('生')) return '購物';
    if (sub.includes('玩') || sub.includes('樂') || sub.includes('娛')) return '娛樂';
    return '其他';
  }
  return '其他';
};

export const isFixedCategory = (catName) => {
  if (!catName) return false;
  const name = catName.toLowerCase();
  return name.includes('固定') || 
         name.includes('房租') || 
         name.includes('水電') || 
         name.includes('瓦斯') || 
         name.includes('電信') || 
         name.includes('網路') || 
         name.includes('管理費') || 
         name.includes('保險') || 
         name.includes('訂閱') || 
         name.includes('學費') || 
         name.includes('稅') ||
         name.includes('帳單');
};

export const getDaysInMonth = (monthStr) => {
  if (!monthStr || typeof monthStr !== 'string' || !monthStr.includes('-')) return 30;
  const parts = monthStr.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) return 30;
  const days = new Date(year, month, 0).getDate();
  return isNaN(days) || days <= 0 ? 30 : days;
};

export const getDailyBudgetLimit = (assets, monthStr, category) => {
  if (!assets?.budgets || !monthStr || typeof monthStr !== 'string' || !monthStr.includes('-')) return 0;
  const budgets = getBudgetForMonth(assets, monthStr);
  const budgetVal = budgets[category] || 0;
  if (budgetVal <= 0) return 0;
  
  const daysInMonth = getDaysInMonth(monthStr);
  return budgetVal / daysInMonth;
};

/**
 * 依據「方案 A：日常支出累積日額滾動 + 固定支出全月判定」
 * 動態精確計算每筆支出的必要金額 (needAmount) 與選擇性金額 (wantAmount)
 */
export const computeDynamicNecessities = (records, assets) => {
  // Sort history chronologically to compute running sum correctly
  const sorted = [...records]
    .map((r, idx) => ({ ...r, originalIndex: idx }))
    .sort((a, b) => {
      const dateA = new Date(a.date).getTime() || 0;
      const dateB = new Date(b.date).getTime() || 0;
      if (dateA !== dateB) return dateA - dateB;
      const tsA = new Date(a.timestamp || 0).getTime() || 0;
      const tsB = new Date(b.timestamp || 0).getTime() || 0;
      return tsA - tsB;
    });
    
  // 記錄各月份各分類已消耗的必要金額：key: "YYYY-MM:Category", val: cumulative spent need
  const monthlySpentNeed = {};
  const results = {}; // Map of record originalIndex to { needAmount, wantAmount }
  
  sorted.forEach(r => {
    if (r.isDeleted || (r.type !== 'expense' && r.type !== 'spend')) {
      results[r.originalIndex] = { needAmount: 0, wantAmount: 0 };
      return;
    }
    
    const m = r.month || r.date?.slice(0, 7) || new Date().toISOString().slice(0, 7);
    const totalDays = getDaysInMonth(m);
    
    // 取得該筆交易發生在當月的第幾天 (1 ~ totalDays)
    let dayOfMonth = totalDays;
    if (r.date) {
      const dateParts = r.date.split('-');
      if (dateParts.length >= 3) {
        const parsedDay = Number(dateParts[2]);
        if (!isNaN(parsedDay) && parsedDay >= 1 && parsedDay <= totalDays) {
          dayOfMonth = parsedDay;
        }
      }
    }
    
    let itemNeedTotal = 0;
    const details = r.details || {};
    const catAmounts = [];
    
    if (details.food || details.shopping || details.entertainment || details.fixed || details.other) {
      if (details.fixed) catAmounts.push({ category: '固定費用', amount: Number(details.fixed) });
      if (details.food) catAmounts.push({ category: '餐費', amount: Number(details.food) });
      if (details.shopping) catAmounts.push({ category: '購物', amount: Number(details.shopping) });
      if (details.entertainment) catAmounts.push({ category: '娛樂', amount: Number(details.entertainment) });
      if (details.other) catAmounts.push({ category: '其他', amount: Number(details.other) });
    } else {
      const cat = getRecordMainCategory(r);
      catAmounts.push({ category: cat, amount: r.total || 0 });
    }
    
    catAmounts.forEach(({ category, amount }) => {
      if (!amount || amount <= 0) return;
      
      const budgets = getBudgetForMonth(assets, m);
      const monthlyBudget = budgets[category] || 0;
      const key = `${m}:${category}`;
      const spentNeedSoFar = monthlySpentNeed[key] || 0;
      
      if (monthlyBudget > 0) {
        let maxAllowedCumulativeNeed = 0;
        
        if (isFixedCategory(category)) {
          // 【固定費用】採用整月預算上限
          maxAllowedCumulativeNeed = monthlyBudget;
        } else {
          // 【日常變動費用】採用「日額累積滾動制」：截至第 D 天的可用累計必要上限
          const dailyLimit = monthlyBudget / totalDays;
          maxAllowedCumulativeNeed = Math.min(monthlyBudget, dailyLimit * dayOfMonth);
        }
        
        // 當前該分類尚可認列為「必要」的可用額度
        const availableNeed = Math.max(0, maxAllowedCumulativeNeed - spentNeedSoFar);
        const needAmt = Math.min(amount, availableNeed);
        
        itemNeedTotal += needAmt;
        monthlySpentNeed[key] = spentNeedSoFar + needAmt;
      }
    });
    
    const roundedNeed = Math.min(r.total || 0, Math.max(0, Math.round(itemNeedTotal)));
    const roundedWant = Math.max(0, (r.total || 0) - roundedNeed);
    
    results[r.originalIndex] = {
      needAmount: roundedNeed,
      wantAmount: roundedWant
    };
  });
  
  return results;
};
