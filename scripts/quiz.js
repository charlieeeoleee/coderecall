import { app } from "./firebase-config.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
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
import { saveWrongAnswerReview, resolveWrongAnswerReview, loadWrongAnswerReview } from "./review-store.js";
import { saveRetentionReview, resolveRetentionReview, loadRetentionQueue } from "./retention-store.js";
import { saveStudyHistory } from "./study-history-store.js";
import { traceXPEvent } from "./xp-debug.js";
import { submitGamificationEvent } from "./gamification-api.js";
import { describeBackendError } from "./backend-api.js";
import { electricalPosttestQuestions } from "../data/electrical-posttest-data.js";
import { electricalPretestQuestions } from "../data/electrical-pretest-data.js";
import { hardwarePosttestQuestions } from "../data/hardware-posttest-data.js";
import {
  hardwarePretestQuestions
} from "../data/hardware-assessment-data.js";
import { resolveAssessmentRoute } from "./assessment-routing.mjs";
import { buildSubjectUrl } from "./subject-routing.mjs";
import { hasAuthoritativeAssessmentCompletion } from "./assessment-completion.mjs";


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
let missedQuestionsThisRun = [];
let answeredQuestionsThisRun = [];
const SELECTED_SUBJECT_KEY = "selectedSubject";
const RESUME_ACTIVITY_KEY = "resume_activity";

let routeError = null;
let assessmentRoute = null;
try {
  assessmentRoute = resolveAssessmentRoute(window.location.search);
} catch (error) {
  routeError = error;
}
const subject = assessmentRoute?.subject || "";
const type = assessmentRoute?.type || "";
const params = new URLSearchParams(window.location.search);
const level = params.get("level") || "easy";

if (assessmentRoute) sessionStorage.setItem(SELECTED_SUBJECT_KEY, subject);

