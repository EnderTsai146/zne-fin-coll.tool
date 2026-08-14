// ==============================================================================
// 🥔 馬鈴薯管家 — Google Apps Script (GAS) 後端全功能中繼站
// ==============================================================================
// 
// 本檔案為專案部署於 Google Apps Script (script.google.com) 的後端程式碼備份。
// 同時處理以下三大核心功能：
// 1. 【doGet】台美股即時行情查詢與 Yahoo Finance 代理搜尋
// 2. 【doPost -> push】Firebase Cloud Messaging (FCM) Web Push 背景推播發送
// 3. 【doPost -> backup】Google 雲端硬碟 (Google Drive) 每日自動與手動 JSON 備份
//
// 📌 部署流程：
// 1. 開啟 https://script.google.com/
// 2. 貼上此檔案的所有內容
// 3. 將第 27 行的 `serverKey` 替換為您的 Firebase 伺服器金鑰 (Legacy Server Key)
// 4. 點擊「部署」➔「管理部署作業」➔「編輯 (鉛筆)」➔ 版本選擇「新版本」➔ 點擊「部署」
// 5. 將產生的 Web 應用程式網址更新於專案的 `src/config.js` (`MY_GOOGLE_API_URL`)
// ==============================================================================

// 1. 股票與台美股即時行情查詢 (doGet)
function doGet(e) {
  try {
    var params = e.parameter || {};
    var search = params.search;
    var symbols = params.symbols;

    if (search) {
      var url = "https://query1.finance.yahoo.com/v1/finance/search?q=" + encodeURIComponent(search) + "&quotesCount=10";
      var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      return ContentService.createTextOutput(res.getContentText()).setMimeType(ContentService.MimeType.JSON);
    } 
    else if (symbols) {
      var symbolArray = symbols.split(',');
      var result = {};
      symbolArray.forEach(function(sym) {
        try {
          var url = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(sym.trim()) + "?interval=1d";
          var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
          var json = JSON.parse(res.getContentText());
          var meta = json.chart.result[0].meta;
          result[sym] = { price: meta.regularMarketPrice, currency: meta.currency };
        } catch(err) {
          result[sym] = { price: 0, error: err.toString() };
        }
      });
      return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    } 
    else {
      return ContentService.createTextOutput(JSON.stringify({ error: "Missing parameters 'symbols' or 'search'" })).setMimeType(ContentService.MimeType.JSON);
    }
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

// 2. 背景推播發送與 Google 雲端硬碟備份 (doPost)
function doPost(e) {
  try {
    var postData = JSON.parse(e.postData.contents);
    var action = postData.action;

    // 🔐 您的 Firebase Server Key (請至 Firebase Console ➔ 專案設定 ➔ Cloud Messaging 取得)
    var serverKey = "AAAAs5a..."; 

    // === 功能 A：FCM 手機與瀏覽器背景推播 (App 關閉時喚醒手機) ===
    if (action === 'push') {
      var token = postData.token;
      var title = postData.title || "財務管家通知";
      var body = postData.body || "";

      if (!token) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Missing FCM Token' })).setMimeType(ContentService.MimeType.JSON);
      }

      var payload = {
        "to": token,
        "notification": {
          "title": title,
          "body": body,
          "icon": "/apple-touch-icon.png",
          "click_action": "https://jne-fin.web.app"
        },
        "data": {
          "title": title,
          "body": body
        },
        "priority": "high"
      };

      var options = {
        "method": "post",
        "contentType": "application/json",
        "headers": {
          "Authorization": "key=" + serverKey
        },
        "payload": JSON.stringify(payload),
        "muteHttpExceptions": true
      };

      var fcmRes = UrlFetchApp.fetch("https://fcm.googleapis.com/fcm/send", options);
      return ContentService.createTextOutput(fcmRes.getContentText()).setMimeType(ContentService.MimeType.JSON);
    }

    // === 功能 B：Google 雲端硬碟自動/手動備份 ===
    if (action === 'backup') {
      var fileName = postData.fileName || ("自動備份_" + new Date().toISOString().slice(0, 10) + ".json");
      var fileData = JSON.stringify(postData.assets || {}, null, 2);
      
      // 自動儲存至您的 Google 雲端硬碟根目錄
      DriveApp.createFile(fileName, fileData, MimeType.PLAIN_TEXT);
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Backup created: ' + fileName })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Unknown action' })).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}
