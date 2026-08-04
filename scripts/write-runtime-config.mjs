import { mkdir, writeFile } from "node:fs/promises";

const outputPath = "scripts/firebase-config.runtime.js";

const defaults = {
  CODE_RECALL_FIREBASE_API_KEY: "AIzaSyDZiVk1T6ZbpKJrhRt1wQAr2vSSn4Wa_KU",
  CODE_RECALL_FIREBASE_AUTH_DOMAIN: "gamifiedlearningsystem.firebaseapp.com",
  CODE_RECALL_FIREBASE_PROJECT_ID: "gamifiedlearningsystem",
  CODE_RECALL_FIREBASE_STORAGE_BUCKET: "gamifiedlearningsystem.firebasestorage.app",
  CODE_RECALL_FIREBASE_MESSAGING_SENDER_ID: "516998404507",
  CODE_RECALL_FIREBASE_APP_ID: "1:516998404507:web:0c625f9af2809ca4b6a93e"
};

function readConfigValue(name) {
  const value = String(process.env[name] || "").trim();
  return value || defaults[name] || "";
}

const config = {
  apiKey: readConfigValue("CODE_RECALL_FIREBASE_API_KEY"),
  authDomain: readConfigValue("CODE_RECALL_FIREBASE_AUTH_DOMAIN"),
  projectId: readConfigValue("CODE_RECALL_FIREBASE_PROJECT_ID"),
  storageBucket: readConfigValue("CODE_RECALL_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: readConfigValue("CODE_RECALL_FIREBASE_MESSAGING_SENDER_ID"),
  appId: readConfigValue("CODE_RECALL_FIREBASE_APP_ID")
};

const appCheckSiteKey = String(process.env.CODE_RECALL_FIREBASE_APP_CHECK_SITE_KEY || "").trim();

await mkdir("scripts", { recursive: true });
await writeFile(
  outputPath,
  `// Generated during deployment. Contains public Firebase web config.\n` +
    `self.CODE_RECALL_FIREBASE_CONFIG = ${JSON.stringify(config, null, 2)};\n\n` +
    `self.CODE_RECALL_FIREBASE_APP_CHECK_SITE_KEY = ${JSON.stringify(appCheckSiteKey)};\n`
);

console.log(`Wrote ${outputPath}`);
