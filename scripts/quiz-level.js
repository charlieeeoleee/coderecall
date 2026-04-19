import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
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
import { saveWrongAnswerReview, resolveWrongAnswerReview } from "./review-store.js";
import { saveStudyHistory } from "./study-history-store.js";

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
const subject = (params.get("subject") || "electrical").toLowerCase();
const difficulty = (params.get("difficulty") || "easy").toLowerCase();
const quizLevel = parseInt(params.get("quizLevel") || "1", 10);

const XP_PER_CORRECT = 2;
const MAX_DAILY_TRIES_PER_QUESTION = 1;

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
let score = 0;
let currentUser = auth.currentUser || null;
let rationaleNextAction = "advance";
let currentTotalXP = 0;
let questionBankCache = null;
const RESUME_ACTIVITY_KEY = "resume_activity";

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
    questionBankCache = import("../data/quiz-data-electrical.js?v=20260414perf").then((module) => ({
      electrical: module.electricalQuizData?.electrical || {}
    }));
    return questionBankCache;
  }

  questionBankCache = import("../data/quiz-data-hardware.js?v=20260414perf").then((module) => ({
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
    score,
    selectedChoice,
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
  return true;
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
  const baseBank = await loadQuestionBank();
  const electricalBank = JSON.parse(JSON.stringify(baseBank.electrical || {}));
  const hardwareBank = JSON.parse(JSON.stringify(baseBank.hardware || {}));
  const hardwareFallbacks = HARDWARE_QUIZ_LEVEL_FALLBACKS[difficulty] || {};
  const hardwareOverrides = HARDWARE_QUIZ_OVERRIDES[difficulty] || {};

  Object.entries(hardwareFallbacks).forEach(([levelKey, levelQuestions]) => {
    if (!hardwareBank[difficulty]?.[levelKey]?.length) {
      if (!hardwareBank[difficulty]) {
        hardwareBank[difficulty] = {};
      }
      hardwareBank[difficulty][levelKey] = JSON.parse(JSON.stringify(levelQuestions));
    }
  });

  Object.entries(hardwareBank[difficulty] || {}).forEach(([levelKey, levelQuestions]) => {
    hardwareBank[difficulty][levelKey] = (levelQuestions || []).map((question) => {
      const overrideKey = `${question.level}.${question.sub}`;
      const override = hardwareOverrides[overrideKey] || {};
      return {
        ...question,
        ...override,
        choices: override.choices || question.choices
      };
    });
  });

  return subject === "electrical"
    ? { electrical: electricalBank }
    : { hardware: hardwareBank };
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
  const levelQuestions = await getQuestionSet();
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

function renderQuestion() {
  const restoredChoice = selectedChoice;
  selectedChoice = null;
  document.getElementById("nextBtn").disabled = true;

  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) return;

  if (isQuestionLockedForToday(currentQuestion)) {
    currentIndex += 1;
    showRationaleWithAction(false, currentQuestion, {
      title: "Try Again Tomorrow",
      text: "You already used both tries for this question today. We'll move to the next question for now, and you can answer this one again tomorrow.",
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
        <img
          src="${currentQuestion.image}"
          alt="Question visual"
          loading="lazy"
          decoding="async"
          class="level-question-image${currentQuestion.imageCropBottom ? " is-cropped" : ""}"
          style="${currentQuestion.imageCropBottom ? `--question-image-crop-bottom: ${currentQuestion.imageCropBottom}px;` : ""}"
        >
      </div>
    `
    : "";

  const container = document.getElementById("choicesContainer");
  container.innerHTML = "";

  currentQuestion.choices.forEach((choice, index) => {
    const button = document.createElement("button");
    button.className = "choice-btn";
    button.type = "button";

    if (currentQuestion.choiceImages?.[index]) {
      button.innerHTML = `
        <span class="choice-media-wrap">
          <img src="${currentQuestion.choiceImages[index]}" alt="Choice ${index + 1}" class="choice-media-image" loading="lazy" decoding="async">
        </span>
        <span class="choice-media-label">${choice}</span>
      `;
    } else {
      button.textContent = choice;
    }

    button.addEventListener("click", () => {
      document.querySelectorAll(".choice-btn").forEach((item) => item.classList.remove("selected"));
      button.classList.add("selected");
      selectedChoice = choice;
      document.getElementById("nextBtn").disabled = false;
      saveQuizLevelResumeState().catch((error) => {
        console.warn("Unable to save quiz level resume state.", error);
      });
    });

    container.appendChild(button);
    if (restoredChoice && restoredChoice === choice) {
      button.classList.add("selected");
      selectedChoice = choice;
      document.getElementById("nextBtn").disabled = false;
    }
  });

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
    selectedAnswer: String(selectedAnswer || ""),
    correctAnswer: String(question?.answer || ""),
    rationale: buildRationale(question, false),
    actionUrl: `quiz-level.html?subject=${encodeURIComponent(subject)}&difficulty=${encodeURIComponent(difficulty)}&quizLevel=${encodeURIComponent(quizLevel)}`,
    retryAvailableAt: getTomorrowRetryIso(),
    retryPolicy: "next_day",
    lastAnsweredAt: new Date().toISOString()
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
    renderQuestion();
    return;
  }

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

async function saveLevelCompletion() {
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
    completedAt: new Date().toISOString()
  };

  await updateDoc(userRef, { progress, results });
}

async function finishLevel() {
  document.getElementById("levelProgressFill").style.width = "100%";
  document.getElementById("levelProgressText").textContent = "100% Completed";

  const earnedXP = score * XP_PER_CORRECT;
  await addLevelXP(earnedXP);
  await saveLevelCompletion();
  await clearQuizLevelResumeState();

  document.getElementById("resultMessage").textContent =
    `You completed Level ${quizLevel} with a score of ${score}/${questions.length} and earned ${earnedXP} XP.`;
  const finishLevelBtn = document.getElementById("finishLevelBtn");
  if (finishLevelBtn) {
    finishLevelBtn.textContent = quizLevel < await getTotalLevels() ? "Next Level" : "Back to Levels";
  }
  document.getElementById("resultModal").classList.add("active");
}

window.handleNext = function () {
  if (!selectedChoice) return;

  const currentQuestion = questions[currentIndex];
  const isCorrect = selectedChoice === currentQuestion.answer;
  const questionState = recordQuestionAttempt(currentQuestion, isCorrect);

  if (isCorrect) {
    resolveWrongAnswerReview({
      db,
      user: currentUser,
      payload: buildWrongAnswerReviewPayload(currentQuestion, selectedChoice)
    }).catch((error) => {
      console.warn("Unable to resolve wrong-answer review item.", error);
    });
    score += 1;
    playSound("correct");
    currentIndex += 1;
    selectedChoice = null;
    saveQuizLevelResumeState().catch((error) => {
      console.warn("Unable to save quiz level resume state.", error);
    });
    showRationaleWithAction(true, currentQuestion, {
      buttonText: currentIndex < questions.length ? "Continue" : "Finish",
      nextAction: currentIndex < questions.length ? "advance" : "finish"
    });
  } else {
    playSound("wrong");
    saveWrongAnswerReview({
      db,
      user: currentUser,
      payload: buildWrongAnswerReviewPayload(currentQuestion, selectedChoice)
    }).catch((error) => {
      console.warn("Unable to save wrong-answer review item.", error);
    });
    currentIndex += 1;
    selectedChoice = null;
    saveQuizLevelResumeState().catch((error) => {
      console.warn("Unable to save quiz level resume state.", error);
    });
    showRationaleWithAction(false, currentQuestion, {
      text: `${buildRationale(currentQuestion, false)} This question is now locked for today and has been added to Wrong-Answer Review. You can answer it again tomorrow.`,
      buttonText: currentIndex < questions.length ? "Continue" : "Finish",
      nextAction: currentIndex < questions.length ? "advance" : "finish"
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
  renderHeader();
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
  restoreQuizLevelResumeState();
  renderQuestion();
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
  syncXpDock().catch((error) => {
    console.error("Error syncing XP dock:", error);
  });
});

initializePage();
