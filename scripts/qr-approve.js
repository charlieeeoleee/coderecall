import { app } from "./firebase-config.js";
import {
  getAuth,
  GoogleAuthProvider,
  browserLocalPersistence,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithRedirect
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

const auth = getAuth(app);
const functions = getFunctions(app, "us-central1");
const approveQrLoginRequest = httpsCallable(functions, "approveQrLoginRequest");
const authPersistenceReady = setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.warn("Firebase auth persistence could not be forced to local storage:", error);
});
const params = new URLSearchParams(window.location.search);
const requestId = params.get("requestId") || "";
const secret = params.get("secret") || "";
const pendingQrApprovalKey = "code_recall_pending_qr_approval";

let currentUser = null;
let approvalCompleted = false;
let authStateResolved = false;

function setStatus(message, isError = false) {
  const status = document.getElementById("approvalStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error", Boolean(isError));
}

function syncAccountLabel() {
  const account = document.getElementById("approvalAccount");
  const approveBtn = document.getElementById("approveQrBtn");
  const googleBtn = document.getElementById("phoneGoogleBtn");
  const passwordToggleBtn = document.getElementById("phonePasswordToggleBtn");
  if (!account || !approveBtn || !googleBtn || !passwordToggleBtn) return;
  const pending = getPendingQrApproval();
  const hasQrRequest = Boolean((requestId && secret) || (pending.requestId && pending.secret));

  if (!hasQrRequest) {
    account.textContent = "Invalid QR login link";
    approveBtn.disabled = true;
    googleBtn.hidden = true;
    passwordToggleBtn.hidden = true;
    setStatus("Generate a new QR code from the login page.", true);
    return;
  }

  if (currentUser) {
    account.textContent = currentUser.email || currentUser.displayName || "Signed-in account";
    approveBtn.disabled = false;
    googleBtn.hidden = true;
    passwordToggleBtn.hidden = true;
    document.getElementById("phonePasswordForm")?.setAttribute("hidden", "");
    setStatus("Ready to approve this desktop sign-in.");
    return;
  }

  account.textContent = "No phone account signed in";
  approveBtn.disabled = true;
  googleBtn.hidden = false;
  passwordToggleBtn.hidden = false;
  setStatus("Sign in on this phone first, then approve the QR login.");
}

async function approveLogin() {
  const approveBtn = document.getElementById("approveQrBtn");
  const pending = getPendingQrApproval();
  const activeRequestId = requestId || pending.requestId || "";
  const activeSecret = secret || pending.secret || "";
  if (!currentUser || !activeRequestId || !activeSecret || approvalCompleted) {
    syncAccountLabel();
    return;
  }

  approveBtn.disabled = true;
  setStatus("Approving desktop sign-in...");

  try {
    const result = await approveQrLoginRequest({ requestId: activeRequestId, secret: activeSecret });
    const email = result.data?.email || currentUser.email || "";
    approvalCompleted = true;
    sessionStorage.removeItem(pendingQrApprovalKey);
    setStatus(`Approved for ${email}. You can return to the desktop browser.`);
    document.getElementById("approvalCopy").textContent = "Desktop sign-in approved.";
  } catch (error) {
    console.error("Unable to approve QR login:", error);
    approveBtn.disabled = false;
    setStatus(error?.message || "Unable to approve QR login.", true);
  }
}

function savePendingQrApproval() {
  if (!requestId || !secret) return;
  sessionStorage.setItem(pendingQrApprovalKey, JSON.stringify({ requestId, secret }));
}

function getPendingQrApproval() {
  try {
    return JSON.parse(sessionStorage.getItem(pendingQrApprovalKey) || "{}") || {};
  } catch {
    return {};
  }
}

async function signInWithGoogle() {
  const googleBtn = document.getElementById("phoneGoogleBtn");
  if (googleBtn?.disabled) return;

  googleBtn.disabled = true;
  setStatus("Redirecting to Google sign-in...");

  try {
    savePendingQrApproval();
    await authPersistenceReady;
    const provider = new GoogleAuthProvider();
    await signInWithRedirect(auth, provider);
  } catch (error) {
    console.error("Phone Google redirect sign-in failed:", error);
    setStatus(error?.message || "Google sign-in could not start.", true);
    googleBtn.disabled = false;
  }
}

async function signInWithEmail(event) {
  event.preventDefault();
  const form = document.getElementById("phonePasswordForm");
  const email = document.getElementById("phoneEmail")?.value.trim();
  const password = document.getElementById("phonePassword")?.value || "";
  if (!email || !password) {
    setStatus("Enter your email and password first.", true);
    return;
  }

  const button = form?.querySelector("button[type='submit']");
  if (button) button.disabled = true;
  setStatus("Signing in with email...");

  try {
    savePendingQrApproval();
    await authPersistenceReady;
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    console.error("Phone email sign-in failed:", error);
    setStatus(error?.message || "Email sign-in failed.", true);
  } finally {
    if (button) button.disabled = false;
  }
}

function togglePasswordForm() {
  const form = document.getElementById("phonePasswordForm");
  const toggle = document.getElementById("phonePasswordToggleBtn");
  if (!form || !toggle) return;
  const nextHidden = !form.hidden;
  form.hidden = nextHidden;
  toggle.textContent = nextHidden ? "Use Email Instead" : "Hide Email Sign-In";
}

async function handleGoogleRedirectReturn() {
  const pending = getPendingQrApproval();
  if (!pending.requestId || !pending.secret) return;

  try {
    const result = await Promise.race([
      authPersistenceReady.then(() => getRedirectResult(auth)),
      new Promise((resolve) => window.setTimeout(() => resolve(null), 5000))
    ]);
    if (result?.user) {
      currentUser = result.user;
    }
    setStatus("Returned from Google. Checking account...");
  } catch (error) {
    console.error("Google redirect result failed:", error);
    setStatus(error?.message || "Google sign-in was not completed.", true);
  } finally {
    syncAccountLabel();
  }
}

document.getElementById("approveQrBtn")?.addEventListener("click", approveLogin);
document.getElementById("phoneGoogleBtn")?.addEventListener("click", signInWithGoogle);
document.getElementById("phonePasswordToggleBtn")?.addEventListener("click", togglePasswordForm);
document.getElementById("phonePasswordForm")?.addEventListener("submit", signInWithEmail);

onAuthStateChanged(auth, (user) => {
  authStateResolved = true;
  currentUser = user || null;
  syncAccountLabel();
  if (currentUser && getPendingQrApproval().requestId && !approvalCompleted) {
    approveLogin();
  }
});

syncAccountLabel();
handleGoogleRedirectReturn();

window.setTimeout(() => {
  if (authStateResolved || currentUser || approvalCompleted) return;
  syncAccountLabel();
  setStatus("Still checking the phone sign-in. If this stays here, use Email Instead or reopen the QR link.", true);
}, 8000);
