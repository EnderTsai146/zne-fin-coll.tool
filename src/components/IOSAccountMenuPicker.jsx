// src/components/IOSAccountMenuPicker.jsx
// 🥔 馬鈴薯管家 — 100% Apple 原生系統選單帳戶選擇器
import React, { useMemo } from 'react';

const sortAccountsForUser = (accList, userKey) => {
  return [...accList].sort((a, b) => {
    // 1. Owner priority: userKey first, then joint, then others
    const getOwnerWeight = (owner) => {
      if (owner === userKey) return 1;
      if (owner === 'joint') return 2;
      return 3;
    };
    const wA = getOwnerWeight(a.owner);
    const wB = getOwnerWeight(b.owner);
    if (wA !== wB) return wA - wB;

    // 2. Type priority: bank -> cash -> virtual -> credit -> investment
    const typeWeights = { bank: 1, cash: 2, virtual: 3, credit: 4, investment: 5 };
    const tA = typeWeights[a.type] || 99;
    const tB = typeWeights[b.type] || 99;
    if (tA !== tB) return tA - tB;

    return (a.nickname || '').localeCompare(b.nickname || '', 'zh-TW');
  });
};

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
  const userKey = (currentUser && currentUser.includes('大狗狗')) || currentUser === 'userA' ? 'userA' : 'userB';
  const partnerKey = userKey === 'userA' ? 'userB' : 'userA';

  // Filter accounts
  const availableAccounts = useMemo(() => {
    return accounts.filter(filterFn);
  }, [accounts, filterFn]);

  // Find currently selected account
  const selectedAccount = useMemo(() => {
    return accounts.find(a => a.id === selectedValue);
  }, [accounts, selectedValue]);

  // Group accounts for native <optgroup> structure
  const groupedSections = useMemo(() => {
    const sorted = sortAccountsForUser(availableAccounts, userKey);

    const ownAccs = sorted.filter(a => a.owner === userKey);
    const jointAccs = sorted.filter(a => a.owner === 'joint');
    const partnerAccs = sorted.filter(a => a.owner === partnerKey);

    const sections = [];

    if (ownAccs.length > 0) {
      sections.push({
        id: 'own',
        title: userKey === 'userA' ? '👤 我的個人帳戶 (大狗狗)' : '👤 我的個人帳戶 (阿陞)',
        accounts: ownAccs
      });
    }

    if (jointAccs.length > 0) {
      sections.push({
        id: 'joint',
        title: '🏫 共同公費帳戶',
        accounts: jointAccs
      });
    }

    if (partnerAccs.length > 0) {
      sections.push({
        id: 'partner',
        title: partnerKey === 'userA' ? '👥 伴侶帳戶 (大狗狗)' : '👥 伴侶帳戶 (阿陞)',
        accounts: partnerAccs
      });
    }

    return sections;
  }, [availableAccounts, userKey, partnerKey]);

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
        <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>{icon}</span>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%', position: 'relative' }}>
      {label && (
        <label style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: '600', paddingLeft: '2px' }}>
          {label}
        </label>
      )}

      {/* Container holding both visual Inset Row and Native Overlay Select */}
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

        {/* 100% Apple Native System Popup Menu <select> Overlay */}
        <select
          value={selectedValue || ''}
          onChange={(e) => onChange && onChange(e.target.value)}
          disabled={disabled}
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
            {placeholder}
          </option>

          {groupedSections.map((sec) => (
            <optgroup key={sec.id} label={sec.title}>
              {sec.accounts.map((acc) => {
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
