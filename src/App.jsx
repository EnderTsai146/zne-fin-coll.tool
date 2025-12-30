import { useState, useEffect } from 'react';
import { db } from './firebase';
import { ref, onValue, update } from 'firebase/database';

function App() {
  const [data, setData] = useState({
    ende: { income: 0, stockValue: 0, stockUnrealized: 0 },
    ziheng: { income: 0, stockValue: 0, stockUnrealized: 0 },
    joint: { totalFund: 0, location: "未設定" }
  });

  useEffect(() => {
    const dataRef = ref(db, '/financialData');
    onValue(dataRef, (snapshot) => {
      const val = snapshot.val();
      if (val) setData(val);
    });
  }, []);

  const updateData = (path, value) => {
    update(ref(db, '/financialData'), { [path]: value });
  };

  const cardStyle = { border: '1px solid #ddd', padding: '20px', borderRadius: '12px', marginBottom: '20px', background: 'white', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' };
  const inputStyle = { padding: '8px', margin: '5px 0', width: '100%', boxSizing: 'border-box', border: '1px solid #ccc', borderRadius: '4px' };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', backgroundColor: '#f9f9f9', minHeight: '100vh' }}>
      <h1 style={{ textAlign: 'center', color: '#333' }}>💰 恩得 & 子恆 財務管家</h1>
      
      {/* 共同基金 */}
      <div style={{ ...cardStyle, borderLeft: '5px solid #2196F3' }}>
        <h2 style={{ margin: '0 0 15px 0', color: '#1976D2' }}>🤝 共同基金 (Joint)</h2>
        <div style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '10px' }}>
          ${(data.joint?.totalFund || 0).toLocaleString()}
        </div>
        <label style={{display:'block', marginBottom:'5px', color:'#666'}}>存放位置：</label>
        <input 
          style={inputStyle}
          value={data.joint?.location || ''} 
          onChange={(e) => updateData('joint/location', e.target.value)}
          placeholder="例如：玉山銀行"
        />
        <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
             <button style={{flex:1, padding:'10px', background:'#4CAF50', color:'white', border:'none', borderRadius:'5px', cursor:'pointer'}} onClick={() => updateData('joint/totalFund', Number(data.joint?.totalFund || 0) + 1000)}>+ 存 $1,000</button>
             <button style={{flex:1, padding:'10px', background:'#f44336', color:'white', border:'none', borderRadius:'5px', cursor:'pointer'}} onClick={() => updateData('joint/totalFund', Number(data.joint?.totalFund || 0) - 1000)}>- 取 $1,000</button>
        </div>
      </div>

      {/* 恩得 */}
      <div style={cardStyle}>
        <h3>👩 恩得 (En-De)</h3>
        <label>本月收入：</label>
        <input type="number" style={inputStyle} value={data.ende?.income || 0} onChange={(e) => updateData('ende/income', Number(e.target.value))} />
        <label>股票市值：</label>
        <input type="number" style={inputStyle} value={data.ende?.stockValue || 0} onChange={(e) => updateData('ende/stockValue', Number(e.target.value))} />
        <label>未實現損益：</label>
        <input type="number" style={inputStyle} value={data.ende?.stockUnrealized || 0} onChange={(e) => updateData('ende/stockUnrealized', Number(e.target.value))} />
        <p style={{ fontWeight:'bold', color: (data.ende?.stockUnrealized || 0) >= 0 ? 'red' : 'green' }}>
            {(data.ende?.stockUnrealized || 0) >= 0 ? '▲ 賺' : '▼ 賠'} {Math.abs(data.ende?.stockUnrealized || 0)}
        </p>
      </div>

      {/* 子恆 */}
      <div style={cardStyle}>
        <h3>👨 子恆 (Zi-Heng)</h3>
        <label>本月收入：</label>
        <input type="number" style={inputStyle} value={data.ziheng?.income || 0} onChange={(e) => updateData('ziheng/income', Number(e.target.value))} />
        <label>股票市值：</label>
        <input type="number" style={inputStyle} value={data.ziheng?.stockValue || 0} onChange={(e) => updateData('ziheng/stockValue', Number(e.target.value))} />
        <label>未實現損益：</label>
        <input type="number" style={inputStyle} value={data.ziheng?.stockUnrealized || 0} onChange={(e) => updateData('ziheng/stockUnrealized', Number(e.target.value))} />
        <p style={{ fontWeight:'bold', color: (data.ziheng?.stockUnrealized || 0) >= 0 ? 'red' : 'green' }}>
            {(data.ziheng?.stockUnrealized || 0) >= 0 ? '▲ 賺' : '▼ 賠'} {Math.abs(data.ziheng?.stockUnrealized || 0)}
        </p>
      </div>
    </div>
  );
}

export default App;