import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  initSounds,
  initGlobalClickSound,
  tryStartMusic,
  restartThemeMusic
} from "./sound.js";
import { MODULE_CATALOG, MODULE_STRUCTURE } from "../data/module-data.js";
import { fetchPublishedModules } from "./published-content.js";

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

let currentUser = null;
let publishedModules = [];
let totalLevels = MODULE_STRUCTURE[subject]?.[difficulty] || 0;

const subjectLabels = {
  electrical: "Electrical Module Levels",
  hardware: "Computer Hardware Module Levels"
};

const STATIC_LEVELS = MODULE_STRUCTURE[subject]?.[difficulty] || 0;
const MODULE_XP_REWARD = 5;
const RECENT_MODULE_COMPLETION_KEY = "recent_module_completion";
const DIFFICULTY_ORDER = ["easy", "medium", "hard"];

document.getElementById("levelsTitle").textContent = subjectLabels[subject] || "Module Levels";
document.getElementById("difficultyText").textContent = formatDifficultyLabel(difficulty);

function formatDifficultyLabel(level) {
  return level === "hard" ? "Difficult" : level.charAt(0).toUpperCase() + level.slice(1);
}

function getNextDifficulty(currentDifficulty) {
  const currentIndex = DIFFICULTY_ORDER.indexOf(currentDifficulty);
  if (currentIndex === -1 || currentIndex >= DIFFICULTY_ORDER.length - 1) {
    return null;
  }

  return DIFFICULTY_ORDER[currentIndex + 1];
}

function getLevelKey(level) {
  return `${subject}_${difficulty}_module_${level}_done`;
}

function getOverallModulesKey() {
  return `${subject}_${difficulty}_modules_done`;
}

function getRecentCompletion() {
  const raw = localStorage.getItem(RECENT_MODULE_COMPLETION_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (parsed?.subject === subject && parsed?.difficulty === difficulty) {
      return parsed;
    }
  } catch (error) {
    console.warn("Failed to parse recent module completion.", error);
  }

  return null;
}

