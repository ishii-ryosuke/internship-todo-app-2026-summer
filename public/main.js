// ==========================================================================
// Task List Display Logic (main.js)
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
  updateDoc,
  deleteDoc,
  serverTimestamp,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const taskListContainer = document.getElementById("task-list");

// ============================================================
// フィルター状態管理
// 'incomplete' | 'completed' | 'all'
// デフォルト：未完了（incomplete）
// ============================================================
let currentFilter = "incomplete";
let allTasks = [];
let searchQuery = "";
let selectedCategories = [];
let selectedPriorities = [];

// ============================================================
// カテゴリーマップ（categoryId -> categoryName）
// ============================================================
let categoryMap = {}; // { [categoryId]: name }
let unsubscribeCategories = null;

const filterBtn = document.getElementById("filter-btn");
const filterLabel = document.getElementById("filter-label");
const filterChevron = document.getElementById("filter-chevron");
const filterDropdown = document.getElementById("filter-dropdown");

const FILTER_LABELS = {
  incomplete: "未完了",
  completed: "完了済み",
  all: "すべて表示"
};

/** フィルター条件に応じてタスクを絞り込む */
function applyFilter(tasks) {
  let filtered = tasks;

  if (searchQuery.trim() !== "") {
    // 検索中はステータスによる絞り込みを無視し、全件から検索（「すべて表示」強制）
    const q = searchQuery.toLowerCase();
    tasks = tasks.filter(t => {
      const titleMatch = t.title && t.title.toLowerCase().includes(q);
      const descMatch = t.description && t.description.toLowerCase().includes(q);
      return titleMatch || descMatch;
    });
  } else {
    // 検索していない時のみステータス絞り込みを適用
    if (currentFilter === "incomplete") {
      tasks = tasks.filter((t) => t.isCompleted === false);
    } else if (currentFilter === "completed") {
      tasks = tasks.filter((t) => t.isCompleted === true);
    }
  }

  // カテゴリ（OR）
  if (selectedCategories.length > 0) {
    tasks = tasks.filter(t => {
      const cName = t.categoryId && categoryMap[t.categoryId] ? categoryMap[t.categoryId] : null;
      return cName && selectedCategories.includes(cName);
    });
  }

  // 重要度（OR）
  if (selectedPriorities.length > 0) {
    // 優先度は数値または文字列で比較
    tasks = tasks.filter(t => t.priority && selectedPriorities.includes(String(t.priority)));
  }

  return tasks;
}
// Delete modal elements
const deleteModalOverlay = document.getElementById("delete-modal-overlay");
const deleteModalBox = document.getElementById("delete-modal-box");
const deleteModalTitle = document.getElementById("delete-modal-title");
const deleteModalDesc = document.getElementById("delete-modal-desc");
const deleteModalYes = document.getElementById("delete-modal-yes");
const deleteModalNo = document.getElementById("delete-modal-no");
let taskToDeleteId = null;

// Task Detail modal elements
const taskDetailOverlay = document.getElementById("task-detail-overlay");
const taskDetailBox = document.getElementById("task-detail-box");
const taskDetailTitle = document.getElementById("task-detail-title");
const taskDetailDeadline = document.getElementById("task-detail-deadline");
const taskDetailDesc = document.getElementById("task-detail-desc");
const taskDetailCloseX = document.getElementById("task-detail-close-x");
const taskDetailCloseBtn = document.getElementById("task-detail-close-btn");

// Helper function to safely escape HTML
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Render the loading state
 */
function renderLoading() {
  if (!taskListContainer) return;
  taskListContainer.innerHTML = `
    <div class="w-full flex flex-col items-center justify-center py-16 text-[#757589] gap-3">
      <span class="material-symbols-outlined animate-spin text-[36px] text-[#0000ff]">progress_activity</span>
      <p class="font-body-md text-sm font-medium">タスクを読み込み中...</p>
    </div>
  `;
}

/**
 * Render empty state when there are no tasks
 */
function renderEmpty() {
  if (!taskListContainer) return;
  taskListContainer.innerHTML = `
    <div class="w-full bg-[#fffde7]/80 border-2 border-dashed border-[#a0d8ef] rounded-3xl p-10 flex flex-col items-center justify-center text-center gap-3 shadow-sm">
      <span class="material-symbols-outlined text-[52px] text-[#0000ff]/60">task_alt</span>
      <p class="font-label-bold text-base text-[#454558]">タスクがまだありません</p>
      <p class="font-body-md text-xs text-[#757589] max-w-xs">
        右下の「＋」ボタンを押して、新しいタスクを追加してみましょう！
      </p>
    </div>
  `;
}

/**
 * Render error state
 * @param {string} message 
 */
function renderError(message) {
  if (!taskListContainer) return;
  taskListContainer.innerHTML = `
    <div class="w-full bg-[#ffdad6] text-[#ba1a1a] rounded-2xl p-6 text-center text-sm font-medium">
      <p>タスクの取得中にエラーが発生しました。</p>
      <p class="text-xs mt-1 text-[#ba1a1a]/80">${escapeHtml(message)}</p>
    </div>
  `;
}

