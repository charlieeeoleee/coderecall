import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
const SELECTED_SUBJECT_KEY = "selectedSubject";
const validSubjects = new Set(["hardware", "electrical"]);

/* =========================
   SUBJECT PARAM
========================= */
const params = new URLSearchParams(window.location.search);
const subjectParam = (params.get("subject") || "").toLowerCase();
const savedSubject = (sessionStorage.getItem(SELECTED_SUBJECT_KEY) || "").toLowerCase();
const unlockMode = (params.get("unlock") || "").toLowerCase();
const subject = validSubjects.has(subjectParam)
  ? subjectParam
  : validSubjects.has(savedSubject)
    ? savedSubject
    : "electrical";

sessionStorage.setItem(SELECTED_SUBJECT_KEY, subject);

if (subjectParam !== subject) {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("subject", subject);
  window.history.replaceState({}, "", nextUrl);
}

/* SUBJECT META */
const subjectMeta = {
  electrical: {
    title: "ELECTRICAL WIRING AND ELECTRONICS CIRCUIT COMPONENTS",
    desc: "Take the pre-test, study the modules, answer quizzes, and finish the post-test."
  },
  hardware: {
    title: "COMPUTER HARDWARE",
    desc: "Take the pre-test, study the modules, answer quizzes, and finish the post-test."
  }
};

const meta = subjectMeta[subject] || {
  title: subject.toUpperCase(),
  desc: "Choose what you want to open."
};

document.getElementById("subjectTitle").textContent = meta.title;
document.getElementById("subjectDesc").textContent = meta.desc;

/* =========================
   NAVIGATION
========================= */
window.goBack = function () {
  window.location.href = "dashboard.html";
};

window.openPretest = function () {
  window.location.href = `quiz.html?subject=${subject}&level=easy&type=pretest`;
};

window.openModules = function () {
  window.location.href = `module-difficulty.html?subject=${subject}`;
};

window.openQuiz = function () {
  window.location.href = `quiz-difficulty.html?subject=${subject}`;
};

window.openPosttest = function () {
  window.location.href = `quiz.html?subject=${subject}&level=easy&type=posttest`;
};

/* =========================
   HELPERS
========================= */
function getProgressKey(name) {
  return `${subject}_${name}`;
}

function hasLocalCompletion(name) {
  const progressKey = getProgressKey(name);
  const resultDoneKey = `${progressKey}_done`;
  const attemptDoneKey = `${progressKey}_attempt_done`;

  return (
    localStorage.getItem(progressKey) === "true" ||
    localStorage.getItem(resultDoneKey) === "true" ||
    localStorage.getItem(attemptDoneKey) === "true"
  );
}

function unlockButton(buttonId) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;

  btn.classList.remove("locked");

  const badge = btn.querySelector(".lock-icon");
  if (badge) badge.remove();
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

async function getMergedProgress() {
  const localProgress = {
    [getProgressKey("pretest")]: hasLocalCompletion("pretest"),
    [getProgressKey("modules")]:
      hasLocalCompletion("modules") ||
      localStorage.getItem(`${subject}_easy_modules_done`) === "true" ||
      localStorage.getItem(`${subject}_medium_modules_done`) === "true" ||
      localStorage.getItem(`${subject}_hard_modules_done`) === "true",
    [getProgressKey("quiz")]:
      hasLocalCompletion("quiz") ||
      localStorage.getItem(`${subject}_hard_quiz`) === "true",
    [getProgressKey("posttest")]: hasLocalCompletion("posttest")
  };

  if (!currentUser) {
    return localProgress;
  }

  const userRef = await ensureUserDoc(currentUser.uid);
  const snap = await getDoc(userRef);
  const data = snap.data() || {};
  const firebaseProgress = data.progress || {};
  const firebaseResults = data.results || {};

  return {
    [getProgressKey("pretest")]:
      localProgress[getProgressKey("pretest")] ||
      firebaseProgress[getProgressKey("pretest")] === true ||
      firebaseResults[getProgressKey("pretest")] != null,

    [getProgressKey("modules")]:
      localProgress[getProgressKey("modules")] ||
      firebaseProgress[getProgressKey("modules")] === true ||
      firebaseProgress[`${subject}_easy_modules_done`] === true ||
      firebaseProgress[`${subject}_medium_modules_done`] === true ||
      firebaseProgress[`${subject}_hard_modules_done`] === true,

    [getProgressKey("quiz")]:
      localProgress[getProgressKey("quiz")] ||
      firebaseProgress[getProgressKey("quiz")] === true ||
      firebaseProgress[`${subject}_hard_quiz`] === true ||
      firebaseResults[getProgressKey("quiz")] != null,

    [getProgressKey("posttest")]:
      localProgress[getProgressKey("posttest")] ||
      firebaseProgress[getProgressKey("posttest")] === true ||
      firebaseResults[getProgressKey("posttest")] != null
  };
}

async function loadProgress() {
  if (unlockMode === "modules") {
    unlockButton("modulesBtn");
    return;
  }

  if (unlockMode === "quiz") {
    unlockButton("modulesBtn");
    unlockButton("quizzesBtn");
    return;
  }

  if (unlockMode === "all") {
    unlockButton("modulesBtn");
    unlockButton("quizzesBtn");
    unlockButton("posttestBtn");
    return;
  }

  const progress = await getMergedProgress();

  const pretestDone = progress[getProgressKey("pretest")] === true;
  const modulesDone = progress[getProgressKey("modules")] === true;
  const quizDone = progress[getProgressKey("quiz")] === true;

  if (pretestDone) {
    unlockButton("modulesBtn");
  }

  if (pretestDone && modulesDone) {
    unlockButton("quizzesBtn");
  }

  if (pretestDone && modulesDone && quizDone) {
    unlockButton("posttestBtn");
  }
}

/* =========================
   THEME
========================= */
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

/* =========================
   INIT
========================= */
loadTheme();
loadProgress().catch((error) => {
  console.error("Initial subject progress load failed:", error);
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user || null;
  try {
    await loadProgress();
  } catch (error) {
    console.error("Authenticated subject progress load failed:", error);
  }
});

function updateIcon() {
  const icon = document.getElementById("themeIcon");
  if (!icon) return;
  icon.textContent = document.body.classList.contains("light-mode") ? "\u2600\uFE0F" : "\uD83C\uDF19";
}

updateIcon();

initSounds();
initGlobalClickSound();
tryStartMusic();

document.body.addEventListener("click", () => {
  tryStartMusic();
}, { once: true });

window.addEventListener("DOMContentLoaded", () => {
  const cards = document.querySelectorAll(".subject-card");

  cards.forEach((card) => {
    card.addEventListener("pointerdown", (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      card.style.setProperty("--ripple-x", `${x}px`);
      card.style.setProperty("--ripple-y", `${y}px`);
    });
  });
});


