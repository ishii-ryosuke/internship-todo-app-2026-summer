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

dueTimeInput?.addEventListener("input", (e) => {
  hideInputError(dueDateError);
  hideGeneralError();
});

dueTimeInput?.addEventListener("blur", () => {
  let val = dueTimeInput.value.trim();
  if (!val) return;
  // If user entered 4 digits without colon e.g. "1430"
  if (/^\d{4}$/.test(val)) {
    dueTimeInput.value = `${val.slice(0, 2)}:${val.slice(2)}`;
  } else if (/^\d{3}$/.test(val)) { // e.g. "930" -> "09:30"
    dueTimeInput.value = `0${val.slice(0, 1)}:${val.slice(1)}`;
  } else if (/^(\d{1}):(\d{2})$/.test(val)) { // e.g. "9:30" -> "09:30"
    dueTimeInput.value = `0${val}`;
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

  // Auto-format time before validation
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
    showInputError(dueDateError, "有効な時間（例: 14:00）を半角で入力してください。");
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
