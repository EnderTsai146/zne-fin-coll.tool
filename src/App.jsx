// src/App.jsx
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import Login from './components/Login';
import TotalOverview from './components/TotalOverview';
import MonthlyView from './components/MonthlyView';
import AccountsManager from './components/AccountsManager';
import InvestmentView from './components/InvestmentView';
import ExpenseEntry from './components/ExpenseEntry';
import ReviewView from './components/ReviewView';
import './index.css';
import ReviewAndDatabaseView from './components/ReviewAndDatabaseView';
import SettingsView from './components/SettingsView';
import ErrorBoundary from './components/ErrorBoundary';
import { getBudgetForMonth } from './utils/budgetUtils';
import { db, auth, getFcmToken, onFcmMessage } from './firebase';
import { doc, onSnapshot, setDoc, getDoc, collection, addDoc, runTransaction } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { MY_GOOGLE_API_URL } from './config';
import { logger } from './utils/logger';



const formatInputMoney = (valStr) => {
  if (valStr === '' || valStr === undefined || valStr === null) return '';
  const clean = valStr.toString().replace(/[^\d.]/g, '');
  const parts = clean.split('.');
  if (parts.length > 2) {
    parts[1] = parts.slice(1).join('');
  }
  const integerPart = parts[0] ? Number(parts[0]).toLocaleString() : '';
  const decimalPart = parts.length > 1 ? '.' + parts[1] : '';
  return `$${integerPart}${decimalPart}`;
};

const parseMoney = (valStr) => {
  if (!valStr) return 0;
  const clean = valStr.toString().replace(/[^\d.]/g, '');
  return Number(clean) || 0;
};

const cleanFirestoreData = (obj) => {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj
      .filter(item => item !== undefined)
      .map(item => cleanFirestoreData(item));
  }

  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] = cleanFirestoreData(value);
    }
  }
  return cleaned;
};

// ★ 智慧審計軌跡瘦身過濾器 — 僅保留有變動的帳戶與總額快照，體積縮小 95%
const sanitizeAuditTrail = (trail) => {
  if (!trail || typeof trail !== 'object') return null;
  const before = trail.before;
  const after = trail.after;
  if (!before && !after) return null;

  const beforeAccounts = Array.isArray(before?.accounts) ? before.accounts : [];
  const afterAccounts = Array.isArray(after?.accounts) ? after.accounts : [];

  const changedAccountIds = new Set();
  afterAccounts.forEach(aAcc => {
    if (!aAcc) return;
    const bAcc = beforeAccounts.find(b => b && b.id === aAcc.id);
    if (!bAcc || Number(bAcc.balance) !== Number(aAcc.balance)) {
      changedAccountIds.add(aAcc.id);
    }
  });
  beforeAccounts.forEach(bAcc => {
    if (!bAcc) return;
    const aAcc = afterAccounts.find(a => a && a.id === bAcc.id);
    if (!aAcc || Number(aAcc.balance) !== Number(bAcc.balance)) {
      changedAccountIds.add(bAcc.id);
    }
  });

  const slimAccount = (acc) => {
    if (!acc) return null;
    return {
      id: acc.id,
      nickname: acc.nickname || '',
      currency: acc.currency || 'TWD',
      balance: Number(acc.balance) || 0,
      owner: acc.owner || 'joint'
    };
  };

  const slimBeforeAccs = beforeAccounts.filter(a => a && changedAccountIds.has(a.id)).map(slimAccount).filter(Boolean);
  const slimAfterAccs = afterAccounts.filter(a => a && changedAccountIds.has(a.id)).map(slimAccount).filter(Boolean);

  const slimSnapshot = (snap, slimAccs) => {
    if (!snap) return null;
    return {
      userA: Number(snap.userA) || 0,
      userB: Number(snap.userB) || 0,
      userA_usd: Number(snap.userA_usd) || 0,
      userB_usd: Number(snap.userB_usd) || 0,
      jointCash: Number(snap.jointCash) || 0,
      jointCash_usd: Number(snap.jointCash_usd) || 0,
      jointInvestments: snap.jointInvestments ? { ...snap.jointInvestments } : {},
      userInvestments: snap.userInvestments
        ? JSON.parse(JSON.stringify(snap.userInvestments))
        : { userA: { stock: 0, fund: 0, deposit: 0, other: 0 }, userB: { stock: 0, fund: 0, deposit: 0, other: 0 } },
      accounts: slimAccs
    };
  };

  return {
    before: slimSnapshot(before, slimBeforeAccs),
    after: slimSnapshot(after, slimAfterAccs)
  };
};

// ★ 雲端資料庫全面安全過濾與防護瘦身函數
const sanitizeAssetsForCloud = (rawAssets) => {
  if (!rawAssets || typeof rawAssets !== 'object') return rawAssets;
  const clean = cleanFirestoreData(rawAssets);

  // 1. 移除過渡暫存之 logs（已全面獨立存放在子集合中）
  if (clean.userOperationsLog) {
    delete clean.userOperationsLog;
  }

  // 2. 徹底瘦身 monthlyExpenses 中所有歷史快照
  if (Array.isArray(clean.monthlyExpenses)) {
    clean.monthlyExpenses = clean.monthlyExpenses.map(record => {
      if (!record || typeof record !== 'object') return record;
      const slimRecord = { ...record };
      if (slimRecord.auditTrail) {
        slimRecord.auditTrail = sanitizeAuditTrail(slimRecord.auditTrail);
      }
      if (slimRecord.deleteAuditTrail) {
        slimRecord.deleteAuditTrail = sanitizeAuditTrail(slimRecord.deleteAuditTrail);
      }
      return slimRecord;
    });
  }

  return clean;
};

const USER_MAPPING = {
  "ender.tsai@gmail.com": "大狗狗🐕",
  "r5213467254@icloud.com": "阿陞🐶",
  "0F4MxqPq1oRNBJkRxiAeYOEOF572": "阿陞🐶"
};

// ★ Module‑level — stable reference so React doesn't remount
const NAV_ITEMS = [
  { id: 'monthly', icon: '📊', label: '資料庫' },
  { id: 'invest', icon: '📈', label: '投資' },
  { id: 'center', icon: '', label: '' }, // Handled specially
  { id: 'accounts', icon: '🏦', label: '帳戶' },
  { id: 'settings', icon: '⚙️', label: '設定' }
];

const getDetailedDeviceInfo = () => {
  if (typeof navigator === 'undefined') {
    return {
      deviceName: '未知裝置',
      deviceType: 'other',
      icon: '📱',
      rawOs: '未知系統',
      rawBrowser: 'Web Browser',
      screen: '',
      isPWA: false,
      pwaBadge: '瀏覽器分頁',
      registeredAt: new Date().toISOString()
    };
  }

  const ua = navigator.userAgent || '';
  let os = '未知設備';
  let icon = '📱';
  let deviceType = 'phone';

  // OS & Form Factor
  if (/iPad|iPadOS/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    os = 'iPadOS 平板';
    icon = '📟';
    deviceType = 'tablet';
  } else if (/iPhone/i.test(ua)) {
    const match = ua.match(/OS (\d+[._]\d+)/);
    const version = match ? match[1].replace('_', '.') : '';
    os = `iPhone (iOS ${version || ''})`.trim();
    icon = '🍎';
    deviceType = 'phone';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    const match = ua.match(/Mac OS X (\d+[._\d]+)/);
    const version = match ? match[1].replace(/_/g, '.') : '';
    os = `Mac (macOS ${version || ''})`.trim();
    icon = '💻';
    deviceType = 'desktop';
  } else if (/Android/i.test(ua)) {
    const isTablet = /Tablet|Tab/i.test(ua) || (typeof window !== 'undefined' && window.innerWidth >= 768 && window.innerHeight >= 1024);
    const match = ua.match(/Android\s+([\d.]+)/);
    const version = match ? match[1] : '';
    os = isTablet ? `Android 平板 (v${version || ''})`.trim() : `Android 手機 (v${version || ''})`.trim();
    icon = isTablet ? '📟' : '🤖';
    deviceType = isTablet ? 'tablet' : 'phone';
  } else if (/Windows NT/i.test(ua)) {
    let winVer = 'Windows';
    if (/Windows NT 10.0/i.test(ua)) winVer = 'Windows 10/11';
    else if (/Windows NT 6.3/i.test(ua)) winVer = 'Windows 8.1';
    else if (/Windows NT 6.1/i.test(ua)) winVer = 'Windows 7';
    os = `${winVer} 電腦`;
    icon = '🖥️';
    deviceType = 'desktop';
  } else if (/Linux/i.test(ua)) {
    os = 'Linux 電腦';
    icon = '🐧';
    deviceType = 'desktop';
  }

  // Browser Detection
  let browser = 'Web Browser';
  if (/Edg\//i.test(ua)) {
    const ver = ua.match(/Edg\/([\d.]+)/)?.[1]?.split('.')[0] || '';
    browser = `Edge ${ver}`.trim();
  } else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua) && !/CriOS/i.test(ua)) {
    const ver = ua.match(/Chrome\/([\d.]+)/)?.[1]?.split('.')[0] || '';
    browser = `Chrome ${ver}`.trim();
  } else if (/CriOS\//i.test(ua)) {
    const ver = ua.match(/CriOS\/([\d.]+)/)?.[1]?.split('.')[0] || '';
    browser = `Chrome iOS ${ver}`.trim();
  } else if (/Version\/([\d.]+).*Safari/i.test(ua)) {
    const ver = ua.match(/Version\/([\d.]+)/)?.[1]?.split('.')[0] || '';
    browser = `Safari ${ver}`.trim();
  } else if (/Firefox\//i.test(ua)) {
    const ver = ua.match(/Firefox\/([\d.]+)/)?.[1]?.split('.')[0] || '';
    browser = `Firefox ${ver}`.trim();
  }

  const isPWA = (typeof window !== 'undefined') && (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);
  const screen = (typeof window !== 'undefined') ? `${window.screen.width}×${window.screen.height} (${window.devicePixelRatio || 1}x)` : '';
  const pwaBadge = isPWA ? 'PWA 獨立 App' : '瀏覽器分頁';
  const defaultDeviceName = `${os} · ${browser} (${pwaBadge})`;

  return {
    deviceName: defaultDeviceName,
    rawOs: os,
    rawBrowser: browser,
    icon,
    deviceType,
    isPWA,
    screen,
    pwaBadge,
    registeredAt: new Date().toISOString()
  };
};

const getDeviceInfo = () => getDetailedDeviceInfo();

const cleanPushTitle = (rawTitle) => {
  if (!rawTitle) return '';
  return String(rawTitle)
    .replace(/\s*[[(（【]?(from|drom)?\s*馬鈴薯管家\s*[\])）】]?/gi, '')
    .replace(/\s*(from|drom)\s*馬鈴薯管家/gi, '')
    .replace(/\s*-\s*馬鈴薯管家/gi, '')
    .replace(/【(from|drom)?\s*馬鈴薯管家】/gi, '')
    .replace(/【馬鈴薯管家】/gi, '')
    .replace(/(from|drom)\s*馬鈴薯管家/gi, '')
    .replace(/馬鈴薯管家/gi, '')
    .replace(/\s*(from|drom)\s*/gi, '')
    .replace(/^[\s\-–—:：【】()[\]]+/, '')
    .replace(/[\s\-–—:：【】()[\]]+$/, '')
    .trim();
};

// ★ 全域推播通知防重去重管理器 (防止 8 秒內相同推播重複跳出 2-3 通)
const recentNotificationCache = new Map();

const showDeduplicatedNotification = (rawTitle, rawBody, extraOptions = {}) => {
  const title = cleanPushTitle(rawTitle) || "系統通知";
  const body = rawBody || "";
  const key = `${title}_${body}`;
  const now = Date.now();
  const lastShown = recentNotificationCache.get(key);

  // 8 秒內完全相同的推播內容不重複彈窗
  if (lastShown && (now - lastShown < 8000)) {
    console.log(`[Push Dedup] 攔截重複推播 (${Math.round((now - lastShown) / 1000)}s 內已顯示):`, title);
    return null;
  }

  recentNotificationCache.set(key, now);
  // 清理超過 60 秒的舊記錄
  if (recentNotificationCache.size > 50) {
    for (const [k, ts] of recentNotificationCache.entries()) {
      if (now - ts > 60000) recentNotificationCache.delete(k);
    }
  }

  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return null;
  }

  const deterministicTag = 'pot_' + Math.abs(key.split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)).toString(36);

  try {
    const notif = new Notification(title, {
      body,
      icon: '/apple-touch-icon.png',
      badge: '/apple-touch-icon.png',
      tag: deterministicTag,
      renotify: false,
      ...extraOptions
    });
    return notif;
  } catch (err) {
    console.warn("[Push] Native Notification creation error:", err);
    return null;
  }
};

const getTokensArray = (field) => {
  if (!field) return [];
  if (typeof field === 'string') return [field];
  if (Array.isArray(field)) return Array.from(new Set(field.filter(t => typeof t === 'string' && t.length > 5)));
  if (typeof field === 'object' && field !== null) {
    // 若為裝置物件字典，依據裝置特徵 (相同作業系統、瀏覽器、螢幕與 PWA 狀態) 嚴格去重，每個實體裝置僅保留最新的 1 個 Token
    const deviceMap = new Map();
    const resultTokens = [];

    Object.entries(field).forEach(([tok, meta]) => {
      if (typeof tok !== 'string' || tok.length <= 5) return;
      if (typeof meta === 'object' && meta !== null && (meta.rawOs || meta.rawBrowser || meta.screen)) {
        const deviceSig = `${meta.rawOs || ''}_${meta.rawBrowser || ''}_${meta.screen || ''}_${meta.isPWA ? 'pwa' : 'web'}`;
        const existing = deviceMap.get(deviceSig);
        const tokTime = new Date(meta.lastSeen || meta.registeredAt || 0).getTime();
        if (!existing || tokTime > existing.time) {
          deviceMap.set(deviceSig, { token: tok, time: tokTime });
        }
      } else {
        resultTokens.push(tok);
      }
    });

    for (const { token } of deviceMap.values()) {
      resultTokens.push(token);
    }

    return Array.from(new Set(resultTokens));
  }
  return [];
};

const addTokenToDict = (field, newToken, customName = null) => {
  let dict = {};
  if (typeof field === 'string' && field) {
    dict[field] = { deviceName: '舊登入裝置', icon: '📱', registeredAt: '' };
  } else if (typeof field === 'object' && field && !Array.isArray(field)) {
    dict = { ...field };
  } else if (Array.isArray(field)) {
    field.forEach(t => { if (typeof t === 'string' && t.length > 5) dict[t] = { deviceName: '已登入裝置', icon: '📱' }; });
  }

  if (newToken) {
    const meta = getDetailedDeviceInfo();
    let inheritedCustomName = customName;

    // 自動清理同裝置 (相同作業系統、瀏覽器、螢幕與 PWA 狀態) 過去留存的過期舊 Token，避免單一裝置累積多組 Token 造成重複發送
    Object.entries(dict).forEach(([oldToken, oldMeta]) => {
      if (oldToken !== newToken && typeof oldMeta === 'object' && oldMeta !== null) {
        const isSameDevice = (
          oldMeta.rawOs === meta.rawOs &&
          oldMeta.rawBrowser === meta.rawBrowser &&
          oldMeta.screen === meta.screen &&
          oldMeta.isPWA === meta.isPWA
        );
        if (isSameDevice) {
          if (!inheritedCustomName && oldMeta.customName) {
            inheritedCustomName = oldMeta.customName;
          }
          console.log(`[Token Dedup] 替換同裝置舊 Token: ${oldToken.substring(0, 10)}... -> 新 Token: ${newToken.substring(0, 10)}...`);
          delete dict[oldToken];
        }
      }
    });

    const existing = dict[newToken] || {};
    dict[newToken] = {
      ...existing,
      deviceName: inheritedCustomName || existing.customName || existing.deviceName || meta.deviceName,
      customName: inheritedCustomName || existing.customName || null,
      rawOs: meta.rawOs,
      rawBrowser: meta.rawBrowser,
      icon: existing.icon || meta.icon,
      deviceType: meta.deviceType,
      isPWA: meta.isPWA,
      screen: meta.screen,
      registeredAt: existing.registeredAt || meta.registeredAt,
      lastSeen: new Date().toISOString()
    };
  }
  return dict;
};

// ★ Liquid‑glass bottom nav with sliding pill
const BottomNav = ({ currentPage, onPageChange, assets, lastActiveCenterTab }) => {
  const navRef = useRef(null);
  const [pillStyle, setPillStyle] = useState({ opacity: 0 });

  const getNavIndex = (pageId) => {
    if (pageId === 'overview' || pageId === 'expense') return 2;
    if (pageId === 'monthly') return 0;
    if (pageId === 'invest') return 1;
    if (pageId === 'accounts') return 3;
    if (pageId === 'settings') return 4;
    return -1;
  };

  useLayoutEffect(() => {
    if (!navRef.current) return;
    const isCenter = currentPage === 'overview' || currentPage === 'expense';
    if (isCenter) {
      setPillStyle({
        opacity: 0,
        display: 'none',
        transition: 'none'
      });
      return;
    }
    const idx = getNavIndex(currentPage);
    if (idx < 0) return;
    const child = navRef.current.children[idx + 1];
    if (!child) return;

    setPillStyle({
      width: child.offsetWidth,
      height: child.offsetHeight,
      transform: `translateX(${child.offsetLeft}px)`,
      opacity: 1,
      display: 'block',
      borderRadius: '16px',
    });
  }, [currentPage]);

  const hasPendingBills = assets?.bills?.some(b => {
    const todayStr = new Date().toISOString().split('T')[0];
    return Math.ceil((new Date(b.nextDate) - new Date(todayStr)) / (1000 * 60 * 60 * 24)) <= 3;
  });

  const isNextMonthBudgetUnset = useMemo(() => {
    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    // Check if we are within 7 days of the end of the month
    if (daysInMonth - today.getDate() <= 7) {
      const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      const nextMonthStr = nextMonth.toISOString().slice(0, 7);
      const nextBudget = assets?.budgets?.[nextMonthStr];
      if (!nextBudget) return true;
      const total = Object.values(nextBudget).reduce((sum, val) => sum + Number(val || 0), 0);
      return total === 0;
    }
    return false;
  }, [assets]);



  const handleCenterClick = () => {
    if (currentPage === 'overview') {
      onPageChange('expense');
    } else if (currentPage === 'expense') {
      onPageChange('overview');
    } else {
      onPageChange(lastActiveCenterTab || 'overview');
    }
  };

  return (
    <div className="bottom-nav bottom-nav-mobile" ref={navRef}>
      {/* Liquid glass sliding pill */}
      <div className="nav-pill" style={pillStyle} />
      {NAV_ITEMS.map((item) => {
        if (item.id === 'center') {
          const isCenterActive = currentPage === 'overview' || currentPage === 'expense';
          const displayLabel = currentPage === 'expense' ? '記帳' : '總覽';
          const displayIcon = currentPage === 'expense' ? '✍️' : '🏠';

          return (
            <div
              key="center"
              className={`nav-item center-nav-btn ${isCenterActive ? 'active' : ''}`}
              onClick={handleCenterClick}
              style={{ position: 'relative' }}
            >
              <div className="nav-icon" style={{ position: 'relative' }}>
                {displayIcon}
                {hasPendingBills && (
                  <span className="nav-warning-dot" />
                )}
              </div>
              <div className="nav-label">{displayLabel}</div>
            </div>
          );
        }

        const isSettingsWarning = item.id === 'settings' && isNextMonthBudgetUnset;

        return (
          <div
            key={item.id}
            className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => onPageChange(item.id)}
            style={{ position: 'relative' }}
          >
            <div className="nav-icon" style={{ position: 'relative' }}>
              {item.icon}
              {isSettingsWarning && (
                <span className="nav-warning-dot" />
              )}
            </div>
            <div className="nav-label">{item.label}</div>
          </div>
        );
      })}
    </div>
  );
};

