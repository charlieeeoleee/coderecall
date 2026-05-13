import {
  getIdTokenResult
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  doc,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const PRIVILEGED_ROLES = new Set(["admin", "super_admin"]);

export async function markNativeMfaEnrolled(db, user, role, options = {}) {
  if (!db || !user || !PRIVILEGED_ROLES.has(role)) return false;

  try {
    await setDoc(doc(db, "securityProfiles", user.uid), {
      uid: user.uid,
      email: user.email || "",
      role,
      firebaseMfaEnrolled: true,
      firebaseMfaProvider: options.provider || "totp",
      firebaseMfaSource: "firebase_auth",
      enrolledAt: serverTimestamp(),
      lastVerificationMethod: options.method || "firebase_totp_enrollment",
      updatedAt: serverTimestamp()
    }, { merge: true });

    return true;
  } catch (error) {
    console.warn("Unable to mark native Firebase MFA enrollment.", error);
    return false;
  }
}

export async function syncNativeMfaProfile(db, user, role, options = {}) {
  if (!db || !user || !PRIVILEGED_ROLES.has(role)) return false;

  try {
    const token = await getIdTokenResult(user, true);
    const secondFactor = token.claims?.firebase?.sign_in_second_factor || "";
    if (!secondFactor) return false;

    await setDoc(doc(db, "securityProfiles", user.uid), {
      uid: user.uid,
      email: user.email || "",
      role,
      firebaseMfaEnrolled: true,
      firebaseMfaProvider: secondFactor,
      firebaseMfaSource: "firebase_auth",
      lastVerifiedAt: serverTimestamp(),
      lastVerificationMethod: options.method || "firebase_totp",
      updatedAt: serverTimestamp()
    }, { merge: true });

    return true;
  } catch (error) {
    console.warn("Unable to mirror native Firebase MFA profile.", error);
    return false;
  }
}
