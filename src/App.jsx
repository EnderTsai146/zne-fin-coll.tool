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

const USER_MAPPING = {
  "您的email@example.com": "恆恆🐶",   
  "另一半的email@example.com": "得得🐕" 
};

const MAKE_WEBHOOK_URL = "https://hook.us2.make.com/bl76wl9v2v6hxd1k5xdm5n1yjt34hs7l"; 

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
      if (docSnap.exists()) setAssets(docSnap.data());
      else setDoc(docRef, assets);
    }, (error) => console.error("資料讀取失敗:", error));
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
    if(window.confirm("確定要登出嗎？")) signOut(auth);
  };

  // ★ 新增：產生「交易前後資金快照」的小工具
  const getSnapshot = (currentAssets) => ({
    userA: currentAssets.userA,
    userB: currentAssets.userB,
    jointCash: currentAssets.jointCash,
    jointInvestments: { ...currentAssets.jointInvestments }
  });

  const handleTransaction = (newAssets, historyRecord) => {
    const timestamp = historyRecord.date ? `${historyRecord.date}T12:00:00.000Z` : new Date().toISOString();
    let color = "#17c9b2"; let title = "資產變動";
    
    if (historyRecord.type === 'income') { color = "#06c755"; title = "收入入帳"; }
    else if (historyRecord.type === 'spend') { color = "#ef454d"; title = "共同支出"; }
    else if (historyRecord.type === 'transfer') { color = "#2b90d9"; title = "資產劃撥"; }
    else if (historyRecord.type === 'liquidate' || historyRecord.type === 'joint_invest_sell') { color = "#f1c40f"; title = "投資變現"; }
    else if (historyRecord.type === 'joint_invest_buy') { color = "#8e44ad"; title = "買入投資"; }
    else if (historyRecord.type === 'personal_invest_profit') { color = "#e67e22"; title = "個人投資獲利"; }
    else if (historyRecord.type === 'personal_invest_loss') { color = "#7f8c8d"; title = "個人投資虧損"; }

    // ★ 紀錄快照
    const snapshotBefore = getSnapshot(assets);
    const snapshotAfter = getSnapshot(newAssets);

    const finalAssets = {
      ...newAssets,
      monthlyExpenses: [
        ...(assets.monthlyExpenses || []),
        { 
          ...historyRecord, 
          operator: operatorName, 
          timestamp: timestamp,
          auditTrail: { before: snapshotBefore, after: snapshotAfter } // 存入快照
        }
      ]
    };
    saveToCloud(finalAssets);
    setCurrentPage('overview');

    sendLineNotification({
      title: title, amount: `$${historyRecord.total.toLocaleString()}`, category: historyRecord.category,
      note: historyRecord.note || '無', date: historyRecord.date, color: color, operator: operatorName
    });
  };

  const handleAddExpense = (date, expenseData, totalAmount, payer, note) => {
    const payerKey = payer === 'heng' ? 'userA' : 'userB';
    const payerName = payer === 'heng' ? '恆恆🐶' : '得得🐕';

    if (assets[payerKey] < totalAmount) alert(`⚠️ ${payerName} 的個人餘額不足！`);

    const finalNote = note || '日記帳';
    const snapshotBefore = getSnapshot(assets); // ★ 快照前
    
    const newAssetsTemp = { ...assets, [payerKey]: assets[payerKey] - totalAmount };
    const snapshotAfter = getSnapshot(newAssetsTemp); // ★ 快照後

    const finalAssets = {
      ...newAssetsTemp,
      monthlyExpenses: [
        ...(assets.monthlyExpenses || []),
        { 
          date, month: date.slice(0, 7), type: 'expense', category: '個人支出',
          details: expenseData, total: totalAmount, payer: payerName, 
          operator: operatorName, note: finalNote, timestamp: `${date}T12:00:00.000Z`,
          auditTrail: { before: snapshotBefore, after: snapshotAfter } // 存入快照
        }
      ]
    };
    saveToCloud(finalAssets);
    alert("✅ 記帳完成！");
    setCurrentPage('overview'); 

    sendLineNotification({
      title: "個人日記帳", amount: `$${totalAmount.toLocaleString()}`, category: "個人支出",
      note: finalNote, date: date, color: "#ef454d", operator: operatorName
    });
  };

  const handleAddJointExpense = (date, category, amount, advancedBy, note) => {
    try {
        const val = Number(amount) || 0;
        const newAssets = { ...assets };
        const snapshotBefore = getSnapshot(assets); // ★ 快照前
        
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

        const snapshotAfter = getSnapshot(newAssets); // ★ 快照後

        const safeNote = note ? String(note).trim() : '';
        const finalNote = safeNote ? `${category} - ${safeNote}` : category;
        const isSettled = advancedBy === 'jointCash';

        const finalAssets = {
          ...newAssets,
          monthlyExpenses: [
            ...(newAssets.monthlyExpenses || []),
            {
              date, month: date.slice(0, 7), type: 'spend', category: '共同支出',
              payer: '共同帳戶', total: val, note: finalNote, operator: operatorName,
              advancedBy: advancedBy === 'jointCash' ? null : advancedBy, 
              isSettled: isSettled, timestamp: `${date}T12:00:00.000Z`,
              auditTrail: { before: snapshotBefore, after: snapshotAfter } // 存入快照
            }
          ]
        };

        saveToCloud(finalAssets);
        alert(`💸 已記錄共同支出 $${val.toLocaleString()} \n付款方式：${paymentMethodName}`);
        setCurrentPage('overview'); 

        sendLineNotification({
          title: "共同支出", amount: `$${val.toLocaleString()}`, category: "共同支出",
          note: finalNote, date: date, color: "#ef454d", operator: operatorName
        });
    } catch (err) {
        console.error("系統錯誤：", err);
        alert("❌ 發生預期外的錯誤，請檢查主控台！");
    }
  };

  // ★ 全面升級：支援備註與軟刪除的作廢邏輯
  const handleDeleteTransaction = (indexToDelete) => {
    const record = assets.monthlyExpenses[indexToDelete];
    if (!record) return;
    
    // 防呆：已經刪除過的不能再刪
    if (record.isDeleted) return alert("❌ 這筆紀錄已經被作廢過了！");

    // ★ 跳出視窗要求填寫刪除原因
    const reason = window.prompt("⚠️ 準備作廢此紀錄，請輸入刪除原因（必填）：");
    if (!reason || !reason.trim()) {
        return alert("❌ 必須輸入刪除原因才能作廢紀錄喔！");
    }

    const snapshotBefore = getSnapshot(assets);
    const newAssets = { ...assets };
    const payerKey = record.payer === '恆恆🐶' ? 'userA' : (record.payer === '得得🐕' ? 'userB' : null);

    // 執行退款邏輯 (保持不變)
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
             if (record.isSettled) newAssets.jointCash += record.total;
             else newAssets[record.advancedBy] += record.total;
         }
         break;
      case 'transfer': 
         if (payerKey) newAssets[payerKey] += record.total;
         if (record.note && record.note.includes('共同現金')) newAssets.jointCash -= record.total;
         else newAssets.jointCash -= record.total; 
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

    const snapshotAfter = getSnapshot(newAssets);

    // ★ 軟刪除：不移除資料，而是更新狀態並存入作廢原因與退款快照
    newAssets.monthlyExpenses = assets.monthlyExpenses.map((r, i) => 
        i === indexToDelete 
            ? { 
                ...r, 
                isDeleted: true, 
                deleteReason: reason.trim(), 
                deleteTimestamp: new Date().toISOString(),
                deleteAuditTrail: { before: snapshotBefore, after: snapshotAfter }
              } 
            : r
    );

    saveToCloud(newAssets);
    
    sendLineNotification({
      title: "🗑️ 刪除/作廢紀錄",
      amount: `$${record.total.toLocaleString()}`,
      category: record.category,
      note: `已作廢: ${record.note} (原因: ${reason.trim()})`,
      date: new Date().toISOString().split('T')[0],
      color: "#666666", 
      operator: operatorName
    });

    alert("🗑️ 紀錄已作廢，資金已正確復原！");
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
      <div key={currentPage} className="page-transition-enter" style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
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
        
        {currentPage === 'expense' && <ExpenseEntry onAddExpense={handleAddExpense} onAddJointExpense={handleAddJointExpense} />}
      </div>
    </div>
  );
};

export default App;