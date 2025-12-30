// src/components/TotalOverview.jsx
import React from 'react';

const TotalOverview = ({ assets, setAssets }) => {
  // 1. 定義金額格式化工具
  const formatMoney = (num) => "$" + Math.round(Number(num)).toLocaleString();

  // 為了計算方便，先提取 ROI
  const roi = assets.roi || { stock: 0, fund: 0, deposit: 0, other: 0 };

  // 計算單項資產的預估現值
  const getEstValue = (type) => {
    const principal = assets.jointInvestments[type];
    const rate = roi[type] || 0;
    return principal * (1 + rate / 100);
  };

  // 處理 ROI 變更
  const handleRoiChange = (type, value) => {
    const newAssets = { ...assets };
    if (!newAssets.roi) newAssets.roi = {};
    newAssets.roi[type] = parseFloat(value) || 0;
    setAssets(newAssets);
  };

  // 總計計算
  const totalJointInvestPrincipal = Object.values(assets.jointInvestments).reduce((a, b) => a + b, 0);
  const totalEstValue = getEstValue('stock') + getEstValue('fund') + getEstValue('deposit') + getEstValue('other');
  const totalUnrealizedPL = totalEstValue - totalJointInvestPrincipal;
  const totalAssets = assets.userA + assets.userB + assets.jointCash + totalEstValue;

  return (
    <div>
      <h1 className="page-title">當前資產總覽</h1>
      
      {/* 1. 超大總資產卡片 */}
      <div className="glass-card" style={{ textAlign: 'center', padding: '40px' }}>
        <h4 style={{ color: '#666', marginBottom: '10px' }}>淨資產總額 (含投資預估損益)</h4>
        <h1 className="wwdc-text-gradient" style={{ fontSize: '3.5rem', margin: 0 }}>
          {formatMoney(totalAssets)}
        </h1>
      </div>

      {/* 2. 共同資產拆分顯示 */}
      {/* ★ 修改重點：改用 className="overview-grid" 來控制排版 */}
      <div className="overview-grid">
        
        {/* 左：共同現金 */}
        <div className="glass-card">
          <h3>💧 共同現金</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '10px 0' }}>
            {formatMoney(assets.jointCash)}
          </p>
          <p style={{ fontSize: '0.9rem', color: '#666' }}>可隨時靈活運用</p>
        </div>

        {/* 右：共同投資 (含 ROI 設定) */}
        <div className="glass-card">
          <h3>📈 共同投資表現</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end' }}>
            <div>
                <div style={{fontSize: '0.8rem', color:'#666'}}>總投入成本</div>
                <div style={{fontSize: '1.2rem', fontWeight:'bold'}}>
                    {formatMoney(totalJointInvestPrincipal)}
                </div>
            </div>
            <div style={{textAlign:'right'}}>
                <div style={{fontSize: '0.8rem', color:'#666'}}>預估現值</div>
                <div style={{fontSize: '1.5rem', fontWeight:'bold', color: totalUnrealizedPL >= 0 ? '#ff6b6b' : '#4cd137'}}>
                    {formatMoney(totalEstValue)}
                </div>
            </div>
          </div>
          
          <div style={{ background: 'rgba(255,255,255,0.5)', padding: '5px 10px', borderRadius: '8px', margin: '10px 0', fontSize: '0.9rem', display:'flex', justifyContent:'space-between' }}>
             <span>未實現損益：</span>
             <span style={{fontWeight:'bold', color: totalUnrealizedPL >= 0 ? '#e15f41' : '#2ecc71'}}>
               {totalUnrealizedPL >= 0 ? '+' : ''}{formatMoney(totalUnrealizedPL)}
             </span>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid rgba(0,0,0,0.1)', margin: '10px 0' }} />
          
          {/* 投資細項 + ROI 輸入 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {['stock', 'fund', 'deposit', 'other'].map(type => {
                const labelMap = { stock: '股票', fund: '基金', deposit: '定存', other: '其他' };
                return (
                    <div key={type} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{display:'flex', flexDirection:'column'}}>
                            <span>{labelMap[type]}</span>
                        </div>
                        <div style={{display:'flex', alignItems:'center', gap:'5px'}}>
                            <span style={{fontSize:'0.75rem', color:'#888'}}>報酬率%</span>
                            <input 
                                type="number" 
                                inputMode="decimal"
                                value={roi[type]} 
                                onChange={(e) => handleRoiChange(type, e.target.value)}
                                style={{width:'45px', padding:'4px', borderRadius:'6px', border:'1px solid #ddd', textAlign:'center', fontSize:'0.9rem'}}
                            />
                        </div>
                        <span style={{fontWeight:'500', minWidth:'60px', textAlign:'right'}}>
                            {formatMoney(getEstValue(type))}
                        </span>
                    </div>
                );
            })}
          </div>
        </div>
      </div>

      {/* 3. 個人資產狀況 */}
      <div className="glass-card">
        <h3>🐶 個人資產 (未劃撥)</h3>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '15px', background: 'rgba(255,255,255,0.5)', borderRadius: '16px' }}>
          <div style={{textAlign:'center', width:'48%'}}>
              <div style={{fontSize:'1.1rem', fontWeight:'bold', marginBottom:'5px'}}>恆恆🐶</div>
              <div style={{fontSize:'1.5rem', color:'#667eea'}}>
                  {formatMoney(assets.userA)}
              </div>
          </div>
          <div style={{width:'1px', background:'#ddd'}}></div>
          <div style={{textAlign:'center', width:'48%'}}>
              <div style={{fontSize:'1.1rem', fontWeight:'bold', marginBottom:'5px'}}>得得🐕</div>
              <div style={{fontSize:'1.5rem', color:'#764ba2'}}>
                  {formatMoney(assets.userB)}
              </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TotalOverview;