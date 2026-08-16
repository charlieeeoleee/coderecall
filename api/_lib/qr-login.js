const crypto = require("crypto");
const { adminAuth, adminDb, FieldValue } = require("./firebase-admin");
const { ApiError, hashValue, logEvent } = require("./http");

const QR_PROTOCOL_VERSION = 2;
const QR_LOGIN_TTL_MS = 3 * 60 * 1000;
const MATCHING_WINDOW_MS = 60 * 1000;
const TERMINAL_STATUSES = new Set(["denied", "cancelled", "expired", "exchanged", "exchange_failed"]);
const SAFE_TERMINAL_REASONS = new Set(["matching_failed", "user_denied", "desktop_cancelled", "ttl_expired", "matching_window_expired", "token_mint_failed"]);

function safeTerminalReason(value) {
  const reason = String(value || "");
  return SAFE_TERMINAL_REASONS.has(reason) ? reason : "";
}

function hashQrSecret(secret) {
  return crypto.createHash("sha256").update(String(secret || "")).digest("hex");
}

function qrSecretMatches(storedHash, secret) {
  const expected = Buffer.from(String(storedHash || ""), "utf8");
  const actual = Buffer.from(hashQrSecret(secret), "utf8");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function hmacVerifier(capability, purpose, requestId, value) {
  return crypto.createHmac("sha256", String(capability || ""))
    .update(`${purpose}:${requestId}:${value}:v1`)
    .digest("hex");
}

function verifierMatches(storedVerifier, capability, purpose, requestId, value) {
  const expected = Buffer.from(String(storedVerifier || ""), "utf8");
  const actual = Buffer.from(hmacVerifier(capability, purpose, requestId, value), "utf8");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function readQrPayload(payload = {}) {
  const requestId = String(payload.requestId || "").trim();
  const secret = String(payload.secret || "").trim();
  if (!/^[a-f0-9-]{20,80}$/i.test(requestId) || secret.length < 24 || secret.length > 128) {
    throw new ApiError("invalid_request", "Missing QR login request details.", 400);
  }
  return { requestId, secret };
}

function readCancelPayload(payload = {}) {
  const requestId = String(payload.requestId || "").trim();
  const cancelCapability = String(payload.cancelCapability || "").trim();
  if (!/^[a-f0-9-]{20,80}$/i.test(requestId) || cancelCapability.length < 24 || cancelCapability.length > 128) {
    throw new ApiError("invalid_request", "Missing QR cancellation details.", 400);
  }
  return { requestId, cancelCapability };
}

function normalizeRequestContext(userAgent = "") {
  const ua = String(userAgent || "");
  let browserCategory = "Other";
  if (/Edg\//i.test(ua)) browserCategory = "Edge";
  else if (/(Chrome|CriOS)\//i.test(ua)) browserCategory = "Chrome";
  else if (/(Firefox|FxiOS)\//i.test(ua)) browserCategory = "Firefox";
  else if (/Safari\//i.test(ua) && !/(Chrome|CriOS|Chromium|Edg)\//i.test(ua)) browserCategory = "Safari";

  let osCategory = "Other";
  if (/Windows/i.test(ua)) osCategory = "Windows";
  else if (/(iPhone|iPad|iPod)/i.test(ua)) osCategory = "iOS";
  else if (/Android/i.test(ua)) osCategory = "Android";
  else if (/(Macintosh|Mac OS X)/i.test(ua)) osCategory = "macOS";
  else if (/Linux/i.test(ua)) osCategory = "Linux";
  return { browserCategory, osCategory };
}

function logQrRejection(event, context, requestId, result, uid = "") {
  logEvent("warn", event, {
    requestId: context.requestId,
    qrRequestId: requestId,
    ...(uid ? { userId: hashValue(uid) } : {}),
    endpoint: context.endpoint,
    result
  });
}

function throwOutcome(outcome, messages = {}) {
  if (outcome === "not_found") throw new ApiError("not_found", "QR login request was not found.", 404);
  if (outcome === "expired" || outcome === "matching_expired") {
    throw new ApiError("conflict", messages.expired || "This QR login request expired. Generate a new QR code.", 409);
  }
  if (outcome === "invalid_secret" || outcome === "invalid_cancel") {
    throw new ApiError("permission_denied", "This QR login request is not valid.", 403);
  }
  if (outcome === "wrong_user") throw new ApiError("permission_denied", "This QR request is bound to a different account.", 403);
  throw new ApiError("conflict", messages.conflict || "This QR login request can no longer be changed.", 409);
}

async function createQrLoginRequest(context = {}) {
  const db = adminDb();
  const requestId = crypto.randomUUID();
  const secret = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  const protocolVersion = Number(context.protocolVersion) >= QR_PROTOCOL_VERSION ? QR_PROTOCOL_VERSION : 1;
  const ttlMs = protocolVersion >= 2 ? QR_LOGIN_TTL_MS : 5 * 60 * 1000;
  const requestContext = normalizeRequestContext(context.userAgent);
  const requestData = {
    protocolVersion,
    status: "pending",
    secretHash: hashQrSecret(secret),
    browserCategory: requestContext.browserCategory,
    osCategory: requestContext.osCategory,
    createdAt: FieldValue.serverTimestamp(),
    createdAtMs: now,
    expiresAtMs: now + ttlMs,
    used: false
  };
  let cancelCapability;
  let matchingCode;
  if (protocolVersion >= 2) {
    cancelCapability = crypto.randomBytes(32).toString("base64url");
    matchingCode = crypto.randomInt(0, 1000).toString().padStart(3, "0");
    Object.assign(requestData, {
      cancelCapabilityVerifier: hmacVerifier(cancelCapability, "cancel", requestId, "cancel"),
      matchingVerifier: hmacVerifier(secret, "match", requestId, matchingCode),
      matchingVerifierVersion: "hmac-sha256-capability-v1",
      matchingAttemptCount: 0
    });
  }

  await db.collection("qrLoginRequests").doc(requestId).set(requestData);

  logEvent("info", "qr_login_request_created", {
    requestId: context.requestId,
    qrRequestId: requestId,
    endpoint: context.endpoint,
    browserCategory: requestContext.browserCategory,
    osCategory: requestContext.osCategory,
    result: "success"
  });

  const response = {
    requestId,
    secret,
    protocolVersion,
    expiresAtMs: now + ttlMs
  };
  if (protocolVersion >= 2) Object.assign(response, { cancelCapability, matchingCode });
  return response;
}

async function getQrLoginContext({ payload, uid, context = {} }) {
  const { requestId, secret } = readQrPayload(payload);
  const db = adminDb();
  const ref = db.collection("qrLoginRequests").doc(requestId);
  const outcome = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return { result: "not_found" };
    const data = snap.data() || {};
    if (!qrSecretMatches(data.secretHash, secret)) return { result: "invalid_secret" };
    if (Number(data.expiresAtMs || 0) <= Date.now() && !TERMINAL_STATUSES.has(data.status)) {
      transaction.set(ref, { status: "expired", expiredAt: FieldValue.serverTimestamp(), terminalReason: "ttl_expired" }, { merge: true });
      return { result: "expired" };
    }
    return { result: "ok", data };
  });
  if (outcome.result !== "ok") {
    logQrRejection("qr_login_context_rejected", context, requestId, outcome.result, uid);
    throwOutcome(outcome.result);
  }
  const data = outcome.data;
  logEvent("info", "qr_login_context_viewed", {
    requestId: context.requestId,
    qrRequestId: requestId,
    userId: hashValue(uid),
    endpoint: context.endpoint,
    result: "success"
  });
  return {
    status: data.status,
    terminalReason: safeTerminalReason(data.terminalReason),
    protocolVersion: Number(data.protocolVersion || 1),
    browserCategory: data.browserCategory || "Other",
    osCategory: data.osCategory || "Other",
    requestedAtMs: Number(data.createdAtMs || 0),
    expiresAtMs: Number(data.expiresAtMs || 0),
    matchingRequired: Number(data.protocolVersion || 1) >= 2,
    matchingVerified: data.status === "matching_verified",
    matchedToCurrentUser: data.status === "matching_verified" && data.matchingVerifiedUid === uid
  };
}

async function matchQrLoginRequest({ uid, role = "", payload, context = {} }) {
  const { requestId, secret } = readQrPayload(payload);
  const matchingCode = String(payload?.matchingCode || "");
  if (!/^\d{3}$/.test(matchingCode)) throw new ApiError("invalid_request", "Enter the three-digit matching code.", 400);
  if (role === "admin" || role === "super_admin") {
    logQrRejection("qr_login_match_rejected", context, requestId, "privileged_account", uid);
    throw new ApiError("permission_denied", "Privileged accounts must use the standard sign-in and MFA flow.", 403);
  }
  const db = adminDb();
  const ref = db.collection("qrLoginRequests").doc(requestId);
  const now = Date.now();
  const outcome = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return { result: "not_found" };
    const data = snap.data() || {};
    if (!qrSecretMatches(data.secretHash, secret)) return { result: "invalid_secret" };
    if (Number(data.expiresAtMs || 0) <= now) {
      if (!TERMINAL_STATUSES.has(data.status)) transaction.set(ref, { status: "expired", expiredAt: FieldValue.serverTimestamp(), terminalReason: "ttl_expired" }, { merge: true });
      return { result: "expired" };
    }
    if (Number(data.protocolVersion || 1) < 2 || data.status !== "pending" || data.used) return { result: "conflict" };
    const correct = verifierMatches(data.matchingVerifier, secret, "match", requestId, matchingCode);
    if (!correct) {
      transaction.set(ref, {
        status: "denied",
        matchingAttemptCount: Number(data.matchingAttemptCount || 0) + 1,
        deniedAt: FieldValue.serverTimestamp(),
        deniedUid: uid,
        terminalReason: "matching_failed"
      }, { merge: true });
      return { result: "matching_failed" };
    }
    transaction.set(ref, {
      status: "matching_verified",
      matchingAttemptCount: Number(data.matchingAttemptCount || 0) + 1,
      matchingVerifiedUid: uid,
      matchingVerifiedAt: FieldValue.serverTimestamp(),
      matchingExpiresAtMs: Math.min(Number(data.expiresAtMs), now + MATCHING_WINDOW_MS)
    }, { merge: true });
    return { result: "verified", matchingExpiresAtMs: Math.min(Number(data.expiresAtMs), now + MATCHING_WINDOW_MS) };
  });

  if (outcome.result === "matching_failed") {
    logQrRejection("qr_login_match_failed", context, requestId, "matching_failed", uid);
    throw new ApiError("matching_failed", "The matching code was incorrect. This QR login request was cancelled. Generate a new QR code.", 409);
  }
  if (outcome.result !== "verified") {
    logQrRejection("qr_login_match_rejected", context, requestId, outcome.result, uid);
    throwOutcome(outcome.result);
  }
  logEvent("info", "qr_login_match_verified", {
    requestId: context.requestId,
    qrRequestId: requestId,
    userId: hashValue(uid),
    endpoint: context.endpoint,
    result: "success"
  });
  return { matched: true, status: "matching_verified", matchingExpiresAtMs: outcome.matchingExpiresAtMs };
}

async function approveQrLoginRequest({ uid, token, role = "", payload, context = {} }) {
  const { requestId, secret } = readQrPayload(payload);
  if (role === "admin" || role === "super_admin") {
    logQrRejection("qr_login_privileged_account_denied", context, requestId, "permission_denied", uid);
    throw new ApiError("permission_denied", "Privileged accounts must use the standard sign-in and MFA flow.", 403);
  }
  const db = adminDb();
  const ref = db.collection("qrLoginRequests").doc(requestId);
  const now = Date.now();
  const outcome = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return { result: "not_found" };
    const data = snap.data() || {};
    if (!qrSecretMatches(data.secretHash, secret)) return { result: "invalid_secret" };
    if (Number(data.expiresAtMs || 0) <= now) {
      if (!TERMINAL_STATUSES.has(data.status)) transaction.set(ref, { status: "expired", expiredAt: FieldValue.serverTimestamp(), terminalReason: "ttl_expired" }, { merge: true });
      return { result: "expired" };
    }
    const isV2 = Number(data.protocolVersion || 1) >= 2;
    if (isV2) {
      if (data.status !== "matching_verified" || data.used) return { result: "conflict" };
      if (data.matchingVerifiedUid !== uid) return { result: "wrong_user" };
      if (Number(data.matchingExpiresAtMs || 0) <= now) {
        transaction.set(ref, { status: "expired", expiredAt: FieldValue.serverTimestamp(), terminalReason: "matching_window_expired" }, { merge: true });
        return { result: "matching_expired" };
      }
    } else if (data.status !== "pending" || data.used) {
      return { result: "conflict" };
    }
    transaction.set(ref, {
      status: "approved",
      approvedUid: uid,
      approvedEmail: token.email || "",
      approvedName: token.name || "",
      approvedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return { result: "approved" };
  });
  if (outcome.result !== "approved") {
    logQrRejection(`qr_login_approval_${outcome.result}`, context, requestId, outcome.result, uid);
    throwOutcome(outcome.result, { conflict: "This QR login request was not matched, was already approved, or was already used." });
  }
  logEvent("info", "qr_login_request_approved", {
    requestId: context.requestId, qrRequestId: requestId, userId: hashValue(uid), endpoint: context.endpoint, result: "success"
  });
  return { approved: true, email: token.email || "", name: token.name || "" };
}

async function denyQrLoginRequest({ uid, role = "", payload, context = {} }) {
  const { requestId, secret } = readQrPayload(payload);
  if (role === "admin" || role === "super_admin") {
    logQrRejection("qr_login_deny_rejected", context, requestId, "privileged_account", uid);
    throw new ApiError("permission_denied", "Privileged accounts must use the standard sign-in and MFA flow.", 403);
  }
  const db = adminDb();
  const ref = db.collection("qrLoginRequests").doc(requestId);
  const outcome = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return { result: "not_found" };
    const data = snap.data() || {};
    if (!qrSecretMatches(data.secretHash, secret)) return { result: "invalid_secret" };
    if (Number(data.expiresAtMs || 0) <= Date.now()) {
      if (!TERMINAL_STATUSES.has(data.status)) transaction.set(ref, { status: "expired", expiredAt: FieldValue.serverTimestamp(), terminalReason: "ttl_expired" }, { merge: true });
      return { result: "expired" };
    }
    if (!["pending", "matching_verified"].includes(data.status) || data.used) return { result: "conflict" };
    transaction.set(ref, { status: "denied", deniedAt: FieldValue.serverTimestamp(), deniedUid: uid, terminalReason: "user_denied" }, { merge: true });
    return { result: "denied" };
  });
  if (outcome.result !== "denied") {
    logQrRejection("qr_login_deny_rejected", context, requestId, outcome.result, uid);
    throwOutcome(outcome.result);
  }
  logEvent("info", "qr_login_denied", { requestId: context.requestId, qrRequestId: requestId, userId: hashValue(uid), endpoint: context.endpoint, result: "success" });
  return { denied: true, status: "denied" };
}

