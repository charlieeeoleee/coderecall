import { app } from "./firebase-config.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  initSounds,
  initGlobalClickSound,
  tryStartMusic,
  restartThemeMusic,
  playSound,
  handleSoundToggle,
  handleMusicToggle
} from "./sound.js";
import { syncPublicLeaderboardEntry } from "./leaderboard-public.js";
import { saveWrongAnswerReview, resolveWrongAnswerReview, loadWrongAnswerReview } from "./review-store.js";
import { saveRetentionReview, resolveRetentionReview, loadRetentionQueue } from "./retention-store.js";
import { saveStudyHistory } from "./study-history-store.js";


const auth = getAuth(app);
const db = getFirestore(app);

const params = new URLSearchParams(window.location.search);
const subject = (params.get("subject") || "electrical").toLowerCase();
const difficulty = (params.get("difficulty") || "easy").toLowerCase();
const quizLevel = parseInt(params.get("quizLevel") || "1", 10);

const XP_PER_CORRECT = 2;
const MAX_DAILY_TRIES_PER_QUESTION = 3;
const SLOW_QUIZ_LOAD_DELAY_MS = 4200;
const QUIZ_PREFETCH_KEY_PREFIX = "codeRecallQuizLevelPrefetch";

const HARDWARE_DOC_IMAGE_BASE = "assets/quizzes/hardware/docx";
const HARDWARE_QUIZ_LEVEL_FALLBACKS = {
  easy: {
    12: [
      {
        level: 12,
        sub: 1,
        question: "It is a type of output device that is used to make a hard copy of a digital document.",
        choices: [
          "Printer",
          "Scanner",
          "Plotter",
          "Photo Printer"
        ],
        answer: "A"
      },
      {
        level: 12,
        sub: 2,
        question: "It is used to create or print out large graphics or designs like blueprints, maps etc.",
        choices: [
          "Printer",
          "Scanner",
          "Plotter",
          "Projector"
        ],
        answer: "C"
      },
      {
        level: 12,
        sub: 3,
        question: "What is being shown in the picture?",
        choices: [
          "Graphic Tablet",
          "Mouse",
          "Keyboard",
          "Touch Pad"
        ],
        answer: "D"
      }
    ],
    13: [
      {
        level: 13,
        sub: 1,
        question: "It's used to move the cursor on the screen, which allows us to move, drag, or click data on the monitor screen.",
        choices: [
          "Mouse",
          "Touchscreen",
          "Touchpad",
          "Digital pen"
        ],
        answer: "A"
      },
      {
        level: 13,
        sub: 2,
        question: "It is used to project images, videos, presentations on a big white screen or board.",
        choices: [
          "Projector",
          "Monitor",
          "Webcam",
          "Screen"
        ],
        answer: "A"
      },
      {
        level: 13,
        sub: 3,
        question: "_____ is a flat surface that is commonly used on laptops to move the cursor.",
        choices: [
          "Mouse",
          "Digital Pen",
          "Projector",
          "Touch Pad"
        ],
        answer: "D"
      }
    ]
  }
};

const HARDWARE_QUIZ_OVERRIDES = {
  easy: {
    "2.3": {
      image: "assets/modules/hardware/easy/module1/image-42.png"
    },
    "1.3": {
      image: `${HARDWARE_DOC_IMAGE_BASE}/image10.png`
    },
    "12.3": {
      image: `${HARDWARE_DOC_IMAGE_BASE}/image27.png`
    },
    "6.3": {
      image: `${HARDWARE_DOC_IMAGE_BASE}/image5.png`
    },
    "7.3": {
      image: `${HARDWARE_DOC_IMAGE_BASE}/image17.png`,
      imageCropBottom: 58
    },
    "8.3": {
      image: `${HARDWARE_DOC_IMAGE_BASE}/image25.png`
    },
    "9.2": {
      image: `${HARDWARE_DOC_IMAGE_BASE}/image13.png`
    },
    "10.2": {
      image: `${HARDWARE_DOC_IMAGE_BASE}/image19.png`
    },
    "14.3": {
      question: "Which of the following is a microphone?",
      choices: ["Option A", "Option B", "Option C", "Option D"],
      choiceImages: [
        `${HARDWARE_DOC_IMAGE_BASE}/image7.jpg`,
        `${HARDWARE_DOC_IMAGE_BASE}/image23.png`,
        `${HARDWARE_DOC_IMAGE_BASE}/image14.png`,
        `${HARDWARE_DOC_IMAGE_BASE}/image12.png`
      ],
      answer: "Option A"
    },
    "15.1": {
      choices: ["Microphone", "DSLR Camera", "Webcam", "Instax Camera"],
      answer: "Webcam"
    },
    "15.3": {
      question: "Which of the following is a webcam?",
      choices: ["Option A", "Option B", "Option C", "Option D"],
      choiceImages: [
        `${HARDWARE_DOC_IMAGE_BASE}/image3.png`,
        `${HARDWARE_DOC_IMAGE_BASE}/image9.png`,
        `${HARDWARE_DOC_IMAGE_BASE}/image20.png`,
        `${HARDWARE_DOC_IMAGE_BASE}/image2.png`
      ],
      answer: "Option D"
    },
    "17.3": {
      question: "Which of the following is a Anti-static wrist trap",
      choices: ["Option A", "Option B", "Option C", "Option D"],
      choiceImages: [
        `${HARDWARE_DOC_IMAGE_BASE}/image11.png`,
        `${HARDWARE_DOC_IMAGE_BASE}/image24.png`,
        `${HARDWARE_DOC_IMAGE_BASE}/image18.png`,
        `${HARDWARE_DOC_IMAGE_BASE}/image1.png`
      ],
      answer: "Option A"
    },
    "18.3": {
      image: `${HARDWARE_DOC_IMAGE_BASE}/image28.png`
    },
    "20.3": {
      image: `${HARDWARE_DOC_IMAGE_BASE}/image16.png`
    },
    "21.3": {
      image: `${HARDWARE_DOC_IMAGE_BASE}/image8.png`
    },
    "24.3": {
      image: `${HARDWARE_DOC_IMAGE_BASE}/image21.png`
    },
    "25.3": {
      image: `${HARDWARE_DOC_IMAGE_BASE}/image6.png`
    }
  },
  hard: {
    "21.3": {
      image: `${HARDWARE_DOC_IMAGE_BASE}/image4.png`
    },
    "25.3": {
      image: `${HARDWARE_DOC_IMAGE_BASE}/image22.png`
    }
  }
};

let questions = [];
let currentIndex = 0;
let selectedChoice = null;
let selectedConfidence = null;
let score = 0;
let currentUser = auth.currentUser || null;
let rationaleNextAction = "advance";
let rationaleRetryIndex = null;
let currentTotalXP = 0;
let questionBankCache = null;
let preparedQuestionBankCache = null;
const RESUME_ACTIVITY_KEY = "resume_activity";
let retentionGateShown = false;
let awardedQuestionIds = new Set();
let correctQuestionIdsThisRun = new Set();
let wrongAnswerReviewKeys = new Set();
let recoveredMistakesThisRun = 0;
let answeredQuestionsThisRun = [];
let imageInspectorAction = null;

