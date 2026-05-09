import { app } from "./firebase-config.js";
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
  playSound,
  handleSoundToggle,
  handleMusicToggle
} from "./sound.js";
import { syncPublicLeaderboardEntry } from "./leaderboard-public.js";
import { saveWrongAnswerReview, resolveWrongAnswerReview, loadWrongAnswerReview } from "./review-store.js";
import { saveRetentionReview, resolveRetentionReview, loadRetentionQueue } from "./retention-store.js";
import { saveStudyHistory } from "./study-history-store.js";
import { traceXPEvent } from "./xp-debug.js";
import { electricalPosttestQuestions } from "../data/electrical-posttest-data.js";
import { hardwarePosttestQuestions } from "../data/hardware-posttest-data.js";
import {
  hardwarePretestQuestions
} from "../data/hardware-assessment-data.js";


const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentIsGuest = localStorage.getItem("guest") === "true";
let quizQuestions = [];
let currentIndex = 0;
let score = 0;
let selectedChoice = null;
let selectedConfidence = null;
let pendingContinue = null;
let retentionGateShown = false;
let resolveAuthReady = null;
const authReadyPromise = new Promise((resolve) => {
  resolveAuthReady = resolve;
});
let authReadyResolved = false;
let cachedUserRef = null;
let cachedUserData = null;
let pendingStudyHistorySavePromise = null;
let awardedQuestionIds = new Set();
let correctQuestionIdsThisRun = new Set();
let lastEarnedXP = 0;
let wrongAnswerReviewKeys = new Set();
let recoveredMistakesThisRun = 0;
const SELECTED_SUBJECT_KEY = "selectedSubject";
const validSubjects = new Set(["hardware", "electrical"]);
const RESUME_ACTIVITY_KEY = "resume_activity";

const params = new URLSearchParams(window.location.search);
const subjectParam = (params.get("subject") || "").toLowerCase();
const savedSubject = (sessionStorage.getItem(SELECTED_SUBJECT_KEY) || "").toLowerCase();
const subject = validSubjects.has(subjectParam)
  ? subjectParam
  : validSubjects.has(savedSubject)
    ? savedSubject
    : "electrical";
const level = params.get("level") || "easy";
const type = params.get("type") || "pretest";

sessionStorage.setItem(SELECTED_SUBJECT_KEY, subject);

const XP_RULES = {
  pretest: 1,
  posttest: 4,
  quizLevel: 6
};

function getQuizResumeStateKey() {
  return `resume_quiz_state_${subject}_${type}_${level}`;
}

function getQuizBaseUrl() {
  return `quiz.html?subject=${encodeURIComponent(subject)}&type=${encodeURIComponent(type)}&level=${encodeURIComponent(level)}`;
}

function getQuizResumeUrl() {
  return `${getQuizBaseUrl()}&resume=1`;
}

