import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  initSounds,
  initGlobalClickSound,
  tryStartMusic,
  restartThemeMusic
} from "./sound.js";
import { applyRoleNavigation, resolveUserRole } from "./role-utils.js";
import { loadStudyHistory, clearStudyHistory, setStudyHistory } from "./study-history-store.js";

const firebaseConfig = {
  apiKey: "AIzaSyDZiVk1T6ZbpKJrhRt1wQAr2vSSn4Wa_KU",
  authDomain: "gamifiedlearningsystem.firebaseapp.com",
  projectId: "gamifiedlearningsystem",
  storageBucket: "gamifiedlearningsystem.firebasestorage.app",
  messagingSenderId: "516998404507",
  appId: "1:516998404507:web:0c625f9af2809ca4b6a93e"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentIsGuest = false;
let historyItems = [];

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function updateUserUI(name, photo) {
  const username = document.getElementById("username");
  const userPhoto = document.getElementById("userPhoto");
  if (username) username.textContent = name;
  if (userPhoto) userPhoto.src = photo;
}

function formatTimestamp(value) {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function getThemeIcon() {
  return document.body.classList.contains("light-mode") ? "☀️" : "🌙";
}

function updateThemeIcon() {
  const icon = document.getElementById("themeIcon");
  if (icon) icon.textContent = getThemeIcon();
}

function loadTheme() {
  if (localStorage.getItem("theme") === "light") {
    document.body.classList.add("light-mode");
  }
  updateThemeIcon();
}

window.toggleTheme = function () {
  document.body.classList.toggle("light-mode");
  localStorage.setItem("theme", document.body.classList.contains("light-mode") ? "light" : "dark");
  updateThemeIcon();
  restartThemeMusic();
};

function syncMobileSidebarButton() {
  const layout = document.querySelector(".layout");
  const toggle = document.querySelector(".sidebar-toggle");
  if (!layout || !toggle) return;

  const isOpen = layout.classList.contains("mobile-nav-open");
  toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  toggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
}

window.toggleMobileSidebar = function() {
  const layout = document.querySelector(".layout");
  if (!layout || window.innerWidth > 900) return;

  layout.classList.toggle("mobile-nav-open");
  syncMobileSidebarButton();
};

function closeMobileSidebar() {
  const layout = document.querySelector(".layout");
  if (!layout) return;
  layout.classList.remove("mobile-nav-open");
  syncMobileSidebarButton();
}

function renderStats(items) {
  document.getElementById("historyItemCount").textContent = String(items.length);
  document.getElementById("historySubjectCount").textContent = String(new Set(items.map((item) => item.subject).filter(Boolean)).size);
  document.getElementById("historyLatestTitle").textContent = items[0]?.title || "-";
}

function renderHistoryItems(items) {
  const container = document.getElementById("studyHistoryList");
  if (!container) return;

  if (!items.length) {
    container.innerHTML = `
      <div class="review-empty-state">
        <h4>No study history yet</h4>
        <p>Open a module, quiz level, or test page and it will appear here.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = items.map((item) => `
    <article class="wrong-answer-card">
      <div class="wrong-answer-meta">
        <span class="wrong-answer-chip">${escapeHtml(item.subject || "activity")}</span>
        <span class="wrong-answer-chip secondary">${escapeHtml(item.kind || "study")}</span>
      </div>
      <h4>${escapeHtml(item.title)}</h4>
      <div class="wrong-answer-detail"><strong>Details:</strong> ${escapeHtml(item.detail || "Recent learning activity")}</div>
      <div class="wrong-answer-detail"><strong>Last opened:</strong> ${escapeHtml(formatTimestamp(item.timestamp))}</div>
      <div class="wrong-answer-actions">
        <button class="review-open-btn" data-action-url="${escapeHtml(item.actionUrl || "")}">Open Again</button>
        <button class="review-clear-btn" data-history-key="${escapeHtml(item.key)}">Remove</button>
      </div>
    </article>
  `).join("");

  container.querySelectorAll(".review-open-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const actionUrl = button.getAttribute("data-action-url");
      if (actionUrl) {
        window.location.href = actionUrl;
      }
    });
  });

  container.querySelectorAll(".review-clear-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const key = button.getAttribute("data-history-key");
      historyItems = historyItems.filter((item) => item.key !== key);
      historyItems = await setStudyHistory({
        db,
        user: currentUser,
        items: historyItems
      });
      renderStats(historyItems);
      renderHistoryItems(historyItems);
    });
  });
}

async function loadHistoryPage() {
  localStorage.setItem("study_history_opened", "true");
  historyItems = await loadStudyHistory({
    db,
    user: currentUser
  });
  renderStats(historyItems);
  renderHistoryItems(historyItems);
}

function hasGuestProgress() {
  const progressKeys = [
    "hardware_pretest",
    "hardware_modules",
    "hardware_quiz",
    "hardware_posttest",
    "electrical_pretest",
    "electrical_modules",
    "electrical_quiz",
    "electrical_posttest"
  ];

  return progressKeys.some((key) => localStorage.getItem(key) === "true");
}

function openGuestLogoutPopup(withProgress = true) {
  const popup = document.getElementById("guestLogoutPopup");
  const title = document.getElementById("guestLogoutTitle");
  const message = document.getElementById("guestLogoutMessage");
  const primaryBtn = document.getElementById("guestPrimaryBtn");
  const secondaryBtn = document.getElementById("guestSecondaryBtn");
  const cancelBtn = document.getElementById("guestCancelBtn");

  if (withProgress) {
    title.textContent = "Save Your Progress";
    message.textContent = "You are currently using a guest account. Register an account now to save your progress and XP before logging out.";
    primaryBtn.style.display = "block";
    primaryBtn.textContent = "Register to Save Progress";
    primaryBtn.onclick = registerGuestAccount;
    secondaryBtn.style.display = "block";
    secondaryBtn.textContent = "Log Out Anyway";
    secondaryBtn.onclick = confirmGuestLogout;
    cancelBtn.style.display = "block";
  } else {
    title.textContent = "Log Out Guest Session";
    message.textContent = "You are currently using guest mode. Are you sure you want to log out?";
    primaryBtn.style.display = "block";
    primaryBtn.textContent = "Log Out";
    primaryBtn.onclick = confirmGuestLogout;
    secondaryBtn.style.display = "none";
    cancelBtn.style.display = "block";
  }

  popup.classList.add("active");
}

window.closeGuestLogoutPopup = function() {
  document.getElementById("guestLogoutPopup").classList.remove("active");
};

window.registerGuestAccount = function() {
  localStorage.setItem("guest_pending_save", "true");
  closeGuestLogoutPopup();
  window.location.href = "auth.html";
};

function clearGuestSession() {
  const keysToRemove = [
    "guest",
    "guest_xp",
    "guest_xpWeekly",
    "guest_streak",
    "guest_last_active_date",
    "guest_pending_save",
    "wrong_answer_review_items",
    "study_history_items",
    "review_page_opened",
    "study_history_opened"
  ];

  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

window.confirmGuestLogout = function() {
  clearGuestSession();
  closeGuestLogoutPopup();
  window.location.href = "auth.html";
};

window.logout = async function() {
  closeMobileSidebar();
  if (currentIsGuest) {
    openGuestLogoutPopup(hasGuestProgress());
    return;
  }

  if (auth.currentUser) {
    await signOut(auth);
  }
  window.location.href = "auth.html";
};

window.clearHistoryItems = async function() {
  historyItems = [];
  await clearStudyHistory({
    db,
    user: currentUser
  });
  renderStats(historyItems);
  renderHistoryItems(historyItems);
};

onAuthStateChanged(auth, async (user) => {
  currentUser = user || null;
  currentIsGuest = !user && localStorage.getItem("guest") === "true";

  if (!user && !currentIsGuest) {
    window.location.href = "auth.html";
    return;
  }

  if (user) {
    applyRoleNavigation(await resolveUserRole(db, user), "history.html");
    updateUserUI(
      user.displayName || user.email || "User",
      user.photoURL || "https://i.pravatar.cc/40?img=12"
    );
  } else {
    applyRoleNavigation("guest", "history.html");
    updateUserUI("Guest", "https://i.pravatar.cc/40?img=8");
  }

  await loadHistoryPage();
});

loadTheme();
initSounds();
initGlobalClickSound();
tryStartMusic();

document.body.addEventListener("click", () => {
  tryStartMusic();
}, { once: true });

document.addEventListener("click", (event) => {
  const layout = document.querySelector(".layout");
  const sidebar = document.querySelector(".sidebar");
  const toggle = document.querySelector(".sidebar-toggle");
  if (!layout?.classList.contains("mobile-nav-open")) return;
  if (sidebar?.contains(event.target) || toggle?.contains(event.target)) return;
  closeMobileSidebar();
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 900) {
    closeMobileSidebar();
  }
});
