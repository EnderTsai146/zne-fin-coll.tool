// src/App.jsx
import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import TotalOverview from './components/TotalOverview';
import MonthlyView from './components/MonthlyView';
import AssetTransfer from './components/AssetTransfer';
import ExpenseEntry from './components/ExpenseEntry';
import './index.css';
import { db, auth } from './firebase'; // 引入 auth
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth"; // 引入監聽器

// ★★★ 設定 Email 對應的暱稱 (請修改這裡！) ★★★
const USER_MAPPING = {
  "hzh940317@gmail.com": "恆恆🐶",   // 請把引號內的 email 換成您的
  "ender.tsai@gmail.com": "得得🐕" // 請把引號內的 email 換成另一半的
};

// Make.com Webhook 網址 (維持不變)
const MAKE_WEBHOOK_URL = "https://hook.us2.make.com/bl76wl9v2v6hxd1k5xdm5n1yjt34hs7l"; 

function App() {
  const [currentUser, setCurrentUser] = useState(null); // 改成存 User 物件或 null
  const [operatorName, setOperatorName] = useState(''); // 顯示用的暱稱
  const [loading, setLoading] = useState(true); // 載入中狀態
  const [currentPage, setCurrentPage] = useState('overview');

  const [assets, setAssets] = useState({
    userA: 0, userB: 0, jointCash: 0,
    jointInvestments: { stock: 0, fund: 0, deposit: 0, other: 0 },
    roi: { stock: 0, fund: 0, deposit: 0, other: 0 },
    monthlyExpenses: [] 
  });

  // ★ 監聽登入狀態 (Auth Listener)
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        // 登入成功
        setCurrentUser(user);
        // 根據 Email 判斷是誰，如果找不到就顯示 Email 前綴
        const name = USER_MAPPING[user.email] || user.email.split('@')[0];
        setOperatorName(name);
      } else {
        // 未登入
        setCurrentUser(null);
        setOperatorName('');
      }
      setLoading(false); // 檢查完畢
    });

    return () => unsubscribeAuth();
  }, []);

  // ★ 監聽資料庫 (只有登入後才執行)
  useEffect(() => {
    if (!currentUser) return; // 沒登入就不監聽資料

    const docRef = doc(db, "finance", "data");
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setAssets(docSnap.data());
      } else {
        // 第一次初始化的邏輯 (通常只會跑一次)
        setDoc(docRef, assets);
      }
    }, (error) => {
      console.error("資料讀取失敗 (可能是權限不足):", error);
    });

    return () => unsubscribe();
    // eslint-disable-next-line
  }, [currentUser]); // 當 currentUser 改變時重新執行

  const saveToCloud = (newAssets) => {
    if (!currentUser) return;
    const docRef = doc(db, "finance", "data");
    setDoc(docRef, newAssets).catch((err) => alert("連線錯誤：" + err.message));
  };

  // 發送 Line 通知 (邏輯不變)
  const sendLineNotification = async (data) => {
    try {
      await fetch(MAKE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
    } catch (error) {
      console.error("Line 通知發送失敗", error);
    }
  };

  const handleLogout = () => {
    if(window.confirm("確定要登出嗎？")) {
      signOut(auth);
    }
  };

  // --- 交易邏輯 (operator 改用 operatorName) ---
  const handleTransaction = (newAssets, historyRecord) => {
    const timestamp = historyRecord.date ? `${historyRecord.date}T12:00:00.000Z` : new Date().toISOString();
    let color = "#17c9b2"; 
    let title = "資產變動";
    if (historyRecord.type === 'income') { color = "#06c755"; title = "收入入帳"; }
    else if (historyRecord.type === 'spend') { color = "#ef454d"; title = "共同支出"; }
    else if (historyRecord.type === 'transfer') { color = "#2b90d9"; title = "資產劃撥"; }

    const finalAssets = {
      ...newAssets,
      monthlyExpenses: [
        ...assets.monthlyExpenses,
        { ...historyRecord, operator: operatorName, timestamp: timestamp }
      ]
    };
    saveToCloud(finalAssets);

    sendLineNotification({
      title: title,
      amount: `$${historyRecord.total.toLocaleString()}`,
      category: historyRecord.category,
      note: historyRecord.note || '無',
      date: historyRecord.date,
      color: color,
      operator: operatorName
    });
  };

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
          operator: operatorName, note: '月結記帳', timestamp: `${date}T12:00:00.000Z`
        }
      ]
    };
    saveToCloud(finalAssets);
    alert("✅ 記帳完成！");
    setCurrentPage('overview');

    sendLineNotification({
      title: "個人記帳",
      amount: `$${totalAmount.toLocaleString()}`,
      category: "個人支出",
      note: `付款人：${payerName}`,
      date: date,
      color: "#ef454d", 
      operator: operatorName
    });
  };

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

  // 載入畫面
  if (loading) return <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100vh'}}>馬鈴薯甦醒中...🥔</div>;

  // 未登入畫面
  if (!currentUser) {
    return <Login />;
  }

  const Navbar = () => (
    <nav className="glass-nav">
      <div style={{ fontSize: '1.2rem', lineHeight: '1.2', fontWeight: 'bold' }}> 
        🥔管家 <span style={{fontSize:'0.75rem', fontWeight: 'normal', opacity:0.7, display: 'block', marginTop: '2px'}}>({operatorName})</span>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <button className="glass-btn" style={{padding:'6px 10px', fontSize:'0.85rem'}} onClick={() => setCurrentPage('overview')}>總覽</button>
        <button className="glass-btn" style={{padding:'6px 10px', fontSize:'0.85rem'}} onClick={() => setCurrentPage('monthly')}>紀錄</button>
        <button className="glass-btn" style={{padding:'6px 10px', fontSize:'0.85rem'}} onClick={() => setCurrentPage('transfer')}>操作</button>
        <button className="glass-btn" style={{padding:'6px 10px', fontSize:'0.85rem'}} onClick={() => setCurrentPage('expense')}>記帳</button>
        {/* 登出按鈕 */}
        <button className="glass-btn" style={{padding:'6px 10px', fontSize:'0.85rem', background:'rgba(255,0,0,0.1)', color:'red'}} onClick={handleLogout}>登出</button>
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