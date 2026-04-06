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
  updateDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit
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
let currentIsGuest = false;
let currentXP = 0;
let currentWeeklyXP = 0;
let leaderboardData = [];
let leaderboardMode = "all"; // "all" or "weekly"

/* =========================
   AUTH STATE
========================= */
onAuthStateChanged(auth, async (user) => {
  const isGuest = localStorage.getItem("guest") === "true";

  if (user) {
    currentUser = user;
    currentIsGuest = false;
    await updateUserStreak();
    await loadRealUser();
    await loadLeaderboard();
    renderLeaderboard();
  } else if (isGuest) {
    currentUser = null;
    currentIsGuest = true;
    updateGuestStreak();
    loadGuestUser();
    await loadLeaderboard();
    renderLeaderboard();
  } else {
    window.location.href = "auth.html";
  }
});

/* =========================
   USER LOAD
========================= */
async function loadRealUser() {
  const userRef = doc(db, "users", currentUser.uid);
  const docSnap = await getDoc(userRef);

  let xp = 0;
  let xpWeekly = 0;
  let name = currentUser.displayName || currentUser.email || "User";
  let photo = currentUser.photoURL || "https://i.pravatar.cc/40?img=12";

  if (!docSnap.exists()) {
    await setDoc(userRef, {
      xp: 0,
      xpWeekly: 0,
      xpChange: 0,
      lastWeeklyReset: getWeekKey(),
      name,
      photo,
      email: currentUser.email || "",
      streak: 1,
      lastActiveDate: getTodayString()
    });
  } else {
    const data = docSnap.data();
    const currentWeek = getWeekKey();
    const lastReset = data.lastWeeklyReset || currentWeek;

    if (lastReset !== currentWeek) {
      await updateDoc(userRef, {
        xpWeekly: 0,
        lastWeeklyReset: currentWeek
      });
      xpWeekly = 0;
    } else {
      xpWeekly = data.xpWeekly || 0;
    }

    xp = data.xp || 0;
    name = data.name || currentUser.displayName || currentUser.email || "User";
    photo = data.photo || currentUser.photoURL || "https://i.pravatar.cc/40?img=12";
  }

  currentXP = xp;
  currentWeeklyXP = xpWeekly;

  updateUserUI(name, photo);
  updateOverview();
}

function loadGuestUser() {
  const guestXP = parseInt(localStorage.getItem("guest_xp")) || 0;
  const guestWeeklyXP = parseInt(localStorage.getItem("guest_xpWeekly")) || guestXP;

  currentXP = guestXP;
  currentWeeklyXP = guestWeeklyXP;

  updateUserUI("Guest", "https://i.pravatar.cc/40?img=8");
  updateOverview();
}

function updateUserUI(name, photo) {
  const username = document.getElementById("username");
  const userPhoto = document.getElementById("userPhoto");

  if (username) username.textContent = name;
  if (userPhoto) userPhoto.src = photo;
}

/* =========================
   LEADERBOARD DATA
========================= */
async function loadLeaderboard() {
  try {
    const field = leaderboardMode === "weekly" ? "xpWeekly" : "xp";

    const q = query(
      collection(db, "users"),
      orderBy(field, "desc"),
      limit(100)
    );

    const snapshot = await getDocs(q);
    leaderboardData = [];

    snapshot.forEach((docItem) => {
      const data = docItem.data();

      leaderboardData.push({
        id: docItem.id,
        name: data.name || "User",
        photo: data.photo || "https://i.pravatar.cc/40?img=12",
        xp: data.xp || 0,
        xpWeekly: data.xpWeekly || 0,
        xpChange: typeof data.xpChange === "number" ? data.xpChange : (data.xp || 0)
      });
    });
  } catch (error) {
    console.error("Leaderboard Error:", error);
    leaderboardData = [];
  }
}

