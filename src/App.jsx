// src/App.jsx
import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import TotalOverview from './components/TotalOverview';
import MonthlyView from './components/MonthlyView';
import AssetTransfer from './components/AssetTransfer';
import ExpenseEntry from './components/ExpenseEntry';
import './index.css';
import { db } from './firebase';
import { doc, onSnapshot, setDoc } from "firebase/firestore";

// ★★★ 您的 Make.com Webhook 網址 (維持不變) ★★★
const MAKE_WEBHOOK_URL = "https://hook.us2.make.com/bl76wl9v2v6hxd1k5xdm5n1yjt34hs7l"; 

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState('');
  const [currentPage, setCurrentPage] = useState('overview');

  const [assets, setAssets] = useState({
    userA: 0, userB: 0, jointCash: 0,
    jointInvestments: { stock: 0, fund: 0, deposit: 0, other: 0 },
    roi: { stock: 0, fund: 0, deposit: 0, other: 0 },
    monthlyExpenses: [] 
  });

  useEffect(() => {
    const docRef = doc(db, "finance", "data");
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setAssets(docSnap.data());
      } else {
        const localData = localStorage.getItem('myAppAssets_v2');
        if (localData) {
          const parsed = JSON.parse(localData);
          setDoc(docRef, parsed);
        } else {
          setDoc(docRef, assets);
        }
      }
    });
    return () => unsubscribe();
    // eslint-disable-next-line
  }, []);

  const saveToCloud = (newAssets) => {
    const docRef = doc(db, "finance", "data");
    setDoc(docRef, newAssets).catch((err) => alert("連線錯誤：" + err.message));
  };

  // ★ 升級版：發送詳細資料給 Make.com
  const sendLineNotification = async (data) => {
    try {
      await fetch(MAKE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data) // 這裡改傳送物件，而不是單純的 message 字串
      });
      console.log("Line 通知請求已發送");
    } catch (error) {
      console.error("Line 通知發送失敗", error);
    }
  };

  // 1. 資產操作 (AssetTransfer)
  const handleTransaction = (newAssets, historyRecord) => {
    const timestamp = historyRecord.date ? `${historyRecord.date}T12:00:00.000Z` : new Date().toISOString();
    const finalAssets = {
      ...newAssets,
      monthlyExpenses: [
        ...assets.monthlyExpenses,
        { ...historyRecord, operator: currentUser, timestamp: timestamp }
      ]
    };
    saveToCloud(finalAssets);

    // ★ 判斷顏色
    let color = "#17c9b2"; // 預設藍綠色
    let title = "資產變動";
    if (historyRecord.type === 'income') { color = "#06c755"; title = "收入入帳"; } // 綠色 (收入)
    else if (historyRecord.type === 'spend') { color = "#ef454d"; title = "共同支出"; } // 紅色 (支出)
    else if (historyRecord.type === 'transfer') { color = "#2b90d9"; title = "資產劃撥"; } // 藍色 (轉帳)

    // ★ 發送結構化資料
    sendLineNotification({
      title: title,
      amount: `$${historyRecord.total.toLocaleString()}`,
      category: historyRecord.category,
      note: historyRecord.note || '無',
      date: historyRecord.date,
      color: color,
      operator: currentUser
    });
  };

  // 2. 個人記帳 (ExpenseEntry)
  const handleAddExpense = (date, expenseData, totalAmount, payer) => {
    const payerKey = payer === 'heng' ? 'userA' : 'userB';
    const payerName = payer === 'heng' ? '恆恆🐶' : '得得🐕';

    if (assets[payerKey] < totalAmount) alert(`⚠️ ${payerName} 的個人餘額不足！`);

    const finalAssets = {
      ...assets,
      [payerKey]: assets[payerKey] - totalAmount,
      monthlyExpenses: [
        ...assets.monthlyExpenses,
        { 
          date, month: date.slice(0, 7), type: 'expense', category: '個人支出',
          details: expenseData, total: totalAmount, payer: payerName, 
          operator: currentUser, note: '月結記帳', timestamp: `${date}T12:00:00.000Z`
        }
      ]
    };
    saveToCloud(finalAssets);
    alert("✅ 記帳完成！");
    setCurrentPage('overview');

    // ★ 發送結構化資料 (紅色)
    sendLineNotification({
      title: "個人記帳",
      amount: `$${totalAmount.toLocaleString()}`,
      category: "個人支出",
      note: `付款人：${payerName}`,
      date: date,
      color: "#ef454d", // 紅色
      operator: currentUser
    });
  };

  // 3. 刪除紀錄
  const handleDeleteTransaction = (indexToDelete) => {
    const record = assets.monthlyExpenses[indexToDelete];
    if (!record) return;
    const newAssets = { ...assets };
    const payerKey = record.payer === '恆恆🐶' ? 'userA' : (record.payer === '得得🐕' ? 'userB' : null);

    switch (record.type) {
      case 'income': if (payerKey) newAssets[payerKey] -= record.total; break;
      case 'expense': if (payerKey) newAssets[payerKey] += record.total; break;
      case 'spend': newAssets.jointCash += record.total; break;
      case 'transfer': 
         if (payerKey) newAssets[payerKey] += record.total;
         if (record.note.includes('共同現金')) newAssets.jointCash -= record.total;
         else {
           const typeMatch = record.note.split('-')[1]; 
           if (typeMatch && newAssets.jointInvestments[typeMatch] !== undefined) newAssets.jointInvestments[typeMatch] -= record.total;
         }
         break;
      case 'liquidate': 
         newAssets.jointCash -= record.total;
         if (record.note.includes('賣出')) {
           const type = record.note.split(' ')[1]; 
           if (type && newAssets.jointInvestments[type] !== undefined) newAssets.jointInvestments[type] += record.total; 
         }
         break;
      default: break;
    }
    newAssets.monthlyExpenses = assets.monthlyExpenses.filter((_, i) => i !== indexToDelete);
    saveToCloud(newAssets);
    alert("🗑️ 已刪除並同步雲端！");
  };

  const handleAssetsUpdate = (updatedAssets) => { saveToCloud(updatedAssets); };

  if (!isLoggedIn) return <Login onLogin={(name) => { setIsLoggedIn(true); setCurrentUser(name); }} />;

  const Navbar = () => (
    <nav className="glass-nav">
      <div style={{ fontSize: '1.2rem', lineHeight: '1.2', fontWeight: 'bold' }}> 
        🥔管家 <span style={{fontSize:'0.75rem', fontWeight: 'normal', opacity:0.7, display: 'block', marginTop: '2px'}}>({currentUser})</span>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <button className="glass-btn" style={{padding:'6px 10px', fontSize:'0.85rem'}} onClick={() => setCurrentPage('overview')}>總覽</button>
        <button className="glass-btn" style={{padding:'6px 10px', fontSize:'0.85rem'}} onClick={() => setCurrentPage('monthly')}>紀錄</button>
        <button className="glass-btn" style={{padding:'6px 10px', fontSize:'0.85rem'}} onClick={() => setCurrentPage('transfer')}>操作</button>
        <button className="glass-btn" style={{padding:'6px 10px', fontSize:'0.85rem'}} onClick={() => setCurrentPage('expense')}>記帳</button>
      </div>
    </nav>
  );

  return (
    <div>
      <Navbar />
      <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
        {currentPage === 'overview' && <TotalOverview assets={assets} setAssets={handleAssetsUpdate} />}
        {currentPage === 'monthly' && <MonthlyView assets={assets} onDelete={handleDeleteTransaction} />} 
        {currentPage === 'transfer' && <AssetTransfer assets={assets} setAssets={handleAssetsUpdate} onTransaction={handleTransaction} />}
        {currentPage === 'expense' && <ExpenseEntry onAddExpense={handleAddExpense} />}
      </div>
    </div>
  );
}

export default App;