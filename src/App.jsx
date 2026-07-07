// src/App.jsx
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import Login from './components/Login';
import TotalOverview from './components/TotalOverview';
import MonthlyView from './components/MonthlyView';
import AssetTransfer from './components/AssetTransfer';
import InvestmentView from './components/InvestmentView';
import ExpenseEntry from './components/ExpenseEntry';
import ReviewView from './components/ReviewView';
import './index.css';
import ReviewAndDatabaseView from './components/ReviewAndDatabaseView';
import SettingsView from './components/SettingsView';
import { getBudgetForMonth } from './utils/budgetUtils';
import { db, auth } from './firebase';
import { doc, onSnapshot, setDoc, getDoc, collection, addDoc, query, orderBy, limit, getDocs, startAfter, runTransaction } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { MAKE_WEBHOOK_URL } from './config';

const LINE_NOTIFICATIONS_DISABLED = true;

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

const USER_MAPPING = {
  "ender.tsai@gmail.com": "大狗狗🐕",
  "r5213467254@icloud.com": "阿陞🐶"
};

// ★ Module‑level — stable reference so React doesn't remount
const NAV_ITEMS = [
  { id: 'monthly', icon: '📊', label: '回顧與資料庫' },
  { id: 'invest', icon: '📈', label: '投資' },
  { id: 'center', icon: '', label: '' }, // Handled specially
  { id: 'transfer', icon: '🛠️', label: '操作' },
  { id: 'settings', icon: '⚙️', label: '設定' }
];

