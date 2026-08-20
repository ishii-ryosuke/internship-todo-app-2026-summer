// ==========================================================================
// Trash List Display Logic (dust.js)
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
  updateDoc 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const trashListContainer = document.getElementById("trash-list");

// Restore modal elements
const restoreModal = document.getElementById("restore-modal");
const restoreModalBox = document.getElementById("restore-modal-box");
const restoreModalBackdrop = document.getElementById("restore-modal-backdrop");
const restoreModalTaskName = document.getElementById("restore-modal-task-name");
const restoreModalTaskDesc = document.getElementById("restore-modal-task-desc");
const restoreNo = document.getElementById("restore-no");
const restoreYes = document.getElementById("restore-yes");

let taskToRestoreId = null;

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

function formatDate(timestamp) {
  if (!timestamp) return "不明";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp.seconds * 1000);
  const yyyy = date.getFullYear();
  const MM = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}/${MM}/${dd} ${hh}:${mm}`;
}

function renderLoading() {
  if (!trashListContainer) return;
  trashListContainer.innerHTML = `
    <div class="w-full flex flex-col items-center justify-center py-16 text-[#757589] gap-3">
      <span class="material-symbols-outlined animate-spin text-[36px] text-[#0000ff]">progress_activity</span>
      <p class="font-body-md text-sm font-medium">ゴミ箱を読み込み中...</p>
    </div>
  `;
}

function renderEmpty() {
  if (!trashListContainer) return;
  trashListContainer.innerHTML = `
    <div class="w-full bg-[#fffde7]/80 border-2 border-dashed border-[#a0d8ef] rounded-3xl p-10 flex flex-col items-center justify-center text-center gap-3 shadow-sm">
      <span class="material-symbols-outlined text-[52px] text-[#0000ff]/60">delete</span>
      <p class="font-label-bold text-base text-[#454558]">ゴミ箱は空です</p>
    </div>
  `;
}

function renderError(message) {
  if (!trashListContainer) return;
  trashListContainer.innerHTML = `
    <div class="w-full bg-[#ffdad6] text-[#ba1a1a] rounded-2xl p-6 text-center text-sm font-medium">
      <p>タスクの取得中にエラーが発生しました。</p>
      <p class="text-xs mt-1 text-[#ba1a1a]/80">${escapeHtml(message)}</p>
    </div>
  `;
}

function renderTasks(tasks) {
  if (!trashListContainer) return;

  if (tasks.length === 0) {
    renderEmpty();
    return;
  }

  trashListContainer.innerHTML = tasks.map((task) => {
    return `
      <div class="task-item w-full bg-[#fffde7] rounded-3xl border border-[#a0d8ef] p-4 flex items-center gap-4 cursor-pointer hover:opacity-90 transition-opacity group shadow-sm relative" data-id="${escapeHtml(task.id)}" data-task-name="${escapeHtml(task.title)}" data-task-desc="${escapeHtml(task.description || '')}">
        <div class="flex items-start gap-3 flex-1">
          <div class="flex flex-col">
            <span class="font-body-md text-body-md text-on-surface">${escapeHtml(task.title)}</span>
            <span class="text-xs text-outline mt-1">削除日時: ${escapeHtml(formatDate(task.deletedAt))}</span>
          </div>
        </div>
        <button class="restore-btn flex items-center gap-1 px-4 py-2 bg-bubble-blue text-on-primary-container rounded-full hover:opacity-80 transition-opacity active:scale-95">
          <span class="material-symbols-outlined text-2xl">restore</span>
          <span class="font-label-bold">復元</span>
        </button>
      </div>
    `;
  }).join("");

  // Attach event listeners to restore buttons
  trashListContainer.querySelectorAll(".restore-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const taskItem = btn.closest('.task-item');
      taskToRestoreId = taskItem.getAttribute("data-id");
      const taskName = taskItem.getAttribute("data-task-name") || '';
      const taskDesc = taskItem.getAttribute("data-task-desc") || '';
      showModal(taskName, taskDesc);
    });
  });
}

// Modal Logic
function showModal(taskName, taskDesc) {
  if (!restoreModal) return;
  restoreModalTaskName.textContent = taskName;
  restoreModalTaskDesc.textContent = taskDesc;
  restoreModal.classList.remove('opacity-0', 'pointer-events-none');
  restoreModal.classList.add('opacity-100');
  restoreModalBox.classList.remove('scale-95');
  restoreModalBox.classList.add('scale-100');
}

function hideModal() {
  if (!restoreModal) return;
  restoreModal.classList.remove('opacity-100');
  restoreModal.classList.add('opacity-0', 'pointer-events-none');
  restoreModalBox.classList.remove('scale-100');
  restoreModalBox.classList.add('scale-95');
  taskToRestoreId = null;
}

if (restoreNo) restoreNo.addEventListener('click', hideModal);
if (restoreModalBackdrop) restoreModalBackdrop.addEventListener('click', hideModal);

if (restoreYes) {
  restoreYes.addEventListener('click', async () => {
    if (taskToRestoreId) {
      try {
        const taskDocRef = doc(db, "tasks", taskToRestoreId);
        await updateDoc(taskDocRef, {
          isDeleted: false
        });
        alert('メイン画面にタスクを移動しました。');
      } catch (err) {
        console.error("タスクの復元に失敗しました:", err);
        alert("復元に失敗しました。");
      }
    }
    hideModal();
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

      // Filter only deleted tasks
      const deletedTasks = tasks.filter(task => task.isDeleted);

      // Sort client-side: newest deleted first
      deletedTasks.sort((a, b) => {
        const timeA = a.deletedAt?.toMillis ? a.deletedAt.toMillis() : (a.deletedAt?.seconds ? a.deletedAt.seconds * 1000 : 0);
        const timeB = b.deletedAt?.toMillis ? b.deletedAt.toMillis() : (b.deletedAt?.seconds ? b.deletedAt.seconds * 1000 : 0);
        return timeB - timeA; // Descending
      });

      renderTasks(deletedTasks);
    }, (error) => {
      console.error("タスク取得エラー:", error);
      renderError(error.message || "タスクを取得できませんでした。");
    });
  } catch (error) {
    console.error("クエリ実行エラー:", error);
    renderError(error.message);
  }
});
