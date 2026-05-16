const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();

const PRIVILEGED_ROLES = new Set(["admin", "super_admin"]);

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

  const userDoc = await getFirestore().collection("users").doc(uid).get();
  if (!userDoc.exists) return "";
  return privilegedRoleFromUserDoc(userDoc.data() || {});
}

exports.resetOwnMfaEnrollment = onCall({
  region: "us-central1",
  enforceAppCheck: false
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
