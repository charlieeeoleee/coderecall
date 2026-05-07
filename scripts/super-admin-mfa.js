import { app } from "./firebase-config.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { resolveUserRole, syncUserRole } from "./role-utils.js";
import { markSuperAdminMfaVerified, isSuperAdminMfaVerified, clearSuperAdminMfaSession } from "./super-admin-mfa-session.js";
import { renderQrSvgDataUri } from "./local-qr.js";
import {
  buildOtpAuthUri,
  findMatchingBackupCodeIndex,
  formatSecret,
  generateBackupCodes,
  generateBase32Secret,
  hashBackupCodes,
  verifyTotpCode
} from "./mfa-totp.js";

const SETUP_STORAGE_KEY = "super_admin_mfa_pending_setup_v1";

const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let activeProfile = null;
let pendingSetup = null;

function isPermissionDenied(error) {
  const code = String(error?.code || "");
  return code.includes("permission-denied") || code.includes("insufficient-permissions");
}

function setStatus(message, isError = false) {
  const status = document.getElementById("mfaStatus");
  if (!status) return;
  status.textContent = message;
  status.style.color = isError ? "#ff97b6" : "#8ef7cf";
}

function getSecurityProfileRef(uid) {
  return doc(db, "securityProfiles", uid);
}

function readPendingSetup(uid) {
  try {
    const data = JSON.parse(sessionStorage.getItem(SETUP_STORAGE_KEY) || "null");
    return data?.uid === uid ? data : null;
  } catch (error) {
    return null;
  }
}

function savePendingSetup(data) {
  sessionStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(data));
}

function clearPendingSetup() {
  sessionStorage.removeItem(SETUP_STORAGE_KEY);
}

function renderSetupUi(email) {
  document.getElementById("setupPanel").hidden = false;
  document.getElementById("verifyPanel").hidden = true;
  document.getElementById("mfaTitle").textContent = "Set Up Super Admin 2FA";
  document.getElementById("mfaSubtitle").textContent = "Before you can use the super-admin controls, connect an authenticator app and verify one code.";
  document.getElementById("mfaSecretValue").textContent = formatSecret(pendingSetup.secret);
  document.getElementById("mfaAccountLabel").textContent = `Code Recall (${email || "super-admin"})`;
  const qrImage = document.getElementById("mfaQrImage");
  if (qrImage) {
    qrImage.src = renderQrSvgDataUri(pendingSetup.otpAuthUri, 220);
  }

  const list = document.getElementById("backupCodeList");
  list.innerHTML = pendingSetup.backupCodes
    .map((code) => `<div class="backup-code-chip">${code}</div>`)
    .join("");
  updateRecoveryNotice({
    enrolled: false,
    backupCodesRemaining: pendingSetup.backupCodes.length
  });
}

function renderVerifyUi() {
  document.getElementById("setupPanel").hidden = true;
  document.getElementById("verifyPanel").hidden = false;
  document.getElementById("mfaTitle").textContent = "Verify Super Admin Access";
  document.getElementById("mfaSubtitle").textContent = "Enter the 6-digit code from your authenticator app or one backup code to continue.";
  updateRecoveryNotice({
    enrolled: Boolean(activeProfile?.totpEnabled),
    backupCodesRemaining: Array.isArray(activeProfile?.backupCodeHashes) ? activeProfile.backupCodeHashes.length : 0
  });
}

function updateRecoveryNotice({ enrolled, backupCodesRemaining }) {
  const notice = document.getElementById("mfaRecoveryNotice");
  if (!notice) return;

  if (!enrolled) {
    notice.textContent = `You currently have ${backupCodesRemaining} fresh backup code(s). Download or copy them before you continue.`;
    notice.style.color = "#8ef7cf";
    return;
  }

  if (backupCodesRemaining <= 2) {
    notice.textContent = `Only ${backupCodesRemaining} backup code(s) remain. Reset and re-enroll 2FA soon so you do not lose emergency recovery access.`;
    notice.style.color = "#ffc27a";
    return;
  }

  notice.textContent = `${backupCodesRemaining} backup code(s) remain for emergency access. Keep them offline and private.`;
  notice.style.color = "#8ef7cf";
}

async function ensurePendingSetup(user) {
  const existing = readPendingSetup(user.uid);
  if (existing) {
    pendingSetup = existing;
    return;
  }

  const secret = generateBase32Secret();
  const backupCodes = generateBackupCodes(6);
  const backupCodeHashes = await hashBackupCodes(backupCodes);
  pendingSetup = {
    uid: user.uid,
    email: user.email || "",
    secret,
    backupCodes,
    backupCodeHashes,
    otpAuthUri: buildOtpAuthUri({
      secret,
      email: user.email || "",
      issuer: "Code Recall"
    })
  };
  savePendingSetup(pendingSetup);
}

async function completeSetup(code) {
  const isValid = await verifyTotpCode(pendingSetup.secret, code);
  if (!isValid) {
    setStatus("That code did not match the authenticator app. Please try again.", true);
    return;
  }

  await setDoc(getSecurityProfileRef(currentUser.uid), {
    uid: currentUser.uid,
    email: currentUser.email || "",
    totpEnabled: true,
    totpSecret: pendingSetup.secret,
    backupCodeHashes: pendingSetup.backupCodeHashes,
    enrolledAt: serverTimestamp(),
    lastVerifiedAt: serverTimestamp(),
    lastVerifiedRole: "super_admin",
    lastVerificationMethod: "authenticator_app",
    backupCodeUseCount: 0,
    updatedAt: serverTimestamp()
  }, { merge: true });

  clearPendingSetup();
  markSuperAdminMfaVerified(currentUser.uid);
  setStatus("Super-admin 2FA is now enabled. Redirecting...");
  window.setTimeout(() => {
    window.location.replace("super-admin.html");
  }, 700);
}

