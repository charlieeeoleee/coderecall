import { app } from "./firebase-config.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  getMultiFactorResolver,
  TotpMultiFactorGenerator
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { resolveUserRole, syncUserRole } from "./role-utils.js";
import { syncPublicLeaderboardEntry } from "./leaderboard-public.js";
import { clearSuperAdminMfaSession } from "./super-admin-mfa-session.js";
import { clearAdminMfaSession } from "./admin-mfa-session.js";
import { hasTotpFactor, signedInWithSecondFactor } from "./firebase-native-mfa.js";
import { syncNativeMfaProfile } from "./native-mfa-profile.js";


const auth = getAuth(app);
const db = getFirestore(app);

const pendingGoogleKey = "pendingGoogleRegistration";
const googleRedirectPendingKey = "codeRecallGoogleRedirectPending";
let isHandlingAuthFlow = false;
let activeMfaResolver = null;
let activeMfaProvider = "password";
let googleSignInInFlight = false;

if (sessionStorage.getItem(googleRedirectPendingKey) === "true") {
  isHandlingAuthFlow = true;
}

async function getLandingPageForUser(user) {
  const role = await resolveUserRole(db, user);
  await syncUserRole(db, user, role);

  if (role === "super_admin") {
    if (!hasTotpFactor(user)) return "super-admin-mfa.html";
    if (!await signedInWithSecondFactor(user)) return "super-admin-mfa.html";
    return "super-admin.html";
  }

  if (role === "admin") {
    if (!hasTotpFactor(user)) return "admin-mfa.html";
    if (!await signedInWithSecondFactor(user)) return "admin-mfa.html";
    return "admin.html";
  }

  return "dashboard.html";
}

/* AUTH STATE */
onAuthStateChanged(auth, async (user) => {
  const pendingGoogle = readPendingGoogleRegistration();

  if (!user) return;
  if (isHandlingAuthFlow) return;

  if (pendingGoogle && window.location.pathname.includes("auth.html")) {
    showPendingGoogleRegistration(pendingGoogle);
    return;
  }

  const userRef = doc(db, "users", user.uid);
  const docSnap = await getDoc(userRef);

  const providerIds = user.providerData?.map(p => p.providerId) || [];
  const isPasswordUser = providerIds.includes("password");
  const isGoogleUser = providerIds.includes("google.com");

  if (isPasswordUser && !user.emailVerified && window.location.pathname.includes("auth.html")) {
    return;
  }

  if ((docSnap.exists() || isGoogleUser) && window.location.pathname.includes("auth.html")) {
    window.location.replace(await getLandingPageForUser(user));
  }
});

/* FORM SWITCHING */
window.showRegister = function(){
  document.getElementById("loginForm").classList.remove("active");
  document.getElementById("registerForm").classList.add("active");
};

window.showLogin = function(){
  document.getElementById("registerForm").classList.remove("active");
  document.getElementById("loginForm").classList.add("active");

  document.getElementById("registerTitle").textContent = "Create Account";
  document.getElementById("registerEmail").readOnly = false;
  document.getElementById("registerPasswordWrapper").style.display = "block";
  document.getElementById("registerBtn").textContent = "Register";
  document.getElementById("googleRegisterNote").style.display = "none";
  localStorage.removeItem(pendingGoogleKey);
};

/* LOGIN */
window.login = async function(){
  try{
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    if (!email || !password) {
      showPopup("Missing Fields", "Please enter your email and password.");
      return;
    }

    isHandlingAuthFlow = true;
    const cred = await signInWithEmailAndPassword(auth, email, password);
    clearSuperAdminMfaSession();
    clearAdminMfaSession();

    if (!cred.user.emailVerified) {
      await signOut(auth);
      isHandlingAuthFlow = false;

      showPopup(
        "Verify Your Email 📧",
        "Your email is not verified yet. Please check your inbox or spam folder before logging in.",
        {
          text: "Resend Verification",
          action: () => {
            closePopup();
            openResendPopup();
          }
        }
      );
      return;
    }

    await transferGuestProgressIfNeeded(cred.user.uid);

    window.location.replace(await getLandingPageForUser(cred.user));
  }catch(error){
    isHandlingAuthFlow = false;
    if (handleMfaRequired(error, "password")) return;
    showPopup("Login Error", error.message);
  }
};

