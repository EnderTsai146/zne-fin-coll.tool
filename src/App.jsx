// src/App.jsx
import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import TotalOverview from './components/TotalOverview';
import MonthlyView from './components/MonthlyView';
import AssetTransfer from './components/AssetTransfer';
import InvestmentView from './components/InvestmentView';
import ExpenseEntry from './components/ExpenseEntry';
import './index.css';
import { db, auth } from './firebase'; 
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";

const USER_MAPPING = { 
  "hzh940317@gmail.com": "恆恆🐶", 
  "ender.tsai@gmail.com": "得得🐕" 
};

const MAKE_WEBHOOK_URL = "https://hook.us2.make.com/bl76wl9v2v6hxd1k5xdm5n1yjt34hs7l"; 

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [operatorName, setOperatorName] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState('overview');

  // ★ 資料庫擴充：加入 userInvestments 追蹤個人投資，並加入 bills 追蹤帳單，還有 _usd 外幣帳戶
  const [assets, setAssets] = useState({
    userA: 0, 
    userB: 0, 
    userA_usd: 0, 
    userB_usd: 0, 
    jointCash: 0, 
    jointCash_usd: 0,
    jointInvestments: { stock: 0, fund: 0, deposit: 0, other: 0 },
    userInvestments: { 
      userA: { stock: 0, fund: 0, deposit: 0, other: 0 }, 
      userB: { stock: 0, fund: 0, deposit: 0, other: 0 } 
    },
    roi: { stock: 0, fund: 0, deposit: 0, other: 0 },
    monthlyExpenses: [],
    bills: []
  });

  // 監聽登入狀態
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) { 
        setCurrentUser(user); 
        setOperatorName(USER_MAPPING[user.email] || user.email.split('@')[0]); 
      } else { 
        setCurrentUser(null); 
        setOperatorName(''); 
      }
      setLoading(false);
    });
    return () => unsubscribeAuth();
  }, []);

  // 監聽 Firebase 資料庫變化
  useEffect(() => {
    if (!currentUser) return;
    const docRef = doc(db, "finance", "data");
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
          const data = docSnap.data();
          // 防呆：如果舊資料沒有個人投資欄位，自動補齊
          if (!data.userInvestments) {
            data.userInvestments = { 
              userA: { stock: 0, fund: 0, deposit: 0, other: 0 }, 
              userB: { stock: 0, fund: 0, deposit: 0, other: 0 } 
            };
          }
          setAssets(data);
      } else {
        setDoc(docRef, assets);
      }
    }, (error) => console.error("資料讀取失敗:", error));
    return () => unsubscribe();
    // eslint-disable-next-line
  }, [currentUser]);

  // 儲存至雲端
  const saveToCloud = (newAssets) => {
    if (!currentUser) return;
    const docRef = doc(db, "finance", "data");
    setDoc(docRef, newAssets).catch((err) => alert("連線錯誤：" + err.message));
  };

  // 發送 Line 通知
  const sendLineNotification = async (data) => {
    try {
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

  // ★ 深度快照函數：確保所有投資與外幣帳戶都被精準記錄
  const getSnapshot = (currentAssets) => ({
    userA: currentAssets.userA, 
    userB: currentAssets.userB,
    userA_usd: currentAssets.userA_usd || 0, 
    userB_usd: currentAssets.userB_usd || 0,
    jointCash: currentAssets.jointCash, 
    jointCash_usd: currentAssets.jointCash_usd || 0,
    jointInvestments: { ...(currentAssets.jointInvestments || {}) },
    userInvestments: currentAssets.userInvestments 
      ? JSON.parse(JSON.stringify(currentAssets.userInvestments)) 
      : { userA: { stock:0, fund:0, deposit:0, other:0 }, userB: { stock:0, fund:0, deposit:0, other:0 } }
  });

  // 處理資產轉移與投資
  const handleTransaction = (newAssets, historyRecord) => {
    const timestamp = new Date().toISOString(); 
    let color = "#17c9b2"; let title = "資產變動";
    
    if (historyRecord.type === 'income') { color = "#06c755"; title = "收入入帳"; }
    else if (historyRecord.type === 'spend') { color = "#ef454d"; title = "共同支出"; }
    else if (historyRecord.type === 'transfer') { color = "#2b90d9"; title = "資產劃撥"; }
    else if (historyRecord.type === 'exchange') { color = "#3498db"; title = "外幣換匯"; }
    else if (historyRecord.type.includes('invest_sell')) { color = "#f1c40f"; title = "投資變現"; }
    else if (historyRecord.type.includes('invest_buy')) { color = "#8e44ad"; title = "買入投資"; }

    const finalAssets = {
      ...newAssets,
      monthlyExpenses: [
        ...(assets.monthlyExpenses || []),
        { 
          ...historyRecord, 
          operator: operatorName, 
          timestamp: timestamp, 
          auditTrail: { before: getSnapshot(assets), after: getSnapshot(newAssets) } 
        }
      ]
    };
    saveToCloud(finalAssets);
    setCurrentPage('overview');

    let signPrefix = '';
    if (['income', 'joint_invest_sell', 'personal_invest_sell', 'personal_invest_profit', 'liquidate'].includes(historyRecord.type)) { signPrefix = '+'; }
    else if (['spend', 'expense', 'joint_invest_buy', 'personal_invest_buy', 'personal_invest_loss'].includes(historyRecord.type)) { signPrefix = '-'; }
    else if (['transfer', 'settle', 'exchange'].includes(historyRecord.type)) { signPrefix = '🔄 '; }

    sendLineNotification({ 
      title: title, 
      amount: `${signPrefix}$${(Number(historyRecord.total) || 0).toLocaleString()}`, 
      category: historyRecord.category, 
      note: historyRecord.note || '無', 
      date: historyRecord.date, 
      color: color, 
      operator: operatorName 
    });
  };

  // 處理個人支出 (支援更新帳單)
  const handleAddExpense = (date, expenseData, totalAmount, payer, note, updatedBills = null) => {
    const payerKey = payer === 'heng' ? 'userA' : 'userB';
    const payerName = payer === 'heng' ? '恆恆🐶' : '得得🐕';
    
    if (assets[payerKey] < totalAmount) alert(`⚠️ ${payerName} 的個人餘額不足！`);

    const finalNote = note || '日記帳';
    const newAssetsTemp = { ...assets, [payerKey]: assets[payerKey] - totalAmount };
    
    const finalAssets = {
      ...newAssetsTemp,
      ...(updatedBills ? { bills: updatedBills } : {}), // 💡 帳單更新同步寫入
      monthlyExpenses: [
        ...(assets.monthlyExpenses || []),
        { 
          date, 
          month: date.slice(0, 7), 
          type: 'expense', 
          category: '個人支出', 
          details: expenseData, 
          total: totalAmount, 
          payer: payerName, 
          operator: operatorName, 
          note: finalNote, 
          timestamp: new Date().toISOString(), 
          auditTrail: { before: getSnapshot(assets), after: getSnapshot(newAssetsTemp) } 
        }
      ]
    };
    saveToCloud(finalAssets);
    alert("✅ 記帳完成！");
    setCurrentPage('overview'); 
    sendLineNotification({ title: "個人日記帳", amount: `-$${totalAmount.toLocaleString()}`, category: "個人支出", note: finalNote, date: date, color: "#ef454d", operator: operatorName });
  };

  // 處理共同支出 (支援更新帳單與代墊)
  const handleAddJointExpense = (date, category, amount, advancedBy, note, updatedBills = null) => {
    const val = Number(amount) || 0;
    const newAssets = { ...assets };
    
    let paymentMethodName = "共同帳戶直接付";
    if (advancedBy === 'jointCash') {
      if (newAssets.jointCash < val) return alert("❌ 共同現金不足！");
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

    const safeNote = note ? String(note).trim() : '';
    const finalAssets = {
      ...newAssets,
      ...(updatedBills ? { bills: updatedBills } : {}), // 💡 帳單更新同步寫入
      monthlyExpenses: [
        ...(newAssets.monthlyExpenses || []),
        { 
          date, 
          month: date.slice(0, 7), 
          type: 'spend', 
          category: '共同支出', 
          payer: '共同帳戶', 
          total: val, 
          note: safeNote ? `${category} - ${safeNote}` : category, 
          operator: operatorName, 
          advancedBy: advancedBy === 'jointCash' ? null : advancedBy, 
          isSettled: advancedBy === 'jointCash', 
          timestamp: new Date().toISOString(), 
          auditTrail: { before: getSnapshot(assets), after: getSnapshot(newAssets) } 
        }
      ]
    };
    saveToCloud(finalAssets);
    alert(`💸 已記錄共同支出 $${val.toLocaleString()} \n付款方式：${paymentMethodName}`);
    setCurrentPage('overview'); 
    sendLineNotification({ title: "共同支出", amount: `-$${val.toLocaleString()}`, category: "共同支出", note: safeNote ? `${category} - ${safeNote}` : category, date: date, color: "#ef454d", operator: operatorName });
  };

  // ★ 強大的作廢與退款邏輯
  const handleDeleteTransaction = (indexToDelete) => {
    const record = assets.monthlyExpenses[indexToDelete];
    if (!record) return;
    if (record.isDeleted) return alert("❌ 這筆紀錄已經被作廢過了！");
    if (record.isSettled) return alert("❌ 此筆消費已被「結清」！\n請先在流水帳中作廢「系統結算」紀錄，才能作廢此筆消費。");

    const reason = window.prompt("⚠️ 即將作廢此紀錄，請輸入刪除原因（必填）：");
    if (!reason || !reason.trim()) return alert("❌ 必須輸入刪除原因才能作廢紀錄。");

    const snapshotBefore = getSnapshot(assets);
    const newAssets = { ...assets };
    const safePayer = record.payer || '';
    const payerKey = safePayer.includes('恆恆') ? 'userA' : (safePayer.includes('得得') ? 'userB' : null);

    let updatedExpenses = [...(assets.monthlyExpenses || [])];

    // 依據操作類型，完美復原資金 (包含台幣、美金、投資本金)
    switch (record.type) {
      case 'settle':
         if (record.settledUser) { 
           newAssets.jointCash += record.total; 
           newAssets[record.settledUser] -= record.total; 
         }
         if (record.settleId) { 
           updatedExpenses = updatedExpenses.map(r => r.settleId === record.settleId ? { ...r, isSettled: false, settleId: null } : r); 
         }
         break;
      case 'income':
      case 'personal_invest_profit':
         if (payerKey) newAssets[payerKey] -= record.total; break;
      case 'expense':
      case 'personal_invest_loss':
         if (payerKey) newAssets[payerKey] += record.total; break;
      case 'spend':
         if (record.advancedBy === 'jointCash' || !record.advancedBy) newAssets.jointCash += record.total;
         else newAssets[record.advancedBy] += record.total;
         break;
      case 'transfer': 
         if (payerKey) newAssets[payerKey] += record.total;
         newAssets.jointCash -= record.total; 
         break;
      case 'exchange':
         if (record.note && record.note.includes('台幣換美金')) {
             newAssets[record.accountKey] += record.total; 
             if(record.usdAmount) newAssets[`${record.accountKey}_usd`] -= record.usdAmount;
         } else {
             newAssets[record.accountKey] -= record.total; 
             if(record.usdAmount) newAssets[`${record.accountKey}_usd`] += record.usdAmount;
         }
         break;
      case 'joint_invest_buy':
         newAssets.jointCash += record.total;
         if (record.investType && newAssets.jointInvestments[record.investType] !== undefined) {
           newAssets.jointInvestments[record.investType] -= record.total;
         }
         break;
      case 'personal_invest_buy':
         if (record.accountKey && newAssets.userInvestments && newAssets.userInvestments[record.accountKey]) {
             if (record.usdAmount) {
                 newAssets[`${record.accountKey}_usd`] = (newAssets[`${record.accountKey}_usd`] || 0) + record.usdAmount;
             } else {
                 newAssets[record.accountKey] += record.total;
             }
             newAssets.userInvestments[record.accountKey][record.investType] -= record.total;
         }
         break;
      case 'joint_invest_sell': 
      case 'liquidate': 
         newAssets.jointCash -= record.total;
         const sellType = record.investType || (record.note && record.note.split(' ')[1]); 
         if (sellType && newAssets.jointInvestments[sellType] !== undefined) {
           newAssets.jointInvestments[sellType] += (record.principal || record.total); 
         }
         break;
      case 'personal_invest_sell':
         if (record.accountKey && newAssets.userInvestments && newAssets.userInvestments[record.accountKey]) {
             if (record.usdAmount) {
                 newAssets[`${record.accountKey}_usd`] -= record.usdAmount;
             } else {
                 newAssets[record.accountKey] -= record.total;
             }
             newAssets.userInvestments[record.accountKey][record.investType] += (record.principal || record.total);
         }
         break;
      default: break;
    }

    newAssets.monthlyExpenses = updatedExpenses.map((r, i) => 
        i === indexToDelete 
        ? { 
            ...r, 
            isDeleted: true, 
            deleteReason: reason.trim(), 
            deleteTimestamp: new Date().toISOString(), 
            deleteAuditTrail: { before: snapshotBefore, after: getSnapshot(newAssets) } 
          } 
        : r
    );

    saveToCloud(newAssets);
    sendLineNotification({ title: "🗑️ 刪除/作廢紀錄", amount: `🔄$${(Number(record.total) || 0).toLocaleString()}`, category: record.category, note: `已作廢: ${record.note} (原因: ${reason.trim()})`, date: new Date().toISOString().split('T')[0], color: "#666666", operator: operatorName });
    alert("🗑️ 紀錄已作廢並完成復原。");
  };

  const handleAssetsUpdate = (updatedAssets) => { saveToCloud(updatedAssets); };

  if (loading) return <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100vh'}}>馬鈴薯甦醒中...🥔</div>;
  if (!currentUser) return <Login />;

  const Topbar = () => (
    <nav className="glass-nav" style={{ padding: '15px 25px', borderRadius: '0 0 20px 20px', marginBottom: '20px' }}>
      <div style={{ fontSize: '1.2rem', lineHeight: '1.2', fontWeight: 'bold' }}>
        🥔管家 <span style={{fontSize:'0.75rem', fontWeight: 'normal', opacity:0.7, display: 'inline-block', marginLeft: '5px'}}>({operatorName})</span>
      </div>
      <button className="glass-btn" style={{padding:'6px 12px', fontSize:'0.85rem', background:'rgba(255,0,0,0.1)', color:'red'}} onClick={handleLogout}>登出</button>
    </nav>
  );

  const navItems = [ 
    { id: 'overview', icon: '🏠', label: '總覽' }, 
    { id: 'monthly', icon: '📊', label: '紀錄' }, 
    { id: 'invest', icon: '📈', label: '投資' }, 
    { id: 'transfer', icon: '🛠️', label: '操作' }, 
    { id: 'expense', icon: '✍️', label: '記帳' } 
  ];

  const BottomNav = () => (
    <div style={{ 
      position: 'fixed', bottom: '25px', left: '50%', transform: 'translateX(-50%)', 
      width: 'calc(100% - 40px)', maxWidth: '500px', zIndex: 1000, borderRadius: '30px', 
      display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '12px 10px', 
      background: 'rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(20px) saturate(180%)', 
      WebkitBackdropFilter: 'blur(20px) saturate(180%)', boxShadow: '0 10px 30px rgba(0, 0, 0, 0.15)', 
      border: '1px solid rgba(255, 255, 255, 0.4)' 
    }}>
      {navItems.map(item => (
        <div key={item.id} onClick={() => setCurrentPage(item.id)} style={{ 
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
          width: '60px', cursor: 'pointer', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 
          opacity: currentPage === item.id ? 1 : 0.5, 
          transform: currentPage === item.id ? 'scale(1.15) translateY(-2px)' : 'scale(1)' 
        }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '4px', filter: currentPage === item.id ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' : 'none' }}>{item.icon}</div>
          <div style={{ fontSize: '0.7rem', fontWeight: currentPage === item.id ? 'bold' : 'normal', color: currentPage === item.id ? '#1967d2' : '#666' }}>{item.label}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ paddingBottom: '110px' }}>
      <Topbar />
      <div key={currentPage} className="page-transition-enter" style={{ padding: '0 20px', maxWidth: '800px', margin: '0 auto' }}>
        {currentPage === 'overview' && <TotalOverview assets={assets} setAssets={handleAssetsUpdate} />}
        {currentPage === 'monthly' && <MonthlyView assets={assets} setAssets={handleAssetsUpdate} onDelete={handleDeleteTransaction} sendLineNotification={sendLineNotification} currentUser={operatorName} />}
        {currentPage === 'invest' && <InvestmentView assets={assets} />}
        {currentPage === 'transfer' && <AssetTransfer assets={assets} setAssets={handleAssetsUpdate} onTransaction={handleTransaction} />}
        {currentPage === 'expense' && <ExpenseEntry assets={assets} setAssets={handleAssetsUpdate} onAddExpense={handleAddExpense} onAddJointExpense={handleAddJointExpense} />}
      </div>
      <BottomNav />
    </div>
  );
}
export default App;