async function verifyExistingProfile(code) {
  const normalized = String(code || "").trim();
  const backupHashes = Array.isArray(activeProfile?.backupCodeHashes) ? activeProfile.backupCodeHashes : [];

  const totpOk = await verifyTotpCode(activeProfile?.totpSecret || "", normalized);
  if (totpOk) {
    await setDoc(getSecurityProfileRef(currentUser.uid), {
      lastVerifiedAt: serverTimestamp(),
      lastVerifiedRole: "super_admin",
      lastVerificationMethod: "authenticator_app",
      updatedAt: serverTimestamp()
    }, { merge: true });
    markSuperAdminMfaVerified(currentUser.uid);
    setStatus("Verification successful. Redirecting...");
    window.setTimeout(() => {
      window.location.replace("super-admin.html");
    }, 500);
    return;
  }

  const backupIndex = await findMatchingBackupCodeIndex(normalized, backupHashes);
  if (backupIndex >= 0) {
    const nextHashes = [...backupHashes];
    nextHashes.splice(backupIndex, 1);
    await setDoc(getSecurityProfileRef(currentUser.uid), {
      backupCodeHashes: nextHashes,
      lastVerifiedAt: serverTimestamp(),
      lastVerifiedRole: "super_admin",
      lastVerificationMethod: "backup_code",
      backupCodeUseCount: Math.max(0, Number(activeProfile?.backupCodeUseCount || 0)) + 1,
      updatedAt: serverTimestamp()
    }, { merge: true });
    markSuperAdminMfaVerified(currentUser.uid);
    setStatus("Backup code accepted. Redirecting...");
    window.setTimeout(() => {
      window.location.replace("super-admin.html");
    }, 500);
    return;
  }

  setStatus("The verification code or backup code is not valid.", true);
}

document.getElementById("mfaForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.getElementById("mfaCodeInput");
  const code = input?.value || "";

  if (!code.trim()) {
    setStatus("Enter a verification code before continuing.", true);
    return;
  }

  const button = document.getElementById("mfaSubmitBtn");
  if (button) {
    button.disabled = true;
    button.textContent = "Checking...";
  }

  try {
    if (pendingSetup) {
      await completeSetup(code);
    } else {
      await verifyExistingProfile(code);
    }
  } catch (error) {
    console.error("Super-admin MFA failed.", error);
    setStatus(
      isPermissionDenied(error)
        ? "Unable to complete super-admin verification because Firestore is still blocking securityProfiles access. Deploy the latest Firestore rules, then try again."
        : "Unable to complete super-admin verification right now. Please try again.",
      true
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Verify and Continue";
    }
  }
});

window.copyMfaSecret = async function() {
  if (!pendingSetup?.secret) return;
  await navigator.clipboard.writeText(pendingSetup.secret);
  setStatus("Authenticator key copied.");
};

window.copyBackupCodes = async function() {
  if (!pendingSetup?.backupCodes?.length) return;
  await navigator.clipboard.writeText(pendingSetup.backupCodes.join("\n"));
  setStatus("Backup codes copied.");
};

window.downloadBackupCodes = function() {
  if (!pendingSetup?.backupCodes?.length) return;
  const lines = [
    "Code Recall Super Admin Backup Codes",
    `Account: ${currentUser?.email || "super-admin"}`,
    "",
    ...pendingSetup.backupCodes,
    "",
    "Each backup code works once.",
    "Keep this file somewhere safe and private."
  ];
  const blob = new Blob([lines.join("\r\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `code-recall-super-admin-backup-codes-${(currentUser?.email || "account").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  setStatus("Backup codes downloaded.");
};

window.copyMfaSetupLink = async function() {
  if (!pendingSetup?.otpAuthUri) return;
  await navigator.clipboard.writeText(pendingSetup.otpAuthUri);
  setStatus("Authenticator setup link copied.");
};

window.openAuthenticatorApp = function() {
  const setupLink = pendingSetup?.otpAuthUri;
  if (!setupLink) return;
  window.location.href = setupLink;
};

window.resetCurrentMfaEnrollment = async function() {
  if (!currentUser) return;
  try {
    await setDoc(getSecurityProfileRef(currentUser.uid), {
      uid: currentUser.uid,
      email: currentUser.email || "",
      totpEnabled: false,
      totpSecret: "",
      backupCodeHashes: [],
      lastResetReason: "self_service_reenroll",
      lastResetRole: "super_admin",
      resetAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });

    clearSuperAdminMfaSession();
    activeProfile = null;
    pendingSetup = null;
    clearPendingSetup();
    await ensurePendingSetup(currentUser);
    renderSetupUi(currentUser.email || "");
    document.getElementById("mfaCodeInput").value = "";
    setStatus("Super-admin 2FA was reset. Scan the QR code or use the new setup key below.");
  } catch (error) {
    console.error("Unable to reset super-admin MFA enrollment.", error);
    setStatus(
      isPermissionDenied(error)
        ? "Unable to reset 2FA because Firestore is still blocking securityProfiles access. Deploy the latest Firestore rules, then try again."
        : "Unable to reset 2FA right now. Please try again.",
      true
    );
  }
};

window.logoutMfa = async function() {
  clearSuperAdminMfaSession();
  clearPendingSetup();
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
    window.location.replace("super-admin.html");
    return;
  }

  window.location.replace("dashboard.html");
});