/* REGISTER */
window.register = async function(){
  try{
    const name = document.getElementById("registerName").value.trim();
    const email = document.getElementById("registerEmail").value.trim();
    const passwordInput = document.getElementById("registerPassword");
    const password = passwordInput ? passwordInput.value : "";
    const pendingGoogle = readPendingGoogleRegistration();

    if (!name || !email) {
      showPopup("Missing Fields", "Please complete the required fields.");
      return;
    }

    if (!isPrivacyConsentChecked()) {
      showPopup("Privacy Consent Required", "Please review and accept the Privacy Policy before creating your account.");
      return;
    }

    /* COMPLETE GOOGLE REGISTRATION */
    if (pendingGoogle) {
      const pending = pendingGoogle;
      const userRef = doc(db, "users", pending.uid);

      isHandlingAuthFlow = true;

      const existingSnap = await getDoc(userRef);
      const existingData = existingSnap.exists() ? existingSnap.data() : {};

      await setDoc(userRef, {
        xp: existingData.xp || 0,
        xpWeekly: existingData.xpWeekly || 0,
        xpChange: existingData.xpChange || 0,
        name,
        email: pending.email,
        photo: pending.photo || "https://i.pravatar.cc/40?img=12",
        provider: "google",
        role: existingData.role || "user",
        createdAt: existingData.createdAt || Date.now(),
        progress: existingData.progress || {},
        privacyConsent: {
          accepted: true,
          acceptedAt: Date.now(),
          policyVersion: "2026-05-10"
        }
      });

      await syncPublicLeaderboardEntry(db, pending.uid, {
        name,
        photo: pending.photo || "https://i.pravatar.cc/40?img=12",
        xp: existingData.xp || 0,
        xpWeekly: existingData.xpWeekly || 0,
        xpChange: existingData.xpChange || 0
      });

      await transferGuestProgressIfNeeded(pending.uid);

      localStorage.removeItem(pendingGoogleKey);
      window.location.replace(await getLandingPageForUser(auth.currentUser));
      return;
    }

    /* EMAIL REGISTRATION */
    if (!password || password.length < 6) {
      showPopup("Weak Password", "Password must be at least 6 characters.");
      return;
    }

    isHandlingAuthFlow = true;

    const cred = await createUserWithEmailAndPassword(auth, email, password);

    await setDoc(doc(db, "users", cred.user.uid), {
      xp: 0,
      xpWeekly: 0,
      xpChange: 0,
      name,
      email,
      photo: "https://i.pravatar.cc/40?img=12",
      provider: "password",
      role: "user",
      createdAt: Date.now(),
      progress: {},
      privacyConsent: {
        accepted: true,
        acceptedAt: Date.now(),
        policyVersion: "2026-05-10"
      }
    });

    await syncPublicLeaderboardEntry(db, cred.user.uid, {
      name,
      photo: "https://i.pravatar.cc/40?img=12",
      xp: 0,
      xpWeekly: 0,
      xpChange: 0
    });

    await transferGuestProgressIfNeeded(cred.user.uid);

    await cred.user.reload();
    await new Promise(resolve => setTimeout(resolve, 1200));

    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser);
    }

    await signOut(auth);
    isHandlingAuthFlow = false;

    document.getElementById("loginEmail").value = email;

    showPopup(
      "Check Your Email 📧",
      "Your account was created successfully. We sent a verification link to your email. If it does not arrive right away, check your spam folder.",
      {
        text: "Resend Verification",
        action: () => {
          closePopup();
          openResendPopup();
        }
      }
    );

    showLogin();

    document.getElementById("registerName").value = "";
    document.getElementById("registerEmail").value = "";
    if (document.getElementById("registerPassword")) {
      document.getElementById("registerPassword").value = "";
    }

  }catch(error){
    isHandlingAuthFlow = false;
    console.error("REGISTER ERROR:", error);
    showPopup("Registration Error", error.message);
  }
};

