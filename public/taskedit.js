// ============================================================
// taskedit.js – タスク編集画面ロジック
//
// Firestore tasks コレクション構造:
//   taskId      : string    (ドキュメントID)
//   title       : string    (タスク名)
//   description : string    (タスク内容)
//   priority    : number    (重要度: 1=低, 2=中, 3=高)
//   dueDate     : Timestamp (期日)
//   isCompleted : boolean   (完了フラグ)
//   createdAt   : Timestamp (作成日時)
//   userId      : string    (所有ユーザーID)
// ============================================================

import { auth, db } from "./firebase-config.js";
import {
  doc,
  getDoc,
  updateDoc,
  Timestamp
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
const priorityInput = document.getElementById("priority");
const dueDateInput = document.getElementById("dueDate");
const dueTimeInput = document.getElementById("dueTime");

const taskNameError = document.getElementById("taskNameError");
const taskContentError = document.getElementById("taskContentError");
const priorityError = document.getElementById("priorityError");
const dueDateError = document.getElementById("dueDateError");

const btnSave = document.getElementById("btnSave");
const btnSaveText = document.getElementById("btnSaveText");
const btnCancel = document.getElementById("btnCancel");
const statusMessage = document.getElementById("statusMessage");

// ============================================================
// 3. エラー・ステータスメッセージ表示補助
// ============================================================
function showInputError(errorElement, message) {
  if (!errorElement) return;
  errorElement.textContent = message;
  errorElement.classList.remove("hidden");
}

function hideInputError(errorElement) {
  if (!errorElement) return;
  errorElement.textContent = "";
  errorElement.classList.add("hidden");
}

function showStatus(message, type = "success") {
  if (!statusMessage) return;
  statusMessage.textContent = message;
  statusMessage.className = `px-4 py-3 rounded-lg text-sm font-medium text-center ${
    type === "error" ? "bg-[#ffdad6] text-[#ba1a1a]" : "bg-[#d1e7dd] text-[#0f5132]"
  }`;
  statusMessage.classList.remove("hidden");
  setTimeout(() => statusMessage.classList.add("hidden"), 4000);
}

// ============================================================
// 4. 重要度（★）の星評価UI管理
// ============================================================
let currentRating = 0;

function updateStars(rating) {
  const stars = document.querySelectorAll(".star-btn");
  stars.forEach((btn) => {
    const val = parseInt(btn.dataset.value, 10);
    if (val <= rating) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
  currentRating = rating;
  if (priorityInput) {
    priorityInput.value = rating;
    priorityInput.dispatchEvent(new Event("change"));
  }
}

// 星ボタンイベントリスナー設定
document.querySelectorAll(".star-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const val = parseInt(btn.dataset.value, 10);
    // 同じ星をクリックした場合は解除(0)またはその値に設定
    if (val === currentRating) {
      updateStars(0);
    } else {
      updateStars(val);
    }
  });

  btn.addEventListener("mouseenter", () => {
    const val = parseInt(btn.dataset.value, 10);
    document.querySelectorAll(".star-btn").forEach((b) => {
      b.classList.toggle("active", parseInt(b.dataset.value, 10) <= val);
    });
  });

  btn.addEventListener("mouseleave", () => {
    updateStars(currentRating);
  });
});

// ============================================================
// 5. 時間入力の自動整形とバリデーション
// ============================================================
// 4桁の数字を入力したら自動で間に「:」を挿入して時間形式（HH:MM）にする
dueTimeInput?.addEventListener("input", (e) => {
  hideInputError(dueDateError);

  if (e.inputType && e.inputType.startsWith("delete")) {
    return;
  }

  let val = dueTimeInput.value;
  let digits = val.replace(/[^\d]/g, "");

  if (digits.length >= 4) {
    let hours = digits.slice(0, 2);
    let minutes = digits.slice(2, 4);

    let hNum = parseInt(hours, 10);
    if (hNum > 23) hours = "23";

    let mNum = parseInt(minutes, 10);
    if (mNum > 59) minutes = "59";

    dueTimeInput.value = `${hours}:${minutes}`;
  }
});

dueTimeInput?.addEventListener("blur", () => {
  let val = dueTimeInput.value.trim();
  if (!val) return;
  let digits = val.replace(/[^\d]/g, "");

  if (digits.length === 4) {
    let h = Math.min(23, parseInt(digits.slice(0, 2), 10));
    let m = Math.min(59, parseInt(digits.slice(2, 4), 10));
    dueTimeInput.value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  } else if (digits.length === 3) { // 例: "930" -> "09:30"
    let h = Math.min(23, parseInt(digits.slice(0, 1), 10));
    let m = Math.min(59, parseInt(digits.slice(1, 3), 10));
    dueTimeInput.value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  } else if (digits.length >= 1 && digits.length <= 2) { // 例: "9" -> "09:00", "14" -> "14:00"
    let h = Math.min(23, parseInt(digits, 10));
    dueTimeInput.value = `${String(h).padStart(2, "0")}:00`;
  }
});

// 入力時のエラー非表示
taskNameInput?.addEventListener("input", () => hideInputError(taskNameError));
taskContentInput?.addEventListener("input", () => hideInputError(taskContentError));
priorityInput?.addEventListener("change", () => hideInputError(priorityError));
dueDateInput?.addEventListener("input", () => hideInputError(dueDateError));

