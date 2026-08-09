import { app } from "./firebase-config.js";
import {
  getAuth,
  GoogleAuthProvider,
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { apiRequest, describeBackendError } from "./backend-api.js";

const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const params = new URLSearchParams(window.location.search);
const requestId = String(params.get("requestId") || "").trim();
const secret = String(params.get("secret") || "").trim();

let currentUser = null;

setPersistence(auth, browserLocalPersistence).catch(() => {});

function setStatus(message, isError = false) {
  const status = document.getElementById("approvalStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error", Boolean(isError));
}

function setAccountText() {
  const account = document.getElementById("approvalAccount");
  if (!account) return;
  if (!requestId || !secret) {
    account.textContent = "Invalid QR request";
    return;
  }
  account.textContent = currentUser
    ? currentUser.email || currentUser.displayName || "Signed-in phone"
    : "Sign in on this phone";
}

function syncState() {
  const approveBtn = document.getElementById("approveQrBtn");
  const googleBtn = document.getElementById("phoneGoogleBtn");
  const passwordToggleBtn = document.getElementById("phonePasswordToggleBtn");
  const copy = document.getElementById("approvalCopy");

  setAccountText();
  if (!requestId || !secret) {
    if (approveBtn) approveBtn.disabled = true;
    if (googleBtn) googleBtn.hidden = true;
    if (passwordToggleBtn) passwordToggleBtn.hidden = true;
    document.getElementById("phonePasswordForm")?.setAttribute("hidden", "");
    if (copy) copy.textContent = "This QR approval link is missing required request details.";
    setStatus("Generate a fresh QR code from the sign-in page.", true);
    return;
  }

  if (approveBtn) approveBtn.disabled = !currentUser;
  if (googleBtn) googleBtn.hidden = Boolean(currentUser);
  if (passwordToggleBtn) passwordToggleBtn.hidden = Boolean(currentUser);
  if (copy) {
    copy.textContent = currentUser
      ? "Confirm that the QR code is still visible on your own computer."
      : "Sign in on this phone first, then approve the desktop sign-in.";
  }
  setStatus(currentUser ? "Ready to approve this desktop sign-in." : "Sign in to approve this QR request.");
}

async function approveRequest() {
  if (!currentUser) {
    setStatus("Sign in on this phone first.", true);
    return;
  }

  const approveBtn = document.getElementById("approveQrBtn");
  if (approveBtn) approveBtn.disabled = true;
  setStatus("Approving secure sign-in...");

  try {
    await apiRequest("/api/auth/qr/approve", {
      method: "POST",
      auth: true,
      body: { requestId, secret }
    });
    setStatus("Approved. Return to your computer to continue.");
    if (approveBtn) approveBtn.textContent = "Approved";
  } catch (error) {
    setStatus(describeBackendError(error, "Unable to approve this QR login. Generate a new code and try again."), true);
    if (approveBtn) approveBtn.disabled = false;
  }
}

document.getElementById("approveQrBtn")?.addEventListener("click", approveRequest);

document.getElementById("phoneGoogleBtn")?.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    setStatus(error?.message || "Google sign-in could not start.", true);
  }
});

document.getElementById("phonePasswordToggleBtn")?.addEventListener("click", () => {
  const form = document.getElementById("phonePasswordForm");
  if (!form) return;
  form.toggleAttribute("hidden");
});

document.getElementById("phonePasswordForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.getElementById("phoneEmail")?.value.trim() || "";
  const password = document.getElementById("phonePassword")?.value || "";
  if (!email || !password) {
    setStatus("Enter your email and password.", true);
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    setStatus(error?.message || "Email sign-in failed.", true);
  }
});

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  syncState();
});

syncState();
