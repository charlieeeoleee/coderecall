import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { clearAdminMfaSession } from "./admin-mfa-session.js";
import { clearSuperAdminMfaSession } from "./super-admin-mfa-session.js";

export const SWITCH_ACCOUNT_SESSION_KEY = "code_recall_switch_account";

const TRANSIENT_SESSION_KEYS = [
  SWITCH_ACCOUNT_SESSION_KEY,
  "codeRecallGoogleRedirectPending",
  "code_recall_mfa_notice"
];

const TRANSIENT_LOCAL_KEYS = [
  "resume_activity",
  "recent_module_completion",
  "pendingGoogleRegistration",
  "guest",
  "guest_pending_save"
];

const TRANSIENT_LOCAL_KEY_PATTERNS = [
  /^resume_quiz_state_/,
  /^resume_module_state_/
];

export function clearPrivilegedMfaSessions() {
  clearAdminMfaSession();
  clearSuperAdminMfaSession();
}

export function clearTransientAccountState() {
  TRANSIENT_SESSION_KEYS.forEach((key) => sessionStorage.removeItem(key));
  TRANSIENT_LOCAL_KEYS.forEach((key) => localStorage.removeItem(key));

  Object.keys(localStorage).forEach((key) => {
    if (TRANSIENT_LOCAL_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
      localStorage.removeItem(key);
    }
  });
}

export async function signOutWithSessionCleanup(auth, options = {}) {
  clearPrivilegedMfaSessions();
  if (options.clearTransientAccountState !== false) {
    clearTransientAccountState();
  }
  if (auth?.currentUser) {
    await signOut(auth);
  }
}
