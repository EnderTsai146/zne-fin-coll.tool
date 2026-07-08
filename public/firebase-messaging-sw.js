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
  console.log('Received background messaging payload: ', payload);
  const title = payload.notification.title || '馬鈴薯管家';
  const options = {
    body: payload.notification.body,
    icon: '/apple-touch-icon.png',
    badge: '/apple-touch-icon.png',
    data: payload.data
  };
  self.registration.showNotification(title, options);
});
