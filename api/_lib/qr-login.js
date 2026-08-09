const crypto = require("crypto");
const { adminAuth, adminDb, FieldValue } = require("./firebase-admin");
const { ApiError, hashValue, logEvent } = require("./http");

const QR_LOGIN_TTL_MS = 5 * 60 * 1000;

function hashQrSecret(secret) {
  return crypto.createHash("sha256").update(String(secret || "")).digest("hex");
}

function assertQrRequestIsFresh(data = {}) {
  if (Number(data.expiresAtMs || 0) <= Date.now()) {
    throw new ApiError("temporary_unavailable", "This QR login request expired. Generate a new QR code.", 503);
  }
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

async function approveQrLoginRequest({ uid, token, payload, context = {} }) {
  const { requestId, secret } = readQrPayload(payload);
  const db = adminDb();
  const ref = db.collection("qrLoginRequests").doc(requestId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new ApiError("not_found", "QR login request was not found.", 404);
  }

  const data = snap.data() || {};
  assertQrRequestIsFresh(data);
  if (data.used || data.status === "exchanged") {
    throw new ApiError("conflict", "This QR login request was already used.", 409);
  }
  if (data.secretHash !== hashQrSecret(secret)) {
    throw new ApiError("permission_denied", "This QR login request is not valid.", 403);
  }

  await ref.set({
    status: "approved",
    approvedUid: uid,
    approvedEmail: token.email || "",
    approvedName: token.name || "",
    approvedAt: FieldValue.serverTimestamp()
  }, { merge: true });

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
  const snap = await ref.get();
  if (!snap.exists) {
    throw new ApiError("not_found", "QR login request was not found.", 404);
  }

  const data = snap.data() || {};
  assertQrRequestIsFresh(data);
  if (data.used || data.status === "exchanged") {
    throw new ApiError("conflict", "This QR login request was already used.", 409);
  }
  if (data.status !== "approved" || !data.approvedUid) {
    logEvent("info", "qr_login_exchange_pending", {
      requestId: context.requestId,
      qrRequestId: requestId,
      endpoint: context.endpoint,
      result: "pending"
    });
    return { approved: false };
  }
  if (data.secretHash !== hashQrSecret(secret)) {
    throw new ApiError("permission_denied", "This QR login request is not valid.", 403);
  }

  const customToken = await auth.createCustomToken(data.approvedUid, {
    qr_login: true
  });

  await ref.set({
    status: "exchanged",
    used: true,
    exchangedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  logEvent("info", "qr_login_request_exchanged", {
    requestId: context.requestId,
    qrRequestId: requestId,
    userId: hashValue(data.approvedUid),
    endpoint: context.endpoint,
    result: "success"
  });

  return {
    approved: true,
    customToken,
    email: data.approvedEmail || "",
    name: data.approvedName || ""
  };
}

module.exports = {
  approveQrLoginRequest,
  createQrLoginRequest,
  exchangeQrLoginRequest,
  hashQrSecret
};
