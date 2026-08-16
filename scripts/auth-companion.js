import { generateTotpCode } from "./mfa-totp.js";

const STORAGE_KEY = "code_recall_auth_companion_v1";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

let unlockedSecret = "";
let codeTimer = null;

const views = {
  locked: document.getElementById("lockedView"),
  setup: document.getElementById("setupView"),
  code: document.getElementById("codeView")
};

function showView(name) {
  Object.entries(views).forEach(([key, element]) => {
    if (element) element.hidden = key !== name;
  });
}

function setStatus(id, message, isError = false) {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("error", Boolean(isError));
}

function getStoredVault() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function normalizeSecret(value = "") {
  const raw = String(value || "").trim();
  if (raw.startsWith("otpauth://")) {
    try {
      return new URL(raw).searchParams.get("secret") || "";
    } catch {
      return "";
    }
  }
  return raw.replace(/\s+/g, "");
}

function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function deriveKey(passphrase, salt) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 210000,
      hash: "SHA-256"
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptVault(data, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    textEncoder.encode(JSON.stringify(data))
  );

  return {
    version: 1,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    encrypted: bytesToBase64(encrypted)
  };
}

async function decryptVault(vault, passphrase) {
  const key = await deriveKey(passphrase, base64ToBytes(vault.salt));
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(vault.iv) },
    key,
    base64ToBytes(vault.encrypted)
  );
  return JSON.parse(textDecoder.decode(decrypted));
}

function startCodeLoop(label, secret) {
  unlockedSecret = secret;
  document.getElementById("savedAccountLabel").textContent = label || "Code Recall";
  showView("code");

  if (codeTimer) window.clearInterval(codeTimer);
  const render = async () => {
    const now = Date.now();
    const seconds = Math.floor(now / 1000);
    const remaining = 30 - (seconds % 30);
    document.getElementById("totpCode").textContent = await generateTotpCode(unlockedSecret, { now });
    document.getElementById("timerLabel").textContent = `${remaining}s until next code`;
    document.getElementById("timerFill").style.width = `${(remaining / 30) * 100}%`;
  };

  render();
  codeTimer = window.setInterval(render, 1000);
}

document.getElementById("startSetupBtn")?.addEventListener("click", () => {
  showView("setup");
  setStatus("setupStatus", "");
});

document.getElementById("cancelSetupBtn")?.addEventListener("click", () => {
  showView(getStoredVault() ? "locked" : "locked");
});

document.getElementById("setupForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const label = document.getElementById("accountLabel")?.value.trim() || "Code Recall";
  const secret = normalizeSecret(document.getElementById("setupSecret")?.value || "");
  const passphrase = document.getElementById("setupPassphrase")?.value || "";

  if (!/^[A-Z2-7]{16,}$/i.test(secret)) {
    setStatus("setupStatus", "Paste a valid setup link or manual Base32 key.", true);
    return;
  }
  if (passphrase.length < 8) {
    setStatus("setupStatus", "Use at least 8 characters for the passphrase.", true);
    return;
  }

  try {
    const vault = await encryptVault({ label, secret: secret.toUpperCase() }, passphrase);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(vault));
    document.getElementById("setupPassphrase").value = "";
    document.getElementById("setupSecret").value = "";
    startCodeLoop(label, secret.toUpperCase());
  } catch (error) {
    console.error("Unable to save companion vault.", error);
    setStatus("setupStatus", "Unable to save this phone. Check browser storage and try again.", true);
  }
});

document.getElementById("unlockForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const vault = getStoredVault();
  const passphrase = document.getElementById("unlockPassphrase")?.value || "";
  if (!vault) {
    showView("setup");
    return;
  }

  try {
    const data = await decryptVault(vault, passphrase);
    document.getElementById("unlockPassphrase").value = "";
    startCodeLoop(data.label, data.secret);
  } catch {
    setStatus("lockStatus", "Passphrase did not unlock this companion.", true);
  }
});

document.getElementById("copyCodeBtn")?.addEventListener("click", async () => {
  const code = document.getElementById("totpCode")?.textContent || "";
  try {
    await navigator.clipboard.writeText(code);
    setStatus("codeStatus", "Code copied.");
  } catch {
    setStatus("codeStatus", "Copy is unavailable. Type the code shown above.", true);
  }
});

document.getElementById("lockBtn")?.addEventListener("click", () => {
  unlockedSecret = "";
  if (codeTimer) window.clearInterval(codeTimer);
  showView("locked");
});

document.getElementById("resetCompanionBtn")?.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  unlockedSecret = "";
  if (codeTimer) window.clearInterval(codeTimer);
  showView("setup");
  setStatus("setupStatus", "This phone was reset. Add a setup key again.");
});

const companionHostname = window.location.hostname.toLowerCase();
const isLocalCompanionDevelopment = window.location.protocol === "http:"
  && window.location.port === "3000"
  && (
    companionHostname === "localhost"
    || companionHostname === "127.0.0.1"
    || /^10\./.test(companionHostname)
    || /^192\.168\./.test(companionHostname)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(companionHostname)
  );

if ("serviceWorker" in navigator && !isLocalCompanionDevelopment) {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}

showView(getStoredVault() ? "locked" : "setup");
