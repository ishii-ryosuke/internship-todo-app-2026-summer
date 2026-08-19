// sidebar.js — Shared sidebar, overlay, and logout modal logic for page3 & page4

document.addEventListener('DOMContentLoaded', () => {
  const accountBtn = document.getElementById('account-btn');
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  const logoutBtn = document.getElementById('logout-btn');
  const logoutModal = document.getElementById('logout-modal');
  const logoutYes = document.getElementById('logout-yes');
  const logoutNo = document.getElementById('logout-no');

  // --- Sidebar open/close ---
  function openSidebar() {
    sidebar.classList.remove('translate-x-full');
    sidebar.classList.add('translate-x-0');
    sidebarOverlay.classList.remove('opacity-0', 'pointer-events-none');
    sidebarOverlay.classList.add('opacity-100', 'pointer-events-auto');
  }

  function closeSidebar() {
    sidebar.classList.remove('translate-x-0');
    sidebar.classList.add('translate-x-full');
    sidebarOverlay.classList.remove('opacity-100', 'pointer-events-auto');
    sidebarOverlay.classList.add('opacity-0', 'pointer-events-none');
  }

  accountBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = sidebar.classList.contains('translate-x-0');
    if (isOpen) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });

  sidebarOverlay.addEventListener('click', () => {
    closeSidebar();
  });

  // Prevent clicks inside the sidebar from closing it
  sidebar.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // --- Logout modal ---
  function openLogoutModal() {
    logoutModal.classList.remove('opacity-0', 'pointer-events-none');
    logoutModal.classList.add('opacity-100', 'pointer-events-auto');
    // Scale in the dialog box
    const dialogBox = logoutModal.querySelector('[data-modal-box]');
    if (dialogBox) {
      dialogBox.classList.remove('scale-95');
      dialogBox.classList.add('scale-100');
    }
  }

  function closeLogoutModal() {
    logoutModal.classList.remove('opacity-100', 'pointer-events-auto');
    logoutModal.classList.add('opacity-0', 'pointer-events-none');
    const dialogBox = logoutModal.querySelector('[data-modal-box]');
    if (dialogBox) {
      dialogBox.classList.remove('scale-100');
      dialogBox.classList.add('scale-95');
    }
  }

  logoutBtn.addEventListener('click', () => {
    openLogoutModal();
  });

  logoutYes.addEventListener('click', () => {
    window.location.href = 'login.html';
  });

  logoutNo.addEventListener('click', () => {
    closeLogoutModal();
    // Sidebar stays open
  });

  // Close modal when clicking the backdrop (outside the dialog box)
  logoutModal.addEventListener('click', (e) => {
    if (e.target === logoutModal) {
      closeLogoutModal();
    }
  });
});
