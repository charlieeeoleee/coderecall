const crypto = require("crypto");
const { adminAuth, adminDb, FieldValue } = require("./firebase-admin");
const { ApiError, hashValue, logEvent } = require("./http");

const QR_LOGIN_TTL_MS = 5 * 60 * 1000;

function hashQrSecret(secret) {
  return crypto.createHash("sha256").update(String(secret || "")).digest("hex");
}

function qrSecretMatches(storedHash, secret) {
  const expected = Buffer.from(String(storedHash || ""), "utf8");
  const actual = Buffer.from(hashQrSecret(secret), "utf8");
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

async function createQrLoginRequest(context = {}) {
  const db = adminDb();
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

  logEvent("info", "qr_login_request_created", {
    requestId: context.requestId,
    qrRequestId: requestId,
    endpoint: context.endpoint,
    result: "success"
  });

  return {
    requestId,
    secret,
    expiresAtMs: now + QR_LOGIN_TTL_MS
  };
}

async function approveQrLoginRequest({ uid, token, role = "", payload, context = {} }) {
  const { requestId, secret } = readQrPayload(payload);
  const db = adminDb();
  const ref = db.collection("qrLoginRequests").doc(requestId);
  if (role === "admin" || role === "super_admin") {
    logEvent("warn", "qr_login_privileged_account_denied", {
      requestId: context.requestId,
      qrRequestId: requestId,
      userId: hashValue(uid),
      endpoint: context.endpoint,
      result: "permission_denied"
    });
    throw new ApiError("permission_denied", "Privileged accounts must use the standard sign-in and MFA flow.", 403);
  }

  const outcome = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return { result: "not_found" };

    const data = snap.data() || {};
    if (Number(data.expiresAtMs || 0) <= Date.now()) {
      transaction.set(ref, {
        status: "expired",
        expiredAt: FieldValue.serverTimestamp()
      }, { merge: true });
      return { result: "expired" };
    }
    if (data.status !== "pending" || data.used) return { result: "conflict" };
    if (!qrSecretMatches(data.secretHash, secret)) return { result: "invalid_secret" };

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
    logEvent("warn", `qr_login_approval_${outcome.result}`, {
      requestId: context.requestId,
      qrRequestId: requestId,
      userId: hashValue(uid),
      endpoint: context.endpoint,
      result: outcome.result
    });
    if (outcome.result === "not_found") throw new ApiError("not_found", "QR login request was not found.", 404);
    if (outcome.result === "expired") throw new ApiError("conflict", "This QR login request expired. Generate a new QR code.", 409);
    if (outcome.result === "invalid_secret") throw new ApiError("permission_denied", "This QR login request is not valid.", 403);
    throw new ApiError("conflict", "This QR login request was already approved or used.", 409);
  }

  logEvent("info", "qr_login_request_approved", {
    requestId: context.requestId,
    qrRequestId: requestId,
    userId: hashValue(uid),
    endpoint: context.endpoint,
    result: "success"
  });

  return {
    approved: true,
    email: token.email || "",
    name: token.name || ""
  };
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
    if (Number(data.expiresAtMs || 0) <= Date.now()) {
      transaction.set(ref, {
        status: "expired",
        expiredAt: FieldValue.serverTimestamp()
      }, { merge: true });
      return { result: "expired" };
    }
    if (data.used || ["exchanging", "exchanged", "exchange_failed"].includes(data.status)) {
      return { result: "conflict" };
    }
    if (!qrSecretMatches(data.secretHash, secret)) return { result: "invalid_secret" };
    if (data.status !== "approved" || !data.approvedUid) return { result: "pending" };

    transaction.set(ref, {
      status: "exchanging",
      used: true,
      exchangeClaimId: claimId,
      exchangeClaimedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return {
      result: "claimed",
      approvedUid: data.approvedUid,
      approvedEmail: data.approvedEmail || "",
      approvedName: data.approvedName || ""
    };
  });

  if (claim.result === "pending") {
    logEvent("info", "qr_login_exchange_pending", {
      requestId: context.requestId,
      qrRequestId: requestId,
      endpoint: context.endpoint,
      result: "pending"
    });
    return { approved: false };
  }
  if (claim.result !== "claimed") {
    logEvent("warn", `qr_login_exchange_${claim.result}`, {
      requestId: context.requestId,
      qrRequestId: requestId,
      endpoint: context.endpoint,
      result: claim.result
    });
    if (claim.result === "not_found") throw new ApiError("not_found", "QR login request was not found.", 404);
    if (claim.result === "expired") throw new ApiError("conflict", "This QR login request expired. Generate a new QR code.", 409);
    if (claim.result === "invalid_secret") throw new ApiError("permission_denied", "This QR login request is not valid.", 403);
    throw new ApiError("conflict", "This QR login request was already claimed or used.", 409);
  }

  let customToken;
  try {
    customToken = await auth.createCustomToken(claim.approvedUid, { qr_login: true });
    await ref.set({
      status: "exchanged",
      exchangedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (error) {
    await ref.set({
      status: "exchange_failed",
      exchangeFailedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    logEvent("error", "qr_login_exchange_failed", {
      requestId: context.requestId,
      qrRequestId: requestId,
      userId: hashValue(claim.approvedUid),
      endpoint: context.endpoint,
      result: "token_mint_failed"
    });
    throw new ApiError("temporary_unavailable", "QR login could not be completed. Generate a new QR code.", 503);
  }

  logEvent("info", "qr_login_request_exchanged", {
    requestId: context.requestId,
    qrRequestId: requestId,
    userId: hashValue(claim.approvedUid),
    endpoint: context.endpoint,
    result: "success"
  });

  return {
    approved: true,
    customToken,
    email: claim.approvedEmail,
    name: claim.approvedName
  };
}

module.exports = {
  approveQrLoginRequest,
  createQrLoginRequest,
  exchangeQrLoginRequest,
  hashQrSecret,
  qrSecretMatches
};