async function cancelQrLoginRequest({ payload, context = {} }) {
  const { requestId, cancelCapability } = readCancelPayload(payload);
  const db = adminDb();
  const ref = db.collection("qrLoginRequests").doc(requestId);
  const outcome = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return { result: "not_found" };
    const data = snap.data() || {};
    if (!verifierMatches(data.cancelCapabilityVerifier, cancelCapability, "cancel", requestId, "cancel")) return { result: "invalid_cancel" };
    if (Number(data.expiresAtMs || 0) <= Date.now()) {
      if (!TERMINAL_STATUSES.has(data.status)) transaction.set(ref, { status: "expired", expiredAt: FieldValue.serverTimestamp(), terminalReason: "ttl_expired" }, { merge: true });
      return { result: "expired" };
    }
    if (!["pending", "matching_verified"].includes(data.status) || data.used) return { result: "conflict" };
    transaction.set(ref, { status: "cancelled", cancelledAt: FieldValue.serverTimestamp(), cancelledBy: "desktop", terminalReason: "desktop_cancelled" }, { merge: true });
    return { result: "cancelled" };
  });
  if (outcome.result !== "cancelled") {
    logQrRejection("qr_login_cancel_rejected", context, requestId, outcome.result);
    throwOutcome(outcome.result);
  }
  logEvent("info", "qr_login_cancelled", { requestId: context.requestId, qrRequestId: requestId, endpoint: context.endpoint, result: "success" });
  return { cancelled: true, status: "cancelled" };
}

