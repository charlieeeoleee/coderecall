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
import { loadWrongAnswerReview, clearWrongAnswerReview, resolveWrongAnswerReview } from "./review-store.js";
import { loadRetentionQueue, clearRetentionQueue, resolveRetentionReview } from "./retention-store.js";

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

applyRoleNavigation("guest", "review.html");

let currentUser = null;
let currentIsGuest = false;
let reviewItems = [];
const reviewMode = (new URLSearchParams(window.location.search).get("mode") || "").toLowerCase();
let flashcardItems = [];
let flashcardIndex = 0;

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
  document.getElementById("reviewItemCount").textContent = String(items.length);
  document.getElementById("reviewSubjectCount").textContent = String(new Set(items.map((item) => item.subject).filter(Boolean)).size);
  document.getElementById("reviewLatestSource").textContent = items[0]?.title || "-";
}

function isFlashcardMode() {
  return reviewMode === "flashcards";
}

function canRevealCorrectAnswer(item) {
  return item?.quizType === "pretest";
}

function getRetryState(item) {
  const retryAt = item?.retryAvailableAt ? new Date(item.retryAvailableAt) : null;
  const isPretest = item?.quizType === "pretest";
  const baseRationale = item?.rationale || "Review the lesson and try the source activity again.";

  if (isPretest) {
    return {
      canOpen: false,
      message: `${baseRationale} This pre-test item is view-only and cannot be answered again.`,
      buttonLabel: "Source Locked"
    };
  }

  if (!retryAt || Number.isNaN(retryAt.getTime())) {
    return {
      canOpen: true,
      message: baseRationale,
      buttonLabel: "Open Source"
    };
  }

  const now = new Date();
  if (now < retryAt) {
    const retryDateLabel = retryAt.toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric"
    });
    return {
      canOpen: false,
      message: `${baseRationale} Locked for today. You can answer this item again on ${retryDateLabel}.`,
      buttonLabel: "Try Tomorrow"
    };
  }

  return {
    canOpen: true,
    message: `${baseRationale} You can answer this item again now.`,
    buttonLabel: "Answer Again"
  };
}

function isDueMemoryReviewItem(item) {
  const retryState = getRetryState(item);
  return Boolean(item?.actionUrl) && retryState.canOpen && item?.quizType !== "pretest";
}

function getVisibleReviewItems(items) {
  if (reviewMode !== "memory" && reviewMode !== "retention" && !isFlashcardMode()) return items;
  return items.filter(isDueMemoryReviewItem);
}

function applyReviewModeLabels() {
  if (!isFlashcardMode() && reviewMode !== "memory" && reviewMode !== "retention") return;

  const titleEl = document.getElementById("reviewPageTitle");
  const subtitleEl = document.getElementById("reviewPageSubtitle");
  const countLabelEl = document.getElementById("reviewItemCountLabel");
  const latestLabelEl = document.getElementById("reviewLatestSourceLabel");
  const sectionTitleEl = document.getElementById("reviewSectionTitle");
  const sectionNoteEl = document.getElementById("reviewSectionNote");
  const clearBtn = document.querySelector(".review-page-section .view-full-btn");

  if (isFlashcardMode()) {
    if (titleEl) titleEl.textContent = "Memory Flashcards";
    if (subtitleEl) subtitleEl.textContent = "Flip due retention items into flashcards and mark whether you still remember them.";
    if (countLabelEl) countLabelEl.textContent = "Cards Due";
    if (latestLabelEl) latestLabelEl.textContent = "Current Deck";
    if (sectionTitleEl) sectionTitleEl.textContent = "Flashcard Review";
    if (sectionNoteEl) sectionNoteEl.textContent = "Use these cards for quick retrieval practice before reopening the full source activity.";
    if (clearBtn) clearBtn.textContent = "Clear Flashcard Deck";
    return;
  }

  if (titleEl) titleEl.textContent = "Today's Memory Review";
  if (subtitleEl) subtitleEl.textContent = "Reopen only the review items that are due for retrieval practice today.";
  if (countLabelEl) countLabelEl.textContent = "Due Today";
  if (latestLabelEl) latestLabelEl.textContent = "Latest Due Topic";
  if (sectionTitleEl) sectionTitleEl.textContent = "Due Review Items";
  if (sectionNoteEl) sectionNoteEl.textContent = "Only items that can be answered again today are shown here.";
  if (clearBtn) clearBtn.textContent = "Clear Review List";
}