function normalizeQuestionIdList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function getQuestionIdentifier(question, fallbackIndex = currentIndex) {
  if (question?.level != null && question?.sub != null) {
    return `${question.level}.${question.sub}`;
  }

  const fallbackText = String(question?.question || `question_${fallbackIndex + 1}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);

  return fallbackText || `question_${fallbackIndex + 1}`;
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

function getSubjectDisplayName() {
  return subject === "hardware" ? "Computer Hardware" : "Electrical";
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

function readQuizResumeState() {
  try {
    return JSON.parse(localStorage.getItem(getQuizResumeStateKey()) || "null");
  } catch {
    return null;
  }
}

function writeQuizResumeState(payload) {
  if (!payload) {
    localStorage.removeItem(getQuizResumeStateKey());
    return;
  }

  localStorage.setItem(getQuizResumeStateKey(), JSON.stringify(payload));
}

function mergeCachedUserData(partial = {}) {
  const nextData = {
    ...(cachedUserData || {}),
    ...partial
  };

  if (partial.progress) {
    nextData.progress = {
      ...(cachedUserData?.progress || {}),
      ...partial.progress
    };
  }

  if (partial.results) {
    nextData.results = {
      ...(cachedUserData?.results || {}),
      ...partial.results
    };
  }

  cachedUserData = nextData;
  return nextData;
}

async function getCachedUserRef(uid) {
  if (cachedUserRef && currentUser?.uid === uid) {
    return cachedUserRef;
  }

  cachedUserRef = doc(db, "users", uid);
  return cachedUserRef;
}

async function getCachedUserData(uid, { force = false } = {}) {
  if (!uid) return {};
  await ensureUserDoc(uid);

  if (!force && cachedUserData) {
    return cachedUserData;
  }

  const userRef = await getCachedUserRef(uid);
  const snap = await getDoc(userRef);
  cachedUserData = snap.exists() ? (snap.data() || {}) : {};
  return cachedUserData;
}

function queueStudyHistorySave() {
  if (pendingStudyHistorySavePromise) return pendingStudyHistorySavePromise;

  const saveTask = async () => {
    await authReadyPromise;
    await saveStudyHistory({
      db,
      user: currentUser,
      payload: {
        key: `quiz|${subject}|${type}|${level}`,
        kind: type,
        title: currentMeta.title,
        subject,
        difficulty: level,
        detail: `${currentMeta.tag} • ${level}`,
        actionUrl: `quiz.html?subject=${encodeURIComponent(subject)}&type=${encodeURIComponent(type)}&level=${encodeURIComponent(level)}`
      }
    });
  };

  pendingStudyHistorySavePromise = (window.requestIdleCallback
    ? new Promise((resolve) => {
        window.requestIdleCallback(async () => {
          try {
            await saveTask();
          } catch (error) {
            console.warn("Unable to save study history for quiz page.", error);
          } finally {
            pendingStudyHistorySavePromise = null;
            resolve();
          }
        }, { timeout: 1200 });
      })
    : saveTask()
        .catch((error) => {
          console.warn("Unable to save study history for quiz page.", error);
        })
        .finally(() => {
          pendingStudyHistorySavePromise = null;
        }));

  return pendingStudyHistorySavePromise;
}

async function saveQuizResumeState() {
  if (!quizQuestions.length || currentIndex >= quizQuestions.length) return;

  const state = {
    kind: type,
    subject,
    difficulty: level,
    actionUrl: getQuizBaseUrl(),
    resumeUrl: getQuizResumeUrl(),
    title: currentMeta.title,
    detail: `${currentMeta.tag} • ${level}`,
    currentIndex,
    score,
    selectedChoice,
    selectedConfidence,
    correctQuestionIdsThisRun: Array.from(correctQuestionIdsThisRun),
    questions: quizQuestions,
    updatedAt: new Date().toISOString()
  };

  writeQuizResumeState(state);
  await syncResumeActivity(state);
}

async function clearQuizResumeState() {
  const current = readLocalResumeActivity();
  writeQuizResumeState(null);

  const isSameActivity = current?.subject === subject
    && current?.kind === type
    && current?.difficulty === level;

  if (isSameActivity) {
    await syncResumeActivity(null);
  }
}

function restoreQuizResumeState() {
  const shouldResume = new URLSearchParams(window.location.search).get("resume") === "1";
  if (!shouldResume) return false;

  const state = readQuizResumeState();
  if (!state || state.subject !== subject || state.kind !== type || state.difficulty !== level) {
    return false;
  }

  if (!Array.isArray(state.questions) || !state.questions.length) {
    return false;
  }

  quizQuestions = state.questions;
  currentIndex = Math.max(0, Math.min(Number(state.currentIndex || 0), state.questions.length - 1));
  score = Math.max(0, Number(state.score || 0));
  selectedChoice = typeof state.selectedChoice === "string" ? state.selectedChoice : null;
  selectedConfidence = typeof state.selectedConfidence === "string" ? state.selectedConfidence : null;
  correctQuestionIdsThisRun = new Set(normalizeQuestionIdList(state.correctQuestionIdsThisRun));
  return true;
}

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

const currentMeta = quizMeta[subject]?.[type] || {
  tag: "QUIZ",
  title: "Quiz",
  subtitle: "Answer all items carefully."
};

document.getElementById("quizTag").textContent = currentMeta.tag;
document.getElementById("quizTitle").textContent = currentMeta.title;
document.getElementById("quizSubtitle").textContent = currentMeta.subtitle;

queueStudyHistorySave();
/*
saveStudyHistory({
  db,
  user: currentUser,
  payload: {
    key: `quiz|${subject}|${type}|${level}`,
    kind: type,
    title: currentMeta.title,
    subject,
    difficulty: level,
    detail: `${currentMeta.tag} • ${level}`,
    actionUrl: `quiz.html?subject=${encodeURIComponent(subject)}&type=${encodeURIComponent(type)}&level=${encodeURIComponent(level)}`
  }
}).catch((error) => {
  console.warn("Unable to save study history for quiz page.", error);
});
*/

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
  },
  hardware: {
    pretest: hardwarePretestQuestions,
    posttest: hardwarePosttestQuestions
  }
};

function normalizeStandardQuestion(question) {
  if (!question) return question;

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

function shuffleArray(array) {
  const cloned = [...array];

  for (let index = cloned.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [cloned[index], cloned[randomIndex]] = [cloned[randomIndex], cloned[index]];
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

function getPerQuestionXPReward() {
  if (type === "pretest") return XP_RULES.pretest;
  if (type === "posttest") return XP_RULES.posttest;
  return XP_RULES.quizLevel;
}

function getQuizXPReward(scoreValue = score) {
  return Math.max(0, Number(scoreValue) || 0) * getPerQuestionXPReward();
}

function readLocalQuizResultPayload() {
  try {
    const resultKey = getResultDocKey();
    const scoreValue = localStorage.getItem(`${resultKey}_score`);
    if (scoreValue == null) return null;

    return {
      xpAwardedQuestionIds: normalizeQuestionIdList(
        JSON.parse(localStorage.getItem(`${resultKey}_xp_awarded_question_ids`) || "[]")
      )
    };
  } catch {
    return null;
  }
}

async function syncAwardedQuestionIds() {
  const nextIds = new Set(
    normalizeQuestionIdList(readLocalQuizResultPayload()?.xpAwardedQuestionIds)
  );

  if (currentUser) {
    try {
      const data = await getCachedUserData(currentUser.uid, { force: true });
      const remoteIds = normalizeQuestionIdList(
        data?.results?.[getResultDocKey()]?.xpAwardedQuestionIds
      );
      remoteIds.forEach((id) => nextIds.add(id));
    } catch (error) {
      console.warn("Unable to sync awarded question XP state.", error);
    }
  }

  awardedQuestionIds = nextIds;
}

function isPretestAlreadyTaken() {
  if (type !== "pretest") return false;

  const canonicalKey = `${subject}_pretest`;
  return (
    localStorage.getItem(canonicalKey) === "true" ||
    localStorage.getItem(`${canonicalKey}_done`) === "true" ||
    localStorage.getItem(`${canonicalKey}_attempt_done`) === "true"
  );
}

function goToSubjectPage() {
  window.location.href = `subject.html?subject=${subject}`;
}

function showPretestLockModal(message) {
  const modal = document.getElementById("pretestLockModal");
  const text = document.getElementById("pretestLockText");
  const button = document.getElementById("pretestLockBtn");

  if (!modal || !text || !button) {
    goToSubjectPage();
    return;
  }

  text.textContent = message;
  modal.classList.add("active");
  button.onclick = () => {
    modal.classList.remove("active");
    goToSubjectPage();
  };
}

window.goBackToSubject = function () {
  goToSubjectPage();
};

window.finishQuizFlow = function () {
  document.getElementById("resultModal").classList.remove("active");
  goToSubjectPage();
};

document.getElementById("backBtn")?.addEventListener("click", goToSubjectPage);

function prepareQuestions() {
  const source = questionBanks[subject]?.[type] || [];

  if (!source.length) {
    quizQuestions = [];
    return;
  }

  const selected = shuffleArray(source.map(normalizeStandardQuestion)).slice(0, 30);
  quizQuestions = selected.map((question) => ({
    ...question,
    choices: shuffleArray([...question.choices])
  }));
}

restoreQuizResumeState();

function updateProgress() {
  const total = quizQuestions.length || 1;
  const percent = Math.floor((currentIndex / total) * 100);

  document.getElementById("quizCounter").textContent = `Question ${currentIndex + 1} of ${quizQuestions.length}`;
  document.getElementById("quizScore").textContent = `Score: ${score}`;
  document.getElementById("quizProgressFill").style.width = `${percent}%`;
  document.getElementById("quizProgressText").textContent = `${percent}% Completed`;
}

function updateNextButtonState() {
  const nextBtn = document.getElementById("nextBtn");
  if (!nextBtn) return;
  nextBtn.disabled = !selectedChoice || (requiresConfidenceSelection() && !selectedConfidence);
}

function isPretestAssessment() {
  return type === "pretest";
}

function requiresConfidenceSelection() {
  return !isPretestAssessment();
}

function bindConfidenceOptions() {
  if (!requiresConfidenceSelection()) return;
  const options = Array.from(document.querySelectorAll("#confidenceOptions .confidence-btn"));
  options.forEach((button) => {
    button.addEventListener("click", () => {
      options.forEach((item) => item.classList.remove("selected"));
      button.classList.add("selected");
      selectedConfidence = String(button.dataset.confidence || "");
      updateNextButtonState();
      saveQuizResumeState().catch((error) => {
        console.warn("Unable to save quiz resume state.", error);
      });
    });
  });
}

function renderConfidenceSelection(restoredConfidence = null) {
  const panel = document.querySelector(".confidence-panel");
  if (!requiresConfidenceSelection()) {
    if (panel) panel.hidden = true;
    selectedConfidence = "sure";
    updateNextButtonState();
    return;
  }

  if (panel) panel.hidden = false;
  const options = Array.from(document.querySelectorAll("#confidenceOptions .confidence-btn"));
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
  if (isPretestAssessment()) return;
  if (retentionGateShown) return;

  await authReadyPromise;
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
      ? `This answer has been added to your memory review for ${getSubjectDisplayName()}. You can review the flashcard now or continue this assessment first.`
      : `This answer has been added to your memory review for ${getSubjectDisplayName()}, and you now have ${dueItems.length} due memory card${dueItems.length === 1 ? "" : "s"} for this subject. You can review them now or continue this assessment first.`;
  } else {
    text.textContent = `You already have ${dueItems.length} due memory card${dueItems.length === 1 ? "" : "s"} for ${getSubjectDisplayName()} from earlier review work. Reviewing them first can improve retention before you continue this assessment.`;
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
  if (isPretestAssessment()) return;
  retentionGateShown = false;
  await maybeShowRetentionGate({ trigger: "weak_answer" });
}

function renderQuestion() {
  const nextBtn = document.getElementById("nextBtn");
  const restoredChoice = selectedChoice;
  const restoredConfidence = selectedConfidence;
  selectedChoice = null;
  selectedConfidence = null;
  nextBtn.disabled = true;

  const currentQuestion = quizQuestions[currentIndex];

  if (!currentQuestion) {
    document.getElementById("questionText").textContent = "Quiz content is not available yet.";
    document.getElementById("choicesContainer").innerHTML = "";
    document.getElementById("quizCounter").textContent = "Quiz unavailable";
    document.getElementById("quizProgressText").textContent = "Content unavailable";
    nextBtn.textContent = "Unavailable";
    return;
  }

  updateProgress();
  document.getElementById("questionText").textContent = currentQuestion.question;

  let media = document.getElementById("questionMedia");
  if (!media) {
    media = document.createElement("div");
    media.id = "questionMedia";
    media.className = "quiz-question-media";
    document.querySelector(".question-block")?.appendChild(media);
  }

  media.innerHTML = currentQuestion.image
    ? `<img src="${currentQuestion.image}" alt="Question visual" class="quiz-question-image" loading="lazy" decoding="async">`
    : "";

  const choicesContainer = document.getElementById("choicesContainer");
  choicesContainer.innerHTML = "";

  currentQuestion.choices.forEach((choice) => {
    const button = document.createElement("button");
    button.className = "choice-btn";
    button.textContent = choice;

    button.addEventListener("click", () => {
      document.querySelectorAll(".choice-btn").forEach((item) => item.classList.remove("selected"));
      button.classList.add("selected");
      selectedChoice = choice;
      updateNextButtonState();
      saveQuizResumeState().catch((error) => {
        console.warn("Unable to save quiz resume state.", error);
      });
    });

    choicesContainer.appendChild(button);
    if (restoredChoice && restoredChoice === choice) {
      button.classList.add("selected");
      selectedChoice = choice;
    }
  });

  renderConfidenceSelection(restoredConfidence);
  nextBtn.textContent = currentIndex === quizQuestions.length - 1 ? "Submit" : "Next";
  saveQuizResumeState().catch((error) => {
    console.warn("Unable to save quiz resume state.", error);
  });
}

function showRationale(message) {
  document.getElementById("rationaleText").textContent = message;
  document.getElementById("rationaleModal").classList.add("active");
}

function getCorrectAnswerText(question) {
  return String(question?.answer || "").trim();
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
    }
  ];

  const matched = rationaleLibrary.find((entry) =>
    entry.patterns.some((pattern) => prompt.includes(pattern))
  );

  return matched?.text || "Review the concept being tested here and match the component, formula, or wiring rule to its actual function.";
}

function buildReviewRationale(question) {
  const baseExplanation = String(question?.rationale || buildFallbackQuizRationale(question)).trim();
  const correctAnswer = getCorrectAnswerText(question);

  if (type === "pretest") {
    return correctAnswer ? `Correct answer: ${correctAnswer}.` : "Review the correct answer for this item.";
  }

  if (type === "posttest") {
    return baseExplanation || "Review the concept behind this item and revisit the related module before trying similar questions again.";
  }

  return baseExplanation;
}

function buildWrongAnswerReviewPayload(question, selectedAnswer) {
  const hasNextDayRetry = type !== "pretest";
  const tomorrow = new Date();
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return {
    source: "quiz",
    subject,
    quizType: type,
    difficulty: level,
    level: question?.level || 0,
    sub: question?.sub || currentIndex + 1,
    title: `${subject === "hardware" ? "Computer Hardware" : "Electrical"} ${type === "pretest" ? "Pre-Test" : type === "posttest" ? "Post-Test" : "Quiz"}`,
    question: String(question?.question || ""),
    image: String(question?.image || ""),
    imageCropBottom: Number(question?.imageCropBottom || 0) || 0,
    selectedAnswer: String(selectedAnswer || ""),
    correctAnswer: getCorrectAnswerText(question),
    rationale: buildReviewRationale(question),
    actionUrl: `quiz.html?subject=${encodeURIComponent(subject)}&type=${encodeURIComponent(type)}&level=${encodeURIComponent(level)}`,
    retryAvailableAt: hasNextDayRetry ? tomorrow.toISOString() : "",
    retryPolicy: hasNextDayRetry ? "next_day" : "locked",
    confidence: selectedConfidence || "",
    lastAnsweredAt: new Date().toISOString()
  };
}

window.closeRationaleAndContinue = function () {
  document.getElementById("rationaleModal").classList.remove("active");

  if (typeof pendingContinue === "function") {
    pendingContinue();
    pendingContinue = null;
  }
};

function showResult() {
  const total = quizQuestions.length || 1;
  const percent = Math.round((score / total) * 100);
  const xpEarned = lastEarnedXP;
  const xpPercent = Math.max(0, Math.min(100, Math.round((xpEarned / Math.max(1, total * getPerQuestionXPReward())) * 100)));

  document.getElementById("resultTitle").textContent = `${currentMeta.tag} Complete`;
  document.getElementById("resultScore").textContent = `${score}/${total}`;
  document.getElementById("resultPercent").textContent = `${percent}%`;
  document.getElementById("resultXP").textContent = `${xpEarned} XP`;
  document.getElementById("resultScoreMeta").textContent = `${score} / ${total}`;
  document.getElementById("resultXpMeta").textContent = `${xpEarned} XP`;
  document.getElementById("resultScoreFill").style.width = `${percent}%`;
  document.getElementById("resultXpFill").style.width = `${xpPercent}%`;
  document.getElementById("resultMessage").textContent = `You scored ${score} out of ${total}.`;
  const recoverySummary = document.getElementById("resultRecoverySummary");
  if (recoverySummary) {
    if (recoveredMistakesThisRun > 0) {
      recoverySummary.hidden = false;
      recoverySummary.textContent = `Recovery win: you fixed ${recoveredMistakesThisRun} previously missed question${recoveredMistakesThisRun === 1 ? "" : "s"} in this attempt.`;
    } else {
      recoverySummary.hidden = true;
      recoverySummary.textContent = "";
    }
  }
  document.getElementById("resultModal").classList.add("active");
}

async function ensureUserDoc(uid) {
  const userRef = await getCachedUserRef(uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    const initialData = {
      xp: 0,
      xpWeekly: 0,
      xpChange: 0,
      lastWeeklyReset: getWeekKey(),
      progress: {},
      results: {},
      createdAt: new Date().toISOString()
    };
    await setDoc(userRef, initialData);
    cachedUserData = initialData;
  } else {
    cachedUserData = snap.data() || {};
  }

  return userRef;
}

function getWeekKey() {
  const now = new Date();
  const year = now.getFullYear();
  const firstDay = new Date(year, 0, 1);
  const pastDays = Math.floor((now - firstDay) / 86400000);
  const week = Math.ceil((pastDays + firstDay.getDay() + 1) / 7);
  return `${year}-W${week}`;
}

async function addXP(amount) {
  if (!amount || amount <= 0) return;

  await authReadyPromise;

  const sourceLabel =
    type === "pretest" ? "pretest" :
    type === "posttest" ? "posttest" :
    "quiz";

  if (currentUser) {
    const userRef = await ensureUserDoc(currentUser.uid);
    const data = await getCachedUserData(currentUser.uid);
    const currentWeek = getWeekKey();
    const lastWeeklyReset = data.lastWeeklyReset || currentWeek;
    const currentXP = Number(data.xp || 0);
    const currentWeeklyXP = lastWeeklyReset === currentWeek ? Number(data.xpWeekly || 0) : 0;

    const updatePayload = {
      xp: currentXP + amount,
      xpWeekly: currentWeeklyXP + amount,
      xpChange: amount,
      lastWeeklyReset: currentWeek
    };

    await updateDoc(userRef, updatePayload);
    mergeCachedUserData(updatePayload);

    traceXPEvent({
      channel: "firestore",
      source: sourceLabel,
      subject,
      level,
      amount,
      nextXP: currentXP + amount,
      uid: currentUser.uid
    });

    await syncPublicLeaderboardEntry(db, currentUser.uid, {
      name: data.name || currentUser.displayName || currentUser.email || "User",
      photo: data.photo || currentUser.photoURL || "https://i.pravatar.cc/40?img=12",
      xp: currentXP + amount,
      xpWeekly: currentWeeklyXP + amount,
      xpChange: amount
    });

    return;
  }

  const guestXP = parseInt(localStorage.getItem("guest_xp") || "0", 10);
  const guestWeeklyXP = parseInt(localStorage.getItem("guest_xpWeekly") || "0", 10);
  localStorage.setItem("guest_xp", String(guestXP + amount));
  localStorage.setItem("guest_xpWeekly", String(guestWeeklyXP + amount));

  traceXPEvent({
    channel: "guest_local",
    source: sourceLabel,
    subject,
    level,
    amount,
    nextXP: guestXP + amount
  });
}

async function saveQuizResultToStorageAndFirestore() {
  await authReadyPromise;

  const total = quizQuestions.length || 1;
  const percent = Math.round((score / total) * 100);
  const xpEarned = lastEarnedXP;
  const resultKey = getResultDocKey();
  const flags = getProgressFlags();
  const selectedSubject = (sessionStorage.getItem(SELECTED_SUBJECT_KEY) || "").toLowerCase();
  const canonicalSubject = validSubjects.has(selectedSubject) ? selectedSubject : subject;
  const canonicalResultKey = `${canonicalSubject}_${type}`;

  const resultPayload = {
    subject,
    type,
    level,
    score,
    total,
    percent,
    xpEarned,
    xpAwardedQuestionIds: Array.from(awardedQuestionIds),
    completedAt: new Date().toISOString()
  };

  if (type === "pretest") {
    localStorage.setItem(flags.pretestKey, "true");
    localStorage.setItem(`${canonicalSubject}_pretest`, "true");
  } else if (type === "posttest") {
    localStorage.setItem(flags.posttestKey, "true");
    localStorage.setItem(`${canonicalSubject}_posttest`, "true");
  } else {
    localStorage.setItem(flags.quizKey, "true");
    localStorage.setItem(`${canonicalSubject}_quiz`, "true");
  }

  localStorage.setItem(getQuizStorageKey(), "true");
  localStorage.setItem(`${resultKey}_score`, String(score));
  localStorage.setItem(`${resultKey}_total`, String(total));
  localStorage.setItem(`${resultKey}_percent`, String(percent));
  localStorage.setItem(`${resultKey}_done`, "true");
  localStorage.setItem(`${resultKey}_completedAt`, resultPayload.completedAt);
  localStorage.setItem(`${resultKey}_xp_awarded`, String(xpEarned));
  localStorage.setItem(`${resultKey}_xp_awarded_question_ids`, JSON.stringify(resultPayload.xpAwardedQuestionIds));
  localStorage.setItem(`${canonicalResultKey}_score`, String(score));
  localStorage.setItem(`${canonicalResultKey}_total`, String(total));
  localStorage.setItem(`${canonicalResultKey}_percent`, String(percent));
  localStorage.setItem(`${canonicalResultKey}_done`, "true");
  localStorage.setItem(`${canonicalResultKey}_completedAt`, resultPayload.completedAt);
  localStorage.setItem(`${canonicalResultKey}_xp_awarded`, String(xpEarned));
  localStorage.setItem(`${canonicalResultKey}_xp_awarded_question_ids`, JSON.stringify(resultPayload.xpAwardedQuestionIds));
  localStorage.setItem(`${canonicalResultKey}_attempt_done`, "true");

  if (!currentUser) return;

  const userRef = await ensureUserDoc(currentUser.uid);
  const data = await getCachedUserData(currentUser.uid);
  const progress = data.progress || {};
  const results = data.results || {};

  if (type === "pretest") {
    progress[flags.pretestKey] = true;
    progress[`${canonicalSubject}_pretest`] = true;
  } else if (type === "posttest") {
    progress[flags.posttestKey] = true;
    progress[`${canonicalSubject}_posttest`] = true;
  } else {
    progress[flags.quizKey] = true;
    progress[`${canonicalSubject}_quiz`] = true;
  }
  progress[`${resultKey}_xp_awarded`] = xpEarned;
  progress[`${canonicalResultKey}_xp_awarded`] = xpEarned;

  results[resultKey] = resultPayload;
  results[canonicalResultKey] = {
    ...resultPayload,
    subject: canonicalSubject
  };
  await updateDoc(userRef, { progress, results });
  mergeCachedUserData({ progress, results });
}

async function finishAttempt() {
  document.getElementById("quizProgressFill").style.width = "100%";
  document.getElementById("quizProgressText").textContent = "100% Completed";

  const newlyAwardedIds = Array.from(correctQuestionIdsThisRun).filter((id) => !awardedQuestionIds.has(id));
  newlyAwardedIds.forEach((id) => awardedQuestionIds.add(id));
  lastEarnedXP = newlyAwardedIds.length * getPerQuestionXPReward();
  await addXP(lastEarnedXP);
  await saveQuizResultToStorageAndFirestore();
  await clearQuizResumeState();
  correctQuestionIdsThisRun = new Set();
  showResult();
  recoveredMistakesThisRun = 0;
}

function continueToNext() {
  currentIndex += 1;

  if (currentIndex < quizQuestions.length) {
    renderQuestion();
    return;
  }

  finishAttempt().catch((error) => {
    console.error("Error finishing quiz attempt:", error);
    showResult();
  });
}

window.handleNext = function () {
  if (!selectedChoice || (requiresConfidenceSelection() && !selectedConfidence)) return;

  const currentQuestion = quizQuestions[currentIndex];
  const isCorrect = selectedChoice === currentQuestion.answer;
  const reviewPayload = buildWrongAnswerReviewPayload(currentQuestion, selectedChoice);
  const reviewTrackingKey = buildReviewTrackingKey(reviewPayload);
  const tracksReviewQueues = !isPretestAssessment();
  const lowConfidence = tracksReviewQueues && isLowConfidenceAnswer(selectedConfidence);

  if (isCorrect) {
    correctQuestionIdsThisRun.add(getQuestionIdentifier(currentQuestion, currentIndex));
    if (tracksReviewQueues && wrongAnswerReviewKeys.has(reviewTrackingKey)) {
      recoveredMistakesThisRun += 1;
      wrongAnswerReviewKeys.delete(reviewTrackingKey);
    }
    if (tracksReviewQueues) {
      resolveWrongAnswerReview({
        db,
        user: currentUser,
        payload: reviewPayload
      }).catch((error) => {
        console.warn("Unable to resolve wrong-answer review item.", error);
      });
    }
    if (lowConfidence) {
      saveRetentionReview({
        db,
        user: currentUser,
        payload: {
          ...reviewPayload,
          seedReason: "low_confidence_correct"
        }
      }).then(() => {
        promptRetentionGateAfterWeakAnswer().catch((error) => {
          console.warn("Unable to show retention gate after low-confidence answer.", error);
        });
      }).catch((error) => {
        console.warn("Unable to queue low-confidence retention item.", error);
      });
    } else if (tracksReviewQueues) {
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
    selectedChoice = null;
    selectedConfidence = null;
    saveQuizResumeState().catch((error) => {
      console.warn("Unable to save quiz resume state.", error);
    });
    if (lowConfidence) {
      pendingContinue = continueToNext;
      showRationale(`Correct, but you marked this as ${getConfidenceLabel(reviewPayload.confidence).toLowerCase()}. It has been added to Today's Memory Review so the concept can come back later.`);
      return;
    }
    continueToNext();
    return;
  }

  playSound("wrong");
  if (tracksReviewQueues) {
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
    }).then(() => {
      promptRetentionGateAfterWeakAnswer().catch((error) => {
        console.warn("Unable to show retention gate after wrong answer.", error);
      });
    }).catch((error) => {
      console.warn("Unable to queue retention review item.", error);
    });
  }
  selectedChoice = null;
  selectedConfidence = null;
  saveQuizResumeState().catch((error) => {
    console.warn("Unable to save quiz resume state.", error);
  });
  pendingContinue = continueToNext;
  showRationale(buildReviewRationale(currentQuestion));
};

