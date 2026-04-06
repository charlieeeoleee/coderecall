import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  initSounds,
  initGlobalClickSound,
  tryStartMusic,
  restartThemeMusic,
  playSound
} from "./sound.js";
import { electricalPosttestQuestions } from "./electrical-posttest-data.js";

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

/* =========================
   AUTH / SESSION
========================= */
let currentUser = null;
let currentIsGuest = false;

/* =========================
   PARAMS
========================= */
const params = new URLSearchParams(window.location.search);
const subject = params.get("subject") || "electrical";
const level = params.get("level") || "easy";
const type = params.get("type") || "pretest";

/* =========================
   XP BREAKDOWN
========================= */
const XP_RULES = {
  pretest: 20,
  posttest: 50,
  quizLevel: 6
};

/* =========================
   QUIZ META
========================= */
const quizMeta = {
  electrical: {
    pretest: {
      tag: "ELECTRICAL PRE-TEST",
      title: "Electrical Wiring and Electronics Circuit Components",
      subtitle: "Answer all 30 items carefully."
    },
    quiz1: {
      tag: "ELECTRICAL QUIZ",
      title: "Electrical Wiring and Electronics Circuit Components",
      subtitle: "Answer all items carefully."
    },
    posttest: {
      tag: "ELECTRICAL POST-TEST",
      title: "Electrical Wiring and Electronics Circuit Components",
      subtitle: "Answer all 30 items carefully."
    }
  },
  hardware: {
    pretest: {
      tag: "HARDWARE PRE-TEST",
      title: "Computer Hardware",
      subtitle: "Answer all 30 items carefully."
    },
    quiz1: {
      tag: "HARDWARE QUIZ",
      title: "Computer Hardware",
      subtitle: "Answer all items carefully."
    },
    posttest: {
      tag: "HARDWARE POST-TEST",
      title: "Computer Hardware",
      subtitle: "Answer all 30 items carefully."
    }
  }
};

const currentMeta =
  quizMeta[subject]?.[type] || {
    tag: "QUIZ",
    title: "Quiz",
    subtitle: "Answer all items carefully."
  };

document.getElementById("quizTag").textContent = currentMeta.tag;
document.getElementById("quizTitle").textContent = currentMeta.title;
document.getElementById("quizSubtitle").textContent = currentMeta.subtitle;

