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
    e.preventDefault(); // 防止表單重新整理
    setLoading(true);
    setError('');

    try {
      await signInWithEmailAndPassword(auth, email, password);
      // 登入成功後，Firebase 會自動通知 App.jsx，這裡不用做轉址
    } catch (err) {
      console.error("登入失敗", err);
      setError('❌ 帳號或密碼錯誤');
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="glass-card login-box">
        <div style={{ fontSize: '3rem', marginBottom: '10px' }}>🥔</div>
        <h2 style={{ marginBottom: '20px', color: '#444' }}>馬鈴薯管家</h2>
        
        {/* 使用 form 標籤是讓瀏覽器跳出「儲存密碼」的關鍵 */}
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '15px', textAlign: 'left' }}>
            <label style={{ display: 'block', marginBottom: '5px', color: '#666' }}>Email</label>
            <input
              type="email"
              className="glass-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="請輸入 Email"
              required
              // ★ 關鍵：告訴手機這是帳號欄位
              autoComplete="username"
            />
          </div>

          <div style={{ marginBottom: '25px', textAlign: 'left' }}>
            <label style={{ display: 'block', marginBottom: '5px', color: '#666' }}>密碼</label>
            <input
              type="password"
              className="glass-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="請輸入密碼"
              required
              // ★ 關鍵：告訴手機這是密碼欄位
              autoComplete="current-password"
            />
          </div>

          {error && <p style={{ color: 'red', marginBottom: '15px' }}>{error}</p>}

          <button 
            type="submit" 
            className="glass-btn" 
            style={{ width: '100%', padding: '12px', fontSize: '1rem' }}
            disabled={loading}
          >
            {loading ? '登入中...' : '登入'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;