const { FieldValue, adminDb } = require("./firebase-admin");
const { ApiError, hashValue, logEvent } = require("./http");

const VALID_SUBJECTS = new Set(["hardware", "electrical"]);
const VALID_DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const VALID_QUIZ_TYPES = new Set(["pretest", "posttest", "quiz"]);
const MODULE_XP_REWARD = 5;
const MAX_QUICK_CHECK_SCORE = 30;
const MAX_QUIZ_TOTAL = 60;
const GUEST_FLAG_XP_REWARD = 10;
const MAX_GUEST_TRANSFER_XP = 80;
const XP_RULES = {
  pretest: 1,
  posttest: 1,
  quiz: 2
};

function getWeekKey(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const day = Math.floor((date - start) / 86400000) + 1;
  return `${date.getUTCFullYear()}-W${Math.ceil(day / 7).toString().padStart(2, "0")}`;
}

function sanitizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return (text || fallback).slice(0, 500);
}

function sanitizeProfileName(value) {
  return sanitizeText(value, "User").slice(0, 80);
}

function sanitizeEventId(value) {
  const eventId = String(value || "").trim();
  if (!/^[a-zA-Z0-9:_-]{8,160}$/.test(eventId)) {
    throw new ApiError("invalid_request", "Invalid gamification event identifier.", 400);
  }
  return eventId;
}

function assertSubjectDifficulty(subject, difficulty) {
  if (!VALID_SUBJECTS.has(subject) || !VALID_DIFFICULTIES.has(difficulty)) {
    throw new ApiError("invalid_request", "Invalid gamification subject or difficulty.", 400);
  }
}

function normalizeModuleNumber(value) {
  const moduleNumber = Number(value);
  if (!Number.isInteger(moduleNumber) || moduleNumber < 1 || moduleNumber > 25) {
    throw new ApiError("invalid_request", "Invalid module number.", 400);
  }
  return moduleNumber;
}

function moduleDoneKey(subject, difficulty, moduleNumber) {
  return `${subject}_${difficulty}_module_${moduleNumber}_done`;
}

function deriveQuizXp(type, score, xpAwardedQuestionIds = []) {
  const reward = XP_RULES[type] || XP_RULES.quiz;
  if (type === "pretest" || type === "posttest") {
    return Math.max(0, score) * reward;
  }
  const uniqueQuestionCount = Array.isArray(xpAwardedQuestionIds)
    ? new Set(xpAwardedQuestionIds.map((item) => sanitizeText(item, "").slice(0, 120)).filter(Boolean)).size
    : 0;
  const eligibleCorrect = uniqueQuestionCount > 0 ? Math.min(uniqueQuestionCount, score) : score;
  return Math.max(0, eligibleCorrect) * reward;
}

function normalizeQuizPayload(data = {}) {
  const subject = String(data.subject || "").toLowerCase();
  const type = String(data.type || "").toLowerCase();
  const difficulty = String(data.difficulty || data.level || "").toLowerCase();
  const score = Math.max(0, Number(data.score || 0));
  const total = Math.max(1, Number(data.total || 1));

  if (!VALID_SUBJECTS.has(subject) || !VALID_QUIZ_TYPES.has(type)) {
    throw new ApiError("invalid_request", "Invalid quiz result.", 400);
  }
  if (type === "quiz" && !VALID_DIFFICULTIES.has(difficulty)) {
    throw new ApiError("invalid_request", "Invalid quiz difficulty.", 400);
  }
  if (!Number.isFinite(score) || !Number.isFinite(total) || score > total || total > MAX_QUIZ_TOTAL) {
    throw new ApiError("invalid_request", "Invalid quiz score.", 400);
  }

  const rawLevel = Number(data.levelNumber || data.quizLevel || 1);
  const level = type === "quiz" && Number.isInteger(rawLevel)
    ? Math.max(1, Math.min(25, rawLevel))
    : 1;
  const resultKey = type === "quiz"
    ? `${subject}_${difficulty}_quiz_level_${level}_result`
    : `${subject}_${type}`;
  const completionKey = type === "quiz"
    ? `${subject}_${difficulty}_quiz_level_${level}_done`
    : `${subject}_${type}`;
  const answerItems = Array.isArray(data.answerItems)
    ? data.answerItems.slice(0, MAX_QUIZ_TOTAL).map((item) => ({
      id: sanitizeText(item?.id || item?.questionId || "", "").slice(0, 120),
      question: sanitizeText(item?.question || "", "").slice(0, 300),
      selectedAnswer: sanitizeText(item?.selectedAnswer || item?.selected || "", "").slice(0, 180),
      correctAnswer: sanitizeText(item?.correctAnswer || item?.answer || "", "").slice(0, 180),
      isCorrect: item?.isCorrect === true,
      answeredAt: sanitizeText(item?.answeredAt || new Date().toISOString(), "").slice(0, 40)
    }))
    : [];
  const xpAwardedQuestionIds = Array.isArray(data.xpAwardedQuestionIds)
    ? Array.from(new Set(data.xpAwardedQuestionIds.map((item) => sanitizeText(item, "").slice(0, 120)).filter(Boolean))).slice(0, MAX_QUIZ_TOTAL)
    : [];
  const xpAwarded = deriveQuizXp(type, score, xpAwardedQuestionIds);
  const percent = Math.max(0, Math.min(100, Math.round((score / total) * 100)));

  return {
    subject,
    type,
    difficulty,
    level,
    resultKey,
    completionKey,
    xpAwarded,
    result: {
      subject,
      type,
      level: type === "quiz" ? String(level) : String(data.level || ""),
      score,
      total,
      percent,
      xpEarned: xpAwarded,
      answerItems,
      xpAwardedQuestionIds,
      completedAt: new Date().toISOString()
    }
  };
}

