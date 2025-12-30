// src/components/Login.jsx
import React, { useState } from 'react';

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // 驗證邏輯
    const user1 = username === '恩得' && password === '294d666e70r';
    const user2 = username === '子恆' && password === 'Ziheng0317';

    if (user1 || user2) {
      onLogin(username); // 傳回登入者的名字
    } else {
      setError('帳號或密碼錯誤，請重新輸入');
      setPassword('');
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}>
        <h1 style={{ marginBottom: '10px' }}>歡迎回來</h1>
        <p style={{ color:'#666', marginBottom:'30px' }}>請先進行登入。記得目標是變馬鈴薯🥔！</p>
        
        <form onSubmit={handleSubmit}>
          <input 
            type="text" 
            placeholder="帳號" 
            className="glass-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input 
            type="password" 
            placeholder="密碼" 
            className="glass-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          
          {error && <p style={{color: '#ff6b6b', fontSize:'0.9rem'}}>{error}</p>}

          <button type="submit" className="glass-btn" style={{ width: '100%', marginTop: '20px' }}>
            登入系統
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;