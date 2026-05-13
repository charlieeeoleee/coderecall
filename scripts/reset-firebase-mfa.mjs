import { readFile } from "node:fs/promises";
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

function readArg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : "";
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function showUsageAndExit() {
  console.error(`
Usage:
  node scripts/reset-firebase-mfa.mjs --email=user@example.com --project=gamifiedlearningsystem
  node scripts/reset-firebase-mfa.mjs --uid=firebaseUid --project=gamifiedlearningsystem

Options:
  --email=<email>       Firebase Auth user email to reset.
  --uid=<uid>           Firebase Auth uid to reset.
  --project=<id>        Firebase project id. Defaults to FIREBASE_PROJECT_ID.
  --no-firestore-sync   Only clear Firebase Auth enrolled factors.

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

function roleFromClaims(claims = {}) {
  if (claims.role === "super_admin" || claims.super_admin === true) return "super_admin";
  if (claims.role === "admin" || claims.admin === true) return "admin";
  return "";
}

async function main() {
  const email = readArg("email").toLowerCase();
  const uidArg = readArg("uid");
  const projectId = readArg("project") || process.env.FIREBASE_PROJECT_ID;
  const shouldSyncFirestore = !hasFlag("no-firestore-sync");

  if ((!email && !uidArg) || (email && uidArg) || !projectId) {
    showUsageAndExit();
  }

  initializeApp({
    credential: await getCredential(),
    projectId
  });

  const auth = getAuth();
  const db = getFirestore();
  const user = uidArg ? await auth.getUser(uidArg) : await auth.getUserByEmail(email);
  const enrolledFactors = user.multiFactor?.enrolledFactors || [];

  await auth.updateUser(user.uid, {
    multiFactor: {
      enrolledFactors: []
    }
  });

  if (shouldSyncFirestore) {
    await db.collection("securityProfiles").doc(user.uid).set({
      uid: user.uid,
      email: user.email || email,
      role: roleFromClaims(user.customClaims || {}),
      firebaseMfaEnrolled: false,
      firebaseMfaProvider: "",
      firebaseMfaSource: "firebase_auth",
      lastVerificationMethod: "firebase_totp_admin_reset",
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }

  console.log(JSON.stringify({
    projectId,
    uid: user.uid,
    email: user.email || email,
    removedFactorCount: enrolledFactors.length,
    firestoreSynced: shouldSyncFirestore
  }, null, 2));
}

main().catch((error) => {
  console.error("Unable to reset Firebase Auth MFA.");
  console.error(error?.message || error);
  process.exit(1);
});
