import { app } from "./firebase-config.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { buildAssessmentUrl } from "./assessment-routing.mjs";
import { buildModuleDifficultyUrl } from "./module-routing.mjs";
import { resolveSubjectRoute } from "./subject-routing.mjs";
import { hasAuthoritativeAssessmentCompletion } from "./assessment-completion.mjs";

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
let latestProgress = {};
let latestCompletion = { completed: false, completedAt: "" };
const SELECTED_SUBJECT_KEY = "selectedSubject";

/* =========================
   SUBJECT PARAM
========================= */
let subjectRoute = null;
let subjectRouteError = null;
try {
  subjectRoute = resolveSubjectRoute(window.location.search);
} catch (error) {
  subjectRouteError = error;
}
const subject = subjectRoute?.subject || "";
const unlockMode = subjectRoute?.unlockMode || "";

if (subjectRoute) sessionStorage.setItem(SELECTED_SUBJECT_KEY, subject);

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

const meta = subjectRouteError
  ? {
      title: "INVALID SUBJECT LINK",
      desc: subjectRouteError.message
    }
  : subjectMeta[subject];

document.getElementById("subjectTitle").textContent = meta.title;
document.getElementById("subjectDesc").textContent = meta.desc;

if (subjectRouteError) {
  ["pretestBtn", "modulesBtn", "quizzesBtn", "posttestBtn"].forEach((buttonId) => {
    const button = document.getElementById(buttonId);
    if (button) button.disabled = true;
  });
}

const QUIZ_LEVEL_COUNTS = { easy: 25, medium: 25, hard: 25 };
const QUIZ_LEVEL_QUESTIONS = 3;
const QUIZ_LEVEL_XP_PER_CORRECT = 2;
const QUIZ_TRACK_MAX_LEVELS = Object.values(QUIZ_LEVEL_COUNTS).reduce((sum, count) => sum + count, 0);
const QUIZ_TRACK_MAX_SCORE = QUIZ_TRACK_MAX_LEVELS * QUIZ_LEVEL_QUESTIONS;
const QUIZ_TRACK_MAX_XP = QUIZ_TRACK_MAX_SCORE * QUIZ_LEVEL_XP_PER_CORRECT;
const subjectCardConfig = {
  modulesBtn: {
    step: "modules",
    defaultCopy: "Read the lessons",
    lockedCopy: "Complete Pre-Test first"
  },
  quizzesBtn: {
    step: "quiz",
    defaultCopy: "Answer module quizzes",
    lockedCopy: "Complete Modules first"
  },
  posttestBtn: {
    step: "posttest",
    defaultCopy: "Final assessment",
    lockedCopy: "Complete Quiz Track first"
  }
};

function showSubjectNotice(title, message) {
  const modal = document.getElementById("subjectNoticeModal");
  const titleElement = document.getElementById("subjectNoticeTitle");
  const text = document.getElementById("subjectNoticeText");
  const button = document.getElementById("subjectNoticeBtn");

  if (!modal || !titleElement || !text || !button) {
    return;
  }

  titleElement.textContent = title;
  text.textContent = message;
  modal.classList.add("active");
  button.onclick = () => {
    modal.classList.remove("active");
  };
}

function getStepStatus(progress = latestProgress, completion = latestCompletion) {
  const pretestDone = progress[getProgressKey("pretest")] === true;
  const modulesDone = progress[getProgressKey("modules")] === true;
  const quizDone = progress[getProgressKey("quiz")] === true;
  const posttestDone = progress[getProgressKey("posttest")] === true || completion.completed === true;

  return {
    pretestDone,
    modulesDone,
    quizDone,
    posttestDone,
    certificateReady: pretestDone && modulesDone && quizDone && posttestDone
  };
}

