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

messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Received background message payload: ', payload);
  const rawTitle = (payload.notification && payload.notification.title) || (payload.data && payload.data.title) || '系統通知';
  const title = String(rawTitle)
    .replace(/\s*[[(（【]?(from|drom)?馬鈴薯管家[\])）】]?/gi, '')
    .replace(/\s*(from|drom)\s*馬鈴薯管家/gi, '')
    .replace(/\s*-\s*馬鈴薯管家/gi, '')
    .replace(/【(from|drom)?馬鈴薯管家】/gi, '')
    .replace(/馬鈴薯管家/gi, '')
    .replace(/\s*(from|drom)\s*/gi, '')
    .trim() || '系統通知';
  const body = (payload.notification && payload.notification.body) || (payload.data && payload.data.body) || '';
  const options = {
    body: body,
    icon: '/apple-touch-icon.png',
    badge: '/apple-touch-icon.png',
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

