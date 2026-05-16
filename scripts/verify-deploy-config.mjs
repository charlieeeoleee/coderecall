import { existsSync, readFileSync } from "node:fs";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function hasHeader(headers, source, key, valueIncludes) {
  const entry = headers.find((item) => item.source === source);
  if (!entry) return false;
  return (entry.headers || []).some((header) => {
    const keyMatches = String(header.key || "").toLowerCase() === key.toLowerCase();
    const value = String(header.value || "");
    return keyMatches && (!valueIncludes || value.includes(valueIncludes));
  });
}

function checkRuntimeConfig(warnings) {
  const runtimePath = "scripts/firebase-config.runtime.js";
  if (!existsSync(runtimePath)) {
    warnings.push("scripts/firebase-config.runtime.js is missing locally. Hosting deploys need the private runtime config file present.");
    return;
  }

  const runtimeConfig = readFileSync(runtimePath, "utf8");
  if (/private_key|client_secret|BEGIN [A-Z ]*PRIVATE KEY/i.test(runtimeConfig)) {
    throw new Error("Runtime Firebase config appears to contain private credential material.");
  }

  const authDomainMatch = runtimeConfig.match(/authDomain\s*:\s*["']([^"']+)["']/);
  if (!authDomainMatch) {
    warnings.push("Runtime Firebase config does not expose an authDomain value.");
    return;
  }

  if (authDomainMatch[1] !== "coderecall.online") {
    warnings.push(`Runtime authDomain is ${authDomainMatch[1]}; production custom-domain OAuth should use coderecall.online.`);
  }
}

function main() {
  const firebaseConfig = readJson("firebase.json");
  const packageConfig = readJson("package.json");
  const gitignore = readFileSync(".gitignore", "utf8");
  const serviceWorker = existsSync("service-worker.js") ? readFileSync("service-worker.js", "utf8") : "";
  const headers = firebaseConfig.hosting?.headers || [];
  const errors = [];
  const warnings = [];

  if (firebaseConfig.hosting?.site !== "gamifiedlearningsystem") {
    warnings.push(`Firebase Hosting site is ${firebaseConfig.hosting?.site || "missing"}; expected gamifiedlearningsystem for the current Firebase project.`);
  }

  if (!hasHeader(headers, "**/*.html", "Cache-Control", "no-cache")) {
    errors.push("Missing no-cache header for HTML files.");
  }

  if (!hasHeader(headers, "{scripts,styles}/**", "Cache-Control", "no-cache")) {
    errors.push("Missing no-cache header for scripts/styles.");
  }

  if (!hasHeader(headers, "assets/**", "Cache-Control", "immutable")) {
    errors.push("Missing immutable cache header for assets.");
  }

  if (!packageConfig.scripts?.["firebase:deploy:app"]) {
    errors.push("Missing npm script firebase:deploy:app.");
  }

  if (!packageConfig.scripts?.["firestore:backup:postgres:dry-run"]) {
    errors.push("Missing npm script firestore:backup:postgres:dry-run.");
  }

  if (!gitignore.includes("scripts/firebase-config.runtime.js")) {
    errors.push("scripts/firebase-config.runtime.js is not ignored by Git.");
  }

  if (!gitignore.includes(".postgres-backup.env")) {
    errors.push(".postgres-backup.env is not ignored by Git.");
  }

  if (!gitignore.includes("logs/")) {
    errors.push("logs/ is not ignored by Git.");
  }

  if (!/CACHE_VERSION\s*=\s*["']code-recall-v\d+/i.test(serviceWorker)) {
    warnings.push("Service worker cache version was not found.");
  }

  checkRuntimeConfig(warnings);

  const result = {
    status: errors.length ? "needs_attention" : "ok",
    errors,
    warnings
  };

  console.log(JSON.stringify(result, null, 2));

  if (errors.length) {
    process.exitCode = 2;
  }
}

try {
  main();
} catch (error) {
  console.error(error?.message || error);
  process.exit(1);
}
