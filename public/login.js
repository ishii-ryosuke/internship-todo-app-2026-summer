// Firebase Authentication & Firestore Login Logic
import { auth, db } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// DOM Elements
const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const btnLogin = document.getElementById("btnLogin");
const btnText = document.getElementById("btnText");
const errorMessage = document.getElementById("errorMessage");
const btnGoogleLogin = document.getElementById("btnGoogleLogin");
const btnTogglePassword = document.getElementById("btnTogglePassword");
const passwordIcon = document.getElementById("passwordIcon");

// パスワード表示切り替え処理
if (btnTogglePassword && passwordInput && passwordIcon) {
  btnTogglePassword.addEventListener("click", () => {
    const type = passwordInput.getAttribute("type") === "password" ? "text" : "password";
    passwordInput.setAttribute("type", type);
    passwordIcon.textContent = type === "password" ? "visibility_off" : "visibility";
  });
}
/**
 * Display error message in the UI alert box
 * @param {string} message 
 */
function showError(message) {
  if (!errorMessage) return;
  errorMessage.textContent = message;
  errorMessage.classList.remove("hidden");
}

/**
 * Hide the error alert box
 */
function hideError() {
  if (!errorMessage) return;
  errorMessage.textContent = "";
  errorMessage.classList.add("hidden");
}

/**
 * Check Firestore users collection and save session info
 * @param {import("firebase/auth").User} user 
 */
async function checkFirestoreUser(user) {
  let userData = null;
  try {
    // 1. UIDによるドキュメント照合
    const userDocRef = doc(db, "users", user.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      userData = userDocSnap.data();
    } else if (user.email) {
      // 2. email フィールドによるクエリ照合
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("email", "==", user.email));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        userData = querySnapshot.docs[0].data();
      }
    }
  } catch (err) {
    console.warn("Firestore users 参照時の通知:", err);
  }

  // セッションに保存
  sessionStorage.setItem("currentUserEmail", user.email || "");
  if (userData) {
    sessionStorage.setItem("currentUserName", userData.name || userData.username || user.displayName || "");
  }
}

/**
 * Convert Firebase auth error to user-friendly Japanese message
 * @param {any} error 
 * @returns {string}
 */
function getFriendlyErrorMessage(error) {
  if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password" || error.code === "auth/user-not-found") {
    return "メールアドレスまたはパスワードが正しくありません。";
  } else if (error.code === "auth/invalid-email") {
    return "メールアドレスの形式が正しくありません。";
  } else if (error.code === "auth/too-many-requests") {
    return "ログイン試行回数が多すぎます。しばらく待ってから再度お試しください。";
  } else if (error.code === "auth/api-key-not-valid" || error.message?.includes("API key")) {
    return "Firebaseの設定（APIキー等）が未設定または無効です。firebase-config.js をご確認ください。";
  }
  return error.message ? `ログインエラー: ${error.message}` : "ログインに失敗しました。";
}

// フォーム送信（メール/パスワードログイン）
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError();

    const email = emailInput?.value.trim() || "";
    const password = passwordInput?.value || "";

    if (!email || !password) {
      showError("メールアドレスとパスワードを入力してください。");
      return;
    }

    if (btnLogin) btnLogin.disabled = true;
    if (btnText) btnText.textContent = "ログイン中...";

    try {
      // Firebase Authentication で認証
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      // Firestore users コレクションを参照
      await checkFirestoreUser(userCredential.user);
      // ホーム画面 (main.html) へ遷移
      window.location.href = "main.html";
    } catch (error) {
      console.error("Login error:", error);
      if (btnLogin) btnLogin.disabled = false;
      if (btnText) btnText.textContent = "ログイン";
      showError(getFriendlyErrorMessage(error));
    }
  });
}

// Google ログイン処理
if (btnGoogleLogin) {
  btnGoogleLogin.addEventListener("click", async () => {
    hideError();
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      await checkFirestoreUser(userCredential.user);
      window.location.href = "main.html";
    } catch (error) {
      console.error("Google login error:", error);
      if (error.code !== "auth/popup-closed-by-user") {
        showError("Googleログインに失敗しました: " + (error.message || error.code));
      }
    }
  });
}
