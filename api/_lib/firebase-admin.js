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

function assertFirebaseAdminRuntimeSafety() {
  const environment = String(process.env.VERCEL_ENV || "").trim().toLowerCase() || "development";
  const emulatorHost = String(process.env.FIRESTORE_EMULATOR_HOST || "").trim();

  if (environment === "production" && emulatorHost) {
    console.error("Firebase Admin configuration rejected: emulator use is forbidden in Production.");
    throw new ApiError("temporary_unavailable", "Server configuration is incomplete.", 503);
  }

  if (environment === "development") {
    const adminProjectId = readRequiredEnv("FIREBASE_ADMIN_PROJECT_ID");
    const publicProjectId = readRequiredEnv("CODE_RECALL_FIREBASE_PROJECT_ID");
    if (adminProjectId !== publicProjectId) {
      console.error("Firebase Admin configuration rejected: Development client and server Auth projects differ.");
      throw new ApiError("temporary_unavailable", "Server configuration is incomplete.", 503);
    }
  }

  if (environment === "production") {
    const adminProjectId = readRequiredEnv("FIREBASE_ADMIN_PROJECT_ID");
    const publicProjectId = readRequiredEnv("CODE_RECALL_FIREBASE_PROJECT_ID");
    const productionProjectId = readRequiredEnv("CODE_RECALL_PRODUCTION_FIREBASE_PROJECT_ID");
    if (adminProjectId !== productionProjectId || publicProjectId !== productionProjectId) {
      console.error("Firebase Admin configuration rejected: Production project contract mismatch.");
      throw new ApiError("temporary_unavailable", "Server configuration is incomplete.", 503);
    }
  }

  if (environment === "preview") {
    const previewProjectId = readRequiredEnv("FIREBASE_ADMIN_PROJECT_ID");
    const publicPreviewProjectId = readRequiredEnv("CODE_RECALL_FIREBASE_PROJECT_ID");
    const productionProjectId = readRequiredEnv("CODE_RECALL_PRODUCTION_FIREBASE_PROJECT_ID");
    if (previewProjectId === productionProjectId) {
      console.error("Firebase Admin configuration rejected: Preview cannot use the Production project.");
      throw new ApiError("temporary_unavailable", "Server configuration is incomplete.", 503);
    }
    if (previewProjectId !== publicPreviewProjectId) {
      console.error("Firebase Admin configuration rejected: Preview client and server projects differ.");
      throw new ApiError("temporary_unavailable", "Server configuration is incomplete.", 503);
    }
  }
}

function getAdminApp() {
  assertFirebaseAdminRuntimeSafety();
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
  assertFirebaseAdminRuntimeSafety,
  getAdminApp
};