function getQuizPrefetchKey(level = quizLevel) {
  return `${QUIZ_PREFETCH_KEY_PREFIX}:${subject}:${difficulty}:${level}`;
}

function readPrefetchedQuestionSet() {
  try {
    const raw = sessionStorage.getItem(getQuizPrefetchKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.questions) ? parsed.questions : null;
  } catch {
    return null;
  }
}

function writePrefetchedQuestionSet(level, levelQuestions) {
  if (!Array.isArray(levelQuestions) || !levelQuestions.length) return;
  try {
    sessionStorage.setItem(getQuizPrefetchKey(level), JSON.stringify({
      subject,
      difficulty,
      level,
      questions: levelQuestions,
      at: new Date().toISOString()
    }));
  } catch {
    // Session prefetch is optional; the quiz should continue normally if storage is full.
  }
}

function deferQuizTask(task) {
  const run = () => {
    Promise.resolve()
      .then(task)
      .catch((error) => console.warn("Deferred quiz task failed:", error));
  };

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(run, { timeout: 1500 });
  } else {
    window.setTimeout(run, 120);
  }
}

function ensureImageInspectorModal() {
  let modal = document.getElementById("imageInspectorModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "imageInspectorModal";
  modal.className = "image-inspector-modal";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="image-inspector-dialog" role="dialog" aria-modal="true" aria-labelledby="imageInspectorTitle">
      <div class="image-inspector-head">
        <h2 id="imageInspectorTitle">Image Preview</h2>
        <button type="button" class="image-inspector-close" id="imageInspectorClose" aria-label="Close image preview">&times;</button>
      </div>
      <figure class="image-inspector-figure">
        <img id="imageInspectorImg" src="" alt="">
        <figcaption id="imageInspectorCaption"></figcaption>
      </figure>
      <div class="image-inspector-actions" id="imageInspectorActions" hidden>
        <button type="button" class="image-inspector-action-btn" id="imageInspectorActionBtn">Use This Answer</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeImageInspector();
  });
  document.getElementById("imageInspectorClose")?.addEventListener("click", closeImageInspector);
  document.getElementById("imageInspectorActionBtn")?.addEventListener("click", () => {
    if (typeof imageInspectorAction === "function") {
      imageInspectorAction();
    }
    closeImageInspector();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeImageInspector();
  });

  return modal;
}

function openImageInspector(src, caption = "Question visual", details = "", actionLabel = "", action = null) {
  if (!src) return;
  const modal = ensureImageInspectorModal();
  const image = document.getElementById("imageInspectorImg");
  const title = document.getElementById("imageInspectorTitle");
  const captionEl = document.getElementById("imageInspectorCaption");
  const actions = document.getElementById("imageInspectorActions");
  const actionBtn = document.getElementById("imageInspectorActionBtn");

  if (image) {
    image.src = src;
    image.alt = caption;
  }
  if (title) title.textContent = caption;
  if (captionEl) captionEl.textContent = details || "Use this enlarged view to inspect details before answering.";
  imageInspectorAction = typeof action === "function" ? action : null;
  if (actions) actions.hidden = !imageInspectorAction;
  if (actionBtn && actionLabel) actionBtn.textContent = actionLabel;
  modal.classList.add("active");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeImageInspector() {
  const modal = document.getElementById("imageInspectorModal");
  if (!modal) return;
  modal.classList.remove("active");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  imageInspectorAction = null;
}

function attachQuestionImageInspector(container, caption) {
  container?.querySelectorAll(".image-inspector-trigger").forEach((trigger) => {
    const image = trigger.querySelector("img");
    if (!image) return;
    trigger.addEventListener("click", () => {
      openImageInspector(image.currentSrc || image.src, caption);
    });
  });

  container?.querySelectorAll("img").forEach((image) => {
    if (image.closest(".image-inspector-trigger")) return;
    image.tabIndex = 0;
    image.setAttribute("role", "button");
    image.setAttribute("aria-label", `Open enlarged image for ${caption}`);
    image.addEventListener("click", (event) => {
      event.stopPropagation();
      openImageInspector(image.currentSrc || image.src, caption);
    });
    image.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        openImageInspector(image.currentSrc || image.src, caption);
      }
    });
  });
}

function getChoiceImageDetails(question, choice, index) {
  const detail =
    question?.choiceDefinitions?.[index] ||
    question?.choiceDetails?.[index] ||
    question?.choiceDescriptions?.[index] ||
    "";

  if (detail) {
    return detail;
  }

  return `Part: ${choice}. Review the enlarged image, then use this option as your answer if it matches the question.`;
}

function selectChoice(choice, button) {
  document.querySelectorAll(".choice-btn").forEach((item) => item.classList.remove("selected"));
  button.classList.add("selected");
  selectedChoice = choice;
  updateNextButtonState();
  saveQuizLevelResumeState().catch((error) => {
    console.warn("Unable to save quiz level resume state.", error);
  });
}

function openChoiceImagePreview(question, choice, index, button) {
  const imageSrc = question?.choiceImages?.[index];
  openImageInspector(
    imageSrc,
    choice,
    getChoiceImageDetails(question, choice, index),
    "Use This Answer",
    () => selectChoice(choice, button)
  );
}

function startSlowQuizNotice() {
  return window.setTimeout(() => {
    const subtitle = document.getElementById("levelSubtitle");
    const questionText = document.getElementById("questionText");
    if (subtitle) {
      subtitle.textContent = "Still loading quiz data. Slow connections can take a few more seconds.";
      subtitle.classList.add("slow-load-warning");
    }
    if (questionText) {
      questionText.textContent = "Still preparing this question...";
    }
  }, SLOW_QUIZ_LOAD_DELAY_MS);
}

function stopSlowQuizNotice(timerId) {
  window.clearTimeout(timerId);
  const subtitle = document.getElementById("levelSubtitle");
  if (subtitle) {
    subtitle.textContent = "Answer 3 questions to complete this level and earn 6 XP.";
    subtitle.classList.remove("slow-load-warning");
  }
}

function getSubjectDisplayName() {
  return subject === "hardware" ? "Computer Hardware" : "Electrical";
}

function buildReviewTrackingKey(payload = {}) {
  const questionIdentity = payload.level != null && payload.sub != null
    ? `${payload.level}.${payload.sub}`
    : String(payload.question || "unknown")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 80) || "unknown";

  return [
    payload.source || "quiz",
    payload.subject || "subject",
    payload.quizType || payload.difficulty || "default",
    payload.quizLevel || payload.level || "na",
    questionIdentity
  ].join("|");
}