function getAssessmentXP(type, result = null) {
  if (type === "pretest" || type === "posttest") {
    return Math.max(0, Number(result?.score || 0) || 0) * (XP_RULES[type] || 0);
  }
  return 0;
}

function computeSystemXP(progress = {}, results = {}) {
  const moduleXP = Object.entries(progress).reduce((sum, [key, value]) => {
    if (!/^(hardware|electrical)_(easy|medium|hard)_module_\d+_done_xp_awarded$/.test(key)) return sum;
    return value === true ? sum + MODULE_XP_REWARD : sum;
  }, 0);
  const quickCheckXP = Object.entries(progress).reduce((sum, [key, value]) => {
    if (!/^(hardware|electrical)_(easy|medium|hard)_module_\d+_done_quick_check_best_score$/.test(key)) return sum;
    return sum + Math.max(0, Number(value || 0));
  }, 0);
  const quizXP = Object.entries(results).reduce((sum, [key, value]) => {
    if (/^(hardware|electrical)_(easy|medium|hard)_quiz_level_\d+_result$/.test(key)) {
      return sum + Math.max(0, Number(value?.xpEarned || value?.earnedXP || 0));
    }
    if (/^(hardware|electrical)_(pretest|posttest)$/.test(key)) {
      return sum + getAssessmentXP(value?.type, value);
    }
    return sum;
  }, 0);
  return moduleXP + quickCheckXP + quizXP;
}

