// ==============================================================================
// 🥔 馬鈴薯管家 — Google Apps Script (GAS) 現代化後端全功能中繼站 (FCM v1 + 行情 + 雲端備份)
// ==============================================================================
// 
// 本檔案為專案部署於 Google Apps Script (script.google.com) 的後端程式碼。
// 支援以下三大核心功能：
// 1. 【doGet】台美股即時行情查詢與 Yahoo Finance 代理搜尋
// 2. 【doPost -> push】採用 Google 官方最新 FCM HTTP v1 API (支援 iOS/Android/PWA 跨裝置背景推播)
// 3. 【doPost -> backup】Google 雲端硬碟 (Google Drive) 每日自動與手動 JSON 備份
//
// 📌 部署流程（只需 1 分鐘）：
// 1. 開啟 https://script.google.com/ 建立新專案（或開啟原專案）
// 2. 貼上此檔案的所有內容並按「儲存 (Ctrl+S / Cmd+S)」
// 3. 點擊右上角「部署」➔「管理部署作業」➔ 點擊鉛筆「編輯」➔ 版本選擇「新版本」➔ 存取權限確保為「所有人 (Anyone)」➔ 點擊「部署」
// 4. 複製產生的 Web 應用程式網址 (結尾為 /exec)
// 5. 貼回專案的 `src/config.js` (`MY_GOOGLE_API_URL`) 即完成！
// ==============================================================================

// 🔐 Firebase Admin SDK 服務帳戶金鑰 (jne-fin 專案)
var SERVICE_ACCOUNT = {
  "type": "service_account",
  "project_id": "jne-fin",
  "private_key_id": "c36d6e7f5f2be602492d658c810a5d647495c452",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDQ86Y9NgENd3Jz\n6D78lDG2zaEulgy0e7D5p8HXK8+6fCtEw/r+mstzdOCOduKE+QKTfp7QDUIieSjh\nD/zChDEK4Pzj7ArbF6evSFpwK0Ockfv6J7+AGptwlwuG05lFC9qalJr2zcJxWPqT\nM/hfPjO06KaiYarITEbcf03hhcboDhdWL3qpF2plXix2MbyOLCTS74GxT2H1xl2c\nNDaCHILvg8KdoXWoWVFSE1b2i9EMX5YfoFoSof/YMbJ/DHS+v6cNSenjt5Uq27HX\n72yveyuhetau7UnST6qYyaemLDmHuLzH0YlfYonVAn6+LwLoEVvQIwxDTr9PNaVc\n0S+wX14hAgMBAAECggEAJL7EPD1z/+9ChFmSQg65k2Ej+DJQ96hM3gp/TxyYQj41\nybkBOab1Ik+qccM8YI/9wPxiZ0n9mFxgMPwDwh1HFpesQVSwMAk/5tY9eT5SfIU7\nn6k/xwJm1WzqjQJHENpdzhNWERLsH8y6/AoGopEovKaxLxsn0mN/jqUgiAljikkm\nunZ1cpygRSTrsYzfKu7VPoaH3q3I/D9hqfzq/Yd03fx1xNmHnWkg54nlzjvoh5Mk\nh1FF4tvR4yqvPHXjHZN7UuP4ziHCYNbHXw6StJisQ5zL2Lk3MhlLWuQbprYkKxoD\n5EKVnRRZU2lQ1ULszp0bXFLFqysJlH1JvgRvmqEOZQKBgQDsJxc8q+wXv98G84yW\nDSNN6QlfNOOUxBFzgIdzaTEIdSgsJHo+8JHXYc0V1U3McisynBQQMmYw2IxAyAG+\n2Myiu93v+YV1exI1MJerhAZceDNWwGU1TwpjojIPhMqo+sSGklhyOg7bE8FQ+GyA\nODnyDl5HdlVxeUHHtr5+rATQywKBgQDig1IV8CapK2l+LCizF4CmdcbOYnCmvlOP\nBz+h1c5ClM5BK4kpMRZ6vuDHmhXGJu26a+Vg860ZMF4zEoKwqwGLznjYFS/TFZsl\nlYHf+Y703zLxYdBAJ0y1VVzrNZ8S7tzpMRYoi7Sb/ZeJL8ksOTpqR8vggEfDtMrK\nI6izkewLQwKBgQDp0y7r8SL8xQvU+zP5oxqQ2yxfa6Pnule5MMttV/un7zEOvDOa\nvGL7iygg9SpqQ6VIIEixXOXYeaItxpwL1uiQPUpcgYlGsMxvhCS5PCl8R7w1qpzL\nsu6Lhp7gxNBRjrMmuCMBP0FUZHQmc0QjlQizBs0NHzss9y5NzEFEdZjzDwKBgQCe\nMzGFePDHfjZzlMvoKSYFHIT5Z+9dxdf+MQXUNcuU3PEguxNU3Z/hoqbDQW6rskye\nwvS1PftLeGiSKv9z/DtcNZxY7pM0TgbJvR20HEwn4itmQvZ7l/cPPstiy1SKmKFZ\njJr5Pnmp6PeJLQLIDEAsMnDGH1H/8akgfL86i1PcmQKBgDVceQEm5buXgM1Y3wRN\nanc6bIeaBKvq8Dq33vubeM+gTgPXI4ANxDeqyRHfGtbyEVYGrWFUG3HCwiUw2XLv\nuAA8pQXBKWnqtpX5anvMuWzDvT2t116oAB2i3RC5Ryrq13dVCnxW0zKwClo9qUQ9\nx6vjNQNy/0xD1fg0rF3hCOkp\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-fbsvc@jne-fin.iam.gserviceaccount.com"
};

