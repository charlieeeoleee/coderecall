const { adminAuth, adminDb } = require("./firebase-admin");
const { ApiError, hashValue, logEvent } = require("./http");

const PRIVILEGED_ROLES = new Set(["admin", "super_admin"]);
const ADMIN_EMAILS = new Set([
  "marvicdatulmansibang@gmail.com",
  "biancadenisemedel@gmail.com",
  "reinbarb27@gmail.com"
]);
const SUPER_ADMIN_EMAILS = new Set([
  "charlesvrobeso@gmail.com"
]);

function parseBearerToken(headerValue = "") {
  const header = String(headerValue || "").trim();
  if (!header) {
    throw new ApiError("unauthenticated", "Sign in before continuing.", 401);
  }
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1].trim()) {
    throw new ApiError("unauthenticated", "Use a valid Authorization bearer token.", 401);
  }
  return match[1].trim();
}

async function requireFirebaseUser(req, context = {}) {
  const token = parseBearerToken(req.headers.authorization);
  try {
    const decodedToken = await adminAuth().verifyIdToken(token);
    return {
      uid: decodedToken.uid,
      token: decodedToken
    };
  } catch (error) {
    logEvent("warn", "auth_token_rejected", {
      requestId: context.requestId,
      endpoint: context.endpoint,
      result: "invalid_token",
      errorCode: String(error?.code || "auth/invalid-token").slice(0, 80)
    });
    throw new ApiError("unauthenticated", "Sign in again before continuing.", 401);
  }
}

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase();
}

function roleFromClaims(claims = {}) {
  if (claims.role === "super_admin" || claims.super_admin === true) return "super_admin";
  if (claims.role === "admin" || claims.admin === true) return "admin";
  return "";
}

function privilegedRoleFromUserDoc(data = {}) {
  const directRole = normalizeRole(data.role);
  if (PRIVILEGED_ROLES.has(directRole)) return directRole;
  if (data.isSuperAdmin === true || data.super_admin === true) return "super_admin";
  if (data.isAdmin === true || data.admin === true) return "admin";
  return "";
}

async function resolvePrivilegedRole(uid, decodedToken = {}) {
  const claimRole = roleFromClaims(decodedToken || {});
  if (claimRole) return claimRole;

  const db = adminDb();
  const email = String(decodedToken.email || "").trim().toLowerCase();

  if (email) {
    const accessDoc = await db.collection("accessRoles").doc(encodeURIComponent(email)).get();
    if (accessDoc.exists) {
      const accessRole = normalizeRole(accessDoc.data()?.role);
      if (PRIVILEGED_ROLES.has(accessRole)) return accessRole;
      if (accessRole === "user") return "";
    }
  }

  const userDoc = await db.collection("users").doc(uid).get();
  if (userDoc.exists) {
    const userRole = privilegedRoleFromUserDoc(userDoc.data() || {});
    if (userRole) return userRole;
  }

  if (SUPER_ADMIN_EMAILS.has(email)) return "super_admin";
  if (ADMIN_EMAILS.has(email)) return "admin";
  return "";
}

async function requirePrivilegedRole(uid, decodedToken, allowedRoles, context = {}) {
  const role = await resolvePrivilegedRole(uid, decodedToken);
  if (!allowedRoles.includes(role)) {
    logEvent("warn", "authorization_rejected", {
      requestId: context.requestId,
      endpoint: context.endpoint,
      userId: hashValue(uid),
      role,
      result: "permission_denied"
    });
    throw new ApiError("permission_denied", "You do not have permission to do that.", 403);
  }
  return role;
}

module.exports = {
  PRIVILEGED_ROLES,
  parseBearerToken,
  requireFirebaseUser,
  requirePrivilegedRole,
  resolvePrivilegedRole
};
