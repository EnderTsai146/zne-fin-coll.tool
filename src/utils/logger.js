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
