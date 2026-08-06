// src/components/HelpWizard.jsx
import React, { useState, useMemo } from 'react';

const WIZARD_CATEGORIES = [
  {
    id: 'expense',
    name: '💸 支出與購物',
    icon: '🛍️',
    description: '個人消費、買共同資產、代墊款項、每月常態訂閱',
    color: '#ff9500',
    scenarios: [
      {
        id: 'exp_personal',
        title: '我現在要記一筆「個人自己付」的日常消費 (如刷卡買晚餐)',
        route: '選單【記帳】 ➔ 子頁籤【👤 個人記帳】',
        targetPage: 'expense',
        targetTab: 'personal',
        targetHint: '已帶您前往【記帳 ➔ 個人記帳】！點擊選擇帳戶與類別即可登錄。',
        steps: [
          '點擊下方選單的「✍️ 記帳登錄」。',
          '選擇上方子頁籤「👤 個人記帳」。',
          '選擇付款帳戶（如中信活儲或主力信用卡），填寫金額與備註後點擊「確定送出」。'
        ]
      },
      {
        id: 'exp_joint',
        title: '我現在要買一個東西，並且這個東西是「雙方分攤的共同資產」',
        route: '選單【記帳】 ➔ 子頁籤【🏫 共同記帳】',
        targetPage: 'expense',
        targetTab: 'joint',
        targetHint: '已帶您前往【記帳 ➔ 共同記帳】！點擊選擇由共同帳戶扣款或個人代墊。',
        steps: [
          '點擊下方選單的「✍️ 記帳登錄」。',
          '切換至「🏫 共同記帳」分頁。',
          '若由共同現金/帳戶扣款，付款人選「共同帳戶」；若您先刷自己的卡代墊，付款人選「個人帳戶」並選擇代墊人。'
        ]
      },
      {
        id: 'exp_advance',
        title: '我幫對方刷卡/付錢代墊了一筆費用',
        route: '選單【記帳】 ➔ 子頁籤【🏫 共同記帳】',
        targetPage: 'expense',
        targetTab: 'joint',
        targetHint: '已帶您前往【記帳 ➔ 共同記帳】！付款人選您的帳戶，並設定代墊對象。',
        steps: [
          '進入「✍️ 記帳登錄 ➔ 🏫 共同記帳」。',
          '付款帳戶選擇您自己的帳戶（如您的信用卡）。',
          '系統會自動計算代墊債務，並在結算時自動歸還金額！'
        ]
      },
      {
        id: 'exp_recurring',
        title: '我想設定每個月固定要扣款的常態訂閱 (如 Netflix、房租)',
        route: '選單【記帳】 ➔ 子頁籤【📅 帳單】 ➔ 【➕ 新增常態帳單】',
        targetPage: 'expense',
        targetTab: 'bills',
        targetHint: '已帶您前往【記帳 ➔ 帳單】！點擊右上方「➕ 新增常態帳單」。',
        steps: [
          '進入「✍️ 記帳 ➔ 📅 帳單」分頁。',
          '點擊右上角「➕ 新增常態帳單」按鈕。',
          '填寫名稱、每月扣款日期與金額，系統到了預定日會自動醒目標示提醒！'
        ]
      }
    ]
  },
  {
    id: 'income',
    name: '💰 收入與入帳',
    icon: '💵',
    description: '每月薪資、獎金入帳、公費撥款、股息紅利',
    color: '#34c759',
    scenarios: [
      {
        id: 'inc_salary',
        title: '我收到每月薪資或工作獎金入帳了',
        route: '選單【記帳】 ➔ 上方模式選擇【💰 收入入帳】',
        targetPage: 'expense',
        targetMode: 'income',
        targetHint: '已帶您前往【記帳 ➔ 收入入帳】！選擇存入的銀行活儲帳戶。',
        steps: [
          '進入「✍️ 記帳登錄」頁面。',
          '將上方主要模式切換為「💰 收入入帳」。',
          '類別選擇「薪資」或「獎金」，選擇存入帳戶並輸入金額送出。'
        ]
      },
      {
        id: 'inc_joint_pool',
        title: '雙方各自撥款注入共同公費 / 公費金庫',
        route: '選單【帳戶】 ➔ 上方頁籤【🔁 資金劃撥】',
        targetPage: 'accounts',
        targetTab: 'transfer',
        targetHint: '已帶您前往【帳戶 ➔ 資金劃撥】！轉出選個人帳戶，轉入選共同帳戶。',
        steps: [
          '進入「🏦 帳戶管理 ➔ 🔁 資金劃撥」。',
          '轉出帳戶選擇您的個人活儲；轉入帳戶選擇「共同台幣現金/帳戶」。',
          '輸入劃撥金額並執行，個人資產會轉為共同公費，預算自動更新！'
        ]
      },
      {
        id: 'inc_dividend',
        title: '股票發放股息或利息入帳了',
        route: '選單【記帳】 ➔ 切換【💰 收入入帳】 ➔ 類別選【投資】',
        targetPage: 'expense',
        targetMode: 'income',
        targetHint: '已帶您前往【記帳 ➔ 收入入帳】！類別請選擇「投資」。',
        steps: [
          '進入「✍️ 記帳 ➔ 💰 收入入帳」。',
          '類別選擇「投資」，存入帳戶選擇接收股息的交割/活儲帳戶。'
        ]
      }
    ]
  },
  {
    id: 'credit_card',
    name: '💳 信用卡與帳單',
    icon: '💳',
    description: '信用卡繳費、自動扣繳設定、水電房租常態帳單',
    color: '#af52de',
    scenarios: [
      {
        id: 'cc_manual_pay',
        title: '我現在實際上繳交了一張信用卡帳單，要怎麼紀錄？',
        route: '選單【記帳】 ➔ 子頁籤【📅 帳單】 ➔ 點擊信用卡卡片劃撥',
        targetPage: 'expense',
        targetTab: 'bills',
        targetHint: '已帶您前往【帳單中心】！點擊對應信用卡卡片即可選擇活儲劃撥繳納。',
        steps: [
          '進入「✍️ 記帳 ➔ 📅 帳單」分頁。',
          '在列表中找到該張信用卡帳單卡片並點擊。',
          '選擇扣款的銀行活儲帳戶並確認！系統會執行「資金劃撥」，扣除活儲並歸零信用卡負債，**不會重複扣減消費預算**！'
        ]
      },
      {
        id: 'cc_auto_pay_config',
        title: '我想設定信用卡每月自動從銀行活儲扣繳 (Auto-Pay)',
        route: '選單【帳戶】 ➔ 點擊信用卡【✏️ 編輯】 ➔ 開啟【自動執行扣款結清】',
        targetPage: 'accounts',
        targetHint: '已帶您前往【帳戶管理】！請找到該信用卡點擊「✏️ 編輯」。',
        steps: [
          '進入「🏦 帳戶管理」。',
          '找到該張信用卡，點擊「✏️ 編輯」。',
          '選擇「綁定扣款活儲」與「每月扣款日」，並開啟「自動執行扣款結清 (Auto-Pay)」。到期日當天系統會自動進行劃撥結清！'
        ]
      }
    ]
  },
  {
    id: 'transfer_fx',
    name: '🔁 資金劃撥與換匯',
    icon: '🔄',
    description: '銀行轉帳、提款、美金/外幣換匯、公費劃撥',
    color: '#5856d6',
    scenarios: [
      {
        id: 'tf_bank_transfer',
        title: '我想把錢從一個銀行帳戶轉到另一個銀行帳戶 (台幣轉台幣)',
        route: '選單【帳戶】 ➔ 上方頁籤【🔁 資金劃撥】',
        targetPage: 'accounts',
        targetTab: 'transfer',
        targetHint: '已帶您前往【帳戶 ➔ 資金劃撥】！選擇轉出與轉入帳戶。',
        steps: [
          '進入「🏦 帳戶管理 ➔ 🔁 資金劃撥」。',
          '選擇轉出帳戶與轉入帳戶，填寫金額。',
          '點擊「🚀 執行劃撥」，總資產保持不變，內部餘額自動轉移！'
        ]
      },
      {
        id: 'tf_exchange_usd',
        title: '我想買美金 / 外幣換匯 (把台幣換成外幣)',
        route: '選單【帳戶】 ➔ 上方頁籤【💱 外幣換匯】',
        targetPage: 'accounts',
        targetTab: 'exchange',
        targetHint: '已帶您前往【帳戶 ➔ 外幣換匯】！選擇台幣與外幣帳戶。',
        steps: [
          '進入「🏦 帳戶管理 ➔ 💱 外幣換匯」。',
          '轉出選擇台幣帳戶（如中信活儲），轉入選擇美金帳戶（如國泰美金存款）。',
          '輸入轉出台幣與獲得的美金金額，系統會自動推算匯率並完成換匯！'
        ]
      }
    ]
  },
  {
    id: 'investment',
    name: '📈 投資與股票',
    icon: '📊',
    description: '買賣台美股/基金、查看投資損益、作廢投資交易',
    color: '#007aff',
    scenarios: [
      {
        id: 'inv_buy_stock',
        title: '我買進了一筆股票 / 美股 / 基金',
        route: '選單【投資】 ➔ 子頁籤【記帳與新增交易】',
        targetPage: 'invest',
        targetTab: 'entry',
        targetHint: '已帶您前往【投資 ➔ 記帳與新增交易】！填寫股票代號與扣款帳戶。',
        steps: [
          '進入「📈 投資 ➔ 記帳與新增交易」。',
          '輸入股票代碼（如 2330 或 NVDA），填寫成交股數、單價與扣款帳戶。',
          '點擊「🚀 確定送出交易紀錄」，系統會自動扣除交割戶餘額並更新股票持股！'
        ]
      },
      {
        id: 'inv_sell_stock',
        title: '我賣出了股票，要如何結算獲利並將資金歸還交割戶？',
        route: '選單【投資】 ➔ 子頁籤【交易紀錄】 ➔ 點擊【作廢 / 賣出】',
        targetPage: 'invest',
        targetTab: 'history',
        targetHint: '已帶您前往【投資 ➔ 交易紀錄】！點擊欲賣出紀錄旁的「🗑️ 作廢」。',
        steps: [
          '進入「📈 投資 ➔ 交易紀錄」。',
          '找到該筆買進紀錄，點擊「🗑️ 作廢」。',
          '系統會自動將買進本金與相關資金解鎖歸還至原交割帳戶！'
        ]
      }
    ]
  },
  {
    id: 'history_calibrate',
    name: '🔍 流水帳與餘額校正',
    icon: '⚙️',
    description: '查詢歷史紀錄、作廢記錯消費、餘額校正與歸零',
    color: '#ff3b30',
    scenarios: [
      {
        id: 'his_void_expense',
        title: '我記錯了一筆消費，想要作廢並讓錢退回帳戶',
        route: '選單【資料庫】 ➔ 子頁籤【交易流水帳】 ➔ 點擊【🗑️ 作廢】',
        targetPage: 'monthly',
        targetTab: 'database',
        targetHint: '已帶您前往【資料庫 ➔ 交易流水帳】！點擊該筆紀錄旁的「🗑️ 作廢」。',
        steps: [
          '進入「📊 資料庫 ➔ 交易流水帳」。',
          '在搜尋欄輸入關鍵字找到該筆紀錄。',
          '點擊紀錄右側的「🗑️ 作廢」按鈕，填寫作廢原因。系統會自動加回原扣款帳戶餘額！'
        ]
      },
      {
        id: 'his_calibrate_balance',
        title: '我的實際錢包/銀行餘額跟 App 裡的數字對不上，想校正金額',
        route: '選單【帳戶】 ➔ 點擊該帳戶【✏️ 編輯】 ➔ 修改【當前餘額】',
        targetPage: 'accounts',
        targetHint: '已帶您前往【帳戶管理】！請找到該帳戶點擊「✏️ 編輯」修改餘額。',
        steps: [
          '進入「🏦 帳戶管理」。',
          '找到數字不對的帳戶，點擊「✏️ 編輯」。',
          '將「當前餘額」直接修正為您實際錢包的正確數字並儲存。系統會寫入校正紀錄，**完全不會干擾您的消費預算**！'
        ]
      },
      {
        id: 'his_factory_reset',
        title: '我想完全清空 App 的所有測試資料，歸零重來',
        route: '選單【設定】 ➔ 【歸零資料庫】 ➔ 輸入 DELETE 驗證',
        targetPage: 'settings',
        targetTab: 'database',
        targetHint: '已帶您前往【設定 ➔ 歸零資料庫】！需要輸入 DELETE 驗證。',
        steps: [
          '進入「⚙️ 設定 ➔ 歸零資料庫」。',
          '點擊「🔥 執行完全歸零重置」。',
          '系統會先自動將目前資料備份至 Google Drive，驗證輸入 DELETE 後即可完全恢復為初始全新狀態！'
        ]
      }
    ]
  }
];

