import { app } from "./firebase-config.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  createPendingAppMfaSetup,
  hasAppMfaEnrollment,
  loadAppMfaProfile,
  resetOwnAppMfaProfile,
  savePendingAppMfaSetup,
  verifyPendingAppMfaSetupCode,
  verifyAppMfaProfileCode
} from "./app-level-mfa-profile.js";
import { resolveUserRole, syncUserRole } from "./role-utils.js";
import { clearAdminMfaSession, markAdminMfaVerified } from "./admin-mfa-session.js";
import { clearSuperAdminMfaSession } from "./super-admin-mfa-session.js";
import { renderQrSvgMarkup } from "./local-qr.js";

const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentProfile = null;
let pendingSetup = null;
let currentMfaSetupUri = "";
let resetModalBusy = false;

function updateThemeIcon() {
  const icon = document.getElementById("themeIcon");
  if (!icon) return;
  icon.textContent = document.body.classList.contains("light-mode") ? "\u2600\uFE0F" : "\uD83C\uDF19";
}

function loadTheme() {
  if (localStorage.getItem("theme") === "light") {
    document.body.classList.add("light-mode");
  }
  updateThemeIcon();
}

window.toggleTheme = function() {
  document.body.classList.toggle("light-mode");
  localStorage.setItem("theme", document.body.classList.contains("light-mode") ? "light" : "dark");
  updateThemeIcon();
};

function setStatus(message, isError = false) {
  const status = document.getElementById("mfaStatus");
  if (!status) return;
  status.textContent = message;
  status.style.color = isError ? "#ff97b6" : "#8ef7cf";
}

function describeMfaError(error) {
  const code = String(error?.code || "").trim();
  const message = String(error?.message || "").trim();
  if (code.includes("permission-denied")) {
    return "Unable to save 2FA setup because Firestore denied the profile update. Refresh and try again after the latest rules deploy.";
  }
  if (code || message) {
    return `Unable to verify 2FA${code ? ` (${code})` : ""}${message ? `: ${message}` : "."}`;
  }
  return "Unable to verify 2FA. Check the code and try again.";
}

function showSetupUi(email) {
  document.getElementById("setupPanel").hidden = false;
  document.getElementById("verifyPanel").hidden = true;
  document.getElementById("mfaForm").hidden = false;
  document.getElementById("mfaResetBtn").hidden = false;
  document.getElementById("mfaResetInlineBtn")?.removeAttribute("disabled");
  document.getElementById("mfaTitle").textContent = "Set Up Admin 2FA";
  document.getElementById("mfaSubtitle").textContent = "Connect an authenticator app, then verify one code to open admin controls.";
  document.getElementById("mfaAccountLabel").textContent = `Code Recall (${email || "admin"})`;
  updateRecoveryNotice(false);
}

function showVerifyUi() {
  document.getElementById("setupPanel").hidden = true;
  document.getElementById("verifyPanel").hidden = false;
  document.getElementById("mfaForm").hidden = false;
  document.getElementById("mfaResetBtn").hidden = false;
  document.getElementById("mfaTitle").textContent = "Verify Admin Access";
  document.getElementById("mfaSubtitle").textContent = "Enter the current code from your authenticator app to continue.";
  updateRecoveryNotice(true);
  setStatus("Enter your authenticator code or one unused backup code.");
}

function updateRecoveryNotice(enrolled) {
  const notice = document.getElementById("mfaRecoveryNotice");
  if (!notice) return;
  notice.textContent = enrolled
    ? "Backup codes are accepted here too. Each backup code can be used once."
    : "Save your backup codes after setup. They are the fallback if your authenticator app is unavailable.";
  notice.style.color = "#8ef7cf";
}

function renderBackupCodes(codes = []) {
  const recoveryBox = document.querySelector(".recovery-box");
  if (!recoveryBox || !codes.length) return;
  const existing = document.getElementById("mfaBackupCodes");
  if (existing) existing.remove();
  const list = document.createElement("ul");
  list.id = "mfaBackupCodes";
  list.className = "recovery-list";
  codes.forEach((code) => {
    const item = document.createElement("li");
    item.textContent = code;
    list.appendChild(item);
  });
  recoveryBox.appendChild(list);
}

async function prepareEnrollment(user) {
  showSetupUi(user.email || "");
  setStatus("Preparing authenticator setup...");
  pendingSetup = createPendingAppMfaSetup(user, "admin");
  currentMfaSetupUri = pendingSetup.setupUri;

  document.getElementById("mfaSecretValue").textContent = pendingSetup.formattedSecret;
  const qrImage = document.getElementById("mfaQrImage");
  if (qrImage) {
    qrImage.innerHTML = renderQrSvgMarkup(currentMfaSetupUri, 220);
  }
  renderBackupCodes(pendingSetup.backupCodes);
  setStatus("Scan the QR code, save the backup codes, then enter the 6-digit authenticator code.");
}