function buildPlayersWithGuest() {
  const players = [...leaderboardData];

  if (currentIsGuest) {
    players.push({
      id: "guest-user",
      name: "Guest",
      photo: "https://i.pravatar.cc/40?img=8",
      xp: currentXP,
      xpWeekly: currentWeeklyXP,
      xpChange: currentWeeklyXP
    });
  }

  players.sort((a, b) => {
    const aXP = leaderboardMode === "weekly" ? (a.xpWeekly || 0) : (a.xp || 0);
    const bXP = leaderboardMode === "weekly" ? (b.xpWeekly || 0) : (b.xp || 0);
    return bXP - aXP;
  });

  return players;
}

function renderLeaderboard() {
  const topThree = document.getElementById("topThree");
  const leaderboardList = document.getElementById("leaderboardList");
  const topMovers = document.getElementById("topMovers");

  if (!topThree || !leaderboardList || !topMovers) return;

  topThree.innerHTML = "";
  leaderboardList.innerHTML = "";
  topMovers.innerHTML = "";

  const players = buildPlayersWithGuest();

  const totalPlayers = document.getElementById("totalPlayers");
  const yourRank = document.getElementById("yourRank");
  const modeLabel = document.getElementById("leaderboardModeLabel");

  if (totalPlayers) totalPlayers.textContent = players.length;

  const currentIndex = players.findIndex((player) => {
    if (currentIsGuest) return player.id === "guest-user";
    return player.id === currentUser?.uid;
  });

  if (yourRank) {
    yourRank.textContent = currentIndex >= 0 ? `#${currentIndex + 1}` : "--";
  }

  if (modeLabel) {
    modeLabel.textContent = leaderboardMode === "weekly" ? "Weekly Rankings" : "All-Time Rankings";
  }

  updateOverview();

  if (!players.length) {
    leaderboardList.innerHTML = `<div class="leaderboard-empty">No leaderboard data yet.</div>`;
    topMovers.innerHTML = `<div class="mover-empty">No mover data yet.</div>`;
    return;
  }

  renderTopPlayers(players);
  renderTopMovers(players);
  renderLeaderboardList(players);
}

function renderTopPlayers(players) {
  const container = document.getElementById("topThree");
  if (!container) return;

  container.innerHTML = "";

  const topPlayers = players.slice(0, 3);
  if (!topPlayers.length) return;

  topPlayers.forEach((player, index) => {
    const rank = index + 1;
    const rankLabel =
      rank === 1 ? "1st Place" :
      rank === 2 ? "2nd Place" :
      "3rd Place";

    const medal =
      rank === 1 ? "👑" :
      rank === 2 ? "🥈" :
      "🥉";

    const displayXP = leaderboardMode === "weekly"
      ? (player.xpWeekly || 0)
      : (player.xp || 0);

    const card = document.createElement("div");
    card.className = `top-player rank-${rank}`;

    card.innerHTML = `
      <div class="top-badge">${medal}</div>
      <div class="top-avatar-wrap">
        <img
          class="top-avatar"
          src="${player.photo || "https://i.pravatar.cc/40?img=12"}"
          alt="${escapeHtml(player.name || "User")}"
        >
      </div>
      <div class="top-name">${escapeHtml(player.name || "User")}</div>
      <div class="top-rank">${rankLabel}</div>
      <div class="top-xp">${displayXP} XP</div>
    `;

    container.appendChild(card);
  });
}

function renderTopMovers(players) {
  const container = document.getElementById("topMovers");
  if (!container) return;

  container.innerHTML = "";

  const movers = [...players]
    .sort((a, b) => (b.xpChange || 0) - (a.xpChange || 0))
    .slice(0, 3);

  if (!movers.length) {
    container.innerHTML = `<div class="mover-empty">No mover data yet.</div>`;
    return;
  }

  movers.forEach((player, index) => {
    const rank = index + 1;
    const card = document.createElement("div");
    card.className = "mover-card";

    card.innerHTML = `
      <div class="mover-head">
        <img
          class="mover-avatar"
          src="${player.photo || "https://i.pravatar.cc/40?img=12"}"
          alt="${escapeHtml(player.name || "User")}"
        >
        <div class="mover-meta">
          <div class="mover-name">${escapeHtml(player.name || "User")}</div>
          <div class="mover-rank">Top Mover #${rank}</div>
        </div>
      </div>
      <div class="mover-gain">+${player.xpChange || 0} XP Gain</div>
      <div class="mover-desc">
        Rising fast on the leaderboard with strong recent progress.
      </div>
    `;

    container.appendChild(card);
  });
}