async function syncWrongAnswerReviewKeys() {
  const items = await withTimeout(
    loadWrongAnswerReview({
      db,
      user: currentUser
    }),
    []
  );
  wrongAnswerReviewKeys = new Set((items || []).map((item) => String(item?.key || "").trim()).filter(Boolean));
}

function shuffleArray(array) {
  const cloned = [...array];
  for (let index = cloned.length - 1; index > 0; index -= 1) {
    const nextIndex = Math.floor(Math.random() * (index + 1));
    [cloned[index], cloned[nextIndex]] = [cloned[nextIndex], cloned[index]];
  }
  return cloned;
}

function arraysHaveSameOrder(original, shuffled, identityFn = (item) => item) {
  if (original.length !== shuffled.length) return false;
  return original.every((item, index) => identityFn(item) === identityFn(shuffled[index]));
}

function shuffleAvoidingOriginalOrder(array, identityFn = (item) => item) {
  if (array.length <= 1) return [...array];

  let shuffled = shuffleArray(array);
  let attempts = 0;

  while (attempts < 5 && arraysHaveSameOrder(array, shuffled, identityFn)) {
    shuffled = shuffleArray(array);
    attempts += 1;
  }

  if (arraysHaveSameOrder(array, shuffled, identityFn)) {
    shuffled = [...array.slice(1), array[0]];
  }

  return shuffled;
}

function groupQuestionsByLevel(questions) {
  return (questions || []).reduce((grouped, question) => {
    const levelKey = String(question.level);
    if (!grouped[levelKey]) {
      grouped[levelKey] = [];
    }
    grouped[levelKey].push(question);
    return grouped;
  }, {});
}

async function loadQuestionBank() {
  if (questionBankCache) {
    return questionBankCache;
  }

  if (subject === "electrical") {
    questionBankCache = import("../data/quiz-data-electrical.js?v=20260516a").then((module) => ({
      electrical: module.electricalQuizData?.electrical || {}
    }));
    return questionBankCache;
  }

  questionBankCache = import("../data/quiz-data-hardware.js?v=20260516a").then((module) => ({
    hardware: module.hardwareQuizData?.hardware || {}
  }));
  return questionBankCache;
}

function normalizeAnswer(question) {
  const choices = Array.isArray(question.choices) ? [...question.choices] : [];
  let answer = question.answer;

  if (typeof answer === "string" && /^[A-D]$/i.test(answer.trim()) && choices.length >= 4) {
    const answerIndex = answer.trim().toUpperCase().charCodeAt(0) - 65;
    answer = choices[answerIndex];
  }

  return {
    ...question,
    choices,
    answer
  };
}

function shuffleQuestionChoices(question) {
  const pairs = (question.choices || []).map((choice, index) => ({
    choice,
    image: question.choiceImages?.[index] || null
  }));

  const shuffled = shuffleArray(pairs);

  return {
    ...question,
    choices: shuffled.map((item) => item.choice),
    choiceImages: question.choiceImages ? shuffled.map((item) => item.image) : undefined
  };
}

function getThemeIcon() {
  return document.body.classList.contains("light-mode") ? "☀️" : "🌙";
}

function updateThemeIcon() {
  const icon = document.getElementById("themeIcon");
  if (icon) {
    icon.textContent = getThemeIcon();
  }
}

function loadTheme() {
  if (localStorage.getItem("theme") === "light") {
    document.body.classList.add("light-mode");
  }
  updateThemeIcon();
}

window.toggleTheme = function () {
  document.body.classList.toggle("light-mode");
  localStorage.setItem("theme", document.body.classList.contains("light-mode") ? "light" : "dark");
  updateThemeIcon();
  restartThemeMusic();
};

function syncSoundToggleUI() {
  const sfxToggle = document.getElementById("sfxToggle");
  const bgmToggle = document.getElementById("bgmToggle");

  if (sfxToggle) {
    sfxToggle.checked = localStorage.getItem("soundEnabled") !== "false";
  }

  if (bgmToggle) {
    bgmToggle.checked = localStorage.getItem("musicEnabled") !== "false";
  }
}

function setupSoundToggles() {
  const sfxToggle = document.getElementById("sfxToggle");
  const bgmToggle = document.getElementById("bgmToggle");

  syncSoundToggleUI();

  sfxToggle?.addEventListener("change", (event) => {
    handleSoundToggle(event.target.checked);
  });

  bgmToggle?.addEventListener("change", (event) => {
    handleMusicToggle(event.target.checked);
  });
}

function getLevelDoneKey() {
  return `${subject}_${difficulty}_quiz_level_${quizLevel}_done`;
}

function getLegacyLevelDoneKey() {
  return `${subject}_quiz_level_${quizLevel}_done`;
}

function getResultKey() {
  return `${subject}_${difficulty}_quiz_level_${quizLevel}_result`;
}

function normalizeQuestionIdList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function getOverallQuizKey() {
  return `${subject}_${difficulty}_quiz`;
}

function getQuizLevelResumeStateKey() {
  return `resume_quiz_level_state_${subject}_${difficulty}_${quizLevel}`;
}

function getQuizLevelBaseUrl() {
  return `quiz-level.html?subject=${encodeURIComponent(subject)}&difficulty=${encodeURIComponent(difficulty)}&quizLevel=${encodeURIComponent(quizLevel)}`;
}

function getQuizLevelResumeUrl() {
  return `${getQuizLevelBaseUrl()}&resume=1`;
}

function readLocalResumeActivity() {
  try {
    return JSON.parse(localStorage.getItem(RESUME_ACTIVITY_KEY) || "null");
  } catch {
    return null;
  }
}

function writeLocalResumeActivity(activity) {
  if (!activity) {
    localStorage.removeItem(RESUME_ACTIVITY_KEY);
    return;
  }

  localStorage.setItem(RESUME_ACTIVITY_KEY, JSON.stringify(activity));
}

async function syncResumeActivity(activity) {
  writeLocalResumeActivity(activity);

  if (!currentUser) return;

  const userRef = await ensureUserDoc(currentUser.uid);
  await updateDoc(userRef, { resumeActivity: activity || null });
}

function readQuizLevelResumeState() {
  try {
    return JSON.parse(localStorage.getItem(getQuizLevelResumeStateKey()) || "null");
  } catch {
    return null;
  }
}

function writeQuizLevelResumeState(payload) {
  if (!payload) {
    localStorage.removeItem(getQuizLevelResumeStateKey());
    return;
  }

  localStorage.setItem(getQuizLevelResumeStateKey(), JSON.stringify(payload));
}

