import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  initSounds,
  initGlobalClickSound,
  tryStartMusic,
  restartThemeMusic
} from "./sound.js";

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

const params = new URLSearchParams(window.location.search);
const subject = params.get("subject") || "electrical";
const difficulty = params.get("difficulty") || "easy";

const TOTAL_LEVELS = 5;

let currentUser = null;

const subjectLabels = {
  electrical: "Electrical Module Levels",
  hardware: "Computer Hardware Module Levels"
};

document.getElementById("levelsTitle").textContent = subjectLabels[subject] || "Module Levels";
document.getElementById("difficultyText").textContent =
  difficulty.charAt(0).toUpperCase() + difficulty.slice(1);

function getLevelKey(level) {
  return `${subject}_${difficulty}_module_${level}_done`;
}

function getOverallModulesKey() {
  return `${subject}_${difficulty}_modules_done`;
}

function updateIcon() {
  const icon = document.getElementById("themeIcon");
  if (!icon) return;
  icon.textContent = document.body.classList.contains("light-mode") ? "☀️" : "🌙";
}

function loadTheme() {
  const saved = localStorage.getItem("theme");
  if (saved === "light") {
    document.body.classList.add("light-mode");
  }
  updateIcon();
}

window.toggleTheme = function () {
  document.body.classList.toggle("light-mode");
  const mode = document.body.classList.contains("light-mode") ? "light" : "dark";
  localStorage.setItem("theme", mode);
  updateIcon();
  restartThemeMusic();
};

window.goBackToDifficulty = function () {
  window.location.href = `module-difficulty.html?subject=${subject}`;
};

async function ensureUserDoc(uid) {
  const userRef = doc(db, "users", uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    await setDoc(userRef, {
      xp: 0,
      progress: {},
      results: {},
      createdAt: new Date().toISOString()
    });
  }

  return userRef;
}

async function getUserProgress() {
  const progress = {};

  for (let i = 1; i <= TOTAL_LEVELS; i++) {
    progress[getLevelKey(i)] = localStorage.getItem(getLevelKey(i)) === "true";
  }

  progress[getOverallModulesKey()] = localStorage.getItem(getOverallModulesKey()) === "true";

  if (!currentUser) return progress;

  const userRef = await ensureUserDoc(currentUser.uid);
  const snap = await getDoc(userRef);
  const data = snap.data() || {};
  const firebaseProgress = data.progress || {};

  for (let i = 1; i <= TOTAL_LEVELS; i++) {
    if (firebaseProgress[getLevelKey(i)] === true) {
      progress[getLevelKey(i)] = true;
    }
  }

  if (firebaseProgress[getOverallModulesKey()] === true) {
    progress[getOverallModulesKey()] = true;
  }

  return progress;
}

async function syncOverallModulesCompletion(progress) {
  const allDone = Array.from({ length: TOTAL_LEVELS }, (_, idx) => idx + 1)
    .every((level) => progress[getLevelKey(level)] === true);

  if (!allDone) return;

  localStorage.setItem(getOverallModulesKey(), "true");

  if (difficulty === "easy") {
    localStorage.setItem(`${subject}_easy_modules_done`, "true");
  }

  if (difficulty === "medium") {
    localStorage.setItem(`${subject}_medium_modules_done`, "true");
  }

  if (currentUser) {
    const userRef = await ensureUserDoc(currentUser.uid);
    const snap = await getDoc(userRef);
    const data = snap.data() || {};
    const existingProgress = data.progress || {};

    existingProgress[getOverallModulesKey()] = true;

    if (difficulty === "easy") {
      existingProgress[`${subject}_easy_modules_done`] = true;
    }

    if (difficulty === "medium") {
      existingProgress[`${subject}_medium_modules_done`] = true;
    }

    await updateDoc(userRef, {
      progress: existingProgress
    });
  }
}

async function renderLevels() {
  const progress = await getUserProgress();
  const grid = document.getElementById("levelsGrid");
  grid.innerHTML = "";

  let completedCount = 0;

  for (let i = 1; i <= TOTAL_LEVELS; i++) {
    const done = progress[getLevelKey(i)] === true;
    if (done) completedCount++;
  }

  const percent = Math.round((completedCount / TOTAL_LEVELS) * 100);

  document.getElementById("completedLevelsText").textContent = `${completedCount} / ${TOTAL_LEVELS}`;
  document.getElementById("levelsPercentText").textContent = `${percent}%`;

  for (let level = 1; level <= TOTAL_LEVELS; level++) {
    const done = progress[getLevelKey(level)] === true;
    const unlocked = level === 1 || progress[getLevelKey(level - 1)] === true;

    const card = document.createElement("button");
    card.className = `level-card ${done ? "completed" : unlocked ? "unlocked" : "locked"}`;

    card.innerHTML = `
      <div class="level-status">${done ? "✅" : unlocked ? "📘" : "🔒"}</div>
      <div class="level-number">Module ${level}</div>
      <div class="level-meta">Lesson Content</div>
    `;

    if (unlocked) {
      card.addEventListener("click", () => {
        window.location.href = `module.html?subject=${subject}&difficulty=${difficulty}&module=module${level}`;
      });
    }

    grid.appendChild(card);
  }

  await syncOverallModulesCompletion(progress);
}

onAuthStateChanged(auth, async (user) => {
  currentUser = user || null;
  await renderLevels();
});

loadTheme();

initSounds();
initGlobalClickSound();
tryStartMusic();

document.body.addEventListener("click", () => {
  tryStartMusic();
}, { once: true });
