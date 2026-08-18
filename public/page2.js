import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  updateProfile, 
  GoogleAuthProvider, 
  signInWithPopup 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ==========================================================================
// 1. Firebase Initialization
// ==========================================================================
const firebaseConfig = {
  apiKey: "AIzaSyAnckVkyrUIPFZyqAhXKPAkSElNzSdGLas",
  authDomain: "intean-24e34.firebaseapp.com",
  projectId: "intean-24e34",
  storageBucket: "intean-24e34.firebasestorage.app",
  messagingSenderId: "893122700636",
  appId: "1:893122700636:web:6d9cc762927ab9d5608d99"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ==========================================================================
// 2. DOM Elements
// ==========================================================================
const signupForm = document.getElementById("signup-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirm-password");
const nicknameInput = document.getElementById("nickname");

const emailError = document.getElementById("email-error");
const passwordError = document.getElementById("password-error");
const confirmPasswordError = document.getElementById("confirm-password-error");
const nicknameError = document.getElementById("nickname-error");
const generalError = document.getElementById("general-error");

const togglePasswordBtn = document.getElementById("toggle-password");
const togglePasswordIcon = document.getElementById("toggle-password-icon");
const toggleConfirmPasswordBtn = document.getElementById("toggle-confirm-password");
const toggleConfirmPasswordIcon = document.getElementById("toggle-confirm-password-icon");

const submitBtn = document.getElementById("submit-btn");
const submitBtnText = document.getElementById("submit-btn-text");
const googleSignInBtn = document.getElementById("google-signin-btn");
const googleBtnText = document.getElementById("google-btn-text");

// ==========================================================================
// 3. Password Visibility Toggle (ON/OFF)
// ==========================================================================
function setupPasswordToggle(button, input, icon) {
  if (!button || !input || !icon) return;
  button.addEventListener("click", () => {
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    icon.textContent = isPassword ? "visibility" : "visibility_off";
    button.setAttribute("aria-label", isPassword ? "パスワードを隠す" : "パスワードを表示する");
  });
}

setupPasswordToggle(togglePasswordBtn, passwordInput, togglePasswordIcon);
setupPasswordToggle(toggleConfirmPasswordBtn, confirmPasswordInput, toggleConfirmPasswordIcon);

// ==========================================================================
// 4. Error Helper Functions
// ==========================================================================
function showError(element, message) {
  if (!element) return;
  element.textContent = message;
  element.classList.remove("hidden");
}

function clearError(element) {
  if (!element) return;
  element.textContent = "";
  element.classList.add("hidden");
}

function clearAllErrors() {
  clearError(emailError);
  clearError(passwordError);
  clearError(confirmPasswordError);
  clearError(nicknameError);
  clearError(generalError);
}

// リアルタイムに入力状態を監視し、ボタン色を更新するイベント登録
["input", "change", "keyup", "paste"].forEach((eventType) => {
  emailInput?.addEventListener(eventType, () => {
    clearError(emailError);
    updateSubmitButtonState();
  });
  passwordInput?.addEventListener(eventType, () => {
    clearError(passwordError);
    updateSubmitButtonState();
  });
  confirmPasswordInput?.addEventListener(eventType, () => {
    clearError(confirmPasswordError);
    updateSubmitButtonState();
  });
  nicknameInput?.addEventListener(eventType, () => {
    clearError(nicknameError);
  });
});

// ==========================================================================
// 5. Validation & Button State Logic
// ==========================================================================
// 半角英字・半角数字をそれぞれ1文字以上含む8文字以上
const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
// メールアドレス形式
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 必須項目がすべて正しく入力されているかを判定
function isFormFilledAndValid() {
  const email = emailInput?.value.trim() || "";
  const password = passwordInput?.value || "";
  const confirmPassword = confirmPasswordInput?.value || "";

  const isEmailValid = email !== "" && emailRegex.test(email);
  const isPasswordValid = password !== "" && passwordRegex.test(password);
  const isConfirmValid = confirmPassword !== "" && confirmPassword === password;

  return isEmailValid && isPasswordValid && isConfirmValid;
}

// ボタンの見た目（色・活性状態）を更新
function updateSubmitButtonState() {
  if (!submitBtn) return;
  const isAllValid = isFormFilledAndValid();

  if (isAllValid) {
    submitBtn.classList.remove("btn-inactive");
    submitBtn.classList.add("btn-active");
    // CSSのキャッシュやTailwindの詳細度を確実に上書き
    submitBtn.style.setProperty("background-color", "#0F1A45", "important");
    submitBtn.style.setProperty("border-color", "#0F1A45", "important");
    submitBtn.style.setProperty("color", "#ffffff", "important");
  } else {
    submitBtn.classList.remove("btn-active");
    submitBtn.classList.add("btn-inactive");
    // 未完了時は #426AB3
    submitBtn.style.setProperty("background-color", "#426AB3", "important");
    submitBtn.style.setProperty("border-color", "#426AB3", "important");
    submitBtn.style.setProperty("color", "#ffffff", "important");
  }
}

// 初期ロード時のボタン状態を設定
updateSubmitButtonState();

function validateForm() {
  clearAllErrors();
  let isValid = true;

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  // メールアドレスチェック
  if (!email) {
    showError(emailError, "メールアドレスを入力してください。");
    isValid = false;
  } else if (!emailRegex.test(email)) {
    showError(emailError, "正しいメールアドレスの形式で入力してください。");
    isValid = false;
  }

  // パスワードチェック（英数混合8文字以上）
  if (!password) {
    showError(passwordError, "パスワードを入力してください。");
    isValid = false;
  } else if (!passwordRegex.test(password)) {
    showError(passwordError, "パスワードは半角英字と半角数字を両方含む8文字以上で入力してください。");
    isValid = false;
  }

  // 確認用パスワードチェック
  if (!confirmPassword) {
    showError(confirmPasswordError, "確認用パスワードを入力してください。");
    isValid = false;
  } else if (password !== confirmPassword) {
    showError(confirmPasswordError, "パスワードと確認用パスワードが一致しません。");
    isValid = false;
  }

  updateSubmitButtonState();
  return isValid;
}

// ==========================================================================
// 6. Firebase Error Code Translator
// ==========================================================================
function getFriendlyErrorMessage(errorCode) {
  switch (errorCode) {
    case "auth/email-already-in-use":
      return "このメールアドレスは既に登録されています。";
    case "auth/invalid-email":
      return "メールアドレスの形式が正しくありません。";
    case "auth/operation-not-allowed":
      return "この登録方法は現在有効化されていません。";
    case "auth/weak-password":
      return "パスワードが脆弱です。別のパスワードをお試しください。";
    case "auth/popup-closed-by-user":
      return "Google認証のウィンドウが閉じられました。";
    case "auth/cancelled-popup-request":
      return "認証処理が中断されました。再度お試しください。";
    case "auth/unauthorized-domain":
      return "このドメインは認証が許可されていません（Firebaseの設定をご確認ください）。";
    default:
      return "登録処理中にエラーが発生しました。再度お試しください。";
  }
}

// ==========================================================================
// 7. Save User to Firestore Database
// ==========================================================================
async function saveUserToFirestore(user, nickname, authProvider) {
  try {
    const userRef = doc(db, "users", user.uid);
    const savePromise = setDoc(userRef, {
      uid: user.uid,
      email: user.email || "",
      nickname: nickname || user.displayName || "",
      authProvider: authProvider,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });

    // Firestoreの応答待ちでハングしないよう最大3秒でタイムアウト判定
    const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 3000));
    await Promise.race([savePromise, timeoutPromise]);
  } catch (error) {
    console.warn("Firestoreユーザー保存のスキップ/警告:", error);
  }
}

