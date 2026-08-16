import { existsSync, readFileSync } from "node:fs";

const mandatoryApiRoutes = [
  "api/gamification/event.js",
  "api/errors/report.js",
  "api/admin/mfa/reset-own.js",
  "api/auth/qr/create.js",
  "api/auth/qr/context.js",
  "api/auth/qr/match.js",
  "api/auth/qr/deny.js",
  "api/auth/qr/cancel.js",
  "api/auth/qr/approve.js",
  "api/auth/qr/exchange.js"
];

const mandatoryFrontendFiles = [
  "scripts/backend-api.js",
  "scripts/gamification-api.js",
  "scripts/privileged-mfa-reset.js",
  "scripts/qr-approve.js",
  "scripts/auth.js",
  "scripts/firebase-config.js"
];

const requiredEnvNames = [
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY"
];

const developmentOnlyAuthCheck = "api/auth/check.js";

const requiredPublicEnvNames = [
  "CODE_RECALL_FIREBASE_API_KEY",
  "CODE_RECALL_FIREBASE_AUTH_DOMAIN",
  "CODE_RECALL_FIREBASE_PROJECT_ID",
  "CODE_RECALL_FIREBASE_STORAGE_BUCKET",
  "CODE_RECALL_FIREBASE_MESSAGING_SENDER_ID",
  "CODE_RECALL_FIREBASE_APP_ID"
];

function read(path) {
  return readFileSync(path, "utf8");
}

function readJson(path) {
  return JSON.parse(read(path));
}

