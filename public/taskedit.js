// ============================================================
// taskedit.js – タスク編集画面ロジック
//
// Firestore tasks コレクション構造:
//   taskId      : string    (ドキュメントID)
//   title       : string    (タスク名)
//   description : string    (タスク内容)
//   priority    : number    (重要度: 1=低, 2=中, 3=高)
//   dueDate     : Timestamp (期日)
//   categoryId  : string    (カテゴリーID)
//   isCompleted : boolean   (完了フラグ)
//   createdAt   : Timestamp (作成日時)
//   userId      : string    (所有ユーザーID)
// ============================================================

import { auth, db } from "./firebase-config.js";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  setDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
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
const taskCategorySelect = document.getElementById("taskCategory");
const addNewCategoryBtn = document.getElementById("addNewCategoryBtn");
const btnSave = document.getElementById("btnSave");
const btnSaveText = document.getElementById("btnSaveText");
const btnCancel = document.getElementById("btnCancel");
const statusMessage = document.getElementById("statusMessage");

// Category Modal Elements
const createModalOverlay = document.getElementById("create-category-modal-overlay");
const createModalBox = document.getElementById("create-category-modal-box");
const newCategoryNameInput = document.getElementById("newCategoryName");
const createCategoryError = document.getElementById("createCategoryError");
const createCategoryCancel = document.getElementById("createCategoryCancel");
const createCategorySubmit = document.getElementById("createCategorySubmit");

// ============================================================
// State
// ============================================================
let currentUser = null;
let allCategories = [];
let currentTaskCategoryId = "";
let unsubscribeCategories = null;

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
  } else if (digits.length === 3) {
    let h = Math.min(23, parseInt(digits.slice(0, 1), 10));
    let m = Math.min(59, parseInt(digits.slice(1, 3), 10));
    dueTimeInput.value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  } else if (digits.length >= 1 && digits.length <= 2) {
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
// 5.5 カテゴリー関連ロジック
// ============================================================

async function getOrCreateUnsetCategory(uid) {
  const existing = allCategories.find(c => c.name === "未設定");
  if (existing) return existing.id;

  try {
    const categoriesRef = collection(db, "categories");
    const q = query(categoriesRef, where("userId", "==", uid), where("name", "==", "未設定"));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs[0].id;
    }

    const newCatRef = doc(categoriesRef);
    await setDoc(newCatRef, {
      categoryId: newCatRef.id,
      userId: uid,
      name: "未設定",
      createdAt: serverTimestamp()
    });
    return newCatRef.id;
  } catch (err) {
    console.error("未設定カテゴリーの取得/作成エラー:", err);
    return null;
  }
}

function populateCategorySelect(selectedId = "") {
  if (!taskCategorySelect) return;
  const currentVal = selectedId || currentTaskCategoryId || taskCategorySelect.value || "";

  const unsetCat = allCategories.find(c => c.name === "未設定");
  const unsetValue = unsetCat ? unsetCat.id : "";

  taskCategorySelect.innerHTML = `<option value="${unsetValue}">未設定</option>`;

  allCategories.forEach(cat => {
    if (cat.name === "未設定") return;
    const opt = document.createElement("option");
    opt.value = cat.id;
    opt.textContent = cat.name;
    if (cat.id === currentVal) opt.selected = true;
    taskCategorySelect.appendChild(opt);
  });

  if (!currentVal || currentVal === unsetValue || !allCategories.some(c => c.id === currentVal)) {
    taskCategorySelect.value = unsetValue;
  } else {
    taskCategorySelect.value = currentVal;
  }
}

taskCategorySelect?.addEventListener("change", (e) => {
  currentTaskCategoryId = e.target.value;
});

function subscribeToCategories(uid) {
  try {
    const categoriesRef = collection(db, "categories");
    const q = query(categoriesRef, where("userId", "==", uid), orderBy("createdAt", "asc"));
    unsubscribeCategories = onSnapshot(q, (snapshot) => {
      allCategories = [];
      snapshot.forEach(docSnap => {
        allCategories.push({ id: docSnap.id, ...docSnap.data() });
      });
      populateCategorySelect();
    }, (error) => {
      console.error("カテゴリー取得エラー:", error);
    });
  } catch (error) {
    console.error("カテゴリークエリエラー:", error);
  }
}

function openCreateModal() {
  if (!createModalOverlay) return;
  if (newCategoryNameInput) newCategoryNameInput.value = "";
  hideCategoryError();
  createModalOverlay.classList.remove("opacity-0", "pointer-events-none");
  if (createModalBox) {
    createModalBox.classList.remove("scale-95");
    createModalBox.classList.add("scale-100");
  }
  setTimeout(() => newCategoryNameInput?.focus(), 100);
}

function closeCreateModal() {
  if (!createModalOverlay) return;
  createModalOverlay.classList.add("opacity-0", "pointer-events-none");
  if (createModalBox) {
    createModalBox.classList.remove("scale-100");
    createModalBox.classList.add("scale-95");
  }
}

function showCategoryError(message) {
  if (!createCategoryError) return;
  createCategoryError.textContent = message;
  createCategoryError.classList.remove("hidden");
}

function hideCategoryError() {
  if (!createCategoryError) return;
  createCategoryError.textContent = "";
  createCategoryError.classList.add("hidden");
}

