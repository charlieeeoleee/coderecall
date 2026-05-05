const ADMIN_MFA_SESSION_KEY = "admin_mfa_session_v1";
const ADMIN_MFA_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function readSession() {
  try {
    return JSON.parse(sessionStorage.getItem(ADMIN_MFA_SESSION_KEY) || "null");
  } catch (error) {
    return null;
  }
}

export function isAdminMfaVerified(uid) {
  if (!uid) return false;
  const session = readSession();
  if (!session || session.uid !== uid) return false;
  const verifiedAt = Number(session.verifiedAt || 0);
  if (!verifiedAt) return false;
  return (Date.now() - verifiedAt) <= ADMIN_MFA_SESSION_MAX_AGE_MS;
}

export function markAdminMfaVerified(uid) {
  if (!uid) return;
  sessionStorage.setItem(
    ADMIN_MFA_SESSION_KEY,
    JSON.stringify({
      uid,
      verifiedAt: Date.now()
    })
  );
}

export function clearAdminMfaSession() {
  sessionStorage.removeItem(ADMIN_MFA_SESSION_KEY);
}
