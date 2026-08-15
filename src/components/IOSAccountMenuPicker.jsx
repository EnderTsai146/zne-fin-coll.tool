// src/components/IOSAccountMenuPicker.jsx
// 🥔 馬鈴薯管家 — 2階段持有人篩選 + Apple 系統原生選單帳戶選擇器
import React, { useState, useMemo, useEffect } from 'react';

const getTypeName = (type) => {
  switch (type) {
    case 'bank': return '活儲';
    case 'cash': return '現金';
    case 'virtual': return '電子票證';
    case 'credit': return '信用卡';
    case 'investment': return '交割戶';
    default: return '帳戶';
  }
};

const getFallbackIcon = (type) => {
  if (type === 'cash') return '💵';
  if (type === 'credit') return '💳';
  if (type === 'virtual') return '📱';
  if (type === 'investment') return '📈';
  return '🏦';
};

const IOSAccountMenuPicker = ({
  label,
  accounts = [],
  selectedValue,
  onChange,
  filterFn = () => true,
  currentUser = 'userA',
  placeholder = '請選擇帳戶',
  disabled = false,
  themeColor = '#0a84ff'
}) => {
  const loggedInKey = (currentUser && currentUser.includes('大狗狗')) || currentUser === 'userA' ? 'userA' : 'userB';

  // Filter accounts by caller's custom filterFn
  const availableAccounts = useMemo(() => {
    return accounts.filter(filterFn);
  }, [accounts, filterFn]);

  // Find currently selected account
  const selectedAccount = useMemo(() => {
    return accounts.find(a => a.id === selectedValue);
  }, [accounts, selectedValue]);

  // Active Owner Filter State (Defaults to selected account's owner or logged-in user)
  const [activeOwner, setActiveOwner] = useState(() => {
    if (selectedAccount) return selectedAccount.owner;
    return loggedInKey;
  });

  // Keep activeOwner in sync if external selectedValue changes to another owner
  useEffect(() => {
    if (selectedAccount && selectedAccount.owner !== activeOwner) {
      setActiveOwner(selectedAccount.owner);
    }
  }, [selectedAccount, activeOwner]);

  // 3 Owner Definitions: Ordered strictly Left-to-Right: 阿陞 (userB) / 共同 (joint) / 大狗 (userA)
  const ownerConfigs = [
    { key: 'userB', label: '阿陞', icon: '🐶', accent: '#30D158' },
    { key: 'joint', label: '共同', icon: '🏫', accent: '#007AFF' },
    { key: 'userA', label: '大狗', icon: '🐕', accent: '#AF52DE' }
  ];

  // Accounts belonging strictly to the selected owner
  const currentOwnerAccounts = useMemo(() => {
    return availableAccounts.filter(a => a.owner === activeOwner);
  }, [availableAccounts, activeOwner]);

  // Group accounts of active owner by account type for clean Apple <optgroup> hierarchy
  const groupedTypeSections = useMemo(() => {
    const typeWeights = { bank: 1, cash: 2, virtual: 3, credit: 4, investment: 5 };
    const sorted = [...currentOwnerAccounts].sort((a, b) => {
      const tA = typeWeights[a.type] || 99;
      const tB = typeWeights[b.type] || 99;
      if (tA !== tB) return tA - tB;
      return (a.nickname || '').localeCompare(b.nickname || '', 'zh-TW');
    });

    const sections = [
      { key: 'bank', title: '🏦 銀行活儲帳戶', list: sorted.filter(a => a.type === 'bank') },
      { key: 'cash', title: '💵 現金資產', list: sorted.filter(a => a.type === 'cash') },
      { key: 'virtual', title: '📱 電子票證 / 虛擬', list: sorted.filter(a => a.type === 'virtual') },
      { key: 'credit', title: '💳 信用卡帳戶', list: sorted.filter(a => a.type === 'credit') },
      { key: 'investment', title: '📈 投資交割帳戶', list: sorted.filter(a => a.type === 'investment') },
    ];

    return sections.filter(s => s.list.length > 0);
  }, [currentOwnerAccounts]);

  // Switch owner and auto-select appropriate default account for that owner
  const handleOwnerClick = (ownerKey) => {
    if (disabled) return;
    setActiveOwner(ownerKey);

    const ownerAccs = availableAccounts.filter(a => a.owner === ownerKey);
    if (ownerAccs.length > 0) {
      // Prioritize default expense account if available, else first account
      const defAcc = ownerAccs.find(a => a.isDefaultExpense || a.isDefaultIncome) || ownerAccs[0];
      if (defAcc && defAcc.id !== selectedValue) {
        onChange && onChange(defAcc.id);
      }
    }
  };

  const renderSelectedDisplay = () => {
    if (!selectedAccount) {
      return (
        <span style={{ color: 'var(--text-tertiary)', fontSize: '0.86rem' }}>
          {placeholder}
        </span>
      );
    }

    const icon = selectedAccount.icon || getFallbackIcon(selectedAccount.type);
    const isCredit = selectedAccount.type === 'credit';
    const balanceColor = isCredit ? '#ff9f0a' : '#30d158';
    const typeLabel = getTypeName(selectedAccount.type);

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden', width: '100%' }}>
        <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>{icon}</span>
        <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.88rem', fontWeight: '750', color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {selectedAccount.nickname}
            </span>
            <span style={{
              fontSize: '0.62rem',
              color: 'rgba(255,255,255,0.6)',
              background: 'rgba(255,255,255,0.08)',
              padding: '1px 5px',
              borderRadius: '4px',
              fontWeight: '600',
              flexShrink: 0
            }}>
              {typeLabel}
            </span>
          </div>
          <span style={{ fontSize: '0.72rem', color: balanceColor, fontWeight: '700', marginTop: '1px' }}>
            ${(selectedAccount.balance || 0).toLocaleString()} {selectedAccount.currency || 'TWD'}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', position: 'relative' }}>
      {label && (
        <label style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: '600', paddingLeft: '2px' }}>
          {label}
        </label>
      )}

      {/* Tier 1: Three Square Owner Selection Buttons (阿陞 / 共同 / 大狗) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '8px',
        width: '100%'
      }}>
        {ownerConfigs.map(cfg => {
          const isActive = activeOwner === cfg.key;
          const count = availableAccounts.filter(a => a.owner === cfg.key).length;

          return (
            <button
              key={cfg.key}
              type="button"
              onClick={() => handleOwnerClick(cfg.key)}
              disabled={disabled}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px 4px',
                borderRadius: '12px',
                border: isActive ? `1.5px solid ${cfg.accent}` : '1px solid rgba(255, 255, 255, 0.08)',
                background: isActive ? `${cfg.accent}1e` : 'rgba(255, 255, 255, 0.03)',
                boxShadow: isActive ? `0 4px 14px ${cfg.accent}26` : 'none',
                cursor: disabled ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
                transform: isActive ? 'scale(1.02)' : 'scale(1.0)',
                gap: '2px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '1.1rem' }}>{cfg.icon}</span>
                <span style={{
                  fontSize: '0.84rem',
                  fontWeight: isActive ? '850' : '650',
                  color: isActive ? '#ffffff' : 'rgba(255,255,255,0.7)'
                }}>
                  {cfg.label}
                </span>
              </div>
              <span style={{
                fontSize: '0.6rem',
                color: isActive ? cfg.accent : 'rgba(255,255,255,0.4)',
                fontWeight: '700'
              }}>
                {count > 0 ? `${count} 個帳戶` : '無可用'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tier 2: Apple Native System Popup Menu <select> Overlay Row */}
      <div style={{ position: 'relative', width: '100%' }}>
        {/* Visual iOS Grouped Inset Row Trigger */}
        <div
          className="ios-account-trigger-row"
          style={{
            opacity: disabled ? 0.45 : 1,
            cursor: disabled ? 'not-allowed' : 'pointer',
            border: selectedAccount ? `1px solid ${themeColor}33` : '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderRadius: '12px',
            background: 'rgba(255, 255, 255, 0.04)',
            boxSizing: 'border-box',
            minHeight: '48px'
          }}
        >
          <div style={{ flex: 1, minWidth: 0, paddingRight: '8px' }}>
            {renderSelectedDisplay()}
          </div>

          {/* Gray Downward Chevron (Apple Standard) */}
          <span style={{
            color: 'rgba(255, 255, 255, 0.4)',
            fontSize: '0.82rem',
            fontWeight: '700',
            flexShrink: 0
          }}>
            ⌵
          </span>
        </div>

        {/* 100% Apple Native System Popup Menu <select> (Filtered by Selected Owner) */}
        <select
          value={selectedValue || ''}
          onChange={(e) => onChange && onChange(e.target.value)}
          disabled={disabled || currentOwnerAccounts.length === 0}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: disabled ? 'not-allowed' : 'pointer',
            WebkitAppearance: 'none',
            MozAppearance: 'none',
            appearance: 'none',
            border: 'none',
            background: 'transparent',
            zIndex: 10,
            fontSize: '16px' /* Prevents iOS Safari from auto-zooming */
          }}
          aria-label={label || placeholder}
        >
          <option value="" disabled>
            {currentOwnerAccounts.length === 0 ? '該持有人無可用帳戶' : placeholder}
          </option>

          {groupedTypeSections.map((sec) => (
            <optgroup key={sec.key} label={sec.title}>
              {sec.list.map((acc) => {
                const icon = acc.icon || getFallbackIcon(acc.type);
                const typeName = getTypeName(acc.type);
                const formattedBalance = `$${(acc.balance || 0).toLocaleString()} ${acc.currency || 'TWD'}`;
                return (
                  <option key={acc.id} value={acc.id}>
                    {`${icon} ${acc.nickname} (${typeName}) · ${formattedBalance}`}
                  </option>
                );
              })}
            </optgroup>
          ))}
        </select>
      </div>
    </div>
  );
};

export default IOSAccountMenuPicker;
