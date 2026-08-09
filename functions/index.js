const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const crypto = require("crypto");

initializeApp();

const PRIVILEGED_ROLES = new Set(["admin", "super_admin"]);
const ADMIN_EMAILS = new Set([
  "marvicdatulmansibang@gmail.com",
  "biancadenisemedel@gmail.com",
  "reinbarb27@gmail.com"
]);
const SUPER_ADMIN_EMAILS = new Set([
  "charlesvrobeso@gmail.com"
]);
const QR_LOGIN_TTL_MS = 5 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_TTL_MS = 60 * 60 * 1000;
const RATE_LIMITS = {
  createQrLoginRequest: { limit: 12, windowMs: RATE_LIMIT_WINDOW_MS },
  approveQrLoginRequest: { limit: 20, windowMs: RATE_LIMIT_WINDOW_MS },
  exchangeQrLoginRequest: { limit: 30, windowMs: RATE_LIMIT_WINDOW_MS },
  resetOwnMfaEnrollment: { limit: 5, windowMs: 10 * RATE_LIMIT_WINDOW_MS },
  recordGamificationEvent: { limit: 180, windowMs: RATE_LIMIT_WINDOW_MS }
};
const VALID_SUBJECTS = new Set(["hardware", "electrical"]);
const VALID_DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const VALID_QUIZ_TYPES = new Set(["pretest", "posttest", "quiz"]);
const MODULE_XP_REWARD = 5;
const MAX_QUICK_CHECK_SCORE = 30;
const MAX_QUIZ_TOTAL = 60;
const MAX_GUEST_TRANSFER_XP = 2000;
const XP_RULES = {
  pretest: 1,
  posttest: 4,
  quiz: 6
};

function logger(level, event, fields = {}) {
  const safeFields = Object.fromEntries(
    Object.entries(fields || {}).filter(([, value]) => value !== undefined)
  );

  console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...safeFields
  }));
}

function safeError(error) {
  return {
    code: error?.code || "internal",
    message: String(error?.message || "Unexpected error").slice(0, 180)
  };
}

function hashRateLimitKey(value) {
  return crypto.createHash("sha256").update(String(value || "unknown")).digest("hex").slice(0, 32);
}

function getClientIp(request) {
  const forwardedFor = String(request.rawRequest?.headers?.["x-forwarded-for"] || "");
  return forwardedFor.split(",")[0].trim() || request.rawRequest?.ip || "unknown";
}

async function assertRateLimit(event, subject, options = {}) {
  const config = RATE_LIMITS[event] || { limit: 30, windowMs: RATE_LIMIT_WINDOW_MS };
  const db = getFirestore();
  const bucket = Math.floor(Date.now() / config.windowMs);
  const subjectHash = hashRateLimitKey(subject);
  const ref = db.collection("rateLimits").doc(`${event}_${subjectHash}_${bucket}`);

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const count = snap.exists ? Number(snap.data()?.count || 0) : 0;
    if (count >= config.limit) {
      throw new HttpsError("resource-exhausted", "Too many attempts. Please wait and try again.");
    }

    transaction.set(ref, {
      event,
      subjectHash,
      count: count + 1,
      windowMs: config.windowMs,
      updatedAt: FieldValue.serverTimestamp(),
      expiresAtMs: Date.now() + (options.ttlMs || RATE_LIMIT_TTL_MS)
    }, { merge: true });
  });
}

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
    throw new HttpsError("invalid-argument", "Invalid gamification event identifier.");
  }
  return eventId;
}

function assertSubjectDifficulty(subject, difficulty) {
  if (!VALID_SUBJECTS.has(subject) || !VALID_DIFFICULTIES.has(difficulty)) {
    throw new HttpsError("invalid-argument", "Invalid gamification subject or difficulty.");
  }
}

function normalizeModuleNumber(value) {
  const moduleNumber = Number(value);
  if (!Number.isInteger(moduleNumber) || moduleNumber < 1 || moduleNumber > 25) {
    throw new HttpsError("invalid-argument", "Invalid module number.");
  }
  return moduleNumber;
}

function moduleDoneKey(subject, difficulty, moduleNumber) {
  return `${subject}_${difficulty}_module_${moduleNumber}_done`;
}