/* GOOGLE LOGIN */
window.googleLogin = async function(){
  if (googleSignInInFlight) return;

  try{
    googleSignInInFlight = true;
    setGoogleButtonsLoading(true, "Opening Google...");
    const provider = createGoogleProvider();

    isHandlingAuthFlow = true;

    if (shouldUseGoogleRedirect()) {
      sessionStorage.setItem(googleRedirectPendingKey, "true");
      setGoogleButtonsLoading(true, "Redirecting to Google...");
      await signInWithRedirect(auth, provider);
      return;
    }

    const result = await signInWithPopup(auth, provider);
    clearSuperAdminMfaSession();
    clearAdminMfaSession();
    await finishGoogleSignIn(result.user);
  }catch(error){
    isHandlingAuthFlow = false;
    googleSignInInFlight = false;
    setGoogleButtonsLoading(false);
    if (handleMfaRequired(error, "google")) return;
    showPopup("Google Login Error", getGoogleAuthErrorMessage(error));
  }
};

function createGoogleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: "select_account"
  });
  return provider;
}

function shouldUseGoogleRedirect() {
  const userAgent = navigator.userAgent || "";
  const isMobileBrowser = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  const isTouchSmallScreen = Boolean(
    window.matchMedia?.("(pointer: coarse)")?.matches &&
    window.matchMedia?.("(max-width: 900px)")?.matches
  );

  return isMobileBrowser || isTouchSmallScreen;
}

async function handleGoogleRedirectResult() {
  const wasRedirectPending = sessionStorage.getItem(googleRedirectPendingKey) === "true";
  if (!wasRedirectPending) return;

  try {
    setGoogleButtonsLoading(true, "Finishing Google sign-in...");
    const result = await getRedirectResult(auth);
    sessionStorage.removeItem(googleRedirectPendingKey);

    if (!result?.user) {
      isHandlingAuthFlow = false;
      googleSignInInFlight = false;
      setGoogleButtonsLoading(false);
      return;
    }

    clearSuperAdminMfaSession();
    clearAdminMfaSession();
    await finishGoogleSignIn(result.user);
  } catch (error) {
    sessionStorage.removeItem(googleRedirectPendingKey);
    isHandlingAuthFlow = false;
    googleSignInInFlight = false;
    setGoogleButtonsLoading(false);
    if (handleMfaRequired(error, "google")) return;
    showPopup("Google Login Error", getGoogleAuthErrorMessage(error));
  }
}

function readPendingGoogleRegistration() {
  const raw = localStorage.getItem(pendingGoogleKey);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(pendingGoogleKey);
    return null;
  }
}

function setGoogleButtonsLoading(isLoading, labelText = "") {
  document.querySelectorAll(".google-btn").forEach((button) => {
    const label = button.querySelector("span:last-child");
    if (label && !label.dataset.defaultText) {
      label.dataset.defaultText = label.textContent;
    }

    button.disabled = isLoading;
    if (label) {
      label.textContent = isLoading ? labelText : label.dataset.defaultText;
    }
  });
}

function getGoogleAuthErrorMessage(error) {
  if (error?.code === "auth/cancelled-popup-request") {
    return "A Google sign-in window is already open. Finish that window, or close it and try again.";
  }

  if (error?.code === "auth/popup-blocked") {
    return "Your browser blocked the Google sign-in window. Allow popups for this site or try again on mobile redirect sign-in.";
  }

  if (error?.code === "auth/popup-closed-by-user") {
    return "The Google sign-in window was closed before login finished.";
  }

  if (error?.code === "auth/redirect-cancelled-by-user") {
    return "Google sign-in was cancelled before it finished.";
  }

  return error?.message || "Google sign-in could not be completed. Please try again.";
}

