import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { restartThemeMusic, playSound } from "./sound.js";

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
const quizLevel = parseInt(params.get("quizLevel") || "1", 10);

const XP_PER_LEVEL = 6;

let currentUser = null;
let questions = [];
let currentIndex = 0;
let selectedChoice = null;
let score = 0;
let xpAwarded = false;

function getLevelDoneKey() {
  return `${subject}_quiz_level_${quizLevel}_done`;
}

function getOverallQuizKey() {
  return `${subject}_quiz`;
}

function getResultKey() {
  return `${subject}_quiz_level_${quizLevel}_result`;
}

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

window.goBackToLevels = function () {
  window.location.href = `quiz-levels.html?subject=${subject}`;
};

window.finishLevelFlow = function () {
  document.getElementById("resultModal").classList.remove("active");
  window.location.href = `quiz-levels.html?subject=${subject}`;
};

function shuffleArray(array) {
  const cloned = [...array];
  for (let i = cloned.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
  }
  return cloned;
}

function getPlaceholderQuestions(subjectName, levelNumber) {
  return [
    {
      question: `${subjectName.toUpperCase()} - Level ${levelNumber} - Question 1`,
      choices: ["Choice A", "Choice B", "Choice C", "Choice D"],
      answer: "Choice A"
    },
    {
      question: `${subjectName.toUpperCase()} - Level ${levelNumber} - Question 2`,
      choices: ["Choice A", "Choice B", "Choice C", "Choice D"],
      answer: "Choice B"
    },
    {
      question: `${subjectName.toUpperCase()} - Level ${levelNumber} - Question 3`,
      choices: ["Choice A", "Choice B", "Choice C", "Choice D"],
      answer: "Choice C"
    }
  ];
}

function prepareQuestions() {
  questions = getPlaceholderQuestions(subject, quizLevel).map((item) => ({
    ...item,
    choices: shuffleArray(item.choices)
  }));
}

function renderHeader() {
  document.getElementById("levelTag").textContent = `${subject.toUpperCase()} QUIZ`;
  document.getElementById("levelTitle").textContent = `Level ${quizLevel}`;
  document.getElementById("levelSubtitle").textContent = "Answer 3 questions to complete this level and earn 6 XP.";
}

function updateProgress() {
  const percent = Math.floor((currentIndex / questions.length) * 100);
  document.getElementById("questionCounter").textContent = `Question ${currentIndex + 1} of ${questions.length}`;
  document.getElementById("levelProgressFill").style.width = `${percent}%`;
  document.getElementById("levelProgressText").textContent = `${percent}% Completed`;
}

function renderQuestion() {
  selectedChoice = null;
  document.getElementById("nextBtn").disabled = true;

  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) return;

  updateProgress();
  document.getElementById("questionText").textContent = currentQuestion.question;

  const container = document.getElementById("choicesContainer");
  container.innerHTML = "";

  currentQuestion.choices.forEach((choice) => {
    const btn = document.createElement("button");
    btn.className = "choice-btn";
    btn.textContent = choice;

    btn.addEventListener("click", () => {
      document.querySelectorAll(".choice-btn").forEach((item) => item.classList.remove("selected"));
      btn.classList.add("selected");
      selectedChoice = choice;
      document.getElementById("nextBtn").disabled = false;
    });

    container.appendChild(btn);
  });

  document.getElementById("nextBtn").textContent =
    currentIndex === questions.length - 1 ? "Submit" : "Next →";
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

async function addXP(amount) {
  if (!amount || amount <= 0) return;

  if (currentUser) {
    const userRef = await ensureUserDoc(currentUser.uid);
    const snap = await getDoc(userRef);
    const data = snap.data() || {};
    const currentXP = Number(data.xp || 0);
    const newXP = currentXP + amount;

    await updateDoc(userRef, { xp: newXP });
    return;
  }

  const guestXP = parseInt(localStorage.getItem("guest_xp") || "0", 10);
  localStorage.setItem("guest_xp", String(guestXP + amount));
}

async function saveLevelCompletion() {
  localStorage.setItem(getLevelDoneKey(), "true");
  localStorage.setItem(getResultKey(), JSON.stringify({
    subject,
    quizLevel,
    score,
    total: questions.length,
    completedAt: new Date().toISOString()
  }));

  if (!currentUser) return;

  const userRef = await ensureUserDoc(currentUser.uid);
  const snap = await getDoc(userRef);
  const data = snap.data() || {};
  const progress = data.progress || {};
  const results = data.results || {};

  progress[getLevelDoneKey()] = true;
  results[getResultKey()] = {
    subject,
    quizLevel,
    score,
    total: questions.length,
    completedAt: new Date().toISOString()
  };

  const allDone = Array.from({ length: 25 }, (_, idx) => idx + 1).every((lvl) => {
    if (lvl === quizLevel) return true;
    return progress[`${subject}_quiz_level_${lvl}_done`] === true || localStorage.getItem(`${subject}_quiz_level_${lvl}_done`) === "true";
  });

  if (allDone) {
    progress[getOverallQuizKey()] = true;
    localStorage.setItem(getOverallQuizKey(), "true");
  }

  await updateDoc(userRef, { progress, results });
}

async function awardLevelXPOnce() {
  if (xpAwarded) return;

  const alreadyDone = localStorage.getItem(getLevelDoneKey()) === "true";
  if (alreadyDone) {
    xpAwarded = true;
    return;
  }

  await addXP(XP_PER_LEVEL);
  xpAwarded = true;
}

async function finishLevel() {
  document.getElementById("levelProgressFill").style.width = "100%";
  document.getElementById("levelProgressText").textContent = "100% Completed";

  await awardLevelXPOnce();
  await saveLevelCompletion();

  document.getElementById("resultMessage").textContent =
    `You completed Level ${quizLevel} and earned ${XP_PER_LEVEL} XP.`;

  document.getElementById("resultModal").classList.add("active");
}

window.handleNext = function () {
  if (!selectedChoice) return;

  const currentQuestion = questions[currentIndex];
  const isCorrect = selectedChoice === currentQuestion.answer;

  if (isCorrect) {
    score++;
    playSound("correct");
  } else {
    playSound("wrong");
  }

  currentIndex++;

  if (currentIndex < questions.length) {
    renderQuestion();
  } else {
    finishLevel().catch((error) => {
      console.error("Error finishing level:", error);
      document.getElementById("resultModal").classList.add("active");
    });
  }
};

onAuthStateChanged(auth, (user) => {
  currentUser = user || null;
});

loadTheme();
renderHeader();
prepareQuestions();
renderQuestion();