function normalizeQuizPayload(data = {}) {
  const subject = String(data.subject || "").toLowerCase();
  const type = String(data.type || "").toLowerCase();
  const difficulty = String(data.difficulty || data.level || "").toLowerCase();
  const score = Math.max(0, Number(data.score || 0));
  const total = Math.max(1, Number(data.total || 1));

  if (!VALID_SUBJECTS.has(subject) || !VALID_QUIZ_TYPES.has(type)) {
    throw new HttpsError("invalid-argument", "Invalid quiz result.");
  }
  if (type === "quiz" && !VALID_DIFFICULTIES.has(difficulty)) {
    throw new HttpsError("invalid-argument", "Invalid quiz difficulty.");
  }
  if (!Number.isFinite(score) || !Number.isFinite(total) || score > total || total > MAX_QUIZ_TOTAL) {
    throw new HttpsError("invalid-argument", "Invalid quiz score.");
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
  const xpAwarded = Math.min(
    Math.max(0, Number(data.xpAwarded || 0)),
    score * (XP_RULES[type] || XP_RULES.quiz)
  );
  const percent = Math.max(0, Math.min(100, Math.round((score / total) * 100)));
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
    if (!key) throw new HttpsError("invalid-argument", "Invalid module progress marker.");
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
      xpDelta
    };
  } else if (action === "import_guest_progress") {
    const requestedXP = Math.max(0, Math.min(MAX_GUEST_TRANSFER_XP, Number(data.xp || 0)));
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
    allowedFlags.forEach((key) => {
      if (flags[key] === true) {
        progress[key] = true;
      }
    });
    xpDelta = requestedXP;
    xpChange = requestedXP;
    eventSummary = {
      xpDelta,
      importedFlags: allowedFlags.filter((key) => flags[key] === true)
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
      throw new HttpsError("invalid-argument", "Invalid subject reset request.");
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
    throw new HttpsError("invalid-argument", "Unsupported gamification action.");
  }

  return { progress, results, xpDelta, xpChange, eventSummary };
}

function hashQrSecret(secret) {
  return crypto.createHash("sha256").update(String(secret || "")).digest("hex");
}

function assertQrRequestIsFresh(data = {}) {
  if (Number(data.expiresAtMs || 0) <= Date.now()) {
    throw new HttpsError("deadline-exceeded", "This QR login request expired. Generate a new QR code.");
  }
}

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase();
}

function roleFromClaims(claims = {}) {
  if (claims.role === "super_admin" || claims.super_admin === true) return "super_admin";
  if (claims.role === "admin" || claims.admin === true) return "admin";
  return "";
}

function privilegedRoleFromUserDoc(data = {}) {
  const directRole = normalizeRole(data.role);
  if (PRIVILEGED_ROLES.has(directRole)) return directRole;
  if (data.isSuperAdmin === true || data.super_admin === true) return "super_admin";
  if (data.isAdmin === true || data.admin === true) return "admin";
  return "";
}

async function resolvePrivilegedRole(uid, authUser) {
  const claimRole = roleFromClaims(authUser.customClaims || {});
  if (claimRole) return claimRole;

  const db = getFirestore();
  const email = String(authUser.email || "").trim().toLowerCase();

  if (email) {
    const accessDoc = await db.collection("accessRoles").doc(encodeURIComponent(email)).get();
    if (accessDoc.exists) {
      const accessRole = normalizeRole(accessDoc.data()?.role);
      if (PRIVILEGED_ROLES.has(accessRole)) return accessRole;
      if (accessRole === "user") return "";
    }
  }

  const userDoc = await db.collection("users").doc(uid).get();
  if (userDoc.exists) {
    const userRole = privilegedRoleFromUserDoc(userDoc.data() || {});
    if (userRole) return userRole;
  }

  if (SUPER_ADMIN_EMAILS.has(email)) return "super_admin";
  if (ADMIN_EMAILS.has(email)) return "admin";
  return "";
}

