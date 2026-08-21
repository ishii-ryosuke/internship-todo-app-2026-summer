// ============================================================
// taskedit.js – タスク編集画面ロジック
//
// Firestore tasks コレクション構造:
//   taskId      : string  (ドキュメントID)
//   title       : string  (タスク名)
//   description : string  (タスク内容)
//   categoryId  : string  (カテゴリーID)
//   isCompleted : boolean (完了フラグ)
//   createdAt   : Timestamp (作成日時)
//   userId      : string  (所有ユーザーID)
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
  serverTimestamp
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
// 3. ステータスメッセージ表示
// ============================================================
function showStatus(message, type = "success") {
  statusMessage.textContent = message;
  statusMessage.className = `px-4 py-3 rounded-lg text-sm font-medium text-center ${type}`;
  statusMessage.classList.remove("hidden");
  setTimeout(() => statusMessage.classList.add("hidden"), 4000);
}

// ============================================================
// 4. 「未設定」カテゴリーの取得・自動作成ヘルパー
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

// ============================================================
// 5. カテゴリーセレクトの描画
// ============================================================
function populateCategorySelect(selectedId = "") {
  if (!taskCategorySelect) return;

  const targetId = selectedId || currentTaskCategoryId || taskCategorySelect.value || "";

  // 未設定カテゴリーを探す
  const unsetCat = allCategories.find(c => c.name === "未設定");
  const unsetValue = unsetCat ? unsetCat.id : "";

  taskCategorySelect.innerHTML = `<option value="${unsetValue}">未設定</option>`;

  allCategories.forEach(cat => {
    if (cat.name === "未設定") return; // 「未設定」は先頭に固定
    const opt = document.createElement("option");
    opt.value = cat.id;
    opt.textContent = cat.name;
    if (cat.id === targetId) opt.selected = true;
    taskCategorySelect.appendChild(opt);
  });

  // もし選択中が未設定（未設定IDまたは空文字、あるいは該当なし）の場合
  if (!targetId || targetId === unsetValue || !allCategories.some(c => c.id === targetId)) {
    taskCategorySelect.value = unsetValue;
  } else {
    taskCategorySelect.value = targetId;
  }
}

taskCategorySelect?.addEventListener("change", (e) => {
  currentTaskCategoryId = e.target.value;
});

// ============================================================
// 6. カテゴリー一覧の購読
// ============================================================
function subscribeToCategories(uid) {
  try {
    const categoriesRef = collection(db, "categories");
    const q = query(categoriesRef, where("userId", "==", uid), orderBy("createdAt", "asc"));
    unsubscribeCategories = onSnapshot(q, (snapshot) => {
      allCategories = [];
      snapshot.forEach(docSnap => {
        allCategories.push({ id: docSnap.id, ...docSnap.data() });
      });
      populateCategorySelect(currentTaskCategoryId);
    }, (error) => {
      console.error("カテゴリー取得エラー:", error);
    });
  } catch (error) {
    console.error("カテゴリークエリエラー:", error);
  }
}

// ============================================================
// 7. カテゴリー作成モーダル
// ============================================================
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
// 8. タスクデータをFirestoreから読み込みフォームに反映
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
    currentTaskCategoryId = data.categoryId || "";

    populateCategorySelect(currentTaskCategoryId);
  } catch (err) {
    console.error("タスク読み込みエラー:", err);
    showStatus("タスクの読み込みに失敗しました。", "error");
  }
}

// ============================================================
// 9. バリデーション
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
// 10. タスク更新処理
// ============================================================
async function updateTask(taskId, { title, description, categoryId }) {
  const taskRef = doc(db, "tasks", taskId);
  await updateDoc(taskRef, {
    title: title,
    description: description,
    categoryId: categoryId
  });
}

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
      categoryId: finalCategoryId
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
