import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  initializeAppCheck,
  ReCaptchaV3Provider
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app-check.js";

export const firebaseConfig = {
  apiKey: "AIzaSyDZiVk1T6ZbpKJrhRt1wQAr2vSSn4Wa_KU",
  authDomain: "gamifiedlearningsystem.firebaseapp.com",
  projectId: "gamifiedlearningsystem",
  storageBucket: "gamifiedlearningsystem.firebasestorage.app",
  messagingSenderId: "516998404507",
  appId: "1:516998404507:web:0c625f9af2809ca4b6a93e"
};

export const app = initializeApp(firebaseConfig);

export const firebaseAppCheckConfig = {
  recaptchaV3SiteKey: ""
};

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