/**
 * Render star rating for priority (1-3)
 * @param {number|string} priority 
 * @param {boolean} [isOverdue=false]
 */
function renderStars(priority, isOverdue = false) {
  const p = parseInt(priority, 10) || 0;
  if (p <= 0) return "";
  let starsHtml = "";
  for (let i = 1; i <= 3; i++) {
    if (i <= p) {
      starsHtml += `<span class="material-symbols-outlined text-[#FFC107] text-[16px] icon-filled" style="font-variation-settings: 'FILL' 1;">star</span>`;
    } else {
      starsHtml += `<span class="material-symbols-outlined ${isOverdue ? 'text-white/50' : 'text-[#d1d5db]'} text-[16px]">star</span>`;
    }
  }
  return `
    <div class="flex items-center gap-1 text-xs ${isOverdue ? 'text-white' : 'text-[#454558]'}">
      <span class="font-medium">重要度:</span>
      <div class="flex items-center gap-0.5" title="重要度: ${p}">${starsHtml}</div>
    </div>
  `;
}

/**
 * Parse dueDate (Firestore Timestamp / {seconds} object / string) into ms.
 * Returns null for null / undefined / empty / invalid — never throws.
 * @param {*} dueDate
 * @returns {number|null}
 */
function parseDueDateToTimestamp(dueDate) {
  if (dueDate === null || dueDate === undefined || dueDate === "") return null;

  // Firestore Timestamp (has toMillis method)
  if (typeof dueDate === "object" && typeof dueDate.toMillis === "function") {
    const ms = dueDate.toMillis();
    return isNaN(ms) ? null : ms;
  }

  // Plain object with seconds (e.g. { seconds: 1234, nanoseconds: 0 })
  if (typeof dueDate === "object" && typeof dueDate.seconds === "number") {
    return dueDate.seconds * 1000;
  }

  // String handling
  if (typeof dueDate === "string") {
    const str = dueDate.trim();
    if (!str) return null;
    const parts = str.split(/[\sT]+/);
    const dateSplit = (parts[0] || "").split("-").map(Number);
    const year = dateSplit[0]; const month = dateSplit[1]; const day = dateSplit[2];
    if (!year || !month || !day) return null;
    const timeSplit = (parts[1] || "23:59").split(":").map(Number);
    const dateObj = new Date(year, month - 1, day, timeSplit[0] || 0, timeSplit[1] || 0, 0, 0);
    const time = dateObj.getTime();
    return isNaN(time) ? null : time;
  }

  return null;
}

/**
 * Determine display category for sorting:
 * 1: ピン留め | 2: 期限切れ | 3: 期限が近い | 4: 期日なし
 */
function getTaskCategory(task, nowTime) {
  if (task.isPinned) return 1;
  const dueTime = parseDueDateToTimestamp(task.dueDate);
  if (dueTime === null) return 4;
  if (dueTime < nowTime) return 2;
  return 3;
}

/**
 * Compare tasks: ピン留め → 期限切れ → 期限が近い → 期日なし
 * 同カテゴリ内: dueDate近い順 → priority高い順 → createdAt新しい順
 */
function compareTasks(a, b, nowTime) {
  const catA = getTaskCategory(a, nowTime);
  const catB = getTaskCategory(b, nowTime);
  if (catA !== catB) return catA - catB;

  const dueTimeA = parseDueDateToTimestamp(a.dueDate);
  const dueTimeB = parseDueDateToTimestamp(b.dueDate);
  const priorityA = parseInt(a.priority, 10) || 0;
  const priorityB = parseInt(b.priority, 10) || 0;

  // dueDate に差がある場合
  if (dueTimeA !== null && dueTimeB !== null && dueTimeA !== dueTimeB) {
    return dueTimeA - dueTimeB;
  }

  // ピン留め内のフォールバック
  if (catA === 1) {
    if (priorityA !== priorityB) return priorityB - priorityA;
    const pA = a.pinnedAt?.toMillis ? a.pinnedAt.toMillis() : (a.pinnedAt?.seconds ? a.pinnedAt.seconds * 1000 : 0);
    const pB = b.pinnedAt?.toMillis ? b.pinnedAt.toMillis() : (b.pinnedAt?.seconds ? b.pinnedAt.seconds * 1000 : 0);
    if (pA !== pB) return pB - pA;
  }

  // priority
  if (priorityA !== priorityB) return priorityB - priorityA;

  // createdAt
  const createdA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
  const createdB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
  return createdB - createdA;
}

/**
 * Format dueDate for display as "M/D" (no leading zeros, no time).
 * Supports Firestore Timestamp, {seconds} plain object, JS Date, and string.
 * Never throws — returns "" for null/invalid values.
 * @param {*} dueDate
 * @returns {string}  e.g. "9/9", "12/25"
 */