function getLockedMessage(step) {
  const status = getStepStatus();

  if (step === "modules" && !status.pretestDone) {
    return "Complete the Pre-Test first to unlock the learning modules.";
  }

  if (step === "quiz") {
    if (!status.pretestDone) return "Complete the Pre-Test first, then study the modules before opening quizzes.";
    if (!status.modulesDone) return "Complete the Modules first to unlock the quiz track.";
  }

  if (step === "posttest") {
    if (!status.pretestDone) return "Complete the Pre-Test, Modules, and Quiz Track before the Post-Test.";
    if (!status.modulesDone) return "Complete the Modules first before the Post-Test.";
    if (!status.quizDone) return "Complete the Quiz Track first to unlock the Post-Test.";
  }

  return "Complete the previous step first to unlock this activity.";
}

/* =========================
   NAVIGATION
========================= */
window.goBack = function () {
  window.location.href = subjectRouteError ? "/subjects" : "/dashboard";
};

function hasCompletedPretest() {
  return getStepStatus().pretestDone;
}

window.openPretest = function () {
  if (hasCompletedPretest()) {
    showSubjectNotice("Pre-Test Already Taken", "You already took the pre-test.");
    return;
  }
  window.location.href = buildAssessmentUrl(subject, "pretest");
};

window.openModules = function () {
  if (document.getElementById("modulesBtn")?.classList.contains("locked")) {
    showSubjectNotice("Modules Locked", "Complete the Pre-Test first to unlock Modules.");
    return;
  }
  window.location.href = buildModuleDifficultyUrl(subject, unlockMode);
};

window.openQuiz = function () {
  if (document.getElementById("quizzesBtn")?.classList.contains("locked")) {
    showSubjectNotice("Quiz Track Locked", getLockedMessage("quiz"));
    return;
  }
  window.location.href = `quiz-difficulty.html?subject=${subject}`;
};

window.openPosttest = function () {
  if (document.getElementById("posttestBtn")?.classList.contains("locked")) {
    showSubjectNotice("Post-Test Locked", getLockedMessage("posttest"));
    return;
  }
  window.location.href = buildAssessmentUrl(subject, "posttest");
};

document.getElementById("subjectBackBtn")?.addEventListener("click", window.goBack);
document.getElementById("pretestBtn")?.addEventListener("click", window.openPretest);
document.getElementById("modulesBtn")?.addEventListener("click", window.openModules);
document.getElementById("quizzesBtn")?.addEventListener("click", window.openQuiz);
document.getElementById("posttestBtn")?.addEventListener("click", window.openPosttest);

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
  btn.classList.add("unlocked");
  btn.removeAttribute("aria-describedby");
  restoreSubjectCardCopy(btn, buttonId);
  removeSubjectCardHint(btn);

  const badge = btn.querySelector(".lock-icon");
  if (badge) badge.remove();
}

function lockButton(buttonId) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  const config = subjectCardConfig[buttonId];
  btn.classList.add("locked");
  btn.classList.remove("unlocked", "ready-card");
  if (config) {
    setSubjectCardCopy(btn, config.lockedCopy);
    setSubjectCardHint(btn, getLockedMessage(config.step));
  }
  if (!btn.querySelector(".lock-icon")) {
    const icon = document.createElement("span");
    icon.className = "lock-icon";
    icon.textContent = "🔒";
    btn.prepend(icon);
  }
}

function setSubjectCardCopy(button, copy) {
  const text = button.querySelector(".subject-card-inner p");
  if (text) text.textContent = copy;
}

function restoreSubjectCardCopy(button, buttonId) {
  const config = subjectCardConfig[buttonId];
  if (config) {
    setSubjectCardCopy(button, config.defaultCopy);
  }
}

function setSubjectCardHint(button, message) {
  const inner = button.querySelector(".subject-card-inner");
  if (!inner) return;
  let hint = button.querySelector(".subject-lock-hint");
  if (!hint) {
    hint = document.createElement("span");
    hint.className = "subject-lock-hint";
    inner.appendChild(hint);
  }
  const hintId = `${button.id || "subject-card"}-lock-hint`;
  hint.id = hintId;
  hint.textContent = message;
  button.setAttribute("aria-describedby", hintId);
}

function removeSubjectCardHint(button) {
  const hint = button.querySelector(".subject-lock-hint");
  if (hint) hint.remove();
}

