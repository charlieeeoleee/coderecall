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
import { signOutWithSessionCleanup } from "./auth-session.js";

const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const params = new URLSearchParams(window.location.search);
let requestId = String(params.get("requestId") || "").trim();
let secret = String(params.get("secret") || "").trim();
let currentUser = null;
let requestContext = null;
let contextLoading = false;
let terminalState = "";

const TERMINAL_PRESENTATIONS = {
  approved: { tone: "success", icon: "✓", title: "Approved", message: "Return to your computer to continue." },
  exchanging: { tone: "neutral", icon: "✓", title: "Approval Already Claimed", message: "The computer is completing this secure sign-in. This request cannot be changed." },
  exchanged: { tone: "neutral", icon: "✓", title: "Request Already Used", message: "Desktop sign-in is complete. Generate a fresh QR code for another sign-in." },
  denied: { tone: "danger", icon: "×", title: "Login Denied", message: "No sign-in was approved. Generate a fresh QR code from your computer to try again." },
  matching_failed: { tone: "danger", icon: "×", title: "Matching Code Incorrect", message: "The code did not match the code shown on your computer. This QR login request was cancelled. Generate a new QR code and try again." },
  cancelled: { tone: "neutral", icon: "–", title: "Request Cancelled", message: "This request was cancelled on the computer. Generate a fresh QR code to try again." },
  expired: { tone: "warning", icon: "!", title: "QR Code Expired", message: "Generate a fresh QR code from your computer to continue." },
  exchange_failed: { tone: "danger", icon: "!", title: "Sign-In Could Not Finish", message: "Return to your computer and generate a fresh QR code to try again." },
  used: { tone: "neutral", icon: "✓", title: "Request Already Used", message: "This QR request cannot be used again. Generate a fresh code for another sign-in." }
};

