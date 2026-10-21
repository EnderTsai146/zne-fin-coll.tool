// src/components/AccountsManager.jsx
// 🥔 馬鈴薯管家 — 財務帳戶與資產管理中心
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import SegmentedControl from './SegmentedControl';
import IOSAccountMenuPicker from './IOSAccountMenuPicker';

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

const cleanIconInput = (val) => {
  if (!val) return '';
  const trimmed = val.trim();
  if (trimmed.length === 0) return '';
  try {
    const segmenter = new Intl.Segmenter();
    const segments = [...segmenter.segment(trimmed)];
    return segments.length > 0 ? segments[0].segment : '';
  } catch {
    const chars = Array.from(trimmed);
    return chars.length > 0 ? chars[0] : '';
  }
};

const AccountsManager = ({
  assets,
  setAssets,
  operatorName,
  customAlert,
  customConfirm,
  currentFxRate,
  onTransaction
}) => {
  const [subTab, setSubTab] = useState('list'); // 'list', 'calibrate'
  
  // Modal states for creating/editing account
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null); // null means adding new
  const [isReadOnly, setIsReadOnly] = useState(false);

  // Deletion safeguard state
  const [showDeleteSafeguard, setShowDeleteSafeguard] = useState(false);
  const [safeguardTargetId, setSafeguardTargetId] = useState('');

  // Form states
  const [accOwner, setAccOwner] = useState('userA');
  const [accType, setAccType] = useState('bank'); // 'cash', 'bank', 'credit', 'virtual'
  const [accName, setAccName] = useState('');
  const [accNickname, setAccNickname] = useState('');
  const [accIcon, setAccIcon] = useState('🏦');
  const [accNumber, setAccNumber] = useState('');
  const [accBalance, setAccBalance] = useState('');
  const [accCurrency, setAccCurrency] = useState('TWD');
  const [isDefaultExpense, setIsDefaultExpense] = useState(false);
  const [isDefaultIncome, setIsDefaultIncome] = useState(false);
  const [isDefaultSettle, setIsDefaultSettle] = useState(false);
  const [linkedBankId, setLinkedBankId] = useState('');
  const [billingDay, setBillingDay] = useState('10');
    const [autoPay, setAutoPay] = useState(true);
  const [accIsDebt, setAccIsDebt] = useState(true); // For credit card edit/create: true = 欠款 (-), false = 溢繳 (+)

  // Calibrate states
  const [calAcc, setCalAcc] = useState('');
  const [calNewBalance, setCalNewBalance] = useState('');
  const [calIsDebt, setCalIsDebt] = useState(true); // For credit card calibration: true = 欠款 (-), false = 溢繳 (+)
  const [calNote, setCalNote] = useState('');
  const [calDate, setCalDate] = useState(new Date().toISOString().split('T')[0]);

  const userKey = operatorName.includes('大狗狗') ? 'userA' : 'userB';
  const partnerKey = userKey === 'userA' ? 'userB' : 'userA';
  
  const accounts = assets?.accounts || [];

  // Masking logic
  const maskNumber = (num, owner) => {
    if (!num) return '';
    if (owner === userKey || owner === 'joint') return num;
    if (num.length <= 5) return num;
    return '*'.repeat(num.length - 5) + num.slice(-5);
  };

  // Sum helpers
  const totalAssets = accounts
    .filter(a => a.type !== 'credit')
    .reduce((sum, a) => sum + (a.currency === 'USD' ? a.balance * (currentFxRate || 31.5) : a.balance), 0);

  const totalLiabilities = accounts
    .filter(a => a.type === 'credit')
    .reduce((sum, a) => sum + (a.currency === 'USD' ? a.balance * (currentFxRate || 31.5) : a.balance), 0);

  const netWorth = totalAssets + totalLiabilities; // liabilities are negative

  // Reset form
  const resetForm = () => {
    setAccOwner(userKey);
    setAccType('bank');
    setAccName('');
    setAccNickname('');
    setAccIcon('🏦');
    setAccNumber('');
    setAccBalance('');
    setAccIsDebt(true);
    setAccCurrency('TWD');
    setIsDefaultExpense(false);
    setIsDefaultIncome(false);
    setIsDefaultSettle(false);
    setLinkedBankId('');
    setBillingDay('10');
    setAutoPay(false);
    setEditingAccount(null);
    setIsReadOnly(false);
  };

  // Open modal
  const handleOpenAdd = () => {
    resetForm();
    setShowModal(true);
  };

  const handleOpenEdit = (acc) => {
    setEditingAccount(acc);
    setAccOwner(acc.owner);
    setAccType(acc.type);
    setAccName(acc.name);
    setAccNickname(acc.nickname);
    setAccIcon(acc.icon || '');
    setAccNumber(acc.accountNumber);
    const rawVal = acc.balance;
    setAccBalance(acc.type === 'credit' ? Math.abs(rawVal).toString() : rawVal.toString());
    setAccIsDebt(acc.type === 'credit' ? rawVal <= 0 : true);
    setAccCurrency(acc.currency);
    setIsDefaultExpense(acc.isDefaultExpense || false);
    setIsDefaultIncome(acc.isDefaultIncome || false);
    setIsDefaultSettle(acc.isDefaultSettle || false);
    setLinkedBankId(acc.linkedBankAccountId || '');
    setBillingDay((acc.billingDay || 10).toString());
    setAutoPay(acc.autoPay !== undefined ? acc.autoPay : true);

    const cannotEdit = acc.owner !== userKey && acc.owner !== 'joint';
    setIsReadOnly(cannotEdit);
    setShowModal(true);
  };

  // Save Account
  const handleSaveAccount = async () => {
    if (isReadOnly) return;

    const finalNickname = accNickname.trim() || accName.trim();
    const finalName = accName.trim() || accNickname.trim() || (accType === 'cash' ? '現金錢包' : '一般帳戶');

    if (!finalNickname) {
      await customAlert("請輸入帳戶暱稱或名稱！", "欄位未填寫");
      return;
    }

    const isAutoPay = autoPay;
    
    let val = parseMoney(accBalance);
    if (accType === 'credit') {
      val = accIsDebt ? -Math.abs(val) : Math.abs(val); // Debt is negative, refund/overpayment is positive
    }

    let defaultTypeIcon = '🏦';
    if (accType === 'cash') defaultTypeIcon = '💵';
    else if (accType === 'credit') defaultTypeIcon = '💳';
    else if (accType === 'virtual') defaultTypeIcon = '📱';

    const finalIcon = cleanIconInput(accIcon) || defaultTypeIcon;

    let updatedAccounts = [...accounts];

    // Reset default flags if this one is selected as default
    if (isDefaultExpense) {
      updatedAccounts = updatedAccounts.map(a => {
        if (a.owner === accOwner && a.currency === accCurrency) {
          return { ...a, isDefaultExpense: false };
        }
        return a;
      });
    }
    if (isDefaultIncome) {
      updatedAccounts = updatedAccounts.map(a => {
        if (a.owner === accOwner && a.currency === accCurrency) {
          return { ...a, isDefaultIncome: false };
        }
        return a;
      });
    }
    if (isDefaultSettle) {
      updatedAccounts = updatedAccounts.map(a => {
        if (a.owner === accOwner && a.currency === accCurrency) {
          return { ...a, isDefaultSettle: false };
        }
        return a;
      });
    }

    const nextId = editingAccount ? editingAccount.id : ('acc_' + Date.now());
    const prevBalance = editingAccount ? editingAccount.balance : 0;
    const balanceDiff = val - prevBalance;

    let txRecord = null;
    if (balanceDiff !== 0) {
      const isUs = accCurrency === 'USD';
      const prevDisplay = editingAccount 
        ? (editingAccount.type === 'credit' && editingAccount.balance < 0 ? `-$${Math.abs(editingAccount.balance).toLocaleString()}` : `$${editingAccount.balance.toLocaleString()}`)
        : '$0';
      const valDisplay = accType === 'credit' && val < 0 ? `-$${Math.abs(val).toLocaleString()}` : `$${val.toLocaleString()}`;
      const changeText = balanceDiff > 0 ? `增加 $${balanceDiff.toLocaleString()}` : `減少 $${Math.abs(balanceDiff).toLocaleString()}`;
      
      const confirmMessage = editingAccount
        ? `⚠️ 偵測到帳戶餘額變更！\n【${accNickname}】的餘額將由 ${prevDisplay} ${accCurrency} 變更為 ${valDisplay} ${accCurrency}（${changeText}）。\n\n系統將自動產生一筆「餘額校正」紀錄以留下審計軌跡，是否確定儲存？`
        : `🆕 您為新帳戶【${accNickname}】設定了初始餘額 ${valDisplay} ${accCurrency}。\n\n系統將自動產生一筆「餘額校正」紀錄作為初始帳面軌跡，是否確定儲存？`;

      const confirmSave = await customConfirm(confirmMessage, "儲存變更確認");
      if (!confirmSave) return;

      const totalTwd = isUs ? Math.round(balanceDiff * (currentFxRate || 31.5)) : balanceDiff;

      txRecord = {
        date: new Date().toISOString().split('T')[0],
        month: new Date().toISOString().slice(0, 7),
        type: 'calibrate',
        category: '餘額校正',
        total: Math.abs(totalTwd),
        twdDiff: totalTwd,
        usdAmount: isUs ? Math.abs(balanceDiff) : 0,
        usdDiff: isUs ? balanceDiff : 0,
        accountId: nextId,
        payer: accOwner === 'joint' ? '共同帳戶' : (accOwner === 'userA' ? '大狗狗🐕' : '阿陞🐶'),
        note: editingAccount
          ? `📝 編輯帳戶餘額自動調整: ${accNickname} (${prevDisplay} ➔ ${valDisplay} ${accCurrency})`
          : `🆕 新增帳戶設定初始餘額: ${accNickname} (初始餘額: ${valDisplay} ${accCurrency})`,
        timestamp: new Date().toISOString()
      };
    }

    if (editingAccount) {
      // Edit mode
      updatedAccounts = updatedAccounts.map(a => {
        if (a.id === editingAccount.id) {
          return {
            ...a,
            owner: accOwner,
            type: accType,
            name: finalName,
            nickname: finalNickname,
            icon: finalIcon,
            accountNumber: accNumber.trim(),
            balance: val,
            currency: accCurrency,
            isDefaultExpense,
            isDefaultIncome,
            isDefaultSettle,
            linkedBankAccountId: accType === 'credit' ? (isAutoPay ? linkedBankId : null) : null,
            billingDay: accType === 'credit' ? Number(billingDay) : null,
            autoPay: accType === 'credit' ? isAutoPay : null
          };
        }
        return a;
      });
      await customAlert("🎉 帳戶編輯成功！", "編輯帳戶");
    } else {
      // Add mode
      const newAcc = {
        id: nextId,
        owner: accOwner,
        type: accType,
        name: finalName,
        nickname: finalNickname,
        icon: finalIcon,
        accountNumber: accNumber.trim(),
        balance: val,
        currency: accCurrency,
        isDefaultExpense,
        isDefaultIncome,
        isDefaultSettle,
        linkedBankAccountId: accType === 'credit' ? (isAutoPay ? linkedBankId : null) : null,
        billingDay: accType === 'credit' ? Number(billingDay) : null,
        autoPay: accType === 'credit' ? isAutoPay : null,
        createdAt: new Date().toISOString()
      };
      updatedAccounts.push(newAcc);
      await customAlert("🎉 帳戶新增成功！", "新增帳戶");
    }

    const finalAssets = { ...assets, accounts: updatedAccounts };
    if (txRecord) {
      onTransaction(finalAssets, txRecord);
    } else {
      setAssets(finalAssets);
    }
    setShowModal(false);
  };

  // Delete Account with Safeguard
  const handleDeleteAccount = async () => {
    if (!editingAccount || isReadOnly) return;

    const remainingBal = editingAccount.balance;

    if (remainingBal === 0) {
      // Zero balance, direct delete
      const confirmMsg = `⚠️ 確定要刪除帳戶【${editingAccount.nickname}】嗎？`;
      if (!(await customConfirm(confirmMsg, "刪除帳戶"))) return;

      const updatedAccounts = accounts.filter(a => a.id !== editingAccount.id);
      setAssets({ ...assets, accounts: updatedAccounts });
      setShowModal(false);
      await customAlert("🗑️ 帳戶已成功刪除。");
    } else {
      // Safeguard: Balance is not zero
      const otherAccs = accounts.filter(a => a.currency === editingAccount.currency && a.id !== editingAccount.id);
      
      if (otherAccs.length === 0) {
        // No other accounts of the same currency
        await customAlert(
          `❌ 無法刪除帳戶！\n這是您唯一的 ${editingAccount.currency} 帳戶，且餘額不為 0（目前餘額: ${remainingBal.toLocaleString()}）。為防資金憑空消失，請先建立另一個 ${editingAccount.currency} 帳戶，或是進行「貨幣換匯」將所有餘額結清轉移後，才能刪除此帳戶。`, 
          "安全性鎖定"
        );
      } else {
        // Offer transfer selection
        setSafeguardTargetId('');
        setShowDeleteSafeguard(true);
      }
    }
  };

  // Execute Safeguard Deletion Transfer
  const handleExecuteSafeguardDelete = async () => {
    if (!safeguardTargetId) {
      await customAlert("請選擇一個目標帳戶來接收餘額！");
      return;
    }

    const targetAcc = accounts.find(a => a.id === safeguardTargetId);
    const amountToTransfer = editingAccount.balance;

    const updatedAccounts = accounts
      .map(a => {
        if (a.id === targetAcc.id) {
          return { ...a, balance: a.balance + amountToTransfer };
        }
        return a;
      })
      .filter(a => a.id !== editingAccount.id);

    // Create deletion transfer record
    const transferRecord = {
      date: new Date().toISOString().split('T')[0],
      month: new Date().toISOString().slice(0, 7),
      type: 'transfer',
      category: '帳戶註銷劃撥',
      total: Math.abs(amountToTransfer),
      payer: operatorName.includes('大狗狗') ? '大狗狗🐕' : '阿陞🐶',
      accountId: editingAccount.id,
      targetAccountId: targetAcc.id,
      note: `[帳戶註銷] 餘額自動劃撥移轉自已刪除的 ${editingAccount.nickname}`
    };

    onTransaction({ ...assets, accounts: updatedAccounts }, transferRecord);
    setShowDeleteSafeguard(false);
    setShowModal(false);
    await customAlert(`🗑️ 帳戶已成功刪除！\n帳戶內餘額 $${amountToTransfer.toLocaleString()} ${editingAccount.currency} 已自動劃撥至【${targetAcc.nickname}】。`);
  };

  // Action Form: Calibrate
  const handleExecuteCalibrate = async () => {
    if (!calAcc || !calNewBalance) {
      await customAlert("請選擇帳戶並輸入校正後的真實餘額！");
      return;
    }
    const acc = accounts.find(a => a.id === calAcc);
    if (!acc) return;

    const rawNum = parseMoney(calNewBalance);
    let newVal = rawNum;
    if (acc.type === 'credit') {
      newVal = calIsDebt ? -Math.abs(rawNum) : Math.abs(rawNum);
    }
    const diff = newVal - acc.balance;

    if (diff === 0) {
      await customAlert("新餘額與目前餘額相同，無須校正！");
      return;
    }

    const updatedAccounts = accounts.map(a => {
      if (a.id === calAcc) return { ...a, balance: newVal };
      return a;
    });

    const isUs = acc.currency === 'USD';
    const totalTwd = isUs ? Math.round(diff * (currentFxRate || 31.5)) : diff;
    const isCredit = acc.type === 'credit';
    const signDesc = isCredit ? (newVal < 0 ? '欠款負債' : (newVal > 0 ? '溢繳/退款' : '已結清')) : '';
    const prevDisplay = isCredit && acc.balance < 0 ? `-$${Math.abs(acc.balance).toLocaleString()}` : `$${acc.balance.toLocaleString()}`;
    const newDisplay = isCredit && newVal < 0 ? `-$${Math.abs(newVal).toLocaleString()}` : `$${newVal.toLocaleString()}`;

    const txRecord = {
      date: calDate,
      month: calDate.slice(0, 7),
      type: 'calibrate',
      category: '餘額校正',
      total: Math.abs(totalTwd),
      twdDiff: totalTwd,
      usdAmount: isUs ? Math.abs(diff) : 0,
      usdDiff: isUs ? diff : 0,
      payer: operatorName.includes('大狗狗') ? '大狗狗🐕' : '阿陞🐶',
      accountId: calAcc,
      note: calNote.trim() || `⚖️ 餘額手動校正: ${acc.nickname} (${prevDisplay} ➔ ${newDisplay}${signDesc ? `，${signDesc}` : ''})`,
      timestamp: new Date().toISOString()
    };

    onTransaction({ ...assets, accounts: updatedAccounts }, txRecord);
    await customAlert(`✅ 帳戶【${acc.nickname}】餘額校正儲存成功！\n校正後餘額：${newDisplay} ${acc.currency || 'TWD'}${signDesc ? `（${signDesc}）` : ''}`);
    setCalNewBalance('');
    setCalNote('');
  };

  // Separate Owner Section Renderer (Prioritizes Current User, Sub-grouped by Account Types)
  const renderOwnerSection = (ownerKey, ownerTitle, accentColor = '#0a84ff') => {
    const ownerAccounts = accounts.filter(a => a.owner === ownerKey);
    if (ownerAccounts.length === 0) return null;

    const categories = [
      { key: 'bank', title: '🏦 銀行活儲帳戶', list: ownerAccounts.filter(a => a.type === 'bank') },
      { key: 'cash', title: '💵 現金帳戶', list: ownerAccounts.filter(a => a.type === 'cash') },
      { key: 'virtual', title: '📱 虛擬與電子票證帳戶', list: ownerAccounts.filter(a => a.type === 'virtual') },
      { key: 'credit', title: '💳 信用卡帳戶', list: ownerAccounts.filter(a => a.type === 'credit') },
      { key: 'investment', title: '📈 投資與交割帳戶', list: ownerAccounts.filter(a => a.type === 'investment') },
    ].filter(cat => cat.list.length > 0);

    return (
      <div style={{
        marginBottom: '20px',
        background: 'rgba(255, 255, 255, 0.02)',
        border: `1px solid ${accentColor}33`,
        borderRadius: '18px',
        padding: '16px 16px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
      }}>
        {/* Owner Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '0.5px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
          <div style={{ fontSize: '0.95rem', fontWeight: '850', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ display: 'inline-block', width: '4px', height: '16px', background: accentColor, borderRadius: '2px' }} />
            {ownerTitle}
          </div>
          <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', fontWeight: '700', background: 'rgba(255,255,255,0.06)', padding: '3px 10px', borderRadius: '12px' }}>
            共 {ownerAccounts.length} 個帳戶
          </span>
        </div>

        {/* Categories inside this Owner */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {categories.map(cat => (
            <div key={cat.key}>
              <div style={{ fontSize: '0.72rem', fontWeight: '800', color: 'rgba(255,255,255,0.5)', marginBottom: '6px', paddingLeft: '4px' }}>
                {cat.title} ({cat.list.length})
              </div>
              <div style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '14px',
                overflow: 'hidden'
              }}>
                {cat.list.map((acc, index) => {
                  const isCredit = acc.type === 'credit';
                  const isPositiveCredit = isCredit && acc.balance > 0;
                  const balanceColor = isCredit ? (isPositiveCredit ? '#30d158' : '#ff9f0a') : '#fff';
                  
                  let defaultIcon = '🏦';
                  let typeName = '銀行活儲';
                  if (acc.type === 'cash') { defaultIcon = '💵'; typeName = '現金'; }
                  else if (acc.type === 'credit') { defaultIcon = '💳'; typeName = '信用卡'; }
                  else if (acc.type === 'virtual') { defaultIcon = '📱'; typeName = '虛擬/票證'; }
                  else if (acc.type === 'investment') { defaultIcon = '📈'; typeName = '投資帳戶'; }

                  const iconToRender = acc.icon || defaultIcon;
                  const isLast = index === cat.list.length - 1;
                  const linkedBank = isCredit && acc.linkedBankAccountId 
                    ? accounts.find(b => b.id === acc.linkedBankAccountId)
                    : null;

                  return (
                    <div
                      key={acc.id}
                      onClick={() => handleOpenEdit(acc)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 14px',
                        cursor: 'pointer',
                        borderBottom: isLast ? 'none' : '0.5px solid rgba(255,255,255,0.06)',
                        transition: 'background 0.2s ease',
                      }}
                      className="apple-list-item"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                        <div style={{
                          fontSize: '1.2rem',
                          width: '36px',
                          height: '36px',
                          borderRadius: '10px',
                          background: isCredit ? 'rgba(255,159,10,0.12)' : (acc.type === 'cash' ? 'rgba(48,209,88,0.12)' : 'rgba(10,132,255,0.12)'),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          {iconToRender}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: '750', fontSize: '0.88rem', color: '#fff' }}>{acc.nickname || acc.name || '未命名帳戶'}</span>
                            <div style={{ display: 'inline-flex', gap: '3px' }}>
                              {acc.isDefaultExpense && <span style={{ fontSize: '0.56rem', background: 'rgba(255,45,85,0.15)', color: '#ff2d55', padding: '1px 4px', borderRadius: '4px', fontWeight: '700' }}>支</span>}
                              {acc.isDefaultIncome && <span style={{ fontSize: '0.56rem', background: 'rgba(48,209,88,0.15)', color: '#30d158', padding: '1px 4px', borderRadius: '4px', fontWeight: '700' }}>收</span>}
                              {acc.isDefaultSettle && <span style={{ fontSize: '0.56rem', background: 'rgba(10,132,255,0.15)', color: '#0a84ff', padding: '1px 4px', borderRadius: '4px', fontWeight: '700' }}>結</span>}
                              {isCredit && (
                                <span style={{ fontSize: '0.56rem', background: 'rgba(255,159,10,0.15)', color: '#ffb94f', padding: '1px 5px', borderRadius: '4px', fontWeight: '800' }}>
                                  ⏰ 每月 {acc.billingDay || 10} 號截止 {acc.autoPay !== false ? '🔔' : ''}
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {typeName} · {acc.name} {acc.accountNumber ? `(${maskNumber(acc.accountNumber, acc.owner)})` : ''}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '10px' }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: '850', fontSize: '0.92rem', color: balanceColor }}>
                            {acc.balance < 0 ? `-$${Math.abs(acc.balance).toLocaleString()}` : (isPositiveCredit ? `+$${acc.balance.toLocaleString()}` : `$${(acc.balance || 0).toLocaleString()}`)}
                          </div>
                          <span style={{ fontSize: '0.62rem', color: isPositiveCredit ? '#30d158' : 'var(--text-tertiary)' }}>
                            {isPositiveCredit ? '💰 溢繳/退款' : (acc.currency || 'TWD')}
                          </span>
                        </div>
                        <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '1.1rem', paddingLeft: '2px' }}>›</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Custom iOS Styled Toggle Switch Row Helper
  const renderToggleRow = (label, value, onChange, disabled = false) => {
    return (
      <div 
        onClick={() => !disabled && onChange(!value)}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 14px',
          borderRadius: '12px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transition: 'all 0.2s ease',
          userSelect: 'none'
        }}
      >
        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: '600' }}>{label}</span>
        <div style={{
          width: '46px',
          height: '26px',
          borderRadius: '13px',
          background: value ? '#34c759' : 'rgba(255,255,255,0.15)',
          position: 'relative',
          transition: 'background-color 0.2s ease',
          flexShrink: 0
        }}>
          <div style={{
            width: '22px',
            height: '22px',
            borderRadius: '50%',
            background: '#fff',
            position: 'absolute',
            top: '2px',
            left: value ? '22px' : '2px',
            transition: 'left 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.4)'
          }} />
        </div>
      </div>
    );
  };

  return (
    <div className="overview-container" style={{ paddingBottom: '90px' }}>
      
      {/* Aurora Header Banner */}
      <div className="header-glass-banner" style={{ marginBottom: '20px' }}>
        <div className="banner-glow-spot" />
        <h2 style={{ fontSize: '1.4rem', fontWeight: '850', color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          🏦 財務帳戶與資產中心
        </h2>
        <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)', margin: '4px 0 0 0' }}>
          全方位管理個人、共同與外幣帳戶，提供安全校正與資產檢視
        </p>

        {/* Hero Card with "淨資產總計" */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          padding: '16px 18px',
          marginTop: '14px',
          textAlign: 'center',
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)'
        }}>
          <span style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-tertiary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
            淨資產總計 (Net Worth)
          </span>
          <h1 style={{
            fontSize: '1.8rem',
            fontWeight: '850',
            margin: '0 auto 12px auto',
            letterSpacing: '-0.02em',
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'center',
            gap: '6px',
            whiteSpace: 'nowrap',
            width: 'fit-content',
            color: '#fff'
          }}>
            <span>${Math.round(netWorth).toLocaleString()}</span>
            <span style={{ 
              fontSize: '0.78rem', 
              fontWeight: '600', 
              opacity: 0.6,
              color: 'var(--text-secondary)'
            }}>
              TWD
            </span>
          </h1>
          <div style={{ display: 'flex', gap: '12px', borderTop: '0.5px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
            <div style={{ flex: 1, textAlign: 'left', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>總資產 (Assets)</span>
              <span style={{ fontSize: '1.05rem', fontWeight: '800', color: '#30d158', marginTop: '2px' }}>
                ${Math.round(totalAssets).toLocaleString()}
              </span>
            </div>
            <div style={{ width: '0.5px', background: 'rgba(255,255,255,0.06)' }} />
            <div style={{ flex: 1, textAlign: 'right', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>總負債 (Liabilities)</span>
              <span style={{ fontSize: '1.05rem', fontWeight: '800', color: '#ff9f0a', marginTop: '2px' }}>
                ${Math.round(Math.abs(totalLiabilities)).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Integration Reminder */}
        <div style={{ marginTop: '12px', fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.04)', padding: '6px 10px', borderRadius: '8px', border: '0.5px solid rgba(255,255,255,0.06)' }}>
          💡 提示：「資金劃撥」與「外幣換匯」已整合至主畫面的<strong>「記帳中心」</strong>，隨時可一鍵快速調撥。
        </div>
      </div>

      {/* Sub Tabs Navigation: Streamlined to List and Calibrate */}
      <div style={{ padding: '0 4px', marginBottom: '16px' }}>
        <SegmentedControl
          options={[
            { label: '🏦 帳戶總覽與管理', value: 'list', activeColor: '#0a84ff' },
            { label: '⚖️ 餘額手動校正', value: 'calibrate', activeColor: '#bf5af2' }
          ]}
          value={subTab}
          onChange={setSubTab}
        />
      </div>

      {/* SUB TAB 1: ACCOUNTS LIST */}
      {subTab === 'list' && (
        <div className="slide-in">
          {/* Create Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px', paddingRight: '4px' }}>
            <button className="glass-btn primary-gradient-btn" onClick={handleOpenAdd} style={{ padding: '8px 16px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: '750' }}>
              ➕ 建立新帳戶
            </button>
          </div>

          {/* Section 1: CURRENT LOGGED IN USER */}
          {renderOwnerSection(
            userKey,
            userKey === 'userA' ? "🐕 大狗狗的個人帳戶 (主要帳戶)" : "🐶 阿陞的個人帳戶 (主要帳戶)",
            userKey === 'userA' ? '#AF52DE' : '#30D158'
          )}

          {/* Section 2: JOINT ACCOUNTS */}
          {renderOwnerSection(
            'joint',
            "🏫 共同公費帳戶 (雙方可編輯)",
            '#007AFF'
          )}

          {/* Section 3: PARTNER ACCOUNTS */}
          {renderOwnerSection(
            partnerKey,
            partnerKey === 'userA' ? "🐕 大狗狗的個人帳戶 (伴侶唯讀)" : "🐶 阿陞的個人帳戶 (伴侶唯讀)",
            partnerKey === 'userA' ? '#AF52DE' : '#30D158'
          )}
        </div>
      )}

      {/* SUB TAB 2: CALIBRATE */}
      {subTab === 'calibrate' && (
        <div className="slide-in glass-card expense-mode-glow-purple" style={{ padding: '20px 18px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚖️ 帳戶餘額手動校正 (校正回歸)</span>
          </h3>

          <div className="inset-group-card">
            {/* Account to Calibrate */}
            <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              <IOSAccountMenuPicker
                label="⚖️ 要校正的帳戶"
                accounts={accounts}
                selectedValue={calAcc}
                onChange={(accId) => {
                  setCalAcc(accId);
                  const target = accounts.find(a => a.id === accId);
                  if (target?.type === 'credit') {
                    setCalIsDebt(target.balance <= 0);
                    setCalNewBalance(target.balance !== 0 ? Math.abs(target.balance).toString() : '');
                  } else if (target) {
                    setCalNewBalance(Math.abs(target.balance || 0).toString());
                  } else {
                    setCalNewBalance('');
                  }
                }}
                currentUser={operatorName}
                themeColor="#AF52DE"
                modalTitle="選擇要校正的帳戶"
              />

              {/* Current Balance Display Subtext */}
              {(() => {
                const target = accounts.find(a => a.id === calAcc);
                if (!target) return null;
                const isCredit = target.type === 'credit';
                const bal = target.balance || 0;
                return (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', padding: '0 4px 4px 4px' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>目前 App 記錄餘額：</span>
                    <strong style={{ color: isCredit ? (bal < 0 ? '#ff9f0a' : (bal > 0 ? '#30d158' : '#8effa2')) : '#fff' }}>
                      {bal < 0 ? `-$${Math.abs(bal).toLocaleString()}` : (isCredit && bal > 0 ? `+$${bal.toLocaleString()}` : `$${bal.toLocaleString()}`)} {target.currency || 'TWD'}
                      {isCredit && (bal < 0 ? ' (尚有欠款)' : (bal > 0 ? ' (溢繳/退款)' : ' (已結清)'))}
                    </strong>
                  </div>
                );
              })()}
            </div>

            {/* Credit Card Sign Selector & Guide */}
            {(() => {
              const target = accounts.find(a => a.id === calAcc);
              if (target?.type !== 'credit') return null;
              return (
                <div className="inset-group-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px', padding: '10px 14px' }}>
                  <span className="inset-group-label" style={{ alignSelf: 'flex-start', fontSize: '0.78rem', fontWeight: '800', color: '#fff' }}>
                    💳 信用卡正負屬性設定
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setCalIsDebt(true)}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: calIsDebt ? '1px solid #ff9f0a' : '1px solid rgba(255,255,255,0.1)',
                        background: calIsDebt ? 'rgba(255,159,10,0.18)' : 'rgba(255,255,255,0.04)',
                        color: calIsDebt ? '#ffb94f' : 'var(--text-secondary)',
                        fontWeight: '800',
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      💳 尚有欠款 (負數 -)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCalIsDebt(false)}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: !calIsDebt ? '1px solid #30d158' : '1px solid rgba(255,255,255,0.1)',
                        background: !calIsDebt ? 'rgba(48,209,88,0.18)' : 'rgba(255,255,255,0.04)',
                        color: !calIsDebt ? '#30d158' : 'var(--text-secondary)',
                        fontWeight: '800',
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      💰 溢繳/退款 (正數 +)
                    </button>
                  </div>

                  {/* Explanation Banner */}
                  <div style={{
                    padding: '8px 12px',
                    background: calIsDebt ? 'rgba(255,159,10,0.08)' : 'rgba(48,209,88,0.08)',
                    border: `1px solid ${calIsDebt ? 'rgba(255,159,10,0.2)' : 'rgba(48,209,88,0.2)'}`,
                    borderRadius: '8px',
                    fontSize: '0.72rem',
                    lineHeight: '1.45',
                    color: 'var(--text-secondary)'
                  }}>
                    {calIsDebt ? (
                      <div>
                        <strong style={{ color: '#ffb94f' }}>💳 尚有欠款 (負數 -，預設)</strong>：<br />
                        代表您在網銀查到的未出帳或本期應繳帳款（您欠銀行錢，為負債）。系統校正後會將餘額設為 <strong>負數</strong>。
                      </div>
                    ) : (
                      <div>
                        <strong style={{ color: '#30d158' }}>💰 溢繳/退款 (正數 +)</strong>：<br />
                        代表前期帳款辦理銷貨退回折抵款，或多繳了溢繳款（銀行倒欠您錢，為正資產）。系統校正後會將餘額設為 <strong>正數</strong>。
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* New Balance */}
            <div className="inset-group-row">
              <span className="inset-group-label">
                {(() => {
                  const target = accounts.find(a => a.id === calAcc);
                  if (target?.type === 'credit') {
                    return calIsDebt ? '💳 校正後欠款 (-)' : '💰 校正後溢繳 (+)';
                  }
                  return '💵 真實餘額 (校正後)';
                })()}
              </span>
              <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                {(() => {
                  const target = accounts.find(a => a.id === calAcc);
                  if (target?.type !== 'credit') return null;
                  return (
                    <span style={{ fontSize: '1.15rem', fontWeight: '850', color: calIsDebt ? '#ff9f0a' : '#30d158' }}>
                      {calIsDebt ? '-' : '+'}
                    </span>
                  );
                })()}
                <input
                  type="text"
                  inputMode="numeric"
                  className="inset-group-input tabular-nums"
                  value={calNewBalance}
                  onChange={(e) => setCalNewBalance(formatInputMoney(e.target.value))}
                  placeholder="$0"
                  style={{
                    fontSize: '1.15rem',
                    fontWeight: '800',
                    color: (() => {
                      const target = accounts.find(a => a.id === calAcc);
                      if (target?.type === 'credit') return calIsDebt ? '#ff9f0a' : '#30d158';
                      return undefined;
                    })()
                  }}
                />
              </span>
            </div>

            {/* Calibrate Reason / Note */}
            <div className="inset-group-row">
              <span className="inset-group-label">📝 校正原因/備註</span>
              <span className="inset-group-value" style={{ flex: 1, marginLeft: '24px' }}>
                <input
                  type="text"
                  className="inset-group-input"
                  value={calNote}
                  onChange={(e) => setCalNote(e.target.value)}
                  placeholder="例如：手續費誤差、錢包零錢誤差"
                />
              </span>
            </div>

            {/* Calibrate Date */}
            <div className="inset-group-row">
              <span className="inset-group-label">📅 校正日期</span>
              <span className="inset-group-value">
                <input
                  type="date"
                  style={{ background: 'none', border: 'none', color: '#fff', textAlign: 'right', outline: 'none' }}
                  value={calDate}
                  onChange={(e) => setCalDate(e.target.value)}
                />
              </span>
            </div>
          </div>

          <button onClick={handleExecuteCalibrate} className="glass-btn primary-gradient-btn" style={{ width: '100%', height: '44px', borderRadius: '12px', marginTop: '16px', fontWeight: '800' }}>
            ⚖️ 確定校正並儲存
          </button>
        </div>
      )}

      {/* ACCOUNT DETAIL MODAL (ADD / EDIT) */}
      {showModal && createPortal(
        <div className="liquid-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="liquid-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px', width: '92%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: '20px 18px', boxSizing: 'border-box' }}>
            
            {/* Fixed Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexShrink: 0 }}>
              <div style={{ fontWeight: '850', fontSize: '1.15rem', color: '#fff' }} className="liquid-modal-title">
                {isReadOnly ? '📋 帳戶唯讀預覽' : (editingAccount ? '✏️ 編輯帳戶資料' : '🏦 建立全新帳戶')}
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '1.4rem', cursor: 'pointer', padding: '0 4px' }}>✕</button>
            </div>

            {/* Read Only Notice */}
            {isReadOnly && (
              <div style={{ backgroundColor: 'rgba(255,149,0,0.12)', border: '0.5px solid rgba(255,149,0,0.3)', color: '#ffb94f', padding: '10px 14px', borderRadius: '10px', fontSize: '0.74rem', marginBottom: '10px', lineHeight: '1.4', flexShrink: 0 }}>
                🔒 這是您伴侶的個人私有帳戶。您目前僅能預覽其金額，無權對其進行修改或刪除。
              </div>
            )}

            {/* Scrollable Form Fields with Clear Hierarchical Sections */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto', paddingRight: '4px', paddingBottom: '10px', flex: 1, minHeight: 0 }}>
              
              {/* SECTION 1: HEADER HERO CARD */}
              <div style={{ padding: '16px', borderRadius: '14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', flexDirection: 'column', gap: '12px', flexShrink: 0 }}>
                
                {/* Top Avatar Icon + Nickname Row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {/* Custom Emoji Picker Button */}
                  <div style={{ position: 'relative', width: '52px', height: '52px', flexShrink: 0 }}>
                    <div style={{
                      width: '100%',
                      height: '100%',
                      borderRadius: '16px',
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: '1.5px dashed rgba(255, 255, 255, 0.3)',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      fontSize: '1.8rem',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                    }}>
                      {accIcon || '🏦'}
                    </div>
                    <input
                      disabled={isReadOnly}
                      type="text"
                      value={accIcon}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) { setAccIcon(''); return; }
                        try {
                          const segmenter = new Intl.Segmenter();
                          const segments = [...segmenter.segment(val)].map(s => s.segment);
                          setAccIcon(segments.length > 0 ? segments[segments.length - 1] : '');
                        } catch {
                          const chars = Array.from(val);
                          setAccIcon(chars.length > 0 ? chars[chars.length - 1] : '');
                        }
                      }}
                      style={{
                        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                        opacity: 0, cursor: isReadOnly ? 'default' : 'pointer'
                      }}
                      title="點擊變更 Emoji 圖示"
                    />
                  </div>

                  {/* Account Nickname (Primary Label) */}
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px', fontWeight: '700' }}>✏️ 帳戶暱稱 (主要顯示標籤)</label>
                    <input
                      disabled={isReadOnly}
                      type="text"
                      value={accNickname}
                      onChange={(e) => setAccNickname(e.target.value)}
                      placeholder="例如：薪轉帳戶、主力信用卡、皮夾"
                      className="glass-input"
                      style={{ width: '100%', height: '38px', borderRadius: '10px', padding: '0 10px', fontSize: '0.92rem', fontWeight: '800' }}
                    />
                  </div>
                </div>

                {/* Hero Balance Input Row */}
                <div style={{ borderTop: '1px dashed rgba(255,255,255,0.08)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '3px', fontWeight: '700' }}>
                      {accType === 'credit' ? (accIsDebt ? '💳 目前未繳帳單 (負債 -)' : '💰 銷貨退回/溢繳款 (正數 +)') : '💵 目前帳戶餘額'}
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {accType === 'credit' && (
                        <span style={{ fontSize: '1.25rem', fontWeight: '850', color: accIsDebt ? '#ff9f0a' : '#30d158' }}>
                          {accIsDebt ? '-' : '+'}
                        </span>
                      )}
                      <input
                        disabled={isReadOnly}
                        type="text"
                        value={formatInputMoney(accBalance)}
                        onChange={(e) => setAccBalance(e.target.value)}
                        placeholder="$0"
                        className="glass-input tabular-nums"
                        style={{ width: '100%', height: '42px', borderRadius: '10px', padding: '0 12px', fontSize: '1.25rem', fontWeight: '850', color: accType === 'credit' ? (accIsDebt ? '#ff9f0a' : '#30d158') : '#30d158' }}
                      />
                    </div>
                  </div>

                  <div style={{ width: '100px' }}>
                    <label style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '3px', fontWeight: '700' }}>💱 幣別</label>
                    <select
                      disabled={isReadOnly}
                      value={accCurrency}
                      onChange={(e) => setAccCurrency(e.target.value)}
                      className="glass-input"
                      style={{ width: '100%', height: '42px', borderRadius: '10px', padding: '0 8px', fontSize: '0.86rem', fontWeight: '700' }}
                    >
                      <option value="TWD">TWD ($)</option>
                      <option value="USD">USD ($)</option>
                    </select>
                  </div>
                </div>

                {/* Credit Card Positive/Negative Selector in Modal */}
                {accType === 'credit' && (
                  <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => setAccIsDebt(true)}
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          borderRadius: '8px',
                          border: accIsDebt ? '1px solid #ff9f0a' : '1px solid rgba(255,255,255,0.1)',
                          background: accIsDebt ? 'rgba(255,159,10,0.18)' : 'rgba(255,255,255,0.04)',
                          color: accIsDebt ? '#ffb94f' : 'var(--text-secondary)',
                          fontWeight: '800',
                          fontSize: '0.74rem',
                          cursor: isReadOnly ? 'not-allowed' : 'pointer'
                        }}
                      >
                        💳 尚有欠款 (負數 -)
                      </button>
                      <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => setAccIsDebt(false)}
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          borderRadius: '8px',
                          border: !accIsDebt ? '1px solid #30d158' : '1px solid rgba(255,255,255,0.1)',
                          background: !accIsDebt ? 'rgba(48,209,88,0.18)' : 'rgba(255,255,255,0.04)',
                          color: !accIsDebt ? '#30d158' : 'var(--text-secondary)',
                          fontWeight: '800',
                          fontSize: '0.74rem',
                          cursor: isReadOnly ? 'not-allowed' : 'pointer'
                        }}
                      >
                        💰 溢繳/退款 (正數 +)
                      </button>
                    </div>
                    <div style={{
                      padding: '6px 10px',
                      background: accIsDebt ? 'rgba(255,159,10,0.08)' : 'rgba(48,209,88,0.08)',
                      border: `1px solid ${accIsDebt ? 'rgba(255,159,10,0.2)' : 'rgba(48,209,88,0.2)'}`,
                      borderRadius: '6px',
                      fontSize: '0.68rem',
                      lineHeight: '1.4',
                      color: 'var(--text-secondary)'
                    }}>
                      {accIsDebt 
                        ? '💳 欠款負債 (-)：代表未繳信用卡帳款或刷卡負債（您欠銀行錢）。' 
                        : '💰 溢繳/退款 (+)：代表銷貨退回折抵款或溢繳款（銀行倒欠您錢，為正資產）。'}
                    </div>
                  </div>
                )}

              </div>

              {/* SECTION 2: BASIC METADATA */}
              <div style={{ padding: '14px', borderRadius: '14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '10px', flexShrink: 0 }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--accent-blue)', fontWeight: '800', marginBottom: '2px', letterSpacing: '0.5px' }}>
                  🏛️ 帳戶屬性與持有人
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {/* Owner */}
                  <div>
                    <label style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '4px' }}>👤 持有人</label>
                    <select
                      disabled={isReadOnly || editingAccount}
                      value={accOwner}
                      onChange={(e) => setAccOwner(e.target.value)}
                      className="glass-input"
                      style={{ width: '100%', height: '36px', borderRadius: '8px', padding: '0 8px', fontSize: '0.8rem' }}
                    >
                      <option value="userA">大狗狗 🐕</option>
                      <option value="userB">阿陞 🐶</option>
                      <option value="joint">🏫 共同</option>
                    </select>
                  </div>

                  {/* Account Type */}
                  <div>
                    <label style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '4px' }}>🏦 帳戶類型</label>
                    <select
                      disabled={isReadOnly}
                      value={accType}
                      onChange={(e) => setAccType(e.target.value)}
                      className="glass-input"
                      style={{ width: '100%', height: '36px', borderRadius: '8px', padding: '0 8px', fontSize: '0.8rem' }}
                    >
                      <option value="bank">🏦 銀行活儲</option>
                      <option value="cash">💵 現金錢包</option>
                      <option value="credit">💳 信用卡</option>
                      <option value="virtual">📱 電子票證/虛擬</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {/* Institution Name */}
                  <div>
                    <label style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '4px' }}>🏢 金融機構名稱</label>
                    <input
                      disabled={isReadOnly}
                      type="text"
                      value={accName}
                      onChange={(e) => setAccName(e.target.value)}
                      placeholder="如：國泰世華"
                      className="glass-input"
                      style={{ width: '100%', height: '36px', borderRadius: '8px', padding: '0 8px', fontSize: '0.8rem' }}
                    />
                  </div>

                  {/* Account Number */}
                  <div>
                    <label style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '4px' }}>🔢 帳號/卡號末碼</label>
                    <input
                      disabled={isReadOnly}
                      type="text"
                      value={isReadOnly ? maskNumber(accNumber, accOwner) : accNumber}
                      onChange={(e) => setAccNumber(e.target.value)}
                      placeholder="末 4~5 碼"
                      className="glass-input"
                      style={{ width: '100%', height: '36px', borderRadius: '8px', padding: '0 8px', fontSize: '0.8rem' }}
                    />
                  </div>
                </div>

              </div>

              {/* SECTION 3: CREDIT CARD DUE DATE & REMINDER SETTINGS (僅信用卡顯示) */}
              {accType === 'credit' && (
                <div style={{ padding: '14px', borderRadius: '14px', background: 'rgba(255,159,10,0.06)', border: '1px solid rgba(255,159,10,0.2)', display: 'flex', flexDirection: 'column', gap: '10px', flexShrink: 0 }}>
                  <div style={{ fontSize: '0.74rem', color: '#ff9f0a', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span>⏰</span>
                    <span>信用卡繳款截止日與到期提醒設定</span>
                  </div>

                  <p style={{ margin: 0, fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)', lineHeight: '1.4' }}>
                    💡 系統將在截止日前 3 天發送推播通知提醒您至網銀繳納真實帳單，不影響 App 內部其他記帳邏輯。
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', alignItems: 'center' }}>
                    <div>
                      <label style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: '4px', fontWeight: '750' }}>⏰ 每月繳款截止日</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>每月</span>
                        <input
                          disabled={isReadOnly}
                          type="number"
                          min="1"
                          max="31"
                          value={billingDay}
                          onChange={(e) => setBillingDay(e.target.value)}
                          className="glass-input"
                          style={{ width: '60px', height: '36px', borderRadius: '8px', padding: '0 8px', fontSize: '0.88rem', textAlign: 'center', fontWeight: '800' }}
                        />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>號</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'flex-end', height: '100%' }}>
                      <div style={{ width: '100%', marginTop: '14px' }}>
                        {renderToggleRow("到期推播提醒", autoPay, setAutoPay, isReadOnly)}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: '2px' }}>
                    <IOSAccountMenuPicker
                      label="🏦 預設劃撥扣繳活儲帳戶 (選填，結清時自動預選)"
                      accounts={accounts}
                      selectedValue={linkedBankId}
                      onChange={setLinkedBankId}
                      filterFn={a => (a.type === 'bank' || a.type === 'cash') && (a.owner === accOwner || a.owner === 'joint')}
                      currentUser={operatorName}
                      themeColor="#ff9f0a"
                      placeholder="請選擇常用劃撥活儲帳戶"
                      modalTitle="選擇常用劃撥活儲帳戶"
                    />
                  </div>
                </div>
              )}

              {/* SECTION 4: DEFAULT USAGE SWITCHES */}
              <div style={{ padding: '14px', borderRadius: '14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '10px', flexShrink: 0 }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: '800' }}>
                  ⚙️ 預設偏好設定 (記帳時自動優先填入)
                </div>

                {renderToggleRow("設為此持有人預設【支出帳戶】", isDefaultExpense, setIsDefaultExpense, isReadOnly)}
                {renderToggleRow("設為此持有人預設【收入入帳帳戶】", isDefaultIncome, setIsDefaultIncome, isReadOnly || accType === 'credit')}
                {renderToggleRow("設為此持有人預設【公費代墊/結算帳戶】", isDefaultSettle, setIsDefaultSettle, isReadOnly)}
              </div>

            </div>

            {/* Modal Actions Footer */}
            <div style={{ display: 'flex', gap: '10px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0, marginTop: '8px' }}>
              {editingAccount && !isReadOnly && (
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  className="glass-btn glass-btn-danger"
                  style={{ padding: '10px 16px', borderRadius: '10px', fontSize: '0.82rem', fontWeight: '750' }}
                >
                  🗑️ 刪除
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="glass-btn"
                style={{ flex: 1, padding: '10px 0', borderRadius: '10px', fontSize: '0.82rem', fontWeight: '700' }}
              >
                {isReadOnly ? '關閉' : '取消'}
              </button>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={handleSaveAccount}
                  className="glass-btn primary-gradient-btn"
                  style={{ flex: 2, padding: '10px 0', borderRadius: '10px', fontSize: '0.82rem', fontWeight: '800' }}
                >
                  💾 儲存帳戶
                </button>
              )}
            </div>

          </div>
        </div>,
        document.body
      )}

      {/* SAFEGUARD DELETION MODAL */}
      {showDeleteSafeguard && createPortal(
        <div className="liquid-modal-overlay" onClick={() => setShowDeleteSafeguard(false)}>
          <div className="liquid-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '380px', width: '90%', padding: '20px', textAlign: 'left' }}>
            <div style={{ fontWeight: '850', fontSize: '1.1rem', color: '#ff9f0a', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🛡️</span>
              <span>帳戶餘額安全轉移防護</span>
            </div>
            
            <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.8)', lineHeight: '1.5', margin: '0 0 14px 0' }}>
              帳戶【<strong>{editingAccount?.nickname}</strong>】內尚有餘額 <strong>${(editingAccount?.balance || 0).toLocaleString()} {editingAccount?.currency}</strong>。
              為確保您的真實資產完整不遺失，系統將在刪除前將此筆款項自動全數劃撥至您指定的帳戶。
            </p>

            <div style={{ marginBottom: '16px' }}>
              <IOSAccountMenuPicker
                label="📥 請選擇接收此筆餘額之目標帳戶"
                accounts={accounts}
                selectedValue={safeguardTargetId}
                onChange={setSafeguardTargetId}
                filterFn={a => a.currency === editingAccount?.currency && a.id !== editingAccount?.id}
                currentUser={operatorName}
                themeColor="#ff9f0a"
                modalTitle="選擇接收餘額之帳戶"
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowDeleteSafeguard(false)}
                className="glass-btn"
                style={{ flex: 1, padding: '10px 0', borderRadius: '10px', fontSize: '0.8rem' }}
              >
                取消刪除
              </button>
              <button
                type="button"
                onClick={handleExecuteSafeguardDelete}
                className="glass-btn glass-btn-danger"
                style={{ flex: 2, padding: '10px 0', borderRadius: '10px', fontSize: '0.8rem', fontWeight: '800' }}
              >
                確認劃撥並刪除
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default AccountsManager;