async function saveQuizLevelResumeState() {
  if (!questions.length || currentIndex >= questions.length) return;

  const state = {
    kind: "quiz-level",
    subject,
    difficulty,
    quizLevel,
    actionUrl: getQuizLevelBaseUrl(),
    resumeUrl: getQuizLevelResumeUrl(),
    title: `Level ${quizLevel}`,
    detail: `${subject === "hardware" ? "Computer Hardware" : "Electrical"} • ${difficulty} quiz`,
    currentIndex,
    total: questions.length,
    progressPercent: Math.round((currentIndex / Math.max(questions.length, 1)) * 100),
    score,
    selectedChoice,
    selectedConfidence,
    correctQuestionIdsThisRun: Array.from(correctQuestionIdsThisRun),
    answeredQuestionsThisRun,
    questions,
    updatedAt: new Date().toISOString()
  };

  writeQuizLevelResumeState(state);
  await syncResumeActivity(state);
}

async function clearQuizLevelResumeState() {
  const current = readLocalResumeActivity();
  writeQuizLevelResumeState(null);

  const isSameActivity = current?.kind === "quiz-level"
    && current?.subject === subject
    && current?.difficulty === difficulty
    && Number(current?.quizLevel || 0) === quizLevel;

  if (isSameActivity) {
    await syncResumeActivity(null);
  }
}

function restoreQuizLevelResumeState() {
  const shouldResume = new URLSearchParams(window.location.search).get("resume") === "1";
  if (!shouldResume) return false;

  const state = readQuizLevelResumeState();
  if (!state || state.subject !== subject || state.difficulty !== difficulty || Number(state.quizLevel || 0) !== quizLevel) {
    return false;
  }

  if (!Array.isArray(state.questions) || !state.questions.length) {
    return false;
  }

  questions = state.questions;
  currentIndex = Math.max(0, Math.min(Number(state.currentIndex || 0), state.questions.length - 1));
  score = Math.max(0, Number(state.score || 0));
  selectedChoice = typeof state.selectedChoice === "string" ? state.selectedChoice : null;
  selectedConfidence = typeof state.selectedConfidence === "string" ? state.selectedConfidence : null;
  correctQuestionIdsThisRun = new Set(normalizeQuestionIdList(state.correctQuestionIdsThisRun));
  answeredQuestionsThisRun = Array.isArray(state.answeredQuestionsThisRun) ? state.answeredQuestionsThisRun : [];
  return true;
}

function readLocalLevelResult() {
  try {
    return JSON.parse(localStorage.getItem(getResultKey()) || "null");
  } catch {
    return null;
  }
}

async function syncAwardedQuestionIds() {
  const nextIds = new Set(
    normalizeQuestionIdList(readLocalLevelResult()?.xpAwardedQuestionIds)
  );

  if (currentUser) {
    try {
      const userRef = await ensureUserDoc(currentUser.uid);
      const snap = await getDoc(userRef);
      const remoteIds = normalizeQuestionIdList(
        snap.data()?.results?.[getResultKey()]?.xpAwardedQuestionIds
      );
      remoteIds.forEach((id) => nextIds.add(id));
    } catch (error) {
      console.warn("Unable to sync awarded question XP state.", error);
    }
  }

  awardedQuestionIds = nextIds;
}

function getWeekKey() {
  const now = new Date();
  const year = now.getFullYear();
  const firstDay = new Date(year, 0, 1);
  const pastDays = Math.floor((now - firstDay) / 86400000);
  const week = Math.ceil((pastDays + firstDay.getDay() + 1) / 7);
  return `${year}-W${week}`;
}

function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTomorrowRetryIso() {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return tomorrow.toISOString();
}

