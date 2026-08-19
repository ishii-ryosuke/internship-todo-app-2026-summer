// Firebase SDK 設定（CDNモジュール）
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// プレースホルダーの Firebase 設定
// プロジェクトに合わせて適切な設定値に更新してください
const firebaseConfig = {
  apiKey: "AIzaSyAnckVkyrUIPFZyqAhXKPAkSElNzSdGLas",
  authDomain: "intean-24e34.firebaseapp.com",
  projectId: "intean-24e34",
  storageBucket: "intean-24e34.firebasestorage.app",
  messagingSenderId: "893122700636",
  appId: "1:893122700636:web:6d9cc762927ab9d5608d99"
};

// Firebase の初期化
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
