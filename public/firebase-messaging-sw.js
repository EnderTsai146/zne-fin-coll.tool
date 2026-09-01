// public/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBFIFjvfUmaqsz5NEyVvTU2wO6Wxb7ea3U",
  authDomain: "jne-fin.firebaseapp.com",
  projectId: "jne-fin",
  storageBucket: "jne-fin.firebasestorage.app",
  messagingSenderId: "955998999597",
  appId: "1:955998999597:web:c412e44e18c53967f3d4a4"
});

const messaging = firebase.messaging();

// ★ SW 端推播防重去重快取 (防止多重事件引發重複彈窗)
const swRecentNotifs = new Map();

messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Received background message payload: ', payload);

  // ★ 若 FCM Payload 內已包含 notification 物件，Firebase Compat SDK 會自動於背景觸發原生通知。
  // 為防止與 SDK 預設行為重疊導致同時跳出 2 則通知，此處不重複呼叫 showNotification。
  if (payload.notification && (payload.notification.title || payload.notification.body)) {
    console.log('[SW] Notification object detected, already handled automatically by Firebase SDK. Skipping manual display.');
    return Promise.resolve();
  }

  const rawTitle = payload.data?.title || '系統通知';
  const title = String(rawTitle)
    .replace(/\s*[[(（【]?(from|drom)?\s*馬鈴薯管家\s*[\])）】]?/gi, '')
    .replace(/\s*(from|drom)\s*馬鈴薯管家/gi, '')
    .replace(/\s*-\s*馬鈴薯管家/gi, '')
    .replace(/【(from|drom)?\s*馬鈴薯管家】/gi, '')
    .replace(/【馬鈴薯管家】/gi, '')
    .replace(/(from|drom)\s*馬鈴薯管家/gi, '')
    .replace(/馬鈴薯管家/gi, '')
    .replace(/\s*(from|drom)\s*/gi, '')
    .replace(/^[\s\-–—:：【】()[\]]+/, '')
    .replace(/[\s\-–—:：【】()[\]]+$/, '')
    .trim() || '系統通知';
  const body = payload.data?.body || '';

  const dedupKey = `${title}_${body}`;
  const now = Date.now();
  const lastTime = swRecentNotifs.get(dedupKey);

  if (lastTime && (now - lastTime < 8000)) {
    console.log('[SW Dedup] Suppressed duplicate background push notification:', title);
    return Promise.resolve();
  }

  swRecentNotifs.set(dedupKey, now);
  if (swRecentNotifs.size > 30) {
    for (const [k, ts] of swRecentNotifs.entries()) {
      if (now - ts > 60000) swRecentNotifs.delete(k);
    }
  }

  const deterministicTag = payload.data?.tag || ('pot_' + Math.abs(dedupKey.split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)).toString(36));

  const options = {
    body: body,
    icon: '/apple-touch-icon.png',
    badge: '/apple-touch-icon.png',
    tag: deterministicTag,
    renotify: false,
    data: payload.data || {}
  };
  return self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

