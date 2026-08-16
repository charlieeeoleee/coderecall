import { existsSync, readFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const routes = [
  "/api/gamification/event",
  "/api/errors/report",
  "/api/admin/mfa/reset-own",
  "/api/auth/check",
  "/api/auth/qr/create",
  "/api/auth/qr/context",
  "/api/auth/qr/match",
  "/api/auth/qr/deny",
  "/api/auth/qr/cancel",
  "/api/auth/qr/approve",
  "/api/auth/qr/exchange"
];

const routeFiles = [
  "api/gamification/event.js",
  "api/errors/report.js",
  "api/admin/mfa/reset-own.js",
  "api/auth/check.js",
  "api/auth/qr/create.js",
  "api/auth/qr/context.js",
  "api/auth/qr/match.js",
  "api/auth/qr/deny.js",
  "api/auth/qr/cancel.js",
  "api/auth/qr/approve.js",
  "api/auth/qr/exchange.js"
];

routeFiles.forEach((file) => assert(existsSync(file), `Missing Vercel API route ${file}.`));

const adminSource = read("api/_lib/firebase-admin.js");
assert(adminSource.includes("FIREBASE_ADMIN_PROJECT_ID"), "Admin init must read FIREBASE_ADMIN_PROJECT_ID.");
assert(adminSource.includes("FIREBASE_ADMIN_CLIENT_EMAIL"), "Admin init must read FIREBASE_ADMIN_CLIENT_EMAIL.");
assert(adminSource.includes("FIREBASE_ADMIN_PRIVATE_KEY"), "Admin init must read FIREBASE_ADMIN_PRIVATE_KEY.");
assert(adminSource.includes("replace(/\\\\n/g, \"\\n\")"), "Admin init must handle escaped private-key newlines.");
assert(adminSource.includes("FIRESTORE_EMULATOR_HOST"), "Admin init must guard Firestore emulator configuration.");
assert(adminSource.includes('environment === "production" && emulatorHost'), "Production Admin init must reject Firestore emulator use.");

const runtimeGeneratorSource = read("scripts/write-runtime-config.mjs");
assert(!runtimeGeneratorSource.includes("const defaults"), "Runtime Firebase generator must not contain fallback project config.");
assert(runtimeGeneratorSource.includes("buildFirebaseRuntimeConfiguration"), "Runtime Firebase generator must enforce the environment contract.");

const authSource = read("api/_lib/auth.js");
assert(authSource.includes("verifyIdToken"), "Protected APIs must verify Firebase ID tokens.");
assert(authSource.includes("parseBearerToken"), "Auth helper must parse bearer tokens.");
assert(authSource.includes("requirePrivilegedRole"), "Privileged APIs must use server-side role authorization.");

const authCheckSource = read("api/auth/check.js");
assert(authCheckSource.includes("requireFirebaseUser"), "Development auth check must reuse authoritative Firebase token verification.");
assert(authCheckSource.includes('!== "development"'), "Development auth check must fail closed outside Development.");
assert(!/adminDb|Firestore|gamification|leaderboard|\.set\(|\.update\(|runTransaction/.test(authCheckSource), "Development auth check must remain read-only.");

const gamificationSource = read("api/_lib/gamification.js");
assert(gamificationSource.includes("runTransaction"), "Gamification migration must use Firestore transactions.");
assert(gamificationSource.includes("gamificationEvents"), "Gamification migration must preserve event idempotency.");
assert(gamificationSource.includes("deriveQuizXp"), "Gamification migration must derive quiz XP server-side.");
assert(gamificationSource.includes("clientXpIgnored"), "Gamification migration must mark ignored client XP fields.");
assert(!/Number\(data\.xpAwarded \|\| 0\)/.test(gamificationSource), "Server must not trust data.xpAwarded as authoritative.");
assert(!/Number\(data\.xp \|\| 0\)/.test(gamificationSource), "Server must not trust arbitrary data.xp as authoritative.");

const frontendSources = [
  "scripts/backend-api.js",
  "scripts/gamification-api.js",
  "scripts/privileged-mfa-reset.js",
  "scripts/qr-approve.js",
  "scripts/auth.js"
].map(read).join("\n");
assert(!/firebase-functions\.js|getFunctions\(|httpsCallable\(/.test(frontendSources), "Active frontend must not call Firebase Callable Functions.");
assert(frontendSources.includes("/api/gamification/event"), "Frontend must call the Vercel gamification route.");
assert(frontendSources.includes("/api/admin/mfa/reset-own"), "Frontend must call the Vercel MFA reset route.");
assert(frontendSources.includes("/api/auth/qr/approve"), "Frontend must call the Vercel QR approval route.");
assert(/Authorization\s*=\s*`Bearer \$\{await user\.getIdToken\(\)\}`/.test(frontendSources), "Frontend API client must attach Firebase ID tokens.");
assert(frontendSources.includes("BackendApiError"), "Frontend API client must normalize HTTP/API failures.");
assert(frontendSources.includes("AbortController"), "Frontend API client must apply request timeout handling.");

const envExample = read(".env.example");
["FIREBASE_ADMIN_PROJECT_ID", "FIREBASE_ADMIN_CLIENT_EMAIL", "FIREBASE_ADMIN_PRIVATE_KEY"].forEach((name) => {
  assert(envExample.includes(`${name}=`), `.env.example must document ${name}.`);
});

console.log(JSON.stringify({
  status: "ok",
  productionReadiness: "SOURCE_READY_ONLY",
  routes
}, null, 2));