function handleMfaRequired(error, provider) {
  if (error?.code !== "auth/multi-factor-auth-required") return false;

  activeMfaResolver = getMultiFactorResolver(auth, error);
  activeMfaProvider = provider;
  const totpHint = getTotpHint(activeMfaResolver);
  if (!totpHint) {
    showPopup("2FA Error", "This account uses a second factor that Code Recall cannot verify yet.");
    return true;
  }

  const codeInput = document.getElementById("mfaChallengeCode");
  if (codeInput) codeInput.value = "";
  const label = document.getElementById("mfaChallengeLabel");
  if (label) {
    label.textContent = totpHint.displayName
      ? `No QR code is needed. Enter the current 6-digit code from ${totpHint.displayName}.`
      : "No QR code is needed. Enter the current 6-digit code from your authenticator app.";
  }
  setMfaChallengeStatus("");
  document.getElementById("mfaChallengePopup")?.classList.add("active");
  window.setTimeout(() => codeInput?.focus(), 50);
  return true;
}

function getTotpHint(resolver) {
  return resolver?.hints?.find((hint) => hint.factorId === TotpMultiFactorGenerator.FACTOR_ID) || null;
}

function setMfaChallengeStatus(message, isError = false) {
  const status = document.getElementById("mfaChallengeStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error", isError);
}

window.closeMfaChallenge = function() {
  activeMfaResolver = null;
  document.getElementById("mfaChallengePopup")?.classList.remove("active");
};

window.confirmMfaChallenge = async function() {
  const code = document.getElementById("mfaChallengeCode")?.value?.trim() || "";
  const hint = getTotpHint(activeMfaResolver);
  if (!activeMfaResolver || !hint) {
    setMfaChallengeStatus("Please sign in again to restart 2FA.", true);
    return;
  }
  if (!code) {
    setMfaChallengeStatus("Enter your authenticator code first.", true);
    return;
  }

  const button = document.getElementById("mfaChallengeBtn");
  if (button) {
    button.disabled = true;
    button.textContent = "Verifying...";
  }

  try {
    const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code);
    const result = await activeMfaResolver.resolveSignIn(assertion);
    const verifiedProvider = activeMfaProvider;
    const verifiedRole = await resolveUserRole(db, result.user);
    await syncNativeMfaProfile(db, result.user, verifiedRole, {
      method: `firebase_totp_${verifiedProvider}`
    });
    activeMfaResolver = null;
    document.getElementById("mfaChallengePopup")?.classList.remove("active");
    clearSuperAdminMfaSession();
    clearAdminMfaSession();

    if (verifiedProvider === "google") {
      await finishGoogleSignIn(result.user);
    } else {
      await finishPasswordSignIn(result.user);
    }
  } catch (error) {
    console.error("MFA challenge failed.", error);
    setMfaChallengeStatus("That authenticator code was not accepted. Try the current code from your app.", true);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Verify";
    }
  }
};

async function finishPasswordSignIn(user) {
  if (!user.emailVerified) {
    await signOut(auth);
    isHandlingAuthFlow = false;

    showPopup(
      "Verify Your Email 📧",
      "Your email is not verified yet. Please check your inbox or spam folder before logging in.",
      {
        text: "Resend Verification",
        action: () => {
          closePopup();
          openResendPopup();
        }
      }
    );
    return;
  }

  await transferGuestProgressIfNeeded(user.uid);
  window.location.replace(await getLandingPageForUser(user));
}