function updateIcon() {
  const icon = document.getElementById("themeIcon");
  if (!icon) return;
  icon.textContent = document.body.classList.contains("light-mode") ? "\u2600\uFE0F" : "\uD83C\uDF19";
}

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

if (isPretestAlreadyTaken()) {
  loadTheme();
  showPretestLockModal("You already took the pre-test.");
} else {
  Promise.resolve()
    .then(() => Promise.all([syncAwardedQuestionIds(), syncWrongAnswerReviewKeys()]))
    .then(() => {
      prepareQuestions();
      loadTheme();
      renderQuestion();
    })
    .catch((error) => {
      console.warn("Unable to initialize quiz XP award state.", error);
      prepareQuestions();
      loadTheme();
      renderQuestion();
    });
}

onAuthStateChanged(auth, (user) => {
  currentUser = user || null;
  currentIsGuest = !user && localStorage.getItem("guest") === "true";
  syncAwardedQuestionIds().catch((error) => {
    console.warn("Unable to refresh awarded question XP state.", error);
  });
  syncWrongAnswerReviewKeys().catch((error) => {
    console.warn("Unable to refresh wrong-answer review tracking state.", error);
  });

  if (!authReadyResolved) {
    authReadyResolved = true;
    resolveAuthReady?.();
  }

  if (!isPretestAlreadyTaken()) {
    retentionGateShown = false;
  }
});

initSounds();
initGlobalClickSound();
setupSoundToggles();
bindConfidenceOptions();
tryStartMusic();

document.body.addEventListener("click", () => {
  tryStartMusic();
}, { once: true });
