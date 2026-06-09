import { app } from "./firebase-config.js";
import {
  getAuth,
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithRedirect
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

const auth = getAuth(app);
const functions = getFunctions(app, "us-central1");
const approveQrLoginRequest = httpsCallable(functions, "approveQrLoginRequest");
const params = new URLSearchParams(window.location.search);
const requestId = params.get("requestId") || "";
const secret = params.get("secret") || "";
const pendingQrApprovalKey = "code_recall_pending_qr_approval";

let currentUser = null;
let approvalCompleted = false;

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
  if (!account || !approveBtn || !googleBtn) return;
  const pending = getPendingQrApproval();
  const hasQrRequest = Boolean((requestId && secret) || (pending.requestId && pending.secret));

  if (!hasQrRequest) {
    account.textContent = "Invalid QR login link";
    approveBtn.disabled = true;
    googleBtn.hidden = true;
    setStatus("Generate a new QR code from the login page.", true);
    return;
  }

  if (currentUser) {
    account.textContent = currentUser.email || currentUser.displayName || "Signed-in account";
    approveBtn.disabled = false;
    googleBtn.hidden = true;
    setStatus("Ready to approve this desktop sign-in.");
    return;
  }

  account.textContent = "No phone account signed in";
  approveBtn.disabled = true;
  googleBtn.hidden = false;
  setStatus("Sign in on this phone first, then approve the QR login.");
}

async function approveLogin() {
  const approveBtn = document.getElementById("approveQrBtn");
  const pending = getPendingQrApproval();
  const activeRequestId = requestId || pending.requestId || "";
  const activeSecret = secret || pending.secret || "";
  if (!currentUser || !activeRequestId || !activeSecret || approveBtn?.disabled || approvalCompleted) return;

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
    const provider = new GoogleAuthProvider();
    await signInWithRedirect(auth, provider);
  } catch (error) {
    console.error("Phone Google redirect sign-in failed:", error);
    setStatus(error?.message || "Google sign-in could not start.", true);
    googleBtn.disabled = false;
  }
}

async function handleGoogleRedirectReturn() {
  const pending = getPendingQrApproval();
  if (!pending.requestId || !pending.secret) return;

  try {
    await getRedirectResult(auth);
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

onAuthStateChanged(auth, (user) => {
  currentUser = user || null;
  syncAccountLabel();
  if (currentUser && getPendingQrApproval().requestId && !approvalCompleted) {
    approveLogin();
  }
});

handleGoogleRedirectReturn();
