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
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// DOM Elements
const taskForm = document.getElementById("task-form");
const taskNameInput = document.getElementById("task-name");
const taskDescInput = document.getElementById("task-desc");
const dueDateInput = document.getElementById("due-date");
const dueTimeInput = document.getElementById("due-time");
const priorityInput = document.getElementById("priority");
const taskNameError = document.getElementById("task-name-error");
const taskDescError = document.getElementById("task-desc-error");
const priorityError = document.getElementById("priority-error");
const dueDateError = document.getElementById("due-date-error");
const generalError = document.getElementById("general-error");
const cancelBtn = document.getElementById("cancel-btn");
const addTaskBtn = document.getElementById("add-task-btn");
const addTaskBtnText = document.getElementById("add-task-btn-text");

// Authentication State
let currentUser = null;

// Track user authentication state
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    hideGeneralError();
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

priorityInput?.addEventListener("change", () => {
  hideInputError(priorityError);
  hideGeneralError();
});

dueDateInput?.addEventListener("input", () => {
  hideInputError(dueDateError);
  hideGeneralError();
});

// Real-time formatting & strict limits for 4-digit time input (HH:MM)
dueTimeInput?.addEventListener("input", (e) => {
  hideInputError(dueDateError);
  hideGeneralError();

  // If user is deleting, allow natural deletion without re-formatting immediately
  if (e.inputType && e.inputType.startsWith("delete")) {
    return;
  }

  // Extract only digits up to 4 digits
  let raw = dueTimeInput.value.replace(/[^\d]/g, "").slice(0, 4);

  if (!raw) {
    dueTimeInput.value = "";
    return;
  }

  // 1 digit entered: keep as is
  if (raw.length === 1) {
    dueTimeInput.value = raw;
    return;
  }

  // 2 digits entered (Hours: 00-23)
  let hours = raw.slice(0, 2);
  let hNum = parseInt(hours, 10);
  if (hNum > 23) {
    hours = "23";
  }

  // 3-4 digits entered (Minutes: 00-59)
  let minutes = "";
  if (raw.length >= 3) {
    let mRaw = raw.slice(2, 4);
    if (parseInt(mRaw[0], 10) > 5) {
      mRaw = "5" + (mRaw.length > 1 ? mRaw[1] : "");
    }
    minutes = mRaw;
  }

  // Automatically insert colon after the first 2 digits
  dueTimeInput.value = `${hours}:${minutes}`;
});

dueTimeInput?.addEventListener("blur", () => {
  let val = dueTimeInput.value.trim();
  if (!val) return;
  // If user left e.g. "14:" or "9" on blur, complete it nicely
  if (/^(\d{1,2}):?$/.test(val)) {
    let h = parseInt(val.replace(":", ""), 10);
    h = Math.min(23, Math.max(0, h));
    dueTimeInput.value = `${String(h).padStart(2, "0")}:00`;
  } else if (/^(\d{1,2}):(\d{1})$/.test(val)) { // e.g. "14:3" -> "14:30"
    dueTimeInput.value = `${val}0`;
  }
});

taskDescInput?.addEventListener("input", () => {
  hideInputError(taskDescError);
  hideGeneralError();
});

// Cancel button click -> Navigate back to main.html
cancelBtn?.addEventListener("click", () => {
  window.location.href = "main.html";
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
  hideInputError(priorityError);
  hideInputError(dueDateError);
  hideInputError(taskDescError);
  hideGeneralError();

  const title = taskNameInput?.value.trim() || "";
  const description = taskDescInput?.value.trim() || "";
  const priority = parseInt(priorityInput?.value || "0", 10);
  const dateVal = dueDateInput?.value || "";
  let timeVal = dueTimeInput?.value.trim() || "";

  // Auto-complete time if 1-2 digits on submit
  if (/^(\d{1,2}):?$/.test(timeVal)) {
    let h = parseInt(timeVal.replace(":", ""), 10);
    h = Math.min(23, Math.max(0, h));
    timeVal = `${String(h).padStart(2, "0")}:00`;
    if (dueTimeInput) dueTimeInput.value = timeVal;
  } else if (/^(\d{1,2}):(\d{1})$/.test(timeVal)) {
    timeVal = `${timeVal}0`;
    if (dueTimeInput) dueTimeInput.value = timeVal;
  }

  let hasError = false;

  // 1. Validation: Task Name
  if (!title) {
    showInputError(taskNameError, "タスク名を入力してください。");
    hasError = true;
  }

  // 2. Validation: Priority
  if (!priority || priority === 0) {
    showInputError(priorityError, "重要度を選択してください。");
    hasError = true;
  }

  // 3. Validation: Due Date & Time
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (!dateVal) {
    showInputError(dueDateError, "期日の日付を設定してください。");
    hasError = true;
  } else if (!timeVal) {
    showInputError(dueDateError, "期日の時間を入力してください（例: 14:00）。");
    hasError = true;
  } else if (!timeRegex.test(timeVal)) {
    showInputError(dueDateError, "有効な時間（00:00〜23:59）を入力してください。");
    hasError = true;
  }

  // 4. Validation: Task Description
  if (!description) {
    showInputError(taskDescError, "内容を入力してください。");
    hasError = true;
  }

  if (hasError) {
    return;
  }

  const dueDate = dateVal && timeVal ? `${dateVal} ${timeVal}` : dateVal;

  // 3. Authentication Check
  if (!currentUser) {
    showGeneralError("タスクを追加するにはログインが必要です。<a href='login.html' class='underline font-bold ml-1 text-[#426AB3]'>ログインはこちら</a>");
    return;
  }

  // 4. Save Task to Firestore
  try {
    setLoading(true);

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
      priority: priority,          // 0=未設定, 1=低, 2=中, 3=高
      dueDate: dueDate,            // "YYYY-MM-DD" or null
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
