// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// 您的設定檔
const firebaseConfig = {
  apiKey: "AIzaSyBRtXnNk1dxLPRuJSRUboE5PdsB6rVS5Us",
  authDomain: "zne-fin-d13e2.firebaseapp.com",
  projectId: "zne-fin-d13e2",
  storageBucket: "zne-fin-d13e2.firebasestorage.app",
  messagingSenderId: "408036683766",
  appId: "1:408036683766:web:17e054d1355a92a52261d7",
  measurementId: "G-KJSGBV22BX"
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);

// 匯出資料庫實例，讓其他檔案可以使用
export const db = getFirestore(app);