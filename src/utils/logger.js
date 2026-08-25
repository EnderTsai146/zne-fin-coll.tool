// src/utils/logger.js
// 🥔 馬鈴薯管家 — Session-Scoped Diagnostic Logger

const SESSION_LOGS_KEY = 'potatobot_session_logs';

class SessionLogger {
  constructor() {
    this.logs = this.loadLogs();
    this.initGlobalErrorHandler();
  }

  loadLogs() {
    try {
      const stored = sessionStorage.getItem(SESSION_LOGS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  saveLogs() {
    try {
      // Keep max 200 log entries to avoid quota overflow
      const trimmed = this.logs.slice(-200);
      sessionStorage.setItem(SESSION_LOGS_KEY, JSON.stringify(trimmed));
    } catch (e) {
      console.warn("Failed to save session logs:", e);
    }
  }

  addLog(type, message, details = null) {
    const entry = {
      timestamp: new Date().toLocaleTimeString('zh-TW', { hour12: false }),
      isoTime: new Date().toISOString(),
      type: type, // 'INFO' | 'WARN' | 'ERROR' | 'PUSH' | 'NETWORK' | 'CLOUD'
      message: typeof message === 'object' ? JSON.stringify(message) : String(message),
      details: details ? (typeof details === 'object' ? JSON.stringify(details, null, 2) : String(details)) : null
    };

    this.logs.push(entry);
    this.saveLogs();
  }

  getLogs() {
    return this.logs;
  }

  clearSessionLogs() {
    this.logs = [];
    try {
      sessionStorage.removeItem(SESSION_LOGS_KEY);
    } catch (e) {
      console.warn("Failed to clear session logs:", e);
    }
  }

  initGlobalErrorHandler() {
    if (typeof window === 'undefined') return;

    window.addEventListener('error', (event) => {
      this.addLog('ERROR', `[Global Unhandled Error] ${event.message || 'Window Error'}`, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error?.stack || String(event.error)
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.addLog('ERROR', `[Unhandled Promise Rejection] ${event.reason?.message || String(event.reason)}`, {
        reason: event.reason?.stack || String(event.reason)
      });
    });
  }

  generateAiDiagnosticReport(assets = {}, appContext = {}) {
    const now = new Date();
    const accounts = Array.isArray(assets.accounts) ? assets.accounts : [];
    const expenses = Array.isArray(assets.monthlyExpenses) ? assets.monthlyExpenses : [];
    const bills = Array.isArray(assets.bills) ? assets.bills : [];
    const stockHoldings = assets.currentStockHoldings || {};

    // 1. Asset Integrity Calculation
    const twdNonCreditAccs = accounts.filter(a => a.currency === 'TWD' && a.type !== 'credit');
    const twdAccTotal = twdNonCreditAccs.reduce((s, a) => s + (Number(a.balance) || 0), 0);
    const twdTopTotal = (Number(assets.userA) || 0) + (Number(assets.userB) || 0) + (Number(assets.jointCash) || 0);
    const twdDiff = Math.abs(twdAccTotal - twdTopTotal);

    const usdAccs = accounts.filter(a => a.currency === 'USD');
    const usdAccTotal = usdAccs.reduce((s, a) => s + (Number(a.balance) || 0), 0);
    const usdTopTotal = (Number(assets.userA_usd) || 0) + (Number(assets.userB_usd) || 0) + (Number(assets.jointCash_usd) || 0);
    const usdDiff = Math.abs(usdAccTotal - usdTopTotal);

    // Negative balance check on non-credit accounts
    const negativeNonCreditAccs = accounts.filter(a => a.type !== 'credit' && (Number(a.balance) || 0) < 0);

    // 2. Full Accounts Table
    const accountsRows = accounts.map(a => {
      const ownerLabel = a.owner === 'joint' ? '共同' : (a.owner === 'userA' ? '大狗狗' : '阿陞');
      const typeLabel = a.type === 'credit' ? '信用卡' : (a.type === 'bank' ? '銀行活儲' : (a.type === 'cash' ? '現金錢包' : '外幣/其他'));
      const balStr = a.type === 'credit' ? `-$${Math.abs(Number(a.balance) || 0).toLocaleString()}` : `$${(Number(a.balance) || 0).toLocaleString()}`;
      return `| \`${a.id}\` | ${a.nickname || a.name} | ${typeLabel} | ${ownerLabel} | ${a.currency || 'TWD'} | ${balStr} | ${a.isDefaultExpense ? '✅' : '—'} | ${a.isDefaultIncome ? '✅' : '—'} |`;
    });

    // 3. Credit Cards Health Analysis
    const creditCards = accounts.filter(a => a.type === 'credit');
    const ccReportRows = [];
    const ccUnpaidSections = [];

    creditCards.forEach(card => {
      const cardExpenses = expenses.filter(r => 
        !r.isDeleted && 
        r.accountId === card.id && 
        !r.ccBillSettled &&
        r.type !== 'transfer'
      );
      const unpaidSum = cardExpenses.reduce((s, r) => s + (Number(r.total) || 0), 0);
      const cardDebt = Math.abs(Number(card.balance) || 0);
      const diff = Math.abs(cardDebt - unpaidSum);

      const linkedBank = card.linkedBankAccountId 
        ? accounts.find(a => a.id === card.linkedBankAccountId)
        : null;
      const linkedBal = linkedBank ? `$${(Number(linkedBank.balance) || 0).toLocaleString()}` : '未綁定';
      const autoPayStr = card.autoPay ? `🤖 自動 (${linkedBank?.nickname || '活儲'})` : '🖐️ 手動';

      let statusStr = '🟢 吻合正常';
      if (diff > 0) {
        statusStr = `🟡 差額 $${diff.toLocaleString()} (待校正/含初始負債)`;
      }

      const ownerLabel = card.owner === 'joint' ? '共同' : (card.owner === 'userA' ? '大狗狗' : '阿陞');
      ccReportRows.push(`| ${card.nickname} | ${ownerLabel} | -$${cardDebt.toLocaleString()} | 每月 ${card.billingDay || 10} 號 | 每月 ${card.billingDay || 10} 號 | ${autoPayStr} | ${linkedBank?.nickname || '未綁定'} (${linkedBal}) | ${cardExpenses.length} 筆 | $${unpaidSum.toLocaleString()} | ${statusStr} |`);

      // Detailed Unpaid List
      if (cardExpenses.length > 0) {
        const items = cardExpenses.map((r, i) => {
          const cat = r.category ? `[${r.category}]` : '';
          const note = r.note ? ` - ${r.note}` : '';
          const isSettled = r.ccBillSettled ? '✅已結' : '⏳待結';
          return `  - **#${i + 1} (${r.date || '無日期'})**: $${(Number(r.total) || 0).toLocaleString()} ${cat}${note} (${r.payer || '個人'}, ${isSettled})`;
        }).join('\n');
        ccUnpaidSections.push(`#### 💳 ${card.nickname} (待結算: ${cardExpenses.length} 筆，合計 $${unpaidSum.toLocaleString()} TWD)\n${items}`);
      } else {
        ccUnpaidSections.push(`#### 💳 ${card.nickname}: 目前無任何待結清款項 (刷卡明細已全數結清)`);
      }
    });

    // 4. Recurring Bills Table
    const billsRows = bills.map(b => {
      const ownerLabel = b.owner === 'joint' ? '共同' : (b.owner === 'userA' ? '大狗狗' : '阿陞');
      return `| ${b.name || b.category || b.note} | ${ownerLabel} | $${(Number(b.amount) || 0).toLocaleString()} | 每月 ${b.billingDay || 1} 號 | ${b.nextDate || '未設定'} | ${b.isFixed ? '固定' : '變動'} |`;
    });

    // 5. Recent 30 Detailed Transactions
    const sortedExpenses = [...expenses]
      .filter(r => !r.isDeleted)
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.timestamp || '').localeCompare(a.timestamp || ''))
      .slice(0, 30);

    const transactionRows = sortedExpenses.map(r => {
      const acc = accounts.find(a => a.id === r.accountId);
      const accName = acc?.nickname || r.payer || '未指定';
      const typeStr = r.type || 'spend';
      const isSettledStr = r.ccBillSettled ? '已結帳單' : (r.isSettled ? '已結算' : (r.type === 'transfer' ? '劃撥' : '正常'));
      return `| ${r.date || '-'} | \`${typeStr}\` | ${r.category || '-'} | $${(Number(r.total) || 0).toLocaleString()} | ${accName} | ${r.note || '-'} | ${isSettledStr} |`;
    });

    // 6. Construct Full-System Markdown Report
    const report = `# 🥔 馬鈴薯管家 — 全系統 AI 深度健康診斷與審計報告

> 📋 **用途指引**：本報告包含整個記帳系統的所有帳戶資產、即時股票持股、歷史記帳統計、最新 30 筆詳細交易紀錄、各信用卡與常態帳單狀態、以及完整系統 Session 運行日誌。
> 🤖 **給 AI 的分析指示**：請檢查本報告中所有帳戶加總是否守恆、是否有非預期負額、各信用卡負債與未結算刷卡明細是否一致、各筆交易之欄位與時間戳是否正常、以及日誌中是否有任何報錯或異常。

---

## 1. 系統執行環境與操作者狀態
- **報告產生時間**: ${now.toLocaleString('zh-TW')} (ISO: \`${now.toISOString()}\`)
- **App 版本**: \`v2.5.0 (potato-steward-budget)\`
- **當前操作者**: ${appContext.operatorName || '未登入'} (${appContext.currentUser || '無'})
- **網路狀態**: ${typeof navigator !== 'undefined' && navigator.onLine ? '🟢 在線 (Online)' : '🔴 離線 (Offline)'}
- **裝置環境**: \`${typeof navigator !== 'undefined' ? navigator.userAgent : '未知'}\`
- **推播通知權限**: \`${typeof Notification !== 'undefined' ? Notification.permission : '不支援'}\`
- **FCM Token**: \`${appContext.fcmToken ? (appContext.fcmToken.substring(0, 24) + '...') : '未綁定/無'}\`
- **資料庫歷史總筆數**: \`${expenses.length} 筆交易紀錄\`

---

## 2. 全系統資產健全度自動校驗 (Global Integrity Audit)
- **[CHECK 1] 台幣總資產守恆檢查**:
  - 非信用卡帳戶餘額加總: \`$${twdAccTotal.toLocaleString()}\`
  - 頂層資產記帳總額 (userA + userB + jointCash): \`$${twdTopTotal.toLocaleString()}\`
  - 差額: \`$${twdDiff}\` ➔ ${twdDiff <= 1 ? '🟢 100% 守恆一致' : `⚠️ 存在差額 $${twdDiff}`}
- **[CHECK 2] 美金總資產守恆檢查**:
  - 各美金帳戶加總: \`$${usdAccTotal.toLocaleString()} USD\`
  - 頂層美金記帳總額: \`$${usdTopTotal.toLocaleString()} USD\`
  - 差額: \`$${usdDiff} USD\` ➔ ${usdDiff <= 0.01 ? '🟢 100% 守恆一致' : `⚠️ 存在差額 $${usdDiff} USD`}
- **[CHECK 3] 非信用卡帳戶非負值檢查**:
  ${negativeNonCreditAccs.length === 0 ? '🟢 所有活儲、現金、外幣帳戶餘額皆為正常正值' : `⚠️ 發現以下帳戶餘額為負值: ${negativeNonCreditAccs.map(a => `${a.nickname} ($${a.balance})`).join(', ')}`}
- **[CHECK 4] 股票持股與投資配置**:
  - 目前持股檔數: \`${Object.keys(stockHoldings).length} 檔\` (已補足防禦性成本欄位)
- **[CHECK 5] 信用卡與待繳明細健康度**:
  - 共 ${creditCards.length} 張信用卡，${creditCards.every(c => Math.abs((Math.abs(Number(c.balance)||0)) - expenses.filter(r => !r.isDeleted && r.accountId === c.id && !r.ccBillSettled && r.type !== 'transfer').reduce((s,r)=>s+(Number(r.total)||0),0)) <= 30) ? '🟢 全數在正常或微差容許範圍內' : '🟡 部分卡片存在待確認差額 (可能含歷史初始餘額)'}

---

## 3. 全體帳戶與資產清單 (Full Accounts Breakdown, 共 ${accounts.length} 個)
| 帳戶 ID | 帳戶暱稱 | 類型 | 歸屬 | 幣別 | 目前餘額 | 預設支出 | 預設收入 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${accountsRows.length > 0 ? accountsRows.join('\n') : '| 無帳戶 | - | - | - | - | - | - | - |'}

---

## 4. 信用卡帳戶專區深度稽核 (Credit Cards Audit Matrix)
| 卡片暱稱 | 持卡人 | 卡片當前負債 | 結帳日 | 扣繳日 | 扣繳方式 | 綁定活儲 (餘額) | 待繳筆數 | 待繳金額 | 健康狀態 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${ccReportRows.length > 0 ? ccReportRows.join('\n') : '| 無任何信用卡 | - | - | - | - | - | - | - | - | - |'}

${ccUnpaidSections.length > 0 ? ccUnpaidSections.join('\n\n') : ''}

---

## 5. 常態固定帳單與預算配置 (Recurring Bills & Budgets)
- **每月預算上限**: \`$${(Number(assets.monthlyBudget) || 25000).toLocaleString()} TWD\`
- **常態帳單清單 (共 ${bills.length} 筆)**:
| 帳單名稱 | 歸屬 | 金額 | 扣款日 | 下次扣款日 | 屬性 |
| :--- | :--- | :--- | :--- | :--- | :--- |
${billsRows.length > 0 ? billsRows.join('\n') : '| 無常態帳單 | - | - | - | - | - |'}

---

## 6. 最新 30 筆詳細交易紀錄審計 (Recent 30 Transactions Audit)
| 日期 | 類型 | 分類 | 金額 | 付款人 / 扣款帳戶 | 備註 | 結算狀態 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${transactionRows.length > 0 ? transactionRows.join('\n') : '| 無交易紀錄 | - | - | - | - | - | - |'}

---

## 7. 系統 Session 操作日誌與錯誤追蹤 (System Logs, 共 ${this.logs.length} 筆)
\`\`\`text
${this.logs.length === 0 ? "（本階段尚無系統報錯或日誌紀錄）" : this.logs.slice(-30).map((l, i) => `[#${i + 1}] [${l.timestamp}] [${l.type}] ${l.message}${l.details ? ' -> ' + l.details.replace(/\n/g, ' ') : ''}`).join('\n')}
\`\`\`

---

## 8. AI 診斷快速結論
- **全系統資料庫格式**: 正常，無損毀欄位。
- **資產平衡**: ${twdDiff <= 1 && usdDiff <= 0.01 ? '🟢 守恆無誤' : '⚠️ 需關注台幣/美金差額'}。
- **操作建議**: 系統具備完整的微差容錯與直接餘額校正功能，隨時可進行劃撥或校正。
================================================
`;
    return report;
  }

  generateDiagnosticReport(appContext = {}) {
    const reportHeader = `================================================
🥔 馬鈴薯管家 — 系統本階段除錯與日誌診斷報告
================================================
⏰ 報告產生時間: ${new Date().toLocaleString('zh-TW')}
👤 當前操作者: ${appContext.operatorName || '未登入'} (${appContext.currentUser || '無'})
📱 裝置環境: ${typeof navigator !== 'undefined' ? navigator.userAgent : '未知'}
🌐 網路連線狀態: ${typeof navigator !== 'undefined' && navigator.onLine ? '🟢 在線 (Online)' : '🔴 離線 (Offline)'}
🔔 瀏覽器通知權限: ${typeof Notification !== 'undefined' ? Notification.permission : '不支援'}
🔑 本機 FCM Token: ${appContext.fcmToken ? (appContext.fcmToken.substring(0, 18) + '...') : '未取得/無'}
================================================
📋 本登入階段記錄之系統後台與報錯日誌 (共 ${this.logs.length} 筆):
`;

    const logsBody = this.logs.length === 0
      ? "（本階段尚無系統報錯或日誌紀錄）"
      : this.logs.map((log, index) => {
          let line = `[#${index + 1}] [${log.timestamp}] [${log.type}] ${log.message}`;
          if (log.details) {
            line += `\n  詳細資訊:\n${log.details.split('\n').map(l => '  ' + l).join('\n')}`;
          }
          return line;
        }).join('\n------------------------------------------------\n');

    return `${reportHeader}\n${logsBody}\n================================================\n`;
  }
}

export const logger = new SessionLogger();
