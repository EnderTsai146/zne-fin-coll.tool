// src/components/MarkdownQuickEntry.jsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import IOSAccountMenuPicker from './IOSAccountMenuPicker';

/**
 * 智慧 Markdown 記帳解析器
 * 支援單筆或多筆（以 --- 分隔）
 * 支援格式：
 * 500 晚餐 @共同 #Cube卡
 * - 220 牛肉拉麵
 * - 280 螃蟹拉麵
 */
export function parseMarkdownExpenses(text, accounts = [], defaultUserKey = 'userB', categories = ['餐費', '購物', '娛樂', '交通', '固定費用', '其他']) {
  if (!text || !text.trim()) return [];

  // 支援以 --- 分隔的多筆記帳
  const rawBlocks = text.split(/\n\s*---\s*\n/).map(b => b.trim()).filter(Boolean);
  if (rawBlocks.length === 0) return [];

  return rawBlocks.map(block => parseSingleBlock(block, accounts, defaultUserKey, categories)).filter(Boolean);
}

function parseSingleBlock(text, accounts, defaultUserKey, categories) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const itemLines = [];
  const metaLines = [];

  for (const line of lines) {
    if (/^[-*•·+]/.test(line)) {
      itemLines.push(line.replace(/^[-*•·+]\s*/, '').trim());
    } else {
      metaLines.push(line);
    }
  }

  // 1. 解析小票分項明細 (Itemized Breakdown)
  const items = [];
  for (const raw of itemLines) {
    const normalized = raw.replace(/－/g, '-');
    const matchAmtLast = normalized.match(/^(.*?)\s*[$￥]?\s*(-?\s*[$￥]?\s*\d+(?:\.\d+)?)$/);
    const matchAmtFirst = normalized.match(/^[$￥]?\s*(-?\s*[$￥]?\s*\d+(?:\.\d+)?)\s*[$￥]?\s*(.*)$/);

    let name = '';
    let amt = null;

    if (matchAmtLast && matchAmtLast[2] && matchAmtLast[1].trim()) {
      name = matchAmtLast[1].trim();
      amt = Number(matchAmtLast[2].replace(/[^\d.-]/g, ''));
    } else if (matchAmtFirst && matchAmtFirst[1] && matchAmtFirst[2].trim()) {
      name = matchAmtFirst[2].trim();
      amt = Number(matchAmtFirst[1].replace(/[^\d.-]/g, ''));
    } else {
      const numStr = normalized.replace(/[^\d.-]/g, '');
      if (numStr && !isNaN(Number(numStr))) {
        amt = Number(numStr);
        name = `項目 #${items.length + 1}`;
      }
    }

    if (amt !== null && !isNaN(amt)) {
      items.push({
        id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        name: name || `項目 #${items.length + 1}`,
        amount: amt
      });
    }
  }

  const itemsTotal = items.reduce((s, i) => s + i.amount, 0);

  // 2. 解析主行 Meta 資訊 (日期、歸屬、帳戶、金額、類別、備註)
  const metaText = metaLines.join(' ');
  const cleanMeta = metaText.replace(/＠/g, '@').replace(/＃/g, '#').replace(/([^\s])([@#])/g, '$1 $2');
  const tokens = cleanMeta.split(/\s+/).filter(Boolean);

  let date = new Date().toISOString().split('T')[0];
  let owner = 'joint'; // 預設共同記帳
  let accountId = '';
  let category = '';
  let explicitAmount = null;
  const noteParts = [];

  for (const token of tokens) {
    // A. 日期辨識
    if (token === '@今日' || token === '@今天' || token === '今日' || token === '今天') {
      date = new Date().toISOString().split('T')[0];
    } else if (token === '@昨日' || token === '@昨天' || token === '昨日' || token === '昨天') {
      const d = new Date(); d.setDate(d.getDate() - 1);
      date = d.toISOString().split('T')[0];
    } else if (token === '@前天' || token === '前天') {
      const d = new Date(); d.setDate(d.getDate() - 2);
      date = d.toISOString().split('T')[0];
    } else if (token.match(/^@?\d{4}[-/]\d{1,2}[-/]\d{1,2}$/)) {
      const cleanDate = token.replace(/^@/, '').replace(/\//g, '-');
      const parts = cleanDate.split('-');
      date = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    } else if (token.match(/^@?\d{1,2}[-/]\d{1,2}$/)) {
      const cleanDate = token.replace(/^@/, '');
      const parts = cleanDate.split(/[-/]/);
      const y = new Date().getFullYear();
      date = `${y}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    }
    // B. 歸屬辨識 (@共同 / @阿陞 / @小得)
    else if (token === '@共同' || token === '@公費' || token === '共同' || token === '公費') {
      owner = 'joint';
    } else if (token === '@阿陞' || token === '@陞' || token === '阿陞' || token === '阿升') {
      owner = 'userB';
    } else if (token === '@小得' || token === '@得' || token === '@大狗狗' || token === '小得' || token === '大狗狗') {
      owner = 'userA';
    }
    // C. 帳戶辨識 (#帳戶名稱)
    else if (token.startsWith('#')) {
      const accQuery = token.substring(1).toLowerCase().replace(/[\s_]/g, '');
      const matched = accounts.find(a => {
        const anick = (a.nickname || '').toLowerCase().replace(/[\s_]/g, '');
        const aname = (a.name || '').toLowerCase().replace(/[\s_]/g, '');
        return anick === accQuery || aname === accQuery;
      }) || accounts.find(a => {
        const anick = (a.nickname || '').toLowerCase().replace(/[\s_]/g, '');
        const aname = (a.name || '').toLowerCase().replace(/[\s_]/g, '');
        return anick.includes(accQuery) || accQuery.includes(anick) || aname.includes(accQuery) || accQuery.includes(aname);
      });
      if (matched) accountId = matched.id;
    }
    // D. 金額辨識
    else if (token.match(/^[$￥]?\d+(?:\.\d+)?(?:元)?$/)) {
      const num = Number(token.replace(/[^\d.]/g, ''));
      if (!isNaN(num) && num > 0) explicitAmount = num;
    }
    // E. 類別或備註
    else {
      const matchedCat = categories.find(c => c.toLowerCase() === token.toLowerCase());
      if (matchedCat && !category) {
        category = matchedCat;
      } else {
        noteParts.push(token);
      }
    }
  }

  // 3. 自動推論類別 (Keyword Match)
  const rawNote = noteParts.join(' ');
  if (!category) {
    if (/晚餐|午餐|早餐|拉麵|飯|麵|咖啡|飲料|吃|喝|麥當勞|牛肉|螃蟹|火鍋|菜|便當|壽司/.test(rawNote)) {
      category = '餐費';
    } else if (/高鐵|捷運|公車|Uber|計程車|車票|油錢|停車|悠遊卡/.test(rawNote)) {
      category = '交通';
    } else if (/買|全聯|家樂福|蝦皮|衣服|超商|7-11|全家|康是美|屈臣氏/.test(rawNote)) {
      category = '購物';
    } else if (/電影|遊戲|門票|展覽|唱歌|KTV|旅遊|旅館|門票/.test(rawNote)) {
      category = '娛樂';
    } else if (/水費|電費|房租|瓦斯|電話費|網路費|管理費/.test(rawNote)) {
      category = '固定費用';
    } else {
      category = categories[0] || '餐費';
    }
  }

  // 4. 自動綁定預設帳戶
  if (!accountId) {
    const accForOwner = accounts.find(a => a.owner === owner && (a.isDefaultExpense || a.isDefault)) ||
      accounts.find(a => a.owner === owner) ||
      accounts[0];
    if (accForOwner) accountId = accForOwner.id;
  }

  const finalAmount = explicitAmount !== null ? explicitAmount : (itemsTotal > 0 ? itemsTotal : 0);
  const matchedAcc = accounts.find(a => a.id === accountId);

  return {
    date,
    owner,
    accountId,
    accountNickname: matchedAcc ? (matchedAcc.nickname || matchedAcc.name) : '',
    accountType: matchedAcc ? matchedAcc.type : 'cash',
    cat: category,
    amount: finalAmount,
    explicitAmount,
    note: rawNote || category,
    items,
    itemsTotal
  };
}

const MarkdownQuickEntry = ({
  assets = {},
  accounts = [],
  currentUser,
  operatorName,
  userKey = 'userB',
  expenseCategories = ['餐費', '購物', '娛樂', '交通', '固定費用', '其他'],
  onTransaction,
  setPendingSubmitConfig,
  customAlert,
  customConfirm,
  onSwitchToClassic,
  getBudgetProgressText
}) => {
  const [markdownText, setMarkdownText] = useState('');
  const textareaRef = useRef(null);
  const mentionMenuRef = useRef(null);

  // 💡 Mention 索引選單狀態 (@對象/日期 或 #帳戶)
  const [activeMention, setActiveMention] = useState(null); // { symbol: '@' | '#', query: '', startIndex: number, endIndex: number }
  const [selectedIndex, setSelectedIndex] = useState(0);

  // 每次載入或點開即自動聚焦輸入框彈出鍵盤
  useEffect(() => {
    const timer = setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  // 當 Mention 選單喚醒時，平滑滾動至可視區域
  useEffect(() => {
    if (activeMention && mentionMenuRef.current) {
      try {
        mentionMenuRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (_) {}
    }
  }, [activeMention]);

  // 偵測游標前是否正在輸入 @ 或 # (支援半形/全形 ＠ ＃，無須前綴空格，相容繁中注音輸入)
  const detectMention = (text, cursor) => {
    if (cursor === undefined || cursor === null || cursor < 0) return null;
    const textBeforeCursor = text.substring(0, cursor);
    
    // 支援半形 @ # 與全形 ＠ ＃
    const match = textBeforeCursor.match(/([@#＠＃])([^\s\n@#＠＃]*)$/);
    if (!match) return null;

    const rawSymbol = match[1];
    const query = match[2];
    const startIndex = cursor - query.length - 1;

    // 排除 email (如 test@gmail.com 不觸發 @)
    if ((rawSymbol === '@' || rawSymbol === '＠') && startIndex > 0) {
      const prevChar = textBeforeCursor[startIndex - 1];
      if (/[a-zA-Z0-9]/.test(prevChar)) return null;
    }

    const symbol = (rawSymbol === '＠') ? '@' : ((rawSymbol === '＃') ? '#' : rawSymbol);
    return { symbol, rawSymbol, query, startIndex, endIndex: cursor };
  };

  // 文字變更處理
  const handleTextChange = (e) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart;
    setMarkdownText(val);
    const m = detectMention(val, cursor);
    setActiveMention(m);
    setSelectedIndex(0);
  };

  // 游標移動或點擊時更新 Mention 狀態 (直接讀取 DOM 最新值，避免 React 狀態競爭覆蓋)
  const handleSelectOrClick = () => {
    if (!textareaRef.current) return;
    const val = textareaRef.current.value;
    const cursor = textareaRef.current.selectionStart;
    const m = detectMention(val, cursor);
    setActiveMention(m);
    setSelectedIndex(0);
  };

  // 解析 Markdown
  const parsedRecords = useMemo(() => {
    return parseMarkdownExpenses(markdownText, accounts, userKey, expenseCategories);
  }, [markdownText, accounts, userKey, expenseCategories]);

  const activeRecord = parsedRecords[0] || null;
  const isMultiple = parsedRecords.length > 1;

  // Mention 選項清單 (實時依 query 模糊篩選)
  const mentionOptions = useMemo(() => {
    if (!activeMention) return [];
    const q = (activeMention.query || '').toLowerCase();

    if (activeMention.symbol === '@') {
      const allAt = [
        { label: '@共同', value: '@共同', desc: '🏫 共同公費分攤 (50/50)', icon: '🏫', keywords: '共同 公費 joint 50/50' },
        { label: '@阿陞', value: '@阿陞', desc: '🐶 阿陞個人支出', icon: '🐶', keywords: '阿陞 阿升 陞 userb' },
        { label: '@小得', value: '@小得', desc: '🐕 大狗狗 / 小得個人支出', icon: '🐕', keywords: '小得 大狗狗 得 狗 usera' },
        { label: '@今日', value: '@今日', desc: '📅 今日消費 (預設)', icon: '📅', keywords: '今日 今天 today' },
        { label: '@昨日', value: '@昨日', desc: '📅 昨天消費', icon: '📅', keywords: '昨日 昨天 yesterday' },
        { label: '@前天', value: '@前天', desc: '📅 前天消費', icon: '📅', keywords: '前天 beforeyesterday' },
      ];
      if (!q) return allAt;
      return allAt.filter(item =>
        item.label.toLowerCase().includes(q) ||
        item.desc.toLowerCase().includes(q) ||
        (item.keywords && item.keywords.toLowerCase().includes(q))
      );
    }

    if (activeMention.symbol === '#') {
      const allHash = accounts.map(acc => {
        const nick = acc.nickname || acc.name;
        const cleanTag = nick.replace(/\s+/g, '');
        const icon = acc.icon || (acc.type === 'credit' ? '💳' : (acc.type === 'cash' ? '💵' : '🏦'));
        const typeLabel = acc.type === 'credit' ? '信用卡' : (acc.type === 'cash' ? '現金' : '活儲');
        const ownerLabel = acc.owner === 'joint' ? '共同' : (acc.owner === 'userA' ? '小得' : '阿陞');
        const balText = `$${(Number(acc.balance) || 0).toLocaleString()} ${acc.currency}`;
        return {
          label: `#${nick}`,
          value: `#${cleanTag}`,
          desc: `${ownerLabel} · ${typeLabel} · 餘額 ${balText}`,
          icon: icon,
          account: acc,
          searchStr: `${nick} ${acc.name || ''} ${cleanTag} ${ownerLabel} ${typeLabel} ${acc.currency}`.toLowerCase()
        };
      });
      if (!q) return allHash;
      return allHash.filter(item => item.searchStr.includes(q));
    }

    return [];
  }, [activeMention, accounts]);

  // 套用 Mention 選項到輸入框
  const applyMentionOption = (option) => {
    if (!textareaRef.current || !activeMention) return;
    const el = textareaRef.current;
    const val = el.value;
    const before = val.substring(0, activeMention.startIndex);
    const after = val.substring(activeMention.endIndex);
    
    // 若前面有字元且非空白/換行，自動補上前置空格
    const needLeadingSpace = before.length > 0 && !/[\s\n]/.test(before.slice(-1));
    const leadingSpace = needLeadingSpace ? ' ' : '';
    // 檢查後面是否已經有空白
    const trailingSpace = after.startsWith(' ') ? '' : ' ';
    const inserted = leadingSpace + option.value + trailingSpace;
    const nextVal = before + inserted + after;
    setMarkdownText(nextVal);
    setActiveMention(null);
    setTimeout(() => {
      el.focus();
      const newPos = before.length + inserted.length;
      el.setSelectionRange(newPos, newPos);
    }, 20);
  };

  // 插入標籤文字輔助函式 (點擊下方 chips)
  const insertText = (str) => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const val = el.value;
    const newVal = val.substring(0, start) + str + val.substring(end);
    setMarkdownText(newVal);
    setTimeout(() => {
      el.focus();
      const newPos = start + str.length;
      el.setSelectionRange(newPos, newPos);
      const m = detectMention(newVal, newPos);
      setActiveMention(m);
    }, 20);
  };

  // 執行送出
  const handleSubmit = async () => {
    if (!markdownText.trim()) {
      await customAlert("請先在便籤框內輸入記帳內容！", "提示");
      textareaRef.current?.focus();
      return;
    }

    if (parsedRecords.length === 0) {
      await customAlert("無法辨識輸入內容，請至少輸入金額或明細項目！", "格式提示");
      return;
    }

    // 檢查是否有未完成輸入（如只有金額無扣款帳戶）
    for (const rec of parsedRecords) {
      if (!rec.amount || rec.amount <= 0) {
        await customAlert("⚠️ 偵測到有項目金額為 0 或尚未解析出金額，請確認明細或主行金額！", "金額確認");
        return;
      }
      if (!rec.accountId) {
        await customAlert("⚠️ 請指定或選擇扣款帳戶！", "扣款帳戶未指定");
        return;
      }
      const acc = accounts.find(a => a.id === rec.accountId);
      if (acc && acc.type !== 'credit' && acc.balance < rec.amount) {
        await customAlert(`⚠️ 帳戶【${acc.nickname || acc.name}】餘額不足！ (目前餘額: $${acc.balance.toLocaleString()})`);
        return;
      }
    }

    // 構建批次或單筆資料
    let updatedAccounts = [...accounts];
    const accountChangesMap = {};

    parsedRecords.forEach(rec => {
      const acc = updatedAccounts.find(a => a.id === rec.accountId);
      if (acc) {
        if (!accountChangesMap[acc.id]) {
          accountChangesMap[acc.id] = {
            id: acc.id,
            nickname: acc.nickname || acc.name,
            oldBal: acc.balance,
            diff: 0
          };
        }
        accountChangesMap[acc.id].diff -= rec.amount;
        updatedAccounts = updatedAccounts.map(a => {
          if (a.id === rec.accountId) return { ...a, balance: a.balance - rec.amount };
          return a;
        });
      }
    });

    const accountChanges = Object.values(accountChangesMap).map(ac => ({
      ...ac,
      newBal: ac.oldBal + ac.diff
    }));

    const isBatch = parsedRecords.length > 1;
    const batchId = isBatch ? `batch_${Date.now()}_${Math.random().toString(36).substr(2, 5)}` : undefined;
    const batchTotal = isBatch ? parsedRecords.reduce((s, i) => s + i.amount, 0) : undefined;
    const batchItems = isBatch ? parsedRecords.map(i => ({
      cat: i.cat,
      amount: i.amount,
      note: i.note,
      accountNickname: i.accountNickname,
      itemizedBreakdown: i.items.length > 0 ? i.items : undefined
    })) : undefined;

    const historyRecords = parsedRecords.map((item, idx) => {
      const sampleAcc = accounts.find(a => a.id === item.accountId);
      const isJoint = item.owner === 'joint';
      const payerName = isJoint ? '共同帳戶' : (item.owner === 'userA' ? '大狗狗🐕' : '阿陞🐶');
      const advancedBy = isJoint ? (sampleAcc?.owner === 'joint' ? null : sampleAcc?.owner) : null;

      if (isJoint) {
        return {
          id: `spend_${Date.now()}_${idx}`,
          date: item.date,
          month: item.date.slice(0, 7),
          type: 'spend',
          category: '共同支出',
          total: item.amount,
          payer: '共同帳戶',
          accountId: item.accountId,
          note: item.note ? `${item.cat} - ${item.note}` : item.cat,
          advancedBy: advancedBy === 'jointCash' ? null : advancedBy,
          isSettled: false,
          necessity: 'need',
          subCategory: item.cat,
          itemizedBreakdown: item.items.length > 0 ? item.items : undefined,
          batchId,
          batchCount: isBatch ? parsedRecords.length : undefined,
          batchIndex: isBatch ? (idx + 1) : undefined,
          batchTotal,
          batchItems
        };
      } else {
        const details = { food: 0, shopping: 0, entertainment: 0, other: 0, fixed: 0 };
        if (item.cat === '餐費') details.food = item.amount;
        else if (item.cat === '購物') details.shopping = item.amount;
        else if (item.cat === '娛樂') details.entertainment = item.amount;
        else if (item.cat === '固定費用') details.fixed = item.amount;
        else details.other = item.amount;

        return {
          id: `exp_${Date.now()}_${idx}`,
          date: item.date,
          month: item.date.slice(0, 7),
          type: 'expense',
          category: '個人支出',
          details,
          total: item.amount,
          payer: payerName,
          accountId: item.accountId,
          note: item.note || item.cat,
          subCategory: item.cat,
          necessity: 'need',
          itemizedBreakdown: item.items.length > 0 ? item.items : undefined,
          batchId,
          batchCount: isBatch ? parsedRecords.length : undefined,
          batchIndex: isBatch ? (idx + 1) : undefined,
          batchTotal,
          batchItems
        };
      }
    });

    const finalAssets = { ...(assets || {}), accounts: updatedAccounts };

    // 呼叫統一的確認視窗 (Pending Submit Modal)
    setPendingSubmitConfig({
      typeTitle: isBatch ? `⚡ Markdown 批次記帳送出確認 (共 ${parsedRecords.length} 筆)` : `⚡ Markdown 記帳送出確認 (${activeRecord.owner === 'joint' ? '共同支出' : (activeRecord.owner === 'userA' ? '小得' : '阿陞')})`,
      operator: operatorName || currentUser || "系統",
      txDate: parsedRecords[0].date,
      items: parsedRecords.map(r => ({
        cat: r.cat,
        amount: r.amount,
        note: r.note,
        accountId: r.accountId,
        accountNickname: r.accountNickname,
        itemizedBreakdown: r.items.length > 0 ? r.items : undefined
      })),
      accountChanges,
      onConfirm: () => {
        onTransaction(finalAssets, historyRecords);
        setMarkdownText('');
        setTimeout(() => textareaRef.current?.focus(), 100);
      }
    });
  };

  // 鍵盤快捷鍵處理 (含 Mention 選單上下導覽與 Enter 送出)
  const handleKeyDown = (e) => {
    // 若 Mention 選單正在顯示且有候選項
    if (activeMention && mentionOptions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => (i + 1) % mentionOptions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => (i - 1 + mentionOptions.length) % mentionOptions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applyMentionOption(mentionOptions[selectedIndex] || mentionOptions[0]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setActiveMention(null);
        return;
      }
    }

    // 鍵盤快速送出記帳 (⌘ + Enter 或 Ctrl + Enter)
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="slide-in" style={{ padding: '0 4px' }}>
      
      {/* 頂部模式切換與引導 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '1.05rem', fontWeight: '850', color: '#fff' }}>⚡ Markdown 便籤速記</span>
          <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(10, 132, 255, 0.2)', color: '#0a84ff', border: '0.5px solid rgba(10, 132, 255, 0.3)' }}>
            輸入 @ 或 # 喚醒選單
          </span>
        </div>
        <button
          type="button"
          onClick={onSwitchToClassic}
          style={{
            background: 'rgba(255, 255, 255, 0.06)',
            border: '0.5px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '16px',
            color: 'var(--text-secondary)',
            fontSize: '0.74rem',
            padding: '4px 12px',
            cursor: 'pointer'
          }}
        >
          切換回傳統表單 📋
        </button>
      </div>

      {/* 便籤核心編輯區 */}
      <div
        style={{
          background: 'rgba(28, 28, 30, 0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '18px',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)',
          padding: '16px',
          marginBottom: '16px',
          position: 'relative'
        }}
      >
        {/* 多行輸入框 */}
        <textarea
          ref={textareaRef}
          value={markdownText}
          onChange={handleTextChange}
          onSelect={handleSelectOrClick}
          onClick={handleSelectOrClick}
          onKeyUp={handleSelectOrClick}
          onKeyDown={handleKeyDown}
          placeholder="💡 輸入格式範例：&#10;500 晚餐 @共同 #Cube卡&#10;- 220 牛肉拉麵&#10;- 280 螃蟹拉麵&#10;&#10;（打 @ 喚醒對象與日期，打 # 喚醒扣款帳戶選單）"
          style={{
            width: '100%',
            minHeight: '100px',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#fff',
            fontSize: '1rem',
            lineHeight: '1.6',
            fontFamily: 'SF Pro Text, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace',
            resize: 'vertical',
            padding: 0,
            margin: 0
          }}
        />

        {/* 🌟 實時動態索引選單 (Mention Autocomplete Dropdown) */}
        {activeMention && mentionOptions.length > 0 && (
          <div
            ref={mentionMenuRef}
            style={{
              marginTop: '12px',
              marginBottom: '12px',
              background: 'rgba(20, 20, 26, 0.98)',
              backdropFilter: 'blur(30px)',
              WebkitBackdropFilter: 'blur(30px)',
              border: '2px solid #0a84ff',
              borderRadius: '16px',
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.8), 0 0 24px rgba(10, 132, 255, 0.4)',
              overflow: 'hidden',
              position: 'relative',
              zIndex: 50
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 12px',
              background: 'rgba(10, 132, 255, 0.15)',
              borderBottom: '1px solid rgba(10, 132, 255, 0.2)',
              fontSize: '0.72rem',
              fontWeight: '800',
              color: '#64d2ff'
            }}>
              <span>
                {activeMention.symbol === '@' ? '👥 選擇對象或日期標籤' : '💳 選擇扣款帳戶標籤'}
                {activeMention.query && <span style={{ opacity: 0.8, marginLeft: '4px' }}>(搜尋: {activeMention.query})</span>}
              </span>
              <span style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.45)' }}>
                ↑↓ 選擇 · Enter 確認 · Esc 關閉
              </span>
            </div>

            {/* List */}
            <div style={{ maxHeight: '210px', overflowY: 'auto' }}>
              {mentionOptions.map((opt, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <div
                    key={idx}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      applyMentionOption(opt);
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyMentionOption(opt);
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '9px 12px',
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(10, 132, 255, 0.28)' : 'transparent',
                      borderLeft: isSelected ? '3px solid #0a84ff' : '3px solid transparent',
                      transition: 'background 0.08s ease',
                      borderBottom: idx < mentionOptions.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.15rem' }}>{opt.icon}</span>
                      <span style={{ fontSize: '0.88rem', fontWeight: '800', color: isSelected ? '#fff' : 'rgba(255,255,255,0.9)' }}>
                        {opt.label}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: isSelected ? '#a8d5ff' : 'rgba(255,255,255,0.5)', textAlign: 'right' }}>
                      {opt.desc}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 快捷點擊輸入輔助標籤 (Tap-to-insert chips) */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '12px', paddingTop: '10px', borderTop: '0.5px solid rgba(255, 255, 255, 0.08)' }}>
          <span style={{ fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.4)', alignSelf: 'center', marginRight: '2px' }}>快捷插入:</span>
          <button type="button" onClick={() => insertText(' @共同')} style={chipBtnStyle}>@共同</button>
          <button type="button" onClick={() => insertText(' @阿陞')} style={chipBtnStyle}>@阿陞</button>
          <button type="button" onClick={() => insertText(' @小得')} style={chipBtnStyle}>@小得</button>
          <button type="button" onClick={() => insertText('\n- ')} style={chipBtnStyle}>- 小票</button>
          <button type="button" onClick={() => insertText('\n---\n')} style={chipBtnStyle}>--- 分隔</button>
          {accounts.slice(0, 4).map(acc => (
            <button key={acc.id} type="button" onClick={() => insertText(` #${acc.nickname || acc.name}`)} style={chipBtnStyle}>
              #{acc.nickname || acc.name}
            </button>
          ))}
        </div>
      </div>

      {/* 靈動即時解析預覽卡片 (Live Dynamic Island Preview) */}
      {parsedRecords.length > 0 && (
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '14px',
            marginBottom: '16px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', fontWeight: '600' }}>
              🔍 即時辨識預覽 {isMultiple ? `(共 ${parsedRecords.length} 筆)` : ''}
            </span>
            <span style={{ fontSize: '0.72rem', color: '#0a84ff' }}>
              按 ⌘+Enter 快速確認
            </span>
          </div>

          {parsedRecords.map((rec, idx) => (
            <div
              key={idx}
              style={{
                background: 'rgba(0, 0, 0, 0.25)',
                borderRadius: '12px',
                padding: '12px',
                marginBottom: idx < parsedRecords.length - 1 ? '10px' : 0,
                border: '0.5px solid rgba(255, 255, 255, 0.06)'
              }}
            >
              {/* 膠囊屬性列 */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                <span style={pillStyle('#0a84ff')}>📅 {rec.date}</span>
                <span style={pillStyle(rec.owner === 'joint' ? '#30d158' : '#bf5af2')}>
                  👥 {rec.owner === 'joint' ? '共同支出' : (rec.owner === 'userA' ? '小得' : '阿陞')}
                </span>
                <span style={pillStyle('#ff9f0a')}>🏷️ {rec.cat}</span>
                <span style={pillStyle('#64d2ff')}>💳 {rec.accountNickname || '未選擇帳戶'}</span>
              </div>

              {/* 摘要與金額 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: '800', color: '#fff' }}>
                    {rec.note || rec.cat}
                  </div>
                  {rec.items.length > 0 && (
                    <div style={{ fontSize: '0.74rem', color: 'rgba(255, 255, 255, 0.5)', marginTop: '2px' }}>
                      🧾 內含 {rec.items.length} 項小票明細 (合計: ${rec.itemsTotal.toLocaleString()})
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#30d158', letterSpacing: '-0.5px' }}>
                    ${rec.amount.toLocaleString()}
                  </div>
                  {rec.explicitAmount && rec.itemsTotal > 0 && rec.explicitAmount !== rec.itemsTotal && (
                    <div style={{ fontSize: '0.68rem', color: '#ffd60a' }}>
                      ⚠️ 主行 ${rec.explicitAmount} / 小票 ${rec.itemsTotal}
                    </div>
                  )}
                </div>
              </div>

              {/* 小票分項明細列表 */}
              {rec.items.length > 0 && (
                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '0.5px dashed rgba(255, 255, 255, 0.1)' }}>
                  {rec.items.map((it, iIdx) => (
                    <div key={iIdx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'rgba(255, 255, 255, 0.75)', padding: '2px 0' }}>
                      <span>• {it.name}</span>
                      <span>${it.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 操作按鈕 */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
        <button
          type="button"
          onClick={() => setMarkdownText('')}
          style={{
            flex: 1,
            padding: '14px',
            borderRadius: '14px',
            background: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            color: 'var(--text-secondary)',
            fontWeight: '600',
            fontSize: '0.88rem',
            cursor: 'pointer'
          }}
        >
          清空
        </button>

        <button
          type="button"
          onClick={handleSubmit}
          style={{
            flex: 3,
            padding: '14px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, #0a84ff 0%, #0051a8 100%)',
            border: 'none',
            color: '#fff',
            fontWeight: '800',
            fontSize: '1rem',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(10, 132, 255, 0.4)'
          }}
        >
          <span>⚡ 確認並記錄支出</span>
          <span style={{ fontSize: '0.76rem', opacity: 0.8 }}>(⌘+Enter)</span>
        </button>
      </div>

    </div>
  );
};

// 內部樣式輔助
const chipBtnStyle = {
  background: 'rgba(255, 255, 255, 0.08)',
  border: '0.5px solid rgba(255, 255, 255, 0.15)',
  borderRadius: '12px',
  color: 'rgba(255, 255, 255, 0.8)',
  fontSize: '0.72rem',
  padding: '3px 8px',
  cursor: 'pointer'
};

const pillStyle = (color) => ({
  background: `${color}18`,
  border: `0.5px solid ${color}44`,
  borderRadius: '8px',
  color: color,
  fontSize: '0.7rem',
  fontWeight: '700',
  padding: '2px 8px'
});

export default MarkdownQuickEntry;