if (requestId || secret) {
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete("requestId");
  cleanUrl.searchParams.delete("secret");
  window.history.replaceState({}, document.title, `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
}

setPersistence(auth, browserLocalPersistence).catch(() => {});

function setStatus(message, isError = false) {
  const status = document.getElementById("approvalStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error", Boolean(isError));
}

function clearCapability() {
  requestId = "";
  secret = "";
  requestContext = null;
}

function showTerminalState(state) {
  const presentation = TERMINAL_PRESENTATIONS[state] || TERMINAL_PRESENTATIONS.used;
  terminalState = state;
  const terminal = document.getElementById("approvalTerminal");
  const card = document.querySelector(".approval-card");
  if (terminal) terminal.hidden = false;
  if (card) card.dataset.terminalTone = presentation.tone;
  document.getElementById("approvalTerminalIcon").textContent = presentation.icon;
  document.getElementById("approvalTerminalTitle").textContent = presentation.title;
  document.getElementById("approvalTerminalMessage").textContent = presentation.message;
  document.getElementById("approvalTitle").hidden = true;
  document.getElementById("approvalCopy").hidden = true;
  document.getElementById("approvalStatus").hidden = true;
  document.getElementById("matchingCodeForm").hidden = true;
  document.getElementById("phonePasswordForm").hidden = true;
  document.querySelector(".approval-actions").hidden = true;
  document.getElementById("approvalNote").hidden = true;
  renderContext();
}

function renderContext() {
  const element = document.getElementById("approvalContext");
  if (!element) return;
  if (!requestContext) {
    element.textContent = "";
    return;
  }
  const requested = requestContext.requestedAtMs ? new Date(requestContext.requestedAtMs).toLocaleString() : "recently";
  element.textContent = `${requestContext.browserCategory} on ${requestContext.osCategory} • ${requested}`;
}

function syncState() {
  if (terminalState) return;
  const valid = Boolean(requestId && secret);
  const matched = requestContext?.protocolVersion < 2 || requestContext?.matchedToCurrentUser;
  document.getElementById("approvalAccount").textContent = !valid
    ? "Invalid QR request"
    : currentUser?.email || currentUser?.displayName || (currentUser ? "Signed-in phone" : "Sign in on this phone");
  document.getElementById("approveQrBtn").hidden = !valid;
  document.getElementById("approveQrBtn").disabled = !currentUser || !valid || !matched;
  document.getElementById("approvalAccountLabel").hidden = !currentUser;
  document.getElementById("cancelQrBtn").hidden = !currentUser || !valid;
  document.getElementById("phoneGoogleBtn").hidden = Boolean(currentUser) || !valid;
  document.getElementById("phonePasswordToggleBtn").hidden = Boolean(currentUser) || !valid;
  document.getElementById("phoneSwitchAccountBtn").hidden = !currentUser;
  document.getElementById("matchingCodeForm").hidden = !currentUser || !valid || !requestContext?.matchingRequired || requestContext?.matchedToCurrentUser;
  document.getElementById("approvalNote").hidden = !currentUser || !valid;
  renderContext();

  if (requestContext?.status && TERMINAL_PRESENTATIONS[requestContext.status]) {
    showTerminalState(requestContext.terminalReason === "matching_failed" ? "matching_failed" : requestContext.status);
    return;
  }

  if (!valid) setStatus("Generate a fresh QR code from the sign-in page.", true);
  else if (!currentUser) setStatus("Sign in to view and approve this QR request.");
  else if (contextLoading) setStatus("Loading secure request context...");
  else if (!requestContext) setStatus("Unable to validate this request.", true);
  else if (requestContext.matchingRequired && !requestContext.matchedToCurrentUser) setStatus("Enter the three-digit code shown on your computer.");
  else setStatus("Matching complete. Review the account and approve this desktop sign-in.");
}

async function loadContext() {
  if (!currentUser || !requestId || !secret || contextLoading) return;
  contextLoading = true;
  syncState();
  try {
    requestContext = await apiRequest("/api/auth/qr/context", { method: "POST", auth: true, body: { requestId, secret } });
  } catch (error) {
    requestContext = null;
    if (/expired/i.test(String(error?.message || ""))) showTerminalState("expired");
    else setStatus(describeBackendError(error, "This QR request could not be validated."), true);
  } finally {
    contextLoading = false;
    if (!terminalState) syncState();
  }
}

document.getElementById("matchingCodeForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const matchingCode = document.getElementById("matchingCode")?.value.trim() || "";
  if (!/^\d{3}$/.test(matchingCode)) return setStatus("Enter exactly three digits.", true);
  try {
    await apiRequest("/api/auth/qr/match", { method: "POST", auth: true, body: { requestId, secret, matchingCode } });
    await loadContext();
  } catch (error) {
    if (error?.code === "matching_failed") {
      showTerminalState("matching_failed");
      clearCapability();
      return;
    }
    setStatus(describeBackendError(error, "The matching code was not accepted."), true);
  }
});

document.getElementById("approveQrBtn")?.addEventListener("click", async () => {
  if (!currentUser || !requestContext) return;
  const button = document.getElementById("approveQrBtn");
  button.disabled = true;
  setStatus("Approving secure sign-in...");
  try {
    await apiRequest("/api/auth/qr/approve", { method: "POST", auth: true, body: { requestId, secret } });
    showTerminalState("approved");
    clearCapability();
  } catch (error) {
    setStatus(describeBackendError(error, "Unable to approve this QR login."), true);
    button.disabled = false;
  }
});

document.getElementById("cancelQrBtn")?.addEventListener("click", async () => {
  if (currentUser && requestId && secret) {
    try {
      await apiRequest("/api/auth/qr/deny", { method: "POST", auth: true, body: { requestId, secret } });
    } catch (error) {
      setStatus(describeBackendError(error, "Unable to deny this QR login."), true);
      return;
    }
  }
  clearCapability();
  showTerminalState("denied");
});

document.getElementById("phoneSwitchAccountBtn")?.addEventListener("click", async () => {
  try {
    const wasMatched = requestContext?.matchedToCurrentUser;
    await signOutWithSessionCleanup(auth, { clearTransientAccountState: true });
    if (wasMatched) clearCapability();
    requestContext = null;
    setStatus(wasMatched ? "Request cleared after account switch. Scan a fresh QR." : "Signed out. Choose the account that should approve this login.");
  } catch {
    setStatus("Could not switch accounts. Try again before approving.", true);
  }
});

document.getElementById("phoneGoogleBtn")?.addEventListener("click", async () => {
  try { await signInWithPopup(auth, provider); }
  catch (error) { setStatus(error?.message || "Google sign-in could not start.", true); }
});

document.getElementById("phonePasswordToggleBtn")?.addEventListener("click", () => {
  document.getElementById("phonePasswordForm")?.toggleAttribute("hidden");
});

document.getElementById("phonePasswordForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.getElementById("phoneEmail")?.value.trim() || "";
  const password = document.getElementById("phonePassword")?.value || "";
  if (!email || !password) return setStatus("Enter your email and password.", true);
  try { await signInWithEmailAndPassword(auth, email, password); }
  catch (error) { setStatus(error?.message || "Email sign-in failed.", true); }
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  requestContext = null;
  syncState();
  if (user) await loadContext();
});

syncState();
