// src/App.jsx
import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import TotalOverview from './components/TotalOverview';
import MonthlyView from './components/MonthlyView';
import AssetTransfer from './components/AssetTransfer';
import ExpenseEntry from './components/ExpenseEntry';
import './index.css';
import { db, auth } from './firebase'; 
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";

// ==========================================
// ★★★ 請檢查您的設定 ★★★
// ==========================================
const USER_MAPPING = {
  "您的email@example.com": "恆恆🐶",   
  "另一半的email@example.com": "得得🐕" 
};

const MAKE_WEBHOOK_URL = "https://hook.us2.make.com/bl76wl9v2v6hxd1k5xdm5n1yjt34hs7l"; 
// ==========================================

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [operatorName, setOperatorName] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState('overview');

  const [assets, setAssets] = useState({
    userA: 0, userB: 0, jointCash: 0,
    jointInvestments: { stock: 0, fund: 0, deposit: 0, other: 0 },
    roi: { stock: 0, fund: 0, deposit: 0, other: 0 },
    monthlyExpenses: [] 
  });

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
        const name = USER_MAPPING[user.email] || user.email.split('@')[0];
        setOperatorName(name);
      } else {
        setCurrentUser(null);
        setOperatorName('');
      }
      setLoading(false);
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const docRef = doc(db, "finance", "data");
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setAssets(docSnap.data());
      } else {
        setDoc(docRef, assets);
      }
    }, (error) => {
      console.error("資料讀取失敗:", error);
    });
    return () => unsubscribe();
    // eslint-disable-next-line
  }, [currentUser]);

  const saveToCloud = (newAssets) => {
    if (!currentUser) return;
    const docRef = doc(db, "finance", "data");
    setDoc(docRef, newAssets).catch((err) => alert("連線錯誤：" + err.message));
  };

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

  const handleTransaction = (newAssets, historyRecord) => {
    const timestamp = historyRecord.date ? `${historyRecord.date}T12:00:00.000Z` : new Date().toISOString();
    let color = "#17c9b2"; 
    let title = "資產變動";
    
    // ★ 新增了投資專用的顏色與標題
    if (historyRecord.type === 'income') { color = "#06c755"; title = "收入入帳"; }
    else if (historyRecord.type === 'spend') { color = "#ef454d"; title = "共同支出"; }
    else if (historyRecord.type === 'transfer') { color = "#2b90d9"; title = "資產劃撥"; }
    else if (historyRecord.type === 'liquidate' || historyRecord.type === 'joint_invest_sell') { color = "#f1c40f"; title = "投資變現"; }
    else if (historyRecord.type === 'joint_invest_buy') { color = "#8e44ad"; title = "買入投資"; }
    else if (historyRecord.type === 'personal_invest_profit') { color = "#e67e22"; title = "個人投資獲利"; }
    else if (historyRecord.type === 'personal_invest_loss') { color = "#7f8c8d"; title = "個人投資虧損"; }

    const finalAssets = {
      ...newAssets,
      monthlyExpenses: [
        ...assets.monthlyExpenses,
        { ...historyRecord, operator: operatorName, timestamp: timestamp }
      ]
    };
    saveToCloud(finalAssets);

    setCurrentPage('overview');

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

  // ★ 修改：個人日記帳邏輯 (新增 note 參數)
  const handleAddExpense = (date, expenseData, totalAmount, payer, note) => {
    const payerKey = payer === 'heng' ? 'userA' : 'userB';
    const payerName = payer === 'heng' ? '恆恆🐶' : '得得🐕';

    if (assets[payerKey] < totalAmount) alert(`⚠️ ${payerName} 的個人餘額不足！`);

    // 如果使用者沒填備註，預設給「日記帳」
    const finalNote = note || '日記帳';

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
          operator: operatorName, 
          note: finalNote, // ★ 這裡現在會存入您輸入的備註
          timestamp: `${date}T12:00:00.000Z`
        }
      ]
    };
    saveToCloud(finalAssets);
    alert("✅ 記帳完成！");
    setCurrentPage('overview'); // 記完帳自動跳轉回總覽，方便看餘額

    sendLineNotification({
      title: "個人日記帳",
      amount: `$${totalAmount.toLocaleString()}`,
      category: "個人支出",
      note: finalNote, // ★ Line 通知也會顯示備註 (例如：午餐)
      date: date,
      color: "#ef454d", 
      operator: operatorName
    });
  };

