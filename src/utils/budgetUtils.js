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
 * 動態精確計算每筆支出的必要金額 (needAmount)、選擇性金額 (wantAmount)
 * 並產出詳盡、人性化的智慧診斷與計算由理解讀報告 (explanation & breakdown)
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
  const results = {}; // Map of record originalIndex to diagnosis object
  
  sorted.forEach(r => {
    if (r.isDeleted || (r.type !== 'expense' && r.type !== 'spend')) {
      results[r.originalIndex] = {
        needAmount: 0,
        wantAmount: 0,
        total: r.total || 0,
        date: r.date || '',
        statusType: 'deleted_or_non_expense',
        statusBadge: { label: '非支出 / 已作廢', color: '#8e8e93', bg: 'rgba(142,142,147,0.12)', border: 'rgba(142,142,147,0.3)', icon: '🚫' },
        summaryExplanation: '此紀錄已被作廢或屬於非支出項目（如收入/轉帳/校正），不參與支出預算核銷。',
        summaryAdvice: '',
        categoryBreakdown: []
      };
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
    
    const categoryBreakdown = [];
    
    catAmounts.forEach(({ category, amount }) => {
      if (!amount || amount <= 0) return;
      
      const budgets = getBudgetForMonth(assets, m);
      const monthlyBudget = budgets[category] || 0;
      const isFixed = isFixedCategory(category);
      const dailyLimit = monthlyBudget > 0 ? (monthlyBudget / totalDays) : 0;
      const key = `${m}:${category}`;
      const spentNeedSoFar = monthlySpentNeed[key] || 0;
      
      let maxAllowedCumulativeNeed = 0;
      let needAmt = 0;
      let wantAmt = amount;
      let catStatusType = 'no_budget';
      let catExplanation = '';
      let catAdvice = '';
      
      if (monthlyBudget <= 0) {
        catStatusType = 'no_budget';
        needAmt = 0;
        wantAmt = amount;
        catExplanation = `系統在 ${m} 月份尚未為【${category}】設定預算上限（預算為 $0）。在無預算額度可供抵扣的情況下，全額標記為非預算內的選擇性支出。`;
        catAdvice = `💡 若此分類為您的常態生活開銷，建議至【設定 ➔ 預算配置】為其分配月度預算，系統即可為您自動啟動每日健康進度追蹤！`;
      } else if (isFixed) {
        maxAllowedCumulativeNeed = monthlyBudget;
        const availableNeed = Math.max(0, maxAllowedCumulativeNeed - spentNeedSoFar);
        needAmt = Math.min(amount, availableNeed);
        wantAmt = amount - needAmt;
        
        if (wantAmt === 0) {
          catStatusType = 'fixed_need';
          catExplanation = `【${category}】屬於週期性固定費用（如房租、水電瓦斯、網路電信或常態訂閱）。此類別不受「按日平分」進度限制，直接採用整月預算上限（$${monthlyBudget.toLocaleString()}）進行核銷，確保月初一次扣繳時不會被拆碎誤判！`;
          catAdvice = `🟢 此固定開銷在月預算額度內順利核銷，不干擾日常浮動預算的分配！`;
        } else {
          catStatusType = 'fixed_over';
          catExplanation = `本月【${category}】已累計支出超過該分類整月設定的預算上限（$${monthlyBudget.toLocaleString()}），超出部分（$${wantAmt.toLocaleString()}）列為超額選擇性支出。`;
          catAdvice = `🔴 請留意是否有額外的非常態帳單或價格調漲，可適度評估調高該分類預算。`;
        }
        
        monthlySpentNeed[key] = spentNeedSoFar + needAmt;
        itemNeedTotal += needAmt;
      } else {
        // 日常變動費用：日額累積滾動制
        maxAllowedCumulativeNeed = Math.min(monthlyBudget, dailyLimit * dayOfMonth);
        const availableNeed = Math.max(0, maxAllowedCumulativeNeed - spentNeedSoFar);
        needAmt = Math.min(amount, availableNeed);
        wantAmt = amount - needAmt;
        
        if (wantAmt === 0) {
          catStatusType = 'full_need';
          catExplanation = `此筆支出發生在 ${m} 的第 ${dayOfMonth} 天（全月共 ${totalDays} 天）。截至當天，該分類累積允許的必要額度為 $${Math.round(maxAllowedCumulativeNeed).toLocaleString()}（每日基礎配額 $${Math.round(dailyLimit).toLocaleString()}/天）。在此筆消費前，您僅使用了 $${Math.round(spentNeedSoFar).toLocaleString()}，因此此筆 $${amount.toLocaleString()} 完全落在時間進度的安全水位內！`;
          catAdvice = `🟢 目前此分類的消費節奏穩健、控制得宜，完全符合日常生活預算的標準步調！`;
        } else if (needAmt > 0) {
          catStatusType = 'partial';
          catExplanation = `截至第 ${dayOfMonth} 天，該分類累積可用額度為 $${Math.round(maxAllowedCumulativeNeed).toLocaleString()}，扣除先前已使用的 $${Math.round(spentNeedSoFar).toLocaleString()} 後，當前僅剩餘 $${Math.round(availableNeed).toLocaleString()} 的必要額度空間。因此此筆 $${amount.toLocaleString()} 中，前 $${Math.round(needAmt).toLocaleString()} 順利認列為必要，超出的 $${Math.round(wantAmt).toLocaleString()} 標記為超前選擇性支出。`;
          catAdvice = `💡【是不是潛在必要？】：是的！若這是一次性採買（如好市多買一週食材或生活用品），只要接下來幾天適度節制，隨著每天增加 $${Math.round(dailyLimit).toLocaleString()} 的累積額度，在整月結算時本質上仍屬於正常必要開銷。`;
        } else {
          catStatusType = 'full_want';
          catExplanation = `截至第 ${dayOfMonth} 天，該分類累計可用的必要額度已全數用盡（截至當天累計上限 $${Math.round(maxAllowedCumulativeNeed).toLocaleString()}，先前已認列 $${Math.round(spentNeedSoFar).toLocaleString()}）。因此此筆 $${amount.toLocaleString()} 全部被判定為超出當前時間進度的超前選擇性支出。`;
          catAdvice = `⚠️【代表什麼意義？】：代表該分類目前的花費速度明顯快於時間推移。建議在接下來的日子放慢開銷，等待後續日子的每日配額自然滾動回補！`;
        }
        
        monthlySpentNeed[key] = spentNeedSoFar + needAmt;
        itemNeedTotal += needAmt;
      }
      
      categoryBreakdown.push({
        category,
        amount,
        isFixed,
        monthlyBudget,
        dailyLimit: Math.round(dailyLimit),
        dayOfMonth,
        totalDays,
        maxAllowedCumulativeNeed: Math.round(maxAllowedCumulativeNeed),
        spentNeedSoFar: Math.round(spentNeedSoFar),
        availableNeed: Math.max(0, Math.round(maxAllowedCumulativeNeed - spentNeedSoFar)),
        needAmt: Math.round(needAmt),
        wantAmt: Math.round(wantAmt),
        isPotentialNeed: wantAmt > 0 && monthlyBudget > 0 && !isFixed,
        statusType: catStatusType,
        explanation: catExplanation,
        advice: catAdvice
      });
    });
    
    const roundedNeed = Math.min(r.total || 0, Math.max(0, Math.round(itemNeedTotal)));
    const roundedWant = Math.max(0, (r.total || 0) - roundedNeed);
    
    // Determine overall summary status badge
    let overallStatusType = 'full_need';
    let overallBadge = { label: '進度內穩健消費（100% 必要）', color: '#30d158', bg: 'rgba(52,199,89,0.12)', border: 'rgba(52,199,89,0.3)', icon: '🟢' };
    
    if (categoryBreakdown.some(c => c.statusType === 'no_budget')) {
      if (roundedNeed === 0) {
        overallStatusType = 'no_budget';
        overallBadge = { label: '未配置分類預算', color: '#8e8e93', bg: 'rgba(142,142,147,0.12)', border: 'rgba(142,142,147,0.3)', icon: '⚪' };
      } else {
        overallStatusType = 'partial';
        overallBadge = { label: '跨越進度上限（含潛在必要）', color: '#ff9f0a', bg: 'rgba(255,159,10,0.12)', border: 'rgba(255,159,10,0.3)', icon: '🟡' };
      }
    } else if (categoryBreakdown.every(c => c.statusType === 'fixed_need')) {
      overallStatusType = 'fixed_need';
      overallBadge = { label: '固定開銷（全月預算核銷）', color: '#30d158', bg: 'rgba(52,199,89,0.12)', border: 'rgba(52,199,89,0.3)', icon: '🏢' };
    } else if (roundedNeed === 0 && roundedWant > 0) {
      overallStatusType = 'full_want';
      overallBadge = { label: '進度超前消費（100% 選擇性）', color: '#ff2d55', bg: 'rgba(255,45,85,0.12)', border: 'rgba(255,45,85,0.3)', icon: '🔴' };
    } else if (roundedWant > 0 && roundedNeed > 0) {
      overallStatusType = 'partial';
      overallBadge = { label: '跨越進度上限（含潛在必要）', color: '#ff9f0a', bg: 'rgba(255,159,10,0.12)', border: 'rgba(255,159,10,0.3)', icon: '🟡' };
    }
    
    const summaryExplanation = categoryBreakdown.map(c => c.explanation).join('\n\n');
    const summaryAdvice = categoryBreakdown.map(c => c.advice).filter(Boolean).join('\n\n');
    
    results[r.originalIndex] = {
      needAmount: roundedNeed,
      wantAmount: roundedWant,
      total: r.total || 0,
      date: r.date || '',
      dayOfMonth,
      totalDays,
      month: m,
      statusType: overallStatusType,
      statusBadge: overallBadge,
      summaryExplanation,
      summaryAdvice,
      categoryBreakdown
    };
  });
  
  return results;
};