function getQuestionIdentifier(question) {
  if (question?.level != null && question?.sub != null) {
    return `${question.level}.${question.sub}`;
  }

  const fallbackText = String(question?.question || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

  return fallbackText || "unknown";
}

function getQuestionDailyStateKey(question) {
  return `quiz_question_daily_state_${subject}_${difficulty}_${quizLevel}_${getQuestionIdentifier(question)}_${getTodayKey()}`;
}

function getQuestionDailyState(question) {
  try {
    const raw = localStorage.getItem(getQuestionDailyStateKey(question));
    if (!raw) {
      return { attempts: 0, answeredCorrectly: false };
    }

    const parsed = JSON.parse(raw);
    return {
      attempts: Number(parsed?.attempts || 0),
      answeredCorrectly: parsed?.answeredCorrectly === true
    };
  } catch {
    return { attempts: 0, answeredCorrectly: false };
  }
}

function setQuestionDailyState(question, state) {
  localStorage.setItem(getQuestionDailyStateKey(question), JSON.stringify({
    attempts: Number(state?.attempts || 0),
    answeredCorrectly: state?.answeredCorrectly === true
  }));
}

function recordQuestionAttempt(question, isCorrect) {
  const currentState = getQuestionDailyState(question);
  const nextState = {
    attempts: currentState.attempts + 1,
    answeredCorrectly: currentState.answeredCorrectly || isCorrect
  };

  setQuestionDailyState(question, nextState);
  return nextState;
}

function isQuestionLockedForToday(question) {
  const state = getQuestionDailyState(question);
  return state.attempts >= MAX_DAILY_TRIES_PER_QUESTION && !state.answeredCorrectly;
}

function getRemainingQuestionTries(state) {
  return Math.max(0, MAX_DAILY_TRIES_PER_QUESTION - Number(state?.attempts || 0));
}

async function ensureUserDoc(uid) {
  const userRef = doc(db, "users", uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    await setDoc(userRef, {
      xp: 0,
      xpWeekly: 0,
      xpChange: 0,
      lastWeeklyReset: getWeekKey(),
      progress: {},
      results: {},
      createdAt: new Date().toISOString()
    });
  }

  return userRef;
}

function renderXpDock(totalXP) {
  currentTotalXP = Number(totalXP || 0);
  const xpPerLevel = 100;
  const level = Math.floor(currentTotalXP / xpPerLevel) + 1;
  const levelXP = currentTotalXP % xpPerLevel;
  const progressPercent = Math.max(0, Math.min(100, (levelXP / xpPerLevel) * 100));

  const label = document.getElementById("levelXpDockLabel");
  const fill = document.getElementById("levelXpDockFill");
  const value = document.getElementById("levelXpDockValue");

  if (label) label.textContent = `LEVEL ${level}`;
  if (fill) fill.style.width = `${progressPercent}%`;
  if (value) value.textContent = `${levelXP} / ${xpPerLevel} XP`;
}

async function syncXpDock() {
  if (!currentUser) {
    renderXpDock(parseInt(localStorage.getItem("guest_xp") || "0", 10));
    return;
  }

  const userRef = await ensureUserDoc(currentUser.uid);
  const snap = await getDoc(userRef);
  renderXpDock(Number(snap.data()?.xp || 0));
}

async function getQuestionBank() {
  if (preparedQuestionBankCache) {
    return preparedQuestionBankCache;
  }

  const baseBank = await loadQuestionBank();
  const subjectBank = baseBank[subject] || {};
  const difficultyBank = subjectBank[difficulty] || {};
  const preparedDifficultyBank = {
    [difficulty]: {}
  };

  Object.entries(difficultyBank).forEach(([levelKey, levelQuestions]) => {
    preparedDifficultyBank[difficulty][levelKey] = JSON.parse(JSON.stringify(levelQuestions || []));
  });

  if (subject === "hardware") {
    const hardwareFallbacks = HARDWARE_QUIZ_LEVEL_FALLBACKS[difficulty] || {};
    const hardwareOverrides = HARDWARE_QUIZ_OVERRIDES[difficulty] || {};

    Object.entries(hardwareFallbacks).forEach(([levelKey, levelQuestions]) => {
      if (!preparedDifficultyBank[difficulty]?.[levelKey]?.length) {
        preparedDifficultyBank[difficulty][levelKey] = JSON.parse(JSON.stringify(levelQuestions));
      }
    });

    Object.entries(preparedDifficultyBank[difficulty] || {}).forEach(([levelKey, levelQuestions]) => {
      preparedDifficultyBank[difficulty][levelKey] = (levelQuestions || []).map((question) => {
        const overrideKey = `${question.level}.${question.sub}`;
        const override = hardwareOverrides[overrideKey] || {};
        return {
          ...question,
          ...override,
          choices: override.choices || question.choices
        };
      });
    });
  }

  preparedQuestionBankCache = {
    [subject]: preparedDifficultyBank
  };
  return preparedQuestionBankCache;
}

async function getQuestionSet() {
  const bank = await getQuestionBank();
  const bySubject = bank[subject] || {};
  const byDifficulty = bySubject[difficulty] || {};
  if (byDifficulty[quizLevel]?.length) {
    return byDifficulty[quizLevel];
  }

  if (subject === "hardware") {
    return HARDWARE_QUIZ_LEVEL_FALLBACKS[difficulty]?.[quizLevel] || [];
  }

  return [];
}

async function getTotalLevels() {
  const bank = await getQuestionBank();
  const bySubject = bank[subject] || {};
  const byDifficulty = bySubject[difficulty] || {};
  return Object.keys(byDifficulty).length;
}

async function prepareQuestions() {
  const levelQuestions = readPrefetchedQuestionSet() || await getQuestionSet();
  const preparedQuestions = levelQuestions.map((question) => shuffleQuestionChoices(normalizeAnswer(question)));
  questions = shuffleAvoidingOriginalOrder(
    preparedQuestions,
    (question) => `${question.level ?? ""}.${question.sub ?? question.question ?? ""}`
  );

  if (!questions.length) {
    questions = shuffleArray([
      {
        question: `${subject.toUpperCase()} ${difficulty.toUpperCase()} Level ${quizLevel} placeholder question 1`,
        choices: ["Choice A", "Choice B", "Choice C", "Choice D"],
        answer: "Choice A"
      },
      {
        question: `${subject.toUpperCase()} ${difficulty.toUpperCase()} Level ${quizLevel} placeholder question 2`,
        choices: ["Choice A", "Choice B", "Choice C", "Choice D"],
        answer: "Choice B"
      },
      {
        question: `${subject.toUpperCase()} ${difficulty.toUpperCase()} Level ${quizLevel} placeholder question 3`,
        choices: ["Choice A", "Choice B", "Choice C", "Choice D"],
        answer: "Choice C"
      }
    ]);
  }
}

async function prefetchNextQuizLevel() {
  const totalLevels = await getTotalLevels();
  const nextLevel = quizLevel + 1;
  if (nextLevel > totalLevels || sessionStorage.getItem(getQuizPrefetchKey(nextLevel))) return;

  const bank = await getQuestionBank();
  const bySubject = bank[subject] || {};
  const byDifficulty = bySubject[difficulty] || {};
  const nextQuestions = byDifficulty[nextLevel] || [];
  writePrefetchedQuestionSet(nextLevel, nextQuestions);
}

function renderHeader() {
  const levelTag = document.getElementById("levelTag");
  const levelTitle = document.getElementById("levelTitle");
  const levelSubtitle = document.getElementById("levelSubtitle");

  if (levelTag) levelTag.textContent = "QUIZ LEVEL";
  if (levelTitle) levelTitle.textContent = `Level ${quizLevel}`;
  if (levelSubtitle) levelSubtitle.textContent = "Answer 3 questions to complete this level and earn 6 XP.";
}

function updateProgress() {
  const total = questions.length || 1;
  const percent = Math.floor((currentIndex / total) * 100);

  document.getElementById("questionCounter").textContent = `Question ${Math.min(currentIndex + 1, total)} of ${total}`;
  document.getElementById("levelProgressFill").style.width = `${percent}%`;
  document.getElementById("levelProgressText").textContent = `${percent}% Completed`;
}

function updateNextButtonState() {
  const nextBtn = document.getElementById("nextBtn");
  if (!nextBtn) return;
  nextBtn.disabled = !(selectedChoice && selectedConfidence);
}

function bindConfidenceOptions() {
  const options = Array.from(document.querySelectorAll("#confidenceOptions .level-confidence-btn"));
  options.forEach((button) => {
    button.addEventListener("click", () => {
      options.forEach((item) => item.classList.remove("selected"));
      button.classList.add("selected");
      selectedConfidence = String(button.dataset.confidence || "");
      updateNextButtonState();
      saveQuizLevelResumeState().catch((error) => {
        console.warn("Unable to save quiz level resume state.", error);
      });
    });
  });
}

function renderConfidenceSelection(restoredConfidence = null) {
  const options = Array.from(document.querySelectorAll("#confidenceOptions .level-confidence-btn"));
  options.forEach((button) => {
    const isSelected = restoredConfidence && button.dataset.confidence === restoredConfidence;
    button.classList.toggle("selected", Boolean(isSelected));
  });
  selectedConfidence = restoredConfidence || null;
  updateNextButtonState();
}

function isLowConfidenceAnswer(confidence) {
  return confidence === "guessing" || confidence === "somewhat_sure";
}

function getConfidenceLabel(confidence) {
  if (confidence === "sure") return "Sure";
  if (confidence === "somewhat_sure") return "Somewhat Sure";
  if (confidence === "guessing") return "Guessing";
  return "Unknown";
}

function withTimeout(promise, fallbackValue, timeoutMs = 1200) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      window.setTimeout(() => resolve(fallbackValue), timeoutMs);
    })
  ]);
}

