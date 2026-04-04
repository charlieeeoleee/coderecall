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

/* =========================
   SUBJECT PARAM
========================= */
const params = new URLSearchParams(window.location.search);
const subject = params.get("subject") || "electrical";

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
  window.location.href = `modules.html?subject=${subject}&level=easy`;
};

window.openQuiz = function () {
  window.location.href = `quiz-levels.html?subject=${subject}`;
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
    [getProgressKey("pretest")]: localStorage.getItem(getProgressKey("pretest")) === "true",
    [getProgressKey("modules")]: localStorage.getItem(getProgressKey("modules")) === "true",
    [getProgressKey("quiz")]: localStorage.getItem(getProgressKey("quiz")) === "true",
    [getProgressKey("posttest")]: localStorage.getItem(getProgressKey("posttest")) === "true"
  };

  if (!currentUser) {
    return localProgress;
  }

  const userRef = await ensureUserDoc(currentUser.uid);
  const snap = await getDoc(userRef);
  const data = snap.data() || {};
  const firebaseProgress = data.progress || {};

  return {
    [getProgressKey("pretest")]:
      localProgress[getProgressKey("pretest")] || firebaseProgress[getProgressKey("pretest")] === true,

    [getProgressKey("modules")]:
      localProgress[getProgressKey("modules")] || firebaseProgress[getProgressKey("modules")] === true,

    [getProgressKey("quiz")]:
      localProgress[getProgressKey("quiz")] || firebaseProgress[getProgressKey("quiz")] === true,

    [getProgressKey("posttest")]:
      localProgress[getProgressKey("posttest")] || firebaseProgress[getProgressKey("posttest")] === true
  };
}

async function loadProgress() {
  const progress = await getMergedProgress();

  const pretestDone = progress[getProgressKey("pretest")] === true;
  const modulesDone = progress[getProgressKey("modules")] === true;
  const quizDone = progress[getProgressKey("quiz")] === true;

  if (pretestDone) {
    unlockButton("modulesBtn");
  }

  if (modulesDone) {
    unlockButton("quizzesBtn");
  }

  if (quizDone) {
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

onAuthStateChanged(auth, async (user) => {
  currentUser = user || null;
  await loadProgress();
});

initSounds();
initGlobalClickSound();
tryStartMusic();

document.body.addEventListener("click", () => {
  tryStartMusic();
}, { once: true });