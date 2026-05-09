import { readFile } from "node:fs/promises";
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function readArg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : "";
}

function hasPrivilegedClaim(claims = {}) {
  return claims.role === "admin" ||
    claims.role === "super_admin" ||
    claims.admin === true ||
    claims.super_admin === true;
}

function roleFromClaims(claims = {}) {
  if (claims.role === "super_admin" || claims.super_admin === true) return "super_admin";
  if (claims.role === "admin" || claims.admin === true) return "admin";
  return "user";
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

async function listAllUsers(auth) {
  const users = [];
  let nextPageToken;

  do {
    const page = await auth.listUsers(1000, nextPageToken);
    users.push(...page.users);
    nextPageToken = page.pageToken;
  } while (nextPageToken);

  return users;
}

async function main() {
  const projectId = readArg("project") || process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error("Missing Firebase project id. Pass --project=<id> or set FIREBASE_PROJECT_ID.");
  }

  const credential = await getCredential();
  initializeApp({ credential, projectId });

  const users = await listAllUsers(getAuth());
  const privilegedUsers = users
    .filter((user) => hasPrivilegedClaim(user.customClaims || {}))
    .map((user) => {
      const factors = user.multiFactor?.enrolledFactors || [];
      return {
        uid: user.uid,
        email: user.email || "",
        role: roleFromClaims(user.customClaims || {}),
        mfaEnrolled: factors.length > 0,
        factors: factors.map((factor) => ({
          factorId: factor.factorId,
          displayName: factor.displayName || "",
          enrollmentTime: factor.enrollmentTime || ""
        }))
      };
    })
    .sort((a, b) => a.role.localeCompare(b.role) || a.email.localeCompare(b.email));

  const missingMfa = privilegedUsers.filter((user) => !user.mfaEnrolled);
  const result = {
    projectId,
    privilegedCount: privilegedUsers.length,
    mfaEnrolledCount: privilegedUsers.length - missingMfa.length,
    missingMfaCount: missingMfa.length,
    missingMfa,
    privilegedUsers
  };

  console.log(JSON.stringify(result, null, 2));

  if (missingMfa.length > 0) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
