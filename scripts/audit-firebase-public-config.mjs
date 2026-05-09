import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SECRET_PATTERNS = [
  /AIza[0-9A-Za-z_-]{20,}/,
  /"private_key"\s*:/i,
  /"client_secret"\s*:/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/
];
const SKIPPED_DIRS = new Set([
  ".git",
  ".firebase-cli-config",
  "node_modules"
]);
const SKIPPED_FILES = new Set([
  "scripts/firebase-config.local.js",
  "scripts/firebase-config.runtime.js"
]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];

  for (const entry of entries) {
    if (SKIPPED_DIRS.has(entry.name) || (path.basename(dir) === "manuals" && entry.name === "tmp")) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(ROOT, fullPath).replaceAll("\\", "/");
    if (SKIPPED_FILES.has(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

async function main() {
  const files = await walk(ROOT);
  const textFiles = files.filter((file) => /\.(js|mjs|html|json|md|rules|env)$/i.test(file));
  const secretHits = [];

  for (const file of textFiles) {
    const content = await readFile(file, "utf8").catch(() => "");
    if (!content) continue;

    SECRET_PATTERNS.forEach((pattern) => {
      if (pattern.test(content)) {
        secretHits.push({ file: path.relative(ROOT, file), pattern: String(pattern) });
      }
    });
  }

  const result = {
    scannedTextFiles: textFiles.length,
    secretHits
  };

  console.log(JSON.stringify(result, null, 2));

  if (secretHits.length > 0) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
