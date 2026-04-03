import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  initSounds,
  initGlobalClickSound,
  tryStartMusic,
  restartThemeMusic,
  playSound,
  lowerThemeMusic,
  restoreThemeMusic
} from "./sound.js";

/* =========================
   FIREBASE CONFIG
========================= */
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

let currentIsGuest = false;
let currentUser = null;
let isCelebrating = false;

/* =========================
   AUTH
========================= */
onAuthStateChanged(auth, async (user) => {
  const isGuest = localStorage.getItem("guest") === "true";

  if (user) {
    currentUser = user;
    currentIsGuest = false;
    await loadRealUser(user);
  } else if (isGuest) {
    currentUser = null;
    currentIsGuest = true;
    loadGuestUser();
  } else {
    window.location.href = "auth.html";
  }
});

/* =========================
   USER LOAD
========================= */
async function loadRealUser(user) {
  const userRef = doc(db, "users", user.uid);
  const docSnap = await getDoc(userRef);

  let xp = 0;
  let name = user.displayName || user.email || "User";
  let photo = user.photoURL || "https://i.pravatar.cc/40?img=12";
  let progress = {};

  if (!docSnap.exists()) {
    await setDoc(userRef, {
      xp: 0,
      xpWeekly: 0,
      xpChange: 0,
      name,
      photo,
      email: user.email || "",
      progress: {}
    });
  } else {
    const data = docSnap.data();
    xp = data.xp || 0;
    name = data.name || user.displayName || user.email || "User";
    photo = data.photo || user.photoURL || "https://i.pravatar.cc/40?img=12";
    progress = data.progress || {};
  }

  updateUserUI(name, photo);
  renderBadges(xp, progress, false);
}

function loadGuestUser() {
  const xp = parseInt(localStorage.getItem("guest_xp")) || 0;
  updateUserUI("Guest", "https://i.pravatar.cc/40?img=8");
  renderBadges(xp, {}, true);
}

function updateUserUI(name, photo) {
  document.getElementById("username").textContent = name;
  document.getElementById("userPhoto").src = photo;
}

/* =========================
   HELPERS
========================= */
function getLocalProgress(key) {
  return localStorage.getItem(key) === "true";
}

function getSavedProgress(progressObj, key) {
  return progressObj[key] === true || getLocalProgress(key);
}

function getGuestStreak() {
  return parseInt(localStorage.getItem("guest_streak")) || 0;
}

function getBadgeStorageKey() {
  if (currentIsGuest) {
    return "badge_unlocks_guest";
  }
  if (currentUser?.uid) {
    return `badge_unlocks_${currentUser.uid}`;
  }
  return "badge_unlocks_default";
}