async function maybeShowRetentionGate({ trigger = "existing_due" } = {}) {
  if (retentionGateShown) return;

  const queueItems = await withTimeout(
    loadRetentionQueue({
      db,
      user: currentUser
    }),
    []
  );

  const dueItems = (queueItems || []).filter((item) =>
    String(item?.subject || "").toLowerCase() === subject
    && item?.actionUrl
    && item?.quizType !== "pretest"
    && item?.dueAt
    && new Date(item.dueAt).getTime() <= Date.now()
  );

  if (!dueItems.length) return;

  const modal = document.getElementById("retentionGateModal");
  const text = document.getElementById("retentionGateText");
  const reviewBtn = document.getElementById("retentionGateReviewBtn");
  const continueBtn = document.getElementById("retentionGateContinueBtn");
  if (!modal || !text || !reviewBtn || !continueBtn) return;

  retentionGateShown = true;
  if (trigger === "weak_answer") {
    text.textContent = dueItems.length === 1
      ? `This answer has been added to your memory review for ${getSubjectDisplayName()}. You can review the flashcard now or continue this quiz level first.`
      : `This answer has been added to your memory review for ${getSubjectDisplayName()}, and you now have ${dueItems.length} due memory card${dueItems.length === 1 ? "" : "s"} for this subject. You can review them now or continue this quiz level first.`;
  } else {
    text.textContent = `You already have ${dueItems.length} due memory card${dueItems.length === 1 ? "" : "s"} for ${getSubjectDisplayName()} from earlier review work. Reviewing them first can improve retention before you continue this quiz level.`;
  }
  reviewBtn.onclick = () => {
    window.location.href = `review.html?mode=flashcards&subject=${encodeURIComponent(subject)}`;
  };
  continueBtn.onclick = () => {
    modal.classList.remove("active");
  };
  modal.classList.add("active");
}

async function promptRetentionGateAfterWeakAnswer() {
  retentionGateShown = false;
  await maybeShowRetentionGate({ trigger: "weak_answer" });
}

function renderQuestion() {
  const restoredChoice = selectedChoice;
  const restoredConfidence = selectedConfidence;
  selectedChoice = null;
  selectedConfidence = null;
  document.getElementById("nextBtn").disabled = true;

  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) return;

  if (isQuestionLockedForToday(currentQuestion)) {
    currentIndex += 1;
    showRationaleWithAction(false, currentQuestion, {
      title: "Try Again Tomorrow",
      text: `You already used all ${MAX_DAILY_TRIES_PER_QUESTION} tries for this question today. We'll move to the next question for now, and you can answer this one again tomorrow.`,
      buttonText: currentIndex < questions.length ? "Continue" : "Finish",
      nextAction: currentIndex < questions.length ? "advance" : "finish"
    });
    return;
  }

  updateProgress();
  document.getElementById("questionText").textContent = currentQuestion.question;

  let media = document.getElementById("questionMedia");
  if (!media) {
    media = document.createElement("div");
    media.id = "questionMedia";
    media.className = "level-question-media";
    document.querySelector(".level-question-block")?.appendChild(media);
  }
  media.innerHTML = currentQuestion.image
    ? `
      <div class="level-question-image-frame">
        <button type="button" class="image-inspector-trigger" aria-label="Open enlarged question image">
          <img
            src="${currentQuestion.image}"
            alt="Question visual"
            loading="lazy"
            decoding="async"
            class="level-question-image${currentQuestion.imageCropBottom ? " is-cropped" : ""}"
            style="${currentQuestion.imageCropBottom ? `--question-image-crop-bottom: ${currentQuestion.imageCropBottom}px;` : ""}"
          >
          <span>Enlarge Image</span>
        </button>
      </div>
    `
    : "";
  attachQuestionImageInspector(media, "Question visual");

  const container = document.getElementById("choicesContainer");
  container.innerHTML = "";

  currentQuestion.choices.forEach((choice, index) => {
    const button = document.createElement("button");
    button.className = "choice-btn";
    button.type = "button";
    let lastPreviewOpenAt = 0;

    if (currentQuestion.choiceImages?.[index]) {
      button.classList.add("choice-media-btn");
      button.setAttribute("aria-label", `View enlarged image and details for ${choice}`);
      button.innerHTML = `
        <span class="choice-media-label">${choice}</span>
        <span class="choice-media-hint">Click to view image and details</span>
      `;
    } else {
      button.textContent = choice;
    }

    function openPreviewFromChoice(event) {
      if (!button.classList.contains("choice-media-btn")) return false;
      event.preventDefault();
      event.stopPropagation();
      const now = Date.now();
      if (now - lastPreviewOpenAt < 350) return true;
      lastPreviewOpenAt = now;
      openChoiceImagePreview(currentQuestion, choice, index, button);
      return true;
    }

    button.addEventListener("pointerup", (event) => {
      openPreviewFromChoice(event);
    });

    button.addEventListener("keydown", (event) => {
      if ((event.key === "Enter" || event.key === " ") && openPreviewFromChoice(event)) {
        return;
      }
    });

    button.addEventListener("click", (event) => {
      if (openPreviewFromChoice(event)) {
        return;
      }
      selectChoice(choice, button);
    });

    container.appendChild(button);
    if (restoredChoice && restoredChoice === choice) {
      button.classList.add("selected");
      selectedChoice = choice;
    }
  });

  renderConfidenceSelection(restoredConfidence);
  document.getElementById("nextBtn").textContent = currentIndex === questions.length - 1 ? "Submit" : "Next →";
}

function buildRationale(question, isCorrect) {
  if (question?.rationale) {
    return question.rationale;
  }
  return isCorrect
    ? "Correct. Keep going."
    : "Not quite. Review the question carefully and try to connect it to the lesson before moving on.";
}

function buildWrongAnswerReviewPayload(question, selectedAnswer) {
  return {
    source: "quiz-level",
    subject,
    difficulty,
    quizType: "quiz-level",
    quizLevel,
    level: question?.level || quizLevel,
    sub: question?.sub || currentIndex + 1,
    title: `${subject === "hardware" ? "Computer Hardware" : "Electrical"} ${difficulty} Level ${quizLevel}`,
    question: String(question?.question || ""),
    image: String(question?.image || ""),
    imageCropBottom: Number(question?.imageCropBottom || 0) || 0,
    selectedAnswer: String(selectedAnswer || ""),
    correctAnswer: String(question?.answer || ""),
    rationale: buildRationale(question, false),
    actionUrl: `quiz-level.html?subject=${encodeURIComponent(subject)}&difficulty=${encodeURIComponent(difficulty)}&quizLevel=${encodeURIComponent(quizLevel)}`,
    retryAvailableAt: getTomorrowRetryIso(),
    retryPolicy: "next_day",
    confidence: selectedConfidence || "",
    lastAnsweredAt: new Date().toISOString()
  };
}

function buildAnswerDetailItem(question, selectedAnswer, isCorrect) {
  return {
    subject,
    type: "quiz-level",
    difficulty,
    quizLevel,
    level: question?.level || quizLevel,
    questionNumber: question?.sub || currentIndex + 1,
    questionId: getQuestionIdentifier(question),
    question: String(question?.question || ""),
    selectedAnswer: String(selectedAnswer || ""),
    correctAnswer: String(question?.answer || ""),
    isCorrect: Boolean(isCorrect),
    result: isCorrect ? "Correct" : "Wrong",
    confidence: selectedConfidence || "",
    rationale: buildRationale(question, isCorrect),
    source: "saved_attempt",
    answeredAt: new Date().toISOString()
  };
}