function formatDueDate(dueDate) {
  if (dueDate === null || dueDate === undefined || dueDate === "") return "";

  let date = null;

  // Firestore Timestamp → toDate()
  if (typeof dueDate === "object" && typeof dueDate.toDate === "function") {
    try { date = dueDate.toDate(); } catch (_) { return ""; }
  }
  // Plain {seconds} object
  else if (typeof dueDate === "object" && typeof dueDate.seconds === "number") {
    date = new Date(dueDate.seconds * 1000);
  }
  // JS Date
  else if (dueDate instanceof Date) {
    date = dueDate;
  }
  // String fallback: parse to Date
  else if (typeof dueDate === "string") {
    const str = dueDate.trim().replace("T", " ");
    const parts = str.split(/[\s\-\/]+/);
    if (parts.length >= 3) {
      date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }
  }

  if (!date || isNaN(date.getTime())) return "";

  const month = date.getMonth() + 1; // 先頭0なし
  const day = date.getDate();        // 先頭0なし
  return `${month}/${day}`;
}

/**
 * Determine if a task is within today to 3 days later, excluding completed and overdue tasks.
 * Year/Month/Date comparison only (ignores time/hours).
 * @param {object} task
 * @returns {boolean}
 */
function isDeadlineWarning(task) {
  if (task.isCompleted) return false;
  if (!task.dueDate) return false;

  let dueDate = null;
  if (typeof task.dueDate.toDate === "function") {
    dueDate = task.dueDate.toDate();
  } else if (typeof task.dueDate === "object" && typeof task.dueDate.seconds === "number") {
    dueDate = new Date(task.dueDate.seconds * 1000);
  } else if (task.dueDate instanceof Date) {
    dueDate = task.dueDate;
  } else if (typeof task.dueDate === "string") {
    const str = task.dueDate.trim().replace("T", " ");
    const parts = str.split(/[\s\-\/]+/);
    if (parts.length >= 3) {
      dueDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }
  }

  if (!dueDate || isNaN(dueDate.getTime())) return false;

  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());

  const diffDays = Math.round((dueDateOnly.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));

  return diffDays >= 0 && diffDays <= 3;
}

/**
 * Render the task items
 * @param {Array} tasks 
 */
