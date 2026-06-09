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
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in before resetting 2FA.");
  }

  const uid = request.auth.uid;
  const auth = getAuth();
  const db = getFirestore();
  const authUser = await auth.getUser(uid);
  const role = await resolvePrivilegedRole(uid, authUser);

  if (!PRIVILEGED_ROLES.has(role)) {
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
}, async () => {
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
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in on this phone before approving QR login.");
  }

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

  return {
    approved: true,
    customToken: token,
    email: data.approvedEmail || "",
    name: data.approvedName || ""
  };
});
