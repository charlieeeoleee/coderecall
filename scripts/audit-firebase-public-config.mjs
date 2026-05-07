import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SECRET_PATTERNS = [
  /"private_key"\s*:/i,
  /"client_secret"\s*:/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/
];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];

  for (const entry of entries) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".git" ||
      entry.name === ".firebase-cli-config" ||
      (path.basename(dir) === "manuals" && entry.name === "tmp")
    ) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
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
  const firebaseConfigHits = [];
  const secretHits = [];

  for (const file of textFiles) {
    const content = await readFile(file, "utf8").catch(() => "");
    if (!content) continue;

    if (/apiKey\s*:/.test(content) || /authDomain\s*:/.test(content)) {
      firebaseConfigHits.push(path.relative(ROOT, file));
    }

    SECRET_PATTERNS.forEach((pattern) => {
      if (pattern.test(content)) {
        secretHits.push({ file: path.relative(ROOT, file), pattern: String(pattern) });
      }
    });
  }

  const result = {
    firebaseConfigFiles: firebaseConfigHits,
    configCentralized: firebaseConfigHits.length === 1 && firebaseConfigHits[0].replaceAll("\\", "/") === "scripts/firebase-config.js",
    secretHits
  };

  console.log(JSON.stringify(result, null, 2));

  if (!result.configCentralized || secretHits.length > 0) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
