import { readFile } from "node:fs/promises";
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const ROLE_NAMES = new Set(["admin", "super_admin"]);

function readArg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : "";
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

async function readConfiguredRoleEmails() {
  const source = await readFile("data/admin-config.js", "utf8");
  const result = new Map();

  const collect = (exportName, role) => {
    const match = source.match(new RegExp(`export\\s+const\\s+${exportName}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
    if (!match) return;

    const emailMatches = match[1].matchAll(/"([^"]+@[^"]+)"/g);
    for (const emailMatch of emailMatches) {
      result.set(emailMatch[1].trim().toLowerCase(), role);
    }
  };

  collect("ADMIN_EMAILS", "admin");
  collect("SUPER_ADMIN_EMAILS", "super_admin");

  return result;
}

function claimRole(user) {
  const claims = user.customClaims || {};
  if (claims.role === "super_admin" || claims.super_admin === true) return "super_admin";
  if (claims.role === "admin" || claims.admin === true) return "admin";
  return "user";
}

function storedRole(data = {}) {
  const role = data.role || data.progress?.role || "user";
  return ROLE_NAMES.has(role) ? role : "user";
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

  const authUsers = await listAllUsers(getAuth());
  const usersByEmail = new Map(
    authUsers
      .filter((user) => user.email)
      .map((user) => [user.email.toLowerCase(), user])
  );
  const usersByUid = new Map(authUsers.map((user) => [user.uid, user]));
  const configuredRoleEmails = await readConfiguredRoleEmails();
  const configuredFallbacks = [];

  configuredRoleEmails.forEach((role, email) => {
    const user = usersByEmail.get(email);
    const claimsRole = user ? claimRole(user) : "missing_auth_user";
    if (claimsRole !== role) {
      configuredFallbacks.push({
        email,
        expectedRole: role,
        authUid: user?.uid || "",
        claimsRole
      });
    }
  });

  const storedRoleFallbacks = [];
  const snap = await getFirestore().collection("users").get();
  snap.forEach((doc) => {
    const data = doc.data() || {};
    const role = storedRole(data);
    if (!ROLE_NAMES.has(role)) return;

    const user = usersByUid.get(doc.id);
    const claimsRole = user ? claimRole(user) : "missing_auth_user";
    if (claimsRole !== role) {
      storedRoleFallbacks.push({
        uid: doc.id,
        email: data.email || user?.email || "",
        storedRole: role,
        claimsRole
      });
    }
  });

  const result = {
    projectId,
    configuredFallbackCount: configuredFallbacks.length,
    storedRoleFallbackCount: storedRoleFallbacks.length,
    configuredFallbacks,
    storedRoleFallbacks,
    safeToRemoveFallbacks: configuredFallbacks.length === 0 && storedRoleFallbacks.length === 0
  };

  console.log(JSON.stringify(result, null, 2));

  if (!result.safeToRemoveFallbacks) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