// ==========================================================================
// 8. Form Submit Handler (Email / Password)
// ==========================================================================
signupForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validateForm()) return;

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const nickname = nicknameInput.value.trim();

  submitBtn.disabled = true;
  submitBtnText.textContent = "登録中...";

  try {
    // Firebase Authでユーザー作成
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // ニックネームが入力されていればdisplayNameを更新
    if (nickname) {
      await updateProfile(user, { displayName: nickname });
    }

    // Firestoreユーザーデータベースに保存
    await saveUserToFirestore(user, nickname, "password");

    // 登録完了後、即座にpage3.htmlへリダイレクト
    window.location.href = "page3.html";
  } catch (error) {
    console.error("Signup error:", error);
    const message = getFriendlyErrorMessage(error.code);
    if (error.code === "auth/email-already-in-use") {
      showError(emailError, message);
    } else {
      showError(generalError, message);
    }
  } finally {
    submitBtn.disabled = false;
    submitBtnText.textContent = "入力完了";
    updateSubmitButtonState();
  }
});

// ==========================================================================
// 9. Google Sign-In Handler
// ==========================================================================
googleSignInBtn?.addEventListener("click", async () => {
  clearAllErrors();
  googleSignInBtn.disabled = true;
  googleBtnText.textContent = "連携中...";

  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    // Firestoreユーザーデータベースに保存
    await saveUserToFirestore(user, user.displayName || "", "google.com");

    // 登録完了後、即座にpage3.htmlへリダイレクト
    window.location.href = "page3.html";
  } catch (error) {
    console.error("Google signin error:", error);
    const message = getFriendlyErrorMessage(error.code);
    showError(generalError, message);
  } finally {
    googleSignInBtn.disabled = false;
    googleBtnText.textContent = "Googleで登録";
  }
});