// MAKE_WEBHOOK_URL moved to config.js

const CHANGELOG_DATA = [
  {
    version: 'v2.4.0',
    date: '2026-06-29',
    highlights: [
      {
        emoji: '🏷️',
        color: 'rgba(0, 122, 255, 0.15)',
        title: '自訂分類標籤配置',
        desc: '開放使用者動態設定自訂分類標籤，解除系統預設之硬編碼限制，提供更靈活的記帳彈性。'
      },
      {
        emoji: '📊',
        color: 'rgba(52, 199, 89, 0.15)',
        title: '全新視覺化圖表',
        desc: '新增跨月度開銷對比長條圖與長期資產動態配置堆疊圖，協助深度分析資產變動趨勢。'
      },
      {
        emoji: '🚨',
        color: 'rgba(255, 149, 0, 0.15)',
        title: '動態預算即時預警',
        desc: '於日常記帳認列與暫存購物車送出時，當總支出達預算之 70%、90% 及 100% 時，系統將即時彈出對話視窗提示。'
      },
      {
        emoji: '💬',
        color: 'rgba(48, 209, 88, 0.15)',
        title: 'LINE 通知內容強化',
        desc: 'LINE 增強型通知自動整合動態預算進度文字，讓您即時掌握預算執行狀態。'
      },
      {
        emoji: '📅',
        color: 'rgba(175, 82, 222, 0.15)',
        title: '跨時區日期修正',
        desc: '修正因跨時區結算而導致定期帳單日期產生幽靈偏移之競爭條件（Race Condition）。'
      }
    ],
    tutorials: [
      {
        title: '設定自訂分類標籤',
        content: '前往「設定」，點選「自訂標籤」，即可新增或編輯您的專屬交易分類，系統將即時更新記帳表單 the 下拉選單。'
      },
      {
        title: '查看跨月開銷對比',
        content: '切換至「分析」或「回顧」頁面，系統會自動比對本月與上月各分類之開銷差額，並以長條圖呈現波動情況。'
      },
      {
        title: '啟用動態預算預警',
        content: '於「預算設定」中填寫上限值。記帳或批次送出購物車時，若累計金額觸及門檻（70%/90%/100%），將自動彈出預警對話視窗進行安全阻斷。'
      }
    ]
  },
  {
    version: 'v2.0.0',
    date: '2026-06-29',
    highlights: [
      {
        emoji: '📱',
        color: 'rgba(0, 122, 255, 0.15)',
        title: 'Apple HIG 原生視覺與極簡重構',
        desc: '表單與設定全面升級為 iOS「設定」風格的圓角分組清單 (Grouped Inset Cards)，欄位水平排版、標籤靠左、數值靠右。'
      },
      {
        emoji: '📲',
        color: 'rgba(52, 199, 89, 0.15)',
        title: 'iOS Bottom Action Sheet 快捷選單',
        desc: '流水帳列表移除繁雜明文按鈕，點擊行項目即從螢幕底部平滑滑出 iOS 風格 Action Sheet 快顯功能表，提供修改與作廢。'
      },
      {
        emoji: '📥',
        color: 'rgba(255, 149, 0, 0.15)',
        title: 'iOS Card Sheet 底部滑出面板',
        desc: '文字修改對話視窗與對帳明細升級為 Card Sheet，頂部備有灰色 Drag Handle 手勢指示條與「取消/儲存」左右文字控制按鈕。'
      },
      {
        emoji: '✨',
        color: 'rgba(175, 82, 222, 0.15)',
        title: 'SF Symbols 風格向量圖示替換',
        desc: '所有彩色表情符號 Emoji 替換為線條幾何嚴謹、純色的 SVG 向量圖示，致敬 Apple 系統圖示質感。'
      },
      {
        emoji: '📈',
        color: 'rgba(48, 209, 88, 0.15)',
        title: '資產配置堆疊圖與跨月花費對比',
        desc: '總覽頁新增「配置比例」切換，支援 Stacked Area 堆疊圖查看科目移轉；回顧與資料庫加入上月 vs 本月同分類跨月開銷對比長條圖。'
      },
      {
        emoji: '⚙️',
        color: 'rgba(255, 59, 48, 0.15)',
        title: '系統設定與操作歷史雲端備份',
        desc: '新增「馬鈴薯管家」設定按鈕，支援檢視基本資訊、說明、常見問題與詳細「使用者操作歷史紀錄」，且支援隨其他財務帳務資料一起打包無感備份到雲端。'
      }
    ],
    tutorials: [
      {
        title: '呼叫 iOS 快顯功能表',
        content: '在流水帳列表中，輕觸任何一筆交易紀錄行，螢幕底部即會滑出 iOS 風格 Action Sheet，可選擇進行修改備註或作廢該筆分錄。'
      },
      {
        title: '切換資產配置堆疊圖',
        content: '在「總覽」頁的「資產變動與配置趨勢」圖表上方，可點擊「配置比例」切換為 Stacked Area 堆疊圖，即時分析現金、股票等科目成長與消長。'
      },
      {
        title: '使用管家設定與操作日誌',
        content: '點選左上角「馬鈴薯管家」按鈕即可打開「管家設定」卡片，在裡面可以查閱「操作歷史紀錄」並隨時與雲端進行同步。'
      }
    ]
  },
  {
    version: 'v1.3.0',
    date: '2026-06-25',
    highlights: [
      {
        emoji: '💵',
        color: 'rgba(0, 122, 255, 0.15)',
        title: '金額輸入千分位與貨幣符號',
        desc: '金額欄位輸入時即時自動套用 $ 和千分位逗號。後台無感轉換為數值，輸入更直覺。'
      },
      {
        emoji: '🛒',
        color: 'rgba(52, 199, 89, 0.15)',
        title: '暫存購物車排版防護與響應式',
        desc: '最佳化手機寬度下的備註與標籤折行，金額與刪除按鈕始終完美對齊，再窄的螢幕都不跑版。'
      },
      {
        emoji: '🧮',
        color: 'rgba(255, 149, 0, 0.15)',
        title: '先進先出 (FIFO) 成本估算',
        desc: '賣出股票時自動依據買入紀錄回估並預填投入本金，極大簡化損益紀錄程序。'
      },
      {
        emoji: '☁️',
        color: 'rgba(48, 209, 88, 0.15)',
        title: '全自動雲端試算表備份',
        desc: '每日首次開啟應用程式時，自動於背景將資料備份至 Google 雲端硬碟，保護您的資產數據。'
      },
      {
        emoji: '🔮',
        color: 'rgba(175, 82, 222, 0.15)',
        title: '全磨砂玻璃化 (Liquid Glass) 升級',
        desc: '移除總覽、回顧、投資分頁中的實色方塊，全面升級為透亮半透明玻璃質感。'
      }
    ],
    tutorials: [
      {
        title: '暫存此筆與批次合併記帳',
        content: '在輸入金額後點選「暫存此筆」可連續記帳。若暫存區總支出超過該帳戶可用餘額，最後點擊「確認記帳」時防呆系統將自動攔截提示，防止餘額透支。'
      },
      {
        title: '即時台美股報價更新',
        content: '在「投資」頁面中點選「更新報價」按鈕即可主動更新價格。在台美股交易時段內，系統優先採用最新市價計算市值，而非昨收價。'
      },
      {
        title: '調整自動成本估算',
        content: 'FIFO 成本為系統後台自動預估，您仍可在買賣面板上自由修改以符合您的實際券商成本。'
      }
    ]
  }
];

