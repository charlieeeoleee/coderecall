import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const allowlistedFiles = new Set([
  ".env.example",
  "postgres-backup.env.example",
  "scripts/firebase-config.example.js"
]);

const suspiciousFilePatterns = [
  /\.env$/i,
  /\.env\./i,
  /service-account.*\.json$/i,
  /.*\.service-account\.json$/i,
  /firebase-config\.runtime\.js$/i,
  /\.postgres-backup\.env$/i
];

const secretPatterns = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /"private_key"\s*:/i,
  /client_secret\s*[:=]/i,
  /refresh_token\s*[:=]/i,
  /authorization\s*[:=]\s*bearer\s+/i,
  /(db_password|postgres_password|password_secret|smtp_password)\s*[:=]\s*["']?[^"'\s#]{12,}/i
];

function listTrackedFiles() {
  return execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function main() {
  const trackedFiles = listTrackedFiles();
  const findings = [];

  trackedFiles.forEach((file) => {
    const normalized = file.replace(/\\/g, "/");
    if (allowlistedFiles.has(normalized)) return;

    if (suspiciousFilePatterns.some((pattern) => pattern.test(normalized))) {
      findings.push(`Tracked credential-like file: ${normalized}`);
    }

    if (!existsSync(file)) return;
    const content = readFileSync(file, "utf8");
    secretPatterns.forEach((pattern) => {
      if (pattern.test(content)) {
        findings.push(`Credential-like content pattern in: ${normalized}`);
      }
    });
  });

  if (findings.length) {
    console.error(JSON.stringify({ status: "needs_attention", findings }, null, 2));
    process.exit(2);
  }

  console.log(JSON.stringify({ status: "ok", findings: [] }, null, 2));
}

main();
