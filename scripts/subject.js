import { app } from "./firebase-config.js";
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

const QUIZ_LEVEL_COUNTS = { easy: 25, medium: 25, hard: 25 };
const QUIZ_LEVEL_QUESTIONS = 3;
const QUIZ_LEVEL_XP_PER_CORRECT = 2;
const QUIZ_TRACK_MAX_LEVELS = Object.values(QUIZ_LEVEL_COUNTS).reduce((sum, count) => sum + count, 0);
const QUIZ_TRACK_MAX_SCORE = QUIZ_TRACK_MAX_LEVELS * QUIZ_LEVEL_QUESTIONS;
const QUIZ_TRACK_MAX_XP = QUIZ_TRACK_MAX_SCORE * QUIZ_LEVEL_XP_PER_CORRECT;

function showSubjectNotice(message) {
  const modal = document.getElementById("subjectNoticeModal");
  const text = document.getElementById("subjectNoticeText");
  const button = document.getElementById("subjectNoticeBtn");

  if (!modal || !text || !button) {
    return;
  }

  text.textContent = message;
  modal.classList.add("active");
  button.onclick = () => {
    modal.classList.remove("active");
  };
}

/* =========================
   NAVIGATION
========================= */
window.goBack = function () {
  window.location.href = "dashboard.html";
};

function hasCompletedPretest() {
  return hasLocalCompletion("pretest");
}

window.openPretest = function () {
  if (hasCompletedPretest()) {
    showSubjectNotice("You already took the pre-test.");
    return;
  }
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

function getCertificateUrl(mode = "") {
  const url = new URL("certificate.html", window.location.href);
  url.searchParams.set("subject", subject);
  if (mode) {
    url.searchParams.set("mode", mode);
  }
  return `${url.pathname.split("/").pop()}${url.search}`;
}

function showCertificatePanel(completionDate = "") {
  const panel = document.getElementById("subjectCertificatePanel");
  const text = document.getElementById("subjectCertificateText");
  if (!panel || !text) return;

  const dateLabel = completionDate
    ? new Date(completionDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric"
      })
    : "today";

  text.textContent = `You completed this subject on ${dateLabel}. Open your certificate to preview it or download a copy.`;
  panel.hidden = false;
}

window.openCertificateView = function(mode = "") {
  window.location.href = getCertificateUrl(mode);
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

function readLocalAssessmentResult(stage) {
  const score = Number(localStorage.getItem(`${subject}_${stage}_score`) || 0);
  const total = Number(localStorage.getItem(`${subject}_${stage}_total`) || 0);
  const percent = Number(localStorage.getItem(`${subject}_${stage}_percent`) || 0);
  const xpEarned = Number(localStorage.getItem(`${subject}_${stage}_xp_awarded`) || 0);
  const completedAt = localStorage.getItem(`${subject}_${stage}_completedAt`) || "";
  const done = localStorage.getItem(`${subject}_${stage}_done`) === "true";

  if (!done && !completedAt && !score && !percent && !xpEarned) {
    return null;
  }

  return {
    subject,
    type: stage,
    score,
    total,
    percent,
    xpEarned,
    completedAt
  };
}

function readLocalQuizTrackResults() {
  const results = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index) || "";
    if (!new RegExp(`^${subject}_(easy|medium|hard)_quiz_level_\\d+_result$`).test(key)) continue;
    try {
      results[key] = JSON.parse(localStorage.getItem(key) || "null");
    } catch {
      results[key] = null;
    }
  }
  return results;
}

function summarizeQuizTrack(allResults = {}) {
  const quizEntries = Object.entries(allResults).filter(([key, value]) => {
    return new RegExp(`^${subject}_(easy|medium|hard)_quiz_level_\\d+_result$`).test(key) && value;
  });

  const levelsCleared = quizEntries.length;
  const totalCorrect = quizEntries.reduce((sum, [, value]) => sum + Number(value.score || 0), 0);
  const totalQuestions = quizEntries.reduce((sum, [, value]) => sum + Number(value.total || QUIZ_LEVEL_QUESTIONS), 0);
  const xpEarned = totalCorrect * QUIZ_LEVEL_XP_PER_CORRECT;
  const scorePercent = totalQuestions ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
  const xpPercent = QUIZ_TRACK_MAX_XP ? Math.round((xpEarned / QUIZ_TRACK_MAX_XP) * 100) : 0;

  return {
    levelsCleared,
    totalCorrect,
    totalQuestions,
    xpEarned,
    scorePercent,
    xpPercent
  };
}

