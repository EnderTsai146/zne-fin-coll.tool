// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// ★ 新增這行：引入驗證功能
import { getAuth } from "firebase/auth";

// 您的 Firebase 設定 (這部分不用動，維持原本的即可)
const firebaseConfig = {
  apiKey: "AIzaSyBRtXnNk1dxLPRuJSRUboE5PdsB6rVS5Us",
  authDomain: "zne-fin-d13e2.firebaseapp.com",
  databaseURL: "https://zne-fin-d13e2-default-rtdb.firebaseio.com",
  projectId: "zne-fin-d13e2",
  storageBucket: "zne-fin-d13e2.firebasestorage.app",
  messagingSenderId: "408036683766",
  appId: "1:408036683766:web:17e054d1355a92a52261d7",
  measurementId: "G-KJSGBV22BX"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// ★ 新增這行：匯出 auth 實例
export const auth = getAuth(app);