const formatTransactionDetail = (r) => {
  const amountStr = `$${(Number(r.total) || 0).toLocaleString()}`;
  const usdStr = r.usdAmount ? ` ($${Number(r.usdAmount).toFixed(2)} USD)` : '';
  const noteStr = r.note ? ` (備註: ${r.note})` : ' (無備註)';
  const symbolStr = r.symbol ? ` [標的: ${r.symbol}]` : '';

  if (r.type === 'income') {
    return `收入入帳 ${amountStr}${usdStr} - 分類: ${r.category}${noteStr}`;
  }
  if (r.type === 'transfer') {
    const from = r.payer || '個人帳戶';
    return `資產劃撥 ${amountStr} 自 ${from} 轉移至 共同現金${noteStr}`;
  }
  if (r.type === 'exchange') {
    const account = r.payer || '帳戶';
    return `外幣換匯 ${amountStr}${usdStr} 於 ${account}${noteStr}`;
  }
  if (r.type === 'calibrate') {
    const account = r.payer || '帳戶';
    const diffText = [];
    if (r.twdDiff !== undefined) diffText.push(`台幣校正: $${r.twdDiff.toLocaleString()}`);
    if (r.usdDiff !== undefined) diffText.push(`美金校正: $${r.usdDiff.toFixed(2)} USD`);
    const diffStr = diffText.length > 0 ? ` [${diffText.join(', ')}]` : '';
    return `餘額校正 ${amountStr}${diffStr} 於 ${account}${noteStr}`;
  }
  if (r.type === 'settle') {
    const fromUser = r.settledUser === 'userA' ? '大狗狗🐕' : '阿陞🐶';
    return `系統結算共同支出 ${amountStr}，由共同現金撥付給 ${fromUser}${noteStr}`;
  }

  // Investment transactions
  if (r.type.includes('invest') || r.type === 'liquidate') {
    const payer = r.payer || (r.type.includes('joint') ? '共同帳戶' : '個人帳戶');
    let actionName = '投資變動';
    if (r.type.includes('buy')) actionName = '買入投資';
    else if (r.type.includes('sell')) actionName = '賣出投資';
    else if (r.type.includes('profit')) actionName = '投資獲利';
    else if (r.type.includes('loss')) actionName = '投資虧損';
    else if (r.type.includes('day_trade')) actionName = '投資當沖結算';
    else if (r.type.includes('liquidate') || r.type === 'liquidate') actionName = '投資清算變現';

    const priceText = r.price ? ` @單價 ${r.price}` : '';
    const qtyText = r.shares ? ` 數量 ${r.shares}` : '';
    return `${actionName} ${amountStr}${usdStr} 於 ${payer}${symbolStr}${priceText}${qtyText}${noteStr}`;
  }

  if (r.type === 'spend') {
    const advanced = r.advancedBy ? ` (代墊人: ${r.advancedBy === 'userA' ? '大狗狗🐕' : '阿陞🐶'})` : ' (共同現金直付)';
    return `共同支出 ${amountStr} - 分類: ${r.category}${advanced}${noteStr}`;
  }
  if (r.type === 'expense') {
    const payer = r.payer || '個人';
    return `個人支出 ${amountStr} 於 ${payer}${noteStr}`;
  }

  return `進行交易變動 ${amountStr} (類型: ${r.type}, 分類: ${r.category})${noteStr}`;
};

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [operatorName, setOperatorName] = useState('');
  const [authResolved, setAuthResolved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dataReady, setDataReady] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [splashPhase, setSplashPhase] = useState('loading');
  const dataReadyForSplash = useRef(false);
  const [modalConfig, setModalConfig] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [newlyAddedRecordTimestamp, setNewlyAddedRecordTimestamp] = useState(null);
  const [newlyAddedInvestSymbol, setNewlyAddedInvestSymbol] = useState(null);
  const [newlyAddedInvestPayer, setNewlyAddedInvestPayer] = useState(null);
  const [currentPage, setCurrentPage] = useState('overview');
  const [lastActiveCenterTab, setLastActiveCenterTab] = useState('overview');
  const [monthlyViewSubTab, setMonthlyViewSubTab] = useState('database');
  const [settingsSubTab, setSettingsSubTab] = useState('budget');
  const [currentFxRate, setCurrentFxRate] = useState(31.5);
  const [guidedHint, setGuidedHint] = useState(null);

  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);
  const [timeoutCountdown, setTimeoutCountdown] = useState(15);
  const [autoLogoutReason, setAutoLogoutReason] = useState('');
  const inactivityTimerRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  const lastActiveTimeRef = useRef(Date.now());
  const prevExpensesCountRef = useRef(null);

  const [showChangelog, setShowChangelog] = useState(false);
  const [changelogTab, setChangelogTab] = useState('whatsnew');
  const [hasNewUpdate, setHasNewUpdate] = useState(() => {
    const lastSeen = localStorage.getItem('potato_last_seen_version');
    return CHANGELOG_DATA.length > 0 && lastSeen !== CHANGELOG_DATA[0].version;
  });

  const [assets, setAssets] = useState({
    userA: 0,
    userB: 0,
    userA_usd: 0,
    userB_usd: 0,
    jointCash: 0,
    jointCash_usd: 0,
    jointInvestments: { stock: 0, fund: 0, deposit: 0, other: 0 },
    userInvestments: {
      userA: { stock: 0, fund: 0, deposit: 0, other: 0 },
      userB: { stock: 0, fund: 0, deposit: 0, other: 0 }
    },
    roi: { stock: 0, fund: 0, deposit: 0, other: 0 },
    monthlyExpenses: [],
    bills: []
  });

  const [archivedRecords, setArchivedRecords] = useState({});
  const archivedRecordsRef = useRef({});
  const [isFetchingArchive, setIsFetchingArchive] = useState(false);
  const archivingInProgress = useRef(false);
  const repairAttempted = useRef(false);

  const [fcmDiagnostic, setFcmDiagnostic] = useState({
    token: null,
    error: null,
    status: 'checking' // 'checking', 'unsupported', 'permission_denied', 'ready', 'failed'
  });

  // Scroll to top automatically when changing pages (Fix Scroll Jump)
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [currentPage]);

  const sanitizeMessage = (msg) => {
    if (!msg) return '';
    const str = String(msg);
    if (str.includes('<!DOCTYPE html>') || str.includes('<html') || str.includes('<script')) {
      return '⚠️ 收到非預期的 HTML 網頁回應 (可能是 Google Apps Script 權限問題或網址無效)。\n\n(原始 HTML 內容已自動隱藏，請檢查 Apps Script 部署與權限)。';
    }
    if (str.length > 500) {
      return str.substring(0, 500) + '\n...\n(訊息過長已自動裁切)';
    }
    return str;
  };

  const customAlert = (message, title = '提示') => {
    return new Promise((resolve) => {
      setModalConfig({
        type: 'alert',
        title,
        message: sanitizeMessage(message),
        resolve
      });
    });
  };

  const customConfirm = (message, title = '確認') => {
    return new Promise((resolve) => {
      setModalConfig({
        type: 'confirm',
        title,
        message: sanitizeMessage(message),
        resolve
      });
    });
  };

  const customPrompt = (message, defaultValue = '', title = '輸入', inputMode = 'text') => {
    return new Promise((resolve) => {
      setModalConfig({
        type: 'prompt',
        title,
        message,
        defaultValue,
        inputMode,
        resolve
      });
    });
  };

  const handleConfirmModal = (value) => {
    if (!modalConfig) return;
    const res = modalConfig.resolve;
    setModalConfig(null);
    res(value);
  };

  const handleCancelModal = () => {
    if (!modalConfig) return;
    const res = modalConfig.resolve;
    setModalConfig(null);
    if (modalConfig.type === 'confirm') {
      res(false);
    } else {
      res(null);
    }
  };

  const saveToCloud = (newAssets) => {
    if (!currentUser) return;
    const cleanAssets = sanitizeAssetsForCloud(newAssets);
    setAssets(cleanAssets); // 樂觀同步更新本地狀態，防範非同步同步延遲造成的 race condition
    if (window.location.hostname === 'localhost') {
      console.log("[DEV MOCK] saveToCloud:", cleanAssets);
      return;
    }
    const docRef = doc(db, "finance", "data");
    setDoc(docRef, cleanAssets).catch(async (err) => await customAlert("連線錯誤：" + err.message, "連線錯誤"));
  };

  // ★ 自動顯示更新日誌，且控制背景滾動鎖定
  useEffect(() => {
    if (hasNewUpdate) {
      setShowChangelog(true);
      if (CHANGELOG_DATA.length > 0) {
        localStorage.setItem('potato_last_seen_version', CHANGELOG_DATA[0].version);
      }
      setHasNewUpdate(false);
    }
  }, [hasNewUpdate]);

  const handleOpenChangelog = () => {
    setShowChangelog(true);
    setChangelogTab('whatsnew');
    if (CHANGELOG_DATA.length > 0) {
      localStorage.setItem('potato_last_seen_version', CHANGELOG_DATA[0].version);
    }
    setHasNewUpdate(false);
  };

  // ★ 控制所有彈窗開啟時的背景滾動與彈性滾動鎖定
  useEffect(() => {
    const shouldLock = showChangelog || !!modalConfig || showTimeoutWarning;
    if (shouldLock) {
      document.documentElement.classList.add('modal-open');
      document.body.classList.add('modal-open');
    } else {
      document.documentElement.classList.remove('modal-open');
      document.body.classList.remove('modal-open');
    }
    return () => {
      document.documentElement.classList.remove('modal-open');
      document.body.classList.remove('modal-open');
    };
  }, [showChangelog, modalConfig, showTimeoutWarning]);



  const performAutoLogout = useCallback((reason) => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setShowTimeoutWarning(false);

    localStorage.removeItem('loginTimestamp');
    if (window.location.hostname !== 'localhost') {
      signOut(auth);
    } else {
      setCurrentUser(null);
      setOperatorName('');
      setDataReady(false);
      setLoading(false);
    }

    if (reason === 'inactivity') {
      setAutoLogoutReason("操作逾時已自動登出 🛡️");
    } else if (reason === '3days') {
      setAutoLogoutReason("已達 3 天安全會話限制，請重新登入 🛡️");
    }
  }, []);

  const resetInactivityTimer = useCallback(() => {
    if (!currentUser) return;
    lastActiveTimeRef.current = Date.now();
    if (showTimeoutWarning) return;

    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);

    // 3 minutes = 180000ms
    inactivityTimerRef.current = setTimeout(() => {
      setShowTimeoutWarning(true);
      setTimeoutCountdown(15);
    }, 180000);
  }, [currentUser, showTimeoutWarning]);

  // Global activity listeners
  useEffect(() => {
    if (!currentUser) {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      setShowTimeoutWarning(false);
      return;
    }

    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart'];
    const handleActivity = () => {
      resetInactivityTimer();
    };

    events.forEach(event => {
      window.addEventListener(event, handleActivity);
    });

    // Initial reset
    resetInactivityTimer();

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [currentUser, resetInactivityTimer]);

  // PWA Notification Permission & FCM Token Setup
  useEffect(() => {
    if (!currentUser || !dataReady || !operatorName) return;

    const userKey = operatorName.includes('大狗狗') ? 'userA' : 'userB';
    const existingTokens = assets?.fcmTokens || {};
    const existingUserField = existingTokens[userKey];

    const setupNotifications = async () => {
      const vapidKey = "BGYGX29x3HiHqANNRIu9qtH_M5nEu9C70r5BgSQ6omRLLRm2nL941IOz8z8PQ3UXaK-wXslOprbMpP-zRIfSruc";

      try {
        if ('Notification' in window) {
          let permission = Notification.permission;
          if (permission === 'default') {
            permission = await Notification.requestPermission();
          }

          if (permission === 'granted') {
            setFcmDiagnostic(prev => ({ ...prev, status: 'fetching' }));
            const token = await getFcmToken(vapidKey);
            if (token) {
              setFcmDiagnostic({ token, error: null, status: 'ready' });
              const tokenList = getTokensArray(existingUserField);
              if (!tokenList.includes(token)) {
                const updatedUserField = addTokenToDict(existingUserField, token);
                const updatedAssets = {
                  ...assets,
                  fcmTokens: {
                    ...existingTokens,
                    [userKey]: updatedUserField
                  }
                };
                saveToCloud(updatedAssets);
                console.log(`Successfully registered FCM token for ${operatorName}`);
              }
            } else {
              setFcmDiagnostic({ token: null, error: "無法取得 FCM Token。可能是瀏覽器不支援 Web Push、或者 Firebase 設定有問題。", status: 'failed' });
            }
          } else {
            setFcmDiagnostic({ token: null, error: permission === 'denied' ? "瀏覽器拒絕了通知權限。請在瀏覽器設定中重新啟用。" : "尚未啟用通知權限。", status: 'permission_denied' });
          }
        } else {
          setFcmDiagnostic({ token: null, error: "此瀏覽器或裝置不支援 Web Push 推播通知。", status: 'unsupported' });
        }
      } catch (err) {
        console.error("Error setting up push notifications:", err);
        setFcmDiagnostic({ token: null, error: err.message || String(err), status: 'failed' });
      }
    };

    setupNotifications();

    // Listen for foreground push notifications (display native banner with dedup and record to log)
    const unsubscribeFcm = onFcmMessage((payload) => {
      const rawTitle = payload.notification?.title || payload.data?.title || "🎉 收到推播通知";
      const title = cleanPushTitle(rawTitle) || "🎉 收到推播通知";
      const body = payload.notification?.body || payload.data?.body || "";
      logger.addLog('INFO', `[FCM Foreground Notification] ${title}: ${body}`);

      showDeduplicatedNotification(title, body);
    });

    return () => {
      if (typeof unsubscribeFcm === 'function') {
        unsubscribeFcm();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, dataReady, operatorName]);

  const handleRegisterNotification = async () => {
    const vapidKey = "BGYGX29x3HiHqANNRIu9qtH_M5nEu9C70r5BgSQ6omRLLRm2nL941IOz8z8PQ3UXaK-wXslOprbMpP-zRIfSruc";
    if (!('Notification' in window)) {
      setFcmDiagnostic({ token: null, error: "此瀏覽器或裝置不支援 Web Push 推播通知。", status: 'unsupported' });
      return 'unsupported';
    }

    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }

    if (permission === 'granted' && operatorName) {
      try {
        setFcmDiagnostic(prev => ({ ...prev, status: 'fetching' }));
        const token = await getFcmToken(vapidKey);
        if (token) {
          setFcmDiagnostic({ token, error: null, status: 'ready' });
          const userKey = operatorName.includes('大狗狗') ? 'userA' : 'userB';
          const existingTokens = assets?.fcmTokens || {};
          const existingUserField = existingTokens[userKey];

          const tokenList = getTokensArray(existingUserField);
          if (!tokenList.includes(token)) {
            const updatedUserField = addTokenToDict(existingUserField, token);
            const updatedAssets = {
              ...assets,
              fcmTokens: {
                ...existingTokens,
                [userKey]: updatedUserField
              }
            };
            saveToCloud(updatedAssets);
            console.log(`Successfully registered FCM token for ${operatorName}`);
          }
        } else {
          setFcmDiagnostic({ token: null, error: "取得 FCM Token 失敗，請確認是否已將此網頁「加入主畫面 / Dock」成 PWA 應用程式，且連網正常。", status: 'failed' });
        }
      } catch (err) {
        console.error("FCM Token fetch failed:", err);
        setFcmDiagnostic({ token: null, error: err.message || String(err), status: 'failed' });
        throw err;
      }
    } else {
      setFcmDiagnostic({ token: null, error: permission === 'denied' ? "瀏覽器拒絕了通知權限。請在瀏覽器設定中重新啟用。" : "尚未啟用通知權限。", status: 'permission_denied' });
    }
    return permission;
  };



  // Sync session safety with real system time upon tab visibility return
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && currentUser) {
        const elapsed = Date.now() - lastActiveTimeRef.current;
        const idleLimit = 180000; // 3 minutes
        const warningPeriod = 15000; // 15 seconds

        if (elapsed >= idleLimit + warningPeriod) {
          performAutoLogout('inactivity');
        } else if (elapsed >= idleLimit) {
          const remaining = Math.max(1, Math.ceil((idleLimit + warningPeriod - elapsed) / 1000));
          setShowTimeoutWarning(true);
          setTimeoutCountdown(remaining);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentUser, performAutoLogout]);

  // Timer countdown warning handler
  useEffect(() => {
    if (showTimeoutWarning) {
      countdownIntervalRef.current = setInterval(() => {
        setTimeoutCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownIntervalRef.current);
            performAutoLogout('inactivity');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    }

    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [showTimeoutWarning, performAutoLogout]);

  const handleResumeSession = () => {
    setShowTimeoutWarning(false);
    resetInactivityTimer();
  };

  // ★ Sync body data-page attribute for per-page background gradients
  useEffect(() => {
    document.body.setAttribute('data-page', currentPage);
  }, [currentPage]);

  // ★ 馬鈴薯進度條動畫引擎 (極速快充與平滑過場)
  useEffect(() => {
    if (splashPhase === 'done' || splashPhase === 'exit') return;
    const interval = setInterval(() => {
      setLoadProgress(prev => {
        if (prev >= 100) return 100;
        if (dataReadyForSplash.current) return 100;
        if (prev < 40) return prev + 4;
        if (prev < 70) return prev + 2;
        if (prev < 90) return prev + 0.8;
        return prev;
      });
    }, 25);
    return () => clearInterval(interval);
  }, [splashPhase]);

  // ★ 追蹤實際載入狀態 → 立即解鎖過場
  useEffect(() => {
    if (!loading && !currentUser) {
      setSplashPhase('done');
    }
    if (!loading && currentUser && dataReady) {
      dataReadyForSplash.current = true;
      setLoadProgress(100);
      setSplashPhase('filled');
    }
  }, [loading, currentUser, dataReady]);

  // ★ 進度到 100% → 觸發過場
  useEffect(() => {
    if (loadProgress >= 100 && splashPhase === 'loading') {
      setSplashPhase('filled');
    }
  }, [loadProgress, splashPhase]);

  // ★ 極速過場動畫時間軸 (由原本的 1200ms 壓縮至 280ms，流暢無感知)
  useEffect(() => {
    if (splashPhase === 'filled') {
      const t = setTimeout(() => setSplashPhase('exit'), 180);
      return () => clearTimeout(t);
    }
    if (splashPhase === 'exit') {
      const t = setTimeout(() => setSplashPhase('done'), 120);
      return () => clearTimeout(t);
    }
  }, [splashPhase]);

  // ★ 超時安全閥：若網路或快取稍微延遲，2.5 秒後立即解鎖畫面
  useEffect(() => {
    const timeout = setTimeout(() => {
      dataReadyForSplash.current = true;
      setLoadProgress(100);
      setSplashPhase('filled');
    }, 2500);
    return () => clearTimeout(timeout);
  }, []);

  // ★ Fix: 用 ref 同步追蹤已載入的月份，避免 useCallback 依賴 state 導致引用不穩定
  useEffect(() => { archivedRecordsRef.current = archivedRecords; }, [archivedRecords]);

  const loadArchiveMonth = useCallback(async (monthStr) => {
    if (!monthStr || archivedRecordsRef.current[monthStr] !== undefined) return;
    if (window.location.hostname === 'localhost') {
      setArchivedRecords(prev => ({ ...prev, [monthStr]: [] }));
      return;
    }
    setIsFetchingArchive(true);
    try {
      const snap = await getDoc(doc(db, "finance", `arc_${monthStr}`));
      if (snap.exists() && snap.data().records) {
        setArchivedRecords(prev => ({ ...prev, [monthStr]: snap.data().records }));
      } else {
        setArchivedRecords(prev => ({ ...prev, [monthStr]: [] }));
      }
    } catch (e) {
      console.error("載入歸檔失敗:", e);
    } finally {
      setIsFetchingArchive(false);
    }
  }, []);

  // ★ Fix: useMemo 取代 useCallback + 呼叫，避免每次 render 產生新陣列引用
  const combinedHistory = useMemo(() => {
    const combined = (assets.monthlyExpenses || []).map((r, i) => ({
      ...r,
      _context: { source: 'main', index: i }
    }));

    Object.keys(archivedRecords).forEach(month => {
      (archivedRecords[month] || []).forEach((r, i) => {
        combined.push({
          ...r,
          _context: { source: 'archive', month: month, index: i }
        });
      });
    });
    return combined;
  }, [assets.monthlyExpenses, archivedRecords]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (newlyAddedRecordTimestamp) {
      const timer = setTimeout(() => {
        setNewlyAddedRecordTimestamp(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [newlyAddedRecordTimestamp]);

  useEffect(() => {
    if (newlyAddedInvestSymbol) {
      const timer = setTimeout(() => {
        setNewlyAddedInvestSymbol(null);
        setNewlyAddedInvestPayer(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [newlyAddedInvestSymbol]);

  useEffect(() => {
    if (window.location.hostname === 'localhost') {
      setCurrentUser({ email: 'ender.tsai@gmail.com' });
      setOperatorName('大狗狗🐕');
      return;
    }
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        if (window.location.hostname !== 'localhost') {
          const storedLoginTime = localStorage.getItem('loginTimestamp');
          const now = Date.now();
          if (storedLoginTime) {
            const daysElapsed = (now - Number(storedLoginTime)) / (1000 * 60 * 60 * 24);
            if (daysElapsed >= 3) {
              localStorage.removeItem('loginTimestamp');
              signOut(auth);
              setAutoLogoutReason("已達 3 天安全會話限制，請重新登入 🛡️");
              return;
            }
          } else {
            localStorage.setItem('loginTimestamp', now.toString());
          }
        }
        // 重設載入與過場動畫狀態，防範直接進入數字為 0 的總覽畫面
        setSplashPhase('loading');
        setLoadProgress(0);
        dataReadyForSplash.current = false;
        setDataReady(false);
        setLoading(true);

        setCurrentUser(user);
        setOperatorName(USER_MAPPING[user.uid] || USER_MAPPING[user.email] || (user.email ? user.email.split('@')[0] : '阿陞🐶'));
        setAutoLogoutReason('');
        setAuthResolved(true);
        // ★ 不要在此設 loading=false，等 Firestore 資料到位後再解鎖

      } else {
        localStorage.removeItem('loginTimestamp');
        setCurrentUser(null);
        setOperatorName('');
        setDataReady(false);
        setLoading(false); // 未登入時直接解鎖，讓 Login 頁面顯示
        setSplashPhase('done'); // 確保立刻關閉 Splash Screen 直接呈現 Login
        setAuthResolved(true);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    if (window.location.hostname === 'localhost') {
      // Mock local dev data
      setAssets({
        userA: 150000,
        userB: 120000,
        userA_usd: 5000,
        userB_usd: 4000,
        jointCash: 80000,
        jointCash_usd: 2500,
        jointInvestments: { stock: 50000, fund: 20000, deposit: 10000, other: 0 },
        userInvestments: {
          userA: { stock: 30000, fund: 10000, deposit: 5000, other: 0 },
          userB: { stock: 20000, fund: 10000, deposit: 5000, other: 0 }
        },
        roi: { stock: 0.12, fund: 0.05, deposit: 0.015, other: 0 },
        monthlyExpenses: [
          { date: '2026-06-25', category: '餐飲食品', total: 150, payer: '大狗狗🐕', note: '麥當勞晚餐', timestamp: '2026-06-25T18:30:00.000Z' },
          { date: '2026-06-24', category: '生活用品', total: 600, payer: '共同帳戶', note: '好市多衛生紙', timestamp: '2026-06-24T12:00:00.000Z' }
        ],
        bills: [],
        config: { categories: ["餐費", "購物", "娛樂", "其他"] },
        monthlyBudget: 25000
      });
      setDataReady(true);
      setLoading(false);
      setSplashPhase('done');
      return;
    }
    const docRef = doc(db, "finance", "data");
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        let data = docSnap.data();
        if (!data.userInvestments) {
          data.userInvestments = {
            userA: { stock: 0, fund: 0, deposit: 0, other: 0 },
            userB: { stock: 0, fund: 0, deposit: 0, other: 0 }
          };
        }
        let needsUpdate = false;

        // --- Multi-Account Initial Migration ---
        if (!data.accounts || data.accounts.length === 0) {
          const initAccounts = [
            {
              id: 'acc_userA_twd',
              owner: 'userA',
              type: 'bank',
              name: '大狗狗個人帳戶',
              nickname: '大狗狗台幣活儲',
              accountNumber: '',
              balance: data.userA || 0,
              currency: 'TWD',
              isDefaultExpense: true,
              isDefaultIncome: true,
              isDefaultSettle: true,
              createdAt: new Date().toISOString()
            },
            {
              id: 'acc_userB_twd',
              owner: 'userB',
              type: 'bank',
              name: '阿陞個人帳戶',
              nickname: '阿陞台幣活儲',
              accountNumber: '',
              balance: data.userB || 0,
              currency: 'TWD',
              isDefaultExpense: true,
              isDefaultIncome: true,
              isDefaultSettle: true,
              createdAt: new Date().toISOString()
            },
            {
              id: 'acc_joint_twd',
              owner: 'joint',
              type: 'cash',
              name: '共同現金',
              nickname: '共同台幣現金',
              accountNumber: '',
              balance: data.jointCash || 0,
              currency: 'TWD',
              isDefaultExpense: true,
              isDefaultIncome: true,
              isDefaultSettle: false,
              createdAt: new Date().toISOString()
            },
            {
              id: 'acc_userA_usd',
              owner: 'userA',
              type: 'bank',
              name: '大狗狗美金帳戶',
              nickname: '大狗狗美金存款',
              accountNumber: '',
              balance: data.userA_usd || 0,
              currency: 'USD',
              isDefaultExpense: false,
              isDefaultIncome: false,
              isDefaultSettle: false,
              createdAt: new Date().toISOString()
            },
            {
              id: 'acc_userB_usd',
              owner: 'userB',
              type: 'bank',
              name: '阿陞美金帳戶',
              nickname: '阿陞美金存款',
              accountNumber: '',
              balance: data.userB_usd || 0,
              currency: 'USD',
              isDefaultExpense: false,
              isDefaultIncome: false,
              isDefaultSettle: false,
              createdAt: new Date().toISOString()
            },
            {
              id: 'acc_joint_usd',
              owner: 'joint',
              type: 'bank',
              name: '共同美金帳戶',
              nickname: '共同美金存款',
              accountNumber: '',
              balance: data.jointCash_usd || 0,
              currency: 'USD',
              isDefaultExpense: false,
              isDefaultIncome: false,
              isDefaultSettle: false,
              createdAt: new Date().toISOString()
            }
          ];
          data.accounts = initAccounts;
          needsUpdate = true;
        }

        // --- Credit Card Auto Payoff Engine ---
        const autoPayDate = new Date();
        const currentMonthStr = `${autoPayDate.getFullYear()}-${String(autoPayDate.getMonth() + 1).padStart(2, '0')}`;
        const currentDay = autoPayDate.getDate();

        if (data.accounts && data.accounts.length > 0) {
          const updatedAccs = [...data.accounts];
          let changed = false;

          for (let i = 0; i < updatedAccs.length; i++) {
            const acc = updatedAccs[i];
            if (acc.type === 'credit' && acc.autoPay && currentDay >= acc.billingDay && acc.balance < 0 && acc.lastAutoPayMonth !== currentMonthStr) {
              const linkedBankIndex = updatedAccs.findIndex(b => b.id === acc.linkedBankAccountId);
              if (linkedBankIndex !== -1) {
                const linkedBank = updatedAccs[linkedBankIndex];
                const payAmount = Math.abs(acc.balance);

                if (linkedBank.balance >= payAmount) {
                  // Perform payoff
                  updatedAccs[linkedBankIndex] = {
                    ...linkedBank,
                    balance: linkedBank.balance - payAmount
                  };
                  updatedAccs[i] = {
                    ...acc,
                    balance: 0,
                    lastAutoPayMonth: currentMonthStr
                  };

                  const stmtId = `auto_stmt_${Date.now()}`;
                  const autoPayoffRecord = {
                    date: autoPayDate.toISOString().split('T')[0],
                    month: currentMonthStr,
                    type: 'transfer',
                    category: '信用卡自動扣款',
                    total: payAmount,
                    sourceAmount: payAmount,
                    targetAmount: payAmount,
                    statementId: stmtId,
                    payer: '系統自動扣款',
                    accountId: linkedBank.id,
                    targetAccountId: acc.id,
                    note: `[自動扣款] ${acc.nickname} 帳單結清`,
                    timestamp: autoPayDate.toISOString()
                  };

                  if (!data.monthlyExpenses) data.monthlyExpenses = [];
                  data.monthlyExpenses = data.monthlyExpenses.map(r => {
                    if (!r.isDeleted && r.accountId === acc.id && !r.ccBillSettled) {
                      return { ...r, ccBillSettled: true, ccStatementId: stmtId };
                    }
                    return r;
                  });
                  data.monthlyExpenses.push(autoPayoffRecord);

                  changed = true;
                  console.log(`[Auto-Pay] Successfully paid off credit card bill for: ${acc.nickname} ($${payAmount})`);
                }
              }
            }
          }

          if (changed) {
            data.accounts = updatedAccs;
            needsUpdate = true;
          }
        }

        // --- Sync accounts back to legacy root properties for backwards compatibility ---
        if (data.accounts && data.accounts.length > 0) {
          data.userA = data.accounts.filter(a => a.owner === 'userA' && a.currency === 'TWD').reduce((sum, a) => sum + a.balance, 0);
          data.userB = data.accounts.filter(a => a.owner === 'userB' && a.currency === 'TWD').reduce((sum, a) => sum + a.balance, 0);
          data.jointCash = data.accounts.filter(a => a.owner === 'joint' && a.currency === 'TWD').reduce((sum, a) => sum + a.balance, 0);
          data.userA_usd = data.accounts.filter(a => a.owner === 'userA' && a.currency === 'USD').reduce((sum, a) => sum + a.balance, 0);
          data.userB_usd = data.accounts.filter(a => a.owner === 'userB' && a.currency === 'USD').reduce((sum, a) => sum + a.balance, 0);
          data.jointCash_usd = data.accounts.filter(a => a.owner === 'joint' && a.currency === 'USD').reduce((sum, a) => sum + a.balance, 0);
        }
        if (!data.config || !data.config.categories || JSON.stringify(data.config.categories) !== JSON.stringify(["餐費", "購物", "娛樂", "其他"])) {
          data.config = {
            ...(data.config || {}),
            categories: ["餐費", "購物", "娛樂", "其他"]
          };
          needsUpdate = true;
        }
        if (data.monthlyBudget === undefined || data.monthlyBudget === null) {
          data.monthlyBudget = 25000;
          needsUpdate = true;
        }

        // ★ 自動無損瘦身偵測：若檢測到歷史快照過大，啟動自動壓縮並同步回寫 Firestore
        let needsSanitizeWrite = false;
        if (data.monthlyExpenses && data.monthlyExpenses.some(r => r.auditTrail?.before?.accounts?.length > 4)) {
          console.log("[系統優化] 偵測到歷史交易快照體積較大，啟動自動無損瘦身...");
          data = sanitizeAssetsForCloud(data);
          needsSanitizeWrite = true;
        }

        // ★ 安全月度歸檔引擎 — 序列化處理以防資料遺失
        if (data.monthlyExpenses && data.monthlyExpenses.length > 0) {
          try {
            const now = new Date();
            const keepMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const keepCutoff = `${keepMonth.getFullYear()}-${String(keepMonth.getMonth() + 1).padStart(2, '0')}`;

            const toArchive = {};
            data.monthlyExpenses.forEach(r => {
              const rMonth = (r.month || (r.date || '').slice(0, 7));
              if (rMonth < keepCutoff) {
                if (!toArchive[rMonth]) toArchive[rMonth] = [];
                toArchive[rMonth].push(r);
              }
            });

            const archiveMonths = Object.keys(toArchive).sort();
            if (archiveMonths.length > 0 && !archivingInProgress.current) {
              archivingInProgress.current = true;
              console.log(`[系統優化] 觸發安全的序向歸檔機制，準備寫入：`, archiveMonths);

              const runSafeArchival = async () => {
                try {
                  const sumAssets = (state) => {
                    if (!state) return 0;
                    const twd = (state.userA || 0) + (state.userB || 0) + (state.jointCash || 0);
                    const usd = (state.userA_usd || 0) + (state.userB_usd || 0) + (state.jointCash_usd || 0);
                    const sumInv = (obj) => Object.values(obj || {}).reduce((s, v) => s + v, 0);
                    const invest = sumInv(state.jointInvestments) + sumInv(state.userInvestments?.userA) + sumInv(state.userInvestments?.userB);
                    return twd + Math.round(usd * (currentFxRate || 31.5)) + invest;
                  };

                  let archivedTimestamps = new Set();

                  // 1. 先安全合併到個別歷史檔案（防止覆蓋）
                  for (const month of archiveMonths) {
                    const archiveDocRef = doc(db, "finance", `arc_${month}`);
                    const arcSnap = await getDoc(archiveDocRef);
                    const rawRecords = arcSnap.exists() ? (arcSnap.data().records || []) : [];

                    const existingMap = new Map();
                    rawRecords.forEach(r => existingMap.set(r.timestamp, r));

                    toArchive[month].forEach(r => {
                      existingMap.set(r.timestamp, r);
                      archivedTimestamps.add(r.timestamp);
                    });

                    const mergedRecords = Array.from(existingMap.values())
                      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
                      .map(r => r.auditTrail ? { ...r, auditTrail: sanitizeAuditTrail(r.auditTrail) } : r);

                    await setDoc(archiveDocRef, cleanFirestoreData({
                      month: month,
                      archivedAt: new Date().toISOString(),
                      records: mergedRecords
                    }));
                    console.log(`✅ 已安全合併歸檔 ${month}，共儲存 ${existingMap.size} 筆`);
                  }

                  // 2. 所有歷史檔案都確定寫入成功後，重新抓取最新的主檔案進行清理，改為使用事務（Transaction）以防覆蓋 race condition
                  const mainDocRef = doc(db, "finance", "data");
                  await runTransaction(db, async (transaction) => {
                    const mainSnap = await transaction.get(mainDocRef);
                    if (mainSnap.exists()) {
                      const mainData = mainSnap.data();
                      const rawSafeMonthly = (mainData.monthlyExpenses || []).filter(r => !archivedTimestamps.has(r.timestamp));
                      const safeMonthly = rawSafeMonthly.map(r => r.auditTrail ? { ...r, auditTrail: sanitizeAuditTrail(r.auditTrail) } : r);

                      const newSnapshots = { ...(mainData.dailyNetWorth || {}) };
                      const holdingsBase = mainData.currentStockHoldings ? { ...mainData.currentStockHoldings } : {};
                      // ★ 防禦性初始化：確保所有現有持股項目都有成本欄位
                      Object.keys(holdingsBase).forEach(k => {
                        if (holdingsBase[k] && typeof holdingsBase[k] === 'object') {
                          if (holdingsBase[k].costTwd === undefined) holdingsBase[k].costTwd = 0;
                          if (holdingsBase[k].costUsd === undefined) holdingsBase[k].costUsd = 0;
                        }
                      });

                      // 根據剛成功歸檔的資料更新快照與持股基準
                      archiveMonths.forEach(month => {
                        toArchive[month].forEach(r => {
                          if (!r.isDeleted && r.auditTrail?.after && r.date && !newSnapshots[r.date]) {
                            newSnapshots[r.date] = sumAssets(r.auditTrail.after);
                          }
                          if (!r.isDeleted && r.symbol) {
                            const sym = r.symbol;
                            const payer = r.payer ? r.payer.replace(/🐶|🐕/g, '') : '共同帳戶';
                            const key = `${payer}_${sym}`;
                            if (!holdingsBase[key]) holdingsBase[key] = { shares: 0, market: r.market || 'TW', costTwd: 0, costUsd: 0 };
                            if (r.type?.includes('buy')) {
                              holdingsBase[key].shares += (Number(r.shares) || 0);
                              holdingsBase[key].costTwd += (Number(r.total) || 0);
                              holdingsBase[key].costUsd += (Number(r.usdAmount) || 0);
                            } else if (r.type?.includes('sell')) {
                              const sellShares = Number(r.shares) || 0;
                              const ratio = holdingsBase[key].shares > 0 ? sellShares / holdingsBase[key].shares : 0;
                              holdingsBase[key].costTwd -= (holdingsBase[key].costTwd * ratio);
                              holdingsBase[key].costUsd -= (holdingsBase[key].costUsd * ratio);
                              holdingsBase[key].shares -= sellShares;
                            }
                          }
                        });
                      });

                      Object.keys(holdingsBase).forEach(k => { if (holdingsBase[k].shares <= 0) delete holdingsBase[k]; });

                      transaction.update(mainDocRef, sanitizeAssetsForCloud({
                        monthlyExpenses: safeMonthly,
                        dailyNetWorth: newSnapshots,
                        currentStockHoldings: holdingsBase
                      }));
                      console.log(`🚀 主檔案已成功清理完成，系統永續優化成功`);
                    }
                  });
                } catch (error) {
                  console.error("❌ 歸檔引擎中途連線失敗，已中止清理主流程。確保資料不會遺失:", error);
                } finally {
                  archivingInProgress.current = false;
                }
              };

              runSafeArchival();
            }
          } catch (error) {
            console.error("歸檔引擎觸發階段發生例外:", error);
          }
        }

        if (needsUpdate || needsSanitizeWrite) {
          const cleanData = sanitizeAssetsForCloud(data);
          setDoc(docRef, cleanData)
            .then(() => console.log("✅ 成功完成資料庫瘦身與同步回寫"))
            .catch(err => console.error("Auto-migration / sanitize setDoc error:", err));
        }

        if (data.monthlyExpenses && data.monthlyExpenses.length > 0) {
          prevExpensesCountRef.current = data.monthlyExpenses.length;
        }

        setAssets(data);
        setDataReady(true);
        setLoading(false);
      } else {
        const cleanInitial = cleanFirestoreData(assets);
        setDoc(docRef, cleanInitial).catch(err => console.error("Initial setDoc error:", err));
        setDataReady(true);
        setLoading(false);
      }
    }, (error) => { console.error("資料讀取失敗:", error); setLoading(false); });
    return () => unsubscribe();
    // eslint-disable-next-line
  }, [currentUser]);

  // ★ 自動修復：偵測持股成本資料缺失並從歷史歸檔重建
  useEffect(() => {
    if (repairAttempted.current || !currentUser || !dataReady) return;
    const holdings = assets.currentStockHoldings;
    if (!holdings) return;
    const broken = Object.entries(holdings).filter(([, v]) =>
      v && v.shares > 0 && !v.costTwd && !v.costUsd
    );
    if (broken.length === 0) return;
    repairAttempted.current = true;
    console.log('[自動修復] 偵測到持股成本缺失:', broken.map(b => b[0]));
    const doRepair = async () => {
      try {
        const updated = JSON.parse(JSON.stringify(holdings));
        const now = new Date();
        const monthPromises = [];
        for (let i = 18; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          monthPromises.push(
            getDoc(doc(db, "finance", `arc_${m}`)).catch(() => null)
          );
        }
        const snaps = await Promise.all(monthPromises);
        snaps.forEach(snap => {
          if (snap && snap.exists && snap.exists() && snap.data().records) {
            allRecs.push(...snap.data().records);
          }
        });
        allRecs.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.timestamp || '').localeCompare(b.timestamp || ''));
        let changed = false;
        for (const [key] of broken) {
          let sym = key, ownerFilter = '共同帳戶';
          if (key.includes('_')) { const p = key.split('_'); ownerFilter = p[0]; sym = p.slice(1).join('_'); }
          const lots = [];
          allRecs.filter(r => !r.isDeleted && r.symbol === sym && r.payer && r.payer.replace(/🐶|🐕/g, '').includes(ownerFilter))
            .forEach(r => {
              if (r.type?.includes('buy')) {
                lots.push({ shares: Number(r.shares) || 0, costTwd: Number(r.total) || 0, costUsd: Number(r.usdAmount) || 0 });
              } else if (r.type?.includes('sell')) {
                let rem = Number(r.shares) || 0;
                while (rem > 0 && lots.length > 0) {
                  if (lots[0].shares <= rem) { rem -= lots[0].shares; lots.shift(); }
                  else { const f = rem / lots[0].shares; lots[0].costTwd *= (1 - f); lots[0].costUsd *= (1 - f); lots[0].shares -= rem; rem = 0; }
                }
              }
            });
          const costTwd = lots.reduce((s, l) => s + l.costTwd, 0);
          const costUsd = lots.reduce((s, l) => s + l.costUsd, 0);
          if (costTwd > 0 || costUsd > 0) {
            updated[key] = { ...updated[key], costTwd, costUsd };
            changed = true;
            console.log(`[自動修復] ${key}: costTwd=${Math.round(costTwd)}, costUsd=${costUsd.toFixed(2)}`);
          }
        }
        if (changed) {
          await setDoc(doc(db, "finance", "data"), cleanFirestoreData({ currentStockHoldings: updated }), { merge: true });
          console.log('[自動修復] 持股成本修復完成');
        }
      } catch (err) { console.error('[自動修復] 修復失敗:', err); }
    };
    doRepair();
    // eslint-disable-next-line
  }, [currentUser, dataReady]);

  const handlePageChange = (pageId) => {
    if (pageId === 'overview' || pageId === 'expense') {
      setLastActiveCenterTab(pageId);
    }
    setCurrentPage(pageId);
  };

  const handleNavigateWithGuide = ({ page, tab, hint }) => {
    if (page) {
      if (page === 'overview' || page === 'expense') {
        setLastActiveCenterTab(page);
      }
      setCurrentPage(page);
    }

    if (page === 'monthly' && tab) {
      setMonthlyViewSubTab(tab);
    } else if (page === 'settings' && tab) {
      setSettingsSubTab(tab);
    }

    if (hint) {
      setGuidedHint(hint);
      setTimeout(() => {
        setGuidedHint(null);
      }, 5000);
    }
  };

  // (舊的 22 點晚間自動批次發送邏輯已被移除，改用手動開關觸發收集與發送)

  const getBudgetProgressText = (newAssets = assets, nextSpendAmount = 0) => {
    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7);
    const budgets = getBudgetForMonth(newAssets, currentMonth);
    const budget = Object.values(budgets).reduce((sum, val) => sum + Number(val || 0), 0) || newAssets.monthlyBudget || 25000;
    const jointSpend = (newAssets.monthlyExpenses || [])
      .filter(r => !r.isDeleted && r.month === currentMonth && r.type === 'spend')
      .reduce((sum, r) => sum + (Number(r.total) || 0), 0);
    const totalWithNext = jointSpend + nextSpendAmount;
    const percentage = Math.round((totalWithNext / budget) * 100);
    const remaining = budget - totalWithNext;

    const curYear = now.getFullYear();
    const curMonthNum = now.getMonth() + 1;
    const daysInMonth = new Date(curYear, curMonthNum, 0).getDate();
    const today = now.getDate();

    // Daily spend pace analytics
    const dailyAvg = today > 0 ? Math.round(totalWithNext / today) : totalWithNext;
    const dailyLimit = Math.round(budget / daysInMonth);

    let text = "";
    if (percentage < 50) {
      const paceText = dailyAvg <= dailyLimit
        ? ` (日均 $${dailyAvg.toLocaleString()} 穩健低於上限 $${dailyLimit.toLocaleString()}！)`
        : ` (不過目前日均 $${dailyAvg.toLocaleString()} 略高於上限 $${dailyLimit.toLocaleString()}，中旬請稍微克制喔。)`;
      text = `🟢 共同預算水位充足！本月已用 ${percentage}% (已用 $${totalWithNext.toLocaleString()}，剩餘 $${remaining.toLocaleString()})${paceText}`;
    } else if (percentage < 80) {
      const paceText = dailyAvg <= dailyLimit
        ? ` (每日花費步調仍在安全範圍內。)`
        : ` (日均花費 $${dailyAvg.toLocaleString()} 偏高，請減少週末非必要娛樂購物。)`;
      text = `🟡 預算已消耗過半！目前累計達 ${percentage}% (剩餘 $${remaining.toLocaleString()})${paceText}`;
    } else if (percentage < 100) {
      text = `⚠️ 預算黃色警戒！本月已用 ${percentage}% (僅剩 $${remaining.toLocaleString()})，大狗狗與阿陞請開啟省錢節流模式！`;
    } else {
      const overdraft = totalWithNext - budget;
      text = `🚨 預算超支警報！已用 ${percentage}% (已超支 $${overdraft.toLocaleString()})，請大狗狗與阿陞立即暫停非必要開銷！`;
    }

    return {
      percentage,
      text
    };
  };

  const handleLogout = async () => {
    if (await customConfirm("確定要登出嗎？")) {
      localStorage.removeItem('loginTimestamp');
      logger.clearSessionLogs();
      signOut(auth);
    }
  };

  const getSnapshot = (currentAssets) => {
    const accounts = currentAssets.accounts || [];
    const userA = accounts.length > 0
      ? accounts.filter(a => a.owner === 'userA' && a.currency === 'TWD').reduce((sum, a) => sum + (Number(a.balance) || 0), 0)
      : (currentAssets.userA || 0);
    const userB = accounts.length > 0
      ? accounts.filter(a => a.owner === 'userB' && a.currency === 'TWD').reduce((sum, a) => sum + (Number(a.balance) || 0), 0)
      : (currentAssets.userB || 0);
    const jointCash = accounts.length > 0
      ? accounts.filter(a => a.owner === 'joint' && a.currency === 'TWD').reduce((sum, a) => sum + (Number(a.balance) || 0), 0)
      : (currentAssets.jointCash || 0);
    const userA_usd = accounts.length > 0
      ? accounts.filter(a => a.owner === 'userA' && a.currency === 'USD').reduce((sum, a) => sum + (Number(a.balance) || 0), 0)
      : (currentAssets.userA_usd || 0);
    const userB_usd = accounts.length > 0
      ? accounts.filter(a => a.owner === 'userB' && a.currency === 'USD').reduce((sum, a) => sum + (Number(a.balance) || 0), 0)
      : (currentAssets.userB_usd || 0);
    const jointCash_usd = accounts.length > 0
      ? accounts.filter(a => a.owner === 'joint' && a.currency === 'USD').reduce((sum, a) => sum + (Number(a.balance) || 0), 0)
      : (currentAssets.jointCash_usd || 0);

    return {
      userA,
      userB,
      userA_usd,
      userB_usd,
      jointCash,
      jointCash_usd,
      jointInvestments: currentAssets.jointInvestments ? { ...currentAssets.jointInvestments } : {},
      userInvestments: currentAssets.userInvestments
        ? JSON.parse(JSON.stringify(currentAssets.userInvestments))
        : { userA: { stock: 0, fund: 0, deposit: 0, other: 0 }, userB: { stock: 0, fund: 0, deposit: 0, other: 0 } },
      accounts: accounts.map(a => ({
        id: a.id,
        nickname: a.nickname || '',
        currency: a.currency || 'TWD',
        balance: Number(a.balance) || 0,
        owner: a.owner || 'joint'
      }))
    };
  };

  const logOperation = (newAssets, actionType, detail, extraMeta = {}) => {
    const timestamp = new Date().toISOString();
    let safeDetail = '';
    if (typeof detail === 'string' && detail.trim()) {
      safeDetail = detail.trim();
    } else if (typeof detail === 'object' && detail !== null) {
      try { safeDetail = JSON.stringify(detail); } catch { safeDetail = ''; }
    }

    if (!safeDetail) {
      if (actionType === 'budget_update') safeDetail = '更新類別預算設定';
      else if (actionType === 'budget_delete') safeDetail = '刪除類別預算設定';
      else if (actionType === 'transaction') safeDetail = '登錄新帳務明細';
      else if (actionType === 'edit') safeDetail = '修改歷史帳務內容';
      else if (actionType === 'delete') safeDetail = '作廢撤銷交易明細';
      else if (actionType === 'calibrate') safeDetail = '帳戶餘額校正調整';
      else if (actionType === 'transfer') safeDetail = '跨帳戶資產劃撥';
      else if (actionType === 'settle') safeDetail = '共同支出代墊結算';
      else if (actionType === 'reset_data') safeDetail = '重設系統測試資料';
      else safeDetail = actionType ? `執行「${actionType}」操作` : '一般系統操作記錄';
    }

    const logEntry = {
      timestamp,
      operator: operatorName || currentUser?.email?.split('@')[0] || '系統',
      action: actionType || 'transaction',
      detail: safeDetail,
      ...(typeof extraMeta === 'object' && extraMeta !== null ? extraMeta : {})
    };

    try {
      const logsRef = collection(db, "finance", "data", "operationsLog");
      addDoc(logsRef, cleanFirestoreData(logEntry)).catch(err => console.error("Firestore Log Fail:", err));
      logger.addLog('CLOUD', `操作紀錄: ${actionType} - ${safeDetail}`);
    } catch (e) {
      console.error("Log error:", e);
    }
    if (newAssets.userOperationsLog) {
      delete newAssets.userOperationsLog;
    }
    return newAssets;
  };

  const handleRemoveBadToken = useCallback((badToken) => {
    if (!badToken) return;
    setAssets(prev => {
      const existingTokens = prev.fcmTokens || {};
      const newTokens = { ...existingTokens };
      let changed = false;

      ['userA', 'userB'].forEach(userKey => {
        const val = existingTokens[userKey];
        if (typeof val === 'object' && val) {
          if (val[badToken]) {
            const updated = { ...val };
            delete updated[badToken];
            newTokens[userKey] = updated;
            changed = true;
          }
        } else if (typeof val === 'string' && val === badToken) {
          newTokens[userKey] = {};
          changed = true;
        }
      });

      if (changed) {
        const nextAssets = { ...prev, fcmTokens: newTokens };
        if (currentUser && window.location.hostname !== 'localhost') {
          const docRef = doc(db, "finance", "data");
          setDoc(docRef, cleanFirestoreData(nextAssets)).catch(err => console.error("Error removing bad token:", err));
        }
        return nextAssets;
      }
      return prev;
    });
  }, [currentUser]);

  const isNotificationEnabledForUser = useCallback((userKey, notifCategory) => {
    const userSettings = assets?.notificationSettings?.[userKey];
    if (!userSettings) return true;
    if (userSettings.enabled === false) return false;
    if (notifCategory && userSettings[notifCategory] === false) return false;
    return true;
  }, [assets?.notificationSettings]);

  const sendTransactionPush = useCallback(async (title, body, isTest = false, targetScope = 'both', notifCategory = null) => {
    try {
      const finalTitle = cleanPushTitle(title);
      const currentUserKey = operatorName.includes('大狗狗') ? 'userA' : 'userB';
      const partnerUserKey = currentUserKey === 'userA' ? 'userB' : 'userA';

      logger.addLog('PUSH', `廣播推播: [${finalTitle}] - ${body}`, { targetScope, notifCategory, sender: operatorName });

      // 1. 計算受影響的目標使用者 (targetUserKeys)
      let targetUserKeys = [];
      if (isTest) {
        targetUserKeys = [currentUserKey];
      } else if (targetScope === 'partner') {
        targetUserKeys = [partnerUserKey];
      } else if (targetScope === 'self') {
        targetUserKeys = [currentUserKey];
      } else if (targetScope === 'both') {
        targetUserKeys = ['userA', 'userB'];
      }

      // 2. 過濾出開啟該通知類別的使用者，並收集其所有已註冊裝置的 FCM Tokens (依實體裝置嚴格去重)
      let allTokens = [];
      targetUserKeys.forEach(uKey => {
        if (isNotificationEnabledForUser(uKey, notifCategory)) {
          const userTokens = getTokensArray(assets?.fcmTokens?.[uKey]);
          allTokens.push(...userTokens);
        }
      });
      allTokens = Array.from(new Set(allTokens));

      console.log(`[Push] Target scope: ${targetScope}, category: ${notifCategory}, tokens:`, allTokens);

      if (allTokens.length === 0) {
        if (isTest) {
          showDeduplicatedNotification(finalTitle, body);
          return { success: true, targetCount: 1, message: "✅ 本機測試推播已發送！上方已成功跳出 Notification 通知彈窗。" };
        }
        const errDesc = '無已註冊並開啟通知之接收目標。';
        console.warn(`[Push] ${errDesc}`);
        return { success: false, targetCount: 0, error: errDesc };
      }

      // 3. 透過 GAS 廣播發送推播給目標裝置 (由 FCM 送達後經由 onFcmMessage/SW 統一顯示，絕不重複本地預先彈窗)
      let successCount = 0;
      let errorList = [];

      const promises = allTokens.map(token => {
        return fetch(MY_GOOGLE_API_URL, {
          method: 'POST',
          mode: 'cors',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'push',
            token: token,
            title: finalTitle,
            body
          })
        })
          .then(async (res) => {
            const text = await res.text();
            try {
              const json = JSON.parse(text);
              if (json && json.status === 'success') {
                successCount++;
              } else if (json && json.errorType === 'UNREGISTERED') {
                handleRemoveBadToken(json.token);
                errorList.push(`Token [${token.substring(0, 10)}...] 已失效 (UNREGISTERED)`);
              } else {
                errorList.push(json?.message || text || 'GAS 廣播傳送回傳非成功狀態');
              }
            } catch {
              if (res.status === 404 || text.includes('Not Found')) {
                errorList.push(`Google Apps Script 部署網址回應 404 Not Found (請檢查 GAS Web App 是否重新發布為新版本)`);
              } else {
                errorList.push(`GAS 回傳格式異常: ${text.substring(0, 100)}`);
              }
            }
          })
          .catch(err => {
            errorList.push(`網路請求連線失敗: ${err.message}`);
          });
      });

      await Promise.all(promises);

      if (successCount > 0) {
        const msg = `已成功推播至 ${successCount}/${allTokens.length} 台登入裝置！`;
        return { success: true, targetCount: successCount, message: msg };
      } else if (isTest) {
        showDeduplicatedNotification(finalTitle, body);
        return {
          success: true,
          targetCount: 1,
          message: "✅ 本機測試推播已成功彈窗！(遠端 GAS 後端返回 404，本機瀏覽器推播鏈路 100% 正常可接收通知)"
        };
      } else {
        return { success: false, targetCount: 0, error: errorList.join('; ') || '背景推播廣播失敗' };
      }
    } catch (e) {
      console.error("[Push] Send transaction push outer catch error:", e);
      return { success: false, targetCount: 0, error: e.message || String(e) };
    }
  }, [assets, operatorName, handleRemoveBadToken, isNotificationEnabledForUser]);

  // 強制全域推播廣播 (忽視任何推播開關設定，一律發送至所有已綁定裝置)
  const sendForceBroadcastPush = useCallback(async (title, body) => {
    try {
      const finalTitle = cleanPushTitle(title);
      logger.addLog('PUSH', `[強制全域廣播] [${finalTitle}] - ${body}`, { sender: operatorName });

      // 收集雙方所有裝置的 FCM tokens (依實體裝置去重)
      const allTokens = [
        ...getTokensArray(assets?.fcmTokens?.userA),
        ...getTokensArray(assets?.fcmTokens?.userB)
      ];
      const uniqueTokens = Array.from(new Set(allTokens));

      if (uniqueTokens.length === 0) {
        showDeduplicatedNotification(finalTitle, body);
        return { success: true, targetCount: 1, message: "本機已彈出通知（無其他已註冊裝置）" };
      }

      let successCount = 0;
      let errorList = [];

      const promises = uniqueTokens.map(token => {
        return fetch(MY_GOOGLE_API_URL, {
          method: 'POST',
          mode: 'cors',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'push',
            token: token,
            title: finalTitle,
            body: body
          })
        })
          .then(async (res) => {
            const text = await res.text();
            try {
              const json = JSON.parse(text);
              if (json && json.status === 'success') {
                successCount++;
              } else if (json && json.errorType === 'UNREGISTERED') {
                handleRemoveBadToken(json.token);
              } else {
                errorList.push(json?.message || text);
              }
            } catch {
              // Ignore
            }
          })
          .catch(err => {
            errorList.push(err.message);
          });
      });

      await Promise.all(promises);

      return {
        success: successCount > 0,
        targetCount: successCount,
        totalTokens: uniqueTokens.length,
        message: `已推播至 ${successCount}/${uniqueTokens.length} 台裝置！`
      };
    } catch (e) {
      console.error("[Push] sendForceBroadcastPush error:", e);
      return { success: false, targetCount: 0, error: e.message || String(e) };
    }
  }, [assets, operatorName, handleRemoveBadToken]);

  // 發送單一指定裝置精確測試推播
  const sendSingleDeviceTestPush = useCallback(async (targetToken, deviceName) => {
    if (!targetToken) return { success: false, error: '缺少目標裝置 Token' };
    try {
      const finalTitle = cleanPushTitle("🎯 單機推播測試");
      const body = `這是一則發送到【${deviceName || '指定裝置'}】的單機專屬測試推播！`;
      logger.addLog('PUSH', `[單機測試] [${deviceName}] - ${body}`, { sender: operatorName });

      const res = await fetch(MY_GOOGLE_API_URL, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'push',
          token: targetToken,
          title: finalTitle,
          body: body
        })
      });

      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}

      if (json && json.status === 'success') {
        return { success: true, message: `已成功送出測試推播至【${deviceName}】！` };
      } else if (json && json.errorType === 'UNREGISTERED') {
        handleRemoveBadToken(targetToken);
        return { success: false, error: '該裝置的推播 Token 已過期或失效，系統已自動清除該離線裝置。' };
      } else if (fcmDiagnostic?.token === targetToken) {
        showDeduplicatedNotification(finalTitle, body);
        return { success: true, message: `本機測試推播已彈窗！(遠端回應: ${json?.message || text || '404'})` };
      } else {
        return { success: false, error: json?.message || text || '發送失敗' };
      }
    } catch (e) {
      console.error("[Push] sendSingleDeviceTestPush error:", e);
      if (fcmDiagnostic?.token === targetToken) {
        showDeduplicatedNotification("🎯 單機推播測試", `這是一則發送到【${deviceName || '指定裝置'}】的單機專屬測試推播！`);
        return { success: true, message: `本機測試推播已彈窗！(網路請求異常: ${e.message})` };
      }
      return { success: false, error: e.message || String(e) };
    }
  }, [operatorName, fcmDiagnostic?.token, handleRemoveBadToken]);

  // 檢查常態帳單與信用卡帳單到期推播提醒 (全域每日最多僅發送一次，避免每次開啟 App 重複打擾)
  const checkAndTriggerBillReminders = React.useCallback(async (currentAssets) => {
    if (!currentAssets || !currentUser) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const today = new Date();

    // 1. 檢查今日全域/遠端是否已經發送過推播提醒 (同一天內最多發送一次)
    const remoteNotifiedMap = currentAssets.billReminderNotifiedMap || {};
    const localNotifiedKey = `daily_bill_reminder_sent_${todayStr}`;
    
    // 如果今天本地或雲端已經有發送紀錄，當天完全不再重複發送
    if (localStorage.getItem(localNotifiedKey) || remoteNotifiedMap[todayStr]) {
      return;
    }

    let hasSentAny = false;
    const bills = currentAssets.bills || [];
    const ccAccounts = (currentAssets.accounts || []).filter(a => a.type === 'credit');

    const pendingBillReminders = [];
    const pendingCcReminders = [];

    // 檢查常態帳單
    bills.forEach(bill => {
      if (!bill.nextDate) return;
      const due = new Date(bill.nextDate);
      const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
      const reminderDays = bill.reminderDays || 3;

      if (diffDays >= 0 && diffDays <= reminderDays) {
        pendingBillReminders.push({ bill, diffDays });
      }
    });

    // 檢查信用卡帳單
    ccAccounts.forEach(cc => {
      const bDay = cc.billingDay || 10;
      let nextDue = new Date(today.getFullYear(), today.getMonth(), bDay);
      if (nextDue < today) {
        nextDue = new Date(today.getFullYear(), today.getMonth() + 1, bDay);
      }
      const dueStr = nextDue.toISOString().split('T')[0];
      const diffDays = Math.ceil((nextDue - today) / (1000 * 60 * 60 * 24));
      const amount = Math.abs(cc.balance || 0);

      if (amount > 0 && diffDays >= 0 && diffDays <= 3) {
        pendingCcReminders.push({ cc, diffDays, dueStr, amount });
      }
    });

    // 如果今天沒有任何需要提醒的帳單，也將今天標記為已確認過，避免每次打開 App 一直重複計算
    if (pendingBillReminders.length === 0 && pendingCcReminders.length === 0) {
      localStorage.setItem(localNotifiedKey, '1');
      return;
    }

    // 立即先在本地上鎖，防止快速重複渲染觸發並行請求
    localStorage.setItem(localNotifiedKey, '1');

    // 逐筆發送推播
    for (const { bill, diffDays } of pendingBillReminders) {
      const title = `⏰ 常態帳單到期提醒：${bill.note || bill.category || bill.name}`;
      const body = `帳單【${bill.note || bill.name}】應繳金額 $${(bill.amount || 0).toLocaleString()} TWD，離到期日剩 ${diffDays} 天 (${bill.nextDate})！`;
      sendTransactionPush(title, body, false, 'both', 'billReminders');
      hasSentAny = true;
    }

    for (const { cc, diffDays, dueStr, amount } of pendingCcReminders) {
      const autoPayStr = cc.autoPay ? `🤖 自動扣繳 (${cc.linkedBankName || '活儲'})` : '🖐️ 手動劃撥';
      const title = `💳 信用卡帳單到期提醒：${cc.nickname}`;
      const body = `信用卡【${cc.nickname}】本期待繳 $${amount.toLocaleString()} TWD，離結帳/扣款日剩 ${diffDays} 天 (${dueStr})！扣繳方式：${autoPayStr}。`;
      sendTransactionPush(title, body, false, 'both', 'creditCardReminders');
      hasSentAny = true;
    }

    // 將今日已發送標記同步寫入雲端 Firestore，讓另一位使用者或另一台裝置今天打開時「絕對不再重複發送」
    if (hasSentAny && currentUser && window.location.hostname !== 'localhost') {
      try {
        const nextNotifiedMap = {
          ...remoteNotifiedMap,
          [todayStr]: new Date().toISOString()
        };
        // 保留最近 30 天紀錄，避免 map 無限膨脹
        const keys = Object.keys(nextNotifiedMap).sort();
        if (keys.length > 30) {
          keys.slice(0, keys.length - 30).forEach(k => delete nextNotifiedMap[k]);
        }
        const docRef = doc(db, "finance", "data");
        setDoc(docRef, { billReminderNotifiedMap: nextNotifiedMap }, { merge: true }).catch(err => {
          console.warn("[Push] Error syncing billReminderNotifiedMap to Firestore:", err);
        });
      } catch (err) {
        console.warn("[Push] Failed to persist bill reminder map:", err);
      }
    }
  }, [currentUser, sendTransactionPush]);

  const billReminderCheckedRef = useRef(false);
  useEffect(() => {
    if (assets && !billReminderCheckedRef.current) {
      billReminderCheckedRef.current = true;
      checkAndTriggerBillReminders(assets);
    }
  }, [assets, checkAndTriggerBillReminders]);


  const handleTransaction = (newAssets, historyRecordsInput) => {
    const timestamp = new Date().toISOString();
    const records = Array.isArray(historyRecordsInput) ? historyRecordsInput : [historyRecordsInput];

    // Recalculate legacy properties for state consistency
    const accounts = newAssets.accounts || [];
    const syncedNewAssets = {
      ...newAssets,
      userA: accounts.length > 0 ? accounts.filter(a => a.owner === 'userA' && a.currency === 'TWD').reduce((sum, a) => sum + a.balance, 0) : (newAssets.userA || 0),
      userB: accounts.length > 0 ? accounts.filter(a => a.owner === 'userB' && a.currency === 'TWD').reduce((sum, a) => sum + a.balance, 0) : (newAssets.userB || 0),
      jointCash: accounts.length > 0 ? accounts.filter(a => a.owner === 'joint' && a.currency === 'TWD').reduce((sum, a) => sum + a.balance, 0) : (newAssets.jointCash || 0),
      userA_usd: accounts.length > 0 ? accounts.filter(a => a.owner === 'userA' && a.currency === 'USD').reduce((sum, a) => sum + a.balance, 0) : (newAssets.userA_usd || 0),
      userB_usd: accounts.length > 0 ? accounts.filter(a => a.owner === 'userB' && a.currency === 'USD').reduce((sum, a) => sum + a.balance, 0) : (newAssets.userB_usd || 0),
      jointCash_usd: accounts.length > 0 ? accounts.filter(a => a.owner === 'joint' && a.currency === 'USD').reduce((sum, a) => sum + a.balance, 0) : (newAssets.jointCash_usd || 0)
    };

    // Determine base monthlyExpenses: prefer syncedNewAssets.monthlyExpenses if modified/provided, otherwise fallback to assets.monthlyExpenses
    const baseExpenses = syncedNewAssets.monthlyExpenses || assets.monthlyExpenses || [];

    // Filter out records that are already present in baseExpenses (to prevent duplicate appends when caller already added them)
    const newRecordsToAppend = records.filter(r => r && !baseExpenses.some(existing => (r.id && existing.id === r.id) || (r.timestamp && existing.timestamp === r.timestamp && existing.note === r.note)));

    const finalAssets = {
      ...syncedNewAssets,
      monthlyExpenses: [
        ...baseExpenses,
        ...newRecordsToAppend.map(r => ({
          ...r,
          operator: r.operator || operatorName,
          timestamp: r.timestamp || timestamp,
          auditTrail: r.auditTrail ? sanitizeAuditTrail(r.auditTrail) : sanitizeAuditTrail({ before: getSnapshot(assets), after: getSnapshot(syncedNewAssets) })
        }))
      ]
    };

    const logDetail = records.map(r => formatTransactionDetail(r)).join('; ');

    const finalAssetsWithLog = logOperation(finalAssets, 'transaction', logDetail);

    saveToCloud(finalAssetsWithLog);

    if (records.length > 0) {
      let title = "🔄 帳務變動通知";
      let body = `${operatorName} 執行了操作`;

      if (records.length > 1) {
        // Multi-record batch (e.g. Shopping Cart multiple entries submitted together)
        const batchCount = records.length;
        const batchTotal = records.reduce((sum, r) => sum + (Number(r.total) || 0), 0);
        const allTypes = new Set(records.map(r => r.type));

        if (allTypes.size === 1 && allTypes.has('expense')) {
          title = "🛒 登錄個人支出";
          const payerName = records[0].payer || operatorName;
          body = `${payerName} 登錄個人支出共 ${batchCount} 筆，合計 $${batchTotal.toLocaleString()} 元。請登入 App 查看詳情。`;
        } else if (allTypes.size === 1 && allTypes.has('spend')) {
          title = "🛒 登錄共同支出";
          body = `${operatorName} 登錄共同支出共 ${batchCount} 筆，合計 $${batchTotal.toLocaleString()} 元。請登入 App 查看詳情。`;
        } else if (allTypes.size === 1 && allTypes.has('income')) {
          title = "💰 登錄收入入帳";
          body = `${operatorName} 登錄收入共 ${batchCount} 筆，合計 $${batchTotal.toLocaleString()} 元。請登入 App 查看詳情。`;
        } else {
          title = "🛒 合併記帳交易";
          body = `${operatorName} 登錄帳務共 ${batchCount} 筆，合計 $${batchTotal.toLocaleString()} 元。請登入 App 查看詳情。`;
        }
      } else {
        // Single record
        const firstRecord = records[0];
        const type = firstRecord.type;
        const recordAmount = (Number(firstRecord.total) || 0).toLocaleString();

        if (type === 'transfer') {
          title = "🔄 資金轉帳劃撥";
          body = `${operatorName} 劃撥資金：${firstRecord.note || '資產劃撥'} - $${recordAmount}`;
        } else if (type === 'exchange') {
          title = "💱 貨幣換匯異動";
          body = `${operatorName} 貨幣換匯：${firstRecord.note || '換匯'} - $${recordAmount}`;
        } else if (type === 'calibrate') {
          title = "⚖️ 餘額手動校正";
          body = `${operatorName} 餘額校正：${firstRecord.note || '校正'} - $${recordAmount}`;
        } else if (type === 'settle') {
          title = "🤝 帳務結算通知";
          body = `${operatorName} 結算帳務：${firstRecord.note || '結清'} - $${recordAmount}`;
        } else if (type === 'income') {
          title = "💵 登錄個人收入";
          body = `${operatorName} 登錄收入：${firstRecord.note || '個人收入'} - $${recordAmount}`;
        } else if (type === 'liquidate') {
          title = "💰 贖回投資商品";
          body = `${operatorName} 贖回商品：${firstRecord.note || '投資贖回'} - $${recordAmount}`;
        } else if (type === 'personal_invest_profit') {
          title = "💹 投資實現損益 (獲利)";
          body = `${operatorName} 實現投資獲利：${firstRecord.note || '投資獲利'} - $${recordAmount}`;
        } else if (type === 'personal_invest_loss') {
          title = "📉 投資實現損益 (虧損)";
          body = `${operatorName} 實現投資虧損：${firstRecord.note || '投資虧損'} - $${recordAmount}`;
        } else if (type && type.includes('buy')) {
          title = "📈 買入投資商品";
          body = `${operatorName} 買入商品：${firstRecord.note || '投資買入'} - $${recordAmount}`;
        } else if (type && type.includes('sell')) {
          title = "📉 賣出投資商品";
          body = `${operatorName} 賣出商品：${firstRecord.note || '投資賣出'} - $${recordAmount}`;
        } else if (type === 'expense') {
          title = "💰 個人支出異動";
          body = `${firstRecord.payer || operatorName} 登錄個人支出：${firstRecord.note || '日記帳'} - $${recordAmount}`;
        } else if (type === 'spend') {
          title = "🤝 共同支出異動";
          const payerNameText = operatorName.includes('大狗狗') ? '大狗狗🐕' : '阿陞🐶';
          const advancedByText = firstRecord.advancedBy
            ? `由 ${firstRecord.advancedBy === 'userA' ? '大狗狗🐕' : '阿陞🐶'}代墊`
            : '共同現金直付';
          body = `${payerNameText} 登錄共同支出（${advancedByText}）：${firstRecord.note || firstRecord.category} - $${recordAmount}`;
        }
      }

      sendTransactionPush(title, body);
    }

    // 檢查是否有投資交易紀錄
    const firstInvestRecord = records.find(r => r.type && r.type.includes('invest'));
    if (firstInvestRecord && firstInvestRecord.symbol) {
      let investPayer = 'jointCash';
      if (firstInvestRecord.payer) {
        const p = firstInvestRecord.payer;
        if (p.includes('大狗狗') || p.includes('User A') || p.includes('userA')) investPayer = 'userA';
        else if (p.includes('阿陞') || p.includes('User B') || p.includes('userB')) investPayer = 'userB';
      }
      setNewlyAddedInvestSymbol(firstInvestRecord.symbol);
      setNewlyAddedInvestPayer(investPayer);
      setCurrentPage('invest');
    } else {
      setNewlyAddedRecordTimestamp(timestamp);
      setMonthlyViewSubTab('database');
      setCurrentPage('monthly');
    }
  };

  // ★ 嚴格防護的修改功能：只准改文字與日期，金額絕不可動
  const handleEditTransaction = async (context, newData) => {
    const newAssets = { ...assets };

    // --- CASE A: BATCH TRANSACTION EDIT ---
    if (newData?.batchUpdates && Array.isArray(newData.batchUpdates)) {
      let mainList = [...(newAssets.monthlyExpenses || [])];
      let arcUpdates = {}; // { [month]: list }

      newData.batchUpdates.forEach(update => {
        const itemCtx = update.context;
        if (!itemCtx) return;

        let list;
        let targetRecord;
        if (itemCtx.source === 'main') {
          list = mainList;
          targetRecord = list[itemCtx.index];
        } else {
          if (!arcUpdates[itemCtx.month]) {
            arcUpdates[itemCtx.month] = [...(archivedRecords[itemCtx.month] || [])];
          }
          list = arcUpdates[itemCtx.month];
          targetRecord = list[itemCtx.index];
        }

        if (!targetRecord) return;

        const oldDate = targetRecord.date;
        const newDate = update.date || targetRecord.date;

        let subCategory = targetRecord.subCategory;
        if (!subCategory && targetRecord.type === 'spend') {
          const oldNote = targetRecord.note || '';
          if (oldNote.includes('餐費')) subCategory = '餐費';
          else if (oldNote.includes('購物')) subCategory = '購物';
          else if (oldNote.includes('娛樂')) subCategory = '娛樂';
          else subCategory = '其他';
        }

        const mutatedRecord = {
          ...targetRecord,
          date: newDate,
          month: newDate.slice(0, 7),
          category: update.category || targetRecord.category,
          note: update.note !== undefined ? update.note : targetRecord.note,
          ...(subCategory && { subCategory }),
          operator: operatorName
        };

        if (itemCtx.source === 'main') {
          if (newAssets.dailyNetWorth) {
            if (newAssets.dailyNetWorth[oldDate]) delete newAssets.dailyNetWorth[oldDate];
            if (newAssets.dailyNetWorth[newDate]) delete newAssets.dailyNetWorth[newDate];
          }
          list[itemCtx.index] = mutatedRecord;
        } else {
          list[itemCtx.index] = mutatedRecord;
        }
      });

      newAssets.monthlyExpenses = mainList;

      // Sync any modified archive lists to Firestore
      for (const [m, arcList] of Object.entries(arcUpdates)) {
        setArchivedRecords(prev => ({ ...prev, [m]: arcList }));
        setDoc(doc(db, "finance", `arc_${m}`), cleanFirestoreData({
          month: m,
          archivedAt: new Date().toISOString(),
          records: arcList
        })).catch(async e => await customAlert("歸檔紀錄同步失敗：" + e.message, "同步失敗"));
      }

      const logDetail = `修改購物車批次紀錄 (共 ${newData.batchUpdates.length} 筆)`;
      const finalAssetsWithLog = logOperation(newAssets, 'edit', logDetail);
      saveToCloud(finalAssetsWithLog);
      sendTransactionPush("✏️ 購物車明細批次修改", `${operatorName} 修改了購物車批次之 ${newData.batchUpdates.length} 筆明細`);
      await customAlert("✅ 購物車批次紀錄修改成功！(金額與帳戶已受保護不可修改)", "修改成功");
      return;
    }

    // --- CASE B: SINGLE TRANSACTION EDIT ---
    let list;
    let targetRecord;
    if (context.source === 'main') {
      list = [...newAssets.monthlyExpenses];
      targetRecord = list[context.index];
    } else {
      list = [...archivedRecords[context.month]];
      targetRecord = list[context.index];
    }

    if (!targetRecord) return;

    const oldDate = targetRecord.date;
    const newDate = newData.date;

    // ★ 鎖定共同支出的舊分類，避免改變備註後統計圓餅圖跟著跑位
    let subCategory = targetRecord.subCategory;
    if (!subCategory && targetRecord.type === 'spend') {
      const oldNote = targetRecord.note || '';
      if (oldNote.includes('餐費')) subCategory = '餐費';
      else if (oldNote.includes('購物')) subCategory = '購物';
      else if (oldNote.includes('娛樂')) subCategory = '娛樂';
      else subCategory = '其他';
    }

    const mutatedRecord = {
      ...targetRecord,
      date: newDate,
      month: newDate.slice(0, 7),
      category: newData.category || targetRecord.category,
      note: newData.note,
      ...(subCategory && { subCategory }),
      operator: operatorName
    };

    if (context.source === 'main') {
      // 快照刪除只在活躍月進行（保護歷史冷資料庫不會因為斷聯而失去計算基準）
      if (newAssets.dailyNetWorth) {
        if (newAssets.dailyNetWorth[oldDate]) delete newAssets.dailyNetWorth[oldDate];
        if (newAssets.dailyNetWorth[newDate]) delete newAssets.dailyNetWorth[newDate];
      }
      list[context.index] = mutatedRecord;
      newAssets.monthlyExpenses = list;
    } else {
      const targetMonth = newDate.slice(0, 7);
      if (targetMonth !== context.month) {
        // ★ 跨月修復機制：若修改的日期跨越當前所屬月份，從舊歸檔庫中拔除，遣返回主區。
        list.splice(context.index, 1);
        setArchivedRecords(prev => ({ ...prev, [context.month]: list }));
        setDoc(doc(db, "finance", `arc_${context.month}`), cleanFirestoreData({
          month: context.month,
          archivedAt: new Date().toISOString(),
          records: list
        })).catch(async e => await customAlert("歷史庫舊紀錄移除失敗：" + e.message, "同步失敗"));

        // 遣送回主動區，讓安全的 Archival Engine 等等把它接走重新安置。
        newAssets.monthlyExpenses = [...(newAssets.monthlyExpenses || []), mutatedRecord];
      } else {
        list[context.index] = mutatedRecord;
        setArchivedRecords(prev => ({ ...prev, [context.month]: list }));
        setDoc(doc(db, "finance", `arc_${context.month}`), cleanFirestoreData({
          month: context.month,
          archivedAt: new Date().toISOString(),
          records: list
        })).catch(async e => await customAlert("歸檔紀錄唯讀同步失敗：" + e.message, "同步失敗"));
      }
    }

    const logDetail = `修改交易紀錄【${targetRecord.date} ${targetRecord.category} $${(targetRecord.total || 0).toLocaleString()}】的內容 -> 新內容: 日期: ${mutatedRecord.date}, 分類: ${mutatedRecord.category}, 備註: ${mutatedRecord.note}`;
    const finalAssetsWithLog = logOperation(newAssets, 'edit', logDetail);

    saveToCloud(finalAssetsWithLog);
    sendTransactionPush("✏️ 交易明細修改", `${operatorName} 修改了交易紀錄：${targetRecord.note || targetRecord.category} ➔ ${mutatedRecord.note}`);
    await customAlert("✅ 紀錄修改成功！(金額與帳戶已受保護不可修改)", "修改成功");
  };

  // ★ 完美還原的作廢功能
  const handleDeleteTransaction = async (context) => {
    // --- CASE A: BATCH DELETION ---
    if (context?.batchContexts && Array.isArray(context.batchContexts)) {
      const newAssets = {
        ...assets,
        jointInvestments: { ...(assets.jointInvestments || { stock: 0, fund: 0, deposit: 0, other: 0 }) },
        userInvestments: assets.userInvestments
          ? { userA: { ...assets.userInvestments.userA }, userB: { ...assets.userInvestments.userB } }
          : { userA: { stock: 0, fund: 0, deposit: 0, other: 0 }, userB: { stock: 0, fund: 0, deposit: 0, other: 0 } }
      };
      let updatedAccounts = assets.accounts ? [...assets.accounts] : null;

      const modifyAccountBalance = (accId, diffAmount) => {
        if (!updatedAccounts || !accId) return;
        updatedAccounts = updatedAccounts.map(a => {
          if (a.id === accId) return { ...a, balance: a.balance + diffAmount };
          return a;
        });
      };

      const reason = await customPrompt("⚠️ 即將作廢此購物車整批紀錄，系統將自動還原對應的金額。\n請輸入作廢原因（必填）：");
      if (!reason || !reason.trim()) {
        await customAlert("❌ 必須輸入作廢原因才能繼續。");
        return;
      }

      let mainList = [...(newAssets.monthlyExpenses || [])];
      let arcUpdates = {};
      let totalRefundAmt = 0;
      let firstRecord = null;

      for (const itemCtx of context.batchContexts) {
        let list;
        let record;
        if (itemCtx.source === 'main') {
          list = mainList;
          record = list[itemCtx.index];
        } else {
          if (!arcUpdates[itemCtx.month]) arcUpdates[itemCtx.month] = [...(archivedRecords[itemCtx.month] || [])];
          list = arcUpdates[itemCtx.month];
          record = list[itemCtx.index];
        }

        if (!record || record.isDeleted) continue;
        if (!firstRecord) firstRecord = record;

        totalRefundAmt += (record.total || 0);

        const safePayer = record.payer || '';
        const payerKey = (safePayer.includes('大狗狗🐕') || safePayer.includes('用戶1'))
          ? 'userA'
          : ((safePayer.includes('阿陞🐶') || safePayer.includes('用戶2')) ? 'userB' : null);

        if (record.accountId) {
          modifyAccountBalance(record.accountId, record.total);
        } else {
          if (record.type === 'spend') {
            if (record.advancedBy === 'jointCash' || !record.advancedBy) newAssets.jointCash += record.total;
            else newAssets[record.advancedBy] += record.total;
          } else {
            if (payerKey) newAssets[payerKey] += record.total;
          }
        }

        list[itemCtx.index] = {
          ...record,
          isDeleted: true,
          deleteReason: reason.trim(),
          deleteTimestamp: new Date().toISOString()
        };
      }

      if (updatedAccounts) newAssets.accounts = updatedAccounts;

      const snapshotBefore = getSnapshot(assets);
      const snapshotAfter = getSnapshot(newAssets);
      const slimmedAudit = sanitizeAuditTrail({ before: snapshotBefore, after: snapshotAfter });

      // Add single calibration record for batch refund
      const calibrateRecord = {
        date: new Date().toISOString().split('T')[0],
        month: new Date().toISOString().slice(0, 7),
        type: 'calibrate',
        category: '作廢退款',
        total: totalRefundAmt,
        note: `🗑️ 作廢退款: 購物車批次 (共 ${context.batchContexts.length} 筆，原因: ${reason.trim()})`,
        payer: firstRecord?.payer || '系統',
        operator: operatorName,
        timestamp: new Date().toISOString(),
        auditTrail: slimmedAudit,
        necessity: 'need'
      };

      mainList = [calibrateRecord, ...mainList];
      newAssets.monthlyExpenses = mainList;

      // Sync any modified archive lists
      for (const [m, arcList] of Object.entries(arcUpdates)) {
        setArchivedRecords(prev => ({ ...prev, [m]: arcList }));
        setDoc(doc(db, "finance", `arc_${m}`), cleanFirestoreData({
          month: m,
          archivedAt: new Date().toISOString(),
          records: arcList
        })).catch(async e => await customAlert("歸檔紀錄同步失敗：" + e.message));
      }

      const logDetail = `作廢購物車整批紀錄 (共 ${context.batchContexts.length} 筆，總計 $${totalRefundAmt} TWD) - 原因: ${reason.trim()}`;
      const finalAssetsWithLog = logOperation(newAssets, 'delete', logDetail);
      saveToCloud(finalAssetsWithLog);
      sendTransactionPush("🗑️ 購物車批次作廢", `${operatorName} 作廢了購物車整批紀錄 (共 ${context.batchContexts.length} 筆，退回 $${totalRefundAmt} TWD)`);
      await customAlert("🗑️ 購物車整批紀錄已作廢，相關金額已完全復原。");
      return;
    }

    // --- CASE B: SINGLE RECORD DELETION ---
    let list;
    let record;
    if (context.source === 'main') {
      list = [...(assets.monthlyExpenses || [])];
      record = list[context.index];
    } else {
      list = [...(archivedRecords[context.month] || [])];
      record = list[context.index];
    }

    if (!record) return;
    if (record.isDeleted) {
      await customAlert("❌ 這筆紀錄已經被作廢過了！");
      return;
    }
    if (record.category === '作廢退款') {
      await customAlert("❌ 「作廢退款」紀錄不可再次作廢！");
      return;
    }
    if (record.isSettled && record.advancedBy) {
      await customAlert("❌ 此筆消費已被「結清」！\n請先在流水帳中作廢「系統結算」紀錄，才能作廢此筆消費。");
      return;
    }

    const newAssets = {
      ...assets,
      jointInvestments: { ...(assets.jointInvestments || { stock: 0, fund: 0, deposit: 0, other: 0 }) },
      userInvestments: assets.userInvestments
        ? { userA: { ...assets.userInvestments.userA }, userB: { ...assets.userInvestments.userB } }
        : { userA: { stock: 0, fund: 0, deposit: 0, other: 0 }, userB: { stock: 0, fund: 0, deposit: 0, other: 0 } }
    };
    const safePayer = record.payer || '';
    const payerKey = (safePayer.includes('大狗狗🐕') || safePayer.includes('用戶1'))
      ? 'userA'
      : ((safePayer.includes('阿陞🐶') || safePayer.includes('用戶2')) ? 'userB' : null);

    let updatedAccounts = assets.accounts ? [...assets.accounts] : null;

    const modifyAccountBalance = (accId, diffAmount) => {
      if (!updatedAccounts || !accId) return;
      updatedAccounts = updatedAccounts.map(a => {
        if (a.id === accId) return { ...a, balance: a.balance + diffAmount };
        return a;
      });
    };

    // 依據交易類型，進行精準的反向加減 (包含多帳戶核心與舊版相容處理)
    switch (record.type) {
      case 'settlement':
        // 歷史結算作廢交由底下 settleId 區塊處理，這裡免操作餘額
        break;
      case 'settle':
        if (record.settledUser) {
          newAssets.jointCash += record.total;
          newAssets[record.settledUser] -= record.total;
        }
        break;
      case 'income':
      case 'personal_invest_profit':
        if (record.accountId) {
          modifyAccountBalance(record.accountId, -record.total);
        } else {
          if (payerKey) newAssets[payerKey] -= record.total;
        }
        break;
      case 'expense':
      case 'personal_invest_loss':
        if (record.accountId) {
          modifyAccountBalance(record.accountId, record.total);
        } else {
          if (payerKey) newAssets[payerKey] += record.total;
        }
        break;
      case 'spend':
        if (record.accountId) {
          modifyAccountBalance(record.accountId, record.total);
        } else {
          if (record.advancedBy === 'jointCash' || !record.advancedBy) newAssets.jointCash += record.total;
          else newAssets[record.advancedBy] += record.total;
        }
        break;
      case 'transfer':
        if (record.accountId && record.targetAccountId) {
          const sourceAmt = record.sourceAmount || record.total;
          const targetAmt = record.targetAmount || record.total;
          modifyAccountBalance(record.accountId, sourceAmt);
          modifyAccountBalance(record.targetAccountId, -targetAmt);
        } else {
          if (payerKey) newAssets[payerKey] += record.total;
          newAssets.jointCash -= record.total;
        }
        break;
      case 'exchange':
        if (record.accountId && record.targetAccountId) {
          const sourceAmt = record.sourceAmount || record.total;
          const targetAmt = record.targetAmount || (record.usdAmount || record.total);
          modifyAccountBalance(record.accountId, sourceAmt);
          modifyAccountBalance(record.targetAccountId, -targetAmt);
        } else {
          if (record.note && record.note.includes('台幣換美金')) {
            newAssets[record.accountKey] += record.total;
            if (record.usdAmount) newAssets[`${record.accountKey}_usd`] -= record.usdAmount;
          } else {
            newAssets[record.accountKey] -= record.total;
            if (record.usdAmount) newAssets[`${record.accountKey}_usd`] += record.usdAmount;
          }
        }
        break;
      case 'calibrate':
        if (record.accountId) {
          const acc = updatedAccounts ? updatedAccounts.find(a => a.id === record.accountId) : null;
          if (acc) {
            const rollbackAmt = acc.currency === 'USD'
              ? (record.usdAmount !== undefined ? record.usdAmount : record.total)
              : record.total;
            modifyAccountBalance(record.accountId, -rollbackAmt);
          } else {
            modifyAccountBalance(record.accountId, -record.total);
          }
        } else if (record.accountKey) {
          if (record.twdDiff !== undefined) newAssets[record.accountKey] -= record.twdDiff;
          if (record.usdDiff !== undefined) newAssets[`${record.accountKey}_usd`] -= record.usdDiff;
        }
        break;
      case 'joint_invest_buy':
        if (record.accountId) {
          const refundAmt = record.settleCurrency === 'USD' ? record.usdAmount : record.total;
          modifyAccountBalance(record.accountId, refundAmt);
        } else {
          if (record.settleCurrency === 'USD') newAssets.jointCash_usd = (newAssets.jointCash_usd || 0) + record.usdAmount;
          else newAssets.jointCash += record.total;
        }
        if (record.investType && newAssets.jointInvestments[record.investType] !== undefined) {
          newAssets.jointInvestments[record.investType] -= record.total;
        }
        break;
      case 'personal_invest_buy':
        if (record.accountId) {
          const refundAmt = record.settleCurrency === 'USD' ? record.usdAmount : record.total;
          modifyAccountBalance(record.accountId, refundAmt);
        } else if (record.accountKey) {
          if (record.settleCurrency === 'USD') {
            newAssets[`${record.accountKey}_usd`] = (newAssets[`${record.accountKey}_usd`] || 0) + record.usdAmount;
          } else {
            newAssets[record.accountKey] += record.total;
          }
        }
        if (record.accountKey && newAssets.userInvestments && newAssets.userInvestments[record.accountKey]) {
          newAssets.userInvestments[record.accountKey][record.investType] -= record.total;
        }
        break;
      case 'joint_invest_sell':
      case 'liquidate': {
        if (record.accountId) {
          const deductAmt = record.settleCurrency === 'USD' ? record.usdAmount : record.total;
          modifyAccountBalance(record.accountId, -deductAmt);
        } else {
          if (record.settleCurrency === 'USD') newAssets.jointCash_usd = (newAssets.jointCash_usd || 0) - record.usdAmount;
          else newAssets.jointCash -= record.total;
        }
        const sellType = record.investType || (record.note && record.note.split(' ')[1]);
        if (sellType && newAssets.jointInvestments[sellType] !== undefined) {
          newAssets.jointInvestments[sellType] += (record.principal || record.total);
        }
        break;
      }
      case 'personal_invest_sell':
        if (record.accountId) {
          const deductAmt = record.settleCurrency === 'USD' ? record.usdAmount : record.total;
          modifyAccountBalance(record.accountId, -deductAmt);
        } else if (record.accountKey) {
          if (record.settleCurrency === 'USD') {
            newAssets[`${record.accountKey}_usd`] -= record.usdAmount;
          } else {
            newAssets[record.accountKey] -= record.total;
          }
        }
        if (record.accountKey && newAssets.userInvestments && newAssets.userInvestments[record.accountKey]) {
          newAssets.userInvestments[record.accountKey][record.investType] += (record.principal || record.total);
        }
        break;
      case 'personal_invest_day_trade':
      case 'joint_invest_day_trade':
        if (record.accountId) {
          if (record.note && record.note.includes('獲利')) {
            modifyAccountBalance(record.accountId, -record.total);
          } else if (record.note && record.note.includes('虧損')) {
            modifyAccountBalance(record.accountId, record.total);
          }
        } else if (record.accountKey) {
          if (record.note && record.note.includes('獲利')) {
            newAssets[record.accountKey] -= record.total;
          } else if (record.note && record.note.includes('虧損')) {
            newAssets[record.accountKey] += record.total;
          }
        }
        break;
      default: break;
    }

    // 重新校正同步頂層 legacy 帳戶餘額以確保一致性
    if (updatedAccounts) {
      newAssets.accounts = updatedAccounts;
      newAssets.userA = updatedAccounts.filter(a => a.owner === 'userA' && a.currency === 'TWD').reduce((sum, a) => sum + a.balance, 0);
      newAssets.userB = updatedAccounts.filter(a => a.owner === 'userB' && a.currency === 'TWD').reduce((sum, a) => sum + a.balance, 0);
      newAssets.jointCash = updatedAccounts.filter(a => a.owner === 'joint' && a.currency === 'TWD').reduce((sum, a) => sum + a.balance, 0);
      newAssets.userA_usd = updatedAccounts.filter(a => a.owner === 'userA' && a.currency === 'USD').reduce((sum, a) => sum + a.balance, 0);
      newAssets.userB_usd = updatedAccounts.filter(a => a.owner === 'userB' && a.currency === 'USD').reduce((sum, a) => sum + a.balance, 0);
      newAssets.jointCash_usd = updatedAccounts.filter(a => a.owner === 'joint' && a.currency === 'USD').reduce((sum, a) => sum + a.balance, 0);
    }

    // Check if any individual account balance drops below 0 (for non-credit-card accounts)
    if (newAssets.accounts) {
      for (const a of newAssets.accounts) {
        if (a.type !== 'credit' && a.balance < 0) {
          await customAlert(`❌ 帳戶【${a.nickname}】餘額不足以進行此項作廢（作廢後餘額將變為負值 $${a.balance.toLocaleString()} ${a.currency}），操作已取消。`);
          return;
        }
      }
    }

    // Check if any balance went below 0
    if (newAssets.jointCash < 0) {
      await customAlert(`❌ 共同現金餘額不足以扣除此項目 (需額外 $${Math.abs(newAssets.jointCash).toLocaleString()})，無法作廢！`);
      return;
    }
    if ((newAssets.jointCash_usd || 0) < 0) {
      await customAlert(`❌ 共同帳戶美金餘額不足以扣除此項目 (需額外 $${Math.abs(newAssets.jointCash_usd).toFixed(2)} USD)，無法作廢！`);
      return;
    }
    if (newAssets.userA < 0) {
      await customAlert(`❌ 大狗狗🐕個人餘額不足以扣除此項目 (需額外 $${Math.abs(newAssets.userA).toLocaleString()})，無法作廢！`);
      return;
    }
    if (newAssets.userB < 0) {
      await customAlert(`❌ 阿陞🐶個人餘額不足以扣除此項目 (需額外 $${Math.abs(newAssets.userB).toLocaleString()})，無法作廢！`);
      return;
    }
    if ((newAssets.userA_usd || 0) < 0) {
      await customAlert(`❌ 大狗狗🐕美金餘額不足以扣除此項目 (需額外 $${Math.abs(newAssets.userA_usd).toFixed(2)} USD)，無法作廢！`);
      return;
    }
    if ((newAssets.userB_usd || 0) < 0) {
      await customAlert(`❌ 阿陞🐶美金餘額不足以扣除此項目 (需額外 $${Math.abs(newAssets.userB_usd).toFixed(2)} USD)，無法作廢！`);
      return;
    }

    if (newAssets.jointInvestments) {
      for (const k of Object.keys(newAssets.jointInvestments)) {
        if (newAssets.jointInvestments[k] < 0) {
          const typeName = k === 'stock' ? '股票' : k === 'fund' ? '基金' : k === 'deposit' ? '定存' : '其他';
          await customAlert(`❌ 共同帳戶的 ${typeName} 投資本金不足，無法作廢！`);
          return;
        }
      }
    }
    if (newAssets.userInvestments) {
      for (const u of ['userA', 'userB']) {
        const uName = u === 'userA' ? '大狗狗🐕' : '阿陞🐶';
        if (newAssets.userInvestments[u]) {
          for (const k of Object.keys(newAssets.userInvestments[u])) {
            if (newAssets.userInvestments[u][k] < 0) {
              const typeName = k === 'stock' ? '股票' : k === 'fund' ? '基金' : k === 'deposit' ? '定存' : '其他';
              await customAlert(`❌ ${uName} 的 ${typeName} 投資本金不足，無法作廢！`);
              return;
            }
          }
        }
      }
    }

    const reason = await customPrompt("⚠️ 即將作廢此紀錄，系統將自動還原對應的金額。\n請輸入作廢原因（必填）：");
    if (!reason || !reason.trim()) {
      await customAlert("❌ 必須輸入作廢原因才能繼續。");
      return;
    }

    const snapshotBefore = getSnapshot(assets);
    const snapshotAfter = getSnapshot(newAssets);
    const slimmedAudit = sanitizeAuditTrail({ before: snapshotBefore, after: snapshotAfter });
    const updatedRecord = {
      ...record,
      isDeleted: true,
      deleteReason: reason.trim(),
      deleteTimestamp: new Date().toISOString(),
      deleteAuditTrail: slimmedAudit
    };
    list[context.index] = updatedRecord;

    // ★ 新增一筆「作廢退款」可見紀錄，讓 TotalOverview 的變動軌跡能追蹤到這個操作
    const calibrateRecord = {
      date: new Date().toISOString().split('T')[0],
      month: new Date().toISOString().slice(0, 7),
      type: 'calibrate',
      category: '作廢退款',
      total: record.total,
      note: `🗑️ 作廢退款: ${record.note} (原因: ${reason.trim()})`,
      payer: record.payer || '系統',
      operator: operatorName,
      timestamp: new Date().toISOString(),
      auditTrail: slimmedAudit,
      necessity: record.necessity || 'need'
    };

    let mainList = [...(assets.monthlyExpenses || [])];

    if (context.source === 'main') {
      mainList = list;
    }

    // ★ 如果是「代墊結算」類型的紀錄被作廢，必須把 mainList 中對應 settleId 的消費明細還原為未結清
    if ((record.type === 'settle' || record.type === 'settlement' || record.category === '代墊結清') && (record.settleId || record.settlementId)) {
      const targetSettleId = record.settleId || record.settlementId;
      mainList = mainList.map(r => (r.type === 'spend' && (r.settleId === targetSettleId || r.settlementId === targetSettleId)) ? { ...r, isSettled: false, settleId: null, settlementId: null, settledAt: null } : r);
    }

    // ★ 如果是「信用卡帳單劃撥」類型的紀錄被作廢，必須把對應 statementId 的刷卡明細還原為未結清
    if (record.statementId || record.ccStatementId) {
      const targetStmtId = record.statementId || record.ccStatementId;
      mainList = mainList.map(r => (r.ccStatementId === targetStmtId) ? { ...r, ccBillSettled: false, ccStatementId: null } : r);
    }

    mainList.push(calibrateRecord);

    if (context.source === 'archive') {
      setArchivedRecords(prev => ({ ...prev, [context.month]: list }));
      setDoc(doc(db, "finance", `arc_${context.month}`), cleanFirestoreData({
        month: context.month,
        archivedAt: new Date().toISOString(),
        records: list
      })).catch(async (e) => await customAlert("歸檔紀錄同步失敗：" + e.message));
    }

    newAssets.monthlyExpenses = mainList;

    const logDetail = `作廢紀錄【${record.date} ${record.payer} ${record.category} $${(Number(record.total) || 0).toLocaleString()}】(原因: ${reason.trim()}, 原備註: ${record.note})`;
    const finalAssetsWithLog = logOperation(newAssets, 'delete', logDetail);

    saveToCloud(finalAssetsWithLog);
    sendTransactionPush("🗑️ 交易紀錄作廢", `${operatorName} 作廢了交易：${record.note || record.category} - $${(Number(record.total) || 0).toLocaleString()} (原因: ${reason.trim()})`);
    await customAlert("🗑️ 紀錄已作廢，相關金額與投資本本已完全復原。");
  };

  const handleAssetsUpdate = (updater) => {
    setAssets(prev => {
      const nextAssets = typeof updater === 'function' ? updater(prev) : updater;
      const cleanAssets = cleanFirestoreData(nextAssets);
      if (currentUser) {
        if (window.location.hostname === 'localhost') {
          console.log("[DEV MOCK] saveToCloud:", cleanAssets);
        } else {
          const docRef = doc(db, "finance", "data");
          setDoc(docRef, cleanAssets).catch(async (err) => await customAlert("連線錯誤：" + err.message, "連線錯誤"));
        }
      }
      return cleanAssets;
    });
  };



  if (!authResolved || (splashPhase !== 'done' && (loading || currentUser))) return (
    <div className={`splash-screen splash-phase-${splashPhase}`}>
      {/* Background aurora */}
      <div className="splash-aurora" />

      {/* Glowing core */}
      <div className="splash-core">
        <div className="splash-core-glow" />
        <div className="potato-fill-wrapper">
          <div className="potato-fill-bg">🥔</div>
          <div className="potato-fill-fg" style={{ height: `${loadProgress}%` }}>
            <div className="potato-fill-inner">🥔</div>
          </div>
          <div className="potato-fill-text">{Math.round(loadProgress)}%</div>
        </div>
      </div>

      {/* Text */}
      <div className="splash-text-group">
        <div className="splash-title">
          {splashPhase === 'filled' || splashPhase === 'exit' ? '馬鈴薯已甦醒！' : '馬鈴薯甦醒中'}
        </div>
        {splashPhase === 'loading' && (
          <div className="splash-dots">
            <span className="splash-dot" style={{ animationDelay: '0s' }}>.</span>
            <span className="splash-dot" style={{ animationDelay: '0.2s' }}>.</span>
            <span className="splash-dot" style={{ animationDelay: '0.4s' }}>.</span>
          </div>
        )}
      </div>

      {/* Golden burst rings & scatter particles (on fill complete) */}
      {(splashPhase === 'filled' || splashPhase === 'exit') && (
        <>
          <div className="splash-golden-burst">
            <div className="splash-burst-ring splash-burst-ring-1" />
            <div className="splash-burst-ring splash-burst-ring-2" />
            <div className="splash-burst-ring splash-burst-ring-3" />
          </div>
          <div className="splash-burst-particles">
            {[...Array(20)].map((_, i) => (
              <div key={i} className="splash-burst-particle" style={{
                '--angle': `${i * 18}deg`,
                '--delay': `${(i % 3) * 0.05}s`,
                '--speed': `${0.6 + (i % 4) * 0.15}s`
              }} />
            ))}
          </div>
        </>
      )}

      {/* Flash overlay on exit */}
      {splashPhase === 'exit' && <div className="splash-flash-overlay" />}
    </div>
  );
  if (!currentUser) return (
    <ErrorBoundary title="登入模組載入異常">
      <Login autoLogoutReason={autoLogoutReason} clearAutoLogoutReason={() => setAutoLogoutReason('')} />
    </ErrorBoundary>
  );



  /* navItems & BottomNav moved to module level for stable pill animation */

  return (
    <div className="app-root-container">
      {/* ★ Topbar — 內嵌 JSX */}
      <nav className="glass-nav" style={{ borderRadius: '0 0 20px 20px', marginBottom: '16px' }}>
        <button
          onClick={() => { setSettingsSubTab('budget'); handlePageChange('settings'); }}
          className="brand-glass-btn"
        >
          <span style={{ fontSize: '1.18rem' }}>🥔</span>
          <span>管家</span>
          <span style={{ fontSize: '0.68rem', fontWeight: '500', color: 'rgba(255,255,255,0.6)', marginLeft: '1px' }}>({operatorName})</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button className="glass-btn glass-btn-danger" style={{ padding: '6px 14px', fontSize: '0.8rem' }} onClick={handleLogout}>登出</button>
        </div>
      </nav>

      {!isOnline && (
        <div style={{
          margin: '0 auto 16px auto',
          padding: '12px 16px',
          borderRadius: '16px',
          background: 'rgba(239, 69, 77, 0.15)',
          border: '1px solid rgba(239, 69, 77, 0.3)',
          color: '#ff6b73',
          fontSize: '0.88rem',
          fontWeight: '500',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.2)',
          animation: 'slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
          maxWidth: '800px',
          width: 'calc(100% - 40px)',
          boxSizing: 'border-box'
        }}>
          <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>⚠️</span>
          <div style={{ lineHeight: '1.5', flexGrow: 1 }}>
            <strong>目前處於離線狀態</strong>
            <div style={{ fontSize: '0.78rem', opacity: 0.9, marginTop: '2px' }}>
              您的記帳資料會先安全存在本機，待恢復連線後自動同步。請勿清除瀏覽器資料或登出，以防資料遺失。
            </div>
          </div>
        </div>
      )}

      <div className="app-layout-desktop">
        <aside className="desktop-sidebar">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '28px', paddingLeft: '6px' }}>
              <span style={{ fontSize: '1.8rem' }}>🥔</span>
              <div>
                <div style={{ fontWeight: '850', fontSize: '1.1rem', color: '#fff', letterSpacing: '-0.02em' }}>馬鈴薯管家</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>余珈陞屌超大</div>
              </div>
            </div>

            <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginBottom: '10px', paddingLeft: '8px', fontWeight: '700' }}>
              主功能選單
            </div>

            <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {[
                { id: 'overview', label: '總覽', icon: '🏠' },
                { id: 'expense', label: '記帳', icon: '✍️' },
                { id: 'monthly', label: '財務資料庫', icon: '📊' },
                { id: 'invest', label: '投資', icon: '📈' },
                { id: 'accounts', label: '帳戶管理', icon: '🏦' },
                { id: 'settings', label: '設定', icon: '⚙️' },
              ].map(item => {
                const isActive = currentPage === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handlePageChange(item.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 14px',
                      borderRadius: '14px',
                      border: isActive ? '1px solid rgba(255,255,255,0.18)' : '1px solid transparent',
                      background: isActive ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                      color: isActive ? '#ffffff' : 'var(--text-secondary)',
                      fontSize: '0.9rem',
                      fontWeight: isActive ? '750' : '500',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                      boxShadow: isActive ? '0 4px 20px rgba(0, 0, 0, 0.2)' : 'none'
                    }}
                  >
                    <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div style={{ padding: '12px 14px', borderRadius: '16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', fontWeight: '600' }}>當前使用者</div>
              <div style={{ fontSize: '0.88rem', fontWeight: '800', color: '#fff', marginTop: '2px' }}>
                {operatorName || '系統成員'}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="glass-btn glass-btn-danger"
              style={{ padding: '6px 12px', fontSize: '0.78rem', borderRadius: '10px', cursor: 'pointer', flexShrink: 0 }}
            >
              登出
            </button>
          </div>
        </aside>

        <div className="desktop-main-canvas">
          {guidedHint && (
            <div style={{
              position: 'sticky',
              top: '12px',
              zIndex: 9999,
              marginBottom: '16px',
              background: 'linear-gradient(135deg, rgba(255, 149, 0, 0.95), rgba(255, 215, 0, 0.95))',
              color: '#000',
              padding: '12px 18px',
              borderRadius: '14px',
              fontWeight: '800',
              fontSize: '0.86rem',
              boxShadow: '0 8px 25px rgba(255, 149, 0, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              animation: 'liquid-pop-in 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
            }}>
              <span>💡 {guidedHint}</span>
              <button
                onClick={() => setGuidedHint(null)}
                style={{ background: 'rgba(0,0,0,0.15)', border: 'none', color: '#000', borderRadius: '50%', width: '24px', height: '24px', cursor: 'pointer', fontWeight: '900' }}
              >
                ✕
              </button>
            </div>
          )}
          <div key={currentPage} className="page-transition-enter">
            {currentPage === 'overview' && (
              <TotalOverview
                key="overview"
                assets={assets}
                combinedHistory={combinedHistory}
                loadArchiveMonth={loadArchiveMonth}
                isFetchingArchive={isFetchingArchive}
                setAssets={handleAssetsUpdate}
                currentFxRate={currentFxRate}
                setCurrentFxRate={setCurrentFxRate}
                hasNewUpdate={hasNewUpdate}
                onOpenChangelog={handleOpenChangelog}
              />
            )}

            {currentPage === 'monthly' && (
              <ReviewAndDatabaseView
                assets={assets}
                combinedHistory={combinedHistory}
                loadArchiveMonth={loadArchiveMonth}
                isFetchingArchive={isFetchingArchive}
                setAssets={handleAssetsUpdate}
                currentFxRate={currentFxRate}
                onTransaction={handleTransaction}
                customAlert={customAlert}
                customConfirm={customConfirm}
                customPrompt={customPrompt}
                newlyAddedRecordTimestamp={newlyAddedRecordTimestamp}
                subTab={monthlyViewSubTab}
                onChangeSubTab={setMonthlyViewSubTab}
                onDelete={handleDeleteTransaction}
                onEdit={handleEditTransaction}
                currentUser={operatorName}
                logOperation={logOperation}
              />
            )}

            {currentPage === 'invest' && (
              <InvestmentView
                key="invest"
                assets={assets}
                setAssets={handleAssetsUpdate}
                isFetchingArchive={isFetchingArchive}
                newlyAddedInvestSymbol={newlyAddedInvestSymbol}
                newlyAddedInvestPayer={newlyAddedInvestPayer}
                operatorName={operatorName}
                customAlert={customAlert}
                customConfirm={customConfirm}
                customPrompt={customPrompt}
                currentFxRate={currentFxRate}
                onTransaction={handleTransaction}
              />
            )}
            {currentPage === 'accounts' && <AccountsManager key="accounts" assets={assets} setAssets={handleAssetsUpdate} currentUser={currentUser} operatorName={operatorName} customAlert={customAlert} customConfirm={customConfirm} currentFxRate={currentFxRate} onTransaction={handleTransaction} />}
            {currentPage === 'expense' && (
              <ErrorBoundary title="✍️ 記帳與帳單模組載入異常">
                <ExpenseEntry key="expense" assets={assets} setAssets={handleAssetsUpdate} onTransaction={handleTransaction} customAlert={customAlert} customConfirm={customConfirm} customPrompt={customPrompt} getBudgetProgressText={getBudgetProgressText} currentUser={currentUser} operatorName={operatorName} currentFxRate={currentFxRate} onNavigateTab={setCurrentPage} />
              </ErrorBoundary>
            )}
            {currentPage === 'settings' && (
              <SettingsView
                assets={assets}
                saveToCloud={handleAssetsUpdate}
                currentUser={currentUser}
                operatorName={operatorName}
                customAlert={customAlert}
                customConfirm={customConfirm}
                customPrompt={customPrompt}
                activeSubTab={settingsSubTab}
                setActiveSubTab={setSettingsSubTab}
                logOperation={logOperation}
                onRequestNotificationPermission={handleRegisterNotification}
                fcmDiagnostic={fcmDiagnostic}
                onSendTestPush={() => sendTransactionPush("🎉 測試推播通知", `這是一筆由 ${operatorName} 手動發送的測試推播！收到代表推播網路鏈路完全正常！`, true)}
                onSendForceBroadcastPush={sendForceBroadcastPush}
                onSendSingleDeviceTestPush={sendSingleDeviceTestPush}
                onNavigateWithGuide={handleNavigateWithGuide}
              />
            )}
          </div>
        </div>
      </div>

      <BottomNav currentPage={currentPage} onPageChange={handlePageChange} assets={assets} lastActiveCenterTab={lastActiveCenterTab} />
      <CustomModal modalConfig={modalConfig} onConfirm={handleConfirmModal} onCancel={handleCancelModal} />
      {showTimeoutWarning && (
        <div className="liquid-modal-overlay" style={{ zIndex: 12000 }}>
          <div className="liquid-modal-card" style={{ maxWidth: '380px', padding: '24px 20px', textAlign: 'center', background: 'rgba(28,28,30,0.95)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '14px' }}>🛡️</div>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '1.2rem', fontWeight: '700', color: '#ffffff' }}>會話安全提示</h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '0.88rem', color: 'rgba(255,255,255,0.7)', lineHeight: '1.5' }}>
              您已閒置一段時間，系統為了防範財務資料外洩，將在 <strong style={{ color: 'var(--accent-red)', fontSize: '1.1rem' }}>{timeoutCountdown}</strong> 秒後自動登出。
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => performAutoLogout('inactivity')}
                className="liquid-modal-btn liquid-btn-cancel"
                style={{ flex: 1, padding: '10px', fontSize: '0.88rem' }}
              >
                立即登出
              </button>
              <button
                onClick={handleResumeSession}
                className="liquid-modal-btn liquid-btn-confirm"
                style={{ flex: 1, padding: '10px', fontSize: '0.88rem' }}
              >
                繼續使用
              </button>
            </div>
          </div>
        </div>
      )}
      {showChangelog && (
        <div className="liquid-modal-overlay" onClick={() => setShowChangelog(false)} onTouchMove={e => e.preventDefault()}>
          <div className="liquid-modal-card" style={{ maxWidth: '480px', width: '92%', maxHeight: '82vh', display: 'flex', flexDirection: 'column', padding: '24px', overflowX: 'hidden', touchAction: 'pan-y', overscrollBehavior: 'contain' }} onClick={e => e.stopPropagation()} onTouchMove={e => e.stopPropagation()}>

            {/* Tab 1: Whats New */}
            {changelogTab === 'whatsnew' && (
              <>
                <div style={{ textAlign: 'center', marginTop: '10px', marginBottom: '24px', flexShrink: 0 }}>
                  <h2 style={{
                    fontSize: '1.75rem',
                    fontWeight: '800',
                    margin: '0 0 6px 0',
                    background: 'linear-gradient(135deg, #ffffff 0%, #dcdcdc 100%)',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    letterSpacing: '-0.02em',
                    wordBreak: 'break-all'
                  }}>
                    馬鈴薯管家 系統更新
                  </h2>
                  <p style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.55)', margin: 0, wordBreak: 'break-all' }}>
                    提供更完整的資產最佳化工具與系統穩定度改善
                  </p>
                </div>

                <div style={{
                  flex: 1,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  paddingRight: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '20px',
                  overscrollBehavior: 'contain',
                  touchAction: 'pan-y'
                }}>
                  {CHANGELOG_DATA[0]?.highlights.map((h, i) => (
                    <div key={i} style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                      <div style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '10px',
                        background: h.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.4rem',
                        flexShrink: 0
                      }}>
                        {h.emoji}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <h4 style={{ margin: '0 0 3px 0', fontSize: '0.92rem', fontWeight: '700', color: '#ffffff', wordBreak: 'break-all' }}>
                          {h.title}
                        </h4>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: 'rgba(255, 255, 255, 0.6)', lineHeight: '1.45', wordBreak: 'break-all' }}>
                          {h.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ textAlign: 'center', fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', margin: '18px 0 12px 0', flexShrink: 0, wordBreak: 'break-all' }}>
                  資產數據與隱私資訊已進行安全傳輸並儲存於私有資料庫中。<br />
                  <span style={{ color: '#007aff', cursor: 'pointer', fontWeight: '600' }} onClick={() => setChangelogTab('tutorial')}>
                    檢視操作指南
                  </span>
                </div>

                <div style={{ flexShrink: 0, width: '100%' }}>
                  <button
                    className="glass-btn-cta"
                    style={{
                      width: '100%',
                      padding: '13px',
                      borderRadius: '14px',
                      fontSize: '0.95rem',
                      fontWeight: '700',
                      background: '#007aff',
                      color: '#ffffff',
                      WebkitTextFillColor: '#ffffff',
                      border: 'none',
                      cursor: 'pointer',
                      boxShadow: '0 4px 15px rgba(0, 122, 255, 0.3)',
                      transition: 'all 0.2s ease'
                    }}
                    onClick={() => setShowChangelog(false)}
                  >
                    繼續
                  </button>
                </div>
              </>
            )}

            {/* Tab 2: Tutorial */}
            {changelogTab === 'tutorial' && (
              <>
                <div style={{ textAlign: 'center', marginTop: '10px', marginBottom: '24px', flexShrink: 0 }}>
                  <h2 style={{
                    fontSize: '1.75rem',
                    fontWeight: '800',
                    margin: '0 0 6px 0',
                    background: 'linear-gradient(135deg, #ffffff 0%, #dcdcdc 100%)',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    letterSpacing: '-0.02em',
                    wordBreak: 'break-all'
                  }}>
                    系統操作指南
                  </h2>
                  <p style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.55)', margin: 0, wordBreak: 'break-all' }}>
                    協助掌握核心資產管理與交易操作步驟
                  </p>
                </div>

                <div style={{
                  flex: 1,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  paddingRight: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  overscrollBehavior: 'contain',
                  touchAction: 'pan-y'
                }}>
                  {CHANGELOG_DATA[0]?.tutorials.map((t, i) => (
                    <div key={i} style={{
                      background: 'rgba(255,255,255,0.03)',
                      padding: '12px 14px',
                      borderRadius: '12px',
                      border: '1px solid rgba(255,255,255,0.06)'
                    }}>
                      <h4 style={{ margin: '0 0 6px 0', color: 'var(--accent-blue)', fontSize: '0.88rem', fontWeight: '700', wordBreak: 'break-all' }}>
                        {i + 1}. {t.title}
                      </h4>
                      <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.65)', lineHeight: '1.45', display: 'block', wordBreak: 'break-all' }}>
                        {t.content}
                      </span>
                    </div>
                  ))}
                </div>

                <div style={{ textAlign: 'center', fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', margin: '18px 0 12px 0', flexShrink: 0, wordBreak: 'break-all' }}>
                  <span style={{ color: '#007aff', cursor: 'pointer', fontWeight: '600' }} onClick={() => setChangelogTab('whatsnew')}>
                    返回系統更新日誌
                  </span>
                </div>

                <div style={{ flexShrink: 0, width: '100%' }}>
                  <button
                    className="glass-btn-cta"
                    style={{
                      width: '100%',
                      padding: '13px',
                      borderRadius: '14px',
                      fontSize: '0.95rem',
                      fontWeight: '700',
                      background: '#007aff',
                      color: '#ffffff',
                      WebkitTextFillColor: '#ffffff',
                      border: 'none',
                      cursor: 'pointer',
                      boxShadow: '0 4px 15px rgba(0, 122, 255, 0.3)',
                      transition: 'all 0.2s ease'
                    }}
                    onClick={() => setShowChangelog(false)}
                  >
                    我瞭解了
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}
    </div>
  );
}

// ★ Apple Liquid Glass CustomModal (Declared outside render to avoid recreation/refocus issues)
const CustomModal = ({ modalConfig, onConfirm, onCancel }) => {
  const isNumericPrompt = modalConfig?.type === 'prompt' && (modalConfig?.inputMode === 'numeric' || modalConfig?.inputMode === 'decimal');
  const [inputValue, setInputValue] = useState('');

  // Keep input value in sync when modalConfig defaults change
  useEffect(() => {
    if (!modalConfig) return;
    const def = modalConfig.defaultValue || '';
    setInputValue(isNumericPrompt ? formatInputMoney(def) : def);
  }, [modalConfig, isNumericPrompt]);

  if (!modalConfig) return null;

  const handleConfirm = () => {
    if (modalConfig.type === 'prompt') {
      if (isNumericPrompt) {
        onConfirm(parseMoney(inputValue).toString());
      } else {
        onConfirm(inputValue);
      }
    } else {
      onConfirm(true);
    }
  };

  const isDanger = modalConfig.message?.includes('作廢') || modalConfig.message?.includes('刪除') || modalConfig.message?.includes('警告') || modalConfig.message?.includes('覆蓋') || modalConfig.message?.includes('登出');

  return (
    <div className="liquid-modal-overlay" style={{ zIndex: 15000 }} onClick={onCancel} onTouchMove={e => e.preventDefault()}>
      <div className="liquid-modal-card" style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }} onClick={e => e.stopPropagation()} onTouchMove={e => e.stopPropagation()}>
        <h3 className="liquid-modal-title">{modalConfig.title}</h3>
        <p className="liquid-modal-message">{modalConfig.message}</p>
        {modalConfig.type === 'prompt' && (
          <div className="liquid-modal-input-container">
            <input
              type="text"
              inputMode={modalConfig.inputMode || 'text'}
              className="liquid-modal-input"
              value={inputValue}
              onChange={(e) => {
                if (isNumericPrompt) {
                  setInputValue(formatInputMoney(e.target.value));
                } else {
                  setInputValue(e.target.value);
                }
              }}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirm();
                if (e.key === 'Escape') onCancel();
              }}
            />
          </div>
        )}
        <div className="liquid-modal-actions">
          {modalConfig.type !== 'alert' && (
            <button className="liquid-modal-btn liquid-btn-cancel" onClick={onCancel}>
              取消
            </button>
          )}
          <button
            className={`liquid-modal-btn ${isDanger ? 'liquid-btn-danger' : 'liquid-btn-confirm'}`}
            onClick={handleConfirm}
          >
            確定
          </button>
        </div>
      </div>
    </div>
  );
};

// ★ SystemSettingsModal (Declared outside to avoid hook/re-focus nesting errors)
export default App;