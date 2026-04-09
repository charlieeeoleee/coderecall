import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  initSounds,
  initGlobalClickSound,
  tryStartMusic,
  restartThemeMusic
} from "./sound.js";

function chunkPublishedQuizLevels(items, chunkSize = 3) {
  const chunks = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

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

const QUIZ_LEVEL_COUNTS = {
  electrical: { easy: 25, medium: 25, hard: 25 },
  hardware: { easy: 23, medium: 25, hard: 25 }
};

const STATIC_LEVELS = QUIZ_LEVEL_COUNTS[subject]?.[difficulty] || 25;
const XP_PER_LEVEL = 6;

let currentUser = null;
let publishedQuizLevelGroups = [];
let totalLevels = STATIC_LEVELS;

const subjectLabels = {
  electrical: "Electrical Quiz Levels",
  hardware: "Computer Hardware Quiz Levels"
};

document.getElementById("levelsTitle").textContent =
  `${subjectLabels[subject] || "Quiz Levels"} - ${difficulty.charAt(0).toUpperCase()}${difficulty.slice(1)}`;

function getLevelKey(level) {
  return `${subject}_${difficulty}_quiz_level_${level}_done`;
}

function getLegacyLevelKey(level) {
  return `${subject}_quiz_level_${level}_done`;
}

function getOverallQuizKey() {
  return `${subject}_${difficulty}_quiz`;
}

function getLegacyOverallQuizKey() {
  return `${subject}_quiz`;
}

function updateIcon() {
  const icon = document.getElementById("themeIcon");
  if (!icon) return;
  icon.textContent = document.body.classList.contains("light-mode") ? "\u2600\uFE0F" : "\uD83C\uDF19";
}

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

window.goBackToSubject = function() {
  window.location.href = `quiz-difficulty.html?subject=${subject}`;
};

async function loadPublishedQuizLevels() {
  const publishedQuestions = [];
  publishedQuizLevelGroups = chunkPublishedQuizLevels(publishedQuestions.filter((item) => Array.isArray(item.choices) && item.choices.length >= 2));
  totalLevels = STATIC_LEVELS + publishedQuizLevelGroups.length;
}

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

  for (let i = 1; i <= totalLevels; i++) {
    progress[getLevelKey(i)] =
      localStorage.getItem(getLevelKey(i)) === "true" ||
      (difficulty === "easy" && localStorage.getItem(getLegacyLevelKey(i)) === "true");
  }

  progress[getOverallQuizKey()] =
    localStorage.getItem(getOverallQuizKey()) === "true" ||
    (difficulty === "easy" && localStorage.getItem(getLegacyOverallQuizKey()) === "true");

  if (!currentUser) return progress;

  const userRef = await ensureUserDoc(currentUser.uid);
  const snap = await getDoc(userRef);
  const data = snap.data() || {};
  const firebaseProgress = data.progress || {};

  for (let i = 1; i <= totalLevels; i++) {
    if (
      firebaseProgress[getLevelKey(i)] === true ||
      (difficulty === "easy" && firebaseProgress[getLegacyLevelKey(i)] === true)
    ) {
      progress[getLevelKey(i)] = true;
    }
  }

  if (
    firebaseProgress[getOverallQuizKey()] === true ||
    (difficulty === "easy" && firebaseProgress[getLegacyOverallQuizKey()] === true)
  ) {
    progress[getOverallQuizKey()] = true;
  }

  return progress;
}

async function syncOverallQuizCompletion(progress) {
  const allDone = Array.from({ length: totalLevels }, (_, idx) => idx + 1)
    .every((level) => progress[getLevelKey(level)] === true);

  if (!allDone || !totalLevels) return;

  localStorage.setItem(getOverallQuizKey(), "true");
  if (difficulty === "hard") {
    localStorage.setItem(getLegacyOverallQuizKey(), "true");
  }

  if (currentUser) {
    const userRef = await ensureUserDoc(currentUser.uid);
    const snap = await getDoc(userRef);
    const data = snap.data() || {};
    const existingProgress = data.progress || {};
    existingProgress[getOverallQuizKey()] = true;
    if (difficulty === "hard") {
      existingProgress[getLegacyOverallQuizKey()] = true;
    }

    await updateDoc(userRef, {
      progress: existingProgress
    });
  }
}

async function renderLevels() {
  await loadPublishedQuizLevels();

  const progress = await getUserProgress();
  const grid = document.getElementById("levelsGrid");
  grid.innerHTML = "";

  let completedCount = 0;

  for (let i = 1; i <= totalLevels; i++) {
    const done = progress[getLevelKey(i)] === true;
    if (done) completedCount++;
  }

  const earnedXP = completedCount * XP_PER_LEVEL;
  const percent = totalLevels ? Math.round((completedCount / totalLevels) * 100) : 0;

  document.getElementById("completedLevelsText").textContent = `${completedCount} / ${totalLevels}`;
  document.getElementById("earnedQuizXPText").textContent = `${earnedXP} XP`;
  document.getElementById("levelsPercentText").textContent = `${percent}%`;

  for (let level = 1; level <= totalLevels; level++) {
    const done = progress[getLevelKey(level)] === true;
    const unlocked = level === 1 || progress[getLevelKey(level - 1)] === true;
    const isPublishedLevel = level > STATIC_LEVELS;

    const card = document.createElement("button");
    card.className = `level-card ${done ? "completed" : unlocked ? "unlocked" : "locked"}`;

    card.innerHTML = `
      <div class="level-status">${done ? "&#10004;" : unlocked ? "&#128275;" : "&#128274;"}</div>
      <div class="level-number">Level ${level}</div>
      <div class="level-meta">${isPublishedLevel ? "Published content" : "3 Questions"} &bull; 6 XP</div>
    `;

    if (unlocked) {
      card.addEventListener("click", () => {
        window.location.href = `quiz-level.html?subject=${subject}&difficulty=${difficulty}&quizLevel=${level}`;
      });
    }

    grid.appendChild(card);
  }

  await syncOverallQuizCompletion(progress);
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