// ============================================================
// 6. タスクデータをFirestoreから読み込みフォームに反映
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

    // 1. タスク名 & 内容
    taskNameInput.value = data.title || "";
    taskContentInput.value = data.description || "";

    // 2. 重要度 (priority)
    const priorityVal = parseInt(data.priority, 10) || 0;
    updateStars(priorityVal);

    // 3. 期日 (dueDate: Timestamp / {seconds} / String)
    if (data.dueDate) {
      let dateObj = null;

      if (typeof data.dueDate.toDate === "function") {
        dateObj = data.dueDate.toDate();
      } else if (typeof data.dueDate === "object" && typeof data.dueDate.seconds === "number") {
        dateObj = new Date(data.dueDate.seconds * 1000);
      } else if (data.dueDate instanceof Date) {
        dateObj = data.dueDate;
      } else if (typeof data.dueDate === "string") {
        const parts = data.dueDate.trim().split(/[\sT]+/);
        if (parts[0]) dueDateInput.value = parts[0];
        if (parts[1]) dueTimeInput.value = parts[1];
      }

      if (dateObj && !isNaN(dateObj.getTime())) {
        const yyyy = dateObj.getFullYear();
        const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
        const dd = String(dateObj.getDate()).padStart(2, "0");
        const hh = String(dateObj.getHours()).padStart(2, "0");
        const min = String(dateObj.getMinutes()).padStart(2, "0");

        dueDateInput.value = `${yyyy}-${mm}-${dd}`;
        dueTimeInput.value = `${hh}:${min}`;
      }
    }
  } catch (err) {
    console.error("タスク読み込みエラー:", err);
    showStatus("タスクの読み込みに失敗しました。", "error");
  }
}

// ============================================================
// 7. タスク更新処理
// ============================================================
async function updateTask(taskId, updateData) {
  const taskRef = doc(db, "tasks", taskId);
  await updateDoc(taskRef, updateData);
}

// ============================================================
// 8. フォーム送信 → updateTask を呼び出して Firestore を更新
// ============================================================
editForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  hideInputError(taskNameError);
  hideInputError(taskContentError);
  hideInputError(priorityError);
  hideInputError(dueDateError);

  const title = taskNameInput?.value.trim() || "";
  const description = taskContentInput?.value.trim() || "";
  const priority = parseInt(priorityInput?.value || "0", 10);
  const dateVal = dueDateInput?.value || "";
  let timeVal = dueTimeInput?.value.trim() || "";

  // 時間の自動整形
  if (/^\d{4}$/.test(timeVal)) {
    timeVal = `${timeVal.slice(0, 2)}:${timeVal.slice(2)}`;
    if (dueTimeInput) dueTimeInput.value = timeVal;
  } else if (/^\d{3}$/.test(timeVal)) {
    timeVal = `0${timeVal.slice(0, 1)}:${timeVal.slice(1)}`;
    if (dueTimeInput) dueTimeInput.value = timeVal;
  } else if (/^(\d{1}):(\d{2})$/.test(timeVal)) {
    timeVal = `0${timeVal}`;
    if (dueTimeInput) dueTimeInput.value = timeVal;
  }

  let hasError = false;

  // 1. バリデーション: タスク名
  if (!title) {
    showInputError(taskNameError, "タスク名を入力してください。");
    hasError = true;
  }

  // 2. バリデーション: タスク内容
  if (!description) {
    showInputError(taskContentError, "内容を入力してください。");
    hasError = true;
  }

  // 3. バリデーション: 重要度
  if (!priority || priority === 0) {
    showInputError(priorityError, "重要度を選択してください。");
    hasError = true;
  }

  // 4. バリデーション: 期日（日付・時間）
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (!dateVal) {
    showInputError(dueDateError, "期日の日付を設定してください。");
    hasError = true;
  } else if (!timeVal) {
    showInputError(dueDateError, "期日の時間を入力してください（例: 14:00）。");
    hasError = true;
  } else if (!timeRegex.test(timeVal)) {
    showInputError(dueDateError, "有効な時間（例: 14:00）を半角で入力してください。");
    hasError = true;
  }

  if (hasError) return;
  if (!taskDocId) {
    showStatus("タスクIDが指定されていません。", "error");
    return;
  }

  // 日付 + 時間を合体して JS Date → Firestore Timestamp に変換
  const [year, month, day] = dateVal.split("-").map(Number);
  const [hour, minute] = timeVal.split(":").map(Number);
  const dateObj = new Date(year, month - 1, day, hour, minute, 0, 0);
  const dueDateTimestamp = Timestamp.fromDate(dateObj);

  btnSave.disabled = true;
  btnSaveText.textContent = "保存中...";

  try {
    await updateTask(taskDocId, {
      title: title,
      description: description,
      priority: priority,
      dueDate: dueDateTimestamp
    });

    showStatus("タスクを更新しました。", "success");
    setTimeout(() => {
      window.location.href = "main.html";
    }, 1000);
  } catch (err) {
    console.error("更新エラー:", err);
    showStatus("タスクの更新に失敗しました。", "error");
    btnSave.disabled = false;
    btnSaveText.textContent = "変更を保存";
  }
});

// ============================================================
// 9. キャンセルボタン → main.html に戻る
// ============================================================
btnCancel?.addEventListener("click", () => {
  window.location.href = "main.html";
});

// ============================================================
// 10. 認証確認 → ログインしていなければログイン画面へ
// ============================================================
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
  } else {
    loadTask();
  }
});

