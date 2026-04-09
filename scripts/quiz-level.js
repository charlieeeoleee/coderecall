import { electricalQuizData } from "../data/quiz-data-electrical.js";
import { hardwareQuizData } from "../data/quiz-data-hardware.js";
import {
  initSounds,
  initGlobalClickSound,
  tryStartMusic,
  restartThemeMusic,
  handleSoundToggle,
  handleMusicToggle
} from "./sound.js";

const params = new URLSearchParams(window.location.search);
const subject = (params.get("subject") || "electrical").toLowerCase();
const difficulty = (params.get("difficulty") || "easy").toLowerCase();
const quizLevel = parseInt(params.get("quizLevel") || "1", 10);

const XP_PER_CORRECT = 2;

const HARDWARE_DOC_IMAGE_BASE = "assets/quizzes/hardware/docx";
const HARDWARE_QUIZ_OVERRIDES = {
  easy: {
    "1.3": {
      image: `${HARDWARE_DOC_IMAGE_BASE}/image10.png`
    },
    "6.3": {
      image: `${HARDWARE_DOC_IMAGE_BASE}/image5.png`
    },
    "7.3": {
      image: `${HARDWARE_DOC_IMAGE_BASE}/image17.png`
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
        `${HARDWARE_DOC_IMAGE_BASE}/image7.png`,
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
      image: `${HARDWARE_DOC_IMAGE_BASE}/image26.png`
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
  }
};

let questions = [];
let currentIndex = 0;
let selectedChoice = null;
let score = 0;

function shuffleArray(array) {
  const cloned = [...array];
  for (let index = cloned.length - 1; index > 0; index -= 1) {
    const nextIndex = Math.floor(Math.random() * (index + 1));
    [cloned[index], cloned[nextIndex]] = [cloned[nextIndex], cloned[index]];
  }
  return cloned;
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

function getQuestionBank() {
  const electricalBank = JSON.parse(JSON.stringify(electricalQuizData.electrical || {}));

  const hardwareBank = JSON.parse(JSON.stringify(hardwareQuizData.hardware || {}));
  const hardwareOverrides = HARDWARE_QUIZ_OVERRIDES[difficulty] || {};

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

  return {
    electrical: electricalBank,
    hardware: hardwareBank
  };
}

function getQuestionSet() {
  const bank = getQuestionBank();
  const bySubject = bank[subject] || {};
  const byDifficulty = bySubject[difficulty] || {};
  return byDifficulty[quizLevel] || [];
}

function getTotalLevels() {
  const bank = getQuestionBank();
  const bySubject = bank[subject] || {};
  const byDifficulty = bySubject[difficulty] || {};
  return Object.keys(byDifficulty).length;
}

function prepareQuestions() {
  const levelQuestions = getQuestionSet();

  questions = shuffleArray(levelQuestions.map((question) => shuffleQuestionChoices(normalizeAnswer(question))));

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
  selectedChoice = null;
  document.getElementById("nextBtn").disabled = true;

  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) return;

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
    ? `<img src="${currentQuestion.image}" alt="Question visual" class="level-question-image">`
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
          <img src="${currentQuestion.choiceImages[index]}" alt="Choice ${index + 1}" class="choice-media-image">
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
    });

    container.appendChild(button);
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
    finishLevel();
  }
};

function addLocalXP(amount) {
  const currentXP = parseInt(localStorage.getItem("guest_xp") || "0", 10);
  const currentWeeklyXP = parseInt(localStorage.getItem("guest_xpWeekly") || "0", 10);
  localStorage.setItem("guest_xp", String(currentXP + amount));
  localStorage.setItem("guest_xpWeekly", String(currentWeeklyXP + amount));
}

function saveLevelCompletion() {
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

  const totalLevels = getTotalLevels();
  const allDone = Array.from({ length: totalLevels }, (_, index) => index + 1).every((level) => {
    if (level === quizLevel) return true;
    return localStorage.getItem(`${subject}_${difficulty}_quiz_level_${level}_done`) === "true";
  });

  if (allDone) {
    localStorage.setItem(getOverallQuizKey(), "true");
  }
}

function finishLevel() {
  document.getElementById("levelProgressFill").style.width = "100%";
  document.getElementById("levelProgressText").textContent = "100% Completed";

  const alreadyDone =
    localStorage.getItem(getLevelDoneKey()) === "true" ||
    (difficulty === "easy" && localStorage.getItem(getLegacyLevelDoneKey()) === "true");

  const earnedXP = alreadyDone ? 0 : score * XP_PER_CORRECT;
  if (!alreadyDone) {
    addLocalXP(earnedXP);
  }
  saveLevelCompletion();

  document.getElementById("resultMessage").textContent =
    `You completed Level ${quizLevel} with a score of ${score}/${questions.length} and earned ${earnedXP} XP.`;
  const finishLevelBtn = document.getElementById("finishLevelBtn");
  if (finishLevelBtn) {
    finishLevelBtn.textContent = quizLevel < getTotalLevels() ? "Next Level" : "Back to Levels";
  }
  document.getElementById("resultModal").classList.add("active");
}

window.handleNext = function () {
  if (!selectedChoice) return;

  const currentQuestion = questions[currentIndex];
  const isCorrect = selectedChoice === currentQuestion.answer;

  if (isCorrect) {
    score += 1;
  }

  currentIndex += 1;
  showRationale(isCorrect, currentQuestion);
};

window.goBackToLevels = function () {
  window.location.href = `quiz-levels.html?subject=${subject}&difficulty=${difficulty}`;
};

window.finishLevelFlow = function () {
  const totalLevels = getTotalLevels();
  if (quizLevel < totalLevels) {
    window.location.href = `quiz-level.html?subject=${subject}&difficulty=${difficulty}&quizLevel=${quizLevel + 1}`;
    return;
  }

  window.location.href = `quiz-levels.html?subject=${subject}&difficulty=${difficulty}`;
};

function initializePage() {
  loadTheme();
  initSounds();
  initGlobalClickSound();
  setupSoundToggles();
  renderHeader();
  prepareQuestions();
  renderQuestion();
  tryStartMusic();

  document.body.addEventListener("click", () => {
    tryStartMusic();
  }, { once: true });
}

initializePage();
