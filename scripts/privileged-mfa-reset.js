import { app } from "./firebase-config.js";
import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

const functions = getFunctions(app, "us-central1");

export async function resetOwnMfaEnrollment() {
  const reset = httpsCallable(functions, "resetOwnMfaEnrollment");
  const result = await reset({});
  return result.data || {};
}

export function describeAutomaticMfaResetError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || error?.details?.message || "").trim();
  if (code.includes("unauthenticated")) {
    return "Sign in again, then retry the 2FA reset.";
  }
  if (code.includes("permission-denied")) {
    return "Only admin and super-admin accounts can reset privileged 2FA.";
  }
  if (code.includes("not-found")) {
    return "The automatic 2FA reset service is not deployed yet. Deploy Firebase Functions, then try again.";
  }
  if (code || message) {
    return `Automatic 2FA reset is unavailable right now${code ? ` (${code})` : ""}${message ? `: ${message}` : "."}`;
  }
  return "Automatic 2FA reset is unavailable right now. Check the network connection and try again.";
}