function renderTasks(tasks) {
  if (!taskListContainer) return;

  const filtered = applyFilter(tasks);

  if (filtered.length === 0) {
    renderEmpty();
    return;
  }

  taskListContainer.innerHTML = filtered.map((task) => {
    const isDone = Boolean(task.isCompleted);
    const categoryName = task.categoryId && categoryMap[task.categoryId] ? categoryMap[task.categoryId] : '';
    const formattedDate = formatDueDate(task.dueDate);

    const dueTime = parseDueDateToTimestamp(task.dueDate);
    // 今日の日付を0時にリセットして比較する（今日の期限はまだ過ぎていないとする場合）
    // または単純に Date.now() と比較する。既存に合わせて Date.now() にする。
    const isOverdue = dueTime !== null && dueTime < Date.now() && !isDone;
    const isWarning = isDeadlineWarning(task);

    let bgClass = "bg-[#fffde7]";
    let borderClass = "border-[#a0d8ef]";
    let textClass = "text-on-surface";
    let subTextClass = "text-[#454558]";
    let deadlineWarningClass = "";

    if (isOverdue) {
      bgClass = "bg-[#ba1a1a]"; // bg-error
      borderClass = "border-[#ba1a1a]";
      textClass = "text-white";
      subTextClass = "text-white/80";
    } else if (isWarning && !isDone) {
      deadlineWarningClass = "deadline-warning";
    }

    return `
      <div class="task-row w-full ${bgClass} rounded-3xl border ${borderClass} ${deadlineWarningClass} p-4 flex gap-4 group shadow-sm transition-all hover:shadow-md relative cursor-pointer" 
        data-task-id="${escapeHtml(task.id)}" 
        data-task-title="${escapeHtml(task.title)}" 
        data-task-desc="${escapeHtml(task.description || '')}" 
        data-task-deadline="${escapeHtml(formattedDate || '未設定')}"
        data-category="${escapeHtml(categoryName)}"
        data-priority="${escapeHtml(task.priority || '')}"
      >
        <!-- チェックボックス -->
        <div class="task-toggle-btn w-6 h-6 border-2 rounded-full flex items-center justify-center flex-shrink-0 transition-colors mt-1 ${isDone ? 'bg-[#426ab3] border-[#426ab3]' : 'bg-transparent border-[#a0d8ef]'}" data-id="${escapeHtml(task.id)}" data-completed="${isDone}">
          ${isDone ? '<span class="material-symbols-outlined text-[#ffffff] text-[18px] font-bold">check</span>' : ''}
        </div>
        
        <!-- タスク情報 (縦並び) -->
        <div class="flex-1 flex flex-col justify-start">
          <!-- 上段: カテゴリ -->
          ${categoryName ? `<span class="inline-block bg-[#a0d8ef]/20 text-[#426ab3] text-[10px] font-bold px-2 py-0.5 rounded-full self-start mb-1 border border-[#a0d8ef]/50">${escapeHtml(categoryName)}</span>` : ''}
          
          <!-- 中段: タイトル -->
          <span class="font-body-md text-[16px] ${textClass} leading-tight ${isDone ? 'line-through opacity-60' : ''}">${escapeHtml(task.title)}</span>
          
          <!-- 下段: 期限 + 重要度 -->
          <div class="flex items-center gap-3 mt-2 ${isOverdue ? 'opacity-100' : 'opacity-80'}">
            ${formattedDate ? `<div class="flex items-center gap-1 text-[12px] ${subTextClass}"><span class="material-symbols-outlined text-[14px]">calendar_today</span><span>${escapeHtml(formattedDate)}</span></div>` : ''}
            ${task.priority ? `<div class="flex items-center gap-0.5">${renderStars(task.priority, isOverdue)}</div>` : ''}
          </div>
        </div>

        <!-- オプションメニュー -->
        <button class="task-menu-btn ${isOverdue ? 'text-white hover:opacity-70' : 'text-[#a0d8ef] hover:opacity-70'} transition-opacity flex items-center justify-center p-2 self-start -mt-2 -mr-2" tabindex="0">
          <span class="material-symbols-outlined">more_vert</span>
        </button>
      </div>
    `;
  }).join("");

  // Attach event listeners to toggle buttons
  taskListContainer.querySelectorAll(".task-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const taskId = btn.getAttribute("data-id");
      const currentCompleted = btn.getAttribute("data-completed") === "true";

      if (!currentCompleted) {
        playCompletionEffect(btn);
      }

      try {
        const taskDocRef = doc(db, "tasks", taskId);
        await updateDoc(taskDocRef, {
          isCompleted: !currentCompleted
        });
      } catch (err) {
        console.error("タスクの更新に失敗しました:", err);
      }
    });
  });

  // Attach event listeners to delete buttons
  taskListContainer.querySelectorAll(".task-delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const menu = btn.closest('.task-dropdown-menu');
      if (menu) menu.classList.add('hidden');
      const taskId = btn.getAttribute("data-id");
      const taskTitle = btn.getAttribute("data-title");
      const taskDesc = btn.getAttribute("data-desc");
      showDeleteModal(taskTitle, taskDesc, taskId);
    });
  });

  // Attach event listeners to edit buttons
  taskListContainer.querySelectorAll(".task-edit-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const menu = btn.closest('.task-dropdown-menu');
      if (menu) menu.classList.add('hidden');
      const taskId = btn.getAttribute("data-id");
      window.location.href = `taskedit.html?docId=${encodeURIComponent(taskId)}`;
    });
  });

  // Attach event listeners to pin buttons
  taskListContainer.querySelectorAll(".task-pin-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const menu = btn.closest('.task-dropdown-menu');
      if (menu) menu.classList.add('hidden');
      const taskId = btn.getAttribute("data-id");
      const isPinned = btn.getAttribute("data-pinned") === "true";
      try {
        const taskDocRef = doc(db, "tasks", taskId);
        await updateDoc(taskDocRef, {
          isPinned: !isPinned,
          pinnedAt: !isPinned ? serverTimestamp() : null
        });
      } catch (err) {
        console.error("タスクのピン留めに失敗しました:", err);
      }
    });
  });

  // Attach event listeners to menu buttons
  taskListContainer.querySelectorAll(".task-menu-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      taskListContainer.querySelectorAll(".task-dropdown-menu").forEach(menu => {
        if (menu !== btn.nextElementSibling) {
          menu.classList.add("hidden");
        }
      });
      const dropdown = btn.nextElementSibling;
      if (dropdown) dropdown.classList.toggle("hidden");
    });
  });

  // Attach click handler to task rows for detail modal
  taskListContainer.querySelectorAll(".task-row").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest('.task-toggle-btn') || e.target.closest('.task-menu-btn')) return;

      const title = row.getAttribute("data-task-title") || '';
      const desc = row.getAttribute("data-task-desc") || '';
      const deadline = row.getAttribute("data-task-deadline") || '';
      const priority = row.getAttribute("data-priority") || '';
      const category = row.getAttribute("data-category") || '';
      showTaskDetailModal(title, desc, deadline, priority, category);
    });
  });
}

// Close menus when clicking outside
document.addEventListener("click", (e) => {
  if (!e.target.closest('.task-menu-container') && taskListContainer) {
    taskListContainer.querySelectorAll(".task-dropdown-menu").forEach(menu => {
      menu.classList.add("hidden");
    });
  }
});

// Delete Modal Logic
function showDeleteModal(title, desc, taskId) {
  if (!deleteModalOverlay) return;
  taskToDeleteId = taskId;
  deleteModalTitle.textContent = title;

  if (desc) {
    deleteModalDesc.textContent = desc;
    deleteModalDesc.style.display = 'block';
  } else {
    deleteModalDesc.style.display = 'none';
  }

  deleteModalOverlay.classList.remove("opacity-0", "pointer-events-none");
  deleteModalBox.classList.remove("scale-95");
}

function hideDeleteModal() {
  if (!deleteModalOverlay) return;
  taskToDeleteId = null;
  deleteModalOverlay.classList.add("opacity-0", "pointer-events-none");
  deleteModalBox.classList.add("scale-95");
}

if (deleteModalNo) {
  deleteModalNo.addEventListener("click", hideDeleteModal);
}
if (deleteModalYes) {
  deleteModalYes.addEventListener("click", async () => {
    if (!taskToDeleteId) return;
    try {
      const taskDocRef = doc(db, "tasks", taskToDeleteId);
      await updateDoc(taskDocRef, {
        isDeleted: true,
        deletedAt: serverTimestamp()
      });
      hideDeleteModal();
    } catch (err) {
      console.error("タスクの削除に失敗しました:", err);
      alert("削除に失敗しました。");
    }
  });
}

