// src/utils/budgetUtils.js

export const getBudgetForMonth = (assets, monthStr) => {
  if (assets?.budgets && assets.budgets[monthStr]) {
    return assets.budgets[monthStr];
  }
  if (assets?.budgets) {
    const sortedMonths = Object.keys(assets.budgets).sort();
    const prevMonths = sortedMonths.filter(m => m < monthStr);
    if (prevMonths.length > 0) {
      const closestMonth = prevMonths[prevMonths.length - 1];
      return assets.budgets[closestMonth];
    }
  }
  // Default fallback: divide monthlyBudget (default 25000) equally among categories
  const categories = assets?.config?.categories || ["餐費", "購物", "娛樂", "其他"];
  const defaultMapping = {};
  const totalFallback = assets?.monthlyBudget || 25000;
  const portion = Math.round(totalFallback / categories.length);
  categories.forEach((cat, idx) => {
    if (idx === categories.length - 1) {
      defaultMapping[cat] = totalFallback - portion * (categories.length - 1);
    } else {
      defaultMapping[cat] = portion;
    }
  });
  return defaultMapping;
};

export const getRecordMainCategory = (r) => {
  if (r.type === 'spend') {
    let sub = r.subCategory || '其他';
    if (sub.includes('餐') || sub.includes('食') || sub.includes('喝')) return '餐費';
    if (sub.includes('購') || sub.includes('用') || sub.includes('生')) return '購物';
    if (sub.includes('玩') || sub.includes('樂') || sub.includes('娛')) return '娛樂';
    return '其他';
  } else if (r.type === 'expense' && r.details) {
    const food = Number(r.details.food || 0);
    const shopping = Number(r.details.shopping || 0);
    const entertainment = Number(r.details.entertainment || 0);
    const other = Number(r.details.other || 0) + Number(r.details.fixed || 0);
    const maxVal = Math.max(food, shopping, entertainment, other);
    if (maxVal === food) return '餐費';
    if (maxVal === shopping) return '購物';
    if (maxVal === entertainment) return '娛樂';
    return '其他';
  }
  return '其他';
};

export const computeDynamicNecessities = (records, assets) => {
  const dynamicCategories = assets?.config?.categories || ["餐費", "購物", "娛樂", "其他"];
  
  // Sort history chronologically to compute running sum correctly
  const sorted = [...records]
    .map((r, idx) => ({ ...r, originalIndex: idx }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());
    
  const months = {};
  const results = {}; // Map of record originalIndex to 'need' | 'want'
  
  sorted.forEach(r => {
    if (r.isDeleted) {
      results[r.originalIndex] = 'need';
      return;
    }
    if (r.type !== 'expense' && r.type !== 'spend') {
      results[r.originalIndex] = 'need';
      return;
    }
    
    const m = r.month || r.date.slice(0, 7);
    if (!months[m]) {
      months[m] = {};
      dynamicCategories.forEach(cat => {
        months[m][cat] = { budget: 0, spent: 0 };
      });
      if (!months[m]["其他"]) months[m]["開銷"] = { budget: 0, spent: 0 }; // fallback
      
      const budgets = getBudgetForMonth(assets, m);
      Object.keys(budgets).forEach(cat => {
        if (months[m][cat]) months[m][cat].budget = budgets[cat];
      });
    }
    
    const cat = getRecordMainCategory(r);
    const catData = months[m][cat] || months[m]["其他"] || { budget: 0, spent: 0 };
    
    if (catData.spent < catData.budget) {
      results[r.originalIndex] = 'need';
    } else {
      results[r.originalIndex] = 'want';
    }
    catData.spent += r.total;
  });
  
  return results;
};