function showRationale(isCorrect, question) {
  document.getElementById("rationaleTitle").textContent = isCorrect ? "Correct ✔" : "Wrong ✖";
  document.getElementById("rationaleText").textContent = buildRationale(question, isCorrect);
  document.getElementById("rationaleModal").classList.add("active");
}

window.closeRationale = function () {
  document.getElementById("rationaleModal").classList.remove("active");
  if (currentIndex < questions.length) {
    renderQuestion();
  } else {
    finishLevel().catch((error) => {
      console.error("Error finishing quiz level:", error);
      document.getElementById("resultModal").classList.add("active");
    });
  }
};

function showRationaleWithAction(isCorrect, question, options = {}) {
  rationaleNextAction = options.nextAction || "advance";
  rationaleRetryIndex = Number.isInteger(options.retryIndex) ? options.retryIndex : null;
  document.getElementById("rationaleTitle").textContent = options.title || (isCorrect ? "Correct ✓" : "Wrong ✕");
  document.getElementById("rationaleText").textContent = options.text || buildRationale(question, isCorrect);
  const rationaleActionBtn = document.getElementById("rationaleActionBtn");
  if (rationaleActionBtn) {
    rationaleActionBtn.textContent = options.buttonText || "Continue";
  }
  document.getElementById("rationaleModal").classList.add("active");
}

window.closeRationale = function () {
  document.getElementById("rationaleModal").classList.remove("active");

  if (rationaleNextAction === "retry") {
    if (Number.isInteger(rationaleRetryIndex)) {
      currentIndex = rationaleRetryIndex;
    }
    rationaleRetryIndex = null;
    renderQuestion();
    return;
  }

  rationaleRetryIndex = null;

  if (rationaleNextAction === "advance" && currentIndex < questions.length) {
    renderQuestion();
    return;
  }

  finishLevel().catch((error) => {
    console.error("Error finishing quiz level:", error);
    document.getElementById("resultModal").classList.add("active");
  });
};

function addLocalXP(amount) {
  const currentXP = parseInt(localStorage.getItem("guest_xp") || "0", 10);
  const currentWeeklyXP = parseInt(localStorage.getItem("guest_xpWeekly") || "0", 10);
  const nextXP = currentXP + amount;
  localStorage.setItem("guest_xp", String(nextXP));
  localStorage.setItem("guest_xpWeekly", String(currentWeeklyXP + amount));
  renderXpDock(nextXP);
}

async function addLevelXP(amount) {
  if (!amount || amount <= 0) return;

  if (!currentUser) {
    addLocalXP(amount);
    return;
  }

  const userRef = await ensureUserDoc(currentUser.uid);
  const snap = await getDoc(userRef);
  const data = snap.data() || {};
  const currentWeek = getWeekKey();
  const lastWeeklyReset = data.lastWeeklyReset || currentWeek;
  const currentXP = Number(data.xp || 0);
  const currentWeeklyXP = lastWeeklyReset === currentWeek ? Number(data.xpWeekly || 0) : 0;

  await updateDoc(userRef, {
    xp: currentXP + amount,
    xpWeekly: currentWeeklyXP + amount,
    xpChange: amount,
    lastWeeklyReset: currentWeek
  });

  await syncPublicLeaderboardEntry(db, currentUser.uid, {
    name: data.name || currentUser.displayName || currentUser.email || "User",
    photo: data.photo || currentUser.photoURL || "https://i.pravatar.cc/40?img=12",
    xp: currentXP + amount,
    xpWeekly: currentWeeklyXP + amount,
    xpChange: amount
  });
  renderXpDock(currentXP + amount);
}

async function saveLevelCompletion({ earnedXP, awardedIds }) {
  const awardedIdList = Array.from(new Set(normalizeQuestionIdList(awardedIds)));

  localStorage.setItem(getLevelDoneKey(), "true");
  if (difficulty === "easy") {
    localStorage.setItem(getLegacyLevelDoneKey(), "true");
  }

  localStorage.setItem(getResultKey(), JSON.stringify({
    subject,
    difficulty,
    quizLevel,
    score,
    total: questions.length,
    earnedXP,
    xpAwardedQuestionIds: awardedIdList,
    completedAt: new Date().toISOString()
  }));

  const totalLevels = await getTotalLevels();
  const allDone = Array.from({ length: totalLevels }, (_, index) => index + 1).every((level) => {
    if (level === quizLevel) return true;
    return localStorage.getItem(`${subject}_${difficulty}_quiz_level_${level}_done`) === "true";
  });

  if (allDone) {
    localStorage.setItem(getOverallQuizKey(), "true");
  }

  if (!currentUser) {
    return;
  }

  const userRef = await ensureUserDoc(currentUser.uid);
  const snap = await getDoc(userRef);
  const data = snap.data() || {};
  const progress = data.progress || {};
  const results = data.results || {};

  progress[getLevelDoneKey()] = true;
  if (difficulty === "easy") {
    progress[getLegacyLevelDoneKey()] = true;
  }
  if (allDone) {
    progress[getOverallQuizKey()] = true;
  }

  results[getResultKey()] = {
    subject,
    difficulty,
    quizLevel,
    score,
    total: questions.length,
    earnedXP,
    answerItems: answeredQuestionsThisRun,
    xpAwardedQuestionIds: awardedIdList,
    completedAt: new Date().toISOString()
  };

  await updateDoc(userRef, { progress, results });
}

async function finishLevel() {
  document.getElementById("levelProgressFill").style.width = "100%";
  document.getElementById("levelProgressText").textContent = "100% Completed";

  const newlyAwardedIds = Array.from(correctQuestionIdsThisRun).filter((id) => !awardedQuestionIds.has(id));
  newlyAwardedIds.forEach((id) => awardedQuestionIds.add(id));
  const earnedXP = newlyAwardedIds.length * XP_PER_CORRECT;
  await addLevelXP(earnedXP);
  await saveLevelCompletion({
    earnedXP,
    awardedIds: Array.from(awardedQuestionIds)
  });
  await clearQuizLevelResumeState();
  correctQuestionIdsThisRun = new Set();
  answeredQuestionsThisRun = [];

  document.getElementById("resultMessage").textContent =
    `You completed Level ${quizLevel} with a score of ${score}/${questions.length} and earned ${earnedXP} XP.`;
  const recoverySummary = document.getElementById("resultRecoverySummary");
  if (recoverySummary) {
    if (recoveredMistakesThisRun > 0) {
      recoverySummary.hidden = false;
      recoverySummary.textContent = `Recovery win: you fixed ${recoveredMistakesThisRun} previously missed question${recoveredMistakesThisRun === 1 ? "" : "s"} in this level.`;
    } else {
      recoverySummary.hidden = true;
      recoverySummary.textContent = "";
    }
  }
  const finishLevelBtn = document.getElementById("finishLevelBtn");
  if (finishLevelBtn) {
    finishLevelBtn.textContent = quizLevel < await getTotalLevels() ? "Next Level" : "Back to Levels";
  }
  document.getElementById("resultModal").classList.add("active");
  recoveredMistakesThisRun = 0;
}