// Task Detail Modal Logic
function showTaskDetailModal(title, desc, deadline, priority, categoryName) {
  if (!taskDetailOverlay) return;
  taskDetailTitle.textContent = title;
  taskDetailDesc.textContent = desc || '（内容なし）';
  taskDetailDeadline.textContent = deadline || '（未設定）';

  // 重要度（stars）の表示
  const priorityEl = document.getElementById('task-detail-priority');
  if (priorityEl) {
    const p = parseInt(priority, 10) || 0;
    if (p > 0) {
      let starsHtml = '';
      for (let i = 1; i <= 3; i++) {
        if (i <= p) {
          starsHtml += `<span class="material-symbols-outlined text-[#FFC107] text-[20px]" style="font-variation-settings: 'FILL' 1;">star</span>`;
        } else {
          starsHtml += `<span class="material-symbols-outlined text-[#d1d5db] text-[20px]">star</span>`;
        }
      }
      priorityEl.innerHTML = starsHtml;
    } else {
      priorityEl.textContent = '（未設定）';
    }
  }

  // カテゴリーの表示
  const categoryEl = document.getElementById('task-detail-category');
  const categoryRow = document.getElementById('task-detail-category-row');
  if (categoryEl && categoryRow) {
    if (categoryName) {
      categoryEl.textContent = categoryName;
      categoryRow.classList.remove('hidden');
    } else {
      categoryRow.classList.add('hidden');
    }
  }

  taskDetailOverlay.classList.remove('opacity-0', 'pointer-events-none');
  taskDetailBox.classList.remove('scale-95');
  taskDetailBox.classList.add('scale-100');
}

function hideTaskDetailModal() {
  if (!taskDetailOverlay) return;
  taskDetailOverlay.classList.add('opacity-0', 'pointer-events-none');
  taskDetailBox.classList.remove('scale-100');
  taskDetailBox.classList.add('scale-95');
}

if (taskDetailCloseX) taskDetailCloseX.addEventListener('click', hideTaskDetailModal);
if (taskDetailCloseBtn) taskDetailCloseBtn.addEventListener('click', hideTaskDetailModal);
if (taskDetailOverlay) {
  taskDetailOverlay.addEventListener('click', (e) => {
    // Close only when clicking the backdrop, not the modal content
    if (e.target === taskDetailOverlay) hideTaskDetailModal();
  });
}

// Initial state
renderLoading();

// Search & Filter Modal Logic
const searchFab = document.getElementById("search-fab");
const filterModal = document.getElementById("filter-modal");
const filterModalBackdrop = document.getElementById("filter-modal-backdrop");
const filterModalCloseX = document.getElementById("filter-modal-close-x");
const searchInput = document.getElementById("search-input");

function openSearchModal() {
  if (filterModal) filterModal.classList.remove("hidden");
  if (searchInput) searchInput.focus();
}

function closeSearchModal() {
  if (filterModal) filterModal.classList.add("hidden");
}

if (searchFab) searchFab.addEventListener("click", openSearchModal);
if (filterModalBackdrop) filterModalBackdrop.addEventListener("click", closeSearchModal);
if (filterModalCloseX) filterModalCloseX.addEventListener("click", closeSearchModal);

const filterCategorySelect = document.getElementById("filter-category-select");
const filterCategoryActiveContainer = document.getElementById("filter-category-active-container");

// 全タスクから重複なしのカテゴリリストを抽出し、セレクトボックスを更新する
function updateCategoryOptions() {
  if (!filterCategorySelect) return;
  // ユーザーが作成したカテゴリ含め、すべてのタスクからユニークなカテゴリを抽出
  const uniqueCategories = [...new Set(allTasks.map(t => t.categoryId && categoryMap[t.categoryId] ? categoryMap[t.categoryId] : null).filter(c => c && c.trim() !== ""))].sort();
  
  let optionsHtml = `<option value="">カテゴリを選択して追加...</option>`;
  uniqueCategories.forEach(cat => {
    optionsHtml += `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`;
  });
  filterCategorySelect.innerHTML = optionsHtml;
}

// 選択されたカテゴリのチップを描画する
function renderActiveCategoryChips() {
  if (!filterCategoryActiveContainer) return;
  
  if (selectedCategories.length === 0) {
    filterCategoryActiveContainer.innerHTML = "";
    return;
  }
  
  filterCategoryActiveContainer.innerHTML = selectedCategories.map(cat => `
    <button data-value="${escapeHtml(cat)}" class="active-category-chip flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#426ab3] text-white text-[12px] font-label-bold hover:brightness-95 transition-all shadow-sm cursor-pointer">
      ${escapeHtml(cat)}
      <span class="material-symbols-outlined text-[14px]">close</span>
    </button>
  `).join("");
  
  // チップクリックで解除
  document.querySelectorAll('.active-category-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.getAttribute('data-value');
      selectedCategories = selectedCategories.filter(v => v !== val);
      renderActiveCategoryChips();
      renderTasks(allTasks);
    });
  });
}

