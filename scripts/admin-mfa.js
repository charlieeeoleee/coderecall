import { app } from "./firebase-config.js";
import {
  getAuth,
  multiFactor,
  onAuthStateChanged,
  signOut,
  TotpMultiFactorGenerator
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { resolveUserRole, syncUserRole } from "./role-utils.js";
import { clearAdminMfaSession } from "./admin-mfa-session.js";
import { clearSuperAdminMfaSession } from "./super-admin-mfa-session.js";
import { hasTotpFactor, signedInWithSecondFactor } from "./firebase-native-mfa.js";
import { markNativeMfaEnrolled, syncNativeMfaProfile } from "./native-mfa-profile.js";
import { renderQrSvgMarkup } from "./local-qr.js";
import { describeAutomaticMfaResetError, resetOwnMfaEnrollment } from "./privileged-mfa-reset.js";

const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let pendingTotpSecret = null;
let currentMfaSetupUri = "";

function updateThemeIcon() {
  const icon = document.getElementById("themeIcon");
  if (!icon) return;
  icon.textContent = document.body.classList.contains("light-mode") ? "☀️" : "🌙";
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

function setSetupUnavailable(message) {
  pendingTotpSecret = null;
  currentMfaSetupUri = "";
  const secretValue = document.getElementById("mfaSecretValue");
  if (secretValue) secretValue.textContent = "Setup unavailable";
  const qrImage = document.getElementById("mfaQrImage");
  if (qrImage) qrImage.textContent = "QR unavailable";
  setStatus(message, true);
}

function describeSetupError(error) {
  const code = String(error?.code || "");
  if (code.includes("operation-not-allowed") || code.includes("unsupported") || code.includes("invalid-argument")) {
    return "Firebase native TOTP is not enabled for this project yet. Run npm.cmd run auth:enable-totp with Firebase Admin credentials, then sign in again.";
  }
  if (code.includes("requires-recent-login")) {
    return "Firebase requires a fresh sign-in before enrolling 2FA. Log out, sign in again, then return here.";
  }
  if (code.includes("unverified-email")) {
    return "Firebase requires a verified email before enrolling 2FA. Verify this account's email, then sign in again.";
  }
  return `Unable to create the Firebase Auth 2FA setup${code ? ` (${code})` : ""}. Sign in again and try once more.`;
}

function showSetupUi(email) {
  document.getElementById("setupPanel").hidden = false;
  document.getElementById("verifyPanel").hidden = true;
  document.getElementById("mfaForm").hidden = false;
  document.getElementById("mfaResetBtn").hidden = false;
  document.getElementById("mfaTitle").textContent = "Set Up Admin 2FA";
  document.getElementById("mfaSubtitle").textContent = "Before you can use admin controls, connect an authenticator app and verify one code.";
  document.getElementById("mfaAccountLabel").textContent = `Code Recall (${email || "admin"})`;
  updateRecoveryNotice(false);
}

function showAlreadyEnrolledUi() {
  document.getElementById("setupPanel").hidden = true;
  document.getElementById("verifyPanel").hidden = false;
  document.getElementById("mfaForm").hidden = true;
  document.getElementById("mfaResetBtn").hidden = true;
  document.getElementById("mfaTitle").textContent = "Admin 2FA Is Enabled";
  document.getElementById("mfaSubtitle").textContent = "Sign in again and Firebase will ask for your authenticator code before privileged access opens.";
  updateRecoveryNotice(true);
  setStatus("2FA is already enrolled. Log out, then sign in again to verify with your authenticator code.");
}

function updateRecoveryNotice(enrolled) {
  const notice = document.getElementById("mfaRecoveryNotice");
  if (!notice) return;
  notice.textContent = enrolled
    ? "To change or remove this 2FA method, reset the enrolled factor from Firebase Console or the Admin SDK."
    : "After enrollment, privileged sign-ins require the current code from your authenticator app.";
  notice.style.color = "#8ef7cf";
}

async function prepareEnrollment(user) {
  try {
    showSetupUi(user.email || "");
    setStatus("Preparing authenticator setup...");
    const session = await multiFactor(user).getSession();
    pendingTotpSecret = await TotpMultiFactorGenerator.generateSecret(session);
    currentMfaSetupUri = pendingTotpSecret.generateQrCodeUrl(user.email || user.uid, "Code Recall");

    document.getElementById("mfaSecretValue").textContent = pendingTotpSecret.secretKey;
    const qrImage = document.getElementById("mfaQrImage");
    if (qrImage) {
      qrImage.innerHTML = renderQrSvgMarkup(currentMfaSetupUri, 220);
    }
    setStatus("Scan the QR code, then enter the 6-digit code from your authenticator app.");
  } catch (error) {
    console.error("Unable to prepare Firebase MFA enrollment.", error);
    setSetupUnavailable(describeSetupError(error));
  }
}

async function completeEnrollment(code) {
  if (!pendingTotpSecret) {
    setStatus("2FA setup is not ready yet. Refresh and try again.", true);
    return;
  }

  const assertion = TotpMultiFactorGenerator.assertionForEnrollment(pendingTotpSecret, code);
  await multiFactor(currentUser).enroll(assertion, "Code Recall Admin");
  await markNativeMfaEnrolled(db, currentUser, "admin", {
    method: "firebase_totp_enrollment",
    provider: "totp"
  });
  clearAdminMfaSession();
  setStatus("Admin 2FA is now enabled. Checking your secure session...");

  await currentUser.reload();
  currentUser = auth.currentUser || currentUser;

  if (await signedInWithSecondFactor(currentUser)) {
    await syncNativeMfaProfile(db, currentUser, "admin", {
      method: "firebase_totp_enrollment"
    });
    window.location.replace("admin.html");
    return;
  }

  sessionStorage.setItem(
    "code_recall_mfa_notice",
    "Your authenticator is enrolled. Sign in one more time so Firebase can issue a 2FA-verified session."
  );
  setStatus("2FA is enrolled. Sign in once more so Firebase can verify this privileged session.");
  window.setTimeout(async () => {
    await signOut(auth);
    window.location.replace("auth.html");
  }, 900);
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
    await completeEnrollment(code);
  } catch (error) {
    console.error("Admin MFA enrollment failed.", error);
    setStatus("Unable to enroll 2FA. Use the current authenticator code and try again.", true);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Verify and Continue";
    }
  }
});

