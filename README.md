# 🥔 馬鈴薯管家 (Financial Tracker)

Apple Liquid Glass 設計風格之情侶/伴侶雙人財務管理 PWA 應用程式。

---

## ☁️ Google Apps Script (GAS) 後端中繼站

本專案於根目錄提供了 [google-apps-script-backend.js](file:///Users/endertsai/financial-tracker阿陞修改前備份/google-apps-script-backend.js)，此檔案為 Google Apps Script (`script.google.com`) 的完整後端服務代碼備份，負責三大核心功能：

1. **台美股與外幣行情查詢 (`doGet`)**：Yahoo Finance 報價與搜尋代理。
2. **FCM 背景推播發送 (`doPost -> action: 'push'`)**：向 Firebase Cloud Messaging 轉發推播，確保 App 關閉時手機依然能接收通知。
3. **Google 雲端硬碟自動備份 (`doPost -> action: 'backup'`)**：每日自動將最新財務資料保存為 JSON 檔至 Google Drive。

> **⚠️ 注意事項**：未來任何 AI 或開發者進行推播或行情修改時，請同步維護 [google-apps-script-backend.js](file:///Users/endertsai/financial-tracker阿陞修改前備份/google-apps-script-backend.js) 檔案，避免任何功能遺漏。