/* =========================
   ELECTRICAL PRE-TEST DATA
========================= */
const electricalPretestQuestions = [
  {
    question: "What is the basic unit of electric current?",
    choices: ["Volt", "Ohm", "Ampere", "Watt"],
    answer: "Ampere",
    rationale: "Electric current is measured in ampere, which describes the rate of flow of electric charge through a conductor."
  },
  {
    question: "Which component opposes the flow of electric current?",
    choices: ["Capacitor", "Resistor", "Inductor", "Diode"],
    answer: "Resistor",
    rationale: "A resistor limits or opposes current flow in a circuit and helps control electrical behavior."
  },
  {
    question: "What does Ohm's Law state?",
    choices: [
      "Power is equal to voltage times current (P=VI).",
      "Voltage is equal to current times resistance (V=IR).",
      "Current is equal to voltage divided by resistance (I=V/R).",
      "Both b and c are correct."
    ],
    answer: "Both b and c are correct.",
    rationale: "Ohm's Law can be expressed in equivalent forms, including V = IR and I = V / R, depending on what quantity is being solved."
  },
  {
    question: "A device that stores electrical energy in an electric field is called a:",
    choices: ["Resistor", "Transistor", "Capacitor", "Battery"],
    answer: "Capacitor",
    rationale: "A capacitor stores energy in an electric field between conductive plates and can release that energy when needed."
  },
  {
    question: "What is the primary function of a diode?",
    choices: [
      "To amplify signals",
      "To store energy",
      "To allow current to flow in only one direction",
      "To convert AC to DC"
    ],
    answer: "To allow current to flow in only one direction",
    rationale: "A diode mainly permits current to pass in one direction while blocking it in the opposite direction."
  },
  {
    question: "Which of the following is a semiconductor material commonly used in electronics?",
    choices: ["Copper", "Gold", "Silicon", "Aluminum"],
    answer: "Silicon",
    rationale: "Silicon is widely used in electronics because its conductivity can be controlled, making it ideal for semiconductor devices."
  },
  {
    question: "What is the unit of electrical resistance?",
    choices: ["Ampere", "Volt", "Farad", "Ohm"],
    answer: "Ohm",
    rationale: "Electrical resistance is measured in ohms, which indicate how much a material resists current flow."
  },
  {
    question: "What does AC stand for in electronics?",
    choices: [
      "Alternating Current",
      "Amplified Current",
      "Advanced Circuit",
      "Automatic Control"
    ],
    answer: "Alternating Current",
    rationale: "AC means alternating current, where the direction of current flow changes periodically."
  },
  {
    question: "A device that can switch or amplify electronic signals is a:",
    choices: ["Transistor", "Resistor", "Capacitor", "Inductor"],
    answer: "Transistor",
    rationale: "A transistor is used for switching and amplification in many electronic circuits."
  },
  {
    question: "What is the unit of electrical power?",
    choices: ["Volt", "Ampere", "Watt", "Joule"],
    answer: "Watt",
    rationale: "Electrical power is measured in watts, which describe the rate at which electrical energy is used or transferred."
  },
  {
    question: "What are the three main parts of an atom?",
    choices: [
      "Protons, Electrons, and Ions",
      "Protons, Neutrons, and Electrons",
      "Neutrons, Nucleus, and Quarks",
      "Electrons, Photons, and Protons"
    ],
    answer: "Protons, Neutrons, and Electrons",
    rationale: "Atoms are mainly made of protons and neutrons in the nucleus, with electrons surrounding the nucleus."
  },
  {
    question: "Which material is considered an excellent conductor commonly used in electrical wiring?",
    choices: ["Rubber", "Glass", "Plastic", "Copper"],
    answer: "Copper",
    rationale: "Copper is an excellent conductor and is commonly used in wiring because it allows current to flow efficiently."
  },
  {
    question: "What is the unit of measurement for electrical resistance?",
    choices: ["Volt (V)", "Ampere (A)", "Ohm (Ω)", "Watt (W)"],
    answer: "Ohm (Ω)",
    rationale: "Resistance is measured in ohms, represented by the symbol Ω."
  },
  {
    question: "In Ohm's Law, what is the formula to find Voltage (V)?",
    choices: ["V = I × R", "V = R / I", "V = I / R", "V = P / I"],
    answer: "V = I × R",
    rationale: "Ohm's Law states that voltage is equal to current multiplied by resistance."
  },
  {
    question: "Which type of current flows in only one direction and is typically found in batteries?",
    choices: [
      "Alternating Current (AC)",
      "Static Current",
      "Direct Current (DC)",
      "Magnetic Current"
    ],
    answer: "Direct Current (DC)",
    rationale: "Direct current flows in one direction only and is commonly supplied by batteries."
  },
  {
    question: "What PPE item is made of thick rubber to provide a barrier against electric current?",
    choices: ["Safety goggles", "Insulated gloves", "Hard hat", "FR clothing"],
    answer: "Insulated gloves",
    rationale: "Insulated gloves help protect the user from electric shock by reducing contact with current."
  },
  {
    question: "What is the primary purpose of a Lockout/Tagout (LOTO) system?",
    choices: [
      "To measure voltage in a circuit",
      "To ensure electrical circuits stay OFF during maintenance",
      "To organize tools in a workshop",
      "To increase the speed of electrical flow"
    ],
    answer: "To ensure electrical circuits stay OFF during maintenance",
    rationale: "LOTO procedures are used to keep equipment de-energized and safe while maintenance or servicing is being done."
  },
  {
    question: "According to the 'One-Hand Rule,' where should your other hand be when working with live circuits?",
    choices: [
      "On the metal frame of machine",
      "Holding a secondary tool",
      "Behind your back or in your pocket",
      "Resting on the workbench"
    ],
    answer: "Behind your back or in your pocket",
    rationale: "The one-hand rule reduces the chance of current passing across the chest by keeping the other hand away from conductive contact."
  },
  {
    question: "What is the main difference between a wire and a cable?",
    choices: [
      "A wire is a single conductor; a cable is two or more wires in a sheath",
      "Wires are for AC, and cables are for DC",
      "Wires are made of plastic; cables are made of metal",
      "There is no difference between them"
    ],
    answer: "A wire is a single conductor; a cable is two or more wires in a sheath",
    rationale: "A wire typically refers to a single conductor, while a cable usually contains multiple conductors grouped together in protective sheathing."
  },
  {
    question: "Which AWG wire size is thicker and can carry more current?",
    choices: ["14 AWG", "24 AWG", "20 AWG", "10 AWG"],
    answer: "10 AWG",
    rationale: "In AWG sizing, a smaller number means a thicker wire, and thicker wires can generally carry more current."
  },
  {
    question: "What type of cable is specifically rated for underground use and resists moisture?",
    choices: ["Romex (NM)", "THHN", "UF (Underground Feeder)", "Coaxial"],
    answer: "UF (Underground Feeder)",
    rationale: "UF cable is designed for underground installation and has added protection against moisture exposure."
  },
  {
    question: "In which type of connection does the same current flow through every component?",
    choices: [
      "Parallel Connection",
      "Series Connection",
      "Splice Connection",
      "Ground Connection"
    ],
    answer: "Series Connection",
    rationale: "In a series circuit, the same current passes through each component because there is only one path for flow."
  },
  {
    question: "Which manual wire joint is used for strong, soldered joints in telecommunications?",
    choices: ["Western Union Splice", "Pigtail Splice", "T-Tap Splice", "Butt Splice"],
    answer: "Western Union Splice",
    rationale: "The Western Union splice is known for making a secure, strong connection, especially when soldered."
  },
  {
    question: "Electronic components that do not require an external power source to operate are called:",
    choices: [
      "Active components",
      "Digital components",
      "Passive components",
      "Integrated circuits"
    ],
    answer: "Passive components",
    rationale: "Passive components do not provide gain or require an external supply to perform their basic function."
  },
  {
    question: "What is the primary function of a resistor?",
    choices: [
      "To store electrical energy",
      "To limit or divide current",
      "To amplify signals",
      "To generate magnetic fields"
    ],
    answer: "To limit or divide current",
    rationale: "A resistor controls current flow and can also create voltage drops in a circuit."
  },
  {
    question: "Using the resistor color code, what is the value of a resistor with Red, Violet, and Brown bands?",
    choices: ["27 ohms", "270 ohms", "2,700 ohms", "2.7 ohms"],
    answer: "270 ohms",
    rationale: "The first two bands give the digits and the third band is the multiplier, resulting in 270 ohms."
  },
  {
    question: "Which component is designed to store and release electrical energy using conductive plates?",
    choices: ["Inductor", "Transistor", "Capacitor", "Diode"],
    answer: "Capacitor",
    rationale: "A capacitor stores electrical energy between conductive plates separated by a dielectric material."
  },
  {
    question: "What is the standard unit for capacitance?",
    choices: ["Henry (H)", "Farad (F)", "Ohm (Ω)", "Ampere (A)"],
    answer: "Farad (F)",
    rationale: "Capacitance is measured in farads, which indicate how much charge a capacitor can store per unit voltage."
  },
  {
    question: "Which tool is used to measure multiple electrical quantities like voltage, current, and resistance?",
    choices: ["Multimeter", "Voltmeter", "Ammeter", "Wattmeter"],
    answer: "Multimeter",
    rationale: "A multimeter combines several measurement functions and can test voltage, current, and resistance."
  },
  {
    question: "What does the 'Gold' band represent in the resistor color code system?",
    choices: ["10% Tolerance", "1% Tolerance", "20% Tolerance", "5% Tolerance"],
    answer: "5% Tolerance",
    rationale: "In resistor color coding, a gold tolerance band indicates that the resistor's actual value may vary by 5% from its stated value."
  }
];

