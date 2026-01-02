// src/components/Login.jsx
import React, { useState } from 'react';
import { auth } from '../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      console.error("登入失敗", err);
      setError('❌ 帳號或密碼錯誤');
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      padding: '20px', // 關鍵：增加內距，防止手機版貼邊
      boxSizing: 'border-box'
    }}>
      <div className="glass-card" style={{
        width: '100%',
        maxWidth: '400px', // 限制最大寬度，電腦版不會太寬
        padding: '40px 30px',
        textAlign: 'center',
        margin: '0 auto' // 確保水平置中
      }}>
        <div style={{ fontSize: '3.5rem', marginBottom: '10px' }}>🥔</div>
        <h2 style={{ marginBottom: '30px', color: '#444', letterSpacing: '2px' }}>馬鈴薯管家</h2>
        
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '20px', textAlign: 'left' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: '#666', fontWeight: 'bold', fontSize: '0.9rem' }}>Email</label>
            <input
              type="email"
              className="glass-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="請輸入 Email"
              required
              autoComplete="username"
              style={{ width: '100%' }} // 確保填滿
            />
          </div>

          <div style={{ marginBottom: '30px', textAlign: 'left' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: '#666', fontWeight: 'bold', fontSize: '0.9rem' }}>密碼</label>
            <input
              type="password"
              className="glass-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="請輸入密碼"
              required
              autoComplete="current-password"
              style={{ width: '100%' }} // 確保填滿
            />
          </div>

          {error && <div style={{ color: '#ff6b6b', marginBottom: '20px', background: 'rgba(255,0,0,0.1)', padding: '10px', borderRadius: '8px', fontSize: '0.9rem' }}>{error}</div>}

          <button 
            type="submit" 
            className="glass-btn" 
            style={{ width: '100%', padding: '14px', fontSize: '1.1rem', fontWeight: 'bold', marginTop: '10px' }}
            disabled={loading}
          >
            {loading ? '登入中...' : '登入系統'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;