async function exchangeQrLoginRequest({ payload, context = {} }) {
  const { requestId, secret } = readQrPayload(payload);
  const auth = adminAuth();
  const db = adminDb();
  const ref = db.collection("qrLoginRequests").doc(requestId);
  const claimId = crypto.randomUUID();
  const claim = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return { result: "not_found" };
    const data = snap.data() || {};
    if (!qrSecretMatches(data.secretHash, secret)) return { result: "invalid_secret" };
    if (Number(data.expiresAtMs || 0) <= Date.now() && !TERMINAL_STATUSES.has(data.status)) {
      transaction.set(ref, { status: "expired", expiredAt: FieldValue.serverTimestamp(), terminalReason: "ttl_expired" }, { merge: true });
      return { result: "terminal", status: "expired", terminalReason: "ttl_expired" };
    }
    if (["denied", "cancelled", "expired", "exchange_failed"].includes(data.status)) {
      return { result: "terminal", status: data.status, terminalReason: safeTerminalReason(data.terminalReason) };
    }
    if (data.status === "exchanging") return { result: "waiting", status: "exchanging" };
    if (data.status === "exchanged" || data.used) return { result: "conflict" };
    if (["pending", "matching_verified"].includes(data.status)) return { result: "waiting", status: data.status };
    if (data.status !== "approved" || !data.approvedUid) return { result: "conflict" };
    transaction.set(ref, { status: "exchanging", used: true, exchangeClaimId: claimId, exchangeClaimedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { result: "claimed", approvedUid: data.approvedUid, approvedEmail: data.approvedEmail || "", approvedName: data.approvedName || "" };
  });
  if (claim.result === "waiting") return { approved: false, status: claim.status, terminal: false };
  if (claim.result === "terminal") return { approved: false, status: claim.status, terminal: true, terminalReason: claim.terminalReason };
  if (claim.result !== "claimed") {
    logQrRejection(`qr_login_exchange_${claim.result}`, context, requestId, claim.result);
    throwOutcome(claim.result, { conflict: "This QR login request was already claimed or used." });
  }
  let customToken;
  try {
    customToken = await auth.createCustomToken(claim.approvedUid, { qr_login: true });
    await ref.set({ status: "exchanged", exchangedAt: FieldValue.serverTimestamp() }, { merge: true });
  } catch (error) {
    await ref.set({ status: "exchange_failed", exchangeFailedAt: FieldValue.serverTimestamp(), terminalReason: "token_mint_failed" }, { merge: true });
    logEvent("error", "qr_login_exchange_failed", { requestId: context.requestId, qrRequestId: requestId, userId: hashValue(claim.approvedUid), endpoint: context.endpoint, result: "token_mint_failed" });
    throw new ApiError("temporary_unavailable", "QR login could not be completed. Generate a new QR code.", 503);
  }
  logEvent("info", "qr_login_request_exchanged", { requestId: context.requestId, qrRequestId: requestId, userId: hashValue(claim.approvedUid), endpoint: context.endpoint, result: "success" });
  return { approved: true, status: "exchanged", terminal: true, customToken, email: claim.approvedEmail, name: claim.approvedName };
}

module.exports = {
  MATCHING_WINDOW_MS,
  QR_LOGIN_TTL_MS,
  QR_PROTOCOL_VERSION,
  approveQrLoginRequest,
  cancelQrLoginRequest,
  createQrLoginRequest,
  denyQrLoginRequest,
  exchangeQrLoginRequest,
  getQrLoginContext,
  hashQrSecret,
  hmacVerifier,
  matchQrLoginRequest,
  normalizeRequestContext,
  qrSecretMatches,
  verifierMatches
};