// 產生 Google OAuth2 Access Token (使用 RSA-SHA256 JWT 簽章)
function getFirebaseAccessToken() {
  var now = Math.floor(Date.now() / 1000);
  var header = { alg: "RS256", typ: "JWT" };
  var claimSet = {
    iss: SERVICE_ACCOUNT.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  };

  var encode64 = function(obj) {
    return Utilities.base64EncodeWebSafe(JSON.stringify(obj)).replace(/=+$/, "");
  };

  var toSign = encode64(header) + "." + encode64(claimSet);
  var signature = Utilities.computeRsaSha256Signature(toSign, SERVICE_ACCOUNT.private_key);
  var jwt = toSign + "." + Utilities.base64EncodeWebSafe(signature).replace(/=+$/, "");

  var res = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
    method: "post",
    payload: {
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    },
    muteHttpExceptions: true
  });

  var json = JSON.parse(res.getContentText());
  if (json.access_token) {
    return json.access_token;
  }
  throw new Error("無法取得 Google OAuth2 憑證: " + res.getContentText());
}

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

    // === 功能 A：FCM HTTP v1 背景推播 (支援 PWA/iOS/Android 喚醒手機) ===
    if (action === 'push') {
      var token = postData.token;
      var title = postData.title || "財務管家通知";
      var body = postData.body || "";

      if (!token) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Missing FCM Token' })).setMimeType(ContentService.MimeType.JSON);
      }

      var accessToken = getFirebaseAccessToken();
      var fcmPayload = {
        "message": {
          "token": token,
          "notification": {
            "title": title,
            "body": body
          },
          "data": {
            "title": title,
            "body": body
          },
          "webpush": {
            "headers": {
              "Urgency": "high"
            },
            "notification": {
              "icon": "/apple-touch-icon.png",
              "badge": "/apple-touch-icon.png"
            }
          }
        }
      };

      var options = {
        "method": "post",
        "contentType": "application/json",
        "headers": {
          "Authorization": "Bearer " + accessToken
        },
        "payload": JSON.stringify(fcmPayload),
        "muteHttpExceptions": true
      };

      var fcmEndpoint = "https://fcm.googleapis.com/v1/projects/" + SERVICE_ACCOUNT.project_id + "/messages:send";
      var fcmRes = UrlFetchApp.fetch(fcmEndpoint, options);
      var fcmText = fcmRes.getContentText();
      var fcmJson = JSON.parse(fcmText);

      if (fcmJson && fcmJson.name) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'success', messageId: fcmJson.name })).setMimeType(ContentService.MimeType.JSON);
      } else if (fcmJson && fcmJson.error && fcmJson.error.details && fcmJson.error.details.some(function(d){ return d.errorCode === 'UNREGISTERED'; })) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', errorType: 'UNREGISTERED', token: token, message: 'Token is unregistered' })).setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(fcmText).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // === 功能 B：Google 雲端硬碟自動/手動備份 ===
    if (action === 'backup') {
      var fileName = postData.fileName || ("自動備份_" + new Date().toISOString().slice(0, 10) + ".json");
      var fileData = JSON.stringify(postData.assets || {}, null, 2);
      
      // 自動儲存至 Google 雲端硬碟根目錄
      DriveApp.createFile(fileName, fileData, MimeType.PLAIN_TEXT);
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Backup created: ' + fileName })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Unknown action' })).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}