// ドロップダウンでカテゴリが選択されたとき
if (filterCategorySelect) {
  filterCategorySelect.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val && !selectedCategories.includes(val)) {
      selectedCategories.push(val);
      renderActiveCategoryChips();
      renderTasks(allTasks);
    }
    // 選択をリセット
    filterCategorySelect.value = "";
  });
}

// Priorities Toggle
document.querySelectorAll('.filter-priority-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const val = btn.getAttribute('data-value');
    if (selectedPriorities.includes(val)) {
      selectedPriorities = selectedPriorities.filter(v => v !== val);
      btn.classList.remove('bg-[#a0d8ef]');
      btn.classList.add('bg-white');
    } else {
      selectedPriorities.push(val);
      btn.classList.remove('bg-white');
      btn.classList.add('bg-[#a0d8ef]');
    }
    renderTasks(allTasks);
  });
});

function updateFilterUI() {
  if (searchQuery.trim() !== "") {
    // 検索中はフィルターボタンを無効化し、ラベルを変更
    filterBtn.disabled = true;
    filterBtn.classList.add("opacity-50", "cursor-not-allowed");
    filterLabel.textContent = "検索結果（すべて）";
  } else {
    // 検索がクリアされたら元のフィルター状態・ラベルを復元
    filterBtn.disabled = false;
    filterBtn.classList.remove("opacity-50", "cursor-not-allowed");
    filterLabel.textContent = FILTER_LABELS[currentFilter];
  }
}

if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    updateFilterUI();
    renderTasks(allTasks);
  });
}

// Authentication & Firestore listener setup
let unsubscribeTasks = null;

onAuthStateChanged(auth, (user) => {
  if (unsubscribeTasks) {
    unsubscribeTasks();
    unsubscribeTasks = null;
  }
  if (unsubscribeCategories) {
    unsubscribeCategories();
    unsubscribeCategories = null;
  }

  if (!user) {
    // If not logged in, redirect to login page
    window.location.href = "login.html";
    return;
  }

  // Subscribe to categories for badge display
  try {
    const categoriesRef = collection(db, "categories");
    const catQuery = query(
      categoriesRef,
      where("userId", "==", user.uid),
      orderBy("createdAt", "asc")
    );
    unsubscribeCategories = onSnapshot(catQuery, (snapshot) => {
      categoryMap = {};
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        categoryMap[docSnap.id] = data.name;
      });
      // Re-render tasks so badges reflect updated category names
      renderTasks(allTasks);
    }, (error) => {
      console.error("カテゴリー取得エラー:", error);
    });
  } catch (error) {
    console.error("カテゴリークエリエラー:", error);
  }

  // Subscribe to tasks belonging to current user
  try {
    const tasksRef = collection(db, "tasks");
    const q = query(tasksRef, where("userId", "==", user.uid));

    unsubscribeTasks = onSnapshot(q, (snapshot) => {
      const tasks = [];
      snapshot.forEach((docSnapshot) => {
        tasks.push({
          id: docSnapshot.id,
          ...docSnapshot.data()
        });
      });

      // Filter out deleted tasks
      const activeTasks = tasks.filter(task => !task.isDeleted);

      // Sort: ピン留め → 期限切れ → 期限が近い順 → 期日なし
      // 同カテゴリ内: dueDate近い順 → priority高い順 → createdAt新しい順
      const nowTime = Date.now();
      activeTasks.sort((a, b) => compareTasks(a, b, nowTime));

      allTasks = activeTasks;
      updateCategoryOptions();
      renderTasks(allTasks);
    }, (error) => {
      console.error("タスク取得エラー:", error);
      renderError(error.message || "タスクを取得できませんでした。");
    });
  } catch (error) {
    console.error("クエリ実行エラー:", error);
    renderError(error.message);
  }
});

// ============================================================
// フィルタードロップダウンの開閉
// ============================================================
function openDropdown() {
  filterDropdown.classList.remove("hidden");
  filterChevron.style.transform = "rotate(180deg)";
  filterBtn.setAttribute("aria-expanded", "true");
}

function closeDropdown() {
  filterDropdown.classList.add("hidden");
  filterChevron.style.transform = "";
  filterBtn.setAttribute("aria-expanded", "false");
}

filterBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (filterBtn.disabled) return;
  const isOpen = !filterDropdown.classList.contains("hidden");
  isOpen ? closeDropdown() : openDropdown();
});

// 選択肢クリック時
document.querySelectorAll(".filter-option").forEach((option) => {
  option.addEventListener("click", () => {
    currentFilter = option.getAttribute("data-filter");
    filterLabel.textContent = FILTER_LABELS[currentFilter];
    closeDropdown();
    renderTasks(allTasks);
  });
});

// ドロップダウン外クリックで閉じる
document.addEventListener("click", () => {
  closeDropdown();
});

