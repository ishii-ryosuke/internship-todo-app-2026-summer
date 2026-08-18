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
let app;
let auth;
let db;

async function initFirebase() {
  try {
    const response = await fetch("/__/firebase/init.json");
    if (response.ok) {
      const config = await response.json();
      app = initializeApp(config);
    } else {
      throw new Error("Local init fallback");
    }
  } catch (e) {
    // Fallback configuration for project team-c: intean-24e34
    const fallbackConfig = {
      projectId: "intean-24e34",
      authDomain: "intean-24e34.firebaseapp.com",
      storageBucket: "intean-24e34.appspot.com"
    };
    app = initializeApp(fallbackConfig);
  }
  auth = getAuth(app);
  db = getFirestore(app);
}

await initFirebase();

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

// Inputイベントでリアルタイムにエラー解除
emailInput?.addEventListener("input", () => clearError(emailError));
passwordInput?.addEventListener("input", () => clearError(passwordError));
confirmPasswordInput?.addEventListener("input", () => clearError(confirmPasswordError));
nicknameInput?.addEventListener("input", () => clearError(nicknameError));

// ==========================================================================
// 5. Validation Logic
// ==========================================================================
// 半角英字・半角数字をそれぞれ1文字以上含む8文字以上
const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
// メールアドレス形式
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const userRef = doc(db, "users", user.uid);
  await setDoc(userRef, {
    uid: user.uid,
    email: user.email || "",
    nickname: nickname || user.displayName || "",
    authProvider: authProvider,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
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
