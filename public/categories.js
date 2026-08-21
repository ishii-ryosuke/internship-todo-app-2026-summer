// ==========================================================================
// Category List Logic (categories.js)
// ==========================================================================
import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  getDocs,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ============================================================
// DOM References
// ============================================================
const categoryListContainer = document.getElementById("category-list");
const categoryLoading = document.getElementById("category-loading");
const addCategoryBtn = document.getElementById("add-category-btn");

// Create Category Modal
const createModalOverlay = document.getElementById("create-category-modal-overlay");
const createModalBox = document.getElementById("create-category-modal-box");
const newCategoryNameInput = document.getElementById("new-category-name");
const createCategoryError = document.getElementById("create-category-error");
const createCategoryCancel = document.getElementById("create-category-cancel");
const createCategorySubmit = document.getElementById("create-category-submit");

// Delete Category Modal
const deleteModalOverlay = document.getElementById("delete-category-modal-overlay");
const deleteModalBox = document.getElementById("delete-category-modal-box");
const deleteCategoryTitle = document.getElementById("delete-category-title");
const deleteCategoryYes = document.getElementById("delete-category-yes");
const deleteCategoryNo = document.getElementById("delete-category-no");

// ============================================================
// State
// ============================================================
let currentUser = null;
let allCategories = [];
let categoryToDeleteId = null;
let categoryToDeleteName = "";
let unsubscribeCategories = null;

// ============================================================
// Helper: escape HTML
// ============================================================
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ============================================================
// Render Category List
// ============================================================
function renderCategories(categories) {
  if (!categoryListContainer) return;

  // Remove loading state
  if (categoryLoading) categoryLoading.remove();

  // Remove existing category items (keep non-loading elements)
  categoryListContainer.querySelectorAll(".category-item").forEach(el => el.remove());

  if (categories.length === 0) {
    categoryListContainer.innerHTML = `
      <div class="w-full bg-[#fffde7]/80 border-2 border-dashed border-[#a0d8ef] rounded-3xl p-10 flex flex-col items-center justify-center text-center gap-3 shadow-sm">
        <span class="material-symbols-outlined text-[52px] text-[#0000ff]/60">label_off</span>
        <p class="font-label-bold text-base text-[#454558]">カテゴリーがまだありません</p>
        <p class="font-body-md text-xs text-[#757589] max-w-xs">
          下の「カテゴリーを追加」ボタンから新しいカテゴリーを作成してみましょう！
        </p>
      </div>
    `;
    return;
  }

  // Clear and rebuild list
  categoryListContainer.innerHTML = "";
  categories.forEach(cat => {
    const item = document.createElement("div");
    item.className = "category-item w-full bg-[#fffde7] rounded-3xl border border-[#a0d8ef] px-5 py-4 flex items-center justify-between group shadow-sm transition-all hover:shadow-md";
    item.dataset.categoryId = cat.id;

    const isUnset = cat.name === "未設定";

    item.innerHTML = `
      <div class="flex items-center gap-3 min-w-0">
        <span class="material-symbols-outlined text-[#0000ff] flex-shrink-0" style="font-size: 20px;">label</span>
        <span class="font-body-md text-on-surface font-medium break-words">${escapeHtml(cat.name)}</span>
        ${isUnset ? '<span class="text-xs text-[#757589] ml-1">(削除不可)</span>' : ''}
      </div>
      ${isUnset ? '' : `
      <button
        type="button"
        class="category-delete-btn flex items-center justify-center text-[#ba1a1a] hover:bg-[#ffdad6] rounded-full p-2 transition-colors flex-shrink-0 cursor-pointer"
        data-id="${escapeHtml(cat.id)}"
        data-name="${escapeHtml(cat.name)}"
        aria-label="「${escapeHtml(cat.name)}」を削除"
      >
        <span class="material-symbols-outlined text-[22px]">delete</span>
      </button>
      `}
    `;
    categoryListContainer.appendChild(item);
  });

  // Attach delete button listeners
  categoryListContainer.querySelectorAll(".category-delete-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const name = btn.getAttribute("data-name");
      showDeleteModal(id, name);
    });
  });
}

// ============================================================
// Create Category Modal
// ============================================================
function openCreateModal() {
  if (!createModalOverlay) return;
  newCategoryNameInput.value = "";
  hideCategoryError();
  createModalOverlay.classList.remove("opacity-0", "pointer-events-none");
  createModalBox.classList.remove("scale-95");
  createModalBox.classList.add("scale-100");
  setTimeout(() => newCategoryNameInput.focus(), 100);
}

