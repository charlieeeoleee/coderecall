import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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

let currentUser = null;

const subjectTitles = {
  electrical: "Electrical Quiz Difficulty",
  hardware: "Computer Hardware Quiz Difficulty"
};

const subjectDescriptions = {
  electrical: "Each quiz difficulty unlocks after finishing the matching module difficulty.",
  hardware: "Each quiz difficulty unlocks after finishing the matching module difficulty."
};

document.getElementById("difficultyTitle").textContent =
  subjectTitles[subject] || "Choose Difficulty";

document.getElementById("difficultySubtitle").textContent =
  subjectDescriptions[subject] || "Select a difficulty before starting the quiz.";

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
  window.location.href = `subject.html?subject=${subject}`;
};

window.openDifficulty = function (difficulty) {
  window.location.href = `quiz-levels.html?subject=${subject}&difficulty=${difficulty}`;
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

function getModuleDoneKey(difficulty) {
  return `${subject}_${difficulty}_modules_done`;
}

async function getMergedProgress() {
  const localProgress = {
    easyModulesDone:
      localStorage.getItem(getModuleDoneKey("easy")) === "true" ||
      localStorage.getItem(`${subject}_modules`) === "true",
    mediumModulesDone:
      localStorage.getItem(getModuleDoneKey("medium")) === "true",
    hardModulesDone:
      localStorage.getItem(getModuleDoneKey("hard")) === "true"
  };

  if (!currentUser) {
    return localProgress;
  }

  const userRef = await ensureUserDoc(currentUser.uid);
  const snap = await getDoc(userRef);
  const data = snap.data() || {};
  const firebaseProgress = data.progress || {};

  return {
    easyModulesDone:
      localProgress.easyModulesDone ||
      firebaseProgress[getModuleDoneKey("easy")] === true ||
      firebaseProgress[`${subject}_modules`] === true,
    mediumModulesDone:
      localProgress.mediumModulesDone ||
      firebaseProgress[getModuleDoneKey("medium")] === true,
    hardModulesDone:
      localProgress.hardModulesDone ||
      firebaseProgress[getModuleDoneKey("hard")] === true
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
  const progress = await getMergedProgress();

  if (progress.easyModulesDone) {
    unlockDifficulty("easyBtn", "easy", "Basic concepts and simple recall questions.");
  }

  if (progress.mediumModulesDone) {
    unlockDifficulty("mediumBtn", "medium", "More challenging items that require better understanding.");
  }

  if (progress.hardModulesDone) {
    unlockDifficulty("hardBtn", "hard", "Advanced and tricky questions for mastery.");
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