async function finishGoogleSignIn(user) {
  const userRef = doc(db, "users", user.uid);
  const docSnap = await getDoc(userRef);

  if (docSnap.exists()) {
    await transferGuestProgressIfNeeded(user.uid);
    localStorage.removeItem(pendingGoogleKey);
    window.location.replace(await getLandingPageForUser(user));
    return;
  }

  const pending = {
    uid: user.uid,
    email: user.email || "",
    name: user.displayName || "",
    photo: user.photoURL || ""
  };

  localStorage.setItem(pendingGoogleKey, JSON.stringify(pending));
  isHandlingAuthFlow = false;
  googleSignInInFlight = false;
  setGoogleButtonsLoading(false);
  showPendingGoogleRegistration(pending);
}

function showPendingGoogleRegistration(pending){
  showRegister();

  document.getElementById("registerTitle").textContent = "Complete Google Registration";
  document.getElementById("registerName").value = pending.name || "";
  document.getElementById("registerEmail").value = pending.email || "";
  document.getElementById("registerEmail").readOnly = true;
  document.getElementById("registerPasswordWrapper").style.display = "none";
  document.getElementById("registerBtn").textContent = "Complete Registration";
  document.getElementById("googleRegisterNote").style.display = "block";
}

function isPrivacyConsentChecked() {
  return Boolean(document.getElementById("privacyConsent")?.checked);
}

/* RESET PASSWORD POPUP */
window.openResetPopup = function(){
  document.getElementById("resetPopup").classList.add("active");
  document.getElementById("resetEmail").value =
    document.getElementById("loginEmail").value.trim();
};

window.closeResetPopup = function(){
  document.getElementById("resetPopup").classList.remove("active");
};

window.confirmReset = async function(){
  try{
    const email = document.getElementById("resetEmail").value.trim();

    if (!email) {
      showPopup("Enter Email First", "Please enter your email.");
      return;
    }

    await sendPasswordResetEmail(auth, email);
    closeResetPopup();

    showPopup(
      "Reset Email Sent 🔑",
      "Check your email for the password reset link. Make sure to check your spam folder too."
    );
  }catch(error){
    showPopup("Reset Error", error.message);
  }
};

/* RESEND VERIFICATION POPUP */
window.openResendPopup = function(){
  document.getElementById("resendPopup").classList.add("active");
  document.getElementById("resendEmail").value =
    document.getElementById("loginEmail").value.trim();
  document.getElementById("resendPassword").value =
    document.getElementById("loginPassword").value;
};

window.closeResendPopup = function(){
  document.getElementById("resendPopup").classList.remove("active");
};

window.confirmResend = async function(){
  try{
    const email = document.getElementById("resendEmail").value.trim();
    const password = document.getElementById("resendPassword").value;

    if (!email || !password) {
      showPopup("Enter Credentials", "Please enter your email and password.");
      return;
    }

    isHandlingAuthFlow = true;
    const cred = await signInWithEmailAndPassword(auth, email, password);

    if (cred.user.emailVerified) {
      await signOut(auth);
      isHandlingAuthFlow = false;
      closeResendPopup();

      showPopup("Already Verified", "This email is already verified. You can log in normally.");
      return;
    }

    await cred.user.reload();
    await sendEmailVerification(auth.currentUser);
    await signOut(auth);
    isHandlingAuthFlow = false;

    closeResendPopup();

    showPopup(
      "Verification Resent 📧",
      "We sent another verification email. Please check your inbox or spam folder."
    );
  }catch(error){
    isHandlingAuthFlow = false;
    showPopup("Resend Error", error.message);
  }
};

/* GUEST MODE */
window.playGuest = function(){
  localStorage.setItem("guest", "true");
  if (!localStorage.getItem("guest_xp")) {
    localStorage.setItem("guest_xp", "0");
  }
  window.location.replace("dashboard.html");
};

