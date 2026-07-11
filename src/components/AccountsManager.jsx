// src/components/AccountsManager.jsx
import React, { useState, useMemo } from 'react';
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

  // Form states
  const [accOwner, setAccOwner] = useState('userA');
  const [accType, setAccType] = useState('bank'); // 'cash', 'bank', 'credit', 'virtual'
  const [accName, setAccName] = useState('');
  const [accNickname, setAccNickname] = useState('');
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
    setAccNumber(acc.accountNumber);
    // Show correct absolute balance in editable state
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
    
    // Parse on save
    let val = parseMoney(accBalance);
    if (accType === 'credit') {
      val = -Math.abs(val); // Save as negative liability
    }

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
        id: 'acc_' + Date.now(),
        owner: accOwner,
        type: accType,
        name: accName.trim(),
        nickname: accNickname.trim(),
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

    setAssets({ ...assets, accounts: updatedAccounts });
    setShowModal(false);
  };

  // Delete Account
  const handleDeleteAccount = async () => {
    if (!editingAccount || isReadOnly) return;
    const confirmMsg = `⚠️ 確定要刪除帳戶【${editingAccount.nickname}】嗎？\n刪除此帳戶將會清除其餘額紀錄！`;
    if (!(await customConfirm(confirmMsg, "刪除帳戶"))) return;

    const updatedAccounts = accounts.filter(a => a.id !== editingAccount.id);
    setAssets({ ...assets, accounts: updatedAccounts });
    setShowModal(false);
    await customAlert("🗑️ 帳戶已成功刪除。");
  };

  // Credit Card Manual Payoff
  const handleManualPayoff = async (card) => {
    if (card.balance >= 0) {
      await customAlert("此信用卡目前無須繳款（餘額為正或零）。");
      return;
    }
    const linkedBank = accounts.find(a => a.id === card.linkedBankAccountId);
    if (!linkedBank) {
      await customAlert("❌ 未設定此信用卡的扣款活儲帳戶，請先編輯信用卡綁定。");
      return;
    }

    const payAmount = Math.abs(card.balance);
    const confirmMsg = `💳 準備繳清信用卡【${card.nickname}】帳單：\n• 繳款金額：$${payAmount.toLocaleString()} ${card.currency}\n• 扣款帳戶：${linkedBank.nickname} (目前餘額: $${linkedBank.balance.toLocaleString()})\n確定要進行扣款結清嗎？`;
    
    if (!(await customConfirm(confirmMsg, "結清帳單"))) return;

    if (linkedBank.balance < payAmount) {
      await customAlert(`❌ 扣款帳戶【${linkedBank.nickname}】餘額不足以支付此筆帳單！`);
      return;
    }

    // Update balances
    const updatedAccounts = accounts.map(a => {
      if (a.id === card.id) return { ...a, balance: 0 };
      if (a.id === linkedBank.id) return { ...a, balance: a.balance - payAmount };
      return a;
    });

    const payoffRecord = {
      date: new Date().toISOString().split('T')[0],
      month: new Date().toISOString().slice(0, 7),
      type: 'transfer',
      category: '信用卡扣款',
      total: payAmount,
      payer: operatorName.includes('大狗狗') ? '大狗狗🐕' : '阿陞🐶',
      accountId: linkedBank.id,
      targetAccountId: card.id,
      note: `[手動結清] ${card.nickname} 帳單`,
    };

    onTransaction({ ...assets, accounts: updatedAccounts }, payoffRecord);
    await customAlert(`✅ 信用卡帳單繳款成功！\n${linkedBank.nickname} 已扣除 $${payAmount.toLocaleString()}`);
  };

  // Action Form: Transfer
  const handleExecuteTransfer = async () => {
    if (!tfSource || !tfTarget || !tfAmount) {
      await customAlert("請選擇帳戶並填寫劃撥金額！");
      return;
    }
    const val = parseMoney(tfAmount);
    if (val <= 0) {
      await customAlert("劃撥金額必須大於 0！");
      return;
    }
    if (tfSource === tfTarget) {
      await customAlert("轉出與轉入帳戶不能相同！");
      return;
    }

    const srcAcc = accounts.find(a => a.id === tfSource);
    const tgtAcc = accounts.find(a => a.id === tfTarget);

    if (srcAcc.balance < val) {
      await customAlert(`❌ 轉出帳戶【${srcAcc.nickname}】餘額不足！`);
      return;
    }
    if (srcAcc.currency !== tgtAcc.currency) {
      await customAlert(`❌ 轉出與轉入帳戶幣別不同，請改用「貨幣換匯」功能！`);
      return;
    }

    const updatedAccounts = accounts.map(a => {
      if (a.id === tfSource) return { ...a, balance: a.balance - val };
      if (a.id === tfTarget) return { ...a, balance: a.balance + val };
      return a;
    });

    const txRecord = {
      date: tfDate,
      month: tfDate.slice(0, 7),
      type: 'transfer',
      category: '資產劃撥',
      total: val,
      payer: operatorName.includes('大狗狗') ? '大狗狗🐕' : '阿陞🐶',
      accountId: tfSource,
      targetAccountId: tfTarget,
      note: tfNote.trim() || `資金劃撥: ${srcAcc.nickname} ➔ ${tgtAcc.nickname}`,
    };

    onTransaction({ ...assets, accounts: updatedAccounts }, txRecord);
    await customAlert(`✅ 資金劃撥劃撥成功！`);
    setTfAmount('');
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

    const txRecord = {
      date: calDate,
      month: calDate.slice(0, 7),
      type: 'calibrate',
      category: '餘額校正',
      total: diff,
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
          const ownerLabel = acc.owner === 'joint' ? '共同 🏫' : (acc.owner === 'userA' ? '大狗狗 🐕' : '阿陞 🐶');
          const isCredit = acc.type === 'credit';
          const balanceColor = isCredit ? '#ff9500' : '#8effa2';
          
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
                  {acc.nickname}
                </span>
                <span style={{ fontSize: '0.58rem', opacity: 0.6, background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: '4px' }}>
                  {acc.owner === 'joint' ? '共同' : (acc.owner === 'userA' ? '大狗狗' : '阿陞')}
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

  // Apple settings-style list renderer
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
            
            let typeIcon = '🏦';
            if (acc.type === 'cash') typeIcon = '💵';
            else if (acc.type === 'credit') typeIcon = '💳';
            else if (acc.type === 'virtual') typeIcon = '📱';
            
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
                    fontSize: '1.2rem',
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: isCredit ? 'rgba(255,149,0,0.08)' : (acc.type === 'cash' ? 'rgba(52,199,89,0.08)' : 'rgba(10,132,255,0.08)'),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    {typeIcon}
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
                      {acc.name} {acc.accountNumber ? `· ${maskNumber(acc.accountNumber, acc.owner)}` : ''}
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

        {/* Hero Card */}
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
          <span style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            淨資產總計
          </span>
          <h1 style={{
            fontSize: '1.8rem',
            fontWeight: '850',
            color: netWorth >= 0 ? '#34c759' : '#ff453a',
            margin: '4px 0 14px 0',
            letterSpacing: '-0.02em'
          }}>
            ${Math.round(netWorth).toLocaleString()} <span style={{ fontSize: '0.9rem', fontWeight: '500', opacity: 0.8 }}>TWD</span>
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
            {renderAccountSelector(tfTarget, setTfTarget)}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px' }}>劃撥金額</label>
            <input
              type="text"
              value={formatInputMoney(tfAmount)}
              onChange={(e) => setTfAmount(e.target.value)}
              placeholder="$0"
              className="glass-input"
              style={{ width: '100%', height: '44px', borderRadius: '10px', padding: '0 12px' }}
            />
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
      {showModal && (
        <div className="liquid-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="liquid-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px', width: '92%', maxHeight: '88vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontWeight: '850', fontSize: '1.15rem', color: '#fff' }} className="liquid-modal-title">
                {isReadOnly ? '📋 帳戶唯讀預覽' : (editingAccount ? '✏️ 編輯帳戶資料' : '🏦 建立全新帳戶')}
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '1.4rem', cursor: 'pointer', padding: '0 4px' }}>✕</button>
            </div>

            {/* Read Only Notice */}
            {isReadOnly && (
              <div style={{ backgroundColor: 'rgba(255,149,0,0.12)', border: '0.5px solid rgba(255,149,0,0.3)', color: '#ffb94f', padding: '10px 14px', borderRadius: '10px', fontSize: '0.74rem', marginBottom: '14px', lineHeight: '1.4' }}>
                🔒 這是您伴侶的個人私有帳戶。您目前僅能預覽其金額，無權對其進行修改或刪除。
              </div>
            )}

            {/* Form Fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '8px' }}>
              
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

            {/* Actions Footer */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
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
        </div>
      )}

    </div>
  );
};

export default AccountsManager;
