import { readFile } from "node:fs/promises";
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const VALID_ROLES = new Set(["user", "admin", "super_admin"]);

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
  node scripts/manage-role-claims.mjs --email=user@example.com --role=admin
  node scripts/manage-role-claims.mjs --uid=firebaseUid --role=super_admin

Options:
  --email=<email>       Firebase Auth user email to update.
  --uid=<uid>           Firebase Auth uid to update.
  --role=<role>         One of: user, admin, super_admin.
  --project=<id>        Optional Firebase project id.
  --no-firestore-sync   Only update Auth custom claims.

Auth:
  Set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON path, or set
  FIREBASE_SERVICE_ACCOUNT to the full service-account JSON string.
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

function claimsForRole(role, existingClaims = {}) {
  const nextClaims = { ...existingClaims };
  delete nextClaims.role;
  delete nextClaims.admin;
  delete nextClaims.super_admin;

  if (role === "admin") {
    nextClaims.role = "admin";
    nextClaims.admin = true;
  }

  if (role === "super_admin") {
    nextClaims.role = "super_admin";
    nextClaims.admin = true;
    nextClaims.super_admin = true;
  }

  return nextClaims;
}

async function main() {
  const email = readArg("email").toLowerCase();
  const uidArg = readArg("uid");
  const role = readArg("role");
  const projectId = readArg("project") || process.env.FIREBASE_PROJECT_ID;
  const shouldSyncFirestore = !hasFlag("no-firestore-sync");

  if ((!email && !uidArg) || (email && uidArg) || !VALID_ROLES.has(role)) {
    showUsageAndExit();
  }

  if (!projectId) {
    throw new Error("Missing Firebase project id. Pass --project=<id> or set FIREBASE_PROJECT_ID.");
  }

  const credential = await getCredential();
  initializeApp({ credential, projectId });

  const auth = getAuth();
  const db = getFirestore();
  const user = uidArg ? await auth.getUser(uidArg) : await auth.getUserByEmail(email);
  const nextClaims = claimsForRole(role, user.customClaims || {});

  await auth.setCustomUserClaims(user.uid, nextClaims);

  if (shouldSyncFirestore) {
    await db.collection("users").doc(user.uid).set({
      email: user.email || email,
      name: user.displayName || user.email || "User",
      photo: user.photoURL || "https://i.pravatar.cc/40?img=12",
      role,
      status: "active",
      progress: {
        role
      },
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }

  console.log(JSON.stringify({
    uid: user.uid,
    email: user.email || email,
    role,
    claims: nextClaims,
    firestoreSynced: shouldSyncFirestore
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