async function handleCreateCategory() {
  const name = newCategoryNameInput?.value.trim() || "";
  if (!name) {
    showCategoryError("カテゴリー名を入力してください。");
    return;
  }
  if (name === "未設定") {
    showCategoryError("「未設定」は作成できません。");
    return;
  }
  if (name.length > 30) {
    showCategoryError("カテゴリー名は30文字以内で入力してください。");
    return;
  }
  const isDuplicate = allCategories.some(
    cat => cat.name.toLowerCase() === name.toLowerCase()
  );
  if (isDuplicate) {
    showCategoryError("同じ名前のカテゴリーがすでに存在します。");
    return;
  }
  if (!currentUser) return;

  try {
    createCategorySubmit.disabled = true;
    createCategorySubmit.textContent = "作成中...";

    const categoriesRef = collection(db, "categories");
    const newDocRef = doc(categoriesRef);
    const newCatId = newDocRef.id;
    await setDoc(newDocRef, {
      categoryId: newCatId,
      userId: currentUser.uid,
      name: name,
      createdAt: serverTimestamp()
    });

    currentTaskCategoryId = newCatId;
    closeCreateModal();
  } catch (err) {
    console.error("カテゴリー作成エラー:", err);
    showCategoryError("保存に失敗しました。");
  } finally {
    createCategorySubmit.disabled = false;
    createCategorySubmit.textContent = "作成";
  }
}

addNewCategoryBtn?.addEventListener("click", openCreateModal);
createModalOverlay?.addEventListener("click", (e) => {
  if (e.target === createModalOverlay) closeCreateModal();
});
createModalBox?.addEventListener("click", (e) => e.stopPropagation());
createModalOverlay?.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeCreateModal();
});
createCategoryCancel?.addEventListener("click", closeCreateModal);
createCategorySubmit?.addEventListener("click", handleCreateCategory);
newCategoryNameInput?.addEventListener("input", hideCategoryError);
newCategoryNameInput?.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") { e.preventDefault(); await handleCreateCategory(); }
});

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

    // 4. カテゴリー
    currentTaskCategoryId = data.categoryId || "";
    populateCategorySelect(currentTaskCategoryId);
  } catch (err) {
    console.error("タスク読み込みエラー:", err);
    showStatus("タスクの読み込みに失敗しました。", "error");
  }
}

// ============================================================
// 9. タスク更新処理
// ============================================================
async function updateTask(taskId, updateData) {
  const taskRef = doc(db, "tasks", taskId);
  await updateDoc(taskRef, updateData);
}

// ============================================================
// 10. バリデーション
// ============================================================
function validateForm() {
  let valid = true;
  if (!taskNameInput.value.trim()) {
    showInputError(taskNameError, "タスク名を入力してください。");
    valid = false;
  }
  if (!taskContentInput?.value.trim()) {
    showInputError(taskContentError, "内容を入力してください。");
    valid = false;
  }
  const priorityVal = parseInt(priorityInput?.value || "0", 10);
  if (!priorityVal) {
    showInputError(priorityError, "重要度を選択してください。");
    valid = false;
  }
  const dateVal = dueDateInput?.value || "";
  const timeVal = dueTimeInput?.value.trim() || "";
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (!dateVal) {
    showInputError(dueDateError, "期日の日付を設定してください。");
    valid = false;
  } else if (!timeVal || !timeRegex.test(timeVal)) {
    showInputError(dueDateError, "有効な時間（例: 14:00）を半角で入力してください。");
    valid = false;
  }
  return valid;
}

taskNameInput?.addEventListener("input", () => {
  if (taskNameInput.value.trim()) hideInputError(taskNameError);
});

// ============================================================
// 11. フォーム送信 → updateTask を呼び出して Firestore を更新
// ============================================================
editForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validateForm()) return;
  if (!taskDocId) { showStatus("タスクIDが指定されていません。", "error"); return; }
  if (!currentUser) { showStatus("ログインが必要です。", "error"); return; }

  btnSave.disabled = true;
  btnSaveText.textContent = "保存中...";

  try {
    let finalCategoryId = taskCategorySelect?.value || "";
    const unsetCat = allCategories.find(c => c.name === "未設定");
    const unsetValue = unsetCat ? unsetCat.id : "";

    // カテゴリーが未設定または空の場合、未設定カテゴリーIDを取得/作成
    if (!finalCategoryId || finalCategoryId === unsetValue) {
      finalCategoryId = await getOrCreateUnsetCategory(currentUser.uid);
    }

    await updateTask(taskDocId, {
      title: taskNameInput.value.trim(),
      description: taskContentInput.value.trim(),
      priority: parseInt(priorityInput?.value || "0", 10),
      dueDate: (() => {
        const dateVal = dueDateInput?.value || "";
        let timeVal = dueTimeInput?.value.trim() || "";
        if (!dateVal || !timeVal) return null;
        const [year, month, day] = dateVal.split("-").map(Number);
        const [hour, minute] = timeVal.split(":").map(Number);
        return Timestamp.fromDate(new Date(year, month - 1, day, hour, minute, 0, 0));
      })(),
      categoryId: finalCategoryId
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
// 12. キャンセルボタン → 前の画面に戻る
// ============================================================
btnCancel?.addEventListener("click", () => {
  window.location.href = "main.html";
});

// ============================================================
// 13. 認証確認 → ログインしていなければログイン画面へ
// ============================================================
onAuthStateChanged(auth, (user) => {
  if (unsubscribeCategories) {
    unsubscribeCategories();
    unsubscribeCategories = null;
  }

  currentUser = user;

  if (!user) {
    window.location.href = "login.html";
  } else {
    subscribeToCategories(user.uid);
    loadTask();
  }
});