function renderLeaderboardList(players) {
  const list = document.getElementById("leaderboardList");
  if (!list) return;

  list.innerHTML = "";

  players.forEach((player, index) => {
    const rank = index + 1;
    const isCurrent =
      (!currentIsGuest && player.id === currentUser?.uid) ||
      (currentIsGuest && player.id === "guest-user");

    const displayXP = leaderboardMode === "weekly"
      ? (player.xpWeekly || 0)
      : (player.xp || 0);

    const item = document.createElement("div");
    item.className = `leaderboard-card leaderboard-item ${isCurrent ? "current-user" : ""}`;
    item.style.animationDelay = `${index * 0.08}s`;

    item.innerHTML = `
      <div class="leaderboard-left">
        <div class="rank-chip">#${rank}</div>
        <img
          class="leaderboard-avatar"
          src="${player.photo || "https://i.pravatar.cc/40?img=12"}"
          alt="${escapeHtml(player.name || "User")}"
        >
        <div class="leaderboard-user-meta">
          <div class="leaderboard-name">${escapeHtml(player.name || "User")}</div>
          <div class="leaderboard-sub">${isCurrent ? "You" : "Player"}</div>
        </div>
      </div>
      <div class="leaderboard-xp"><strong>${displayXP} XP</strong></div>
    `;

    list.appendChild(item);
  });
}

function updateOverview() {
  const yourXP = document.getElementById("yourXP");
  if (!yourXP) return;

  const displayXP = leaderboardMode === "weekly" ? currentWeeklyXP : currentXP;
  yourXP.textContent = displayXP;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/* =========================
   WEEK MODE TOGGLE
========================= */
window.setLeaderboardMode = async function(mode) {
  leaderboardMode = mode;

  const btnAll = document.getElementById("btnAll");
  const btnWeekly = document.getElementById("btnWeekly");

  if (btnAll) btnAll.classList.remove("active");
  if (btnWeekly) btnWeekly.classList.remove("active");

  if (mode === "all") {
    if (btnAll) btnAll.classList.add("active");
  } else {
    if (btnWeekly) btnWeekly.classList.add("active");
  }

  await loadLeaderboard();
  renderLeaderboard();
};

/* =========================
   STREAK HELPERS
========================= */
async function updateUserStreak() {
  const userRef = doc(db, "users", currentUser.uid);
  const docSnap = await getDoc(userRef);
  const today = getTodayString();

  if (!docSnap.exists()) return;

  const data = docSnap.data();
  const lastActiveDate = data.lastActiveDate || "";
  let streak = data.streak || 0;

  if (lastActiveDate === today) return;

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

function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekKey() {
  const now = new Date();
  const year = now.getFullYear();
  const firstDay = new Date(year, 0, 1);
  const pastDays = Math.floor((now - firstDay) / 86400000);
  const week = Math.ceil((pastDays + firstDay.getDay() + 1) / 7);
  return `${year}-W${week}`;
}

function isYesterday(previousDate, currentDate) {
  if (!previousDate || !currentDate) return false;

  const prev = new Date(previousDate + "T00:00:00");
  const curr = new Date(currentDate + "T00:00:00");
  const diff = curr.getTime() - prev.getTime();

  return diff === 24 * 60 * 60 * 1000;
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
  const popup = document.getElementById("guestLogoutPopup");
  if (popup) popup.classList.remove("active");
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