function getFlashcardAnswer(item) {
  return item?.correctAnswer || "Review the original activity for the full answer.";
}

function updateFlashcardVisibility(isFlashcard) {
  const flashcardSection = document.getElementById("flashcardReviewSection");
  const list = document.getElementById("wrongAnswerReviewList");
  if (flashcardSection) {
    flashcardSection.hidden = !isFlashcard;
  }
  if (list) {
    list.style.display = isFlashcard ? "none" : "grid";
  }
}

function renderFlashcardDeck(items) {
  updateFlashcardVisibility(true);
  const body = document.getElementById("flashcardReviewBody");
  const progressText = document.getElementById("flashcardProgressText");
  if (!body || !progressText) return;

  if (!items.length) {
    progressText.textContent = "0 / 0";
    body.innerHTML = `
      <div class="flashcard-empty-state">
        <h4>No flashcards due right now</h4>
        <p>Once retention items reach their review date, they will appear here as a memory deck.</p>
      </div>
    `;
    return;
  }

  const safeIndex = Math.max(0, Math.min(flashcardIndex, items.length - 1));
  flashcardIndex = safeIndex;
  const item = items[safeIndex];
  progressText.textContent = `${safeIndex + 1} / ${items.length}`;

  body.innerHTML = `
    <article class="flashcard-stage-card">
      <div class="flashcard-stage-meta">
        <span class="flashcard-chip">${escapeHtml(item.subject || "subject")}</span>
        <span class="flashcard-chip secondary">${escapeHtml(item.title || item.quizType || item.source || "review")}</span>
        <span class="flashcard-chip">Stage ${Number(item.stageIndex || 0) + 1}</span>
      </div>
      <h4 class="flashcard-stage-prompt">${escapeHtml(item.question || "Review prompt unavailable.")}</h4>
      <div id="flashcardBackFace" class="flashcard-stage-answer flashcard-hidden">
        <strong>Correct Answer</strong>
        <div class="flashcard-answer-text">${escapeHtml(getFlashcardAnswer(item))}</div>
        <div class="flashcard-rationale">${escapeHtml(item.rationale || "Open the source activity to revisit the full explanation.")}</div>
      </div>
      <div class="flashcard-actions">
        <button class="flashcard-btn primary" id="flashcardRevealBtn" type="button">Flip Card</button>
        <button class="flashcard-btn warning flashcard-hidden" id="flashcardAgainBtn" type="button">Need Again</button>
        <button class="flashcard-btn secondary flashcard-hidden" id="flashcardRememberedBtn" type="button">I Remember It</button>
        <button class="flashcard-btn flashcard-hidden" id="flashcardSourceBtn" type="button">Open Source</button>
      </div>
    </article>
  `;

  const backFace = document.getElementById("flashcardBackFace");
  const revealBtn = document.getElementById("flashcardRevealBtn");
  const againBtn = document.getElementById("flashcardAgainBtn");
  const rememberedBtn = document.getElementById("flashcardRememberedBtn");
  const sourceBtn = document.getElementById("flashcardSourceBtn");

  revealBtn?.addEventListener("click", () => {
    backFace?.classList.remove("flashcard-hidden");
    revealBtn.classList.add("flashcard-hidden");
    againBtn?.classList.remove("flashcard-hidden");
    rememberedBtn?.classList.remove("flashcard-hidden");
    sourceBtn?.classList.remove("flashcard-hidden");
  });

  againBtn?.addEventListener("click", () => {
    flashcardIndex = Math.min(flashcardIndex + 1, Math.max(0, flashcardItems.length - 1));
    renderFlashcardDeck(flashcardItems);
  });

  rememberedBtn?.addEventListener("click", async () => {
    flashcardItems = await resolveRetentionReview({
      db,
      user: currentUser,
      payload: item
    });
    reviewItems = flashcardItems;
    const visibleItems = getVisibleReviewItems(flashcardItems);
    if (flashcardIndex >= visibleItems.length) {
      flashcardIndex = Math.max(0, visibleItems.length - 1);
    }
    renderStats(visibleItems);
    renderFlashcardDeck(visibleItems);
  });

  sourceBtn?.addEventListener("click", () => {
    if (item?.actionUrl) {
      window.location.href = item.actionUrl;
    }
  });
}

