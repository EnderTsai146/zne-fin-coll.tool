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
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo">🥔</div>
        <div className="login-title">馬鈴薯管家</div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '16px', textAlign: 'left' }}>
            <label style={{
              display: 'block',
              marginBottom: '6px',
              color: 'var(--text-secondary)',
              fontWeight: '600',
              fontSize: '0.85rem',
              letterSpacing: '0.01em'
            }}>Email</label>
            <input
              type="email"
              className="glass-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="請輸入 Email"
              required
              autoComplete="username"
              style={{ marginBottom: 0 }}
            />
          </div>

          <div style={{ marginBottom: '24px', textAlign: 'left' }}>
            <label style={{
              display: 'block',
              marginBottom: '6px',
              color: 'var(--text-secondary)',
              fontWeight: '600',
              fontSize: '0.85rem',
              letterSpacing: '0.01em'
            }}>密碼</label>
            <input
              type="password"
              className="glass-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="請輸入密碼"
              required
              autoComplete="current-password"
              style={{ marginBottom: 0 }}
            />
          </div>

          {error && (
            <div style={{
              color: 'var(--accent-red)',
              marginBottom: '16px',
              background: 'rgba(255, 59, 48, 0.08)',
              padding: '12px 14px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.9rem',
              fontWeight: '500',
              border: '1px solid rgba(255, 59, 48, 0.15)',
              animation: 'slideUpFade 0.3s ease-out'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="login-btn"
            disabled={loading}
            style={{ marginTop: '8px' }}
          >
            {loading ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
                登入中
              </span>
            ) : '登入系統'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;