const questionBanks = {
  electrical: {
    pretest: electricalPretestQuestions,
    posttest: electricalPosttestQuestions
  }
};

/* =========================
   QUIZ STATE
========================= */
let quizQuestions = [];
let currentIndex = 0;
let score = 0;
let selectedChoice = null;
let pendingContinue = null;
let xpAwardedThisAttempt = false;

/* =========================
   HELPERS
========================= */
function shuffleArray(array) {
  const cloned = [...array];

  for (let i = cloned.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
  }

  return cloned;
}

function getQuizStorageKey() {
  return `${subject}_${type}_attempt_done`;
}

function getProgressFlags() {
  return {
    pretestKey: `${subject}_pretest`,
    modulesKey: `${subject}_modules`,
    quizKey: `${subject}_quiz`,
    posttestKey: `${subject}_posttest`
  };
}

function getResultDocKey() {
  return `${subject}_${type}`;
}

function getQuizXPReward() {
  if (type === "pretest") return XP_RULES.pretest;
  if (type === "posttest") return XP_RULES.posttest;
  return XP_RULES.quizLevel;
}

function prepareQuestions() {
  const source = questionBanks[subject]?.[type] || [];

  if (!source.length) {
    quizQuestions = [];
    return;
  }

  const selected = shuffleArray(source).slice(0, 30);

  quizQuestions = selected.map((q) => ({
    ...q,
    choices: shuffleArray([...q.choices])
  }));
}