async function completeVerification(code) {
  if (pendingSetup) {
    if (!await verifyPendingAppMfaSetupCode(pendingSetup, code)) {
      setStatus("That code did not match this setup. Use the current 6-digit code and try again.", true);
      return;
    }
    await savePendingAppMfaSetup(db, pendingSetup);
  } else {
    const result = await verifyAppMfaProfileCode(db, currentUser, currentProfile, code, "app_totp_login");
    if (!result.ok) {
      setStatus("That code was not accepted. Use your current authenticator code or an unused backup code.", true);
      return;
    }
  }

  markAdminMfaVerified(currentUser.uid);
  setStatus("Admin 2FA verified. Opening admin controls...");
  window.location.replace("admin.html");
}

document.getElementById("mfaForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.getElementById("mfaCodeInput");
  const code = input?.value?.trim() || "";

  if (!code) {
    setStatus("Enter the 6-digit code before continuing.", true);
    return;
  }

  const button = document.getElementById("mfaSubmitBtn");
  if (button) {
    button.disabled = true;
    button.textContent = "Checking...";
  }

  try {
    await completeVerification(code);
  } catch (error) {
    console.error("Admin app-level MFA verification failed.", error);
    setStatus(describeMfaError(error), true);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Verify and Continue";
    }
  }
});

window.copyMfaSecret = async function() {
  if (!pendingSetup?.secret) {
    setStatus("The setup key is only available during new enrollment.", true);
    return;
  }
  await copyText(pendingSetup.secret);
  setStatus("Authenticator key copied.");
};

window.copyMfaSetupLink = async function() {
  if (!currentMfaSetupUri) {
    setStatus("The setup link is only available during new enrollment.", true);
    return;
  }
  await copyText(currentMfaSetupUri);
  setStatus("Authenticator setup link copied.");
};

window.openAuthenticatorApp = function() {
  if (!currentMfaSetupUri) {
    setStatus("The setup link is only available during new enrollment.", true);
    return;
  }
  window.location.href = currentMfaSetupUri;
};

function setResetModalOpen(isOpen) {
  const modal = document.getElementById("mfaResetModal");
  const confirmBtn = document.getElementById("mfaResetConfirmBtn");
  if (!modal) return;
  modal.classList.toggle("active", isOpen);
  modal.setAttribute("aria-hidden", isOpen ? "false" : "true");
  if (isOpen) {
    window.setTimeout(() => confirmBtn?.focus(), 50);
  }
}

async function performCurrentMfaReset() {
  if (!currentUser || resetModalBusy) return;
  resetModalBusy = true;
  const button = document.getElementById("mfaResetBtn");
  const inlineButton = document.getElementById("mfaResetInlineBtn");
  const confirmBtn = document.getElementById("mfaResetConfirmBtn");
  const cancelBtn = document.getElementById("mfaResetCancelBtn");
  if (button) button.disabled = true;
  if (inlineButton) inlineButton.disabled = true;
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Resetting...";
  }
  if (cancelBtn) cancelBtn.disabled = true;
  try {
    setResetModalOpen(false);
    setStatus("Resetting app-level 2FA...");
    await resetOwnAppMfaProfile(db, currentUser, "admin");
    clearAdminMfaSession();
    clearSuperAdminMfaSession();
    pendingSetup = null;
    currentProfile = null;
    await prepareEnrollment(currentUser);
  } catch (error) {
    console.error("Unable to reset admin app-level MFA.", error);
    setStatus(describeMfaError(error), true);
  } finally {
    resetModalBusy = false;
    if (button) button.disabled = false;
    if (inlineButton) inlineButton.disabled = false;
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Reset 2FA";
    }
    if (cancelBtn) cancelBtn.disabled = false;
  }
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

window.resetCurrentMfaEnrollment = async function() {
  if (!currentUser) return;
  setResetModalOpen(true);
};

window.logoutMfa = async function() {
  clearAdminMfaSession();
  await signOut(auth);
  window.location.replace("auth.html");
};

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.replace("auth.html");
    return;
  }

  currentUser = user;
  const role = await resolveUserRole(db, user);
  await syncUserRole(db, user, role);

  if (role === "super_admin") {
    clearAdminMfaSession();
    window.location.replace("super-admin-mfa.html");
    return;
  }

  if (role !== "admin") {
    window.location.replace("dashboard.html");
    return;
  }

  currentProfile = await loadAppMfaProfile(db, user.uid);
  if (hasAppMfaEnrollment(currentProfile)) {
    showVerifyUi();
    return;
  }

  await prepareEnrollment(user);
});

document.getElementById("mfaResetCancelBtn")?.addEventListener("click", () => setResetModalOpen(false));
document.getElementById("mfaResetConfirmBtn")?.addEventListener("click", performCurrentMfaReset);
document.getElementById("mfaResetModal")?.addEventListener("click", (event) => {
  if (event.target?.id === "mfaResetModal" && !resetModalBusy) {
    setResetModalOpen(false);
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !resetModalBusy) {
    setResetModalOpen(false);
  }
});

loadTheme();
