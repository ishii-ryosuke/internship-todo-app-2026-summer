// ==========================================================================
// Task List Display Logic (page3.js)
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
  deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const taskListContainer = document.getElementById("task-list");

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
      <div class="w-full bg-[#fffde7] rounded-3xl border border-[#a0d8ef] p-4 flex items-start gap-4 group shadow-sm transition-all hover:shadow-md" data-task-id="${escapeHtml(task.id)}">
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
        <div class="flex-1 flex flex-col min-w-0">
          <div class="task-title font-body-md text-body-md text-on-surface font-medium break-words ${isDone ? 'line-through opacity-60 text-slate-500' : ''}">
            ${escapeHtml(task.title)}
          </div>
          ${task.description ? `
            <div class="task-desc text-xs text-[#454558] mt-1 break-words opacity-80 whitespace-pre-wrap ${isDone ? 'line-through opacity-50' : ''}">
              ${escapeHtml(task.description)}
            </div>
          ` : ''}
        </div>

        <!-- Delete Action Button -->
        <button
          type="button"
          class="task-delete-btn text-[#757589] hover:text-[#ba1a1a] p-1 rounded-full opacity-40 hover:opacity-100 transition-all cursor-pointer flex-shrink-0"
          data-id="${escapeHtml(task.id)}"
          aria-label="タスクを削除"
          title="タスクを削除"
        >
          <span class="material-symbols-outlined text-[20px]">delete</span>
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
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const taskId = btn.getAttribute("data-id");
      if (!confirm("このタスクを削除しますか？")) {
        return;
      }
      try {
        const taskDocRef = doc(db, "tasks", taskId);
        await deleteDoc(taskDocRef);
      } catch (err) {
        console.error("タスクの削除に失敗しました:", err);
      }
    });
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

      // Sort client-side: newest first (or by createdAt desc)
      tasks.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
        return timeB - timeA;
      });

      renderTasks(tasks);
    }, (error) => {
      console.error("タスク取得エラー:", error);
      renderError(error.message || "タスクを取得できませんでした。");
    });
  } catch (error) {
    console.error("クエリ実行エラー:", error);
    renderError(error.message);
  }
});