window.copyMfaSecret = async function() {
  if (!pendingTotpSecret?.secretKey) {
    setStatus("The setup key is not ready yet.", true);
    return;
  }
  await copyText(pendingTotpSecret.secretKey);
  setStatus("Authenticator key copied.");
};

window.copyMfaSetupLink = async function() {
  if (!currentMfaSetupUri) {
    setStatus("The setup link is not ready yet.", true);
    return;
  }
  await copyText(currentMfaSetupUri);
  setStatus("Authenticator setup link copied.");
};

window.openAuthenticatorApp = function() {
  if (!currentMfaSetupUri) {
    setStatus("The setup link is not ready yet.", true);
    return;
  }
  window.location.href = currentMfaSetupUri;
};

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
  if (!window.confirm("Reset your current 2FA setup and start enrollment again?")) return;
  const button = document.getElementById("mfaResetBtn");
  if (button) button.disabled = true;
  try {
    setStatus("Resetting your Firebase 2FA. Please wait...");
    await resetOwnMfaEnrollment();
    clearAdminMfaSession();
    clearSuperAdminMfaSession();
    setStatus("2FA reset. Signing out so you can enroll a fresh authenticator.");
    await signOut(auth);
    window.location.replace("auth.html");
  } catch (error) {
    console.error("Unable to reset admin MFA from setup page.", error);
    setStatus(describeAutomaticMfaResetError(error), true);
    if (button) button.disabled = false;
  }
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

  if (hasTotpFactor(user)) {
    await markNativeMfaEnrolled(db, user, "admin", {
      method: "firebase_totp_existing_factor",
      provider: "totp"
    });
    showAlreadyEnrolledUi();
    return;
  }

  await prepareEnrollment(user);
});

loadTheme();
