// src/pages/Dashboard.jsx
import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

function Dashboard({ data, month, loading }) {
  if (loading) return <div style={{padding:'20px', color:'white', textAlign:'center'}}>載入中，請稍候... ✨</div>;

  const calculateTotal = (person) => {
    const records = data[person]?.records || {};
    return Object.values(records).reduce((acc, item) => {
      return item.type === 'income' ? acc + item.amount : acc - item.amount;
    }, 0);
  };

  const endeNet = calculateTotal('ende');
  const zihengNet = calculateTotal('ziheng');
  const jointNet = (data.joint?.fund || 0) + calculateTotal('joint');
  const totalAssets = endeNet + zihengNet + jointNet;

  const calcReturn = (cost, current) => {
    if (!cost) return { val: 0, percent: 0 };
    const diff = current - cost;
    const percent = ((diff / cost) * 100).toFixed(1);
    return { val: diff, percent: percent };
  };
  const jointInvest = calcReturn(data.joint?.investCost || 0, data.joint?.investValue || 0);

  const chartData = {
    labels: ['共同基金', '恩得淨值', '子恆淨值'],
    datasets: [{
      data: [jointNet > 0 ? jointNet : 0, endeNet > 0 ? endeNet : 0, zihengNet > 0 ? zihengNet : 0],
      backgroundColor: ['rgba(54, 162, 235, 0.8)', 'rgba(255, 99, 132, 0.8)', 'rgba(75, 192, 192, 0.8)'],
      borderColor: 'rgba(255, 255, 255, 0.5)',
      borderWidth: 2,
    }],
  };
  const chartOptions = {
      plugins: { legend: { labels: { color: '#1a202c' } } }, // 讓圖表文字變深色
      maintainAspectRatio: false
  }

  const profitStyle = (val) => ({ color: val >= 0 ? '#ff4d4f' : '#52c41a', fontWeight: 'bold' });
  const fmt = (num) => Math.floor(num || 0).toLocaleString();

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }} className="chart-container">
      <h2 style={{ textAlign: 'center', marginBottom:'25px' }}>📊 {month} 月份財務總覽</h2>

      <div className="glass-card">
        <div style={{ display: 'flex', justifyContent: 'center', height: '220px', marginBottom:'15px' }}>
          <Doughnut data={chartData} options={chartOptions} />
        </div>
        <div style={{ textAlign: 'center', fontSize: '1.3rem', color:'#1a202c' }}>
          本月總資產：<strong>${fmt(totalAssets)}</strong>
        </div>
      </div>

      <div className="glass-card" style={{ borderLeft: '5px solid #36A2EB' }}>
        <h3>🤝 共同基金投資 (Joint)</h3>
        <p style={{margin:'10px 0', color:'#555'}}>存放於：<strong>{data.joint?.location || '未設定'}</strong></p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop:'15px' }}>
            <div style={{background:'rgba(255,255,255,0.3)', padding:'10px', borderRadius:'12px'}}>
                <small style={{color:'#666'}}>投入本金</small>
                <div style={{fontSize:'1.2rem', fontWeight:'bold'}}>${fmt(data.joint?.investCost)}</div>
            </div>
            <div style={{background:'rgba(255,255,255,0.3)', padding:'10px', borderRadius:'12px'}}>
                <small style={{color:'#666'}}>目前市值</small>
                <div style={{fontSize:'1.2rem', fontWeight:'bold'}}>${fmt(data.joint?.investValue)}</div>
            </div>
        </div>
        <div style={{ marginTop: '15px', background: 'rgba(255,255,255,0.4)', padding: '12px', borderRadius: '12px', textAlign:'center' }}>
            損益試算：<span style={profitStyle(jointInvest.val)}>{fmt(jointInvest.val)} ({jointInvest.percent}%)</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div className="glass-card" style={{ borderTop: '4px solid #FF6384', textAlign:'center' }}>
            <h4>👩 恩得淨值</h4>
            <div style={{fontSize:'1.5rem', fontWeight:'bold', color:'#d63384'}}>${fmt(endeNet)}</div>
        </div>
        <div className="glass-card" style={{ borderTop: '4px solid #4BC0C0', textAlign:'center' }}>
            <h4>👨 子恆淨值</h4>
            <div style={{fontSize:'1.5rem', fontWeight:'bold', color:'#08979c'}}>${fmt(zihengNet)}</div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;