exports.resetOwnMfaEnrollment = onCall({
  region: "us-central1",
  enforceAppCheck: false,
  invoker: "public"
}, async (request) => {
  const startedAt = Date.now();
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in before resetting 2FA.");
  }

  const uid = request.auth.uid;
  await assertRateLimit("resetOwnMfaEnrollment", uid);
  const auth = getAuth();
  const db = getFirestore();
  const authUser = await auth.getUser(uid);
  const role = await resolvePrivilegedRole(uid, authUser);

  if (!PRIVILEGED_ROLES.has(role)) {
    logger("warn", "mfa_reset_denied", {
      requestId: request.rawRequest?.headers?.["x-cloud-trace-context"] || "",
      userId: hashRateLimitKey(uid),
      role,
      latencyMs: Date.now() - startedAt
    });
    throw new HttpsError("permission-denied", "Only admin and super-admin accounts can reset privileged 2FA.");
  }

  const enrolledFactors = authUser.multiFactor?.enrolledFactors || [];

  await auth.updateUser(uid, {
    multiFactor: {
      enrolledFactors: []
    }
  });

  await db.collection("securityProfiles").doc(uid).set({
    uid,
    email: authUser.email || "",
    role,
    firebaseMfaEnrolled: false,
    firebaseMfaProvider: "",
    firebaseMfaSource: "firebase_auth",
    lastVerificationMethod: "firebase_totp_callable_reset",
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  await db.collection("auditLogs").add({
    action: role === "super_admin" ? "reset_own_super_admin_mfa" : "reset_own_admin_mfa",
    details: "Privileged user reset their own Firebase Auth MFA through the app.",
    actorUid: uid,
    actorEmail: authUser.email || "",
    createdAt: FieldValue.serverTimestamp()
  });

  logger("info", "mfa_reset_succeeded", {
    requestId: request.rawRequest?.headers?.["x-cloud-trace-context"] || "",
    userId: hashRateLimitKey(uid),
    role,
    result: "success",
    latencyMs: Date.now() - startedAt
  });

  return {
    uid,
    email: authUser.email || "",
    role,
    removedFactorCount: enrolledFactors.length
  };
});

exports.createQrLoginRequest = onCall({
  region: "us-central1",
  enforceAppCheck: false,
  invoker: "public"
}, async (request) => {
  const startedAt = Date.now();
  await assertRateLimit("createQrLoginRequest", getClientIp(request));
  const db = getFirestore();
  const requestId = crypto.randomUUID();
  const secret = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();

  await db.collection("qrLoginRequests").doc(requestId).set({
    status: "pending",
    secretHash: hashQrSecret(secret),
    createdAt: FieldValue.serverTimestamp(),
    createdAtMs: now,
    expiresAtMs: now + QR_LOGIN_TTL_MS,
    used: false
  });

  logger("info", "qr_login_request_created", {
    requestId,
    endpoint: "createQrLoginRequest",
    result: "success",
    latencyMs: Date.now() - startedAt
  });

  return {
    requestId,
    secret,
    expiresAtMs: now + QR_LOGIN_TTL_MS
  };
});

exports.approveQrLoginRequest = onCall({
  region: "us-central1",
  enforceAppCheck: false,
  invoker: "public"
}, async (request) => {
  const startedAt = Date.now();
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in on this phone before approving QR login.");
  }
  await assertRateLimit("approveQrLoginRequest", request.auth.uid);

  const requestId = String(request.data?.requestId || "").trim();
  const secret = String(request.data?.secret || "").trim();
  if (!requestId || !secret) {
    throw new HttpsError("invalid-argument", "Missing QR login request details.");
  }

  const db = getFirestore();
  const ref = db.collection("qrLoginRequests").doc(requestId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "QR login request was not found.");
  }

  const data = snap.data() || {};
  assertQrRequestIsFresh(data);
  if (data.used || data.status === "exchanged") {
    throw new HttpsError("failed-precondition", "This QR login request was already used.");
  }
  if (data.secretHash !== hashQrSecret(secret)) {
    throw new HttpsError("permission-denied", "This QR login request is not valid.");
  }

  const authUser = await getAuth().getUser(request.auth.uid);
  await ref.set({
    status: "approved",
    approvedUid: request.auth.uid,
    approvedEmail: authUser.email || "",
    approvedName: authUser.displayName || "",
    approvedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  logger("info", "qr_login_request_approved", {
    requestId,
    userId: hashRateLimitKey(request.auth.uid),
    endpoint: "approveQrLoginRequest",
    result: "success",
    latencyMs: Date.now() - startedAt
  });

  return {
    approved: true,
    email: authUser.email || "",
    name: authUser.displayName || ""
  };
});

exports.exchangeQrLoginRequest = onCall({
  region: "us-central1",
  enforceAppCheck: false,
  invoker: "public"
}, async (request) => {
  const startedAt = Date.now();
  await assertRateLimit("exchangeQrLoginRequest", getClientIp(request));
  const requestId = String(request.data?.requestId || "").trim();
  const secret = String(request.data?.secret || "").trim();
  if (!requestId || !secret) {
    throw new HttpsError("invalid-argument", "Missing QR login request details.");
  }

  const auth = getAuth();
  const db = getFirestore();
  const ref = db.collection("qrLoginRequests").doc(requestId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "QR login request was not found.");
  }

  const data = snap.data() || {};
  assertQrRequestIsFresh(data);
  if (data.used || data.status === "exchanged") {
    throw new HttpsError("failed-precondition", "This QR login request was already used.");
  }
  if (data.status !== "approved" || !data.approvedUid) {
    logger("info", "qr_login_exchange_pending", {
      requestId,
      endpoint: "exchangeQrLoginRequest",
      result: "pending",
      latencyMs: Date.now() - startedAt
    });
    return { approved: false };
  }
  if (data.secretHash !== hashQrSecret(secret)) {
    throw new HttpsError("permission-denied", "This QR login request is not valid.");
  }

  const token = await auth.createCustomToken(data.approvedUid, {
    qr_login: true
  });

  await ref.set({
    status: "exchanged",
    used: true,
    exchangedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  logger("info", "qr_login_request_exchanged", {
    requestId,
    userId: hashRateLimitKey(data.approvedUid),
    endpoint: "exchangeQrLoginRequest",
    result: "success",
    latencyMs: Date.now() - startedAt
  });

  return {
    approved: true,
    customToken: token,
    email: data.approvedEmail || "",
    name: data.approvedName || ""
  };
});

exports.recordGamificationEvent = onCall({
  region: "us-central1",
  enforceAppCheck: false,
  invoker: "public"
}, async (request) => {
  const startedAt = Date.now();
  const functionName = "recordGamificationEvent";
  const requestId = request.rawRequest?.headers?.["x-cloud-trace-context"] || "";

  if (!request.auth?.uid) {
    logger("warn", "gamification_mutation_denied", {
      requestId,
      function: functionName,
      result: "unauthenticated",
      latencyMs: Date.now() - startedAt
    });
    throw new HttpsError("unauthenticated", "Sign in before saving progress.");
  }

  const uid = request.auth.uid;
  await assertRateLimit(functionName, uid);

  try {
    const db = getFirestore();
    const action = String(request.data?.action || "").trim();
    const eventId = sanitizeEventId(request.data?.eventId);
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
      const mutation = buildGamificationMutation(action, request.data || {}, currentData);
      const previousXP = Math.max(0, Number(currentData.xp || 0));
      const previousWeeklyXP = currentData.lastWeeklyReset === currentWeek
        ? Math.max(0, Number(currentData.xpWeekly || 0))
        : 0;
      const nextXP = Math.max(0, previousXP + mutation.xpDelta);
      const nextWeeklyXP = Math.max(0, previousWeeklyXP + mutation.xpDelta);
      const name = sanitizeProfileName(currentData.name || request.auth.token?.name || request.auth.token?.email || "User");
      const photo = sanitizeText(currentData.photo || request.auth.token?.picture || "https://i.pravatar.cc/40?img=12");
      const userPayload = {
        email: currentData.email || request.auth.token?.email || "",
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
        requestHash: hashRateLimitKey(JSON.stringify(request.data || {})),
        response,
        createdAt: FieldValue.serverTimestamp(),
        expiresAtMs: Date.now() + (30 * 24 * 60 * 60 * 1000)
      });
    });

    logger("info", "gamification_mutation_succeeded", {
      requestId,
      function: functionName,
      userId: hashRateLimitKey(uid),
      operation: action,
      result: duplicateEvent ? "duplicate" : "success",
      xpDelta: response.xpDelta || 0,
      latencyMs: Date.now() - startedAt
    });

    return response;
  } catch (error) {
    logger(error instanceof HttpsError ? "warn" : "error", "gamification_mutation_failed", {
      requestId,
      function: functionName,
      userId: hashRateLimitKey(uid),
      result: "failed",
      error: safeError(error),
      latencyMs: Date.now() - startedAt
    });

    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Unable to save progress right now.");
  }
});
