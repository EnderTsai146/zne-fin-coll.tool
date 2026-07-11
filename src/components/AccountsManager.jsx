// src/components/AccountsManager.jsx
import React, { useState } from 'react';
import SegmentedControl from './SegmentedControl';

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
    setAccBalance(acc.balance.toString());
    setAccCurrency(acc.currency);
    setIsDefaultExpense(acc.isDefaultExpense || false);
    setIsDefaultIncome(acc.isDefaultIncome || false);
    setIsDefaultSettle(acc.isDefaultSettle || false);
    setLinkedBankId(acc.linkedBankAccountId || '');
    setBillingDay((acc.billingDay || 10).toString());
    setAutoPay(acc.autoPay !== undefined ? acc.autoPay : true);

    // Enforce ownership: if not owner and not joint, it's read-only
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
    const val = Number(accBalance) || 0;

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
      await customAlert("請填寫完整的轉帳資訊！");
      return;
    }
    const val = Number(tfAmount) || 0;
    if (val <= 0) {
      await customAlert("轉帳金額必須大於 0！");
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
      await customAlert(`❌ 轉出與轉入帳戶幣別不同，請改用「貨幣換匯」功能進行轉帳！`);
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
      note: tfNote.trim() || `資金調度: ${srcAcc.nickname} ➔ ${tgtAcc.nickname}`,
    };

    onTransaction({ ...assets, accounts: updatedAccounts }, txRecord);
    await customAlert(`✅ 資金調度轉帳成功！`);
    setTfAmount('');
    setTfNote('');
  };

  // Action Form: Exchange
  const handleExecuteExchange = async () => {
    if (!exSource || !exTarget || !exSourceAmount || !exTargetAmount) {
      await customAlert("請填寫完整的換匯資訊！");
      return;
    }
    const sellVal = Number(exSourceAmount) || 0;
    const buyVal = Number(exTargetAmount) || 0;

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
      await customAlert(`❌ 相同的貨幣無須換匯，請改用「資金調度」功能！`);
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
      await customAlert("請選擇帳戶並輸入校正後的金額！");
      return;
    }
    const newVal = Number(calNewBalance);
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

  return (
    <div className="overview-container" style={{ paddingBottom: '90px' }}>
      {/* Dynamic Aurora Header */}
      <div className="header-glass-banner" style={{ marginBottom: '20px' }}>
        <div className="banner-glow-spot" />
        <h2 style={{ fontSize: '1.4rem', fontWeight: '850', color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          🏦 多帳戶總覽管理
        </h2>
        <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)', margin: '4px 0 0 0' }}>
          安全、無感的多帳戶收支與債務調度核心
        </p>

        {/* Global Net Worth Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '16px' }}>
          <div className="networth-sub-card">
            <span className="networth-sub-label">淨資產 (TWD)</span>
            <span className="networth-sub-val" style={{ color: netWorth >= 0 ? '#34c759' : '#ff453a' }}>
              ${Math.round(netWorth).toLocaleString()}
            </span>
          </div>
          <div className="networth-sub-card">
            <span className="networth-sub-label">總資產 (TWD)</span>
            <span className="networth-sub-val" style={{ color: '#007aff' }}>
              ${Math.round(totalAssets).toLocaleString()}
            </span>
          </div>
          <div className="networth-sub-card">
            <span className="networth-sub-label">總負債 (TWD)</span>
            <span className="networth-sub-val" style={{ color: '#ff9500' }}>
              ${Math.round(Math.abs(totalLiabilities)).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Sub Tabs Navigation */}
      <div style={{ padding: '0 4px', marginBottom: '16px' }}>
        <SegmentedControl
          options={[
            { label: '📇 帳戶管理', value: 'list' },
            { label: '🔄 資金調度', value: 'transfer' },
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
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
            <button className="glass-btn primary-gradient-btn" onClick={handleOpenAdd} style={{ padding: '8px 16px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: '700' }}>
              ➕ 建立新帳戶
            </button>
          </div>

          {/* Group: Joint Accounts */}
          {accounts.some(a => a.owner === 'joint') && (
            <div className="account-group-section" style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: '800', color: 'rgba(255,255,255,0.5)', marginBottom: '8px', paddingLeft: '4px' }}>🏫 共同帳戶 (雙方可編輯)</div>
              {accounts.filter(a => a.owner === 'joint').map(acc => (
                <div key={acc.id} className="account-item-card glass-card" onClick={() => handleOpenEdit(acc)}>
                  <div className="acc-item-header">
                    <div>
                      <div className="acc-nickname">{acc.nickname}</div>
                      <div className="acc-meta">{acc.name} · {acc.type === 'credit' ? '信用卡' : (acc.type === 'cash' ? '現金' : '活儲')}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="acc-balance" style={{ color: acc.type === 'credit' ? '#ff9500' : '#fff' }}>
                        ${acc.balance.toLocaleString()} <span style={{ fontSize: '0.65rem' }}>{acc.currency}</span>
                      </div>
                      <div className="acc-badges">
                        {acc.isDefaultExpense && <span className="acc-badge expense">支</span>}
                        {acc.isDefaultIncome && <span className="acc-badge income">收</span>}
                        {acc.isDefaultSettle && <span className="acc-badge settle">結</span>}
                      </div>
                    </div>
                  </div>
                  {acc.accountNumber && (
                    <div className="acc-number-footer">帳號: {maskNumber(acc.accountNumber, acc.owner)}</div>
                  )}
                  {acc.type === 'credit' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '8px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
                      <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>
                        帳單日: 每月 {acc.billingDay} 號 ({acc.autoPay ? '自動扣繳' : '手動繳納'})
                      </span>
                      {acc.balance < 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleManualPayoff(acc);
                          }}
                          className="payoff-sub-btn"
                        >
                          💳 結清帳單
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Group: User A Private Accounts */}
          <div className="account-group-section" style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: '800', color: 'rgba(255,255,255,0.5)', marginBottom: '8px', paddingLeft: '4px' }}>🐕 大狗狗🐕的個人帳戶 ({userKey === 'userA' ? '可創建編輯' : '唯讀預覽'})</div>
            {accounts.filter(a => a.owner === 'userA').length === 0 ? (
              <div className="glass-card text-center" style={{ padding: '16px', color: 'rgba(255,255,255,0.3)', fontSize: '0.78rem' }}>無帳戶</div>
            ) : (
              accounts.filter(a => a.owner === 'userA').map(acc => (
                <div key={acc.id} className="account-item-card glass-card" onClick={() => handleOpenEdit(acc)}>
                  <div className="acc-item-header">
                    <div>
                      <div className="acc-nickname">{acc.nickname}</div>
                      <div className="acc-meta">{acc.name} · {acc.type === 'credit' ? '信用卡' : (acc.type === 'cash' ? '現金' : '活儲')}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="acc-balance" style={{ color: acc.type === 'credit' ? '#ff9500' : '#fff' }}>
                        ${acc.balance.toLocaleString()} <span style={{ fontSize: '0.65rem' }}>{acc.currency}</span>
                      </div>
                      <div className="acc-badges">
                        {acc.isDefaultExpense && <span className="acc-badge expense">支</span>}
                        {acc.isDefaultIncome && <span className="acc-badge income">收</span>}
                        {acc.isDefaultSettle && <span className="acc-badge settle">結</span>}
                      </div>
                    </div>
                  </div>
                  {acc.accountNumber && (
                    <div className="acc-number-footer">帳號: {maskNumber(acc.accountNumber, acc.owner)}</div>
                  )}
                  {acc.type === 'credit' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '8px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
                      <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>
                        帳單日: 每月 {acc.billingDay} 號 ({acc.autoPay ? '自動扣繳' : '手動繳納'})
                      </span>
                      {acc.balance < 0 && userKey === 'userA' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleManualPayoff(acc);
                          }}
                          className="payoff-sub-btn"
                        >
                          💳 結清帳單
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Group: User B Private Accounts */}
          <div className="account-group-section" style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: '800', color: 'rgba(255,255,255,0.5)', marginBottom: '8px', paddingLeft: '4px' }}>🐶 阿陞🐶的個人帳戶 ({userKey === 'userB' ? '可創建編輯' : '唯讀預覽'})</div>
            {accounts.filter(a => a.owner === 'userB').length === 0 ? (
              <div className="glass-card text-center" style={{ padding: '16px', color: 'rgba(255,255,255,0.3)', fontSize: '0.78rem' }}>無帳戶</div>
            ) : (
              accounts.filter(a => a.owner === 'userB').map(acc => (
                <div key={acc.id} className="account-item-card glass-card" onClick={() => handleOpenEdit(acc)}>
                  <div className="acc-item-header">
                    <div>
                      <div className="acc-nickname">{acc.nickname}</div>
                      <div className="acc-meta">{acc.name} · {acc.type === 'credit' ? '信用卡' : (acc.type === 'cash' ? '現金' : '活儲')}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="acc-balance" style={{ color: acc.type === 'credit' ? '#ff9500' : '#fff' }}>
                        ${acc.balance.toLocaleString()} <span style={{ fontSize: '0.65rem' }}>{acc.currency}</span>
                      </div>
                      <div className="acc-badges">
                        {acc.isDefaultExpense && <span className="acc-badge expense">支</span>}
                        {acc.isDefaultIncome && <span className="acc-badge income">收</span>}
                        {acc.isDefaultSettle && <span className="acc-badge settle">結</span>}
                      </div>
                    </div>
                  </div>
                  {acc.accountNumber && (
                    <div className="acc-number-footer">帳號: {maskNumber(acc.accountNumber, acc.owner)}</div>
                  )}
                  {acc.type === 'credit' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '8px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
                      <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>
                        帳單日: 每月 {acc.billingDay} 號 ({acc.autoPay ? '自動扣繳' : '手動繳納'})
                      </span>
                      {acc.balance < 0 && userKey === 'userB' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleManualPayoff(acc);
                          }}
                          className="payoff-sub-btn"
                        >
                          💳 結清帳單
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* SUB TAB 2: TRANSFER */}
      {subTab === 'transfer' && (
        <div className="slide-in glass-card" style={{ padding: '20px' }}>
          <div style={{ fontWeight: '800', fontSize: '1rem', color: '#fff', marginBottom: '16px' }}>🔄 帳戶資金轉帳劃撥</div>
          
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px' }}>轉出帳戶</label>
            <select
              value={tfSource}
              onChange={(e) => setTfSource(e.target.value)}
              className="glass-input"
              style={{ width: '100%', height: '40px', borderRadius: '10px' }}
            >
              <option value="">-- 選擇轉出帳戶 --</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.nickname} (${a.balance.toLocaleString()} {a.currency}) [{a.owner === 'joint' ? '共同' : (a.owner === 'userA' ? '大狗狗' : '阿陞')}]
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px' }}>轉入帳戶</label>
            <select
              value={tfTarget}
              onChange={(e) => setTfTarget(e.target.value)}
              className="glass-input"
              style={{ width: '100%', height: '40px', borderRadius: '10px' }}
            >
              <option value="">-- 選擇轉入帳戶 --</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.nickname} (${a.balance.toLocaleString()} {a.currency}) [{a.owner === 'joint' ? '共同' : (a.owner === 'userA' ? '大狗狗' : '阿陞')}]
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px' }}>轉帳金額</label>
            <input
              type="number"
              value={tfAmount}
              onChange={(e) => setTfAmount(e.target.value)}
              placeholder="輸入金額"
              className="glass-input"
              style={{ width: '100%', height: '40px', borderRadius: '10px', padding: '0 10px' }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px' }}>轉帳備註</label>
            <input
              type="text"
              value={tfNote}
              onChange={(e) => setTfNote(e.target.value)}
              placeholder="選填備註"
              className="glass-input"
              style={{ width: '100%', height: '40px', borderRadius: '10px', padding: '0 10px' }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px' }}>轉帳日期</label>
            <input
              type="date"
              value={tfDate}
              onChange={(e) => setTfDate(e.target.value)}
              className="glass-input"
              style={{ width: '100%', height: '40px', borderRadius: '10px', padding: '0 10px' }}
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
            <select
              value={exSource}
              onChange={(e) => setExSource(e.target.value)}
              className="glass-input"
              style={{ width: '100%', height: '40px', borderRadius: '10px' }}
            >
              <option value="">-- 選擇轉出帳戶 --</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.nickname} (${a.balance.toLocaleString()} {a.currency})
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px' }}>轉入外幣帳戶 (買入)</label>
            <select
              value={exTarget}
              onChange={(e) => setExTarget(e.target.value)}
              className="glass-input"
              style={{ width: '100%', height: '40px', borderRadius: '10px' }}
            >
              <option value="">-- 選擇轉入帳戶 --</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.nickname} (${a.balance.toLocaleString()} {a.currency})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
            <div>
              <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px' }}>售出金額</label>
              <input
                type="number"
                value={exSourceAmount}
                onChange={(e) => setExSourceAmount(e.target.value)}
                placeholder="轉出金額"
                className="glass-input"
                style={{ width: '100%', height: '40px', borderRadius: '10px', padding: '0 10px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px' }}>買入金額</label>
              <input
                type="number"
                value={exTargetAmount}
                onChange={(e) => setExTargetAmount(e.target.value)}
                placeholder="轉入金額"
                className="glass-input"
                style={{ width: '100%', height: '40px', borderRadius: '10px', padding: '0 10px' }}
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
              style={{ width: '100%', height: '40px', borderRadius: '10px', padding: '0 10px' }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px' }}>換匯日期</label>
            <input
              type="date"
              value={exDate}
              onChange={(e) => setExDate(e.target.value)}
              className="glass-input"
              style={{ width: '100%', height: '40px', borderRadius: '10px', padding: '0 10px' }}
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
            <select
              value={calAcc}
              onChange={(e) => setCalAcc(e.target.value)}
              className="glass-input"
              style={{ width: '100%', height: '40px', borderRadius: '10px' }}
            >
              <option value="">-- 選擇帳戶 --</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.nickname} (${a.balance.toLocaleString()} {a.currency})
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px' }}>真實餘額 (校正後)</label>
            <input
              type="number"
              value={calNewBalance}
              onChange={(e) => setCalNewBalance(e.target.value)}
              placeholder="輸入最新真實餘額"
              className="glass-input"
              style={{ width: '100%', height: '40px', borderRadius: '10px', padding: '0 10px' }}
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
              style={{ width: '100%', height: '40px', borderRadius: '10px', padding: '0 10px' }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '6px' }}>校正日期</label>
            <input
              type="date"
              value={calDate}
              onChange={(e) => setCalDate(e.target.value)}
              className="glass-input"
              style={{ width: '100%', height: '40px', borderRadius: '10px', padding: '0 10px' }}
            />
          </div>

          <button onClick={handleExecuteCalibrate} className="glass-btn primary-gradient-btn" style={{ width: '100%', height: '44px', borderRadius: '12px', fontWeight: '800' }}>
            ⚖️ 確定校正並儲存
          </button>
        </div>
      )}

      {/* ACCOUNT DETAIL MODAL (ADD / EDIT) */}
      {showModal && (
        <div className="custom-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content glass-card slide-in" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px', width: '92%', maxHeight: '88vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontWeight: '850', fontSize: '1.1rem', color: '#fff' }}>
                {isReadOnly ? '📋 帳戶唯讀預覽' : (editingAccount ? '✏️ 編輯帳戶資料' : '🏦 建立全新帳戶')}
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>

            {/* Read Only Notice */}
            {isReadOnly && (
              <div style={{ backgroundColor: 'rgba(255,149,0,0.12)', border: '0.5px solid rgba(255,149,0,0.3)', color: '#ffb94f', padding: '8px 12px', borderRadius: '8px', fontSize: '0.74rem', marginBottom: '14px', lineHeight: '1.4' }}>
                🔒 這是您伴侶的個人私有帳戶。您目前僅能預覽其金額，無權對其進行修改或刪除。
              </div>
            )}

            {/* Form Fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              {/* Owner */}
              <div>
                <label style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '5px' }}>持有人</label>
                <select
                  disabled={isReadOnly || editingAccount} // Creator/Owner cannot be changed after creation
                  value={accOwner}
                  onChange={(e) => setAccOwner(e.target.value)}
                  className="glass-input"
                  style={{ width: '100%', height: '36px', borderRadius: '8px' }}
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
                  style={{ width: '100%', height: '36px', borderRadius: '8px' }}
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
                  style={{ width: '100%', height: '36px', borderRadius: '8px', padding: '0 8px' }}
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
                  style={{ width: '100%', height: '36px', borderRadius: '8px', padding: '0 8px' }}
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
                  style={{ width: '100%', height: '36px', borderRadius: '8px', padding: '0 8px' }}
                />
              </div>

              {/* Balance */}
              <div>
                <label style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '5px' }}>
                  {accType === 'credit' ? '目前未繳帳單金額 (請輸入正值，系統將儲存為負債)' : '目前帳戶餘額'}
                </label>
                <input
                  disabled={isReadOnly}
                  type="number"
                  value={accType === 'credit' && Number(accBalance) < 0 ? Math.abs(Number(accBalance)) : accBalance}
                  onChange={(e) => {
                    const typed = e.target.value;
                    if (accType === 'credit') {
                      setAccBalance(typed ? (-Math.abs(Number(typed))).toString() : '');
                    } else {
                      setAccBalance(typed);
                    }
                  }}
                  placeholder="0"
                  className="glass-input"
                  style={{ width: '100%', height: '36px', borderRadius: '8px', padding: '0 8px' }}
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
                  style={{ width: '100%', height: '36px', borderRadius: '8px' }}
                >
                  <option value="TWD">TWD (新台幣)</option>
                  <option value="USD">USD (美金)</option>
                </select>
              </div>

              {/* CREDIT CARD FIELDS */}
              {accType === 'credit' && (
                <div style={{ border: '0.5px solid rgba(255,255,255,0.08)', padding: '10px', borderRadius: '8px', backgroundColor: 'rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  
                  {/* Linked Bank Account */}
                  <div>
                    <label style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '4px' }}>綁定扣款活儲帳戶</label>
                    <select
                      disabled={isReadOnly}
                      value={linkedBankId}
                      onChange={(e) => setLinkedBankId(e.target.value)}
                      className="glass-input"
                      style={{ width: '100%', height: '30px', borderRadius: '6px', fontSize: '0.74rem' }}
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
                      style={{ width: '100%', height: '30px', borderRadius: '6px', fontSize: '0.74rem', padding: '0 8px' }}
                    />
                  </div>

                  {/* Auto Pay toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <input
                      disabled={isReadOnly}
                      type="checkbox"
                      id="chkAutoPay"
                      checked={autoPay}
                      onChange={(e) => setAutoPay(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    <label htmlFor="chkAutoPay" style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>
                      在扣款日當天自動執行扣款結清 (Auto-Pay)
                    </label>
                  </div>
                </div>
              )}

              {/* Default presets settings */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '0.5px solid rgba(255,255,255,0.06)', paddingTop: '10px' }}>
                <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>預設帳戶設定：</div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    disabled={isReadOnly}
                    type="checkbox"
                    id="chkDefExpense"
                    checked={isDefaultExpense}
                    onChange={(e) => setIsDefaultExpense(e.target.checked)}
                  />
                  <label htmlFor="chkDefExpense" style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.7)' }}>
                    設為【支出時】的預設出帳帳戶
                  </label>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    disabled={isReadOnly}
                    type="checkbox"
                    id="chkDefIncome"
                    checked={isDefaultIncome}
                    onChange={(e) => setIsDefaultIncome(e.target.checked)}
                  />
                  <label htmlFor="chkDefIncome" style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.7)' }}>
                    設為【收入時】的預設存入帳戶
                  </label>
                </div>

                {accType !== 'credit' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      disabled={isReadOnly}
                      type="checkbox"
                      id="chkDefSettle"
                      checked={isDefaultSettle}
                      onChange={(e) => setIsDefaultSettle(e.target.checked)}
                    />
                    <label htmlFor="chkDefSettle" style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.7)' }}>
                      設為【伴侶代墊結算】的預設劃撥帳戶
                    </label>
                  </div>
                )}
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
                    padding: '10px 0',
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
                style={{ flex: 2, padding: '10px 0', borderRadius: '10px', fontWeight: '800' }}
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
