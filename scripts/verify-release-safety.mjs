import { existsSync, readFileSync } from "node:fs";

const mandatoryApiRoutes = [
  "api/gamification/event.js",
  "api/errors/report.js",
  "api/admin/mfa/reset-own.js",
  "api/auth/qr/create.js",
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
  const envExample = read(".env.example");
  const vercelConfig = readJson("vercel.json");
  const errors = [];
  const warnings = [];

  mandatoryApiRoutes.forEach((route) => {
    if (!existsSync(route)) errors.push(`Missing mandatory Vercel API route: ${route}.`);
  });

  assertNoActiveCallableDependency(mandatoryFrontendFiles, errors);

  requiredEnvNames.forEach((name) => {
    if (!envExample.includes(`${name}=`)) {
      errors.push(`.env.example must document server variable name ${name}.`);
    }
  });

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