function renderAssessmentCard(prefix, payload) {
  const stateEl = document.getElementById(`${prefix}State`);
  const scoreEl = document.getElementById(`${prefix}Score`);
  const xpEl = document.getElementById(`${prefix}XP`);
  const scoreFill = document.getElementById(`${prefix}ScoreFill`);
  const xpFill = document.getElementById(`${prefix}XpFill`);
  if (!stateEl || !scoreEl || !xpEl || !scoreFill || !xpFill) return;

  stateEl.textContent = payload.state;
  scoreEl.textContent = payload.scoreLabel;
  xpEl.textContent = payload.xpLabel;
  scoreFill.style.width = `${Math.max(0, Math.min(100, Number(payload.scorePercent || 0)))}%`;
  xpFill.style.width = `${Math.max(0, Math.min(100, Number(payload.xpPercent || 0)))}%`;
}

async function renderAssessmentOverview() {
  let remoteResults = {};

  if (currentUser) {
    const userRef = await ensureUserDoc(currentUser.uid);
    const snap = await getDoc(userRef);
    const data = snap.data() || {};
    remoteResults = data.results || {};
  }

  const mergedResults = {
    ...readLocalQuizTrackResults(),
    ...remoteResults
  };

  const pretest = remoteResults[`${subject}_pretest`] || readLocalAssessmentResult("pretest");
  const posttest = remoteResults[`${subject}_posttest`] || readLocalAssessmentResult("posttest");
  const quizTrack = summarizeQuizTrack(mergedResults);

  renderAssessmentCard("subjectPretest", pretest
    ? {
        state: `${pretest.percent || 0}%`,
        scoreLabel: `${pretest.score || 0} / ${pretest.total || 0}`,
        xpLabel: `${pretest.xpEarned || pretest.score || 0} XP`,
        scorePercent: pretest.percent || 0,
        xpPercent: pretest.total ? Math.round(((pretest.xpEarned || pretest.score || 0) / pretest.total) * 100) : 0
      }
    : {
        state: "Not taken",
        scoreLabel: "0 / 0",
        xpLabel: "0 XP",
        scorePercent: 0,
        xpPercent: 0
      });

  renderAssessmentCard("subjectQuiz", quizTrack.levelsCleared
    ? {
        state: `${quizTrack.levelsCleared} level(s)`,
        scoreLabel: `${quizTrack.totalCorrect} correct`,
        xpLabel: `${quizTrack.xpEarned} XP`,
        scorePercent: quizTrack.scorePercent,
        xpPercent: quizTrack.xpPercent
      }
    : {
        state: "No levels cleared",
        scoreLabel: "0 correct",
        xpLabel: "0 XP",
        scorePercent: 0,
        xpPercent: 0
      });

  renderAssessmentCard("subjectPosttest", posttest
    ? {
        state: `${posttest.percent || 0}%`,
        scoreLabel: `${posttest.score || 0} / ${posttest.total || 0}`,
        xpLabel: `${posttest.xpEarned || posttest.score || 0} XP`,
        scorePercent: posttest.percent || 0,
        xpPercent: posttest.total ? Math.round(((posttest.xpEarned || posttest.score || 0) / posttest.total) * 100) : 0
      }
    : {
        state: "Not taken",
        scoreLabel: "0 / 0",
        xpLabel: "0 XP",
        scorePercent: 0,
        xpPercent: 0
      });
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

async function getCompletionDetails() {
  const localPosttestDone = hasLocalCompletion("posttest");
  const localCompletedAt = localStorage.getItem(`${subject}_posttest_completedAt`) || "";

  if (!currentUser) {
    return {
      completed: localPosttestDone,
      completedAt: localCompletedAt
    };
  }

  const userRef = await ensureUserDoc(currentUser.uid);
  const snap = await getDoc(userRef);
  const data = snap.data() || {};
  const progress = data.progress || {};
  const results = data.results || {};
  const resultKey = `${subject}_posttest`;
  const remoteCompleted = progress[resultKey] === true || results[resultKey] != null;
  const remoteCompletedAt = results[resultKey]?.completedAt || "";

  return {
    completed: localPosttestDone || remoteCompleted,
    completedAt: remoteCompletedAt || localCompletedAt
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

  const completion = await getCompletionDetails();
  if (pretestDone && modulesDone && quizDone && completion.completed) {
    showCertificatePanel(completion.completedAt);
  }

  await renderAssessmentOverview();
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