function setSubjectCardCta(button, text) {
  const inner = button.querySelector(".subject-card-inner");
  if (!inner) return;
  let cta = button.querySelector(".subject-card-cta");
  if (!cta) {
    cta = document.createElement("span");
    cta.className = "subject-card-cta";
    inner.appendChild(cta);
  }
  cta.textContent = text;
}

function removeSubjectCardCta(button) {
  const cta = button.querySelector(".subject-card-cta");
  if (cta) cta.remove();
}

function setPosttestReady(isReady) {
  const button = document.getElementById("posttestBtn");
  if (!button) return;
  button.classList.toggle("ready-card", isReady);
  const badge = button.querySelector(".subject-badge");
  const copy = button.querySelector("p");
  if (badge) badge.textContent = isReady ? "READY" : "FINAL";
  if (copy) {
    copy.textContent = isReady
      ? "Post-test unlocked"
      : button.classList.contains("locked")
        ? subjectCardConfig.posttestBtn.lockedCopy
        : subjectCardConfig.posttestBtn.defaultCopy;
  }
  if (isReady) {
    removeSubjectCardHint(button);
    setSubjectCardCta(button, "Take Post-Test");
    button.setAttribute("aria-label", "Post-Test unlocked. Take the final assessment.");
  } else {
    removeSubjectCardCta(button);
    button.removeAttribute("aria-label");
  }
}

function setChecklistItem(id, status, detail = "") {
  const item = document.getElementById(id);
  if (!item) return;
  item.classList.remove("done", "current", "locked");
  item.classList.add(status);
  if (detail) {
    const span = item.querySelector("span");
    if (span) span.textContent = detail;
  }
}

