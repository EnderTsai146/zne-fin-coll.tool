// src/components/IOSAccountMenuPicker.jsx
// 🥔 馬鈴薯管家 — iOS 18/26 HIG UIMenu Context Menu Account Picker
import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';

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

const maskNumber = (num) => {
  if (!num) return '';
  if (num.length <= 4) return `(${num})`;
  return `(末碼 ${num.slice(-4)})`;
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
  themeColor = '#0a84ff',
  modalTitle = '選擇帳戶'
}) => {
  const [isOpen, setIsOpen] = useState(false);

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

  // Group accounts in iOS UIMenu structure
  const groupedSections = useMemo(() => {
    const sorted = sortAccountsForUser(availableAccounts, userKey);

    const ownAccs = sorted.filter(a => a.owner === userKey);
    const jointAccs = sorted.filter(a => a.owner === 'joint');
    const partnerAccs = sorted.filter(a => a.owner === partnerKey);

    const buildSubgroups = (accList) => {
      const typeSections = [
        { key: 'bank', name: '🏦 銀行活儲', list: accList.filter(a => a.type === 'bank') },
        { key: 'cash', name: '💵 現金資產', list: accList.filter(a => a.type === 'cash') },
        { key: 'virtual', name: '📱 電子票證 / 虛擬', list: accList.filter(a => a.type === 'virtual') },
        { key: 'credit', name: '💳 信用卡', list: accList.filter(a => a.type === 'credit') },
        { key: 'investment', name: '📈 投資交割戶', list: accList.filter(a => a.type === 'investment') },
      ];
      return typeSections.filter(s => s.list.length > 0);
    };

    const sections = [];

    if (ownAccs.length > 0) {
      sections.push({
        id: 'own',
        title: userKey === 'userA' ? '🐕 我的個人帳戶 (大狗狗)' : '🐶 我的個人帳戶 (阿陞)',
        color: '#0a84ff',
        subgroups: buildSubgroups(ownAccs)
      });
    }

    if (jointAccs.length > 0) {
      sections.push({
        id: 'joint',
        title: '🏫 共同公費帳戶',
        color: '#30d158',
        subgroups: buildSubgroups(jointAccs)
      });
    }

    if (partnerAccs.length > 0) {
      sections.push({
        id: 'partner',
        title: partnerKey === 'userA' ? '🐕 伴侶帳戶 (大狗狗 · 協作)' : '🐶 伴侶帳戶 (阿陞 · 協作)',
        color: '#bf5af2',
        subgroups: buildSubgroups(partnerAccs)
      });
    }

    return sections;
  }, [availableAccounts, userKey, partnerKey]);

  const handleSelect = (accId) => {
    onChange(accId);
    setIsOpen(false);
  };

  const getFallbackIcon = (type) => {
    if (type === 'cash') return '💵';
    if (type === 'credit') return '💳';
    if (type === 'virtual') return '📱';
    if (type === 'investment') return '📈';
    return '🏦';
  };

  const renderSelectedDisplay = () => {
    if (!selectedAccount) {
      return (
        <span style={{ color: 'var(--text-tertiary)', fontSize: '0.84rem' }}>
          {placeholder}
        </span>
      );
    }

    const icon = selectedAccount.icon || getFallbackIcon(selectedAccount.type);
    const isCredit = selectedAccount.type === 'credit';
    const balanceColor = isCredit ? '#ff9f0a' : '#30d158';

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
        <span style={{ fontSize: '1.15rem' }}>{icon}</span>
        <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', minWidth: 0 }}>
          <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {selectedAccount.nickname}
          </span>
          <span style={{ fontSize: '0.68rem', color: balanceColor, fontWeight: '600' }}>
            ${(selectedAccount.balance || 0).toLocaleString()} {selectedAccount.currency || 'TWD'}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
      {label && (
        <label style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: '600', paddingLeft: '2px' }}>
          {label}
        </label>
      )}

      {/* iOS Grouped Inset Row Trigger */}
      <div
        className="ios-account-trigger-row"
        onClick={() => !disabled && setIsOpen(true)}
        style={{
          opacity: disabled ? 0.45 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer'
        }}
      >
        <div style={{ flex: 1, minWidth: 0, paddingRight: '8px' }}>
          {renderSelectedDisplay()}
        </div>

        {/* Gray Downward Chevron */}
        <span style={{
          color: 'rgba(255, 255, 255, 0.4)',
          fontSize: '0.82rem',
          fontWeight: '700',
          transition: 'transform 0.2s ease',
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)'
        }}>
          ⌵
        </span>
      </div>

      {/* iOS UIMenu Context Menu Modal */}
      {isOpen && createPortal(
        <div
          className="ios-uimenu-backdrop"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="ios-uimenu-card"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Menu Header */}
            <div className="ios-uimenu-header">
              <div className="ios-uimenu-title">{modalTitle}</div>
              <button
                type="button"
                className="ios-uimenu-close"
                onClick={() => setIsOpen(false)}
              >
                ✕
              </button>
            </div>

            {/* Menu Scrollable Body */}
            <div className="ios-uimenu-scroll">
              {groupedSections.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>
                  無相符之可用帳戶
                </div>
              ) : (
                groupedSections.map(section => (
                  <div key={section.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {/* Section Main Title */}
                    <div className="ios-uimenu-section-header">
                      <span style={{ width: '4px', height: '10px', background: section.color, borderRadius: '2px' }} />
                      {section.title}
                    </div>

                    {/* Section Groups */}
                    <div className="ios-uimenu-group">
                      {section.subgroups.map((subgroup, gIdx) => (
                        <div key={subgroup.key} style={{ display: 'flex', flexDirection: 'column' }}>
                          {/* Subgroup Label if multiple */}
                          {section.subgroups.length > 1 && (
                            <div style={{
                              fontSize: '0.62rem',
                              fontWeight: '700',
                              color: 'rgba(255, 255, 255, 0.4)',
                              padding: '6px 14px 2px',
                              background: 'rgba(0, 0, 0, 0.15)',
                              borderTop: gIdx > 0 ? '0.5px solid rgba(255,255,255,0.06)' : 'none'
                            }}>
                              {subgroup.name}
                            </div>
                          )}

                          {/* Account Items */}
                          {subgroup.list.map(acc => {
                            const isSelected = selectedValue === acc.id;
                            const isCredit = acc.type === 'credit';
                            const balanceColor = isCredit ? '#ff9f0a' : '#30d158';
                            const icon = acc.icon || getFallbackIcon(acc.type);
                            const numberStr = maskNumber(acc.accountNumber);

                            return (
                              <button
                                key={acc.id}
                                type="button"
                                className={`ios-uimenu-item ${isSelected ? 'selected' : ''}`}
                                onClick={() => handleSelect(acc.id)}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                  {/* Native Checkmark on the left (as in iOS 26 reference) */}
                                  <div style={{ width: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {isSelected ? (
                                      <span style={{ color: themeColor || '#0a84ff', fontSize: '1rem', fontWeight: '900' }}>✓</span>
                                    ) : (
                                      <span style={{ width: '18px' }} />
                                    )}
                                  </div>

                                  <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>{icon}</span>

                                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span style={{
                                        fontSize: '0.86rem',
                                        fontWeight: isSelected ? '750' : '600',
                                        color: '#ffffff',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis'
                                      }}>
                                        {acc.nickname}
                                      </span>
                                      {numberStr && (
                                        <span style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>
                                          {numberStr}
                                        </span>
                                      )}
                                    </div>
                                    <span style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.45)' }}>
                                      {acc.name}
                                    </span>
                                  </div>
                                </div>

                                {/* Right Side: Balance */}
                                <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: '8px' }}>
                                  <div style={{
                                    fontSize: '0.82rem',
                                    fontWeight: '750',
                                    color: balanceColor,
                                    fontVariantNumeric: 'tabular-nums'
                                  }}>
                                    ${(acc.balance || 0).toLocaleString()}
                                  </div>
                                  <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)' }}>
                                    {acc.currency || 'TWD'}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default IOSAccountMenuPicker;
