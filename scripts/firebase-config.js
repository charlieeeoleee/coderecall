import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  connectFirestoreEmulator,
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  initializeAppCheck,
  ReCaptchaV3Provider
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app-check.js";
import { resolveBrowserFirestoreEmulator } from "./firestore-emulator-routing.mjs";

export const firebaseConfig = {
  ...readRuntimeFirebaseConfig()
};

export const firebaseEnvironment = readRuntimeFirebaseEnvironment();
export const app = initializeApp(firebaseConfig);
export const db = initializeCodeRecallFirestore();

function initializeCodeRecallFirestore() {
  const firestore = getFirestore(app);
  const routing = resolveBrowserFirestoreEmulator({
    environment: firebaseEnvironment,
    protocol: window.location.protocol,
    hostname: window.location.hostname,
    port: window.location.port
  });

  if (routing.enabled) {
    connectFirestoreEmulator(firestore, routing.host, routing.port);
  }

  return firestore;
}

export const firebaseAppCheckConfig = {
  recaptchaV3SiteKey: readRuntimeAppCheckSiteKey()
};

function readRuntimeFirebaseConfig() {
  const config = self.CODE_RECALL_FIREBASE_CONFIG;
  const requiredKeys = [
    "apiKey",
    "authDomain",
    "projectId",
    "storageBucket",
    "messagingSenderId",
    "appId"
  ];

  if (!config || typeof config !== "object") {
    throw new Error(
      "Missing Firebase runtime config. Create scripts/firebase-config.runtime.js from scripts/firebase-config.example.js before running the app."
    );
  }

  const missingKeys = requiredKeys.filter((key) => !String(config[key] || "").trim());
  if (missingKeys.length) {
    throw new Error(`Firebase runtime config is missing: ${missingKeys.join(", ")}`);
  }

  const sanitizedConfig = requiredKeys.reduce((nextConfig, key) => {
    nextConfig[key] = String(config[key]).trim();
    return nextConfig;
  }, {});

  return sanitizedConfig;
}

function readRuntimeFirebaseEnvironment() {
  const environment = String(self.CODE_RECALL_FIREBASE_ENVIRONMENT || "").trim();
  if (!["development", "preview", "production"].includes(environment)) {
    throw new Error("Missing or invalid Firebase runtime environment metadata.");
  }
  return environment;
}

function readRuntimeAppCheckSiteKey() {
  return String(self.CODE_RECALL_FIREBASE_APP_CHECK_SITE_KEY || "").trim();
}

function readAppCheckSiteKey() {
  const configuredKey = firebaseAppCheckConfig.recaptchaV3SiteKey.trim();
  if (configuredKey) return configuredKey;

  const metaKey = document
    .querySelector('meta[name="firebase-app-check-site-key"]')
    ?.getAttribute("content")
    ?.trim();

  return metaKey || "";
}

function enableAppCheckDebugTokenIfConfigured() {
  const debugToken = localStorage.getItem("firebase_app_check_debug_token");
  if (!debugToken) return;

  self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken === "true" ? true : debugToken;
}

export function initializeCodeRecallAppCheck() {
  const siteKey = readAppCheckSiteKey();
  if (!siteKey) return null;

  enableAppCheckDebugTokenIfConfigured();

  return initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(siteKey),
    isTokenAutoRefreshEnabled: true
  });
}

initializeCodeRecallAppCheck();

const ERROR_REPORT_LIMIT_KEY = "code_recall_error_report_last_sent";
const ERROR_REPORT_COOLDOWN_MS = 60 * 1000;

function sanitizeErrorValue(value, maxLength = 240) {
  return String(value || "")
    .replace(/(apiKey|token|secret|password|authorization)=?[^&\s]*/gi, "$1=[redacted]")
    .slice(0, maxLength);
}

function shouldSendErrorReport() {
  try {
    const lastSent = Number(sessionStorage.getItem(ERROR_REPORT_LIMIT_KEY) || 0);
    if (Date.now() - lastSent < ERROR_REPORT_COOLDOWN_MS) return false;
    sessionStorage.setItem(ERROR_REPORT_LIMIT_KEY, String(Date.now()));
  } catch {
    // Keep reporting available when sessionStorage is blocked.
  }
  return true;
}

async function reportClientError(event, payload = {}) {
  if (!shouldSendErrorReport()) return;

  try {
    await fetch("/api/errors/report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "same-origin",
      body: JSON.stringify({
        event,
        message: sanitizeErrorValue(payload.message),
        source: sanitizeErrorValue(payload.source, 180),
        route: sanitizeErrorValue(location.pathname + location.search, 180),
        userAgent: sanitizeErrorValue(navigator.userAgent, 180)
      })
    });
  } catch {
    // Avoid recursive reporting loops.
  }
}

window.addEventListener("error", (event) => {
  reportClientError("uncaught_error", {
    message: event.message,
    source: event.filename
  });
});

window.addEventListener("unhandledrejection", (event) => {
  reportClientError("unhandled_rejection", {
    message: event.reason?.message || event.reason,
    source: "promise"
  });
});