function updateProgress() {
  const total = quizQuestions.length;
  const percent = Math.floor((currentIndex / total) * 100);

  document.getElementById("quizCounter").textContent = `Question ${currentIndex + 1} of ${total}`;
  document.getElementById("quizScore").textContent = `Score: ${score}`;
  document.getElementById("quizProgressFill").style.width = `${percent}%`;
  document.getElementById("quizProgressText").textContent = `${percent}% Completed`;
}

function renderQuestion() {
  selectedChoice = null;
  const nextBtn = document.getElementById("nextBtn");
  nextBtn.disabled = true;

  const currentQuestion = quizQuestions[currentIndex];

  if (!currentQuestion) {
    document.getElementById("quizCounter").textContent = "Quiz unavailable";
    document.getElementById("quizScore").textContent = "Score: --";
    document.getElementById("quizProgressFill").style.width = "0%";
    document.getElementById("quizProgressText").textContent = "Content unavailable";
    document.getElementById("questionText").textContent =
      "This quiz content is not available yet for the selected subject and test type.";
    document.getElementById("choicesContainer").innerHTML = "";
    nextBtn.textContent = "Unavailable";
    return;
  }

  updateProgress();
  document.getElementById("questionText").textContent = currentQuestion.question;

  const choicesContainer = document.getElementById("choicesContainer");
  choicesContainer.innerHTML = "";

  currentQuestion.choices.forEach((choice) => {
    const btn = document.createElement("button");
    btn.className = "choice-btn";
    btn.textContent = choice;

    btn.addEventListener("click", () => {
      document.querySelectorAll(".choice-btn").forEach((item) => {
        item.classList.remove("selected");
      });

      btn.classList.add("selected");
      selectedChoice = choice;
      nextBtn.disabled = false;
    });

    choicesContainer.appendChild(btn);
  });

  nextBtn.textContent = currentIndex === quizQuestions.length - 1 ? "Submit" : "Next";
}

function showRationale(message) {
  document.getElementById("rationaleText").textContent = message;
  document.getElementById("rationaleModal").classList.add("active");
}

function buildFallbackQuizRationale(question) {
  const prompt = String(question?.question || "").toLowerCase();

  const rationaleLibrary = [
    {
      patterns: ["current", "resistance", "24v", "12ω", "100w", "power in a circuit", "what is the resistance"],
      text: "Review the core electrical relationships that connect voltage, current, resistance, and power before choosing the best match."
    },
    {
      patterns: ["parallel", "series", "closed circuit", "one bulb burns out"],
      text: "Focus on how current paths behave in series and parallel circuits, and what happens when one part of the path opens."
    },
    {
      patterns: ["circuit breaker", "fuse"],
      text: "Think about how protective devices respond to faults and whether they are meant to be replaced or reset."
    },
    {
      patterns: ["magnetic field", "inductor", "capacitor", "diode"],
      text: "This item compares the basic job of common components, especially which ones store energy and how they affect current flow."
    },
    {
      patterns: ["neutral wire", "home electricity supply", "awg", "wire insulation", "conduit", "pigtail splice"],
      text: "Review practical wiring concepts by matching each material, method, or conductor role to its common use in installation work."
    },
    {
      patterns: ["electrons", "static electricity", "watts"],
      text: "Return to the basic electrical definitions, including what moves, what gets measured, and what each unit represents."
    },
    {
      patterns: ["arc flash", "ppe", "test for voltage"],
      text: "This is testing electrical safety practice, so focus on hazard prevention and the correct sequence before touching equipment."
    },
    {
      patterns: ["yellow, violet, and orange", "red", "resistor color code", "potentiometer", "polarized capacitors"],
      text: "Review component identification and handling by connecting the physical feature, code, or polarity rule to its proper application."
    }
  ];

  const matched = rationaleLibrary.find((entry) =>
    entry.patterns.some((pattern) => prompt.includes(pattern))
  );

  return matched?.text || "Review the concept being tested here and match the component, formula, or wiring rule to its actual function.";
}

window.closeRationaleAndContinue = function () {
  document.getElementById("rationaleModal").classList.remove("active");
  if (typeof pendingContinue === "function") {
    pendingContinue();
    pendingContinue = null;
  }
};

function showResult() {
  const total = quizQuestions.length;
  const percent = Math.round((score / total) * 100);

  document.getElementById("resultScore").textContent = `${score}/${total}`;
  document.getElementById("resultPercent").textContent = `${percent}%`;
  document.getElementById("resultMessage").textContent = `You scored ${score} out of ${total}.`;
  document.getElementById("resultModal").classList.add("active");
}

