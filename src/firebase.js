// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBRtXnNk1dxLPRuJSRUboE5PdsB6rVS5Us",
  authDomain: "zne-fin-d13e2.firebaseapp.com",
  projectId: "zne-fin-d13e2",
  storageBucket: "zne-fin-d13e2.firebasestorage.app",
  messagingSenderId: "408036683766",
  appId: "1:408036683766:web:17e054d1355a92a52261d7",
  measurementId: "G-KJSGBV22BX"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

import { getDatabase } from "firebase/database";
export const db = getDatabase(app);