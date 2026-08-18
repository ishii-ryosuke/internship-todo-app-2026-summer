// Firebase SDK 設定（CDNモジュール）
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// プレースホルダーの Firebase 設定
// プロジェクトに合わせて適切な設定値に更新してください
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "esm1-773ad.firebaseapp.com",
  projectId: "esm1-773ad",
  storageBucket: "esm1-773ad.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Firebase の初期化
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