/* =========================
   FIREBASE / SAVE HELPERS
========================= */
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
    console.log("Firebase XP updated:", newXP);
    return;
  }
  const guestXP = parseInt(localStorage.getItem("guest_xp") || "0", 10);
  const guestWeeklyXP = parseInt(localStorage.getItem("guest_xpWeekly") || "0", 10);
  const newXP = guestXP + amount;
  const newWeeklyXP = guestWeeklyXP + amount;
  localStorage.setItem("guest_xp", String(newXP));
  localStorage.setItem("guest_xpWeekly", String(newWeeklyXP));
  console.log("Guest XP updated:", newXP);
}

async function saveQuizResultToStorageAndFirestore() {
  const total = quizQuestions.length;
  const percent = Math.round((score / total) * 100);
  const resultKey = getResultDocKey();
  const flags = getProgressFlags();

  const resultPayload = {
    subject,
    type,
    level,
    score,
    total,
    percent,
    completedAt: new Date().toISOString()
  };

  if (type === "pretest") {
    localStorage.setItem(flags.pretestKey, "true");
  } else if (type === "posttest") {
    localStorage.setItem(flags.posttestKey, "true");
  } else {
    localStorage.setItem(flags.quizKey, "true");
  }

  localStorage.setItem(getQuizStorageKey(), "true");
  localStorage.setItem(`${resultKey}_score`, String(score));
  localStorage.setItem(`${resultKey}_percent`, String(percent));
  localStorage.setItem(`${resultKey}_done`, "true");

  if (!currentUser) return;

  const userRef = await ensureUserDoc(currentUser.uid);
  const snap = await getDoc(userRef);
  const data = snap.data() || {};
  const progress = data.progress || {};
  const results = data.results || {};

  if (type === "pretest") {
    progress[flags.pretestKey] = true;
  } else if (type === "posttest") {
    progress[flags.posttestKey] = true;
  } else {
    progress[flags.quizKey] = true;
  }

  results[resultKey] = resultPayload;

  await updateDoc(userRef, {
    progress,
    results
  });
}

async function awardQuizXPOnce() {
  if (xpAwardedThisAttempt) {
    console.log("XP already awarded in current session.");
    return;
  }

  const attemptDone = localStorage.getItem(getQuizStorageKey()) === "true";
  const reward = getQuizXPReward();

  if (attemptDone) {
    console.log("Attempt already completed before. Skipping XP.");
    xpAwardedThisAttempt = true;
    return;
  }

  await addXP(reward);
  console.log("Awarded XP:", reward);

  xpAwardedThisAttempt = true;
}

/* =========================
   QUIZ FLOW
========================= */
window.finishQuizFlow = async function () {
  document.getElementById("resultModal").classList.remove("active");
  window.location.href = `subject.html?subject=${subject}`;
};

window.goBackToSubject = function () {
  window.location.href = `subject.html?subject=${subject}`;
};

window.handleNext = function () {
  if (!selectedChoice) return;

  const currentQuestion = quizQuestions[currentIndex];
  const isCorrect = selectedChoice === currentQuestion.answer;

  if (isCorrect) {
    score++;
    playSound("correct");
    continueToNext();
  } else {
    playSound("wrong");
    pendingContinue = continueToNext;
    showRationale(currentQuestion.rationale || buildFallbackQuizRationale(currentQuestion));
  }
};

async function finishAttempt() {
  document.getElementById("quizProgressFill").style.width = "100%";
  document.getElementById("quizProgressText").textContent = "100% Completed";

  await awardQuizXPOnce();
  await saveQuizResultToStorageAndFirestore();

  showResult();
}

function continueToNext() {
  currentIndex++;

  if (currentIndex < quizQuestions.length) {
    renderQuestion();
  } else {
    finishAttempt().catch((error) => {
      console.error("Error finishing quiz attempt:", error);
      showResult();
    });
  }
}

function getWeekKey() {
  const now = new Date();
  const year = now.getFullYear();
  const firstDay = new Date(year, 0, 1);
  const pastDays = Math.floor((now - firstDay) / 86400000);
  const week = Math.ceil((pastDays + firstDay.getDay() + 1) / 7);
  return `${year}-W${week}`;
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
   AUTH INIT
========================= */
onAuthStateChanged(auth, (user) => {
  const isGuest = localStorage.getItem("guest") === "true";

  if (user) {
    currentUser = user;
    currentIsGuest = false;
  } else if (isGuest) {
    currentUser = null;
    currentIsGuest = true;
  } else {
    currentUser = null;
    currentIsGuest = false;
  }
});

/* =========================
   INIT
========================= */
loadTheme();
prepareQuestions();
renderQuestion();

initSounds();
initGlobalClickSound();
tryStartMusic();

document.body.addEventListener("click", () => {
  tryStartMusic();
}, { once: true });