// ★ Liquid‑glass bottom nav with sliding pill
const BottomNav = ({ currentPage, onPageChange, assets, lastActiveCenterTab }) => {
  const navRef = useRef(null);
  const [pillStyle, setPillStyle] = useState({ opacity: 0 });

  const getNavIndex = (pageId) => {
    if (pageId === 'overview' || pageId === 'expense') return 2;
    if (pageId === 'monthly') return 0;
    if (pageId === 'invest') return 1;
    if (pageId === 'transfer') return 3;
    if (pageId === 'settings') return 4;
    return -1;
  };

  useLayoutEffect(() => {
    if (!navRef.current) return;
    const idx = getNavIndex(currentPage);
    if (idx < 0) return;
    const child = navRef.current.children[idx + 1];
    if (!child) return;
    setPillStyle({
      width: child.offsetWidth,
      height: child.offsetHeight,
      transform: `translateX(${child.offsetLeft}px)`,
      opacity: 1,
      borderRadius: (currentPage === 'overview' || currentPage === 'expense') ? '50%' : '16px',
    });
  }, [currentPage]);

  const hasPendingBills = assets?.bills?.some(b => {
    const todayStr = new Date().toISOString().split('T')[0];
    return Math.ceil((new Date(b.nextDate) - new Date(todayStr)) / (1000 * 60 * 60 * 24)) <= 3;
  });

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
    <div className="bottom-nav" ref={navRef}>
      {/* Liquid glass sliding pill */}
      <div className="nav-pill" style={pillStyle} />
      {NAV_ITEMS.map((item, idx) => {
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
              <div className="nav-icon">
                {displayIcon}
                {currentPage === 'overview' && hasPendingBills && (
                  <span className="nav-warning-dot" />
                )}
              </div>
              <div className="nav-label">{displayLabel}</div>
            </div>
          );
        }

        return (
          <div
            key={item.id}
            className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => onPageChange(item.id)}
            style={{ position: 'relative' }}
          >
            <div className="nav-icon">
              {item.icon}
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

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [operatorName, setOperatorName] = useState('');
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

  const customAlert = (message, title = '提示') => {
    return new Promise((resolve) => {
      setModalConfig({
        type: 'alert',
        title,
        message,
        resolve
      });
    });
  };

  const customConfirm = (message, title = '確認') => {
    return new Promise((resolve) => {
      setModalConfig({
        type: 'confirm',
        title,
        message,
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

  const [currentPage, setCurrentPage] = useState('overview');
  const [lastActiveCenterTab, setLastActiveCenterTab] = useState('overview');
  const [monthlyViewSubTab, setMonthlyViewSubTab] = useState('review');
  const [settingsSubTab, setSettingsSubTab] = useState('budget');
  const [currentFxRate, setCurrentFxRate] = useState(31.5);

  // --- Inactivity & Session Security Protection (Task 2 & 3) ---
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);
  const [timeoutCountdown, setTimeoutCountdown] = useState(15);
  const [autoLogoutReason, setAutoLogoutReason] = useState('');
  const inactivityTimerRef = useRef(null);
  const countdownIntervalRef = useRef(null);

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

  // ★ 馬鈴薯進度條動畫引擎
  useEffect(() => {
    if (splashPhase === 'done' || splashPhase === 'exit') return;
    const interval = setInterval(() => {
      setLoadProgress(prev => {
        if (prev >= 100) return 100;
        if (dataReadyForSplash.current) return Math.min(100, prev + 12);
        if (prev < 30) return prev + 0.8;
        if (prev < 55) return prev + 0.4;
        if (prev < 75) return prev + 0.12;
        if (prev < 85) return prev + 0.03;
        return prev;
      });
    }, 50);
    return () => clearInterval(interval);
  }, [splashPhase]);

  // ★ 追蹤實際載入狀態 → 驅動進度條衝刺
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!loading && !currentUser) setSplashPhase('done');
    if (!loading && currentUser && dataReady) dataReadyForSplash.current = true;
  }, [loading, currentUser, dataReady]);

  // ★ 進度到 100% → 觸發過場
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (loadProgress >= 100 && splashPhase === 'loading') setSplashPhase('filled');
  }, [loadProgress, splashPhase]);

  // ★ 過場動畫時間軸
  useEffect(() => {
    if (splashPhase === 'filled') {
      const t = setTimeout(() => setSplashPhase('exit'), 800);
      return () => clearTimeout(t);
    }
    if (splashPhase === 'exit') {
      const t = setTimeout(() => setSplashPhase('done'), 400);
      return () => clearTimeout(t);
    }
  }, [splashPhase]);

  // ★ 超時安全閥：15 秒後強制完成
  useEffect(() => {
    const timeout = setTimeout(() => { dataReadyForSplash.current = true; }, 15000);
    return () => clearTimeout(timeout);
  }, []);

  const [showChangelog, setShowChangelog] = useState(false);
  const [changelogTab, setChangelogTab] = useState('whatsnew');
  const [hasNewUpdate, setHasNewUpdate] = useState(() => {
    const lastSeen = localStorage.getItem('potato_last_seen_version');
    return CHANGELOG_DATA.length > 0 && lastSeen !== CHANGELOG_DATA[0].version;
  });

  // ★ 自動顯示更新日誌，且控制背景滾動鎖定
  useEffect(() => {
    if (hasNewUpdate) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const [showLineSettings, setShowLineSettings] = useState(false);
  const [tempLineCount, setTempLineCount] = useState('');

  // ★ 控制所有彈窗開啟時的背景滾動與彈性滾動鎖定
  useEffect(() => {
    const shouldLock = showChangelog || !!modalConfig || showLineSettings || showTimeoutWarning;
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
  }, [showChangelog, modalConfig, showLineSettings, showTimeoutWarning]);

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
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
        setCurrentUser(user);
        setOperatorName(USER_MAPPING[user.email] || user.email.split('@')[0]);
        setAutoLogoutReason('');
        // ★ 不要在此設 loading=false，等 Firestore 資料到位後再解鎖
      } else {
        localStorage.removeItem('loginTimestamp');
        setCurrentUser(null);
        setOperatorName('');
        setDataReady(false);
        setLoading(false); // 未登入時直接解鎖，讓 Login 頁面顯示
      }
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    if (window.location.hostname === 'localhost') {
      // Mock local dev data
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
        pendingLineNotifications: [],
        lineConfig: { batchMode: false, month: new Date().toISOString().slice(0, 7) },
        lineNotifCount: { month: new Date().toISOString().slice(0, 7), count: 5 },
        config: { categories: ["餐飲食品", "生活用品", "固定費用", "投資理財", "育兒", "寵物", "其他"] },
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
        const data = docSnap.data();
        if (!data.userInvestments) {
          data.userInvestments = {
            userA: { stock: 0, fund: 0, deposit: 0, other: 0 },
            userB: { stock: 0, fund: 0, deposit: 0, other: 0 }
          };
        }
        const currentMonthStr = new Date().toISOString().slice(0, 7);
        let needsUpdate = false;
        if (!data.lineConfig || data.lineConfig.month !== currentMonthStr) {
          data.lineConfig = { batchMode: false, month: currentMonthStr };
          data.lineNotifCount = { month: currentMonthStr, count: 0 };
          needsUpdate = true;
        }
        if (!data.pendingLineNotifications) {
          data.pendingLineNotifications = [];
          needsUpdate = true;
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
                      existingMap.set(r.timestamp, r); // 如果有同時間戳的更新，以主檔案 (即將歸檔的這筆) 為主
                      archivedTimestamps.add(r.timestamp);
                    });

                    await setDoc(archiveDocRef, {
                      month: month,
                      archivedAt: new Date().toISOString(),
                      records: Array.from(existingMap.values())
                    });
                    console.log(`✅ 已安全合併歸檔 ${month}，共儲存 ${existingMap.size} 筆`);
                  }

                  // 2. 所有歷史檔案都確定寫入成功後，重新抓取最新的主檔案進行清理，改為使用事務（Transaction）以防覆蓋 race condition
                  const mainDocRef = doc(db, "finance", "data");
                  await runTransaction(db, async (transaction) => {
                    const mainSnap = await transaction.get(mainDocRef);
                    if (mainSnap.exists()) {
                      const mainData = mainSnap.data();
                      const safeMonthly = (mainData.monthlyExpenses || []).filter(r => !archivedTimestamps.has(r.timestamp));

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

                      transaction.update(mainDocRef, {
                        monthlyExpenses: safeMonthly,
                        dailyNetWorth: newSnapshots,
                        currentStockHoldings: holdingsBase
                      });
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

        if (needsUpdate) setDoc(docRef, data);

        setAssets(data);
        setDataReady(true);
        setLoading(false);
      } else {
        setDoc(docRef, assets);
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
        const allRecs = [...(assets.monthlyExpenses || [])];
        for (let i = 18; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          try {
            const snap = await getDoc(doc(db, "finance", `arc_${m}`));
            if (snap.exists() && snap.data().records) allRecs.push(...snap.data().records);
          } catch { /* skip */ }
        }
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
          await setDoc(doc(db, "finance", "data"), { currentStockHoldings: updated }, { merge: true });
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

  const saveToCloud = (newAssets) => {
    if (!currentUser) return;
    setAssets(newAssets); // 樂觀同步更新本地狀態，防範非同步同步延遲造成的 race condition
    if (window.location.hostname === 'localhost') {
      console.log("[DEV MOCK] saveToCloud:", newAssets);
      return;
    }
    const docRef = doc(db, "finance", "data");
    setDoc(docRef, newAssets).catch((err) => alert("連線錯誤：" + err.message));
  };

  // (舊的 22 點晚間自動批次發送邏輯已被移除，改用手動開關觸發收集與發送)

  const getBudgetProgressText = (newAssets, nextSpendAmount = 0) => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const budgets = getBudgetForMonth(newAssets, currentMonth);
    const budget = Object.values(budgets).reduce((sum, val) => sum + Number(val || 0), 0) || newAssets.monthlyBudget || 25000;
    const jointSpend = (newAssets.monthlyExpenses || [])
      .filter(r => !r.isDeleted && r.month === currentMonth && r.type === 'spend')
      .reduce((sum, r) => sum + (Number(r.total) || 0), 0);
    const totalWithNext = jointSpend + nextSpendAmount;
    const percentage = Math.round((totalWithNext / budget) * 100);
    return {
      percentage,
      text: `［通知］本月共同花費已達預算 ${percentage}%，請大狗狗與阿陞多加注意！`
    };
  };

  const sendLineNotification = async (data) => {
    // 🚧 此功能暫停使用：暫時關閉發送 Line 通知以節省配額或暫停通知，但保留核心邏輯
    if (LINE_NOTIFICATIONS_DISABLED) return;

    try {
      const budgetInfo = getBudgetProgressText(assets);
      const budgetSuffix = ` [預算進度: ${budgetInfo.percentage}%]`;

      const safeData = {
        title: String(data.title || "系統通知").replace(/"/g, '＂').replace(/\n/g, ' '),
        amount: String(data.amount || "$0").replace(/"/g, '＂'),
        category: String(data.category || "未分類").replace(/"/g, '＂').replace(/\n/g, ' '),
        // Fix #4: 彙整通知保留換行，一般通知清除換行
        note: data.isSummary
          ? String(data.note || "無備註").replace(/"/g, '＂') + budgetSuffix
          : String(data.note || "無備註").replace(/"/g, '＂').replace(/\n/g, ' ') + budgetSuffix,
        date: String(data.date || new Date().toISOString().split('T')[0]),
        color: String(data.color || "#666666"),
        operator: String(data.operator || operatorName || "系統").replace(/"/g, '＂')
      };
      await fetch(MAKE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(safeData)
      });
    } catch (error) {
      console.error("Line 通知發送失敗", error);
    }
  };

  const handleLogout = async () => {
    if (await customConfirm("確定要登出嗎？")) {
      localStorage.removeItem('loginTimestamp');
      signOut(auth);
    }
  };

  const getSnapshot = (currentAssets) => ({
    userA: currentAssets.userA,
    userB: currentAssets.userB,
    userA_usd: currentAssets.userA_usd || 0,
    userB_usd: currentAssets.userB_usd || 0,
    jointCash: currentAssets.jointCash,
    jointCash_usd: currentAssets.jointCash_usd || 0,
    jointInvestments: { ...(currentAssets.jointInvestments || {}) },
    userInvestments: currentAssets.userInvestments
      ? JSON.parse(JSON.stringify(currentAssets.userInvestments))
      : { userA: { stock: 0, fund: 0, deposit: 0, other: 0 }, userB: { stock: 0, fund: 0, deposit: 0, other: 0 } }
  });

  const logOperation = (newAssets, actionType, detail) => {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      operator: operatorName || currentUser?.email?.split('@')[0] || '系統',
      action: actionType,
      detail
    };
    try {
      const logsRef = collection(db, "finance", "data", "operationsLog");
      addDoc(logsRef, logEntry).catch(err => console.error("Firestore Log Fail:", err));
    } catch (e) {
      console.error("Log error:", e);
    }
    if (newAssets.userOperationsLog) {
      delete newAssets.userOperationsLog;
    }
    return newAssets;
  };

  const handleTransaction = (newAssets, historyRecordsInput) => {
    const timestamp = new Date().toISOString();
    const records = Array.isArray(historyRecordsInput) ? historyRecordsInput : [historyRecordsInput];

    const isBatch = assets.lineConfig?.batchMode;
    const increment = isBatch ? 0 : 1;

    const finalAssets = getUpdatedAssetsWithLineCount({
      ...newAssets,
      monthlyExpenses: [
        ...(assets.monthlyExpenses || []),
        ...records.map(r => ({
          ...r,
          operator: operatorName,
          timestamp: timestamp,
          auditTrail: { before: getSnapshot(assets), after: getSnapshot(newAssets) }
        }))
      ]
    }, increment);

    const appended = [];

    records.forEach(historyRecord => {
      let color = "#17c9b2"; let title = "資產變動";
      if (historyRecord.type === 'income') { color = "#06c755"; title = "收入入帳"; }
      else if (historyRecord.type === 'spend') { color = "#ef454d"; title = "共同支出"; }
      else if (historyRecord.type === 'transfer') { color = "#2b90d9"; title = "資產劃撥"; }
      else if (historyRecord.type === 'exchange') { color = "#3498db"; title = "外幣換匯"; }
      else if (historyRecord.type === 'calibrate') { color = "#95a5a6"; title = "餘額校正"; }
      else if (historyRecord.type.includes('invest_sell')) { color = "#f1c40f"; title = "投資變現"; }
      else if (historyRecord.type.includes('invest_buy')) { color = "#8e44ad"; title = "買入投資"; }
      else if (historyRecord.type.includes('invest_day_trade')) { color = "#af52de"; title = "當沖結算"; }

      let signPrefix = '';
      if (['income', 'joint_invest_sell', 'personal_invest_sell', 'personal_invest_profit', 'liquidate'].includes(historyRecord.type)) { signPrefix = '+'; }
      else if (['spend', 'expense', 'joint_invest_buy', 'personal_invest_buy', 'personal_invest_loss'].includes(historyRecord.type)) { signPrefix = '-'; }
      else if (['transfer', 'settle', 'exchange', 'calibrate'].includes(historyRecord.type)) { signPrefix = '🔄 '; }
      else if (historyRecord.type.includes('invest_day_trade')) {
        signPrefix = (historyRecord.note && historyRecord.note.includes('獲利')) ? '+' : '-';
      }

      const usdNote = historyRecord.usdAmount ? ` (含 $${historyRecord.usdAmount} USD)` : '';
      const payload = { title: title, amount: `${signPrefix}$${(Number(historyRecord.total) || 0).toLocaleString()}`, category: historyRecord.category, note: `${historyRecord.note || '無'}${usdNote}`, date: historyRecord.date, color: color, operator: operatorName };

      if (isBatch) appended.push(payload);
      else sendLineNotification(payload);
    });

    if (isBatch) finalAssets.pendingLineNotifications = [...(assets.pendingLineNotifications || []), ...appended];

    const logDetail = records.map(r => {
      const amountStr = `$${(Number(r.total) || 0).toLocaleString()}`;
      if (r.type === 'income') return `收入入帳 ${amountStr} (${r.category} - ${r.note || '無備註'})`;
      if (r.type === 'transfer') return `資金轉移 ${amountStr} (備註: ${r.note || '無備註'})`;
      if (r.type === 'exchange') return `外幣換匯 ${amountStr} (備註: ${r.note || '無備註'})`;
      if (r.type === 'calibrate') return `餘額校正 ${amountStr} (備註: ${r.note || '無備註'})`;
      if (r.type.includes('invest_sell')) return `投資賣出變現 ${amountStr} (標的: ${r.symbol || '無'}, 備註: ${r.note || '無'})`;
      if (r.type.includes('invest_buy')) return `買入投資標的 ${amountStr} (標的: ${r.symbol || '無'}, 備註: ${r.note || '無'})`;
      return `進行變動 ${amountStr}`;
    }).join('; ');

    const finalAssetsWithLog = logOperation(finalAssets, 'transaction', logDetail);

    saveToCloud(finalAssetsWithLog);
    
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

  const handleAddExpense = async (date, expenseData, totalAmount, payer, note, updatedBills = null) => {
    const payerKey = payer === 'userA' ? 'userA' : 'userB';
    const payerName = payer === 'userA' ? '大狗狗🐕' : '阿陞🐶';

    // Fix #2: 加入 return 攔截餘額不足的操作
    if (assets[payerKey] < totalAmount) {
      await customAlert(`⚠️ ${payerName} 的個人餘額不足！`);
      return;
    }

    const finalNote = note || '日記帳';
    const newAssetsTemp = { ...assets, [payerKey]: assets[payerKey] - totalAmount };

    const isBatch = assets.lineConfig?.batchMode;
    const targetTimestamp = new Date().toISOString();
    const finalAssets = getUpdatedAssetsWithLineCount({
      ...newAssetsTemp,
      ...(updatedBills ? { bills: updatedBills } : {}),
      monthlyExpenses: [
        ...(assets.monthlyExpenses || []),
        {
          date, month: date.slice(0, 7), type: 'expense', category: '個人支出', details: expenseData,
          total: totalAmount, payer: payerName, operator: operatorName, note: finalNote,
          timestamp: targetTimestamp, auditTrail: { before: getSnapshot(assets), after: getSnapshot(newAssetsTemp) },
          necessity: 'need'
        }
      ]
    }, isBatch ? 0 : 1);

    const payload = { title: "個人日記帳", amount: `-$${totalAmount.toLocaleString()}`, category: "個人支出", note: finalNote, date: date, color: "#ef454d", operator: operatorName };
    if (isBatch) finalAssets.pendingLineNotifications = [...(assets.pendingLineNotifications || []), payload];

    const logDetail = `新增個人支出 $${totalAmount.toLocaleString()} (${finalNote})`;
    const finalAssetsWithLog = logOperation(finalAssets, 'expense_add', logDetail);

    saveToCloud(finalAssetsWithLog);
    setNewlyAddedRecordTimestamp(targetTimestamp);
    setMonthlyViewSubTab('database');
    setCurrentPage('monthly');
    if (!isBatch) sendLineNotification(payload);
  };

  const handleAddJointExpense = async (date, category, amount, advancedBy, note, updatedBills = null) => {
    const val = Number(amount) || 0;
    const newAssets = { ...assets };

    let paymentMethodName = "共同帳戶直接付";
    if (advancedBy === 'jointCash') {
      if (newAssets.jointCash < val) {
        await customAlert("❌ 共同現金不足！");
        return;
      }
      newAssets.jointCash -= val;
    } else if (advancedBy === 'userA') {
      if (newAssets.userA < val) {
        await customAlert("❌ 大狗狗🐕的個人餘額不足以代墊！");
        return;
      }
      newAssets.userA -= val;
      paymentMethodName = "大狗狗🐕先墊 (User A)";
    } else if (advancedBy === 'userB') {
      if (newAssets.userB < val) {
        await customAlert("❌ 阿陞🐶的個人餘額不足以代墊！");
        return;
      }
      newAssets.userB -= val;
      paymentMethodName = "阿陞🐶先墊 (User B)";
    }

    const safeNote = note ? String(note).trim() : '';
    const isBatch = assets.lineConfig?.batchMode;

    const targetTimestamp = new Date().toISOString();
    const finalAssets = getUpdatedAssetsWithLineCount({
      ...newAssets,
      ...(updatedBills ? { bills: updatedBills } : {}),
      monthlyExpenses: [
        ...(newAssets.monthlyExpenses || []),
        {
          date, month: date.slice(0, 7), type: 'spend', category: '共同支出', payer: '共同帳戶',
          total: val, note: safeNote ? `${category} - ${safeNote}` : category,
          operator: operatorName, advancedBy: advancedBy === 'jointCash' ? null : advancedBy,
          isSettled: false, timestamp: targetTimestamp, auditTrail: { before: getSnapshot(assets), after: getSnapshot(newAssets) },
          necessity: 'need', subCategory: category
        }
      ]
    }, isBatch ? 0 : 1);

    const payload = { title: "共同支出", amount: `-$${val.toLocaleString()}`, category: "共同支出", note: safeNote ? `${category} - ${safeNote}` : category, date: date, color: "#ef454d", operator: operatorName };
    if (isBatch) finalAssets.pendingLineNotifications = [...(assets.pendingLineNotifications || []), payload];

    const logDetail = `新增共同支出 $${val.toLocaleString()} (${category} - ${safeNote || '無備註'})`;
    const finalAssetsWithLog = logOperation(finalAssets, 'expense_add', logDetail);

    saveToCloud(finalAssetsWithLog);
    setNewlyAddedRecordTimestamp(targetTimestamp);
    setMonthlyViewSubTab('database');
    setCurrentPage('monthly');
    if (!isBatch) sendLineNotification(payload);
  };

  // ★ 嚴格防護的修改功能：只准改文字與日期，金額絕不可動
  const handleEditTransaction = (context, newData) => {
    const newAssets = { ...assets };

    let list;
    let targetRecord;
    if (context.source === 'main') {
      list = [...newAssets.monthlyExpenses];
      targetRecord = list[context.index];
    } else {
      list = [...archivedRecords[context.month]];
      targetRecord = list[context.index];
    }

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
      category: newData.category,
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
        setDoc(doc(db, "finance", `arc_${context.month}`), {
          month: context.month,
          archivedAt: new Date().toISOString(),
          records: list
        }).catch(e => alert("歷史庫舊紀錄移除失敗：" + e.message));

        // 遣送回主動區，讓安全的 Archival Engine 等等把它接走重新安置。
        newAssets.monthlyExpenses = [...(newAssets.monthlyExpenses || []), mutatedRecord];
      } else {
        list[context.index] = mutatedRecord;
        setArchivedRecords(prev => ({ ...prev, [context.month]: list }));
        setDoc(doc(db, "finance", `arc_${context.month}`), {
          month: context.month,
          archivedAt: new Date().toISOString(),
          records: list
        }).catch(e => alert("歸檔紀錄唯讀同步失敗：" + e.message));
      }
    }

    const logDetail = `修改交易紀錄「${mutatedRecord.note}」的內容 (日期/備註/分類)`;
    const finalAssetsWithLog = logOperation(newAssets, 'edit', logDetail);

    saveToCloud(finalAssetsWithLog);
    alert("✅ 紀錄修改成功！(金額與帳戶已受保護不可修改)");
  };

  // ★ 完美還原的作廢功能
  const handleDeleteTransaction = async (context) => {
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

    // 依據交易類型，進行精準的反向加減 (包含美金與台幣)
    switch (record.type) {
      case 'settle':
        if (record.settledUser) {
          newAssets.jointCash += record.total;
          newAssets[record.settledUser] -= record.total;
        }
        break;
      case 'income':
      case 'personal_invest_profit':
        if (payerKey) newAssets[payerKey] -= record.total; break;
      case 'expense':
      case 'personal_invest_loss':
        if (payerKey) newAssets[payerKey] += record.total; break;
      case 'spend':
        if (record.advancedBy === 'jointCash' || !record.advancedBy) newAssets.jointCash += record.total;
        else newAssets[record.advancedBy] += record.total;
        break;
      case 'transfer':
        if (payerKey) newAssets[payerKey] += record.total;
        newAssets.jointCash -= record.total;
        break;
      case 'exchange':
        if (record.note && record.note.includes('台幣換美金')) {
          newAssets[record.accountKey] += record.total;
          if (record.usdAmount) newAssets[`${record.accountKey}_usd`] -= record.usdAmount;
        } else {
          newAssets[record.accountKey] -= record.total;
          if (record.usdAmount) newAssets[`${record.accountKey}_usd`] += record.usdAmount;
        }
        break;
      case 'calibrate':
        if (record.accountKey) {
          if (record.twdDiff !== undefined) newAssets[record.accountKey] -= record.twdDiff;
          if (record.usdDiff !== undefined) newAssets[`${record.accountKey}_usd`] -= record.usdDiff;
        }
        break;
      case 'joint_invest_buy':
        if (record.settleCurrency === 'USD') newAssets.jointCash_usd = (newAssets.jointCash_usd || 0) + record.usdAmount;
        else newAssets.jointCash += record.total;

        if (record.investType && newAssets.jointInvestments[record.investType] !== undefined) {
          newAssets.jointInvestments[record.investType] -= record.total;
        }
        break;
      case 'personal_invest_buy':
        if (record.accountKey && newAssets.userInvestments && newAssets.userInvestments[record.accountKey]) {
          if (record.settleCurrency === 'USD') {
            newAssets[`${record.accountKey}_usd`] = (newAssets[`${record.accountKey}_usd`] || 0) + record.usdAmount;
          } else {
            newAssets[record.accountKey] += record.total;
          }
          newAssets.userInvestments[record.accountKey][record.investType] -= record.total;
        }
        break;
      case 'joint_invest_sell':
      case 'liquidate': {
        if (record.settleCurrency === 'USD') newAssets.jointCash_usd = (newAssets.jointCash_usd || 0) - record.usdAmount;
        else newAssets.jointCash -= record.total;

        const sellType = record.investType || (record.note && record.note.split(' ')[1]);
        if (sellType && newAssets.jointInvestments[sellType] !== undefined) {
          newAssets.jointInvestments[sellType] += (record.principal || record.total);
        }
        break;
      }
      case 'personal_invest_sell':
        if (record.accountKey && newAssets.userInvestments && newAssets.userInvestments[record.accountKey]) {
          if (record.settleCurrency === 'USD') {
            newAssets[`${record.accountKey}_usd`] -= record.usdAmount;
          } else {
            newAssets[record.accountKey] -= record.total;
          }
          newAssets.userInvestments[record.accountKey][record.investType] += (record.principal || record.total);
        }
        break;
      case 'personal_invest_day_trade':
      case 'joint_invest_day_trade':
        if (record.note && record.note.includes('獲利')) {
          newAssets[record.accountKey] -= record.total;
        } else if (record.note && record.note.includes('虧損')) {
          newAssets[record.accountKey] += record.total;
        }
        break;
      default: break;
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
    const updatedRecord = {
      ...record,
      isDeleted: true,
      deleteReason: reason.trim(),
      deleteTimestamp: new Date().toISOString(),
      deleteAuditTrail: { before: snapshotBefore, after: snapshotAfter }
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
      auditTrail: { before: snapshotBefore, after: snapshotAfter },
      necessity: record.necessity || 'need'
    };

    let mainList = [...(assets.monthlyExpenses || [])];

    if (context.source === 'main') {
      mainList = list;
    }

    // ★ 如果是「系統結算」類型的紀錄被作廢，必須把 mainList 中對應 settleId 的消費明細還原為未結清
    if (record.type === 'settle' && record.settleId) {
      mainList = mainList.map(r => (r.type === 'spend' && r.settleId === record.settleId) ? { ...r, isSettled: false, settleId: null } : r);
    }

    mainList.push(calibrateRecord);

    if (context.source === 'archive') {
      setArchivedRecords(prev => ({ ...prev, [context.month]: list }));
      setDoc(doc(db, "finance", `arc_${context.month}`), {
        month: context.month,
        archivedAt: new Date().toISOString(),
        records: list
      }).catch(async (e) => await customAlert("歸檔紀錄同步失敗：" + e.message));
    }

    newAssets.monthlyExpenses = mainList;

    const isBatch = assets.lineConfig?.batchMode;
    const finalAssets = getUpdatedAssetsWithLineCount(newAssets, isBatch ? 0 : 1);

    const payload = { title: "🗑️ 刪除/作廢紀錄", amount: `🔄$${(Number(record.total) || 0).toLocaleString()}`, category: record.category, note: `已作廢: ${record.note} (原因: ${reason.trim()})`, date: new Date().toISOString().split('T')[0], color: "#666666", operator: operatorName };
    if (isBatch) finalAssets.pendingLineNotifications = [...(assets.pendingLineNotifications || []), payload];

    const logDetail = `作廢「${record.note}」共 $${(Number(record.total) || 0).toLocaleString()} (原因: ${reason.trim()})`;
    const finalAssetsWithLog = logOperation(finalAssets, 'delete', logDetail);

    saveToCloud(finalAssetsWithLog);
    if (!isBatch) sendLineNotification(payload);
    await customAlert("🗑️ 紀錄已作廢，相關金額與投資本金已完全復原。");
  };

  const handleAssetsUpdate = (updatedAssets) => { saveToCloud(updatedAssets); };

  // Fix #9: 將 getUpdatedAssetsWithLineCount 移到 early return 之前，避免 hoisting 問題
  const getUpdatedAssetsWithLineCount = (assetsCopy, increment = 1) => {
    if (LINE_NOTIFICATIONS_DISABLED) return assetsCopy;
    const currentMonth = new Date().toISOString().slice(0, 7);
    let newCountObj = { month: currentMonth, count: increment };
    if (assetsCopy.lineNotifCount && assetsCopy.lineNotifCount.month === currentMonth) {
      newCountObj.count = assetsCopy.lineNotifCount.count + increment;
    }
    return { ...assetsCopy, lineNotifCount: newCountObj };
  };

  if (splashPhase !== 'done' && (loading || currentUser)) return (
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
  if (!currentUser) return <Login autoLogoutReason={autoLogoutReason} clearAutoLogoutReason={() => setAutoLogoutReason('')} />;

  // ★ Fix: 不再定義為 render 內的元件，改為預計算變數 + 內嵌 JSX，避免輸入時元件重建導致失焦
  const currentMonth_tb = new Date().toISOString().slice(0, 7);
  const lineCount_tb = (assets.lineNotifCount && assets.lineNotifCount.month === currentMonth_tb) ? assets.lineNotifCount.count : 0;
  const limitWarning_tb = lineCount_tb >= 185;
  const isBatch_ls = assets.lineConfig?.batchMode || false;

  const handleToggleBatchMode = () => {
    if (isBatch_ls) {
      let willSend = false;
      if (assets.pendingLineNotifications && assets.pendingLineNotifications.length > 0) {
        const summaryList = assets.pendingLineNotifications.map((n, i) => `${i + 1}. ${n.title}: ${n.note} (${n.amount})`).join('\\n').slice(0, 800);
        const batchPayload = {
          title: "手動批次變動彙整",
          amount: `共 ${assets.pendingLineNotifications.length} 筆`,
          category: "系統彙整",
          note: summaryList,
          date: new Date().toISOString().split('T')[0] + '（本日期為系統彙整日，以上逐筆個別日期請至App中查看。）',
          color: "#9b59b6",
          operator: "累積總結推播",
          isSummary: true
        };
        sendLineNotification(batchPayload);
        willSend = true;
        alert(`📤 已為您合併發出共 ${assets.pendingLineNotifications.length} 筆通知！`);
      } else {
        alert(`沒有累積等待中的通知。已關閉暫存模式。`);
      }
      const finalAssets = getUpdatedAssetsWithLineCount({
        ...assets,
        pendingLineNotifications: [],
        lineConfig: { ...assets.lineConfig, batchMode: false }
      }, willSend ? 1 : 0);
      saveToCloud(finalAssets);
    } else {
      saveToCloud({
        ...assets,
        lineConfig: { ...assets.lineConfig, batchMode: true }
      });
    }
  };

  /* navItems & BottomNav moved to module level for stable pill animation */

  return (
    <div style={{ paddingBottom: '110px' }}>
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
          <button onClick={() => { setSettingsSubTab('line'); handlePageChange('settings'); }} style={{ fontSize: '0.72rem', fontFamily: 'var(--font-family)', background: limitWarning_tb ? 'rgba(255,59,48,0.08)' : 'rgba(120,120,128,0.08)', color: limitWarning_tb ? 'var(--accent-red)' : 'var(--text-secondary)', padding: '6px 12px', borderRadius: 'var(--radius-pill)', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: limitWarning_tb ? '700' : '500', border: limitWarning_tb ? '1px solid rgba(255,59,48,0.25)' : '1px solid transparent', animation: limitWarning_tb ? 'pulseRed 1.5s infinite' : 'none', cursor: 'pointer', transition: 'all 0.2s ease' }}>
            {LINE_NOTIFICATIONS_DISABLED ? '💬 停用中' : `💬 ${lineCount_tb}/200`}
            {!LINE_NOTIFICATIONS_DISABLED && limitWarning_tb && <span>⚠️</span>}
          </button>
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

      <div key={currentPage} className="page-transition-enter" style={{ padding: '0 20px', maxWidth: '800px', margin: '0 auto' }}>

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
          />
        )}

        {currentPage === 'invest' && (
          <InvestmentView
            key="invest"
            assets={assets}
            isFetchingArchive={isFetchingArchive}
            newlyAddedInvestSymbol={newlyAddedInvestSymbol}
            newlyAddedInvestPayer={newlyAddedInvestPayer}
          />
        )}
        {currentPage === 'transfer' && <AssetTransfer key="transfer" assets={assets} setAssets={handleAssetsUpdate} onTransaction={handleTransaction} currentFxRate={currentFxRate} customAlert={customAlert} customConfirm={customConfirm} />}
        {currentPage === 'expense' && <ExpenseEntry key="expense" assets={assets} setAssets={handleAssetsUpdate} onAddExpense={handleAddExpense} onAddJointExpense={handleAddJointExpense} onTransaction={handleTransaction} customAlert={customAlert} customConfirm={customConfirm} customPrompt={customPrompt} getBudgetProgressText={getBudgetProgressText} />}
        {currentPage === 'settings' && (
          <SettingsView
            assets={assets}
            saveToCloud={handleAssetsUpdate}
            currentUser={currentUser}
            operatorName={operatorName}
            customAlert={customAlert}
            customConfirm={customConfirm}
            activeSubTab={settingsSubTab}
            setActiveSubTab={setSettingsSubTab}
          />
        )}
      </div>

      <BottomNav currentPage={currentPage} onPageChange={handlePageChange} assets={assets} lastActiveCenterTab={lastActiveCenterTab} />
      <CustomModal modalConfig={modalConfig} onConfirm={handleConfirmModal} onCancel={handleCancelModal} />
      {showTimeoutWarning && (
        <div className="liquid-modal-overlay" style={{ zIndex: 9999 }}>
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    <div className="liquid-modal-overlay" onClick={onCancel} onTouchMove={e => e.preventDefault()}>
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