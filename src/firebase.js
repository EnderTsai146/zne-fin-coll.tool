// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// ★ 新增這行：引入驗證功能
import { getAuth } from "firebase/auth";

// 您的 Firebase 設定 (這部分不用動，維持原本的即可)
const firebaseConfig = {
  // ... 請保留您原本的 apiKey 等設定 ...
  // 如果您原本的程式碼這裡是一堆環境變數 (import.meta.env...)，請直接保留原本的內容
  // 重點是要加上下面的 export const auth
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// ★ 新增這行：匯出 auth 實例
export const auth = getAuth(app);