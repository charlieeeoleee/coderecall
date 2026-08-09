const { requireFirebaseUser, requirePrivilegedRole } = require("../../_lib/auth");
const { adminAuth, adminDb, FieldValue } = require("../../_lib/firebase-admin");
const { assertRateLimit } = require("../../_lib/rate-limit");
const { hashValue, logEvent, methodAllowed, readJsonBody, requestId, safeErrorPayload, sendJson } = require("../../_lib/http");

module.exports = async function handler(req, res) {
  const startedAt = Date.now();
  const id = requestId(req);
  const endpoint = "/api/admin/mfa/reset-own";
  try {
    methodAllowed(req, ["POST"]);
    await readJsonBody(req, { maxBytes: 1024 });
    const user = await requireFirebaseUser(req, { requestId: id, endpoint });
    await assertRateLimit("resetOwnMfaEnrollment", user.uid);
    const role = await requirePrivilegedRole(user.uid, user.token, ["admin", "super_admin"], { requestId: id, endpoint });
    const auth = adminAuth();
    const db = adminDb();
    const authUser = await auth.getUser(user.uid);
    const enrolledFactors = authUser.multiFactor?.enrolledFactors || [];

    await auth.updateUser(user.uid, {
      multiFactor: {
        enrolledFactors: []
      }
    });

    await db.collection("securityProfiles").doc(user.uid).set({
      uid: user.uid,
      email: authUser.email || "",
      role,
      firebaseMfaEnrolled: false,
      firebaseMfaProvider: "",
      firebaseMfaSource: "firebase_auth",
      lastVerificationMethod: "firebase_totp_vercel_api_reset",
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    await db.collection("auditLogs").add({
      action: role === "super_admin" ? "reset_own_super_admin_mfa" : "reset_own_admin_mfa",
      details: "Privileged user reset their own Firebase Auth MFA through the Vercel API.",
      actorUid: user.uid,
      actorEmail: authUser.email || "",
      createdAt: FieldValue.serverTimestamp()
    });

    logEvent("info", "mfa_reset_succeeded", {
      requestId: id,
      endpoint,
      userId: hashValue(user.uid),
      role,
      result: "success",
      latencyMs: Date.now() - startedAt
    });

    sendJson(res, 200, {
      ok: true,
      data: {
        uid: user.uid,
        email: authUser.email || "",
        role,
        removedFactorCount: enrolledFactors.length
      }
    });
  } catch (error) {
    const safe = safeErrorPayload(error);
    logEvent(safe.status < 500 ? "warn" : "error", "mfa_reset_failed", {
      requestId: id,
      endpoint,
      result: safe.body.code,
      latencyMs: Date.now() - startedAt
    });
    sendJson(res, safe.status, safe.body);
  }
};