const XP_RULES = {
  pretest: 1,
  posttest: 1,
  quizLevel: 6
};

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
    </div>
  `;
  document.body.appendChild(modal);

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeImageInspector();
  });
  document.getElementById("imageInspectorClose")?.addEventListener("click", closeImageInspector);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeImageInspector();
  });

  return modal;
}

function openImageInspector(src, caption = "Question visual") {
  if (!src) return;
  const modal = ensureImageInspectorModal();
  const image = document.getElementById("imageInspectorImg");
  const title = document.getElementById("imageInspectorTitle");
  const captionEl = document.getElementById("imageInspectorCaption");

  if (image) {
    image.src = src;
    image.alt = caption;
  }
  if (title) title.textContent = caption;
  if (captionEl) captionEl.textContent = "Use this enlarged view to inspect details before answering.";
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
  const pairId = String(question?.pairId || "").trim();
  if (pairId) return pairId;

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

function mergeGamificationResponse(response = {}) {
  const next = {};
  ["xp", "xpWeekly", "xpChange", "progress", "results"].forEach((key) => {
    if (response[key] !== undefined) {
      next[key] = response[key];
    }
  });
  mergeCachedUserData(next);
  return next;
}

function assertPersistedGamificationResponse(response, expected = {}) {
  const progress = response?.progress || {};
  const results = response?.results || {};
  const result = results[expected.resultKey] || {};
  const aggregateXP = Number(response?.xp);
  const awardedXP = Number(progress[expected.xpKey]);

  if (
    !Number.isFinite(aggregateXP) ||
    awardedXP !== expected.xpEarned ||
    Number(result.score) !== expected.score ||
    Number(result.total) !== expected.total
  ) {
    throw new Error("The server did not confirm the completed assessment and XP award.");
  }

  return aggregateXP;
}

async function verifyAuthoritativeGamificationWrite(userRef, response, expected = {}) {
  const expectedXP = assertPersistedGamificationResponse(response, expected);
  const snap = await getDocFromServer(userRef);
  const data = snap.exists() ? (snap.data() || {}) : {};
  const result = data.results?.[expected.resultKey] || {};

  if (
    !snap.exists() ||
    Number(data.xp) !== expectedXP ||
    Number(data.progress?.[expected.xpKey]) !== expected.xpEarned ||
    Number(result.score) !== expected.score ||
    Number(result.total) !== expected.total
  ) {
    throw new Error("The completed assessment was not confirmed in the authoritative learner record.");
  }

  return data;
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
    total: quizQuestions.length,
    progressPercent: Math.round((currentIndex / Math.max(quizQuestions.length, 1)) * 100),
    score,
    selectedChoice,
    selectedConfidence,
    correctQuestionIdsThisRun: Array.from(correctQuestionIdsThisRun),
    answeredQuestionsThisRun,
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
  answeredQuestionsThisRun = Array.isArray(state.answeredQuestionsThisRun) ? state.answeredQuestionsThisRun : [];
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
  tag: "ASSESSMENT UNAVAILABLE",
  title: "Invalid Assessment Link",
  subtitle: routeError?.message || "Open this assessment from the Subjects page."
};

document.getElementById("quizTag").textContent = currentMeta.tag;
document.getElementById("quizTitle").textContent = currentMeta.title;
document.getElementById("quizSubtitle").textContent = currentMeta.subtitle;

if (assessmentRoute) queueStudyHistorySave();
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
  const nextIds = currentUser
    ? new Set()
    : new Set(normalizeQuestionIdList(readLocalQuizResultPayload()?.xpAwardedQuestionIds));

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

async function isPretestAlreadyTaken() {
  if (type !== "pretest") return false;

  if (currentUser) {
    const data = await getCachedUserData(currentUser.uid, { force: true });
    return hasAuthoritativeAssessmentCompletion(data, subject, "pretest");
  }

  if (!currentIsGuest) return false;
  const canonicalKey = `${subject}_pretest`;
  return (
    localStorage.getItem(canonicalKey) === "true" ||
    localStorage.getItem(`${canonicalKey}_done`) === "true" ||
    localStorage.getItem(`${canonicalKey}_attempt_done`) === "true"
  );
}

function goToSubjectPage() {
  window.location.href = buildSubjectUrl(subject);
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
  if (routeError) {
    quizQuestions = [];
    return;
  }
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
  document.getElementById("quizScore").textContent = isPretestAssessment()
    ? "Diagnostic assessment"
    : `Score: ${score}`;
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

function isStandardTestAssessment() {
  return type === "pretest" || type === "posttest";
}

function requiresConfidenceSelection() {
  return !isStandardTestAssessment();
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
    selectedConfidence = null;
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
  if (!requiresConfidenceSelection()) return;
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
  if (!requiresConfidenceSelection()) return;
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
    document.getElementById("questionText").textContent = routeError?.message || "Quiz content is not available yet.";
    document.getElementById("choicesContainer").innerHTML = "";
    document.getElementById("quizCounter").textContent = "Quiz unavailable";
    document.getElementById("quizScore").textContent = "Assessment unavailable";
    document.getElementById("quizProgressText").textContent = "Content unavailable";
    nextBtn.textContent = "Unavailable";
    nextBtn.hidden = true;
    document.querySelector(".confidence-panel")?.setAttribute("hidden", "");
    document.querySelector("[data-item-feedback]")?.setAttribute("hidden", "");
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
    ? `
      <button type="button" class="image-inspector-trigger" aria-label="Open enlarged question image">
        <img src="${currentQuestion.image}" alt="Question visual" class="quiz-question-image" loading="lazy" decoding="async">
        <span>Enlarge Image</span>
      </button>
    `
    : "";
  attachQuestionImageInspector(media, "Question visual");

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
    return "Pre-Test response recorded.";
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

function buildAnswerDetailItem(question, selectedAnswer, isCorrect) {
  return {
    subject,
    type,
    level,
    questionNumber: currentIndex + 1,
    questionId: getQuestionIdentifier(question, currentIndex),
    question: String(question?.question || ""),
    selectedAnswer: String(selectedAnswer || ""),
    correctAnswer: getCorrectAnswerText(question),
    isCorrect: Boolean(isCorrect),
    result: isCorrect ? "Correct" : "Wrong",
    confidence: selectedConfidence || "",
    rationale: buildReviewRationale(question),
    source: "saved_attempt",
    answeredAt: new Date().toISOString()
  };
}

function getResultNextStepText(percent) {
  if (type === "pretest") {
    return percent >= 80
      ? "Strong baseline. Continue to the modules and use them to confirm the concepts you already know."
      : "Continue to the modules next. The lessons will help strengthen the topics that appeared in this Pre-Test.";
  }

  if (type === "posttest") {
    return percent >= 80
      ? "Great finish. Return to the subject page to check completion and open the certificate when available."
      : "Return to the subject page and review the modules or quiz track before trying similar items again.";
  }

  return missedQuestionsThisRun.length
    ? "Review the missed items below, then return to the quiz track when you are ready for the next level."
    : "Clean run. Return to the quiz track and continue to the next level.";
}

function renderResultNextStep(percent) {
  const title = document.getElementById("resultNextStepTitle");
  const text = document.getElementById("resultNextStepText");
  if (!title || !text) return;

  title.textContent = missedQuestionsThisRun.length
    ? "Review Before Continuing"
    : "Continue Learning";
  text.textContent = getResultNextStepText(percent);
}

function appendReviewField(parent, label, value, className = "") {
  const wrapper = document.createElement("div");
  wrapper.className = `result-review-field ${className}`.trim();

  const labelEl = document.createElement("span");
  labelEl.textContent = label;

  const valueEl = document.createElement("strong");
  valueEl.textContent = value || "Not recorded";

  wrapper.append(labelEl, valueEl);
  parent.appendChild(wrapper);
}

function renderResultReviewPanel() {
  const panel = document.getElementById("resultReviewPanel");
  const list = document.getElementById("resultReviewList");
  const summary = document.getElementById("resultReviewSummary");
  if (!panel || !list || !summary) return;

  list.innerHTML = "";
  if (isPretestAssessment()) {
    panel.hidden = true;
    summary.textContent = "";
    return;
  }

  if (!missedQuestionsThisRun.length) {
    panel.hidden = true;
    return;
  }

  panel.hidden = false;
  summary.textContent = `${missedQuestionsThisRun.length} missed item${missedQuestionsThisRun.length === 1 ? "" : "s"} added to review. Showing the first ${Math.min(3, missedQuestionsThisRun.length)}.`;

  missedQuestionsThisRun.slice(0, 3).forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "result-review-item";

    const eyebrow = document.createElement("span");
    eyebrow.className = "result-review-eyebrow";
    eyebrow.textContent = `Item ${item.number || index + 1}`;

    const question = document.createElement("h5");
    question.textContent = item.question || "Question text unavailable";

    const answers = document.createElement("div");
    answers.className = "result-review-answer-grid";
    appendReviewField(answers, "Your Answer", item.selectedAnswer, "missed");
    appendReviewField(answers, "Correct Answer", item.correctAnswer, "correct");

    const rationale = document.createElement("p");
    rationale.textContent = item.rationale || "Review the related lesson before trying a similar item again.";

    card.append(eyebrow, question, answers, rationale);
    list.appendChild(card);
  });
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
  renderResultNextStep(percent);
  renderResultReviewPanel();
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
  const finishButton = document.getElementById("finishQuizFlowBtn");
  if (finishButton) {
    finishButton.textContent = "Return to Subject";
    finishButton.onclick = window.finishQuizFlow;
  }
  document.getElementById("resultModal").classList.add("active");
}

function showCompletionPersistenceError(error) {
  const total = quizQuestions.length || 1;
  const percent = Math.round((score / total) * 100);
  const message = describeBackendError(error, "Your result could not be saved. Please retry before leaving this page.");
  document.getElementById("resultTitle").textContent = "Result Not Saved";
  document.getElementById("resultMessage").textContent = `${message} Your answers are still available for a safe retry.`;
  document.getElementById("resultScore").textContent = `${score}/${total}`;
  document.getElementById("resultPercent").textContent = `${percent}%`;
  document.getElementById("resultScoreMeta").textContent = `${score} / ${total}`;
  document.getElementById("resultScoreFill").style.width = `${percent}%`;
  document.getElementById("resultXP").textContent = "Not awarded";
  document.getElementById("resultXpMeta").textContent = `${lastEarnedXP} XP calculated`;
  document.getElementById("resultNextStepTitle").textContent = "Retry Required";
  document.getElementById("resultNextStepText").textContent = "Retry saving this result before returning to the subject page.";
  const finishButton = document.getElementById("finishQuizFlowBtn");
  if (finishButton) {
    finishButton.textContent = "Retry Save";
    finishButton.onclick = () => {
      finishButton.disabled = true;
      finishAttempt().catch((retryError) => {
        console.error("Error retrying quiz result persistence:", retryError);
        showCompletionPersistenceError(retryError);
      }).finally(() => {
        finishButton.disabled = false;
      });
    };
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
    traceXPEvent({
      channel: "firestore",
      source: sourceLabel,
      subject,
      level,
      amount,
      nextXP: Number(cachedUserData?.xp || 0) + amount,
      uid: currentUser.uid
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
  const canonicalSubject = subject;
  const canonicalResultKey = `${canonicalSubject}_${type}`;

  const resultPayload = {
    subject,
    type,
    level,
    score,
    total,
    percent,
    xpEarned,
    answerItems: answeredQuestionsThisRun,
    xpAwardedQuestionIds: Array.from(awardedQuestionIds),
    completedAt: new Date().toISOString()
  };

  const persistLocalCompletion = () => {
    const progressKey = type === "pretest" ? flags.pretestKey : type === "posttest" ? flags.posttestKey : flags.quizKey;
    localStorage.setItem(progressKey, "true");
    localStorage.setItem(getQuizStorageKey(), "true");
    for (const key of new Set([resultKey, canonicalResultKey])) {
      localStorage.setItem(`${key}_score`, String(score));
      localStorage.setItem(`${key}_total`, String(total));
      localStorage.setItem(`${key}_percent`, String(percent));
      localStorage.setItem(`${key}_done`, "true");
      localStorage.setItem(`${key}_completedAt`, resultPayload.completedAt);
      localStorage.setItem(`${key}_xp_awarded`, String(xpEarned));
      localStorage.setItem(`${key}_xp_awarded_question_ids`, JSON.stringify(resultPayload.xpAwardedQuestionIds));
      localStorage.setItem(`${key}_attempt_done`, "true");
    }
  };

  if (!currentUser) {
    persistLocalCompletion();
    return { xpDelta: xpEarned };
  }

  const userRef = await ensureUserDoc(currentUser.uid);
  const eventId = [
    "quiz",
    canonicalSubject,
    type,
    level,
    resultPayload.xpAwardedQuestionIds.join("-") || resultPayload.completedAt
  ].join(":").replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 150);
  const response = await submitGamificationEvent({
    action: "record_quiz_result",
    eventId,
    subject: canonicalSubject,
    type,
    difficulty: level,
    level,
    score,
    total,
    xpAwarded: xpEarned,
    answerItems: answeredQuestionsThisRun,
    xpAwardedQuestionIds: resultPayload.xpAwardedQuestionIds
  });
  const xpKey = type === "quiz"
    ? `${canonicalSubject}_${level}_quiz_level_1_done_xp_awarded`
    : `${canonicalSubject}_${type}_xp_awarded`;
  const authoritativeData = await verifyAuthoritativeGamificationWrite(userRef, response, {
    resultKey: type === "quiz"
      ? `${canonicalSubject}_${level}_quiz_level_1_result`
      : canonicalResultKey,
    xpKey,
    xpEarned,
    score,
    total
  });
  mergeGamificationResponse(response);
  mergeCachedUserData(authoritativeData);
  persistLocalCompletion();
  return response;
}

async function finishAttempt() {
  document.getElementById("quizProgressFill").style.width = "100%";
  document.getElementById("quizProgressText").textContent = "100% Completed";

  const newlyAwardedIds = Array.from(correctQuestionIdsThisRun).filter((id) => !awardedQuestionIds.has(id));
  newlyAwardedIds.forEach((id) => awardedQuestionIds.add(id));
  lastEarnedXP = newlyAwardedIds.length * getPerQuestionXPReward();
  try {
    await addXP(lastEarnedXP);
    await saveQuizResultToStorageAndFirestore();
    await clearQuizResumeState();
    correctQuestionIdsThisRun = new Set();
    answeredQuestionsThisRun = [];
    showResult();
    recoveredMistakesThisRun = 0;
  } catch (error) {
    newlyAwardedIds.forEach((id) => awardedQuestionIds.delete(id));
    throw error;
  }
}

function continueToNext() {
  currentIndex += 1;

  if (currentIndex < quizQuestions.length) {
    renderQuestion();
    return;
  }

  finishAttempt().catch((error) => {
    console.error("Error finishing quiz attempt:", error);
    showCompletionPersistenceError(error);
  });
}

window.handleNext = function () {
  if (!selectedChoice || (requiresConfidenceSelection() && !selectedConfidence)) return;

  const currentQuestion = quizQuestions[currentIndex];
  const isCorrect = selectedChoice === currentQuestion.answer;
  const reviewPayload = buildWrongAnswerReviewPayload(currentQuestion, selectedChoice);
  const reviewTrackingKey = buildReviewTrackingKey(reviewPayload);
  const tracksReviewQueues = requiresConfidenceSelection();
  const lowConfidence = tracksReviewQueues && isLowConfidenceAnswer(selectedConfidence);
  answeredQuestionsThisRun.push(buildAnswerDetailItem(currentQuestion, selectedChoice, isCorrect));

  if (isPretestAssessment()) {
    if (isCorrect) {
      correctQuestionIdsThisRun.add(getQuestionIdentifier(currentQuestion, currentIndex));
      score += 1;
    }
    selectedChoice = null;
    selectedConfidence = null;
    saveQuizResumeState().catch((error) => {
      console.warn("Unable to save quiz resume state.", error);
    });
    continueToNext();
    return;
  }

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
  missedQuestionsThisRun.push({
    number: currentIndex + 1,
    question: String(currentQuestion?.question || ""),
    selectedAnswer: String(selectedChoice || ""),
    correctAnswer: getCorrectAnswerText(currentQuestion),
    rationale: buildReviewRationale(currentQuestion)
  });
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

onAuthStateChanged(auth, (user) => {
  currentUser = user || null;
  currentIsGuest = !user && localStorage.getItem("guest") === "true";

  if (!authReadyResolved) {
    authReadyResolved = true;
    resolveAuthReady?.();
  }

});

async function initializeQuiz() {
  document.querySelector(".confidence-panel")?.setAttribute("hidden", "");
  loadTheme();
  await authReadyPromise;

  if (await isPretestAlreadyTaken()) {
    showPretestLockModal("You already took the pre-test.");
    return;
  }

  retentionGateShown = false;
  try {
    await Promise.all([syncAwardedQuestionIds(), syncWrongAnswerReviewKeys()]);
  } catch (error) {
    console.warn("Unable to initialize quiz XP award state.", error);
  }
  prepareQuestions();
  renderQuestion();
}

initializeQuiz().catch((error) => {
  console.error("Unable to initialize assessment.", error);
  routeError = routeError || error;
  prepareQuestions();
  renderQuestion();
});

initSounds();
initGlobalClickSound();
setupSoundToggles();
bindConfidenceOptions();
tryStartMusic();

document.body.addEventListener("click", () => {
  tryStartMusic();
}, { once: true });