/* GUEST SAVE SYSTEM */
async function transferGuestProgressIfNeeded(uid) {
  const shouldTransfer = localStorage.getItem("guest_pending_save") === "true";
  if (!shouldTransfer) {
    isHandlingAuthFlow = false;
    return;
  }

  const userRef = doc(db, "users", uid);
  const docSnap = await getDoc(userRef);
  const existingData = docSnap.exists() ? docSnap.data() : {};

  const guestXP = parseInt(localStorage.getItem("guest_xp")) || 0;

  const guestProgress = {
    hardware_pretest: localStorage.getItem("hardware_pretest") === "true",
    hardware_modules: localStorage.getItem("hardware_modules") === "true",
    hardware_quiz: localStorage.getItem("hardware_quiz") === "true",
    hardware_posttest: localStorage.getItem("hardware_posttest") === "true",
    electrical_pretest: localStorage.getItem("electrical_pretest") === "true",
    electrical_modules: localStorage.getItem("electrical_modules") === "true",
    electrical_quiz: localStorage.getItem("electrical_quiz") === "true",
    electrical_posttest: localStorage.getItem("electrical_posttest") === "true"
  };

  const mergedXP = (existingData.xp || 0) + guestXP;
  const mergedProgress = {
    ...(existingData.progress || {}),
    ...guestProgress
  };

  await setDoc(userRef, {
    ...existingData,
    xp: mergedXP,
    progress: mergedProgress
  });

  clearGuestAfterTransfer();
  isHandlingAuthFlow = false;
}

function clearGuestAfterTransfer() {
  const keysToRemove = [
    "guest",
    "guest_xp",
    "guest_streak",
    "guest_last_active_date",
    "guest_pending_save"
  ];

  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

/* MAIN POPUP */
function showPopup(title, message, extraAction = null){
  document.getElementById("popupTitle").textContent = title;
  document.getElementById("popupMessage").textContent = message;

  const extraBtn = document.getElementById("popupExtraBtn");

  if (extraAction) {
    extraBtn.style.display = "block";
    extraBtn.textContent = extraAction.text;
    extraBtn.onclick = extraAction.action;
  } else {
    extraBtn.style.display = "none";
    extraBtn.onclick = null;
  }

  document.getElementById("popup").classList.add("active");
}

window.closePopup = function(){
  document.getElementById("popup").classList.remove("active");
};

/* NAVIGATION */
window.goBack = function(){
  window.location.href = "index.html";
};

/* THEME */
function detectSystemTheme(){
  if(window.matchMedia('(prefers-color-scheme: light)').matches){
    document.body.classList.add("light-mode");
  }
}

function loadSavedTheme(){
  const saved = localStorage.getItem("theme");

  if(saved){
    document.body.classList.toggle("light-mode", saved === "light");
  } else {
    detectSystemTheme();
  }

  updateIcon();
}

window.toggleTheme = function(){
  document.body.classList.toggle("light-mode");

  const mode = document.body.classList.contains("light-mode") ? "light" : "dark";
  localStorage.setItem("theme", mode);

  updateIcon();
};

function updateIcon(){
  const icon = document.getElementById("themeIcon");
  const logo = document.querySelector(".main-logo");

  if(document.body.classList.contains("light-mode")){
    if(icon) icon.textContent = "\u2600\uFE0F";
    if(logo) logo.src = "assets/logo-light.png";
  } else {
    if(icon) icon.textContent = "\uD83C\uDF19";
    if(logo) logo.src = "assets/logo-dark.png";
  }
}

function showDeferredMfaNotice() {
  const notice = sessionStorage.getItem("code_recall_mfa_notice");
  if (!notice) return;
  sessionStorage.removeItem("code_recall_mfa_notice");
  showPopup("Two-Factor Verification Required", notice);
}

window.togglePassword = function(id){
  const input = document.getElementById(id);
  if (!input) return;
  input.type = input.type === "password" ? "text" : "password";
};

loadSavedTheme();
showDeferredMfaNotice();
handleGoogleRedirectResult();
