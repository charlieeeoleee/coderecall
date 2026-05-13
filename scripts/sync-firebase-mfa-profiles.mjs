import { readFile } from "node:fs/promises";
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const PRIVILEGED_ROLES = new Set(["admin", "super_admin"]);

function readArg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : "";
}

function showUsageAndExit() {
  console.error(`
Usage:
  node scripts/sync-firebase-mfa-profiles.mjs --project=gamifiedlearningsystem

Options:
  --project=<id>        Firebase project id. Defaults to FIREBASE_PROJECT_ID.

Auth:
  Set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON path, set
  FIREBASE_SERVICE_ACCOUNT to the full service-account JSON string, or use
  Application Default Credentials for the Firebase project.
`);
  process.exit(1);
}

async function getCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const raw = await readFile(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8");
    return cert(JSON.parse(raw));
  }

  return applicationDefault();
}

function normalizeEmail(email = "") {
  return String(email || "").trim().toLowerCase();
}

function roleFromClaims(claims = {}) {
  if (claims.role === "super_admin" || claims.super_admin === true) return "super_admin";
  if (claims.role === "admin" || claims.admin === true) return "admin";
  return "";
}

function roleFromUserRecord(data = {}) {
  const candidates = [
    data.role,
    data?.progress?.role,
    data.isSuperAdmin ? "super_admin" : "",
    data.isAdmin ? "admin" : ""
  ].filter(Boolean);

  if (candidates.includes("super_admin")) return "super_admin";
  if (candidates.includes("admin")) return "admin";
  return "";
}

async function listAllAuthUsers(auth) {
  const users = [];
  let nextPageToken;

  do {
    const page = await auth.listUsers(1000, nextPageToken);
    users.push(...page.users);
    nextPageToken = page.pageToken;
  } while (nextPageToken);

  return users;
}

async function buildFirestoreUserIndex(db) {
  const snapshot = await db.collection("users").get();
  const byUid = new Map();
  const byEmail = new Map();

  snapshot.forEach((doc) => {
    const data = doc.data() || {};
    const record = { id: doc.id, ...data };
    byUid.set(doc.id, record);
    const email = normalizeEmail(data.email);
    if (email) byEmail.set(email, record);
  });

  return { byUid, byEmail };
}

function getFactorProvider(factors = []) {
  const provider = factors.find((factor) => factor.factorId)?.factorId || "";
  return provider || (factors.length ? "totp" : "");
}

async function main() {
  const projectId = readArg("project") || process.env.FIREBASE_PROJECT_ID;
  if (!projectId) showUsageAndExit();

  initializeApp({
    credential: await getCredential(),
    projectId
  });

  const auth = getAuth();
  const db = getFirestore();
  const authUsers = await listAllAuthUsers(auth);
  const firestoreUsers = await buildFirestoreUserIndex(db);
  const batch = db.batch();
  const synced = [];

  for (const authUser of authUsers) {
    const firestoreUser =
      firestoreUsers.byUid.get(authUser.uid) ||
      firestoreUsers.byEmail.get(normalizeEmail(authUser.email));
    const role = roleFromClaims(authUser.customClaims || {}) || roleFromUserRecord(firestoreUser || {});

    if (!PRIVILEGED_ROLES.has(role)) continue;

    const factors = authUser.multiFactor?.enrolledFactors || [];
    const enrolled = factors.length > 0;
    const provider = getFactorProvider(factors);
    const ref = db.collection("securityProfiles").doc(authUser.uid);
    batch.set(ref, {
      uid: authUser.uid,
      email: authUser.email || firestoreUser?.email || "",
      role,
      firebaseMfaEnrolled: enrolled,
      firebaseMfaProvider: provider,
      firebaseMfaSource: "firebase_auth",
      enrolledAt: enrolled ? FieldValue.serverTimestamp() : FieldValue.delete(),
      lastVerificationMethod: enrolled ? "firebase_totp_admin_sync" : "firebase_totp_admin_sync_missing",
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    if (firestoreUser?.id) {
      batch.set(db.collection("users").doc(firestoreUser.id), {
        firebaseMfaEnrolled: enrolled,
        firebaseMfaProvider: provider,
        firebaseMfaSource: "firebase_auth",
        firebaseMfaSyncedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    }

    synced.push({
      uid: authUser.uid,
      email: authUser.email || firestoreUser?.email || "",
      role,
      enrolled,
      factorCount: factors.length
    });
  }

  if (synced.length) {
    await batch.commit();
  }

  console.log(JSON.stringify({
    projectId,
    syncedCount: synced.length,
    enrolledCount: synced.filter((user) => user.enrolled).length,
    pendingCount: synced.filter((user) => !user.enrolled).length,
    synced
  }, null, 2));
}

main().catch((error) => {
  console.error("Unable to sync Firebase MFA profiles.");
  console.error(error?.message || error);
  process.exit(1);
});
