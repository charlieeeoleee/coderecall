import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { 
  initSounds,
  initGlobalClickSound,
  tryStartMusic,
  restartThemeMusic, 
  playSound 
} from "./sound.js";

import { quizData } from "../data/quiz-data.js";
import { electricalExtraQuizData } from "../data/quiz-data-electrical-extra.js";
import { hardwareQuizData } from "../data/quiz-data-hardware-extra.js";

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
const difficulty = params.get("difficulty") || "easy";
const quizLevel = parseInt(params.get("quizLevel") || "1", 10);

const XP_PER_LEVEL = 6;

let currentUser = null;
let questions = [];
let currentIndex = 0;
let selectedChoice = null;
let score = 0;
let xpAwarded = false;

const HARDWARE_DOC_IMAGE_BASE = "assets/quizzes/hardware/docx";

const QUIZ_LEVEL_COUNTS = {
  electrical: { easy: 25, medium: 25, hard: 25 },
  hardware: { easy: 23, medium: 7, hard: 25 }
};

const HARDWARE_QUIZ_OVERRIDES = {
  easy: {
    "1.3": { image: `${HARDWARE_DOC_IMAGE_BASE}/image10.png` },
    "6.3": { image: `${HARDWARE_DOC_IMAGE_BASE}/image5.png` },
    "7.3": { image: `${HARDWARE_DOC_IMAGE_BASE}/image17.png` },
    "8.3": { image: `${HARDWARE_DOC_IMAGE_BASE}/image25.png` },
    "9.2": { image: `${HARDWARE_DOC_IMAGE_BASE}/image13.png` },
    "10.2": { image: `${HARDWARE_DOC_IMAGE_BASE}/image19.png` },
    "12.1": {
      question: "It is used to turn any physical document into a digital one.",
      choices: ["Plotter", "Printer", "Photo Printer", "Scanner"],
      answer: "Scanner"
    },
    "12.2": {
      question: "It is used to turn any physical document into a digital one.",
      choices: ["Word File", "Printer", "Microsoft", "Scanner"],
      answer: "Scanner"
    },
    "12.3": {
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
    "13.1": {
      question: "Which of the following is used to capture pictures or record videos on a computer?",
      choices: ["Microphone", "DSLR Camera", "Webcam", "Instax Camera"],
      answer: "Webcam"
    },
    "13.2": {
      question: "This input device is used to capture sounds, audio, or voices which are commonly used on meetings or audio recording.",
      choices: ["Microphone", "Headset", "Speaker", "Microphone Cable"],
      answer: "Microphone"
    },
    "13.3": {
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
    "16.3": {
      question: "What is the main function of anti-static gloves?",
      choices: [
        "To protect components from electrostatic discharge while handling them",
        "To tighten screws more firmly",
        "To improve internet speed during repair",
        "To cool the processor during disassembly"
      ],
      answer: "To protect components from electrostatic discharge while handling them"
    },
    "17.3": {
      question: "Which of the following is an anti-static wrist strap?",
      choices: ["Option A", "Option B", "Option C", "Option D"],
      choiceImages: [
        `${HARDWARE_DOC_IMAGE_BASE}/image11.png`,
        `${HARDWARE_DOC_IMAGE_BASE}/image24.png`,
        `${HARDWARE_DOC_IMAGE_BASE}/image18.png`,
        `${HARDWARE_DOC_IMAGE_BASE}/image1.png`
      ],
      answer: "Option A"
    },
    "18.3": { image: `${HARDWARE_DOC_IMAGE_BASE}/image26.png` },
    "19.3": {
      question: "What is the main function of an anti-static mat?",
      choices: [
        "To decorate the workstation",
        "To prevent electrostatic discharge while placing components on the table",
        "To replace the need for a screwdriver",
        "To increase airflow inside the system unit"
      ],
      answer: "To prevent electrostatic discharge while placing components on the table"
    },
    "20.3": { image: `${HARDWARE_DOC_IMAGE_BASE}/image16.png` },
    "21.2": {
      question: "Which of the following should you do when using any equipment or tools?",
      choices: [
        "Read and follow the proper instructions before use",
        "Use it anyway even if it is damaged",
        "Repair it or buy a new one without reporting the damage",
        "Use something else that is not suitable to the task"
      ],
      answer: "Read and follow the proper instructions before use"
    },
    "21.3": { image: `${HARDWARE_DOC_IMAGE_BASE}/image8.png` },
    "24.1": {
      choices: [
        "Using your computer",
        "Eating",
        "Organizing your things",
        "Taking notes"
      ],
      answer: "Eating"
    },
    "24.3": { image: `${HARDWARE_DOC_IMAGE_BASE}/image21.png` },
    "25.3": { image: `${HARDWARE_DOC_IMAGE_BASE}/image6.png` }
  },
  medium: {
    "2.3": {
      image: `${HARDWARE_DOC_IMAGE_BASE}/image15.png`,
      choices: ["Hard Disk Drive (HDD)", "Floppy Disk", "Solid State Drive", "SATA"],
      answer: "Hard Disk Drive (HDD)"
    },
    "3.3": {
      question: "The term UEFI means:",
      choices: [
        "Unified extension firmware interface",
        "Unity extension firmware internet",
        "Unified extensible firmware interface",
        "Unity extensive frostwire interconnect"
      ],
      answer: "Unified extensible firmware interface"
    },
    "4.1": {
      choices: ["PCIe", "Integrated Drive Electronics", "Network Interface Card (NIC)", "HDMI"],
      answer: "Network Interface Card (NIC)"
    },
    "7.2": {
      choices: [
        "The chipset executes software instructions and calculations, while the CPU manages the power distribution to the motherboard.",
        "The CPU acts as the brain that processes data and executes instructions, while the chipset acts as the traffic controller managing data flow between the CPU and other components.",
        "The CPU is responsible for long-term storage of files, while the chipset provides the temporary memory (RAM) for active applications.",
        "The chipset is a software driver that allows the operating system to run, while the CPU is the physical hardware component that plugs into the socket."
      ],
      answer: "The CPU acts as the brain that processes data and executes instructions, while the chipset acts as the traffic controller managing data flow between the CPU and other components."
    }
  },
  hard: {
    "15.2": {
      choices: [
        "Both ends use the T568B wiring standard.",
        "One end uses T568A and the other end uses T568B.",
        "Both ends use T568A.",
        "The cable crosses the power wires only."
      ],
      answer: "One end uses T568A and the other end uses T568B."
    },
    "21.3": { image: `${HARDWARE_DOC_IMAGE_BASE}/image4.png` },
    "25.3": { image: `${HARDWARE_DOC_IMAGE_BASE}/image22.png` }
  }
};

function normalizeAnswer(question) {
  const choices = Array.isArray(question.choices) ? question.choices.filter(Boolean) : [];
  let answer = question.answer;

  if (typeof answer === "string" && /^[A-D]$/i.test(answer.trim()) && choices.length >= 4) {
    answer = choices[answer.trim().toUpperCase().charCodeAt(0) - 65];
  }

  return {
    ...question,
    choices,
    answer
  };
}

function normalizeHardwareDifficulty(rawQuestions, difficultyName) {
  const overrides = HARDWARE_QUIZ_OVERRIDES[difficultyName] || {};
  const deduped = rawQuestions.reduce((map, item) => {
    const key = `${item.level}.${item.sub}`;
    const existing = map.get(key);
    const itemChoiceCount = Array.isArray(item.choices) ? item.choices.filter(Boolean).length : 0;
    const existingChoiceCount = existing && Array.isArray(existing.choices)
      ? existing.choices.filter(Boolean).length
      : -1;

    if (!existing || itemChoiceCount > existingChoiceCount) {
      map.set(key, item);
    }

    return map;
  }, new Map());

  const levelOrder = [...new Set([...deduped.values()].map((item) => item.level))];
  const levelMap = {};
  levelOrder.forEach((originalLevel, index) => {
    levelMap[originalLevel] = index + 1;
  });

  const normalized = {};

  [...deduped.values()]
    .sort((a, b) => a.level - b.level || a.sub - b.sub)
    .forEach((item) => {
      const originalKey = `${item.level}.${item.sub}`;
      const override = overrides[originalKey] || {};
      const targetLevel = levelMap[item.level];
      const baseQuestion = normalizeAnswer({
        ...item,
        ...override,
        choices: override.choices || item.choices
      });

      if (!normalized[targetLevel]) normalized[targetLevel] = [];
      normalized[targetLevel].push({
        question: override.question || item.question,
        choices: baseQuestion.choices,
        answer: baseQuestion.answer,
        rationale: override.rationale,
        image: override.image,
        choiceImages: override.choiceImages
      });
    });

  return normalized;
}

const mergedQuizData = {
  ...quizData,
  electrical: {
    ...(quizData.electrical || {}),
    ...(electricalExtraQuizData.electrical || {})
  },
  hardware: {
    easy: normalizeHardwareDifficulty(hardwareQuizData.hardware.easy || [], "easy"),
    medium: normalizeHardwareDifficulty(hardwareQuizData.hardware.medium || [], "medium"),
    hard: normalizeHardwareDifficulty(hardwareQuizData.hardware.hard || [], "hard")
  }
};

function getLevelDoneKey() {
  return `${subject}_${difficulty}_quiz_level_${quizLevel}_done`;
}

function getLegacyLevelDoneKey() {
  return `${subject}_quiz_level_${quizLevel}_done`;
}

function getOverallQuizKey() {
  return `${subject}_${difficulty}_quiz`;
}

function getLegacyOverallQuizKey() {
  return `${subject}_quiz`;
}

function getResultKey() {
  return `${subject}_${difficulty}_quiz_level_${quizLevel}_result`;
}

function getLegacyResultKey() {
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
  window.location.href = `quiz-levels.html?subject=${subject}&difficulty=${difficulty}`;
};

window.finishLevelFlow = function () {
  document.getElementById("resultModal").classList.remove("active");
  window.location.href = `quiz-levels.html?subject=${subject}&difficulty=${difficulty}`;
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
  const levelData = mergedQuizData?.[subject]?.[difficulty]?.[quizLevel];

  if (!levelData) {
    console.warn("No quiz data found, using fallback");

    questions = shuffleArray([...getPlaceholderQuestions(subject, quizLevel)]).map((item) => normalizeAnswer({
      ...item,
      choices: [...item.choices]
    }));

    console.log("Prepared fallback questions:", questions);
    return;
  }

  questions = shuffleArray([...levelData]).map((item) => normalizeAnswer({
    ...item,
    choices: [...item.choices]
  }));

  console.log("Prepared real questions:", questions);
}

function renderHeader() {
  document.getElementById("levelTag").textContent = `${subject.toUpperCase()} ${difficulty.toUpperCase()} QUIZ`;
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
  let media = document.getElementById("questionMedia");
  if (!media) {
    media = document.createElement("div");
    media.id = "questionMedia";
    media.className = "level-question-media";
    document.querySelector(".level-question-block").appendChild(media);
  }

  media.innerHTML = currentQuestion.image
    ? `<img src="${currentQuestion.image}" alt="Question visual" class="level-question-image">`
    : "";

  const container = document.getElementById("choicesContainer");
  container.innerHTML = "";

  currentQuestion.choices.forEach((choice, index) => {
    const btn = document.createElement("button");
    btn.className = "choice-btn";
    if (currentQuestion.choiceImages?.[index]) {
      btn.innerHTML = `
        <span class="choice-media-wrap">
          <img src="${currentQuestion.choiceImages[index]}" alt="Choice ${index + 1}" class="choice-media-image">
        </span>
        <span class="choice-media-label">${choice}</span>
      `;
    } else {
      btn.textContent = choice;
    }

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

async function addXP(amount) {
  if (!amount || amount <= 0) return;

  if (currentUser) {
    const userRef = await ensureUserDoc(currentUser.uid);
    const snap = await getDoc(userRef);
    const data = snap.data() || {};
    const currentWeek = getWeekKey();
    const lastWeeklyReset = data.lastWeeklyReset || currentWeek;
    const currentXP = Number(data.xp || 0);
    const currentWeeklyXP =
      lastWeeklyReset === currentWeek ? Number(data.xpWeekly || 0) : 0;
    const newXP = currentXP + amount;
    const newWeeklyXP = currentWeeklyXP + amount;

    await updateDoc(userRef, {
      xp: newXP,
      xpWeekly: newWeeklyXP,
      xpChange: amount,
      lastWeeklyReset: currentWeek
    });
    return;
  }

  const guestXP = parseInt(localStorage.getItem("guest_xp") || "0", 10);
  const guestWeeklyXP = parseInt(localStorage.getItem("guest_xpWeekly") || "0", 10);
  localStorage.setItem("guest_xp", String(guestXP + amount));
  localStorage.setItem("guest_xpWeekly", String(guestWeeklyXP + amount));
}

async function saveLevelCompletion() {
  localStorage.setItem(getLevelDoneKey(), "true");
  localStorage.setItem(getResultKey(), JSON.stringify({
    subject,
    difficulty,
    quizLevel,
    score,
    total: questions.length,
    completedAt: new Date().toISOString()
  }));

  if (difficulty === "easy") {
    localStorage.setItem(getLegacyLevelDoneKey(), "true");
    localStorage.setItem(getLegacyResultKey(), JSON.stringify({
      subject,
      difficulty,
      quizLevel,
      score,
      total: questions.length,
      completedAt: new Date().toISOString()
    }));
  }

  if (!currentUser) return;

  const userRef = await ensureUserDoc(currentUser.uid);
  const snap = await getDoc(userRef);
  const data = snap.data() || {};
  const progress = data.progress || {};
  const results = data.results || {};

  progress[getLevelDoneKey()] = true;
  results[getResultKey()] = {
    subject,
    difficulty,
    quizLevel,
    score,
    total: questions.length,
    completedAt: new Date().toISOString()
  };

  if (difficulty === "easy") {
    progress[getLegacyLevelDoneKey()] = true;
    results[getLegacyResultKey()] = {
      subject,
      difficulty,
      quizLevel,
      score,
      total: questions.length,
      completedAt: new Date().toISOString()
    };
  }

  const allDone = Array.from({ length: 25 }, (_, idx) => idx + 1).every((lvl) => {
    if (lvl === quizLevel) return true;
    const levelKey = `${subject}_${difficulty}_quiz_level_${lvl}_done`;
    const legacyLevelKey = `${subject}_quiz_level_${lvl}_done`;
    return progress[levelKey] === true ||
      localStorage.getItem(levelKey) === "true" ||
      (difficulty === "easy" && (
        progress[legacyLevelKey] === true ||
        localStorage.getItem(legacyLevelKey) === "true"
      ));
  });

  if (allDone) {
    progress[getOverallQuizKey()] = true;
    localStorage.setItem(getOverallQuizKey(), "true");
    if (difficulty === "easy") {
      progress[getLegacyOverallQuizKey()] = true;
      localStorage.setItem(getLegacyOverallQuizKey(), "true");
    }
  }

  await updateDoc(userRef, { progress, results });
}

async function awardLevelXPOnce() {
  if (xpAwarded) return 0;

  const alreadyDone =
    localStorage.getItem(getLevelDoneKey()) === "true" ||
    (difficulty === "easy" && localStorage.getItem(getLegacyLevelDoneKey()) === "true");
  if (alreadyDone) {
    xpAwarded = true;
    return 0;
  }

  const earnedXP = score * 2;
  await addXP(earnedXP);
  xpAwarded = true;

  return earnedXP;
}

async function finishLevel() {
  document.getElementById("levelProgressFill").style.width = "100%";
  document.getElementById("levelProgressText").textContent = "100% Completed";

  const earnedXP = await awardLevelXPOnce();
  await saveLevelCompletion();

  document.getElementById("resultMessage").textContent =
    `You completed Level ${quizLevel} with a score of ${score}/${questions.length} and earned ${earnedXP} XP.`;

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

  // 👇 IMPORTANT
  showRationale(isCorrect, currentQuestion, selectedChoice);
};

onAuthStateChanged(auth, (user) => {
  currentUser = user || null;
});

loadTheme();
renderHeader();
prepareQuestions();
renderQuestion();

initSounds();
initGlobalClickSound();
tryStartMusic();

document.body.addEventListener("click", () => {
  tryStartMusic();
}, { once: true });

window.QUIZ_LEVEL_COUNTS = QUIZ_LEVEL_COUNTS;

function buildFallbackRationale(question, selectedAnswer, isCorrect) {
  if (!question) {
    return "Review the concept related to this question.";
  }

  const prompt = String(question.question || "").toLowerCase();

  const rationaleLibrary = [
    {
      patterns: ["ohm's law", "voltage is", "resistance is", "current will", "current flowing"],
      text: "This item depends on the relationship between voltage, current, and resistance. Check which value changes directly and which one changes inversely."
    },
    {
      patterns: ["potential difference", "one volt", "voltmeter"],
      text: "Focus on electric potential difference as the electrical push between two points, along with the standard unit and the instrument used to measure it."
    },
    {
      patterns: ["movement of electrons", "symbol used to represent electric current", "charge passes"],
      text: "This concept is about current as the rate of charge flow. Keep the current symbol and the charge-time relationship in mind."
    },
    {
      patterns: ["power dissipated", "total power", "consumes 24 watts", "100 watt", "5 volt source delivers"],
      text: "Use the basic power relationships to connect voltage, current, and wattage. Decide which quantity can be solved from the values already given."
    },
    {
      patterns: ["direct current", "alternating current", "convert ac to dc", "rectifier", "smooth out the dc voltage"],
      text: "Review how DC and AC differ in direction of flow, and remember the basic parts used when AC is converted and smoothed in simple power circuits."
    },
    {
      patterns: ["power transmission", "long distances", "high voltages"],
      text: "Think about why power systems favor efficient long-distance delivery. The key idea is reducing losses while making voltage easier to manage."
    },
    {
      patterns: ["ground faults", "overloads", "short circuits", "melt when excessive current", "circuit breaker", "fuse", "gfci", "rcd", "mcb", "contactor"],
      text: "This question is about electrical protection. Match each device to the kind of fault or safety role it is designed to handle."
    },
    {
      patterns: ["line (live/hot)", "neutral", "protective earth", "equipment grounding", "iec", "nec", "wiring color"],
      text: "Focus on standard conductor identification. The safest approach is to remember which colors are assigned to live, neutral, and grounding roles."
    },
    {
      patterns: ["difference between a wire and a cable", "outer jacket", "stranded cable"],
      text: "Separate the ideas of conductor count, protective sheathing, and flexibility. Construction details usually explain the correct use."
    },
    {
      patterns: ["uf", "thhn", "thwn", "xhhw", "machine tool wire", "mtw", "coaxial", "twisted pair", "fiber optic"],
      text: "These items test where a wire or cable type is actually used. Match the environment or job requirement with the wire's intended properties."
    },
    {
      patterns: ["awg", "gauge", "diameter", "voltage drop", "insulating jacket", "wire insulation"],
      text: "Keep the physical meaning of wire gauge in mind, along with why insulation and conductor size matter for safety, heating, and voltage drop."
    },
    {
      patterns: ["series dc circuit", "parallel dc circuit", "parallel wiring"],
      text: "Think about how current, resistance, and independence of loads behave in series versus parallel arrangements."
    },
    {
      patterns: ["switch type", "spst", "dpdt", "push-button", "tactile", "toggle"],
      text: "This item is about switch function. Compare whether the switch controls one circuit or more, and whether it latches or only acts while pressed."
    },
    {
      patterns: ["color bands", "four-band resistor", "five-band resistor", "tolerance", "47k", "1 k", "3.3 k"],
      text: "Use resistor color-code reading in order: significant digits, multiplier, then tolerance. Precision bands make the reading method slightly different."
    },
    {
      patterns: ["zener diode", "rectifier diode", "led", "emit light"],
      text: "Different diode types are grouped by purpose. Think about whether the component is used for regulation, rectification, or light emission."
    },
    {
      patterns: ["555 timer", "lm324", "voltage regulator", "integrated circuit"],
      text: "This checks the common job of each IC family. Match timing, amplification, or voltage regulation with the device description."
    },
    {
      patterns: ["banana plug", "screw terminal", "rca", "jst connector"],
      text: "Focus on how each connector is physically used. Some are meant for quick test connections, while others are better for permanent or signal-specific use."
    },
    {
      patterns: ["splice", "western union", "t-tap", "butt splice", "pigtail"],
      text: "Compare splice methods by strength, permanence, and whether the connection is meant for branching, joining ends, or bundling conductors."
    },
    {
      patterns: ["soldering", "flux", "soldering iron", "desoldering", "cold joint", "solder joint", "desoldering pump", "helping hands", "wire stripper"],
      text: "These items are about soldering workflow and inspection. Think about preparation, heating, cleanup, and the visual signs of a good or poor joint."
    },
    {
      patterns: ["wiring method", "conduit", "cable tray", "direct burial", "rigid metal conduit", "flexible metal conduit", "raceway"],
      text: "Match the installation method to the environment. Mechanical protection, routing flexibility, airflow, and underground exposure are the key clues."
    },
    {
      patterns: ["metal film resistor", "carbon film resistor", "smd resistor", "core type", "ferrite core", "air core"],
      text: "This concept compares component construction with application. Precision, frequency behavior, size, and losses usually point to the right choice."
    }
  ];

  const matched = rationaleLibrary.find((entry) =>
    entry.patterns.some((pattern) => prompt.includes(pattern))
  );

  if (matched) {
    return isCorrect
      ? `Correct. ${matched.text}`
      : `Not quite. ${matched.text}`;
  }

  if (selectedAnswer) {
    return isCorrect
      ? "Correct. Keep connecting the question to the underlying electrical principle, not just the wording."
      : "Not quite. Recheck the underlying electrical principle and compare what each choice implies in practice.";
  }

  return isCorrect
    ? "Correct. Keep connecting the question to the underlying electrical principle, not just the wording."
    : "Review the concept related to this question and compare the function, formula, or application being described.";
}

function showRationale(isCorrect, question, selectedAnswer) {
  document.getElementById("rationaleTitle").textContent =
    isCorrect ? "Correct ✅" : "Wrong ❌";

  document.getElementById("rationaleText").textContent =
    question?.rationale || buildFallbackRationale(question, selectedAnswer, isCorrect);

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

function getWeekKey() {
  const now = new Date();
  const year = now.getFullYear();
  const firstDay = new Date(year, 0, 1);
  const pastDays = Math.floor((now - firstDay) / 86400000);
  const week = Math.ceil((pastDays + firstDay.getDay() + 1) / 7);
  return `${year}-W${week}`;
}