function getSavedUnlockedBadges() {
  try {
    const raw = localStorage.getItem(getBadgeStorageKey());
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveUnlockedBadges(badgeNames) {
  localStorage.setItem(getBadgeStorageKey(), JSON.stringify(badgeNames));
}

function getBadgePrioritySound(badgeName) {
  if (badgeName === "Completionist") return "full";
  if (badgeName === "Master") return "master";
  return "badge";
}

/* =========================
   CELEBRATION
========================= */
function playAutoUnlockCelebration(newlyUnlockedBadges) {
  if (!newlyUnlockedBadges.length || isCelebrating) return;

  isCelebrating = true;

  const hasCompletionist = newlyUnlockedBadges.some(
    (badge) => badge.name === "Completionist"
  );

  if (hasCompletionist) {
    playSound("full");
    setTimeout(() => {
      playSound("confetti");
      launchConfetti();
      openCompletionOverlay();
    }, 250);
  } else {
    playSound("badge");
    launchConfetti();
  }

  setTimeout(() => {
    isCelebrating = false;
  }, 2500);
}

/* =========================
   BADGES DATA
========================= */
function buildBadges(xp, progressObj, isGuest) {
  const hardwarePre = getSavedProgress(progressObj, "hardware_pretest");
  const hardwareModules = getSavedProgress(progressObj, "hardware_modules");
  const hardwareQuiz = getSavedProgress(progressObj, "hardware_quiz");
  const hardwarePost = getSavedProgress(progressObj, "hardware_posttest");

  const electricalPre = getSavedProgress(progressObj, "electrical_pretest");
  const electricalModules = getSavedProgress(progressObj, "electrical_modules");
  const electricalQuiz = getSavedProgress(progressObj, "electrical_quiz");
  const electricalPost = getSavedProgress(progressObj, "electrical_posttest");

  const anyQuiz = hardwareQuiz || electricalQuiz || hardwarePre || electricalPre;
  const anyModule = hardwareModules || electricalModules;
  const exploredBoth =
    (hardwarePre || hardwareModules || hardwareQuiz || hardwarePost) &&
    (electricalPre || electricalModules || electricalQuiz || electricalPost);

  const bothSubjectsCompleted = hardwarePost && electricalPost;
  const streak = isGuest ? getGuestStreak() : 0;
  void streak;

  return [
    {
      name: "First Step",
      icon: "🥇",
      description: "Earn your first 10 XP and begin your learning adventure.",
      requirement: "Reach 10 XP",
      rewardText: "10 XP milestone",
      unlocked: xp >= 10,
      progressValue: Math.min(xp, 10),
      progressMax: 10
    },
    {
      name: "Rookie",
      icon: "🎯",
      description: "You are gaining momentum and starting to level up your skills.",
      requirement: "Reach 50 XP",
      rewardText: "50 XP milestone",
      unlocked: xp >= 50,
      progressValue: Math.min(xp, 50),
      progressMax: 50
    },
    {
      name: "Learner",
      icon: "📘",
      description: "You reached 100 XP and proved that your learning is consistent.",
      requirement: "Reach 100 XP",
      rewardText: "100 XP milestone",
      unlocked: xp >= 100,
      progressValue: Math.min(xp, 100),
      progressMax: 100
    },
    {
      name: "Intermediate",
      icon: "⚡",
      description: "Your progress is becoming stronger and more stable.",
      requirement: "Reach 200 XP",
      rewardText: "200 XP milestone",
      unlocked: xp >= 200,
      progressValue: Math.min(xp, 200),
      progressMax: 200
    },
    {
      name: "Pro",
      icon: "🔥",
      description: "A serious learner with strong momentum and commitment.",
      requirement: "Reach 300 XP",
      rewardText: "300 XP milestone",
      unlocked: xp >= 300,
      progressValue: Math.min(xp, 300),
      progressMax: 300
    },
    {
      name: "Master",
      icon: "👑",
      description: "Top-tier mastery unlocked through dedication and progress.",
      requirement: "Reach 500 XP",
      rewardText: "500 XP milestone",
      unlocked: xp >= 500,
      progressValue: Math.min(xp, 500),
      progressMax: 500
    },
    {
      name: "Finisher",
      icon: "🏁",
      description: "Complete your first quiz or test-related activity.",
      requirement: "Finish your first quiz or test",
      rewardText: "First completion badge",
      unlocked: anyQuiz,
      progressValue: anyQuiz ? 1 : 0,
      progressMax: 1
    },
    {
      name: "Module Reader",
      icon: "📖",
      description: "Read and complete your first learning module.",
      requirement: "Complete one module",
      rewardText: "Module milestone",
      unlocked: anyModule,
      progressValue: anyModule ? 1 : 0,
      progressMax: 1
    },
    {
      name: "Explorer",
      icon: "🌍",
      description: "Try both subjects and explore the learning system fully.",
      requirement: "Explore both subjects",
      rewardText: "Exploration badge",
      unlocked: exploredBoth,
      progressValue: exploredBoth ? 2 : countExploredSubjects(
        hardwarePre || hardwareModules || hardwareQuiz || hardwarePost,
        electricalPre || electricalModules || electricalQuiz || electricalPost
      ),
      progressMax: 2
    },
    {
      name: "Completionist",
      icon: "🏆",
      description: "Complete both subjects and prove full system dedication.",
      requirement: "Finish the entire system by completing both subjects",
      rewardText: "100% system completion",
      unlocked: bothSubjectsCompleted,
      progressValue: countCompletedSubjects(hardwarePost, electricalPost),
      progressMax: 2
    }
  ];
}

function countExploredSubjects(hardwareDone, electricalDone) {
  let count = 0;
  if (hardwareDone) count++;
  if (electricalDone) count++;
  return count;
}

function countCompletedSubjects(hardwareDone, electricalDone) {
  let count = 0;
  if (hardwareDone) count++;
  if (electricalDone) count++;
  return count;
}

/* =========================
   RENDER BADGES
========================= */
function renderBadges(xp, progressObj, isGuest) {
  const badges = buildBadges(xp, progressObj, isGuest);
  const grid = document.getElementById("badgesGrid");
  grid.innerHTML = "";

  let unlockedCount = 0;

  badges.forEach((badge, index) => {
    const isUnlocked = badge.unlocked;
    if (isUnlocked) unlockedCount++;

    const progressPercent = Math.round((badge.progressValue / badge.progressMax) * 100);

    const card = document.createElement("button");
    card.className = `badge-card ${isUnlocked ? "unlocked" : "locked"}`;
    card.style.animationDelay = `${0.07 * (index + 1)}s`;

    card.innerHTML = `
      <div class="badge-state">${isUnlocked ? "Unlocked" : "Locked"}</div>
      <div class="badge-icon">${badge.icon}</div>
      <div class="badge-name">${badge.name}</div>
      <div class="badge-desc">${badge.description}</div>
      <div class="badge-xp">${badge.rewardText}</div>
      <div class="badge-requirement">${badge.requirement}</div>

      <div class="badge-progress-wrap">
        <div class="badge-progress-bar">
          <div class="badge-progress-fill" style="width:0%"></div>
        </div>
        <span class="badge-progress-text">${badge.progressValue}/${badge.progressMax} completed</span>
      </div>
    `;

    card.addEventListener("click", () => openBadgeModal(badge));
    grid.appendChild(card);

    const fill = card.querySelector(".badge-progress-fill");
    if (fill) {
      requestAnimationFrame(() => {
        fill.style.width = `${progressPercent}%`;
      });
    }
  });

  const percent = Math.round((unlockedCount / badges.length) * 100);

  animateNumber(document.getElementById("xpValue"), xp);
  animateTextNumber(document.getElementById("achievementCount"), unlockedCount, badges.length);
  animateProgress(percent);

  handleNewBadgeUnlocks(badges);
}

function animateNumber(element, targetValue) {
  if (!element) return;

  const duration = 900;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(targetValue * eased);

    element.textContent = value;

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

function animateTextNumber(element, current, total) {
  if (!element) return;

  const duration = 900;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(current * eased);

    element.textContent = `${value}/${total}`;

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

function animateProgress(target) {
  const fill = document.getElementById("progressFill");
  const text = document.getElementById("progressPercent");

  if (!fill || !text) return;

  fill.style.width = "0%";
  text.textContent = "0%";

  requestAnimationFrame(() => {
    fill.style.width = `${target}%`;
  });

  const duration = 1000;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(target * eased);

    text.textContent = `${value}%`;

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

function handleNewBadgeUnlocks(badges) {
  const currentlyUnlocked = badges.filter((badge) => badge.unlocked);
  const currentlyUnlockedNames = currentlyUnlocked.map((badge) => badge.name);
  const previouslyUnlockedNames = getSavedUnlockedBadges();

  const newlyUnlockedBadges = currentlyUnlocked.filter(
    (badge) => !previouslyUnlockedNames.includes(badge.name)
  );

  if (newlyUnlockedBadges.length > 0) {
    playAutoUnlockCelebration(newlyUnlockedBadges);
  }

  saveUnlockedBadges(currentlyUnlockedNames);
}

/* =========================
   MODAL
========================= */
function openBadgeModal(badge) {
  const progressPercent = Math.round((badge.progressValue / badge.progressMax) * 100);

  document.getElementById("modalIcon").textContent = badge.icon;
  document.getElementById("modalTitle").textContent = badge.name;
  document.getElementById("modalDesc").textContent = badge.description;
  document.getElementById("modalRequirement").textContent = badge.requirement;
  document.getElementById("modalProgress").textContent =
    `${badge.progressValue}/${badge.progressMax} (${progressPercent}%)`;
  document.getElementById("modalXP").textContent = badge.rewardText;

  const modalState = document.getElementById("modalState");
  modalState.textContent = badge.unlocked ? "Unlocked" : "Locked";
  modalState.className = `modal-state ${badge.unlocked ? "" : "locked"}`;

  document.getElementById("badgeModal").classList.add("active");
  lowerThemeMusic(0.12);

  if (badge.unlocked) {
    const soundType = getBadgePrioritySound(badge.name);
    playSound(soundType);
    launchConfetti();
  }
}

window.closeBadgeModal = function() {
  document.getElementById("badgeModal").classList.remove("active");
  restoreThemeMusic();
};

window.openCompletionOverlay = function() {
  const overlay = document.getElementById("completionOverlay");
  if (!overlay) return;

  lowerThemeMusic(0.04);

  overlay.classList.remove("shake");
  overlay.classList.add("active");

  setTimeout(() => {
    overlay.classList.add("shake");
  }, 60);
};

window.closeCompletionOverlay = function() {
  const overlay = document.getElementById("completionOverlay");
  if (!overlay) return;

  overlay.classList.remove("active");
  overlay.classList.remove("shake");
  restoreThemeMusic();
};

window.addEventListener("click", (e) => {
  const modal = document.getElementById("badgeModal");
  if (e.target === modal) {
    modal.classList.remove("active");
    restoreThemeMusic();
  }

  const completionOverlay = document.getElementById("completionOverlay");
  if (e.target === completionOverlay) {
    completionOverlay.classList.remove("active");
    completionOverlay.classList.remove("shake");
    restoreThemeMusic();
  }
});

/* =========================
   CONFETTI
========================= */
function launchConfetti() {
  const container = document.getElementById("confettiContainer");
  container.innerHTML = "";

  playSound("confetti");

  const colors = ["#ff2e97", "#00e5ff", "#00ffcc", "#ff8c00", "#ffffff"];

  for (let i = 0; i < 80; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = `${Math.random() * 100}vw`;
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDuration = `${2 + Math.random() * 2}s`;
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    container.appendChild(piece);
  }

  setTimeout(() => {
    container.innerHTML = "";
  }, 4000);
}

/* =========================
   GUEST LOGOUT
========================= */
function hasGuestProgress() {
  const guestXP = parseInt(localStorage.getItem("guest_xp")) || 0;

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

  const hasProgressKey = progressKeys.some((key) => localStorage.getItem(key) === "true");
  return guestXP > 0 || hasProgressKey;
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

window.confirmGuestLogout = function() {
  clearGuestSession();
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
    "hardware_pretest",
    "hardware_modules",
    "hardware_quiz",
    "hardware_posttest",
    "electrical_pretest",
    "electrical_modules",
    "electrical_quiz",
    "electrical_posttest"
  ];

  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

/* =========================
   LOGOUT
========================= */
window.logout = async function() {
  if (currentIsGuest) {
    if (hasGuestProgress()) {
      openGuestLogoutPopup(true);
      return;
    } else {
      openGuestLogoutPopup(false);
      return;
    }
  }

  if (auth.currentUser) {
    await signOut(auth);
  }

  window.location.href = "auth.html";
};

/* =========================
   THEME
========================= */
window.toggleTheme = function() {
  document.body.classList.toggle("light-mode");
  const mode = document.body.classList.contains("light-mode") ? "light" : "dark";
  localStorage.setItem("theme", mode);
  updateIcon();
  restartThemeMusic();
};

function loadTheme() {
  const saved = localStorage.getItem("theme");
  if (saved === "light") {
    document.body.classList.add("light-mode");
  }
  updateIcon();
}

function updateIcon() {
  const icon = document.getElementById("themeIcon");
  if (!icon) return;
  icon.textContent = document.body.classList.contains("light-mode") ? "☀️" : "🌙";
}

/* =========================
   INIT
========================= */
loadTheme();
initSounds();
initGlobalClickSound();
tryStartMusic();

document.body.addEventListener("click", () => {
  tryStartMusic();
}, { once: true });