// ============================================================
// 超派手なタスク完了達成感エフェクト関連ロジック
// ============================================================
const effectStyles = document.createElement('style');
effectStyles.textContent = `
@keyframes check-pop {
  0% { transform: scale(0.8); }
  50% { transform: scale(1.25); }
  100% { transform: scale(1); }
}
@keyframes card-bounce {
  0% { transform: scale(1); }
  40% { transform: scale(0.98); }
  100% { transform: scale(1); }
}
@keyframes flash-screen {
  0% { opacity: 0; background: rgba(255, 255, 255, 0); }
  10% { opacity: 1; background: rgba(255, 255, 255, 0.6); }
  100% { opacity: 0; background: rgba(255, 255, 255, 0); }
}
@keyframes huge-text-pop {
  0% { transform: translate(-50%, -50%) scale(0.2); opacity: 0; }
  15% { transform: translate(-50%, -50%) scale(1.3); opacity: 1; }
  30% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
  60% { 
    transform: translate(-50%, -50%) scale(1); 
    opacity: 1; 
    filter: 
      drop-shadow(0px 2px 0px #c65100) 
      drop-shadow(0px 4px 0px #a03000)
      drop-shadow(0px 6px 0px #802000)
      drop-shadow(0px 15px 20px rgba(255, 100, 0, 0.8))
      drop-shadow(0px 0px 30px rgba(255, 215, 0, 1))
      brightness(1);
  }
  75% { 
    transform: translate(-50%, -50%) scale(1.05); 
    opacity: 1; 
    filter: 
      drop-shadow(0px 2px 0px #c65100) 
      drop-shadow(0px 4px 0px #a03000)
      drop-shadow(0px 6px 0px #802000)
      drop-shadow(0px 15px 20px rgba(255, 100, 0, 0.8))
      drop-shadow(0px 0px 50px rgba(255, 255, 255, 1))
      brightness(1.3);
  }
  100% { transform: translate(-50%, -50%) scale(0.8); opacity: 0; }
}
.huge-text-done {
  position: absolute;
  left: 50%;
  top: 50%;
  font-weight: 900;
  font-family: 'Arial Black', 'Impact', 'Work Sans', sans-serif;
  font-size: clamp(60px, 15vw, 120px);
  white-space: nowrap;
  text-align: center;
  background: linear-gradient(
    to bottom, 
    #FFFFFF 0%, 
    #FFF7B1 15%, 
    #FFD700 40%, 
    #FFF1A0 45%,
    #FFB800 55%, 
    #FF8C00 100%
  );
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  -webkit-text-stroke: 3px #FFFFFF;
  filter: 
    drop-shadow(0px 2px 0px #c65100) 
    drop-shadow(0px 4px 0px #a03000)
    drop-shadow(0px 6px 0px #802000)
    drop-shadow(0px 15px 20px rgba(255, 100, 0, 0.8))
    drop-shadow(0px 0px 30px rgba(255, 215, 0, 1));
  animation: huge-text-pop 1.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
}
@keyframes ray-burst {
  0% { transform: translate(-50%, -50%) scale(0) rotate(0deg); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(2.5) rotate(90deg); opacity: 0; }
}
@keyframes ring-burst {
  0% { transform: translate(-50%, -50%) scale(0); opacity: 1; border-width: 20px; }
  100% { transform: translate(-50%, -50%) scale(3); opacity: 0; border-width: 0px; }
}
@keyframes confetti-blast {
  0% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
  70% { opacity: 1; }
  100% { transform: translate(var(--tx), var(--ty)) rotate(var(--rot)); opacity: 0; }
}
@keyframes spark-fly {
  0% { transform: translate(0, 0) scale(1); opacity: 1; }
  100% { transform: translate(var(--tx), var(--ty)) scale(0); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .effect-layer * {
    animation-duration: 0.01ms !important;
  }
}
`;
document.head.appendChild(effectStyles);

