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
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const taskListContainer = document.getElementById("task-list");

// Delete modal elements
const deleteModalOverlay = document.getElementById("delete-modal-overlay");
const deleteModalBox = document.getElementById("delete-modal-box");
const deleteModalTitle = document.getElementById("delete-modal-title");
const deleteModalDesc = document.getElementById("delete-modal-desc");
const deleteModalYes = document.getElementById("delete-modal-yes");
const deleteModalNo = document.getElementById("delete-modal-no");
let taskToDeleteId = null;

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
 */
function renderStars(priority) {
  const p = parseInt(priority, 10) || 0;
  if (p <= 0) return "";
  let starsHtml = "";
  for (let i = 1; i <= 3; i++) {
    if (i <= p) {
      starsHtml += `<span class="material-symbols-outlined text-[#FFC107] text-[16px] icon-filled" style="font-variation-settings: 'FILL' 1;">star</span>`;
    } else {
      starsHtml += `<span class="material-symbols-outlined text-[#d1d5db] text-[16px]">star</span>`;
    }
  }
  return `
    <div class="flex items-center gap-1 text-xs text-[#454558]">
      <span class="font-medium">重要度:</span>
      <div class="flex items-center gap-0.5" title="重要度: ${p}">${starsHtml}</div>
    </div>
  `;
}

/**
 * Format due date string nicely for display
 * @param {string} dueDateStr 
 */
function formatDueDate(dueDateStr) {
  if (!dueDateStr) return "";
  return dueDateStr.replace("T", " ");
}

/**
 * Render the task items
 * @param {Array} tasks 
 */
