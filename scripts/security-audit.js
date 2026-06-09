import {
  addDoc,
  collection,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const SECURITY_AUDIT_ACTIONS = new Set([
  "denied_admin_route",
  "denied_super_admin_route",
  "mfa_required_privileged_route",
  "mfa_enrollment_required",
  "reset_own_admin_mfa",
  "reset_own_super_admin_mfa"
]);

export async function writeSecurityAudit(db, user, action, details = "", metadata = {}) {
  if (!db || !user || !SECURITY_AUDIT_ACTIONS.has(action)) return;

  try {
    const safeMetadata = Object.fromEntries(
      Object.entries(metadata || {}).map(([key, value]) => [
        key,
        String(value ?? "").slice(0, 180)
      ])
    );

    await addDoc(collection(db, "auditLogs"), {
      action,
      details: String(details || "").slice(0, 500),
      metadata: safeMetadata,
      actorUid: user.uid,
      actorEmail: user.email || "",
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.warn("Unable to write security audit event.", error);
  }
}
