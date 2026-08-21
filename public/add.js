// ==========================================================================
// Task Creation Logic (add.js)
// ==========================================================================
import { auth, db } from "./firebase-config.js";
import { 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { 
  collection, 
  doc, 
  setDoc, 
  serverTimestamp,
  query,
  where,
  onSnapshot,
  orderBy,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// DOM Elements
const taskForm = document.getElementById("task-form");
const taskNameInput = document.getElementById("task-name");
const taskDescInput = document.getElementById("task-desc");
const taskNameError = document.getElementById("task-name-error");
const taskDescError = document.getElementById("task-desc-error");
const generalError = document.getElementById("general-error");
const cancelBtn = document.getElementById("cancel-btn");
const addTaskBtn = document.getElementById("add-task-btn");
const addTaskBtnText = document.getElementById("add-task-btn-text");

// Category DOM Elements
const taskCategorySelect = document.getElementById("task-category");
const addNewCategoryBtn = document.getElementById("add-new-category-btn");
const createModalOverlay = document.getElementById("create-category-modal-overlay");
const createModalBox = document.getElementById("create-category-modal-box");
const newCategoryNameInput = document.getElementById("new-category-name");
const createCategoryError = document.getElementById("create-category-error");
const createCategoryCancel = document.getElementById("create-category-cancel");
const createCategorySubmit = document.getElementById("create-category-submit");

// Authentication State
let currentUser = null;

// Category State
let allCategories = [];
let selectedCategoryId = "";
let unsubscribeCategories = null;

// Track user authentication state
onAuthStateChanged(auth, (user) => {
  if (unsubscribeCategories) {
    unsubscribeCategories();
    unsubscribeCategories = null;
  }

  currentUser = user;
  if (user) {
    hideGeneralError();
    // Subscribe to categories
    subscribeToCategories(user.uid);
  }
});

/**
 * Show error message for a specific input field
 * @param {HTMLElement} errorElement 
 * @param {string} message 
 */
function showInputError(errorElement, message) {
  if (!errorElement) return;
  errorElement.textContent = message;
  errorElement.classList.remove("hidden");
}

/**
 * Hide error message for a specific input field
 * @param {HTMLElement} errorElement 
 */
function hideInputError(errorElement) {
  if (!errorElement) return;
  errorElement.textContent = "";
  errorElement.classList.add("hidden");
}

/**
 * Show general error or notification box
 * @param {string} htmlMessage 
 */
function showGeneralError(htmlMessage) {
  if (!generalError) return;
  generalError.innerHTML = htmlMessage;
  generalError.classList.remove("hidden");
}

/**
 * Hide general error box
 */
function hideGeneralError() {
  if (!generalError) return;
  generalError.innerHTML = "";
  generalError.classList.add("hidden");
}

// Clear individual errors on user input
taskNameInput?.addEventListener("input", () => {
  hideInputError(taskNameError);
  hideGeneralError();
});

taskDescInput?.addEventListener("input", () => {
  hideInputError(taskDescError);
  hideGeneralError();
});

// Cancel button click -> Navigate back to main.html
cancelBtn?.addEventListener("click", () => {
  window.location.href = "main.html";
});

// ============================================================
// カテゴリー関連ロジック
// ============================================================

/**
 * 「未設定」カテゴリーの取得・自動作成ヘルパー
 */
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

/**
 * Populate category select dropdown
 */
function populateCategorySelect(selectedId = "") {
  if (!taskCategorySelect) return;
  const currentVal = selectedId || selectedCategoryId || taskCategorySelect.value || "";

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
  selectedCategoryId = e.target.value;
});

/**
 * Subscribe to categories Firestore realtime
 */
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

// カテゴリー作成モーダルの制御
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

// Create new category in Firestore
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

    selectedCategoryId = newCatId;
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

/**
 * Set loading state on submit button
 * @param {boolean} isLoading 
 */
function setLoading(isLoading) {
  if (!addTaskBtn) return;
  addTaskBtn.disabled = isLoading;
  if (isLoading) {
    if (addTaskBtnText) addTaskBtnText.textContent = "追加中...";
  } else {
    if (addTaskBtnText) addTaskBtnText.textContent = "追加";
  }
}

// Form Submit Handler
taskForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideInputError(taskNameError);
  hideInputError(taskDescError);
  hideGeneralError();

  const title = taskNameInput?.value.trim() || "";
  const description = taskDescInput?.value.trim() || "";

  let hasError = false;

  // 1. Validation: Task Name
  if (!title) {
    showInputError(taskNameError, "タスク名を入力してください。");
    hasError = true;
  }

  // 2. Validation: Task Description
  if (!description) {
    showInputError(taskDescError, "タスク内容を入力してください。");
    hasError = true;
  }

  if (hasError) {
    return;
  }

  // 3. Authentication Check
  if (!currentUser) {
    showGeneralError("タスクを追加するにはログインが必要です。<a href='login.html' class='underline font-bold ml-1 text-[#426AB3]'>ログインはこちら</a>");
    return;
  }

  // 4. Save Task to Firestore
  try {
    setLoading(true);

    let categoryId = taskCategorySelect?.value || "";
    const unsetCat = allCategories.find(c => c.name === "未設定");
    const unsetValue = unsetCat ? unsetCat.id : "";

    // カテゴリーが未設定または空の場合、未設定カテゴリーIDを取得/作成して割り当て
    if (!categoryId || categoryId === unsetValue) {
      categoryId = await getOrCreateUnsetCategory(currentUser.uid);
    }

    // Create a new document reference with an auto-generated ID in the root 'tasks' collection
    const tasksCollectionRef = collection(db, "tasks");
    const newTaskDocRef = doc(tasksCollectionRef);
    const taskId = newTaskDocRef.id;

    // Document data structure
    const taskData = {
      taskId: taskId,
      userId: currentUser.uid,
      title: title,
      description: description,
      categoryId: categoryId,
      isCompleted: false,
      createdAt: serverTimestamp()
    };

    await setDoc(newTaskDocRef, taskData);

    // 5. Navigate to task list (main.html) upon success
    window.location.href = "main.html";
  } catch (error) {
    console.error("タスクの追加に失敗しました:", error);
    showGeneralError(`タスクの保存中にエラーが発生しました: ${error.message || "通信エラー"}`);
    setLoading(false);
  }
});
