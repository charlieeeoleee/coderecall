import {
  getIdTokenResult,
  multiFactor,
  signOut,
  TotpMultiFactorGenerator
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

export function hasTotpFactor(user) {
  const factors = multiFactor(user).enrolledFactors || [];
  return factors.some((factor) => factor.factorId === TotpMultiFactorGenerator.FACTOR_ID);
}

export async function signedInWithSecondFactor(user) {
  const token = await getIdTokenResult(user, true);
  return Boolean(token.claims?.firebase?.sign_in_second_factor);
}

export async function enforcePrivilegedMfa({ auth, user, setupPath }) {
  if (!hasTotpFactor(user)) {
    window.location.replace(setupPath);
    return false;
  }

  if (!await signedInWithSecondFactor(user)) {
    sessionStorage.setItem("code_recall_mfa_notice", "Please sign in again and enter your authenticator code to access privileged controls.");
    await signOut(auth);
    window.location.replace("auth.html");
    return false;
  }

  return true;
}
