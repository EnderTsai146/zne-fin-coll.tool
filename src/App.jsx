// src/App.jsx
import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import TotalOverview from './components/TotalOverview';
import MonthlyView from './components/MonthlyView';
import AssetTransfer from './components/AssetTransfer';
import ExpenseEntry from './components/ExpenseEntry';
import './index.css';

// 引入 Firebase 相關功能
import { db } from './firebase';
import { doc, onSnapshot, setDoc } from "firebase/firestore";

// ★★★ 您提供的 Make.com Webhook 網址 ★★★
const MAKE_WEBHOOK_URL = "https://hook.us2.make.com/bl76wl9v2v6hxd1k5xdm5n1yjt34hs7l"; 

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState('');
  const [currentPage, setCurrentPage] = useState('overview');

  // 預設值先給空或預設結構，等待雲端資料載入
  const [assets, setAssets] = useState({
    userA: 0, userB: 0, jointCash: 0,
    jointInvestments: { stock: 0, fund: 0, deposit: 0, other: 0 },
    roi: { stock: 0, fund: 0, deposit: 0, other: 0 },
    monthlyExpenses: [] 
  });

  // 使用 useEffect 建立即時連線 (Real-time Sync)
  useEffect(() => {
    // 指定資料庫路徑：finance (集合) -> data (文件)
    const docRef = doc(db, "finance", "data");

    // 建立監聽器：只要雲端資料一變，這裡馬上收到通知
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        // 如果雲端有資料，直接更新到網頁上
        setAssets(docSnap.data());
      } else {
        // --- 自動遷移邏輯 ---
        // 如果雲端是空的 (第一次用)，但本機 LocalStorage 有舊資料
        // 就自動把舊資料上傳上去！
        const localData = localStorage.getItem('myAppAssets_v2');
        if (localData) {
          const parsed = JSON.parse(localData);
          setDoc(docRef, parsed); // 上傳舊資料
        } else {
          // 如果完全沒資料，就初始化一個空的
          setDoc(docRef, assets);
        }
      }
    });

    // 當離開網頁時取消監聽
    return () => unsubscribe();
    // eslint-disable-next-line
  }, []); // 只在啟動時執行一次

  // 輔助函式：將資料寫入雲端
  const saveToCloud = (newAssets) => {
    const docRef = doc(db, "finance", "data");
    setDoc(docRef, newAssets)
      .catch((error) => {
        alert("⚠️ 連線錯誤，資料儲存失敗！\n" + error.message);
      });
  };

  // ★ 新增：發送 Line 通知的功能 (透過 Make.com)
  const sendLineNotification = async (message) => {
    try {
      await fetch(MAKE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message })
      });
      console.log("Line 通知請求已發送");
    } catch (error) {
      console.error("Line 通知發送失敗", error);
    }
  };

  // --- 核心功能 1: 新增交易 (AssetTransfer) ---
  const handleTransaction = (newAssets, historyRecord) => {
    const timestamp = historyRecord.date 
      ? `${historyRecord.date}T12:00:00.000Z` 
      : new Date().toISOString();

    // 建構新的完整資料物件
    const finalAssets = {
      ...newAssets,
      monthlyExpenses: [
        ...assets.monthlyExpenses, // 注意：這裡是拿目前的 assets
        {
          ...historyRecord,
          operator: currentUser, 
          timestamp: timestamp 
        }
      ]
    };

    // 存到雲端 (畫面會自動更新)
    saveToCloud(finalAssets);

    // ★ 觸發 Line 通知
    const msg = `【資產變動】\n動作：${historyRecord.category}\n金額：$${historyRecord.total.toLocaleString()}\n操作者：${currentUser}\n備註：${historyRecord.note || '無'}`;
    sendLineNotification(msg);
  };

  // --- 核心功能 2: 記帳 (ExpenseEntry) ---
  const handleAddExpense = (date, expenseData, totalAmount, payer) => {
    const payerKey = payer === 'heng' ? 'userA' : 'userB';
    const payerName = payer === 'heng' ? '恆恆🐶' : '得得🐕';

    if (assets[payerKey] < totalAmount) {
      alert(`⚠️ ${payerName} 的個人餘額不足！`);
    }

    const finalAssets = {
      ...assets,
      [payerKey]: assets[payerKey] - totalAmount,
      monthlyExpenses: [
        ...assets.monthlyExpenses,
        { 
          date,
          month: date.slice(0, 7),
          type: 'expense', 
          category: '個人支出',
          details: expenseData, 
          total: totalAmount, 
          payer: payerName, 
          operator: currentUser,
          note: '月結記帳',
          timestamp: `${date}T12:00:00.000Z`
        }
      ]
    };

    saveToCloud(finalAssets);
    alert("✅ 記帳完成！已同步至雲端。");
    setCurrentPage('overview');

    // ★ 觸發 Line 通知
    const msg = `【個人記帳】\n日期：${date}\n金額：$${totalAmount.toLocaleString()}\n付款人：${payerName}\n操作者：${currentUser}`;
    sendLineNotification(msg);
  };

  // --- 核心功能 3: 刪除紀錄 (Undo) ---
  const handleDeleteTransaction = (indexToDelete) => {
    const record = assets.monthlyExpenses[indexToDelete];
    if (!record) return;

    const newAssets = { ...assets };
    const payerKey = record.payer === '恆恆🐶' ? 'userA' : (record.payer === '得得🐕' ? 'userB' : null);

    // 復原金額邏輯
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

    // 移除該筆紀錄
    newAssets.monthlyExpenses = assets.monthlyExpenses.filter((_, i) => i !== indexToDelete);

    // 存到雲端
    saveToCloud(newAssets);
    alert("🗑️ 已刪除並同步雲端！");
  };

  // --- 特殊功能: 總覽頁面的 ROI 更新 ---
  const handleAssetsUpdate = (updatedAssets) => {
    saveToCloud(updatedAssets);
  };

  if (!isLoggedIn) {
    return <Login onLogin={(name) => { setIsLoggedIn(true); setCurrentUser(name); }} />;
  }

  // ★ 您的自訂 Navbar (保留 Potato Steward 設計)
  const Navbar = () => (
    <nav className="glass-nav">
      <div style={{ fontSize: '1.2rem', lineHeight: '1.2' }}> 
        🥔管家 
        <span style={{
            fontSize:'0.8rem', 
            opacity:0.6, 
            display: 'block' 
        }}>
            (目前使用者：{currentUser})
        </span>
      </div>
      <div style={{ display: 'flex', gap: '10px' }}>
        <button className="glass-btn" style={{padding:'8px 12px', fontSize:'0.9rem'}} onClick={() => setCurrentPage('overview')}>資產總覽</button>
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
        {currentPage === 'overview' && <TotalOverview assets={assets} setAssets={handleAssetsUpdate} />}
        
        {currentPage === 'monthly' && <MonthlyView assets={assets} onDelete={handleDeleteTransaction} />} 
        
        {currentPage === 'transfer' && (
          <AssetTransfer 
            assets={assets} 
            setAssets={handleAssetsUpdate} 
            onTransaction={handleTransaction} 
          />
        )}
        
        {currentPage === 'expense' && <ExpenseEntry onAddExpense={handleAddExpense} />}
      </div>
    </div>
  );
}

export default App;