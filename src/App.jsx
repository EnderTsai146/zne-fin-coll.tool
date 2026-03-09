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

  // ★ 升級重點：替 Line 發送器裝上終極過濾防護罩
  const sendLineNotification = async (data) => {
    try {
      // 🛡️ 防呆清洗：確保所有傳給 Make.com 的資料都是字串，並替換掉會弄壞 JSON 的特殊符號
      const safeData = {
        title: String(data.title || "系統通知").replace(/"/g, '＂').replace(/\n/g, ' '),
        amount: String(data.amount || "$0").replace(/"/g, '＂'),
        category: String(data.category || "未分類").replace(/"/g, '＂').replace(/\n/g, ' '),
        note: String(data.note || "無備註").replace(/"/g, '＂').replace(/\n/g, ' '), 
        date: String(data.date || new Date().toISOString().split('T')[0]),
        color: String(data.color || "#666666"),
        operator: String(data.operator || operatorName || "系統").replace(/"/g, '＂')
      };

      await fetch(MAKE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(safeData)
      });
    } catch (error) {
      console.error("Line 通知發送失敗", error);
    }
  };

  const handleLogout = () => {
    if(window.confirm("確定要登出嗎？")) signOut(auth);
  };

  const getSnapshot = (currentAssets) => ({
    userA: currentAssets.userA,
    userB: currentAssets.userB,
    jointCash: currentAssets.jointCash,
    jointInvestments: { ...currentAssets.jointInvestments }
  });

  const handleTransaction = (newAssets, historyRecord) => {
    const timestamp = new Date().toISOString(); 
    let color = "#17c9b2"; let title = "資產變動";
    
    if (historyRecord.type === 'income') { color = "#06c755"; title = "收入入帳"; }
    else if (historyRecord.type === 'spend') { color = "#ef454d"; title = "共同支出"; }
    else if (historyRecord.type === 'transfer') { color = "#2b90d9"; title = "資產劃撥"; }
    else if (historyRecord.type === 'liquidate' || historyRecord.type === 'joint_invest_sell') { color = "#f1c40f"; title = "投資變現"; }
    else if (historyRecord.type === 'joint_invest_buy') { color = "#8e44ad"; title = "買入投資"; }
    else if (historyRecord.type === 'personal_invest_profit') { color = "#e67e22"; title = "個人投資獲利"; }
    else if (historyRecord.type === 'personal_invest_loss') { color = "#7f8c8d"; title = "個人投資虧損"; }

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
          auditTrail: { before: snapshotBefore, after: snapshotAfter } 
        }
      ]
    };
    saveToCloud(finalAssets);
    setCurrentPage('overview');

    sendLineNotification({
      title: title, 
      amount: `$${(Number(historyRecord.total) || 0).toLocaleString()}`, // 🛡️ 加上 Number 轉換防呆
      category: historyRecord.category,
      note: historyRecord.note || '無', date: historyRecord.date, color: color, operator: operatorName
    });
  };

  const handleAddExpense = (date, expenseData, totalAmount, payer, note) => {
    const payerKey = payer === 'heng' ? 'userA' : 'userB';
    const payerName = payer === 'heng' ? '恆恆🐶' : '得得🐕';

    if (assets[payerKey] < totalAmount) alert(`⚠️ ${payerName} 的個人餘額不足！`);

    const finalNote = note || '日記帳';
    const snapshotBefore = getSnapshot(assets); 
    
    const newAssetsTemp = { ...assets, [payerKey]: assets[payerKey] - totalAmount };
    const snapshotAfter = getSnapshot(newAssetsTemp); 

    const finalAssets = {
      ...newAssetsTemp,
      monthlyExpenses: [
        ...(assets.monthlyExpenses || []),
        { 
          date, month: date.slice(0, 7), type: 'expense', category: '個人支出',
          details: expenseData, total: totalAmount, payer: payerName, 
          operator: operatorName, note: finalNote, 
          timestamp: new Date().toISOString(), 
          auditTrail: { before: snapshotBefore, after: snapshotAfter } 
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
        const snapshotBefore = getSnapshot(assets); 
        
        let paymentMethodName = "共同帳戶直接付";
        if (advancedBy === 'jointCash') {
          if (newAssets.jointCash < val) return alert("❌ 共同現金不足，無法記錄共同支出。");
          newAssets.jointCash -= val;
        } else if (advancedBy === 'userA') {
          if (newAssets.userA < val) return alert("❌ 恆恆的個人餘額不足，無法代墊。");
          newAssets.userA -= val; 
          paymentMethodName = "恆恆先墊 (User A)";
        } else if (advancedBy === 'userB') {
          if (newAssets.userB < val) return alert("❌ 得得的個人餘額不足，無法代墊。");
          newAssets.userB -= val; 
          paymentMethodName = "得得先墊 (User B)";
        }

        const snapshotAfter = getSnapshot(newAssets); 

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
              isSettled: isSettled, 
              timestamp: new Date().toISOString(), 
              auditTrail: { before: snapshotBefore, after: snapshotAfter } 
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

  const handleDeleteTransaction = (indexToDelete) => {
    const record = assets.monthlyExpenses[indexToDelete];
    if (!record) return;
    
    if (record.isDeleted) return alert("❌ 這筆紀錄已經被作廢過了！");

    // 🛡️ 新增：會計鎖防呆 (已結清的帳不能直接刪除)
    if (record.isSettled) {
        return alert("❌ 此筆消費已經被「結清」過了！\n請先在流水帳中找到對應的「系統結算」紀錄並作廢它，才能解鎖並作廢此筆消費。");
    }

    const reason = window.prompt("⚠️ 準備作廢此紀錄，請輸入刪除原因（必填）：");
    if (!reason || !reason.trim()) {
        return alert("❌ 必須輸入刪除原因才能作廢紀錄喔！");
    }

    const snapshotBefore = getSnapshot(assets);
    const newAssets = { ...assets };
    const payerKey = record.payer === '恆恆🐶' ? 'userA' : (record.payer === '得得🐕' ? 'userB' : null);

    // 複製一份歷史紀錄準備進行修改 (因為如果刪除的是結算，我們要連帶修改其他紀錄)
    let updatedExpenses = [...(assets.monthlyExpenses || [])];

    switch (record.type) {
      case 'settle':
         // 1. 退回結清當時的轉帳款項
         if (record.settledUser) {
             newAssets.jointCash += record.total;
             newAssets[record.settledUser] -= record.total;
         }
         // 2. 自動將關聯的消費紀錄「解鎖」 (恢復成未結清)
         if (record.settleId) {
             updatedExpenses = updatedExpenses.map(r => {
                 if (r.settleId === record.settleId) {
                     return { ...r, isSettled: false, settleId: null };
                 }
                 return r;
             });
         }
         break;
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
             // 走到這裡代表它一定是未結清的 (因為結清的已經在前面被擋下來了)
             newAssets[record.advancedBy] += record.total;
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

    // ★ 軟刪除：更新狀態並存入作廢原因與退款快照
    newAssets.monthlyExpenses = updatedExpenses.map((r, i) => 
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
      amount: `$${(Number(record.total) || 0).toLocaleString()}`,
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
}

export default App;