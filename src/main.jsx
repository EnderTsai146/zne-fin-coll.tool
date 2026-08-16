import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary title="馬鈴薯管家 系統啟動異常">
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
