// src/pages/Dashboard.jsx
import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

function Dashboard({ data, month, loading }) {
  if (loading) return <div style={{padding:'20px'}}>載入中...</div>;

  // --- 計算邏輯：從細項中算出總額 ---
  const calculateTotal = (person) => {
    const records = data[person]?.records || {};
    // 收入 - 支出
    return Object.values(records).reduce((acc, item) => {
      return item.type === 'income' ? acc + item.amount : acc - item.amount;
    }, 0);
  };

  const endeNet = calculateTotal('ende');
  const zihengNet = calculateTotal('ziheng');
  const jointNet = (data.joint?.fund || 0) + calculateTotal('joint'); // 共同基金可能有初始本金
  const totalAssets = endeNet + zihengNet + jointNet;

  // 投資損益計算
  const calcReturn = (cost, current) => {
    if (!cost) return { val: 0, percent: 0 };
    const diff = current - cost;
    const percent = ((diff / cost) * 100).toFixed(1);
    return { val: diff, percent: percent };
  };

  const jointInvest = calcReturn(data.joint?.investCost || 0, data.joint?.investValue || 0);

  // 圖表資料
  const chartData = {
    labels: ['共同基金', '恩得淨值', '子恆淨值'],
    datasets: [{
      data: [jointNet > 0 ? jointNet : 0, endeNet > 0 ? endeNet : 0, zihengNet > 0 ? zihengNet : 0],
      backgroundColor: ['#36A2EB', '#FF6384', '#4BC0C0'],
    }],
  };

  const cardStyle = { background: 'white', borderRadius: '15px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' };
  const profitStyle = (val) => ({ color: val >= 0 ? '#ff4d4f' : '#52c41a', fontWeight: 'bold' });
  const fmt = (num) => Math.floor(num || 0).toLocaleString();

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h2 style={{ textAlign: 'center', color: '#333' }}>📊 {month} 月份財務總覽</h2>

      {/* 總資產圓餅圖 */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'center', height: '200px' }}>
          <Doughnut data={chartData} options={{ maintainAspectRatio: false }} />
        </div>
        <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '1.2rem' }}>
          本月總資產：<strong>${fmt(totalAssets)}</strong>
        </div>
      </div>

      {/* 共同基金投資狀況 */}
      <div style={{ ...cardStyle, borderLeft: '5px solid #36A2EB' }}>
        <h3>🤝 共同基金投資 (Joint Investment)</h3>
        <p>目前存放位置：{data.joint?.location || '未設定'}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
                <small>投入本金</small>
                <div style={{fontSize:'1.2rem'}}>${fmt(data.joint?.investCost)}</div>
            </div>
            <div>
                <small>目前市值</small>
                <div style={{fontSize:'1.2rem'}}>${fmt(data.joint?.investValue)}</div>
            </div>
        </div>
        <div style={{ marginTop: '10px', background: '#f5f5f5', padding: '10px', borderRadius: '8px' }}>
            損益：<span style={profitStyle(jointInvest.val)}>{fmt(jointInvest.val)} ({jointInvest.percent}%)</span>
        </div>
      </div>

      {/* 個人簡易摘要 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
        <div style={{ ...cardStyle, borderTop: '4px solid #FF6384' }}>
            <h4>👩 恩得淨值</h4>
            <div style={{fontSize:'1.5rem'}}>${fmt(endeNet)}</div>
        </div>
        <div style={{ ...cardStyle, borderTop: '4px solid #4BC0C0' }}>
            <h4>👨 子恆淨值</h4>
            <div style={{fontSize:'1.5rem'}}>${fmt(zihengNet)}</div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;