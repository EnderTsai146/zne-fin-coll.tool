// src/App.jsx
import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import TotalOverview from './components/TotalOverview';
import MonthlyView from './components/MonthlyView';
import AssetTransfer from './components/AssetTransfer';
import ExpenseEntry from './components/ExpenseEntry';
import './index.css';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(''); // 這裡儲存的是「恩得」或「子恆」
  const [currentPage, setCurrentPage] = useState('overview');

  // 初始化資料
  const [assets, setAssets] = useState(() => {
    const saved = localStorage.getItem('myAppAssets_v2');
    return saved ? JSON.parse(saved) : {
      userA: 0, userB: 0, jointCash: 0,
      jointInvestments: { stock: 0, fund: 0, deposit: 0, other: 0 },
      roi: { stock: 0, fund: 0, deposit: 0, other: 0 },
      monthlyExpenses: [] 
    };
  });

  useEffect(() => {
    localStorage.setItem('myAppAssets_v2', JSON.stringify(assets));
  }, [assets]);

  // --- 核心功能 1: 新增交易 (AssetTransfer) ---
  const handleTransaction = (newAssets, historyRecord) => {
    setAssets(prev => {
      const timestamp = historyRecord.date 
        ? `${historyRecord.date}T12:00:00.000Z` 
        : new Date().toISOString();

      return {
        ...newAssets,
        monthlyExpenses: [
          ...prev.monthlyExpenses,
          {
            ...historyRecord,
            // ★ 修正重點：加入真實操作者 (登入帳號)
            operator: currentUser, 
            timestamp: timestamp 
          }
        ]
      };
    });
  };

  // --- 核心功能 2: 記帳 (ExpenseEntry) ---
  const handleAddExpense = (date, expenseData, totalAmount, payer) => {
    setAssets(prev => {
      const payerKey = payer === 'heng' ? 'userA' : 'userB';
      const payerName = payer === 'heng' ? '恆恆🐶' : '得得🐕';

      if (prev[payerKey] < totalAmount) {
        alert(`⚠️ ${payerName} 的個人餘額不足！`);
      }

      return {
        ...prev,
        [payerKey]: prev[payerKey] - totalAmount,
        monthlyExpenses: [
          ...prev.monthlyExpenses,
          { 
            date,
            month: date.slice(0, 7),
            type: 'expense', 
            category: '個人支出',
            details: expenseData, 
            total: totalAmount, 
            payer: payerName, // 這是「資金歸屬人」
            operator: currentUser, // ★ 修正重點：這是「系統操作者」
            note: '月結記帳',
            timestamp: `${date}T12:00:00.000Z`
          }
        ]
      };
    });
    alert("✅ 記帳完成！已從個人帳戶扣除支出。");
    setCurrentPage('overview');
  };

  // --- 核心功能 3: 刪除紀錄 (Undo) ---
  const handleDeleteTransaction = (indexToDelete) => {
    setAssets(prev => {
      const record = prev.monthlyExpenses[indexToDelete];
      if (!record) return prev;

      const newAssets = { ...prev };
      const payerKey = record.payer === '恆恆🐶' ? 'userA' : (record.payer === '得得🐕' ? 'userB' : null);

      switch (record.type) {
        case 'income': 
          if (payerKey) newAssets[payerKey] -= record.total;
          break;
        case 'expense': 
          if (payerKey) newAssets[payerKey] += record.total;
          break;
        case 'spend': 
          newAssets.jointCash += record.total;
          break;
        case 'transfer': 
           if (payerKey) newAssets[payerKey] += record.total;
           if (record.note.includes('共同現金')) {
             newAssets.jointCash -= record.total;
           } else {
             const typeMatch = record.note.split('-')[1]; 
             if (typeMatch && newAssets.jointInvestments[typeMatch] !== undefined) {
               newAssets.jointInvestments[typeMatch] -= record.total;
             }
           }
           break;
        case 'liquidate': 
           newAssets.jointCash -= record.total;
           if (record.note.includes('賣出')) {
             const type = record.note.split(' ')[1]; 
             if (type && newAssets.jointInvestments[type] !== undefined) {
                newAssets.jointInvestments[type] += record.total; 
             }
           }
           break;
        default: break;
      }

      newAssets.monthlyExpenses = prev.monthlyExpenses.filter((_, i) => i !== indexToDelete);
      return newAssets;
    });
    alert("🗑️ 已刪除紀錄，並自動復原/扣除相關金額！");
  };

  if (!isLoggedIn) {
    return <Login onLogin={(name) => { setIsLoggedIn(true); setCurrentUser(name); }} />;
  }

  const Navbar = () => (
    <nav className="glass-nav">
      <div style={{ fontSize: '1.2rem' }}>馬鈴薯管家 <span style={{fontSize:'0.8rem', opacity:0.6}}>(目前使用者：{currentUser})</span></div>
      <div style={{ display: 'flex', gap: '10px' }}>
        <button className="glass-btn" style={{padding:'8px 12px', fontSize:'0.9rem'}} onClick={() => setCurrentPage('overview')}>總覽</button>
        <button className="glass-btn" style={{padding:'8px 12px', fontSize:'0.9rem'}} onClick={() => setCurrentPage('monthly')}>歷史紀錄</button>
        <button className="glass-btn" style={{padding:'8px 12px', fontSize:'0.9rem'}} onClick={() => setCurrentPage('transfer')}>資產操作</button>
        <button className="glass-btn" style={{padding:'8px 12px', fontSize:'0.9rem'}} onClick={() => setCurrentPage('expense')}>記錄支出</button>
      </div>
    </nav>
  );

  return (
    <div>
      <Navbar />
      <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
        {currentPage === 'overview' && <TotalOverview assets={assets} setAssets={setAssets} />}
        {currentPage === 'monthly' && <MonthlyView assets={assets} onDelete={handleDeleteTransaction} />} 
        {currentPage === 'transfer' && <AssetTransfer assets={assets} onTransaction={handleTransaction} />}
        {currentPage === 'expense' && <ExpenseEntry onAddExpense={handleAddExpense} />}
      </div>
    </div>
  );
}

export default App;