function buildGamificationMutation(action, data = {}, currentData = {}) {
  const progress = { ...(currentData.progress || {}) };
  const results = { ...(currentData.results || {}) };
  let xpDelta = 0;
  let xpChange = 0;
  let eventSummary = {};

  if (action === "mark_module_progress") {
    const subject = String(data.subject || "").toLowerCase();
    const difficulty = String(data.difficulty || "").toLowerCase();
    const moduleNumber = normalizeModuleNumber(data.moduleNumber);
    const marker = String(data.marker || "");
    assertSubjectDifficulty(subject, difficulty);
    const baseKey = moduleDoneKey(subject, difficulty, moduleNumber);
    const markerMap = {
      read_bottom: `${baseKey}_read_bottom`,
      quick_check_attempted: `${baseKey}_quick_check_attempted`,
      matching_activity_done: `${baseKey}_matching_activity_done`,
      drag_drop_activity_done: `${baseKey}_drag_drop_activity_done`,
      module_done: baseKey
    };
    const key = markerMap[marker];
    if (!key) throw new ApiError("invalid_request", "Invalid module progress marker.", 400);
    progress[key] = true;
    eventSummary = { subject, difficulty, moduleNumber, marker, progressKey: key };
  } else if (action === "award_module_xp") {
    const subject = String(data.subject || "").toLowerCase();
    const difficulty = String(data.difficulty || "").toLowerCase();
    const moduleNumber = normalizeModuleNumber(data.moduleNumber);
    assertSubjectDifficulty(subject, difficulty);
    const doneKey = moduleDoneKey(subject, difficulty, moduleNumber);
    const xpKey = `${doneKey}_xp_awarded`;
    progress[doneKey] = true;
    if (progress[xpKey] !== true) {
      progress[xpKey] = true;
      xpDelta = MODULE_XP_REWARD;
      xpChange = MODULE_XP_REWARD;
    }
    eventSummary = { subject, difficulty, moduleNumber, progressKey: xpKey, xpDelta };
  } else if (action === "award_quick_check_xp") {
    const subject = String(data.subject || "").toLowerCase();
    const difficulty = String(data.difficulty || "").toLowerCase();
    const moduleNumber = normalizeModuleNumber(data.moduleNumber);
    const score = Math.max(0, Math.min(MAX_QUICK_CHECK_SCORE, Number(data.score || 0)));
    assertSubjectDifficulty(subject, difficulty);
    const key = `${moduleDoneKey(subject, difficulty, moduleNumber)}_quick_check_best_score`;
    const previousBest = Math.max(0, Number(progress[key] || 0));
    if (score > previousBest) {
      progress[key] = score;
      xpDelta = score - previousBest;
      xpChange = xpDelta;
    }
    eventSummary = { subject, difficulty, moduleNumber, score, previousBest, xpDelta };
  } else if (action === "record_quiz_result") {
    const normalized = normalizeQuizPayload(data);
    progress[normalized.completionKey] = true;
    if (normalized.type === "quiz") {
      progress[`${normalized.subject}_${normalized.difficulty}_quiz`] = true;
      progress[`${normalized.subject}_quiz`] = true;
    }
    const xpKey = normalized.type === "quiz"
      ? `${normalized.completionKey}_xp_awarded`
      : `${normalized.subject}_${normalized.type}_xp_awarded`;
    const previousAward = Math.max(0, Number(progress[xpKey] || 0));
    if (normalized.xpAwarded > previousAward) {
      xpDelta = normalized.xpAwarded - previousAward;
      xpChange = xpDelta;
      progress[xpKey] = normalized.xpAwarded;
    }
    results[normalized.resultKey] = normalized.result;
    eventSummary = {
      subject: normalized.subject,
      type: normalized.type,
      difficulty: normalized.difficulty,
      level: normalized.level,
      resultKey: normalized.resultKey,
      xpDelta,
      clientXpIgnored: data.xpAwarded !== undefined || data.xp !== undefined
    };
  } else if (action === "import_guest_progress") {
    const allowedFlags = [
      "hardware_pretest",
      "hardware_modules",
      "hardware_quiz",
      "hardware_posttest",
      "electrical_pretest",
      "electrical_modules",
      "electrical_quiz",
      "electrical_posttest"
    ];
    const flags = data.progress && typeof data.progress === "object" ? data.progress : {};
    const importedFlags = [];
    allowedFlags.forEach((key) => {
      if (flags[key] === true) {
        progress[key] = true;
        importedFlags.push(key);
      }
    });
    xpDelta = Math.min(MAX_GUEST_TRANSFER_XP, importedFlags.length * GUEST_FLAG_XP_REWARD);
    xpChange = xpDelta;
    eventSummary = {
      xpDelta,
      importedFlags,
      clientXpIgnored: data.xp !== undefined || data.xpAwarded !== undefined
    };
  } else if (action === "reset_all_progress") {
    xpDelta = -Math.max(0, Number(currentData.xp || 0));
    xpChange = 0;
    Object.keys(progress).forEach((key) => {
      delete progress[key];
    });
    Object.keys(results).forEach((key) => {
      delete results[key];
    });
    eventSummary = { reset: "all" };
  } else if (action === "reset_subject_progress") {
    const subject = String(data.subject || "").toLowerCase();
    if (!VALID_SUBJECTS.has(subject)) {
      throw new ApiError("invalid_request", "Invalid subject reset request.", 400);
    }
    const nextProgress = Object.fromEntries(
      Object.entries(progress).filter(([key]) => !key.startsWith(`${subject}_`))
    );
    const nextResults = Object.fromEntries(
      Object.entries(results).filter(([key]) => !key.startsWith(`${subject}_`))
    );
    const nextXP = computeSystemXP(nextProgress, nextResults);
    xpDelta = nextXP - Math.max(0, Number(currentData.xp || 0));
    xpChange = 0;
    Object.keys(progress).forEach((key) => delete progress[key]);
    Object.entries(nextProgress).forEach(([key, value]) => {
      progress[key] = value;
    });
    Object.keys(results).forEach((key) => delete results[key]);
    Object.entries(nextResults).forEach(([key, value]) => {
      results[key] = value;
    });
    eventSummary = { reset: "subject", subject };
  } else {
    throw new ApiError("invalid_request", "Unsupported gamification action.", 400);
  }

  return { progress, results, xpDelta, xpChange, eventSummary };
}