function assertNoActiveCallableDependency(files, errors) {
  files.forEach((file) => {
    if (!existsSync(file)) {
      errors.push(`Missing frontend contract file: ${file}.`);
      return;
    }
    const source = read(file);
    if (/firebase-functions\.js|getFunctions\(|httpsCallable\(/.test(source)) {
      errors.push(`${file} still imports or invokes Firebase Callable Functions.`);
    }
  });
}

function main() {
  const rootPackage = readJson("package.json");
  const firebaseRc = readJson(".firebaserc");
  const envExample = read(".env.example");
  const vercelConfig = readJson("vercel.json");
  const errors = [];
  const warnings = [];

  const firebaseProjects = firebaseRc.projects || {};
  if (Object.hasOwn(firebaseProjects, "default")) {
    errors.push(".firebaserc must not define an unsafe default project alias.");
  }
  if (firebaseProjects.production !== "gamifiedlearningsystem") {
    errors.push(".firebaserc Production alias must target the approved Production project.");
  }
  if (firebaseProjects.preview !== "coderecall-preview") {
    errors.push(".firebaserc Preview alias must target the approved Preview project.");
  }
  if (firebaseProjects.preview === firebaseProjects.production) {
    errors.push("Firebase Preview and Production aliases must target different projects.");
  }

  const packageScripts = rootPackage.scripts || {};
  Object.entries(packageScripts).forEach(([name, command]) => {
    if (!/firebase\s+deploy\b/i.test(command)) return;
    if (!/--project\s+(preview|production)\b/i.test(command)) {
      errors.push(`Package script ${name} contains an untargeted Firebase deployment command.`);
    }
    if (/--only\s+[^\r\n]*hosting/i.test(command)) {
      errors.push(`Package script ${name} must not deploy Firebase Hosting; Vercel is the active host.`);
    }
  });

  const previewRulesCommand = String(packageScripts["firebase:rules:preview"] || "");
  const productionRulesCommand = String(packageScripts["firebase:rules:production"] || "");
  if (!previewRulesCommand.includes("guard-firebase-deploy.mjs --environment=preview --project=coderecall-preview") || !/--project\s+preview\b/.test(previewRulesCommand)) {
    errors.push("Preview Rules deployment must use the fixed Preview guard and alias.");
  }
  if (!productionRulesCommand.includes("guard-firebase-deploy.mjs --environment=production --project=gamifiedlearningsystem") || !/--project\s+production\b/.test(productionRulesCommand)) {
    errors.push("Production Rules deployment must use the fixed Production guard and alias.");
  }

  mandatoryApiRoutes.forEach((route) => {
    if (!existsSync(route)) errors.push(`Missing mandatory Vercel API route: ${route}.`);
  });

  assertNoActiveCallableDependency(mandatoryFrontendFiles, errors);

  requiredEnvNames.forEach((name) => {
    if (!envExample.includes(`${name}=`)) {
      errors.push(`.env.example must document server variable name ${name}.`);
    }
  });
  if (!existsSync(developmentOnlyAuthCheck)) {
    errors.push(`Missing Development-only auth verification route: ${developmentOnlyAuthCheck}.`);
  } else {
    const authCheckSource = read(developmentOnlyAuthCheck);
    if (!authCheckSource.includes('!== "development"') || !authCheckSource.includes("requireFirebaseUser")) {
      errors.push("Development auth verification route must fail closed outside Development and reuse Firebase ID-token verification.");
    }
    if (/adminDb|gamification|leaderboard|\.set\(|\.update\(|runTransaction/.test(authCheckSource)) {
      errors.push("Development auth verification route must not contain data mutation behavior.");
    }
  }

  requiredPublicEnvNames.forEach((name) => {
    if (!envExample.includes(`${name}=`)) {
      errors.push(`.env.example must document public Firebase variable name ${name}.`);
    }
  });

  const runtimeGenerator = read("scripts/write-runtime-config.mjs");
  const environmentContract = read("scripts/firebase-environment-contract.mjs");
  const browserFirebaseSource = read("scripts/firebase-config.js");
  const browserEmulatorRoutingSource = read("scripts/firestore-emulator-routing.mjs");
  if (/gamifiedlearningsystem|firebaseapp\.com|firebasestorage\.app/.test(runtimeGenerator)) {
    errors.push("Runtime Firebase generator must not contain tracked project defaults.");
  }
  if (!environmentContract.includes("CODE_RECALL_PRODUCTION_FIREBASE_PROJECT_ID")) {
    errors.push("Firebase environment contract must reject Production project use in Preview.");
  }
  if (!browserFirebaseSource.includes("connectFirestoreEmulator")) {
    errors.push("Browser Firestore must explicitly connect to the emulator for approved Development origins.");
  }
  if (!browserEmulatorRoutingSource.includes('normalizedEnvironment === "preview"')
      || !browserEmulatorRoutingSource.includes('normalizedEnvironment === "production"')
      || !browserEmulatorRoutingSource.includes('normalizedEnvironment !== "development"')) {
    errors.push("Browser Firestore emulator routing must fail closed outside approved Development origins.");
  }

  if (!rootPackage.scripts?.["test:api-contract"]) {
    errors.push("Missing npm script test:api-contract.");
  }
  if (!rootPackage.scripts?.["security:audit-secrets"]) {
    errors.push("Missing npm script security:audit-secrets.");
  }
  if (!rootPackage.scripts?.["test:rules"]) {
    errors.push("Missing npm script test:rules.");
  }
  if (!rootPackage.scripts?.["firebase:deploy:functions"] || !/disabled|spark mode|echo/i.test(rootPackage.scripts["firebase:deploy:functions"])) {
    warnings.push("Firebase Functions deployment should stay disabled for Spark-mode production unless an explicit Blaze plan is approved.");
  }

  if (vercelConfig.outputDirectory !== ".") {
    warnings.push(`Vercel outputDirectory is ${vercelConfig.outputDirectory || "missing"}; static app migration expected '.'.`);
  }
  if (!String(vercelConfig.buildCommand || "").includes("scripts/write-runtime-config.mjs")) {
    errors.push("Vercel buildCommand must generate runtime Firebase public config.");
  }

  const serverSources = [
    "api/_lib/firebase-admin.js",
    "api/_lib/auth.js",
    "api/_lib/gamification.js"
  ].map(read).join("\n");
  requiredEnvNames.forEach((name) => {
    if (!serverSources.includes(name)) {
      errors.push(`Server API source does not reference required environment variable ${name}.`);
    }
  });

  const clientSources = mandatoryFrontendFiles.map(read).join("\n");
  if (/FIREBASE_ADMIN_PRIVATE_KEY|FIREBASE_ADMIN_CLIENT_EMAIL/.test(clientSources)) {
    errors.push("Server-only Firebase Admin variable names leaked into frontend code.");
  }

  const result = {
    status: errors.length ? "blocked" : "ok",
    productionReadiness: "SOURCE_READY_ONLY",
    mandatoryApiRoutes,
    requiredEnvNames,
    errors,
    warnings
  };

  console.log(JSON.stringify(result, null, 2));
  if (errors.length) process.exit(2);
}

main();