// ★ 修正：共同支出邏輯 (修復代墊沒扣個人餘額的問題)
  const handleAddJointExpense = (date, category, amount, advancedBy, note) => {
    const val = Number(amount);
    const newAssets = { ...assets };
    
    let paymentMethodName = "共同帳戶直接付";
    if (advancedBy === 'jointCash') {
      if (newAssets.jointCash < val) return alert("❌ 共同現金不足！(帳面餘額不足)");
      newAssets.jointCash -= val;
    } else if (advancedBy === 'userA') {
      if (newAssets.userA < val) return alert("❌ 恆恆的個人餘額不足以代墊！");
      newAssets.userA -= val; 
      paymentMethodName = "恆恆先墊 (User A)";
    } else if (advancedBy === 'userB') {
      if (newAssets.userB < val) return alert("❌ 得得的個人餘額不足以代墊！");
      newAssets.userB -= val; 
      paymentMethodName = "得得先墊 (User B)";
    }

    const finalNote = note.trim() ? `${category} - ${note.trim()}` : category;
    const isSettled = advancedBy === 'jointCash';

    const finalAssets = {
      ...newAssets,
      monthlyExpenses: [
        ...newAssets.monthlyExpenses,
        {
          date, month: date.slice(0, 7), type: 'spend', category: '共同支出',
          payer: '共同帳戶', total: val, note: finalNote, operator: operatorName,
          advancedBy: advancedBy === 'jointCash' ? null : advancedBy, 
          isSettled: isSettled, timestamp: `${date}T12:00:00.000Z`
        }
      ]
    };

    saveToCloud(finalAssets);
    
    // ★ 修復：改用內建的 toLocaleString()，這樣程式就不會在這裡崩潰了！
    alert(`💸 已記錄共同支出 $${val.toLocaleString()} \n付款方式：${paymentMethodName}`);
    
    // ★ 現在這行終於可以順利執行了
    setCurrentPage('overview'); 

    // ★ Line 通知也終於可以順利發送了
    sendLineNotification({
      title: "共同支出", amount: `$${val.toLocaleString()}`, category: "共同支出",
      note: finalNote, date: date, color: "#ef454d", operator: operatorName
    });
  };

  // ★ 修正：刪除邏輯 (修復退款對象與投資本金計算，並新增 Line 通知)
  const handleDeleteTransaction = (indexToDelete) => {
    const record = assets.monthlyExpenses[indexToDelete];
    if (!record) return;
    const newAssets = { ...assets };
    const payerKey = record.payer === '恆恆🐶' ? 'userA' : (record.payer === '得得🐕' ? 'userB' : null);

    switch (record.type) {
      case 'income':
      case 'personal_invest_profit':
         if (payerKey) newAssets[payerKey] -= record.total; break;
      case 'expense':
      case 'personal_invest_loss':
         if (payerKey) newAssets[payerKey] += record.total; break;
      case 'spend':
         if (record.advancedBy === 'jointCash' || !record.advancedBy) {
             newAssets.jointCash += record.total;
         } else {
             if (record.isSettled) {
                 newAssets.jointCash += record.total;
             } else {
                 newAssets[record.advancedBy] += record.total;
             }
         }
         break;
      case 'transfer': 
         if (payerKey) newAssets[payerKey] += record.total;
         if (record.note && record.note.includes('共同現金')) {
             newAssets.jointCash -= record.total;
         } else {
             newAssets.jointCash -= record.total; // 預防舊資料格式
         }
         break;
      case 'joint_invest_buy':
         newAssets.jointCash += record.total;
         if (record.investType && newAssets.jointInvestments[record.investType] !== undefined) {
             newAssets.jointInvestments[record.investType] -= record.total;
         }
         break;
      case 'liquidate': 
      case 'joint_invest_sell': 
         newAssets.jointCash -= record.total;
         const sellType = record.investType || (record.note && record.note.split(' ')[1]); 
         if (sellType && newAssets.jointInvestments[sellType] !== undefined) {
             newAssets.jointInvestments[sellType] += (record.principal || record.total); 
         }
         break;
      default: break;
    }
    newAssets.monthlyExpenses = assets.monthlyExpenses.filter((_, i) => i !== indexToDelete);
    saveToCloud(newAssets);
    
    sendLineNotification({
      title: "🗑️ 刪除/撤銷紀錄",
      amount: `$${record.total.toLocaleString()}`,
      category: record.category,
      note: `已撤銷: ${record.note}`,
      date: new Date().toISOString().split('T')[0],
      color: "#666666", 
      operator: operatorName
    });

    alert("🗑️ 已刪除，金額已正確復原歸位！");
  };

  const handleAssetsUpdate = (updatedAssets) => { saveToCloud(updatedAssets); };

  if (loading) return <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100vh'}}>馬鈴薯甦醒中...🥔</div>;
  if (!currentUser) return <Login />;

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
        <button className="glass-btn" style={{padding:'6px 10px', fontSize:'0.85rem', background:'rgba(255,0,0,0.1)', color:'red'}} onClick={handleLogout}>登出</button>
      </div>
    </nav>
  );

  return (
    <div>
      <Navbar />
      <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
        {currentPage === 'overview' && <TotalOverview assets={assets} setAssets={handleAssetsUpdate} />}
        
        {currentPage === 'monthly' && (
           <MonthlyView 
             assets={assets} 
             setAssets={handleAssetsUpdate} 
             onDelete={handleDeleteTransaction}
             sendLineNotification={sendLineNotification}
             currentUser={operatorName}
           />
        )}
        
        {currentPage === 'transfer' && <AssetTransfer assets={assets} setAssets={handleAssetsUpdate} onTransaction={handleTransaction} />}
        
        {/* ★ 更新：傳遞新的 handleAddExpense */}
        {currentPage === 'expense' && <ExpenseEntry onAddExpense={handleAddExpense} onAddJointExpense={handleAddJointExpense} />}
      </div>
    </div>
  );
};

export default App;