function renderTasks(tasks) {
  if (!taskListContainer) return;

  if (tasks.length === 0) {
    renderEmpty();
    return;
  }

  taskListContainer.innerHTML = tasks.map((task) => {
    const isDone = Boolean(task.isCompleted);
    return `
      <div class="w-full bg-[#fffde7] rounded-3xl border border-[#a0d8ef] p-4 flex items-start gap-4 group shadow-sm transition-all hover:shadow-md relative" data-task-id="${escapeHtml(task.id)}">
        <!-- Pin Icon -->
        ${task.isPinned ? `
        <div class="absolute -top-2 -left-2 bg-[#0000ff] rounded-full p-1 shadow-sm border border-[#0000ff] flex items-center justify-center z-10">
          <span class="material-symbols-outlined text-[18px] text-[#ffffff] icon-filled">push_pin</span>
        </div>
        ` : ''}
        <!-- Checkbox Button -->
        <button
          type="button"
          class="task-toggle-btn w-6 h-6 mt-0.5 border-2 border-[#60a5fa] ${isDone ? 'bg-[#60a5fa]' : 'bg-transparent hover:bg-[#60a5fa]/20'} rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors"
          data-id="${escapeHtml(task.id)}"
          data-completed="${isDone}"
          aria-label="${isDone ? '未完了にする' : '完了にする'}"
          title="${isDone ? '未完了にする' : '完了にする'}"
        >
          ${isDone ? '<span class="material-symbols-outlined text-white text-[18px] font-bold">check</span>' : ''}
        </button>

        <!-- Task Content -->
        <div class="flex-1 flex flex-col min-w-0 gap-1.5">
          <!-- Title -->
          <div class="task-title font-body-md text-body-md text-on-surface font-medium break-words ${isDone ? 'line-through opacity-60 text-slate-500' : ''}">
            ${escapeHtml(task.title)}
          </div>

          <!-- Description -->
          ${task.description ? `
            <div class="task-desc text-xs text-[#454558] break-words opacity-80 whitespace-pre-wrap ${isDone ? 'line-through opacity-50' : ''}">
              ${escapeHtml(task.description)}
            </div>
          ` : ''}

          <!-- Metadata Row (Due Date & Priority) -->
          ${(task.dueDate || task.priority) ? `
            <div class="flex items-center gap-4 flex-wrap mt-1 ${isDone ? 'opacity-50' : ''}">
              ${task.dueDate ? `
                <div class="flex items-center gap-1 text-xs text-[#454558]">
                  <span class="material-symbols-outlined text-[16px] text-[#426ab3]">schedule</span>
                  <span>期日: ${escapeHtml(formatDueDate(task.dueDate))}</span>
                </div>
              ` : ''}
              ${task.priority ? renderStars(task.priority) : ''}
            </div>
          ` : ''}
        </div>

        <!-- Menu Button (3-dot leader) -->
        <div class="relative task-menu-container flex-shrink-0">
          <button
            type="button"
            class="task-menu-btn text-[#426ab3] hover:opacity-70 transition-opacity flex items-center justify-center p-2 rounded-full cursor-pointer"
            aria-label="メニュー"
          >
            <span class="material-symbols-outlined text-[24px]">more_vert</span>
          </button>
          
          <!-- Dropdown Menu -->
          <div class="task-dropdown-menu absolute right-0 top-full mt-1 bg-[#f9f9f9] border border-[#a0d8ef] rounded-lg shadow-lg z-50 py-1 min-w-[120px] hidden">
            ${task.isPinned ? `
            <button
              type="button"
              class="task-pin-btn w-full text-left px-4 py-2 text-on-surface font-label-bold text-[14px] hover:bg-surface-container-high transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap"
              data-id="${escapeHtml(task.id)}"
              data-pinned="true"
            >
              <span class="material-symbols-outlined text-[18px]">keep_off</span>
              <span>ピンを外す</span>
            </button>
            ` : `
            <button
              type="button"
              class="task-pin-btn w-full text-left px-4 py-2 text-on-surface font-label-bold text-[14px] hover:bg-surface-container-high transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap"
              data-id="${escapeHtml(task.id)}"
              data-pinned="false"
            >
              <span class="material-symbols-outlined text-[18px]">push_pin</span>
              <span>ピン留め</span>
            </button>
            `}
            <button
              type="button"
              class="task-delete-btn w-full text-left px-4 py-2 text-error font-label-bold text-[14px] hover:bg-surface-container-high transition-colors flex items-center gap-2 cursor-pointer"
              data-id="${escapeHtml(task.id)}"
              data-title="${escapeHtml(task.title)}"
              data-desc="${escapeHtml(task.description || '')}"
            >
              <span class="material-symbols-outlined text-[18px]">delete</span>
              <span>削除</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  // Attach event listeners to toggle buttons
  taskListContainer.querySelectorAll(".task-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const taskId = btn.getAttribute("data-id");
      const currentCompleted = btn.getAttribute("data-completed") === "true";
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

      // 削除実行時にメニューを閉じる
      const menu = btn.closest('.task-dropdown-menu');
      if (menu) menu.classList.add('hidden');

      const taskId = btn.getAttribute("data-id");
      const taskTitle = btn.getAttribute("data-title");
      const taskDesc = btn.getAttribute("data-desc");

      showDeleteModal(taskTitle, taskDesc, taskId);
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
      // Close all other open menus
      taskListContainer.querySelectorAll(".task-dropdown-menu").forEach(menu => {
        if (menu !== btn.nextElementSibling) {
          menu.classList.add("hidden");
        }
      });
      // Toggle this menu
      const dropdown = btn.nextElementSibling;
      dropdown.classList.toggle("hidden");
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

// Initial state
renderLoading();

// Authentication & Firestore listener setup
let unsubscribeTasks = null;

onAuthStateChanged(auth, (user) => {
  if (unsubscribeTasks) {
    unsubscribeTasks();
    unsubscribeTasks = null;
  }

  if (!user) {
    // If not logged in, redirect to login page
    window.location.href = "login.html";
    return;
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

      // Separate into pinned and unpinned
      const pinnedTasks = activeTasks.filter(task => task.isPinned);
      const unpinnedTasks = activeTasks.filter(task => !task.isPinned);

      // Sort pinned: newest pinned first
      pinnedTasks.sort((a, b) => {
        const timeA = a.pinnedAt?.toMillis ? a.pinnedAt.toMillis() : (a.pinnedAt?.seconds ? a.pinnedAt.seconds * 1000 : 0);
        const timeB = b.pinnedAt?.toMillis ? b.pinnedAt.toMillis() : (b.pinnedAt?.seconds ? b.pinnedAt.seconds * 1000 : 0);
        return timeB - timeA;
      });

      // Sort unpinned: newest created first
      unpinnedTasks.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
        return timeB - timeA;
      });

      // Combine arrays
      const sortedTasks = [...pinnedTasks, ...unpinnedTasks];

      renderTasks(sortedTasks);
    }, (error) => {
      console.error("タスク取得エラー:", error);
      renderError(error.message || "タスクを取得できませんでした。");
    });
  } catch (error) {
    console.error("クエリ実行エラー:", error);
    renderError(error.message);
  }
});