function renderReviewItems(items) {
  if (isFlashcardMode()) {
    flashcardItems = items;
    renderFlashcardDeck(items);
    return;
  }

  updateFlashcardVisibility(false);
  const container = document.getElementById("wrongAnswerReviewList");
  if (!container) return;

  if (!items.length) {
    container.innerHTML = `
      <div class="review-empty-state">
        <h4>No review items yet</h4>
        <p>Miss a question in a quiz or quiz level, and it will appear here for review.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = items.map((item) => `
    <article class="wrong-answer-card">
      <div class="wrong-answer-meta">
        <span class="wrong-answer-chip">${escapeHtml(item.subject || "subject")}</span>
        <span class="wrong-answer-chip secondary">${escapeHtml(item.title || item.quizType || item.source || "Review")}</span>
      </div>
      <h4>${escapeHtml(item.question)}</h4>
      <div class="wrong-answer-detail"><strong>Your answer:</strong> ${escapeHtml(item.selectedAnswer || "No answer recorded")}</div>
      ${canRevealCorrectAnswer(item)
        ? `<div class="wrong-answer-detail"><strong>Correct answer:</strong> ${escapeHtml(item.correctAnswer || "Not available")}</div>`
        : ""}
      <p class="wrong-answer-rationale">${escapeHtml(getRetryState(item).message)}</p>
      <div class="wrong-answer-actions">
        <button class="review-open-btn" data-action-url="${escapeHtml(item.actionUrl || "")}" ${getRetryState(item).canOpen ? "" : "disabled"}>${escapeHtml(getRetryState(item).buttonLabel)}</button>
        <button class="review-clear-btn" data-review-key="${escapeHtml(item.key)}">Remove</button>
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
      const key = button.getAttribute("data-review-key");
      const target = reviewItems.find((item) => item.key === key);
      if (!target) return;

      reviewItems = await resolveWrongAnswerReview({
        db,
        user: currentUser,
        payload: target
      });
      const visibleItems = getVisibleReviewItems(reviewItems);
      renderStats(visibleItems);
      renderReviewItems(visibleItems);
    });
  });
}

async function loadReviewPage() {
  localStorage.setItem("review_page_opened", "true");
  reviewItems = reviewMode === "retention" || isFlashcardMode()
    ? await loadRetentionQueue({
        db,
        user: currentUser
      })
    : await loadWrongAnswerReview({
        db,
        user: currentUser
      });
  applyReviewModeLabels();
  const visibleItems = getVisibleReviewItems(reviewItems);
  renderStats(visibleItems);
  renderReviewItems(visibleItems);
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
    "retention_queue_items",
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

window.clearReviewItems = async function() {
  reviewItems = [];
  flashcardItems = [];
  flashcardIndex = 0;
  if (reviewMode === "retention" || isFlashcardMode()) {
    await clearRetentionQueue({
      db,
      user: currentUser
    });
  } else {
    await clearWrongAnswerReview({
      db,
      user: currentUser
    });
  }
  const visibleItems = getVisibleReviewItems(reviewItems);
  renderStats(visibleItems);
  renderReviewItems(visibleItems);
};

onAuthStateChanged(auth, async (user) => {
  const isGuest = localStorage.getItem("guest") === "true";

  if (user) {
    currentUser = user;
    currentIsGuest = false;
    updateUserUI(user.displayName || user.email || "User", user.photoURL || "https://i.pravatar.cc/40?img=12");
    applyRoleNavigation(await resolveUserRole(db, user), "review.html");
    await loadReviewPage();
    return;
  }

  if (isGuest) {
    currentUser = null;
    currentIsGuest = true;
    updateUserUI("Guest", "https://i.pravatar.cc/40?img=8");
    applyRoleNavigation("guest", "review.html");
    await loadReviewPage();
    return;
  }

  window.location.href = "auth.html";
});

window.addEventListener("DOMContentLoaded", () => {
  loadTheme();
  initSounds();
  initGlobalClickSound();
  tryStartMusic();
  syncMobileSidebarButton();

  document.querySelectorAll(".menu a").forEach((link) => {
    link.addEventListener("click", () => closeMobileSidebar());
  });

  document.addEventListener("click", (event) => {
    const layout = document.querySelector(".layout");
    const sidebar = document.querySelector(".sidebar");
    const toggle = document.querySelector(".sidebar-toggle");

    if (!layout?.classList.contains("mobile-nav-open") || window.innerWidth > 900) return;
    if (sidebar?.contains(event.target) || toggle?.contains(event.target)) return;
    closeMobileSidebar();
  });
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 900) {
    closeMobileSidebar();
  }
});
