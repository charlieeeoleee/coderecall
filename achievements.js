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

/* FIREBASE CONFIG */
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

/* SOUND */
const badgeSound = new Audio("assets/sounds/badge-unlock.mp3");

/* BADGES DATA */
const badges = [
  {
    name: "First Win",
    icon: "🥇",
    xp: 0,
    description: "Started your learning journey."
  },
  {
    name: "Rookie",
    icon: "🎯",
    xp: 50,
    description: "Earned your first 50 XP."
  },
  {
    name: "Learner",
    icon: "📘",
    xp: 100,
    description: "Reached 100 XP milestone."
  },
  {
    name: "Intermediate",
    icon: "⚡",
    xp: 200,
    description: "Your progress is becoming stronger."
  },
  {
    name: "Pro",
    icon: "🔥",
    xp: 300,
    description: "A serious learner with strong momentum."
  },
  {
    name: "Master",
    icon: "👑",
    xp: 500,
    description: "Top-tier mastery unlocked."
  }
];

/* AUTH */
onAuthStateChanged(auth, async (user) => {
  const isGuest = localStorage.getItem("guest") === "true";

  if (user) {
    await loadRealUser(user);
  } else if (isGuest) {
    loadGuestUser();
  } else {
    window.location.href = "auth.html";
  }
});

/* REAL USER */
async function loadRealUser(user) {
  const userRef = doc(db, "users", user.uid);
  const docSnap = await getDoc(userRef);

  let xp = 0;
  let name = user.displayName || user.email || "User";
  let photo = user.photoURL || "https://i.pravatar.cc/40?img=12";

  if (!docSnap.exists()) {
    await setDoc(userRef, {
      xp: 0,
      name,
      photo,
      email: user.email || ""
    });
  } else {
    const data = docSnap.data();
    xp = data.xp || 0;
    name = user.displayName || data.name || user.email || "User";
    photo = user.photoURL || data.photo || "https://i.pravatar.cc/40?img=12";
  }

  updateUserUI(name, photo);
  renderBadges(xp);
}

/* GUEST */
function loadGuestUser() {
  const xp = parseInt(localStorage.getItem("guest_xp")) || 0;
  updateUserUI("Guest", "https://i.pravatar.cc/40?img=8");
  renderBadges(xp);
}

/* UI */
function updateUserUI(name, photo) {
  document.getElementById("username").textContent = name;
  document.getElementById("userPhoto").src = photo;
}

/* RENDER BADGES */
function renderBadges(xp) {
  const grid = document.getElementById("badgesGrid");
  grid.innerHTML = "";

  let unlocked = 0;

  badges.forEach((badge) => {
    const isUnlocked = xp >= badge.xp;
    if (isUnlocked) unlocked++;

    const card = document.createElement("button");
    card.className = `badge-card ${isUnlocked ? "unlocked" : "locked"}`;

    card.innerHTML = `
      <div class="badge-state">${isUnlocked ? "Unlocked" : "Locked"}</div>
      <div class="badge-icon">${badge.icon}</div>
      <div class="badge-name">${badge.name}</div>
      <div class="badge-desc">${badge.description}</div>
      <div class="badge-xp">${badge.xp} XP</div>
    `;

    card.addEventListener("click", () => openBadgeModal(badge, isUnlocked));
    grid.appendChild(card);
  });

  const percent = Math.round((unlocked / badges.length) * 100);

  document.getElementById("achievementCount").textContent = `${unlocked}/${badges.length}`;
  document.getElementById("xpValue").textContent = xp;
  document.getElementById("progressFill").style.width = `${percent}%`;
  document.getElementById("progressPercent").textContent = `${percent}%`;
}

/* MODAL */
function openBadgeModal(badge, unlocked) {
  const modal = document.getElementById("badgeModal");
  document.getElementById("modalIcon").textContent = badge.icon;
  document.getElementById("modalTitle").textContent = badge.name;
  document.getElementById("modalDesc").textContent = unlocked
    ? badge.description
    : "Keep learning to unlock this badge!";
  document.getElementById("modalXP").textContent = `${badge.xp} XP`;

  const modalState = document.getElementById("modalState");
  modalState.textContent = unlocked ? "Unlocked" : "Locked";
  modalState.className = `modal-state ${unlocked ? "" : "locked"}`;

  modal.classList.add("active");

  if (unlocked) {
    playBadgeSound();
    launchConfetti();
  }
}

window.closeBadgeModal = function() {
  document.getElementById("badgeModal").classList.remove("active");
};

window.addEventListener("click", (e) => {
  const modal = document.getElementById("badgeModal");
  if (e.target === modal) {
    modal.classList.remove("active");
  }
});

/* SOUND */
function playBadgeSound() {
  const soundEnabled = localStorage.getItem("soundEnabled");
  if (soundEnabled === "false") return;

  badgeSound.currentTime = 0;
  badgeSound.play().catch(() => {});
}

/* CONFETTI */
function launchConfetti() {
  const container = document.getElementById("confettiContainer");
  container.innerHTML = "";

  const colors = ["#ff2e97", "#00e5ff", "#00ffcc", "#ff8c00", "#ffffff"];

  for (let i = 0; i < 80; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = Math.random() * 100 + "vw";
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDuration = (2 + Math.random() * 2) + "s";
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    container.appendChild(piece);
  }

  setTimeout(() => {
    container.innerHTML = "";
  }, 4000);
}

/* LOGOUT */
window.logout = async function() {
  localStorage.removeItem("guest");

  if (auth.currentUser) {
    await signOut(auth);
  }

  window.location.href = "auth.html";
};

/* THEME */
window.toggleTheme = function() {
  document.body.classList.toggle("light-mode");
  const mode = document.body.classList.contains("light-mode") ? "light" : "dark";
  localStorage.setItem("theme", mode);
  updateIcon();
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

loadTheme();