function clearRecentCompletion() {
  localStorage.removeItem(RECENT_MODULE_COMPLETION_KEY);
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

window.goBackToDifficulty = function() {
  window.location.href = `module-difficulty.html?subject=${subject}`;
};

window.goToNextDifficulty = function() {
  const nextDifficulty = getNextDifficulty(difficulty);
  if (!nextDifficulty) return;
  window.location.href = `module-levels.html?subject=${subject}&difficulty=${nextDifficulty}`;
};

async function loadPublishedModuleEntries() {
  publishedModules = await fetchPublishedModules(db, { subject, difficulty });
  totalLevels = STATIC_LEVELS + publishedModules.length;
}

function getModuleEntry(level) {
  if (level <= STATIC_LEVELS) {
    return MODULE_CATALOG[subject]?.[difficulty]?.[`module${level}`] || null;
  }

  return publishedModules[level - STATIC_LEVELS - 1] || null;
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
    progress[getLevelKey(i)] = localStorage.getItem(getLevelKey(i)) === "true";
  }

  progress[getOverallModulesKey()] = localStorage.getItem(getOverallModulesKey()) === "true";

  if (!currentUser) return progress;

  const userRef = await ensureUserDoc(currentUser.uid);
  const snap = await getDoc(userRef);
  const data = snap.data() || {};
  const firebaseProgress = data.progress || {};

  for (let i = 1; i <= totalLevels; i++) {
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
  const allDone = Array.from({ length: totalLevels }, (_, idx) => idx + 1)
    .every((level) => progress[getLevelKey(level)] === true);

  if (!allDone || !totalLevels) return;

  localStorage.setItem(getOverallModulesKey(), "true");

  if (difficulty === "easy") {
    localStorage.setItem(`${subject}_easy_modules_done`, "true");
    localStorage.setItem(`${subject}_modules`, "true");
  }

  if (difficulty === "medium") {
    localStorage.setItem(`${subject}_medium_modules_done`, "true");
  }

  if (difficulty === "hard") {
    localStorage.setItem(`${subject}_hard_modules_done`, "true");
  }

  if (currentUser) {
    const userRef = await ensureUserDoc(currentUser.uid);
    const snap = await getDoc(userRef);
    const data = snap.data() || {};
    const existingProgress = data.progress || {};

    existingProgress[getOverallModulesKey()] = true;

    if (difficulty === "easy") {
      existingProgress[`${subject}_easy_modules_done`] = true;
      existingProgress[`${subject}_modules`] = true;
    }

    if (difficulty === "medium") {
      existingProgress[`${subject}_medium_modules_done`] = true;
    }

    if (difficulty === "hard") {
      existingProgress[`${subject}_hard_modules_done`] = true;
    }

    await updateDoc(userRef, {
      progress: existingProgress
    });
  }
}

async function renderLevels() {
  await loadPublishedModuleEntries();

  const progress = await getUserProgress();
  const recentCompletion = getRecentCompletion();
  const grid = document.getElementById("levelsGrid");
  const progressFill = document.getElementById("levelsProgressFill");
  const statusText = document.getElementById("levelsStatusText");
  const progressNote = document.getElementById("levelsProgressNote");
  const celebration = document.getElementById("levelsCelebration");
  const celebrationTitle = document.getElementById("levelsCelebrationTitle");
  const celebrationCopy = document.getElementById("levelsCelebrationCopy");
  const nextDifficultyBtn = document.getElementById("nextDifficultyBtn");
  const nextDifficulty = getNextDifficulty(difficulty);

  grid.innerHTML = "";

  if (!totalLevels) {
    document.getElementById("completedLevelsText").textContent = "0 / 0";
    document.getElementById("levelsPercentText").textContent = "0%";
    progressFill.style.width = "0%";
    statusText.textContent = "No modules ready";
    progressNote.textContent = "This difficulty does not have any configured modules yet.";
    celebration.hidden = true;
    if (nextDifficultyBtn) {
      nextDifficultyBtn.hidden = true;
    }
    grid.innerHTML = `<div class="level-empty">No modules are configured for this difficulty yet.</div>`;
    return;
  }

  let completedCount = 0;

  for (let i = 1; i <= totalLevels; i++) {
    const done = progress[getLevelKey(i)] === true;
    if (done) completedCount++;
  }

  const percent = Math.round((completedCount / totalLevels) * 100);

  document.getElementById("completedLevelsText").textContent = `${completedCount} / ${totalLevels}`;
  document.getElementById("levelsPercentText").textContent = `${percent}%`;
  progressFill.style.width = `${percent}%`;

  const nextUnlockedLevel = Array.from({ length: totalLevels }, (_, idx) => idx + 1)
    .find((level) => progress[getLevelKey(level)] !== true);

  if (completedCount === totalLevels) {
    statusText.textContent = "Difficulty cleared";
    progressNote.textContent = `All ${totalLevels} modules in this difficulty are complete. You can review any lesson or move to the next challenge.`;
  } else if (nextUnlockedLevel) {
    statusText.textContent = `Module ${nextUnlockedLevel} is ready`;
    progressNote.textContent = `Complete modules in order. Finishing Module ${nextUnlockedLevel} will keep your mission going and rewards ${MODULE_XP_REWARD} XP.`;
  } else {
    statusText.textContent = "Keep progressing";
    progressNote.textContent = "Finish the next available module to continue this difficulty path.";
  }

  if (nextDifficultyBtn) {
    if (nextDifficulty) {
      nextDifficultyBtn.hidden = false;
      nextDifficultyBtn.disabled = completedCount !== totalLevels;
      nextDifficultyBtn.textContent = completedCount === totalLevels
        ? `Next: ${formatDifficultyLabel(nextDifficulty)}`
        : `Unlock ${formatDifficultyLabel(nextDifficulty)}`;
      nextDifficultyBtn.onclick = () => {
        if (completedCount === totalLevels) {
          goToNextDifficulty();
        }
      };
    } else {
      nextDifficultyBtn.hidden = true;
    }
  }

  if (recentCompletion) {
    celebration.hidden = false;
    celebrationTitle.textContent = `${recentCompletion.title || `Module ${recentCompletion.module}`} cleared`;
    celebrationCopy.textContent = `Great work. Module ${recentCompletion.module} is complete and ${recentCompletion.xp || MODULE_XP_REWARD} XP has been added to the learner's progress.`;
  } else {
    celebration.hidden = true;
  }

  for (let level = 1; level <= totalLevels; level++) {
    const done = progress[getLevelKey(level)] === true;
    const unlocked = level === 1 || progress[getLevelKey(level - 1)] === true;
    const moduleData = getModuleEntry(level);
    const stateLabel = done ? "Cleared" : unlocked ? "Ready" : "Locked";
    const statusLine = done ? "Mission Complete" : unlocked ? "Open Lesson" : "Locked Path";
    const stateCopy = done
      ? "Checkpoint complete. Open this lesson any time if you want to review the material."
      : unlocked
        ? "This module is available now. Open it, read through the lesson, and reach the end to auto-clear the checkpoint."
        : `Finish Module ${level - 1} first to unlock this lesson.`;
    const actionLabel = done ? "Review" : unlocked ? "Start" : "Locked";

    const card = document.createElement("button");
    card.className = `level-card ${done ? "completed" : unlocked ? "unlocked" : "locked"}`;
    if (recentCompletion?.module === level && done) {
      card.classList.add("recent-complete");
    }
    card.type = "button";
    card.disabled = !unlocked;

    card.innerHTML = `
      <div class="level-topline">
        <span class="level-badge">${stateLabel}</span>
        <span class="level-status">${statusLine}</span>
      </div>
      <div class="level-number">Module ${level}</div>
      <div class="level-meta">${moduleData?.title || "Lesson Content"}</div>
      <div class="level-state-copy">${stateCopy}</div>
      <div class="level-footer">
        <span class="level-xp">+${MODULE_XP_REWARD} XP</span>
        <span class="level-action">${actionLabel}</span>
      </div>
    `;

    if (unlocked) {
      card.addEventListener("click", () => {
        window.location.href = `module.html?subject=${subject}&difficulty=${difficulty}&module=module${level}`;
      });
    }

    grid.appendChild(card);
  }

  await syncOverallModulesCompletion(progress);

  if (recentCompletion) {
    setTimeout(() => {
      clearRecentCompletion();
    }, 1200);
  }
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
