const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { ApiError } = require("./http");

function readRequiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new ApiError("temporary_unavailable", "Server configuration is incomplete.", 503);
  }
  return value;
}

function privateKeyFromEnv() {
  return readRequiredEnv("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n");
}

function getAdminApp() {
  if (getApps().length) return getApps()[0];

  return initializeApp({
    credential: cert({
      projectId: readRequiredEnv("FIREBASE_ADMIN_PROJECT_ID"),
      clientEmail: readRequiredEnv("FIREBASE_ADMIN_CLIENT_EMAIL"),
      privateKey: privateKeyFromEnv()
    })
  });
}

function adminAuth() {
  return getAuth(getAdminApp());
}

function adminDb() {
  return getFirestore(getAdminApp());
}

module.exports = {
  FieldValue,
  adminAuth,
  adminDb,
  getAdminApp
};
