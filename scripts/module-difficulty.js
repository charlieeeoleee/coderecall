import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  initSounds,
  initGlobalClickSound,
  tryStartMusic,
  restartThemeMusic
} from "./sound.js";
import { MODULE_STRUCTURE } from "../data/module-data.js";

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
const unlockMode = (params.get("unlock") || "").toLowerCase();

let currentUser = null;

const subjectTitles = {
  electrical: "Electrical Module Difficulty",
  hardware: "Computer Hardware Module Difficulty"
};

const subjectDescriptions = {
  electrical: "Choose the difficulty for the Electrical modules before opening the lessons.",
  hardware: "Choose the difficulty for the Computer Hardware modules before opening the lessons."
};

document.getElementById("difficultyTitle").textContent =
  subjectTitles[subject] || "Choose Module Difficulty";

document.getElementById("difficultySubtitle").textContent =
  subjectDescriptions[subject] || "Select a difficulty before opening the modules.";

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

window.toggleTheme = function () {
  document.body.classList.toggle("light-mode");
  const mode = document.body.classList.contains("light-mode") ? "light" : "dark";
  localStorage.setItem("theme", mode);
  updateIcon();
  restartThemeMusic();
};

window.goBack = function () {
  const nextUrl = new URL("subject.html", window.location.href);
  nextUrl.searchParams.set("subject", subject);
  if (unlockMode) {
    nextUrl.searchParams.set("unlock", unlockMode);
  }
  window.location.href = `${nextUrl.pathname.split("/").pop()}${nextUrl.search}`;
};

window.openDifficulty = function (difficulty) {
  const nextUrl = new URL("module-levels.html", window.location.href);
  nextUrl.searchParams.set("subject", subject);
  nextUrl.searchParams.set("difficulty", difficulty);
  if (unlockMode) {
    nextUrl.searchParams.set("unlock", unlockMode);
  }
  window.location.href = `${nextUrl.pathname.split("/").pop()}${nextUrl.search}`;
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

function getDifficultySummaryKey(difficulty) {
  return `${subject}_${difficulty}_modules_done`;
}

function getDifficultyLegacyKey(difficulty) {
  return `${subject}_${difficulty}_modules_done`;
}

function hasAllLocalModules(difficulty) {
  const moduleCount = MODULE_STRUCTURE?.[subject]?.[difficulty] || 0;
  if (!moduleCount) return false;

  for (let index = 1; index <= moduleCount; index += 1) {
    if (localStorage.getItem(`${subject}_${difficulty}_module_${index}_done`) !== "true") {
      return false;
    }
  }

  return true;
}

function persistLocalDifficultyCompletion(difficulty) {
  localStorage.setItem(getDifficultySummaryKey(difficulty), "true");
  localStorage.setItem(getDifficultyLegacyKey(difficulty), "true");

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
}

function isDifficultyCompleteLocally(difficulty) {
  const summaryDone =
    localStorage.getItem(getDifficultySummaryKey(difficulty)) === "true" ||
    localStorage.getItem(getDifficultyLegacyKey(difficulty)) === "true" ||
    (difficulty === "easy" && localStorage.getItem(`${subject}_easy_modules_done`) === "true") ||
    (difficulty === "medium" && localStorage.getItem(`${subject}_medium_modules_done`) === "true") ||
    (difficulty === "hard" && localStorage.getItem(`${subject}_hard_modules_done`) === "true") ||
    (difficulty === "easy" && localStorage.getItem(`${subject}_modules`) === "true");

  if (summaryDone) {
    return true;
  }

  const allModulesDone = hasAllLocalModules(difficulty);
  if (allModulesDone) {
    persistLocalDifficultyCompletion(difficulty);
  }

  return allModulesDone;
}

async function getMergedProgress() {
  const localProgress = {
    easyDone: isDifficultyCompleteLocally("easy"),
    mediumDone: isDifficultyCompleteLocally("medium"),
    hardDone: isDifficultyCompleteLocally("hard")
  };

  if (!currentUser) {
    return localProgress;
  }

  const userRef = await ensureUserDoc(currentUser.uid);
  const snap = await getDoc(userRef);
  const data = snap.data() || {};
  const firebaseProgress = data.progress || {};

  const hasAllFirebaseModules = (difficulty) => {
    const moduleCount = MODULE_STRUCTURE?.[subject]?.[difficulty] || 0;
    if (!moduleCount) return false;

    for (let index = 1; index <= moduleCount; index += 1) {
      if (firebaseProgress[`${subject}_${difficulty}_module_${index}_done`] !== true) {
        return false;
      }
    }

    return true;
  };

  return {
    easyDone:
      localProgress.easyDone ||
      firebaseProgress[getDifficultySummaryKey("easy")] === true ||
      firebaseProgress[`${subject}_easy_modules_done`] === true ||
      firebaseProgress[`${subject}_modules`] === true ||
      hasAllFirebaseModules("easy"),
    mediumDone:
      localProgress.mediumDone ||
      firebaseProgress[getDifficultySummaryKey("medium")] === true ||
      firebaseProgress[`${subject}_medium_modules_done`] === true ||
      hasAllFirebaseModules("medium"),
    hardDone:
      localProgress.hardDone ||
      firebaseProgress[getDifficultySummaryKey("hard")] === true ||
      firebaseProgress[`${subject}_hard_modules_done`] === true ||
      hasAllFirebaseModules("hard")
  };
}

function unlockDifficulty(buttonId, difficulty, description) {
  const button = document.getElementById(buttonId);
  if (!button) return;

  button.classList.remove("locked");
  button.onclick = () => openDifficulty(difficulty);

  const copy = button.querySelector("p");
  if (copy) {
    copy.textContent = description;
  }
}

async function applyDifficultyUnlocks() {
  unlockDifficulty("easyBtn", "easy", "Basic concepts and simple lessons.");

  if (unlockMode === "all" || unlockMode === "modules") {
    unlockDifficulty("mediumBtn", "medium", "More advanced lessons and deeper understanding.");
    unlockDifficulty("hardBtn", "hard", "Advanced and challenging lessons for mastery.");
    return;
  }

  const progress = await getMergedProgress();

  if (progress.easyDone) {
    unlockDifficulty("mediumBtn", "medium", "More advanced lessons and deeper understanding.");
  }

  if (progress.mediumDone) {
    unlockDifficulty("hardBtn", "hard", "Advanced and challenging lessons for mastery.");
  }
}

loadTheme();

onAuthStateChanged(auth, async (user) => {
  currentUser = user || null;
  await applyDifficultyUnlocks();
});

initSounds();
initGlobalClickSound();
tryStartMusic();

document.body.addEventListener("click", () => {
  tryStartMusic();
}, { once: true });