async function recordGamificationEvent({ uid, token, payload, requestId, endpoint }) {
  const db = adminDb();
  const action = String(payload?.action || "").trim();
  const eventId = sanitizeEventId(payload?.eventId);
  const userRef = db.collection("users").doc(uid);
  const eventRef = userRef.collection("gamificationEvents").doc(eventId);
  const leaderboardRef = db.collection("leaderboard_public").doc(uid);
  const currentWeek = getWeekKey();
  let response = null;
  let duplicateEvent = false;

  await db.runTransaction(async (transaction) => {
    const [eventSnap, userSnap] = await Promise.all([
      transaction.get(eventRef),
      transaction.get(userRef)
    ]);

    if (eventSnap.exists) {
      duplicateEvent = true;
      response = {
        ...(eventSnap.data()?.response || {}),
        duplicate: true
      };
      return;
    }

    const currentData = userSnap.exists ? (userSnap.data() || {}) : {};
    const mutation = buildGamificationMutation(action, payload || {}, currentData);
    const previousXP = Math.max(0, Number(currentData.xp || 0));
    const previousWeeklyXP = currentData.lastWeeklyReset === currentWeek
      ? Math.max(0, Number(currentData.xpWeekly || 0))
      : 0;
    const nextXP = Math.max(0, previousXP + mutation.xpDelta);
    const nextWeeklyXP = Math.max(0, previousWeeklyXP + mutation.xpDelta);
    const name = sanitizeProfileName(currentData.name || token?.name || token?.email || "User");
    const photo = sanitizeText(currentData.photo || token?.picture || "https://i.pravatar.cc/40?img=12");
    const userPayload = {
      email: currentData.email || token?.email || "",
      name,
      photo,
      xp: nextXP,
      xpWeekly: nextWeeklyXP,
      xpChange: mutation.xpChange || Math.max(0, Number(currentData.xpChange || 0)),
      lastWeeklyReset: currentWeek,
      progress: mutation.progress,
      results: mutation.results,
      updatedAt: FieldValue.serverTimestamp()
    };

    if (!userSnap.exists) {
      userPayload.role = "user";
      userPayload.status = "active";
      userPayload.createdAt = FieldValue.serverTimestamp();
    }

    response = {
      action,
      eventId,
      duplicate: false,
      xpDelta: mutation.xpDelta,
      xp: nextXP,
      xpWeekly: nextWeeklyXP,
      xpChange: userPayload.xpChange,
      progress: mutation.progress,
      results: mutation.results,
      summary: mutation.eventSummary
    };

    transaction.set(userRef, userPayload, { merge: true });
    transaction.set(leaderboardRef, {
      name,
      photo,
      xp: nextXP,
      xpWeekly: nextWeeklyXP,
      xpChange: userPayload.xpChange,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    transaction.set(eventRef, {
      action,
      eventId,
      requestHash: hashValue(JSON.stringify(payload || {})),
      response,
      createdAt: FieldValue.serverTimestamp(),
      expiresAtMs: Date.now() + (30 * 24 * 60 * 60 * 1000)
    });
  });

  logEvent("info", "gamification_mutation_succeeded", {
    requestId,
    endpoint,
    userId: hashValue(uid),
    operation: action,
    result: duplicateEvent ? "duplicate" : "success",
    xpDelta: response?.xpDelta || 0
  });

  return response;
}

module.exports = {
  buildGamificationMutation,
  computeSystemXP,
  deriveQuizXp,
  getWeekKey,
  recordGamificationEvent,
  sanitizeEventId
};
