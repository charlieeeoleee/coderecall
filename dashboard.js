/* =========================
   FIREBASE IMPORTS
========================= */
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
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  initSounds,
  initGlobalClickSound,
  tryStartMusic,
  restartThemeMusic
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

let currentUser = null;
let currentXP = 0;
let currentIsGuest = false;
let currentAchievements = [];

/* =========================
   AUTH STATE
========================= */
onAuthStateChanged(auth, async (user) => {
  const isGuest = localStorage.getItem("guest") === "true";

  if (user) {
    currentUser = user;
    currentIsGuest = false;
    await updateUserStreak();
    await loadDashboard();
  } else if (isGuest) {
    currentUser = null;
    currentIsGuest = true;
    updateGuestStreak();
    loadGuestDashboard();
  } else {
    window.location.href = "auth.html";
  }
});

/* =========================
   LOAD REAL USER DASHBOARD
========================= */
async function loadDashboard() {
  const userRef = doc(db, "users", currentUser.uid);
  const docSnap = await getDoc(userRef);

  let xp = 0;
  let name = "User";
  let photo = "https://i.pravatar.cc/40?img=12";

  if (docSnap.exists()) {
    const data = docSnap.data();

    xp = data.xp || 0;
    name =
      data.name ||
      currentUser.displayName ||
      currentUser.email ||
      "User";

    photo =
      data.photo ||
      currentUser.photoURL ||
      "https://i.pravatar.cc/40?img=12";
  } else {
    xp = 0;
    name =
      currentUser.displayName ||
      currentUser.email ||
      "User";

    photo =
      currentUser.photoURL ||
      "https://i.pravatar.cc/40?img=12";

    await setDoc(userRef, {
      xp: 0,
      name: name,
      photo: photo,
      email: currentUser.email || "",
      streak: 1,
      lastActiveDate: getTodayString()
    });
  }

  currentXP = xp;

  updateUserUI(name, photo);
  updateStatsUI(xp);
  renderDashboardAchievements(xp, false);
}

/* =========================
   LOAD GUEST DASHBOARD
========================= */
function loadGuestDashboard() {
  const guestXP = parseInt(localStorage.getItem("guest_xp")) || 0;

  currentXP = guestXP;

  updateUserUI("Guest", "https://i.pravatar.cc/40?img=8");
  updateStatsUI(guestXP);
  renderDashboardAchievements(guestXP, true);
}

/* =========================
   UPDATE USER STREAK (REAL USER)
========================= */
async function updateUserStreak() {
  const userRef = doc(db, "users", currentUser.uid);
  const docSnap = await getDoc(userRef);
  const today = getTodayString();

  if (!docSnap.exists()) return;

  const data = docSnap.data();
  const lastActiveDate = data.lastActiveDate || "";
  let streak = data.streak || 0;

  if (lastActiveDate === today) {
    return;
  }

  if (isYesterday(lastActiveDate, today)) {
    streak += 1;
  } else {
    streak = 1;
  }

  await updateDoc(userRef, {
    streak,
    lastActiveDate: today
  });
}

/* =========================
   UPDATE GUEST STREAK
========================= */
function updateGuestStreak() {
  const today = getTodayString();
  const lastActiveDate = localStorage.getItem("guest_last_active_date") || "";
  let streak = parseInt(localStorage.getItem("guest_streak")) || 0;

  if (lastActiveDate === today) return;

  if (isYesterday(lastActiveDate, today)) {
    streak += 1;
  } else {
    streak = 1;
  }

  localStorage.setItem("guest_streak", String(streak));
  localStorage.setItem("guest_last_active_date", today);
}

/* =========================
   UPDATE USER UI
========================= */
function updateUserUI(name, photo) {
  document.getElementById("username").textContent = name;
  document.getElementById("userPhoto").src = photo;
}

/* =========================
   UPDATE STATS UI
========================= */
function updateStatsUI(xp) {
  const level = Math.floor(xp / 100) + 1;
  const progress = xp % 100;

  document.getElementById("xp").textContent = xp;
  document.getElementById("level").textContent = level;
  document.getElementById("progressText").textContent = progress + "%";
  document.getElementById("progressFill").style.width = progress + "%";
}

