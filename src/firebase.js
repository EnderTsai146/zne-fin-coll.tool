// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// ★ 新增這行：引入驗證功能
import { getAuth } from "firebase/auth";

// 您的 Firebase 設定 (這部分不用動，維持原本的即可)
const firebaseConfig = {
  apiKey: "AIzaSyBFIFjvfUmaqsz5NEyVvTU2wO6Wxb7ea3U",
  authDomain: "jne-fin.firebaseapp.com",
  projectId: "jne-fin",
  storageBucket: "jne-fin.firebasestorage.app",
  messagingSenderId: "955998999597",
  appId: "1:955998999597:web:c412e44e18c53967f3d4a4",
  measurementId: "G-NCV23PPSLN"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// ★ 新增這行：匯出 auth 實例
export const auth = getAuth(app);