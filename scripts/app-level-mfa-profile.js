import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  buildOtpAuthUri,
  findMatchingBackupCodeIndex,
  formatSecret,
  generateBackupCodes,
  generateBase32Secret,
  hashBackupCodes,
  verifyTotpCode
} from "./mfa-totp.js";

export async function loadAppMfaProfile(db, uid) {
  if (!db || !uid) return null;
  const snap = await getDoc(doc(db, "securityProfiles", uid));
  return snap.exists() ? (snap.data() || {}) : null;
}

export function hasAppMfaEnrollment(profile) {
  return Boolean(profile?.appMfaEnabled && profile?.totpSecret);
}

export function createPendingAppMfaSetup(user, role) {
  const secret = generateBase32Secret();
  const backupCodes = generateBackupCodes();
  const email = user?.email || "";

  return {
    profile: {
      uid: user.uid,
      email,
      role,
      appMfaEnabled: true,
      appMfaSource: "app_totp",
      totpSecret: secret,
      backupCodeHashes: [],
      backupCodesRemaining: backupCodes.length,
      lastVerificationMethod: "app_totp_enrollment"
    },
    backupCodes,
    secret,
    formattedSecret: formatSecret(secret),
    setupUri: buildOtpAuthUri({
      secret,
      email,
      issuer: "Code Recall"
    })
  };
}

export async function savePendingAppMfaSetup(db, setup) {
  const backupCodeHashes = await hashBackupCodes(setup.backupCodes);
  await setDoc(doc(db, "securityProfiles", setup.profile.uid), {
    ...setup.profile,
    backupCodeHashes,
    backupCodesRemaining: backupCodeHashes.length,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastVerifiedAt: serverTimestamp()
  });
}

export async function verifyPendingAppMfaSetupCode(setup, code) {
  if (!setup?.secret) return false;
  return verifyTotpCode(setup.secret, code);
}

export async function verifyAppMfaProfileCode(db, user, profile, code, methodPrefix = "app_totp") {
  const normalizedCode = String(code || "").trim();
  if (!hasAppMfaEnrollment(profile)) return { ok: false, method: "" };

  if (await verifyTotpCode(profile.totpSecret, normalizedCode)) {
    await setDoc(doc(db, "securityProfiles", user.uid), {
      uid: user.uid,
      email: user.email || profile.email || "",
      role: profile.role || "admin",
      appMfaEnabled: true,
      appMfaSource: "app_totp",
      backupCodesRemaining: Array.isArray(profile.backupCodeHashes) ? profile.backupCodeHashes.length : 0,
      lastVerificationMethod: methodPrefix,
      lastVerifiedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
    return { ok: true, method: methodPrefix };
  }

  const backupHashes = Array.isArray(profile.backupCodeHashes) ? profile.backupCodeHashes : [];
  const backupIndex = await findMatchingBackupCodeIndex(normalizedCode, backupHashes);
  if (backupIndex >= 0) {
    const nextHashes = backupHashes.filter((_, index) => index !== backupIndex);
    await updateDoc(doc(db, "securityProfiles", user.uid), {
      backupCodeHashes: nextHashes,
      backupCodesRemaining: nextHashes.length,
      lastVerificationMethod: `${methodPrefix}_backup_code`,
      lastVerifiedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return { ok: true, method: `${methodPrefix}_backup_code` };
  }

  return { ok: false, method: "" };
}

export async function resetOwnAppMfaProfile(db, user, role) {
  await setDoc(doc(db, "securityProfiles", user.uid), {
    uid: user.uid,
    email: user.email || "",
    role,
    appMfaEnabled: false,
    appMfaSource: "app_totp",
    totpSecret: "",
    backupCodeHashes: [],
    backupCodesRemaining: 0,
    lastVerificationMethod: "app_totp_reset",
    updatedAt: serverTimestamp()
  });
}
