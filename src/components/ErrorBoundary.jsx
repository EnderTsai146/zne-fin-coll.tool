// src/components/ErrorBoundary.jsx
import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '24px 18px',
          margin: '20px auto',
          maxWidth: '500px',
          background: 'rgba(255, 69, 58, 0.1)',
          border: '1px solid rgba(255, 69, 58, 0.3)',
          borderRadius: '16px',
          color: '#fff',
          textAlign: 'center',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '8px' }}>⚠️</div>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: '800', color: '#ff453a' }}>
            {this.props.title || '畫面載入發生異常'}
          </h3>
          <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)', margin: '0 0 16px 0', lineHeight: '1.5' }}>
            系統已攔截畫面載入異常，已防止畫面變為空白。
          </p>

          {this.state.error && (
            <div style={{
              fontSize: '0.72rem',
              color: '#ffb94f',
              background: 'rgba(0,0,0,0.3)',
              padding: '10px 12px',
              borderRadius: '8px',
              marginBottom: '16px',
              textAlign: 'left',
              fontFamily: 'monospace',
              overflowX: 'auto',
              wordBreak: 'break-all'
            }}>
              <strong>錯誤詳細資訊：</strong> {String(this.state.error?.message || this.state.error)}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              onClick={this.handleReset}
              className="glass-btn primary-gradient-btn"
              style={{ padding: '8px 18px', fontSize: '0.82rem', fontWeight: '800', borderRadius: '10px' }}
            >
              🔄 嘗試重新載入
            </button>
            <button
              onClick={() => window.location.reload()}
              className="glass-btn"
              style={{ padding: '8px 18px', fontSize: '0.82rem', borderRadius: '10px' }}
            >
              🌐 重新整理網頁
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
