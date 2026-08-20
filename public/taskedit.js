// ============================================================
// taskedit.js – タスク編集画面ロジック
//
// Firestore tasks コレクション構造:
//   taskId      : string  (ドキュメントID)
//   title       : string  (タスク名)
//   description : string  (タスク内容)
//   isCompleted : boolean (完了フラグ)
//   createdAt   : Timestamp (作成日時)
//   userId      : string  (所有ユーザーID)
// ============================================================

import { auth, db } from "./firebase-config.js";
import {
  doc,
  getDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ============================================================
// 1. URLパラメータからドキュメントIDを取得
// ============================================================
const params = new URLSearchParams(window.location.search);
const taskDocId = params.get("docId"); // 例: taskedit.html?docId=MxodU6hI1IIlQ4JnLH1K

// ============================================================
// 2. DOM参照
// ============================================================
const editForm = document.getElementById("editForm");
const taskNameInput = document.getElementById("taskName");
const taskContentInput = document.getElementById("taskContent");
const taskNameError = document.getElementById("taskNameError");
const btnSave = document.getElementById("btnSave");
const btnSaveText = document.getElementById("btnSaveText");
const btnCancel = document.getElementById("btnCancel");
const statusMessage = document.getElementById("statusMessage");

// ============================================================
// 3. ステータスメッセージ表示
// ============================================================
function showStatus(message, type = "success") {
  statusMessage.textContent = message;
  statusMessage.className = `px-4 py-3 rounded-lg text-sm font-medium text-center ${type}`;
  statusMessage.classList.remove("hidden");
  setTimeout(() => statusMessage.classList.add("hidden"), 4000);
}

// ============================================================
// 4. タスクデータをFirestoreから読み込みフォームに反映
// ============================================================
async function loadTask() {
  if (!taskDocId) {
    showStatus("タスクIDが指定されていません。", "error");
    return;
  }

  try {
    const taskRef = doc(db, "tasks", taskDocId);
    const taskSnap = await getDoc(taskRef);

    if (!taskSnap.exists()) {
      showStatus("タスクが見つかりませんでした。", "error");
      return;
    }

    const data = taskSnap.data();
    taskNameInput.value = data.title || "";
    taskContentInput.value = data.description || "";
  } catch (err) {
    console.error("タスク読み込みエラー:", err);
    showStatus("タスクの読み込みに失敗しました。", "error");
  }
}

// ============================================================
// 5. バリデーション
// ============================================================
function validateForm() {
  let valid = true;
  if (!taskNameInput.value.trim()) {
    taskNameError.textContent = "タスク名は必須です。";
    taskNameError.classList.remove("hidden");
    valid = false;
  } else {
    taskNameError.textContent = "";
    taskNameError.classList.add("hidden");
  }
  return valid;
}

taskNameInput?.addEventListener("input", () => {
  if (taskNameInput.value.trim()) {
    taskNameError.classList.add("hidden");
  }
});

// ============================================================
// 6. タスク更新処理（title / description のみを更新）
//
//    将来の編集機能から呼び出せる形:
//      updateTask(taskId, { title, description })
// ============================================================
async function updateTask(taskId, { title, description }) {
  const taskRef = doc(db, "tasks", taskId);
  await updateDoc(taskRef, {
    title: title,
    description: description
  });
}

// ============================================================
// 7. フォーム送信 → updateTask を呼び出して Firestore を更新
// ============================================================
editForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validateForm()) return;
  if (!taskDocId) { showStatus("タスクIDが指定されていません。", "error"); return; }

  btnSave.disabled = true;
  btnSaveText.textContent = "保存中...";

  try {
    await updateTask(taskDocId, {
      title: taskNameInput.value.trim(),
      description: taskContentInput.value.trim()
    });

    showStatus("タスクを更新しました。", "success");
    setTimeout(() => window.location.href = "main.html", 1200);
  } catch (err) {
    console.error("更新エラー:", err);
    showStatus("タスクの更新に失敗しました。", "error");
  } finally {
    btnSave.disabled = false;
    btnSaveText.textContent = "変更を保存";
  }
});

// ============================================================
// 8. キャンセルボタン → 前の画面に戻る
// ============================================================
btnCancel?.addEventListener("click", () => {
  window.location.href = "main.html";
});

// ============================================================
// 9. 認証確認 → ログインしていなければログイン画面へ
// ============================================================
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
  } else {
    loadTask();
  }
});