/* =========================
   DASHBOARD ACHIEVEMENTS
========================= */
function renderDashboardAchievements(xp, isGuest) {
  const grid = document.getElementById("achievementsGrid");
  if (!grid) return;

  let streak = 0;

  if (isGuest) {
    streak = parseInt(localStorage.getItem("guest_streak")) || 0;
  }

  const quizStarted =
    localStorage.getItem("hardware_quiz") === "true" ||
    localStorage.getItem("electrical_quiz") === "true" ||
    localStorage.getItem("hardware_pretest") === "true" ||
    localStorage.getItem("electrical_pretest") === "true";

  const moduleRead =
    localStorage.getItem("hardware_modules") === "true" ||
    localStorage.getItem("electrical_modules") === "true";

  const exploredHardware =
    localStorage.getItem("hardware_pretest") === "true" ||
    localStorage.getItem("hardware_modules") === "true" ||
    localStorage.getItem("hardware_quiz") === "true" ||
    localStorage.getItem("hardware_posttest") === "true";

  const exploredElectrical =
    localStorage.getItem("electrical_pretest") === "true" ||
    localStorage.getItem("electrical_modules") === "true" ||
    localStorage.getItem("electrical_quiz") === "true" ||
    localStorage.getItem("electrical_posttest") === "true";

  currentAchievements = [
    {
      key: "first_win",
      icon: "🥇",
      title: "First Win",
      unlocked: xp > 0 || quizStarted,
      description: "Earn your first XP or complete your first quiz activity.",
      lockedText: "Start learning and earn your first XP to unlock this achievement."
    },
    {
      key: "fast_learner",
      icon: "⚡",
      title: "Fast Learner",
      unlocked: xp >= 50,
      description: "Reach 50 XP through active participation.",
      lockedText: "Earn 50 XP to unlock this achievement."
    },
    {
      key: "three_day_streak",
      icon: "🔥",
      title: "3-Day Streak",
      unlocked: streak >= 3,
      description: "Stay active for 3 consecutive days.",
      lockedText: "Come back and play for 3 days in a row to unlock this achievement."
    },
    {
      key: "quiz_starter",
      icon: "🎯",
      title: "Quiz Starter",
      unlocked: quizStarted,
      description: "Complete your first quiz or test activity.",
      lockedText: "Start your first quiz or test to unlock this achievement."
    },
    {
      key: "module_reader",
      icon: "📘",
      title: "Module Reader",
      unlocked: moduleRead,
      description: "Finish reading your first learning module.",
      lockedText: "Open and complete your first module to unlock this achievement."
    },
    {
      key: "subject_explorer",
      icon: "👻",
      title: "Subject Explorer",
      unlocked: exploredHardware && exploredElectrical,
      description: "Try both available subjects in the system.",
      lockedText: "Explore both subjects to unlock this achievement."
    }
  ];

  grid.innerHTML = "";

  currentAchievements.forEach((achievement) => {
    const card = document.createElement("button");
    card.className = `achievement-card ${achievement.unlocked ? "unlocked" : "locked"}`;

    card.innerHTML = `
      <div class="achievement-top">
        <div class="achievement-icon">${achievement.icon}</div>
        <div class="achievement-status ${achievement.unlocked ? "unlocked" : "locked"}">
          ${achievement.unlocked ? "Unlocked" : "Locked"}
        </div>
      </div>
      <div>
        <div class="achievement-title">${achievement.title}</div>
        <div class="achievement-subtext">
          ${achievement.unlocked ? achievement.description : achievement.lockedText}
        </div>
      </div>
    `;

    card.addEventListener("click", () => openAchievementModal(achievement));
    grid.appendChild(card);
  });
}

/* =========================
   ACHIEVEMENT MODAL
========================= */
function openAchievementModal(achievement) {
  document.getElementById("achievementModalIcon").textContent = achievement.icon;
  document.getElementById("achievementModalTitle").textContent = achievement.title;
  document.getElementById("achievementModalDesc").textContent =
    achievement.unlocked ? achievement.description : achievement.lockedText;

  const status = document.getElementById("achievementModalStatus");
  status.textContent = achievement.unlocked ? "Unlocked" : "Locked";
  status.className = `achievement-modal-status ${achievement.unlocked ? "unlocked" : "locked"}`;

  document.getElementById("achievementModal").classList.add("active");

  if (achievement.unlocked) {
    launchConfetti();
  }
}

window.closeAchievementModal = function() {
  document.getElementById("achievementModal").classList.remove("active");
};

/* =========================
   CONFETTI
========================= */
function launchConfetti() {
  const container = document.getElementById("confettiContainer");
  if (!container) return;

  container.innerHTML = "";
  const colors = ["#ff2e97", "#00e5ff", "#00ffcc", "#ff8c00", "#ffffff"];

  for (let i = 0; i < 70; i++) {
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
   OPEN SUBJECT PAGE
========================= */
window.startGame = function(subject) {
  window.location.href = `subject.html?subject=${subject}`;
};

/* =========================
   GUEST LOGOUT POPUP
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
   DATE HELPERS
========================= */
function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isYesterday(previousDate, currentDate) {
  if (!previousDate || !currentDate) return false;

  const prev = new Date(previousDate + "T00:00:00");
  const curr = new Date(currentDate + "T00:00:00");

  const diff = curr.getTime() - prev.getTime();
  return diff === 24 * 60 * 60 * 1000;
}

/* =========================
   THEME
========================= */
function loadTheme() {
  const saved = localStorage.getItem("theme");
  if (saved === "light") {
    document.body.classList.add("light-mode");
  }
  updateIcon();
}

window.toggleTheme = function() {
  document.body.classList.toggle("light-mode");
  const mode = document.body.classList.contains("light-mode") ? "light" : "dark";
  localStorage.setItem("theme", mode);
  updateIcon();
  restartThemeMusic();
};

function updateIcon() {
  const icon = document.getElementById("themeIcon");
  if (!icon) return;

  icon.textContent =
    document.body.classList.contains("light-mode") ? "☀️" : "🌙";
}

loadTheme();
initSounds();
initGlobalClickSound();
tryStartMusic();

document.body.addEventListener("click", (e) => {
  tryStartMusic();
}, {once: true});