function closeCreateModal() {
  if (!createModalOverlay) return;
  createModalOverlay.classList.add("opacity-0", "pointer-events-none");
  createModalBox.classList.remove("scale-100");
  createModalBox.classList.add("scale-95");
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

addCategoryBtn?.addEventListener("click", openCreateModal);
createCategoryCancel?.addEventListener("click", closeCreateModal);

// Close create modal on backdrop click
createModalOverlay?.addEventListener("click", (e) => {
  if (e.target === createModalOverlay) closeCreateModal();
});

newCategoryNameInput?.addEventListener("input", hideCategoryError);

// Submit: create category
createCategorySubmit?.addEventListener("click", async () => {
  await handleCreateCategory();
});

newCategoryNameInput?.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    await handleCreateCategory();
  }
});

async function handleCreateCategory() {
  const name = newCategoryNameInput?.value.trim() || "";

  // Validation
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

  // Duplicate check
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
    await setDoc(newDocRef, {
      categoryId: newDocRef.id,
      userId: currentUser.uid,
      name: name,
      createdAt: serverTimestamp()
    });

    closeCreateModal();
  } catch (err) {
    console.error("カテゴリー作成エラー:", err);
    showCategoryError("作成に失敗しました。もう一度お試しください。");
  } finally {
    createCategorySubmit.disabled = false;
    createCategorySubmit.textContent = "作成";
  }
}

// ============================================================
// Delete Category Modal
// ============================================================
function showDeleteModal(id, name) {
  categoryToDeleteId = id;
  categoryToDeleteName = name;
  if (deleteCategoryTitle) {
    deleteCategoryTitle.textContent = `「${name}」を削除しますか？`;
  }
  deleteModalOverlay.classList.remove("opacity-0", "pointer-events-none");
  deleteModalBox.classList.remove("scale-95");
  deleteModalBox.classList.add("scale-100");
}

function hideDeleteModal() {
  categoryToDeleteId = null;
  categoryToDeleteName = "";
  deleteModalOverlay.classList.add("opacity-0", "pointer-events-none");
  deleteModalBox.classList.remove("scale-100");
  deleteModalBox.classList.add("scale-95");
}

deleteCategoryNo?.addEventListener("click", hideDeleteModal);

// Close delete modal on backdrop click
deleteModalOverlay?.addEventListener("click", (e) => {
  if (e.target === deleteModalOverlay) hideDeleteModal();
});

deleteCategoryYes?.addEventListener("click", async () => {
  if (!categoryToDeleteId || !currentUser) return;

  try {
    deleteCategoryYes.disabled = true;

    // 1. Delete the category document from Firestore
    const categoryRef = doc(db, "categories", categoryToDeleteId);
    await deleteDoc(categoryRef);

    // 2. Find tasks that reference this category and clear their categoryId
    const tasksRef = collection(db, "tasks");
    const q = query(
      tasksRef,
      where("userId", "==", currentUser.uid),
      where("categoryId", "==", categoryToDeleteId)
    );
    const tasksSnap = await getDocs(q);

    const updatePromises = [];
    tasksSnap.forEach(taskDoc => {
      updatePromises.push(
        updateDoc(doc(db, "tasks", taskDoc.id), { categoryId: null })
      );
    });
    await Promise.all(updatePromises);

    hideDeleteModal();
  } catch (err) {
    console.error("カテゴリー削除エラー:", err);
    alert("削除に失敗しました。もう一度お試しください。");
  } finally {
    deleteCategoryYes.disabled = false;
  }
});

// ============================================================
// Authentication & Firestore Listener
// ============================================================
onAuthStateChanged(auth, (user) => {
  if (unsubscribeCategories) {
    unsubscribeCategories();
    unsubscribeCategories = null;
  }

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  // Subscribe to categories for this user, ordered by createdAt
  try {
    const categoriesRef = collection(db, "categories");
    const q = query(
      categoriesRef,
      where("userId", "==", user.uid),
      orderBy("createdAt", "asc")
    );

    unsubscribeCategories = onSnapshot(q, (snapshot) => {
      allCategories = [];
      snapshot.forEach(docSnap => {
        allCategories.push({ id: docSnap.id, ...docSnap.data() });
      });
      renderCategories(allCategories);
    }, (error) => {
      console.error("カテゴリー取得エラー:", error);
    });
  } catch (error) {
    console.error("クエリ実行エラー:", error);
  }
});