function playCompletionEffect(btn) {
  const card = btn.closest('[data-task-id]');
  if (!card) return;

  // 1. タスクカード側の軽いリアクション（既存UIへのクローン表示）
  const rect = card.getBoundingClientRect();
  const clone = card.cloneNode(true);
  
  clone.style.position = 'absolute';
  clone.style.top = (rect.top + window.scrollY) + 'px';
  clone.style.left = (rect.left + window.scrollX) + 'px';
  clone.style.width = rect.width + 'px';
  clone.style.height = rect.height + 'px';
  clone.style.zIndex = '9998';
  clone.style.margin = '0';
  clone.style.pointerEvents = 'none';
  clone.style.transition = 'opacity 0.2s ease-out';
  clone.style.animation = 'card-bounce 0.3s ease-out forwards';

  const cloneBtn = clone.querySelector('.task-toggle-btn');
  if (cloneBtn) {
    cloneBtn.classList.remove('bg-transparent', 'hover:bg-[#60a5fa]/20');
    cloneBtn.classList.add('bg-[#60a5fa]');
    cloneBtn.innerHTML = '<span class="material-symbols-outlined text-white text-[18px] font-bold" style="animation: check-pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;">check</span>';
  }

  const titleEl = clone.querySelector('.task-title');
  if (titleEl) titleEl.classList.add('line-through', 'opacity-60', 'text-slate-500');
  const descEl = clone.querySelector('.task-desc');
  if (descEl) descEl.classList.add('line-through', 'opacity-50');

  document.body.appendChild(clone);
  
  setTimeout(() => {
    clone.style.opacity = '0';
    setTimeout(() => clone.remove(), 200);
  }, 1000);

  // 2. 画面全体の超派手なエフェクトレイヤー
  const effectLayer = document.createElement('div');
  effectLayer.className = 'effect-layer';
  effectLayer.style.position = 'fixed';
  effectLayer.style.inset = '0';
  effectLayer.style.zIndex = '9999';
  effectLayer.style.pointerEvents = 'none';
  effectLayer.style.overflow = 'hidden';
  document.body.appendChild(effectLayer);

  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;

  // フラッシュ
  const flash = document.createElement('div');
  flash.style.position = 'absolute';
  flash.style.inset = '0';
  flash.style.animation = 'flash-screen 0.3s ease-out forwards';
  effectLayer.appendChild(flash);

  // 放射状のリングエフェクト
  const ring = document.createElement('div');
  ring.style.position = 'absolute';
  ring.style.left = '50%';
  ring.style.top = '50%';
  ring.style.width = '150px';
  ring.style.height = '150px';
  ring.style.borderRadius = '50%';
  ring.style.border = 'solid #fff59d';
  ring.style.animation = 'ring-burst 0.7s ease-out forwards';
  effectLayer.appendChild(ring);

  // 放射状の光線
  const rays = document.createElement('div');
  rays.style.position = 'absolute';
  rays.style.left = '50%';
  rays.style.top = '50%';
  rays.style.width = '300px';
  rays.style.height = '300px';
  rays.style.background = 'repeating-conic-gradient(from 0deg, transparent 0deg, transparent 10deg, rgba(255,215,0,0.4) 10deg, rgba(255,215,0,0.4) 20deg)';
  rays.style.borderRadius = '50%';
  rays.style.maskImage = 'radial-gradient(circle, black 20%, transparent 70%)';
  rays.style.webkitMaskImage = 'radial-gradient(circle, black 20%, transparent 70%)';
  rays.style.animation = 'ray-burst 0.8s ease-out forwards';
  effectLayer.appendChild(rays);

  // スパーク・光の粒子 (20個)
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 150 + Math.random() * 250;
    
    const wrapper = document.createElement('div');
    wrapper.style.position = 'absolute';
    wrapper.style.left = cx + 'px';
    wrapper.style.top = cy + 'px';
    wrapper.style.transform = `rotate(${angle + Math.PI/2}rad)`;
    
    const spark = document.createElement('div');
    spark.style.width = '3px';
    spark.style.height = '15px';
    spark.style.backgroundColor = '#ffffff';
    spark.style.borderRadius = '2px';
    spark.style.boxShadow = '0 0 10px 3px #fff59d';
    spark.style.setProperty('--tx', '0px');
    spark.style.setProperty('--ty', -dist + 'px');
    spark.style.animation = `spark-fly ${0.3 + Math.random() * 0.4}s cubic-bezier(0.25, 1, 0.5, 1) forwards`;
    
    wrapper.appendChild(spark);
    effectLayer.appendChild(wrapper);
  }

  // 画面全体への紙吹雪大爆発 (30個)
  const confettiColors = ['#0000ff', '#a0d8ef', '#fff59d', '#ff5252', '#4caf50', '#ff9800'];
  const shapes = ['circle', 'square', 'rect'];
  for (let i = 0; i < 30; i++) {
    const piece = document.createElement('div');
    const color = confettiColors[Math.floor(Math.random() * confettiColors.length)];
    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    
    piece.style.position = 'absolute';
    piece.style.left = cx + 'px';
    piece.style.top = cy + 'px';
    piece.style.backgroundColor = color;
    
    if (shape === 'circle') {
      piece.style.width = '10px';
      piece.style.height = '10px';
      piece.style.borderRadius = '50%';
    } else if (shape === 'square') {
      piece.style.width = '12px';
      piece.style.height = '12px';
    } else {
      piece.style.width = '8px';
      piece.style.height = '18px';
    }
    
    const angle2 = Math.random() * Math.PI * 2;
    const velocity = 300 + Math.random() * 400; // 広範囲へ拡散
    const tx = Math.cos(angle2) * velocity;
    const ty = Math.sin(angle2) * velocity + (Math.random() * 200); // 下方向への重力バイアス
    const rot = (Math.random() * 720 - 360) + 'deg';
    
    piece.style.setProperty('--tx', tx + 'px');
    piece.style.setProperty('--ty', ty + 'px');
    piece.style.setProperty('--rot', rot);
    
    piece.style.animation = `confetti-blast ${0.6 + Math.random() * 0.6}s cubic-bezier(0.25, 1, 0.5, 1) forwards`;
    effectLayer.appendChild(piece);
  }

  // 主役：「完了！」の巨大テキスト
  const msg = document.createElement('div');
  msg.textContent = '完了！';
  msg.className = 'huge-text-done';
  effectLayer.appendChild(msg);

  // 約1.5秒でエフェクトレイヤー全体を削除して通常画面に戻る
  setTimeout(() => {
    effectLayer.remove();
  }, 1500);
}