const HelpWizard = ({ onNavigateWithGuide }) => {
  const [selectedCatId, setSelectedCatId] = useState(null);
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const currentCategory = useMemo(() => {
    return WIZARD_CATEGORIES.find(c => c.id === selectedCatId);
  }, [selectedCatId]);

  // Search filter
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    const results = [];

    WIZARD_CATEGORIES.forEach(cat => {
      cat.scenarios.forEach(sc => {
        if (
          sc.title.toLowerCase().includes(q) ||
          sc.route.toLowerCase().includes(q) ||
          cat.name.toLowerCase().includes(q) ||
          sc.steps.some(s => s.toLowerCase().includes(q))
        ) {
          results.push({ ...sc, categoryName: cat.name, categoryColor: cat.color });
        }
      });
    });
    return results;
  }, [searchQuery]);

  const handleReset = () => {
    setSelectedCatId(null);
    setSelectedScenario(null);
    setSearchQuery('');
  };

  const handleGoToTarget = (scenario) => {
    if (onNavigateWithGuide) {
      onNavigateWithGuide({
        page: scenario.targetPage,
        tab: scenario.targetTab,
        mode: scenario.targetMode,
        hint: scenario.targetHint
      });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* Wizard Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(0, 122, 255, 0.12) 0%, rgba(175, 82, 222, 0.08) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '16px',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontWeight: '850', fontSize: '1.15rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🧭 智慧互動引導助手
          </h3>
          {(selectedCatId || selectedScenario || searchQuery) && (
            <button
              onClick={handleReset}
              className="glass-btn"
              style={{ padding: '4px 10px', fontSize: '0.74rem', fontWeight: '700', borderRadius: '8px' }}
            >
              🔄 重置選單
            </button>
          )}
        </div>
        
        <p style={{ margin: 0, fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)', lineHeight: '1.4' }}>
          遇到不知道怎麼操作的狀況嗎？請選擇下方對應的情境狀況，系統將指引明確路徑並提供帶領指引！
        </p>

        {/* Search Bar */}
        <div style={{ position: 'relative', marginTop: '4px' }}>
          <input
            type="text"
            className="glass-input"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (selectedScenario) setSelectedScenario(null);
            }}
            placeholder="🔍 搜尋情境關鍵字 (例：代墊、信用卡劃撥、換匯、股票...)"
            style={{ width: '100%', padding: '8px 12px 8px 34px', fontSize: '0.82rem', borderRadius: '10px' }}
          />
          <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
        </div>
      </div>

      {/* SEARCH RESULTS MODE */}
      {searchQuery.trim() !== '' && (
        <div className="inset-group-card" style={{ padding: '12px', background: 'rgba(255,255,255,0.03)' }}>
          <div style={{ fontSize: '0.76rem', color: 'rgba(255,255,255,0.6)', fontWeight: '800', marginBottom: '8px' }}>
            🔎 搜尋結果 ({searchResults.length} 筆情境)：
          </div>

          {searchResults.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px', color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>
              找不到相關情境，請嘗試使用其他關鍵字或直接選擇下方分類。
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {searchResults.map(sc => (
                <div
                  key={sc.id}
                  onClick={() => setSelectedScenario(sc)}
                  className="inset-group-row"
                  style={{
                    padding: '12px',
                    cursor: 'pointer',
                    borderRadius: '10px',
                    background: selectedScenario?.id === sc.id ? 'rgba(0, 122, 255, 0.15)' : 'rgba(255,255,255,0.04)',
                    border: selectedScenario?.id === sc.id ? '1px solid #007aff' : '0.5px solid rgba(255,255,255,0.08)'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
                    <div style={{ fontSize: '0.68rem', color: sc.categoryColor, fontWeight: '800' }}>
                      [{sc.categoryName}]
                    </div>
                    <div style={{ fontSize: '0.86rem', fontWeight: '750', color: '#fff' }}>
                      {sc.title}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* STEP 1: CATEGORY SELECTION (When no search & no category selected) */}
      {searchQuery.trim() === '' && !selectedCatId && !selectedScenario && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
          {WIZARD_CATEGORIES.map(cat => (
            <div
              key={cat.id}
              onClick={() => setSelectedCatId(cat.id)}
              className="glass-card"
              style={{
                padding: '16px 14px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                borderLeft: `4px solid ${cat.color}`,
                transition: 'transform 0.2s ease, background 0.2s ease'
              }}
            >
              <div style={{ fontSize: '1.6rem' }}>{cat.icon}</div>
              <div style={{ fontWeight: '800', fontSize: '0.9rem', color: '#fff' }}>{cat.name}</div>
              <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.6)', lineHeight: '1.3' }}>{cat.description}</div>
            </div>
          ))}
        </div>
      )}

      {/* STEP 2: SCENARIO LIST (When category selected & no scenario active) */}
      {searchQuery.trim() === '' && selectedCatId && !selectedScenario && currentCategory && (
        <div className="glass-card" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <button onClick={() => setSelectedCatId(null)} className="glass-btn" style={{ padding: '4px 10px', fontSize: '0.76rem' }}>
              ◀ 返回大類別
            </button>
            <h4 style={{ margin: 0, fontWeight: '800', fontSize: '0.95rem', color: currentCategory.color }}>
              {currentCategory.name} — 請選擇具體狀況：
            </h4>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {currentCategory.scenarios.map(sc => (
              <div
                key={sc.id}
                onClick={() => setSelectedScenario(sc)}
                className="inset-group-row"
                style={{
                  padding: '14px',
                  cursor: 'pointer',
                  borderRadius: '12px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '0.5px solid rgba(255,255,255,0.08)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ fontWeight: '750', fontSize: '0.86rem', color: '#fff', lineHeight: '1.4' }}>
                  {sc.title}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginLeft: '12px' }}>
                  ➔
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STEP 3: SOLUTION GUIDANCE CARD */}
      {selectedScenario && (
        <div className="glass-card" style={{ padding: '18px', border: '1px solid rgba(0, 122, 255, 0.4)', background: 'rgba(20, 20, 25, 0.9)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <button
              onClick={() => setSelectedScenario(null)}
              className="glass-btn"
              style={{ padding: '4px 10px', fontSize: '0.76rem' }}
            >
              ◀ 返回選擇選單
            </button>
            <span style={{ fontSize: '0.68rem', background: 'rgba(0,122,255,0.2)', color: '#007aff', padding: '2px 8px', borderRadius: '6px', fontWeight: '800' }}>
              💡 操作指南與教育指引
            </span>
          </div>

          <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: '850', color: '#fff', lineHeight: '1.4' }}>
            {selectedScenario.title}
          </h4>

          {/* Route Breadcrumbs */}
          <div style={{
            background: 'rgba(255, 149, 0, 0.08)',
            border: '1px solid rgba(255, 149, 0, 0.25)',
            padding: '10px 12px',
            borderRadius: '10px',
            marginBottom: '14px',
            fontSize: '0.8rem',
            color: '#ffb94f',
            fontWeight: '700',
            lineHeight: '1.4'
          }}>
            📍 記憶操作路徑：<br />
            <span style={{ color: '#fff', fontSize: '0.84rem' }}>{selectedScenario.route}</span>
          </div>

          {/* Step-by-Step Instructions */}
          <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.85)', lineHeight: '1.6', marginBottom: '16px' }}>
            <div style={{ fontWeight: '800', color: 'rgba(255,255,255,0.5)', marginBottom: '6px' }}>📝 詳細步驟：</div>
            <ol style={{ margin: 0, paddingLeft: '20px' }}>
              {selectedScenario.steps.map((step, idx) => (
                <li key={idx} style={{ marginBottom: '4px' }}>{step}</li>
              ))}
            </ol>
          </div>

          {/* Guided Action Button */}
          <button
            onClick={() => handleGoToTarget(selectedScenario)}
            className="glass-btn primary-gradient-btn"
            style={{
              width: '100%',
              padding: '12px 0',
              borderRadius: '12px',
              fontWeight: '800',
              fontSize: '0.88rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 15px rgba(0,122,255,0.3)'
            }}
          >
            <span>📍 帶我前往這個頁面（並高亮提示區域）</span>
          </button>
        </div>
      )}

    </div>
  );
};

export default HelpWizard;