function renderCompletionChecklist(progress = latestProgress, completion = latestCompletion) {
  const status = getStepStatus(progress, completion);
  const hint = document.getElementById("subjectChecklistHint");
  const nextStep = !status.pretestDone
    ? "Take the Pre-Test to begin the subject path."
    : !status.modulesDone
      ? "Continue to Modules and complete the lesson content."
      : !status.quizDone
        ? "Proceed to the Quiz Track to reinforce the lesson."
        : !status.posttestDone
          ? "The Post-Test is now ready. Complete it to finish the subject."
          : "Subject complete. You may now open the certificate.";

  if (hint) hint.textContent = nextStep;

  setChecklistItem("checkPretest", status.pretestDone ? "done" : "current", status.pretestDone ? "Completed" : "Start with baseline assessment");
  setChecklistItem("checkModules", status.modulesDone ? "done" : status.pretestDone ? "current" : "locked", status.modulesDone ? "Completed" : status.pretestDone ? "Ready to open" : "Complete Pre-Test first");
  setChecklistItem("checkQuiz", status.quizDone ? "done" : status.modulesDone ? "current" : "locked", status.quizDone ? "Completed" : status.modulesDone ? "Ready to open" : "Complete Modules first");
  setChecklistItem("checkPosttest", status.posttestDone ? "done" : status.quizDone ? "current" : "locked", status.posttestDone ? "Completed" : status.quizDone ? "Ready to take" : "Complete Quiz Track first");
  setChecklistItem("checkCertificate", status.certificateReady ? "done" : "locked", status.certificateReady ? "Unlocked" : "Complete all steps first");
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
  let remoteProgress = {};
  let remoteResults = {};

  if (currentUser) {
    const userRef = await ensureUserDoc(currentUser.uid);
    const snap = await getDoc(userRef);
    const data = snap.data() || {};
    remoteProgress = data.progress || {};
    remoteResults = data.results || {};
  }

  const displayedResults = currentUser ? remoteResults : readLocalQuizTrackResults();
  const readAssessment = (stage) => {
    const resultKey = `${subject}_${stage}`;
    if (currentUser) {
      const result = remoteResults[resultKey] || null;
      if (result) return result;
      return remoteProgress[resultKey] === true
        ? { completedWithoutResult: true }
        : null;
    }
    return readLocalAssessmentResult(stage);
  };

  const pretest = readAssessment("pretest");
  const posttest = readAssessment("posttest");
  const quizTrack = summarizeQuizTrack(displayedResults);

  renderAssessmentCard("subjectPretest", pretest
    ? pretest.completedWithoutResult
      ? {
          state: "Completed",
          scoreLabel: "Result unavailable",
          xpLabel: "XP unavailable",
          scorePercent: 0,
          xpPercent: 0
        }
      : {
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
    ? posttest.completedWithoutResult
      ? {
          state: "Completed",
          scoreLabel: "Result unavailable",
          xpLabel: "XP unavailable",
          scorePercent: 0,
          xpPercent: 0
        }
      : {
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
      hasAuthoritativeAssessmentCompletion(data, subject, "pretest"),

    [getProgressKey("modules")]:
      firebaseProgress[getProgressKey("modules")] === true ||
      firebaseProgress[`${subject}_easy_modules_done`] === true ||
      firebaseProgress[`${subject}_medium_modules_done`] === true ||
      firebaseProgress[`${subject}_hard_modules_done`] === true,

    [getProgressKey("quiz")]:
      firebaseProgress[getProgressKey("quiz")] === true ||
      firebaseProgress[`${subject}_hard_quiz`] === true ||
      firebaseResults[getProgressKey("quiz")] != null,

    [getProgressKey("posttest")]:
      hasAuthoritativeAssessmentCompletion(data, subject, "posttest")
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
  const remoteCompleted = hasAuthoritativeAssessmentCompletion(data, subject, "posttest");
  const remoteCompletedAt = results[resultKey]?.completedAt || "";

  return {
    completed: remoteCompleted,
    completedAt: remoteCompletedAt
  };
}

async function loadProgress() {
  if (subjectRouteError) {
    latestProgress = {};
    return;
  }
  lockButton("modulesBtn");
  lockButton("quizzesBtn");
  lockButton("posttestBtn");
  setPosttestReady(false);

  if (unlockMode === "modules") {
    latestProgress = {
      [getProgressKey("pretest")]: true,
      [getProgressKey("modules")]: false,
      [getProgressKey("quiz")]: false,
      [getProgressKey("posttest")]: false
    };
    unlockButton("modulesBtn");
    renderCompletionChecklist(latestProgress, latestCompletion);
    await renderAssessmentOverview();
    return;
  }

  if (unlockMode === "quiz") {
    latestProgress = {
      [getProgressKey("pretest")]: true,
      [getProgressKey("modules")]: true,
      [getProgressKey("quiz")]: false,
      [getProgressKey("posttest")]: false
    };
    unlockButton("modulesBtn");
    unlockButton("quizzesBtn");
    renderCompletionChecklist(latestProgress, latestCompletion);
    await renderAssessmentOverview();
    return;
  }

  if (unlockMode === "all") {
    latestProgress = {
      [getProgressKey("pretest")]: true,
      [getProgressKey("modules")]: true,
      [getProgressKey("quiz")]: true,
      [getProgressKey("posttest")]: false
    };
    unlockButton("modulesBtn");
    unlockButton("quizzesBtn");
    unlockButton("posttestBtn");
    setPosttestReady(true);
    renderCompletionChecklist(latestProgress, latestCompletion);
    await renderAssessmentOverview();
    return;
  }

  const progress = await getMergedProgress();
  latestProgress = progress;

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
    setPosttestReady(true);
  }

  const completion = await getCompletionDetails();
  latestCompletion = completion;
  if (pretestDone && modulesDone && quizDone && completion.completed) {
    setPosttestReady(false);
    showCertificatePanel(completion.completedAt);
  }

  renderCompletionChecklist(progress, completion);
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

document.getElementById("subjectThemeToggle")?.addEventListener("click", window.toggleTheme);

/* =========================
   INIT
========================= */
loadTheme();

onAuthStateChanged(auth, async (user) => {
  currentUser = user || null;
  if (subjectRouteError) return;
  try {
    await loadProgress();
  } catch (error) {
    console.error("Authenticated subject progress load failed:", error);
    showSubjectNotice("Progress Unavailable", "Your saved progress could not be refreshed. Check your connection and try again.");
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


