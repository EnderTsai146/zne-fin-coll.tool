// src/components/AccountsManager.jsx
import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import SegmentedControl from './SegmentedControl';

const formatMoney = (num) => "$" + Math.round(Number(num)).toLocaleString();

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
  } catch (e) {
    const chars = Array.from(trimmed);
    return chars.length > 0 ? chars[0] : '';
  }
};

const AccountsManager = ({
  assets,
  setAssets,
  currentUser,
  operatorName,
  customAlert,
  customConfirm,
  currentFxRate,
  onTransaction
}) => {
  const [subTab, setSubTab] = useState('list'); // 'list', 'transfer', 'exchange', 'calibrate'
  
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

  // Transfer states
  const [tfSource, setTfSource] = useState('');
  const [tfTarget, setTfTarget] = useState('');
  const [tfAmount, setTfAmount] = useState('');
  const [tfTargetAmount, setTfTargetAmount] = useState(''); // Only used if cross-currency
  const [tfNote, setTfNote] = useState('');
  const [tfDate, setTfDate] = useState(new Date().toISOString().split('T')[0]);

  // Exchange states
  const [exSource, setExSource] = useState('');
  const [exTarget, setExTarget] = useState('');
  const [exSourceAmount, setExSourceAmount] = useState(''); // Sell amount
  const [exTargetAmount, setExTargetAmount] = useState(''); // Buy amount
  const [exNote, setExNote] = useState('');
  const [exDate, setExDate] = useState(new Date().toISOString().split('T')[0]);

  // Calibrate states
  const [calAcc, setCalAcc] = useState('');
  const [calNewBalance, setCalNewBalance] = useState('');
  const [calNote, setCalNote] = useState('');
  const [calDate, setCalDate] = useState(new Date().toISOString().split('T')[0]);

  const userKey = operatorName.includes('大狗狗') ? 'userA' : 'userB';
  const partnerKey = userKey === 'userA' ? 'userB' : 'userA';
  
  const accounts = assets?.accounts || [];

  // Filter accounts list for selection
  const bankAndCashAccounts = accounts.filter(a => a.type === 'bank' || a.type === 'cash' || a.type === 'virtual');

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
    setAccCurrency('TWD');
    setIsDefaultExpense(false);
    setIsDefaultIncome(false);
    setIsDefaultSettle(false);
    setLinkedBankId('');
    setBillingDay('10');
    setAutoPay(true);
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
    if (!accName.trim() || !accNickname.trim()) {
      await customAlert("請輸入帳戶名稱與暱稱！");
      return;
    }
    
    let val = parseMoney(accBalance);
    if (accType === 'credit') {
      val = -Math.abs(val); // Save as negative liability
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
      const changeText = balanceDiff > 0 ? `增加 $${balanceDiff.toLocaleString()}` : `減少 $${Math.abs(balanceDiff).toLocaleString()}`;
      
      const confirmMessage = editingAccount
        ? `⚠️ 偵測到帳戶餘額變更！\n【${accNickname}】的餘額將由 $${prevBalance.toLocaleString()} ${accCurrency} 變更為 $${val.toLocaleString()} ${accCurrency}（${changeText}）。\n\n系統將自動產生一筆「餘額校正」紀錄以留下審計軌跡，是否確定儲存？`
        : `🆕 您為新帳戶【${accNickname}】設定了初始餘額 $${val.toLocaleString()} ${accCurrency}。\n\n系統將自動產生一筆「餘額校正」紀錄作為初始帳面軌跡，是否確定儲存？`;

      const confirmSave = await customConfirm(confirmMessage, "儲存變更確認");
      if (!confirmSave) return;

      const totalTwd = isUs ? Math.round(balanceDiff * (currentFxRate || 31.5)) : balanceDiff;

      txRecord = {
        date: new Date().toISOString().split('T')[0],
        month: new Date().toISOString().slice(0, 7),
        type: 'calibrate',
        category: '餘額校正',
        total: totalTwd,
        usdAmount: isUs ? balanceDiff : 0,
        accountId: nextId,
        payer: accOwner === 'joint' ? '共同帳戶' : (accOwner === 'userA' ? '大狗狗🐕' : '阿陞🐶'),
        note: editingAccount
          ? `📝 編輯帳戶餘額自動調整: ${accNickname} (${prevBalance.toLocaleString()} ➔ ${val.toLocaleString()} ${accCurrency})`
          : `🆕 新增帳戶設定初始餘額: ${accNickname} (初始餘額: ${val.toLocaleString()} ${accCurrency})`
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
            name: accName.trim(),
            nickname: accNickname.trim(),
            icon: finalIcon,
            accountNumber: accNumber.trim(),
            balance: val,
            currency: accCurrency,
            isDefaultExpense,
            isDefaultIncome,
            isDefaultSettle,
            linkedBankAccountId: accType === 'credit' ? linkedBankId : null,
            billingDay: accType === 'credit' ? Number(billingDay) : null,
            autoPay: accType === 'credit' ? autoPay : null
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
        name: accName.trim(),
        nickname: accNickname.trim(),
        icon: finalIcon,
        accountNumber: accNumber.trim(),
        balance: val,
        currency: accCurrency,
        isDefaultExpense,
        isDefaultIncome,
        isDefaultSettle,
        linkedBankAccountId: accType === 'credit' ? linkedBankId : null,
        billingDay: accType === 'credit' ? Number(billingDay) : null,
        autoPay: accType === 'credit' ? autoPay : null,
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

  // Action Form: Transfer
  const handleExecuteTransfer = async () => {
    if (!tfSource || !tfTarget || !tfAmount) {
      await customAlert("請選擇帳戶並填寫劃撥金額！");
      return;
    }
    const sellVal = parseMoney(tfAmount);
    if (sellVal <= 0) {
      await customAlert("劃撥金額必須大於 0！");
      return;
    }
    if (tfSource === tfTarget) {
      await customAlert("轉出與轉入帳戶不能相同！");
      return;
    }

    const srcAcc = accounts.find(a => a.id === tfSource);
    const tgtAcc = accounts.find(a => a.id === tfTarget);

    if (srcAcc.balance < sellVal) {
      await customAlert(`❌ 轉出帳戶【${srcAcc.nickname}】餘額不足！`);
      return;
    }

    const isCrossCurrency = srcAcc.currency !== tgtAcc.currency;
    let buyVal = sellVal;
    let impliedRateText = "";

    if (isCrossCurrency) {
      buyVal = parseMoney(tfTargetAmount);
      if (buyVal <= 0) {
        await customAlert("跨幣別劃撥時，轉入金額必須大於 0！");
        return;
      }
      // Calculate rate: TWD per 1 USD
      let rate = 0;
      if (srcAcc.currency === 'TWD') {
        rate = sellVal / buyVal;
        impliedRateText = ` (匯率 1 USD = ${rate.toFixed(4)} TWD)`;
      } else {
        rate = buyVal / sellVal;
        impliedRateText = ` (匯率 1 USD = ${rate.toFixed(4)} TWD)`;
      }
    }

    const updatedAccounts = accounts.map(a => {
      if (a.id === tfSource) return { ...a, balance: a.balance - sellVal };
      if (a.id === tfTarget) return { ...a, balance: a.balance + buyVal };
      return a;
    });

    // Save TWD value for history total
    const historyTotal = srcAcc.currency === 'TWD' ? sellVal : buyVal * (currentFxRate || 31.5);

    const txRecord = {
      date: tfDate,
      month: tfDate.slice(0, 7),
      type: 'transfer',
      category: '資產劃撥',
      total: historyTotal,
      sourceAmount: sellVal,
      targetAmount: buyVal,
      payer: operatorName.includes('大狗狗') ? '大狗狗🐕' : '阿陞🐶',
      accountId: tfSource,
      targetAccountId: tfTarget,
      note: tfNote.trim() || `資金劃撥: ${srcAcc.nickname} ➔ ${tgtAcc.nickname}${impliedRateText}`,
    };

    onTransaction({ ...assets, accounts: updatedAccounts }, txRecord);
    await customAlert(`✅ 資金劃撥成功！`);
    setTfAmount('');
    setTfTargetAmount('');
    setTfNote('');
  };

  // Action Form: Exchange
  const handleExecuteExchange = async () => {
    if (!exSource || !exTarget || !exSourceAmount || !exTargetAmount) {
      await customAlert("請選擇帳戶並填寫換匯金額！");
      return;
    }
    const sellVal = parseMoney(exSourceAmount);
    const buyVal = parseMoney(exTargetAmount);

    if (sellVal <= 0 || buyVal <= 0) {
      await customAlert("換匯金額必須大於 0！");
      return;
    }

    const srcAcc = accounts.find(a => a.id === exSource);
    const tgtAcc = accounts.find(a => a.id === exTarget);

    if (srcAcc.balance < sellVal) {
      await customAlert(`❌ 轉出帳戶【${srcAcc.nickname}】餘額不足！`);
      return;
    }
    if (srcAcc.currency === tgtAcc.currency) {
      await customAlert(`❌ 相同的貨幣無須換匯，請改用「資金劃撥」功能！`);
      return;
    }

    const updatedAccounts = accounts.map(a => {
      if (a.id === exSource) return { ...a, balance: a.balance - sellVal };
      if (a.id === exTarget) return { ...a, balance: a.balance + buyVal };
      return a;
    });

    const twdVal = srcAcc.currency === 'TWD' ? sellVal : buyVal;
    const usdVal = srcAcc.currency === 'USD' ? sellVal : buyVal;

    const txRecord = {
      date: exDate,
      month: exDate.slice(0, 7),
      type: 'exchange',
      category: '貨幣換匯',
      total: twdVal,
      usdAmount: usdVal,
      sourceAmount: sellVal,
      targetAmount: buyVal,
      payer: operatorName.includes('大狗狗') ? '大狗狗🐕' : '阿陞🐶',
      accountId: exSource,
      targetAccountId: exTarget,
      note: exNote.trim() || `換匯: ${srcAcc.nickname} ➔ ${tgtAcc.nickname}`,
    };

    onTransaction({ ...assets, accounts: updatedAccounts }, txRecord);
    await customAlert(`✅ 外幣換匯成功！`);
    setExSourceAmount('');
    setExTargetAmount('');
    setExNote('');
  };

  // Action Form: Calibrate
  const handleExecuteCalibrate = async () => {
    if (!calAcc || !calNewBalance) {
      await customAlert("請選擇帳戶並輸入校正後的真實餘額！");
      return;
    }
    const newVal = parseMoney(calNewBalance);
    const acc = accounts.find(a => a.id === calAcc);
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

    const txRecord = {
      date: calDate,
      month: calDate.slice(0, 7),
      type: 'calibrate',
      category: '餘額校正',
      total: totalTwd,
      usdAmount: isUs ? diff : 0,
      payer: operatorName.includes('大狗狗') ? '大狗狗🐕' : '阿陞🐶',
      accountId: calAcc,
      note: calNote.trim() || `餘額手動校正: ${acc.nickname}`,
    };

    onTransaction({ ...assets, accounts: updatedAccounts }, txRecord);
    await customAlert(`✅ 餘額校正儲存成功！`);
    setCalNewBalance('');
    setCalNote('');
  };

  // Custom Account grid selector helper
  const renderAccountSelector = (selectedValue, onChange, filterFn = () => true) => {
    const list = accounts.filter(filterFn);
    if (list.length === 0) {
      return <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', padding: '6px' }}>無相符帳戶</div>;
    }
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginTop: '6px' }}>
        {list.map(acc => {
          const isSelected = selectedValue === acc.id;
          const isCredit = acc.type === 'credit';
          const balanceColor = isCredit ? '#ff9500' : '#8effa2';
          
          let defaultIcon = '🏦';
          if (acc.type === 'cash') defaultIcon = '💵';
          else if (acc.type === 'credit') defaultIcon = '💳';
          else if (acc.type === 'virtual') defaultIcon = '📱';
          
          const iconToRender = acc.icon || defaultIcon;
          
          return (
            <button
              key={acc.id}
              type="button"
              onClick={() => onChange(acc.id)}
              style={{
                padding: '8px 10px',
                borderRadius: '10px',
                border: isSelected ? '1.5px solid var(--accent-blue)' : '1px solid rgba(255,255,255,0.08)',
                background: isSelected ? 'rgba(0,122,255,0.15)' : 'rgba(255,255,255,0.02)',
                color: isSelected ? '#fff' : 'var(--text-secondary)',
                fontSize: '0.78rem',
                fontWeight: '600',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                transition: 'all 0.2s ease',
                boxShadow: isSelected ? '0 0 10px rgba(0,122,255,0.2)' : 'none',
                minHeight: '52px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                <span style={{ fontSize: '0.76rem', color: isSelected ? '#fff' : 'var(--text-primary)', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {iconToRender} {acc.nickname}
                </span>
              </div>
              <span style={{ fontSize: '0.66rem', color: isSelected ? '#fff' : balanceColor, fontWeight: '700' }}>
                ${acc.balance.toLocaleString()} {acc.currency}
              </span>
            </button>
          );
        })}
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

  // Apple settings-style list renderer (owner name omitted from group items)
  const renderAccountListGroup = (title, list) => {
    if (list.length === 0) return null;
    return (
      <div style={{ marginBottom: '22px' }}>
        <div style={{ fontSize: '0.74rem', fontWeight: '700', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', paddingLeft: '4px' }}>
          {title}
        </div>
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '14px',
          overflow: 'hidden'
        }}>
          {list.map((acc, index) => {
            const isCredit = acc.type === 'credit';
            const balanceColor = isCredit ? '#ff9500' : '#fff';
            
            let defaultIcon = '🏦';
            let typeName = '銀行活儲';
            if (acc.type === 'cash') {
              defaultIcon = '💵';
              typeName = '現金';
            } else if (acc.type === 'credit') {
              defaultIcon = '💳';
              typeName = '信用卡';
            } else if (acc.type === 'virtual') {
              defaultIcon = '📱';
              typeName = '電子票證/虛擬帳戶';
            }
            
            const iconToRender = acc.icon || defaultIcon;
            const isLast = index === list.length - 1;
            
            return (
              <div
                key={acc.id}
                onClick={() => handleOpenEdit(acc)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  cursor: 'pointer',
                  borderBottom: isLast ? 'none' : '0.5px solid rgba(255,255,255,0.06)',
                  transition: 'background 0.2s ease',
                }}
                className="apple-list-item"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                  <div style={{
                    fontSize: '1.25rem',
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: isCredit ? 'rgba(255,149,0,0.08)' : (acc.type === 'cash' ? 'rgba(52,199,89,0.08)' : 'rgba(10,132,255,0.08)'),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    {iconToRender}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: '700', fontSize: '0.88rem', color: '#fff' }}>{acc.nickname}</span>
                      <div style={{ display: 'inline-flex', gap: '3px' }}>
                        {acc.isDefaultExpense && <span style={{ fontSize: '0.58rem', background: 'rgba(255,45,85,0.15)', color: '#ff2d55', padding: '1px 4px', borderRadius: '4px', fontWeight: '700' }}>支</span>}
                        {acc.isDefaultIncome && <span style={{ fontSize: '0.58rem', background: 'rgba(52,199,89,0.15)', color: '#30d158', padding: '1px 4px', borderRadius: '4px', fontWeight: '700' }}>收</span>}
                        {acc.isDefaultSettle && <span style={{ fontSize: '0.58rem', background: 'rgba(10,132,255,0.15)', color: '#0a84ff', padding: '1px 4px', borderRadius: '4px', fontWeight: '700' }}>結</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {typeName} · {acc.name} {acc.accountNumber ? `(${maskNumber(acc.accountNumber, acc.owner)})` : ''}
                    </div>
                  </div>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '12px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: '800', fontSize: '0.94rem', color: balanceColor }}>
                      ${acc.balance.toLocaleString()}
                    </div>
                    <span style={{ fontSize: '0.64rem', color: 'var(--text-tertiary)' }}>{acc.currency}</span>
                  </div>
                  <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '1.1rem', paddingLeft: '4px' }}>›</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const selectedSrcAcc = accounts.find(a => a.id === tfSource);
  const selectedTgtAcc = accounts.find(a => a.id === tfTarget);
  const isTransferCrossCurrency = selectedSrcAcc && selectedTgtAcc && selectedSrcAcc.currency !== selectedTgtAcc.currency;

  return (
    <div className="overview-container" style={{ paddingBottom: '90px' }}>
      
      {/* Apple-style Net Worth Hero Card */}
      <div className="header-glass-banner" style={{ marginBottom: '20px', paddingBottom: '16px' }}>
        <div className="banner-glow-spot" />
        <h2 style={{ fontSize: '1.4rem', fontWeight: '850', color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          🏦 多帳戶總覽管理
        </h2>
        <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)', margin: '4px 0 0 0' }}>
          安全、無感的多帳戶收支與債務劃撥核心
        </p>

        {/* Hero Card with "淨資產總計" moved above the number */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          padding: '16px 18px',
          marginTop: '16px',
          textAlign: 'center',
          boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)'
        }}>
          <span style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-tertiary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
            淨資產總計
          </span>
          <h1 style={{
            fontSize: '1.8rem',
            fontWeight: '850',
            color: netWorth >= 0 ? '#34c759' : '#ff453a',
            margin: '0 0 14px 0',
            letterSpacing: '-0.02em',
            position: 'relative',
            display: 'inline-block'
          }}>
            ${Math.round(netWorth).toLocaleString()}
            <span style={{ 
              position: 'absolute', 
              left: '100%', 
              bottom: '4px', 
              marginLeft: '6px', 
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
              <span style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>總資產 (TWD)</span>
              <span style={{ fontSize: '1.05rem', fontWeight: '750', color: '#fff', marginTop: '2px' }}>
                ${Math.round(totalAssets).toLocaleString()}
              </span>
            </div>
            <div style={{ width: '0.5px', background: 'rgba(255,255,255,0.06)' }} />
            <div style={{ flex: 1, textAlign: 'right', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>總負債 (TWD)</span>
              <span style={{ fontSize: '1.05rem', fontWeight: '750', color: '#ff9500', marginTop: '2px' }}>
                ${Math.round(Math.abs(totalLiabilities)).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sub Tabs Navigation */}
      <div style={{ padding: '0 4px', marginBottom: '16px' }}>
        <SegmentedControl
          options={[
            { label: '📇 帳戶管理', value: 'list' },
            { label: '🔄 資金劃撥', value: 'transfer' },
            { label: '💱 貨幣換匯', value: 'exchange' },
            { label: '⚖️ 餘額校正', value: 'calibrate' }
          ]}
          value={subTab}
          onChange={setSubTab}
        />
      </div>

      {/* SUB TAB 1: ACCOUNTS LIST */}
      {subTab === 'list' && (
        <div className="slide-in">
          {/* Create Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px', paddingRight: '4px' }}>
            <button className="glass-btn primary-gradient-btn" onClick={handleOpenAdd} style={{ padding: '8px 16px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: '700' }}>
              ➕ 建立新帳戶
            </button>
          </div>

          {/* Group 1: Joint Accounts */}
          {renderAccountListGroup("🏫 共同帳戶 (雙方可編輯)", accounts.filter(a => a.owner === 'joint'))}

          {/* Group 2: User A Private Accounts */}
          {renderAccountListGroup(`🐕 大狗狗🐕的個人帳戶 (${userKey === 'userA' ? '可建立編輯' : '唯讀預覽'})`, accounts.filter(a => a.owner === 'userA'))}

          {/* Group 3: User B Private Accounts */}
          {renderAccountListGroup(`🐶 阿陞🐶的個人帳戶 (${userKey === 'userB' ? '可建立編輯' : '唯讀預覽'})`, accounts.filter(a => a.owner === 'userB'))}
        </div>
      )}

      {/* SUB TAB 2: TRANSFER */}
      {subTab === 'transfer' && (
        <div className="slide-in glass-card" style={{ padding: '20px' }}>
          <div style={{ fontWeight: '800', fontSize: '1rem', color: '#fff', marginBottom: '16px' }}>🔄 帳戶資金轉帳劃撥</div>
          
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px' }}>轉出帳戶</label>
            {renderAccountSelector(tfSource, setTfSource)}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px' }}>轉入帳戶</label>
            {/* Filter target account: omit the source account so it cannot be selected */}
            {renderAccountSelector(tfTarget, setTfTarget, a => a.id !== tfSource)}
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px' }}>
                {isTransferCrossCurrency ? `轉出金額 (${selectedSrcAcc?.currency})` : '劃撥金額'}
              </label>
              <input
                type="text"
                value={formatInputMoney(tfAmount)}
                onChange={(e) => setTfAmount(e.target.value)}
                placeholder="$0"
                className="glass-input"
                style={{ width: '100%', height: '44px', borderRadius: '10px', padding: '0 12px' }}
              />
            </div>

            {isTransferCrossCurrency && (
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px' }}>
                  轉入金額 ({selectedTgtAcc?.currency})
                </label>
                <input
                  type="text"
                  value={formatInputMoney(tfTargetAmount)}
                  onChange={(e) => setTfTargetAmount(e.target.value)}
                  placeholder="$0"
                  className="glass-input"
                  style={{ width: '100%', height: '44px', borderRadius: '10px', padding: '0 12px' }}
                />
              </div>
            )}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px' }}>劃撥備註</label>
            <input
              type="text"
              value={tfNote}
              onChange={(e) => setTfNote(e.target.value)}
              placeholder="選填備註"
              className="glass-input"
              style={{ width: '100%', height: '44px', borderRadius: '10px', padding: '0 12px' }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px' }}>劃撥日期</label>
            <input
              type="date"
              value={tfDate}
              onChange={(e) => setTfDate(e.target.value)}
              className="glass-input"
              style={{ width: '100%', height: '44px', borderRadius: '10px', padding: '0 12px' }}
            />
          </div>

          <button onClick={handleExecuteTransfer} className="glass-btn primary-gradient-btn" style={{ width: '100%', height: '44px', borderRadius: '12px', fontWeight: '800' }}>
            🚀 確定執行資金劃撥
          </button>
        </div>
      )}

      {/* SUB TAB 3: EXCHANGE */}
      {subTab === 'exchange' && (
        <div className="slide-in glass-card" style={{ padding: '20px' }}>
          <div style={{ fontWeight: '800', fontSize: '1rem', color: '#fff', marginBottom: '16px' }}>💱 貨幣外幣換匯交易</div>
          
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px' }}>轉出外幣帳戶 (售出)</label>
            {renderAccountSelector(exSource, setExSource)}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px' }}>轉入外幣帳戶 (買入)</label>
            {renderAccountSelector(exTarget, setExTarget)}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
            <div>
              <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px' }}>售出金額</label>
              <input
                type="text"
                value={formatInputMoney(exSourceAmount)}
                onChange={(e) => setExSourceAmount(e.target.value)}
                placeholder="$0"
                className="glass-input"
                style={{ width: '100%', height: '44px', borderRadius: '10px', padding: '0 12px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px' }}>買入金額</label>
              <input
                type="text"
                value={formatInputMoney(exTargetAmount)}
                onChange={(e) => setExTargetAmount(e.target.value)}
                placeholder="$0"
                className="glass-input"
                style={{ width: '100%', height: '44px', borderRadius: '10px', padding: '0 12px' }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px' }}>換匯備註</label>
            <input
              type="text"
              value={exNote}
              onChange={(e) => setExNote(e.target.value)}
              placeholder="選填備註"
              className="glass-input"
              style={{ width: '100%', height: '44px', borderRadius: '10px', padding: '0 12px' }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px' }}>換匯日期</label>
            <input
              type="date"
              value={exDate}
              onChange={(e) => setExDate(e.target.value)}
              className="glass-input"
              style={{ width: '100%', height: '44px', borderRadius: '10px', padding: '0 12px' }}
            />
          </div>

          <button onClick={handleExecuteExchange} className="glass-btn primary-gradient-btn" style={{ width: '100%', height: '44px', borderRadius: '12px', fontWeight: '800' }}>
            💱 確定執行外幣換匯
          </button>
        </div>
      )}

      {/* SUB TAB 4: CALIBRATE */}
      {subTab === 'calibrate' && (
        <div className="slide-in glass-card" style={{ padding: '20px' }}>
          <div style={{ fontWeight: '800', fontSize: '1rem', color: '#fff', marginBottom: '16px' }}>⚖️ 帳戶餘額手動校正 (校正回歸)</div>
          
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px' }}>要校正的帳戶</label>
            {renderAccountSelector(calAcc, setCalAcc)}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px' }}>真實餘額 (校正後)</label>
            <input
              type="text"
              value={formatInputMoney(calNewBalance)}
              onChange={(e) => setCalNewBalance(e.target.value)}
              placeholder="$0"
              className="glass-input"
              style={{ width: '100%', height: '44px', borderRadius: '10px', padding: '0 12px' }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px' }}>校正原因/備註</label>
            <input
              type="text"
              value={calNote}
              onChange={(e) => setCalNote(e.target.value)}
              placeholder="例如：手續費誤差、錢包找零誤差"
              className="glass-input"
              style={{ width: '100%', height: '44px', borderRadius: '10px', padding: '0 12px' }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px' }}>校正日期</label>
            <input
              type="date"
              value={calDate}
              onChange={(e) => setCalDate(e.target.value)}
              className="glass-input"
              style={{ width: '100%', height: '44px', borderRadius: '10px', padding: '0 12px' }}
            />
          </div>

          <button onClick={handleExecuteCalibrate} className="glass-btn primary-gradient-btn" style={{ width: '100%', height: '44px', borderRadius: '12px', fontWeight: '800' }}>
            ⚖️ 確定校正並儲存
          </button>
        </div>
      )}

      {/* ACCOUNT DETAIL MODAL (ADD / EDIT) */}
      {showModal && createPortal(
        <div className="liquid-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="liquid-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px', width: '92%', maxHeight: '82vh', display: 'flex', flexDirection: 'column' }}>
            
            {/* Fixed Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexShrink: 0 }}>
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

            {/* Scrollable Form Fields to prevent cutoff on mobile */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '52vh', overflowY: 'auto', paddingRight: '4px', paddingBottom: '10px', flexGrow: 1 }}>
              
              {/* Owner */}
              <div>
                <label style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '5px' }}>持有人</label>
                <select
                  disabled={isReadOnly || editingAccount}
                  value={accOwner}
                  onChange={(e) => setAccOwner(e.target.value)}
                  className="glass-input"
                  style={{ width: '100%', height: '44px', borderRadius: '8px', padding: '0 12px' }}
                >
                  <option value="userA">大狗狗 🐕 (個人私有)</option>
                  <option value="userB">阿陞 🐶 (個人私有)</option>
                  <option value="joint">🏫 共同 (雙方可編輯)</option>
                </select>
              </div>

              {/* Account Type */}
              <div>
                <label style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '5px' }}>帳戶類型</label>
                <select
                  disabled={isReadOnly}
                  value={accType}
                  onChange={(e) => setAccType(e.target.value)}
                  className="glass-input"
                  style={{ width: '100%', height: '44px', borderRadius: '8px', padding: '0 12px' }}
                >
                  <option value="bank">🏦 銀行活期存款 (活儲)</option>
                  <option value="cash">💵 現金錢包 (Cash)</option>
                  <option value="credit">💳 信用卡 (負債類)</option>
                  <option value="virtual">📱 電子票證 / 虛擬帳戶</option>
                </select>
              </div>

              {/* Institution Name */}
              <div>
                <label style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '5px' }}>金融機構/類別名稱</label>
                <input
                  disabled={isReadOnly}
                  type="text"
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                  placeholder="例如：國泰世華、現金、悠遊卡"
                  className="glass-input"
                  style={{ width: '100%', height: '44px', borderRadius: '8px', padding: '0 12px' }}
                />
              </div>

              {/* Nickname */}
              <div>
                <label style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '5px' }}>帳戶暱稱</label>
                <input
                  disabled={isReadOnly}
                  type="text"
                  value={accNickname}
                  onChange={(e) => setAccNickname(e.target.value)}
                  placeholder="例如：薪轉帳戶、主力信用卡、皮夾"
                  className="glass-input"
                  style={{ width: '100%', height: '44px', borderRadius: '8px', padding: '0 12px' }}
                />
              </div>

              {/* Custom Icon Field */}
              <div>
                <label style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '5px' }}>
                  帳戶圖示 (Emoji / 單個國字或英文字)
                </label>
                <input
                  disabled={isReadOnly}
                  type="text"
                  value={accIcon}
                  onChange={(e) => setAccIcon(cleanIconInput(e.target.value))}
                  placeholder="例如：🏦、💵、💳、📱、A"
                  className="glass-input"
                  style={{ width: '100%', height: '44px', borderRadius: '8px', padding: '0 12px' }}
                />
              </div>

              {/* Account Number */}
              <div>
                <label style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '5px' }}>帳戶號碼 (選填)</label>
                <input
                  disabled={isReadOnly}
                  type="text"
                  value={isReadOnly ? maskNumber(accNumber, accOwner) : accNumber}
                  onChange={(e) => setAccNumber(e.target.value)}
                  placeholder={isReadOnly ? '••••••••' : '輸入帳號或卡號'}
                  className="glass-input"
                  style={{ width: '100%', height: '44px', borderRadius: '8px', padding: '0 12px' }}
                />
              </div>

              {/* Balance */}
              <div>
                <label style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '5px' }}>
                  {accType === 'credit' ? '目前未繳帳單金額' : '目前帳戶餘額'}
                </label>
                <input
                  disabled={isReadOnly}
                  type="text"
                  value={formatInputMoney(accBalance)}
                  onChange={(e) => setAccBalance(e.target.value)}
                  placeholder="$0"
                  className="glass-input"
                  style={{ width: '100%', height: '44px', borderRadius: '8px', padding: '0 12px' }}
                />
              </div>

              {/* Currency */}
              <div>
                <label style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '5px' }}>幣別</label>
                <select
                  disabled={isReadOnly}
                  value={accCurrency}
                  onChange={(e) => setAccCurrency(e.target.value)}
                  className="glass-input"
                  style={{ width: '100%', height: '44px', borderRadius: '8px', padding: '0 12px' }}
                >
                  <option value="TWD">TWD (新台幣)</option>
                  <option value="USD">USD (美金)</option>
                </select>
              </div>

              {/* CREDIT CARD FIELDS */}
              {accType === 'credit' && (
                <div style={{ border: '0.5px solid rgba(255,255,255,0.08)', padding: '12px 10px', borderRadius: '12px', backgroundColor: 'rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  
                  {/* Linked Bank Account */}
                  <div>
                    <label style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '4px' }}>綁定扣款活儲帳戶</label>
                    <select
                      disabled={isReadOnly}
                      value={linkedBankId}
                      onChange={(e) => setLinkedBankId(e.target.value)}
                      className="glass-input"
                      style={{ width: '100%', height: '40px', borderRadius: '8px', fontSize: '0.76rem', padding: '0 8px' }}
                    >
                      <option value="">-- 選擇扣款帳戶 --</option>
                      {bankAndCashAccounts.map(b => (
                        <option key={b.id} value={b.id}>{b.nickname} ({b.currency})</option>
                      ))}
                    </select>
                  </div>

                  {/* Billing Payment Day */}
                  <div>
                    <label style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '4px' }}>每月扣款結清日 (1 ~ 28 號)</label>
                    <input
                      disabled={isReadOnly}
                      type="number"
                      min="1"
                      max="28"
                      value={billingDay}
                      onChange={(e) => setBillingDay(e.target.value)}
                      className="glass-input"
                      style={{ width: '100%', height: '40px', borderRadius: '8px', fontSize: '0.76rem', padding: '0 12px' }}
                    />
                  </div>

                  {/* Auto Pay toggle switch */}
                  {renderToggleRow("自動執行扣款結清 (Auto-Pay)", autoPay, setAutoPay, isReadOnly)}
                </div>
              )}

              {/* Default presets settings */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '0.5px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                <div style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.4)', marginBottom: '4px' }}>預設帳戶設定：</div>
                
                {renderToggleRow("設為【支出時】的預設出帳帳戶", isDefaultExpense, setIsDefaultExpense, isReadOnly)}
                
                {renderToggleRow("設為【收入時】的預設存入帳戶", isDefaultIncome, setIsDefaultIncome, isReadOnly)}

                {accType !== 'credit' && renderToggleRow("設為【伴侶代墊結算】的預設劃撥帳戶", isDefaultSettle, setIsDefaultSettle, isReadOnly)}
              </div>

            </div>

            {/* Fixed Actions Footer */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexShrink: 0 }}>
              {!isReadOnly && editingAccount && (
                <button
                  onClick={handleDeleteAccount}
                  className="glass-btn"
                  style={{
                    flex: 1,
                    padding: '12px 0',
                    borderRadius: '10px',
                    color: '#ff453a',
                    borderColor: 'rgba(255,69,58,0.2)',
                    background: 'rgba(255,69,58,0.08)'
                  }}
                >
                  🗑️ 刪除帳戶
                </button>
              )}
              
              <button
                onClick={isReadOnly ? () => setShowModal(false) : handleSaveAccount}
                className="glass-btn primary-gradient-btn"
                style={{ flex: 2, padding: '12px 0', borderRadius: '10px', fontWeight: '800' }}
              >
                {isReadOnly ? '確定返回' : (editingAccount ? '儲存帳戶修改' : '確定建立帳戶')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ACCOUNT DELETION SAFEGUARD MODAL */}
      {showDeleteSafeguard && editingAccount && createPortal(
        <div className="liquid-modal-overlay" style={{ zIndex: 11000 }} onClick={() => setShowDeleteSafeguard(false)}>
          <div className="liquid-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px', width: '92%' }}>
            <div style={{ fontWeight: '850', fontSize: '1.1rem', color: '#ff9500', marginBottom: '8px' }}>
              ⚠️ 帳戶餘額防消失保護
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: '1.4', margin: '0 0 16px 0' }}>
              您正準備註銷帳戶【<strong>{editingAccount.nickname}</strong>】。<br />
              由於該帳戶內仍有餘額 <strong style={{ color: '#fff' }}>${editingAccount.balance.toLocaleString()} {editingAccount.currency}</strong>，請選擇要將此筆餘額<b>自動轉移劃撥</b>至哪一個帳戶：
            </p>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '6px' }}>劃撥接收帳戶 ({editingAccount.currency})</label>
              <select
                value={safeguardTargetId}
                onChange={(e) => setSafeguardTargetId(e.target.value)}
                className="glass-input"
                style={{ width: '100%', height: '44px', borderRadius: '8px', padding: '0 12px' }}
              >
                <option value="">-- 選擇接收帳戶 --</option>
                {accounts
                  .filter(a => a.currency === editingAccount.currency && a.id !== editingAccount.id)
                  .map(a => (
                    <option key={a.id} value={a.id}>
                      {a.nickname} (${a.balance.toLocaleString()} {a.currency})
                    </option>
                  ))
                }
              </select>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowDeleteSafeguard(false)} className="glass-btn" style={{ flex: 1, padding: '10px 0', borderRadius: '8px' }}>
                取消
              </button>
              <button onClick={handleExecuteSafeguardDelete} className="glass-btn primary-gradient-btn" style={{ flex: 2, padding: '10px 0', borderRadius: '8px', fontWeight: '800', background: 'linear-gradient(135deg, #ff9500, #ff5e00)' }}>
                確定轉移並註銷
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
