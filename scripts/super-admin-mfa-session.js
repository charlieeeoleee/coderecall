const SUPER_ADMIN_MFA_SESSION_KEY = "super_admin_mfa_session_v1";
const SUPER_ADMIN_MFA_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function readSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SUPER_ADMIN_MFA_SESSION_KEY) || "null");
  } catch (error) {
    return null;
  }
}

export function isSuperAdminMfaVerified(uid) {
  if (!uid) return false;
  const session = readSession();
  if (!session || session.uid !== uid) return false;
  const verifiedAt = Number(session.verifiedAt || 0);
  if (!verifiedAt) return false;
  return (Date.now() - verifiedAt) <= SUPER_ADMIN_MFA_SESSION_MAX_AGE_MS;
}

export function markSuperAdminMfaVerified(uid) {
  if (!uid) return;
  sessionStorage.setItem(
    SUPER_ADMIN_MFA_SESSION_KEY,
    JSON.stringify({
      uid,
      verifiedAt: Date.now()
    })
  );
}

export function clearSuperAdminMfaSession() {
  sessionStorage.removeItem(SUPER_ADMIN_MFA_SESSION_KEY);
}
