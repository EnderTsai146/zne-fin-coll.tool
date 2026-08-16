// src/components/ErrorBoundary.jsx
import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, copied: false });
  };

  handleCopyLog = () => {
    const errorText = `=========================================
🥔 馬鈴薯管家 — 系統錯誤診斷日誌
=========================================
【發生時間】: ${new Date().toLocaleString()} (${new Date().toISOString()})
【錯誤標題】: ${this.props.title || '畫面載入異常'}
【錯誤類型】: ${this.state.error?.name || 'Error'}
【錯誤訊息】: ${this.state.error?.message || String(this.state.error)}

-----------------------------------------
【呼叫堆疊 (Error Stack)】:
${this.state.error?.stack || '無 Stack 資訊'}

-----------------------------------------
【元件堆疊 (Component Stack)】:
${this.state.errorInfo?.componentStack || '無 Component Stack 資訊'}

-----------------------------------------
【瀏覽器環境 (User Agent)】:
${typeof navigator !== 'undefined' ? navigator.userAgent : '未知'}
【當前頁面網址】:
${typeof window !== 'undefined' ? window.location.href : '未知'}
=========================================`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(errorText).then(() => {
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 3000);
      }).catch(() => {
        this.fallbackCopy(errorText);
      });
    } else {
      this.fallbackCopy(errorText);
    }
  };

  fallbackCopy = (text) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 3000);
    } catch (err) {
      console.error("Fallback copy failed:", err);
    }
    document.body.removeChild(textArea);
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '28px 20px',
          margin: '24px auto',
          maxWidth: '560px',
          width: 'calc(100% - 32px)',
          background: 'rgba(25, 20, 24, 0.85)',
          border: '1px solid rgba(255, 69, 58, 0.35)',
          borderRadius: '20px',
          color: '#fff',
          textAlign: 'center',
          backdropFilter: 'blur(28px) saturate(190%)',
          WebkitBackdropFilter: 'blur(28px) saturate(190%)',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
          boxSizing: 'border-box'
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>⚠️</div>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', fontWeight: '800', color: '#ff453a' }}>
            {this.props.title || '畫面載入發生異常'}
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'rgba(235, 235, 245, 0.75)', margin: '0 0 16px 0', lineHeight: '1.6' }}>
            系統已成功攔截異常以防止白屏。您可以一鍵複製下方日誌提供給 AI 代理進行快速修復。
          </p>

          {/* Error Summary Box */}
          <div style={{
            fontSize: '0.78rem',
            color: '#ff9f0a',
            background: 'rgba(0, 0, 0, 0.4)',
            border: '1px solid rgba(255, 159, 10, 0.25)',
            padding: '12px 14px',
            borderRadius: '12px',
            marginBottom: '16px',
            textAlign: 'left',
            fontFamily: 'SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            overflowX: 'auto',
            wordBreak: 'break-all',
            lineHeight: '1.5'
          }}>
            <div style={{ fontWeight: '800', color: '#ff453a', marginBottom: '4px' }}>
              🚨 {this.state.error?.name || 'Error'}: {this.state.error?.message || String(this.state.error)}
            </div>
            {this.state.error?.stack && (
              <div style={{ fontSize: '0.68rem', color: 'rgba(255, 255, 255, 0.55)', marginTop: '6px', maxHeight: '120px', overflowY: 'auto' }}>
                {this.state.error.stack.split('\n').slice(0, 4).join('\n')}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              onClick={this.handleCopyLog}
              className="glass-btn"
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '0.92rem',
                fontWeight: '800',
                borderRadius: '12px',
                background: this.state.copied
                  ? 'linear-gradient(135deg, #30d158, #248a3d)'
                  : 'linear-gradient(135deg, rgba(255, 159, 10, 0.3), rgba(255, 69, 58, 0.3))',
                border: this.state.copied ? '1px solid #30d158' : '1px solid rgba(255, 159, 10, 0.4)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(0,0,0,0.2)'
              }}
            >
              <span>{this.state.copied ? '✅' : '📋'}</span>
              <span>{this.state.copied ? '已成功複製完整診斷日誌！請貼給 AI' : '一鍵複製錯誤診斷日誌 (給 AI 修復)'}</span>
            </button>

            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button
                onClick={this.handleReset}
                className="glass-btn primary-gradient-btn"
                style={{ flex: 1, padding: '10px', fontSize: '0.84rem', fontWeight: '750', borderRadius: '10px' }}
              >
                🔄 嘗試重試載入
              </button>
              <button
                onClick={() => window.location.reload()}
                className="glass-btn"
                style={{ flex: 1, padding: '10px', fontSize: '0.84rem', borderRadius: '10px' }}
              >
                🌐 重新整理網頁
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
