import { mkdir, writeFile } from "node:fs/promises";
import { buildFirebaseRuntimeConfiguration } from "./firebase-environment-contract.mjs";

const outputPath = "scripts/firebase-config.runtime.js";
const { environment, config, appCheckSiteKey } = buildFirebaseRuntimeConfiguration();

await mkdir("scripts", { recursive: true });
await writeFile(
  outputPath,
  `// Generated during deployment. Contains public Firebase web config.\n` +
    `self.CODE_RECALL_FIREBASE_ENVIRONMENT = ${JSON.stringify(environment)};\n` +
    `self.CODE_RECALL_FIREBASE_CONFIG = ${JSON.stringify(config, null, 2)};\n\n` +
    `self.CODE_RECALL_FIREBASE_APP_CHECK_SITE_KEY = ${JSON.stringify(appCheckSiteKey)};\n`
);

console.log(`Wrote ${outputPath} for the ${environment} environment.`);
