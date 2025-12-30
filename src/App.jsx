import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { db } from './firebase';
import { ref, onValue, update } from 'firebase/database';

// 引入我們剛剛做的頁面
import Dashboard from './pages/Dashboard';
import Accounting from './pages/Accounting';
import History from './pages/History';

function App() {
  // 1. 設定目前月份 (預設為當下月份 YYYY-MM)
  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(currentMonthStr);
  
  // 2. 資料庫抓回來的資料
  const [data, setData] = useState({ joint: {}, ende: {}, ziheng: {} });
  const [loading, setLoading] = useState(true);

  // 3. 監聽 Firebase (根據選到的 month 改變路徑)
  useEffect(() => {
    setLoading(true);
    // 資料庫結構改成： /financial_v3/2025-12/...
    const dataRef = ref(db, `/financial_v3/${month}`);
    
    // 即時監聽
    const unsubscribe = onValue(dataRef, (snapshot) => {
      const val = snapshot.val();
      if (val) {
        setData(val);
      } else {
        // 如果這個月沒資料，就給空物件，避免壞掉
        setData({ joint: {}, ende: {}, ziheng: {} });
      }
      setLoading(false);
    });

    return () => unsubscribe(); // 關閉監聽
  }, [month]); // 當 month 改變時，這段會重新執行

  // 4. 更新資料的通用函式
  const updateData = (subPath, value) => {
    // 寫入路徑： /financial_v3/2025-12/ende/records/...
    update(ref(db, `/financial_v3/${month}`), {
      [subPath]: value
    });
  };

  return (
    <BrowserRouter>
      <div style={{ fontFamily: 'sans-serif', paddingBottom: '80px', background:'#f5f7fa', minHeight:'100vh' }}>
        
        {/* 頂部導航列 */}
        <nav style={{ background: '#2c3e50', padding: '15px', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position:'sticky', top:0, zIndex:100 }}>
            <h1 style={{ margin: 0, fontSize: '1.2rem' }}>💰 ZnE 財務通 ({month})</h1>
            {/* 切換月份按鈕 */}
            <Link to="/history" style={{ color: 'white', textDecoration: 'none', fontSize: '0.9rem', border: '1px solid white', padding: '5px 10px', borderRadius: '4px' }}>
                📅 切換月份
            </Link>
        </nav>

        {/* 路由設定：決定網址對應哪個頁面 */}
        <Routes>
          <Route path="/" element={<Dashboard data={data} month={month} loading={loading} />} />
          <Route path="/accounting" element={<Accounting data={data} updateData={updateData} month={month} />} />
          <Route path="/history" element={<History currentMonth={month} setMonth={setMonth} />} />
        </Routes>

        {/* 底部導航列 (Tab Bar) */}
        <BottomNav />
      </div>
    </BrowserRouter>
  );
}

// 底部導航元件 (裝飾用，方便手機切換)
function BottomNav() {
    const location = useLocation();
    const isActive = (path) => location.pathname === path ? '#2196F3' : '#999';
    const navStyle = { flex: 1, textAlign: 'center', padding: '15px', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 'bold' };
    
    return (
        <div style={{ position: 'fixed', bottom: 0, width: '100%', background: 'white', borderTop: '1px solid #ddd', display: 'flex', justifyContent: 'space-around' }}>
            <Link to="/" style={{ ...navStyle, color: isActive('/') }}>📊 總覽</Link>
            <Link to="/accounting" style={{ ...navStyle, color: isActive('/accounting') }}>✏️ 記帳</Link>
            <Link to="/history" style={{ ...navStyle, color: isActive('/history') }}>📅 歷史</Link>
        </div>
    );
}

export default App;