window.handleNext = function () {
  if (!selectedChoice || !selectedConfidence) return;

  const currentQuestion = questions[currentIndex];
  const isCorrect = selectedChoice === currentQuestion.answer;
  const reviewPayload = buildWrongAnswerReviewPayload(currentQuestion, selectedChoice);
  const reviewTrackingKey = buildReviewTrackingKey(reviewPayload);
  const lowConfidence = isLowConfidenceAnswer(selectedConfidence);
  const questionState = recordQuestionAttempt(currentQuestion, isCorrect);
  answeredQuestionsThisRun.push(buildAnswerDetailItem(currentQuestion, selectedChoice, isCorrect));

  if (isCorrect) {
    correctQuestionIdsThisRun.add(getQuestionIdentifier(currentQuestion));
    if (wrongAnswerReviewKeys.has(reviewTrackingKey)) {
      recoveredMistakesThisRun += 1;
      wrongAnswerReviewKeys.delete(reviewTrackingKey);
    }
    resolveWrongAnswerReview({
      db,
      user: currentUser,
      payload: reviewPayload
    }).catch((error) => {
      console.warn("Unable to resolve wrong-answer review item.", error);
    });
    if (lowConfidence) {
      saveRetentionReview({
        db,
        user: currentUser,
        payload: {
          ...reviewPayload,
          seedReason: "low_confidence_correct"
        }
      }).catch((error) => {
        console.warn("Unable to queue low-confidence retention item.", error);
      });
    } else {
      resolveRetentionReview({
        db,
        user: currentUser,
        payload: reviewPayload
      }).catch((error) => {
        console.warn("Unable to advance retention review item.", error);
      });
    }
    score += 1;
    playSound("correct");
    currentIndex += 1;
    selectedChoice = null;
    selectedConfidence = null;
    saveQuizLevelResumeState().catch((error) => {
      console.warn("Unable to save quiz level resume state.", error);
    });
    showRationaleWithAction(true, currentQuestion, {
      title: lowConfidence ? "Correct, Review Later" : "Correct ✓",
      text: lowConfidence
        ? `Correct, but you marked this as ${getConfidenceLabel(reviewPayload.confidence).toLowerCase()}. It has been queued for Today's Memory Review.`
        : undefined,
      buttonText: currentIndex < questions.length ? "Continue" : "Finish",
      nextAction: currentIndex < questions.length ? "advance" : "finish"
    });
  } else {
    playSound("wrong");
    const remainingTries = getRemainingQuestionTries(questionState);
    const exhaustedTries = remainingTries <= 0;

    if (exhaustedTries) {
      saveWrongAnswerReview({
        db,
        user: currentUser,
        payload: reviewPayload
      }).catch((error) => {
        console.warn("Unable to save wrong-answer review item.", error);
      });
      wrongAnswerReviewKeys.add(reviewTrackingKey);
      saveRetentionReview({
        db,
        user: currentUser,
        payload: {
          ...reviewPayload,
          seedReason: "wrong_answer"
        }
      }).catch((error) => {
        console.warn("Unable to queue retention review item.", error);
      });
      currentIndex += 1;
    }

    selectedChoice = null;
    selectedConfidence = null;
    saveQuizLevelResumeState().catch((error) => {
      console.warn("Unable to save quiz level resume state.", error);
    });
    showRationaleWithAction(false, currentQuestion, {
      text: remainingTries > 0
        ? `${buildRationale(currentQuestion, false)} You still have ${remainingTries} ${remainingTries === 1 ? "try" : "tries"} left for this question today.`
        : `${buildRationale(currentQuestion, false)} This question is now locked for today and has been added to Wrong-Answer Review. You can answer it again tomorrow.`,
      buttonText: remainingTries > 0 ? "Try Again" : (currentIndex < questions.length ? "Continue" : "Finish"),
      nextAction: remainingTries > 0 ? "retry" : (currentIndex < questions.length ? "advance" : "finish"),
      retryIndex: remainingTries > 0 ? currentIndex : null
    });
  }
};

window.goBackToLevels = function () {
  window.location.href = `quiz-levels.html?subject=${subject}&difficulty=${difficulty}`;
};

window.finishLevelFlow = async function () {
  const totalLevels = await getTotalLevels();
  if (quizLevel < totalLevels) {
    window.location.href = `quiz-level.html?subject=${subject}&difficulty=${difficulty}&quizLevel=${quizLevel + 1}`;
    return;
  }

  window.location.href = `quiz-levels.html?subject=${subject}&difficulty=${difficulty}`;
};

async function initializePage() {
  loadTheme();
  initSounds();
  initGlobalClickSound();
  setupSoundToggles();
  bindConfidenceOptions();
  renderHeader();
  const slowLoadTimer = startSlowQuizNotice();
  saveStudyHistory({
    db,
    user: currentUser,
    payload: {
      key: `quiz-level|${subject}|${difficulty}|${quizLevel}`,
      kind: "quiz-level",
      title: `Level ${quizLevel}`,
      subject,
      difficulty,
      detail: `${subject === "hardware" ? "Computer Hardware" : "Electrical"} • ${difficulty} quiz`,
      actionUrl: `quiz-level.html?subject=${encodeURIComponent(subject)}&difficulty=${encodeURIComponent(difficulty)}&quizLevel=${encodeURIComponent(quizLevel)}`
    }
  }).catch((error) => {
    console.warn("Unable to save study history for quiz level.", error);
  });
  await prepareQuestions();
  await Promise.all([syncAwardedQuestionIds(), syncWrongAnswerReviewKeys()]);
  restoreQuizLevelResumeState();
  renderQuestion();
  stopSlowQuizNotice(slowLoadTimer);
  deferQuizTask(prefetchNextQuizLevel);
  tryStartMusic();
  syncXpDock().catch((error) => {
    console.error("Error loading XP dock:", error);
    renderXpDock(parseInt(localStorage.getItem("guest_xp") || "0", 10));
  });

  document.body.addEventListener("click", () => {
    tryStartMusic();
  }, { once: true });
}

onAuthStateChanged(auth, (user) => {
  currentUser = user || null;
  syncAwardedQuestionIds().catch((error) => {
    console.warn("Unable to refresh awarded question XP state.", error);
  });
  syncWrongAnswerReviewKeys().catch((error) => {
    console.warn("Unable to refresh wrong-answer review tracking state.", error);
  });
  syncXpDock().catch((error) => {
    console.error("Error syncing XP dock:", error);
  });
  retentionGateShown = false;
});

initializePage();
