import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getIdTokenResult } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { ADMIN_EMAILS, SUPER_ADMIN_EMAILS } from "../data/admin-config.js";

const ROLE_ORDER = {
  guest: 0,
  user: 1,
  admin: 2,
  super_admin: 3
};

const ROLE_DEBUG_ENABLED = localStorage.getItem("role_debug") === "1";

export function normalizeRole(role) {
  if (role === "super_admin" || role === "admin" || role === "user" || role === "guest") {
    return role;
  }
  return "user";
}

function getConfiguredRoleFromEmail(email = "") {
  const normalizedEmail = email.trim().toLowerCase();
  if (SUPER_ADMIN_EMAILS.includes(normalizedEmail)) return "super_admin";
  if (ADMIN_EMAILS.includes(normalizedEmail)) return "admin";
  return "user";
}

export function getRoleFromUserData(data = {}) {
  const rawStoredRole = data.role || data.progress?.role || "";
  if (rawStoredRole) return normalizeRole(rawStoredRole);
  const configuredRole = getConfiguredRoleFromEmail(data.email || "");
  if (configuredRole !== "user") return configuredRole;
  return "user";
}

function getRoleFromClaims(claims = {}) {
  if (claims.role === "super_admin" || claims.super_admin === true) return "super_admin";
  if (claims.role === "admin" || claims.admin === true) return "admin";
  return "user";
}

function isPermissionDenied(error) {
  const code = String(error?.code || "");
  return code.includes("permission-denied") || code.includes("insufficient-permissions");
}

function logRoleWarning(message, error) {
  if (!ROLE_DEBUG_ENABLED) return;
  console.warn(message, error);
}

export async function resolveUserRole(db, user) {
  if (!user) return "guest";
  const normalizedEmail = (user.email || "").trim().toLowerCase();

  try {
    const token = await getIdTokenResult(user, true);
    const claimRole = getRoleFromClaims(token.claims || {});
    if (claimRole === "super_admin" || claimRole === "admin") {
      return claimRole;
    }
  } catch (error) {
    logRoleWarning("Unable to read user role claims.", error);
  }

  try {
    if (normalizedEmail) {
      const accessKey = encodeURIComponent(normalizedEmail);
      const accessSnap = await getDoc(doc(db, "accessRoles", accessKey));
      const accessData = accessSnap.exists() ? accessSnap.data() || {} : {};

      if (accessData.role === "super_admin" || accessData.role === "admin" || accessData.role === "user") {
        return accessData.role;
      }
    }
  } catch (error) {
    if (!isPermissionDenied(error)) {
      logRoleWarning("Unable to resolve user role from email grants.", error);
    }
  }

  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) {
      const storedRole = getRoleFromUserData(snap.data() || {});
      if (storedRole === "super_admin" || storedRole === "admin" || storedRole === "user") {
        return storedRole;
      }
    }
  } catch (error) {
    if (!isPermissionDenied(error)) {
      logRoleWarning("Unable to read stored user role.", error);
    }
  }

  const configuredRole = getConfiguredRoleFromEmail(normalizedEmail);
  if (configuredRole !== "user") {
    logRoleWarning("Using temporary configured admin email fallback. Replace this with Firebase Auth custom claims before public release.");
    return configuredRole;
  }

  return "user";
}

export async function syncUserRole(db, user, resolvedRole) {
  if (!db || !user) return;

  const normalizedRole = normalizeRole(resolvedRole);
  if (normalizedRole === "guest") return;

  try {
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);
    const existing = snap.exists() ? snap.data() || {} : {};
    const existingProgress = existing.progress || {};
    const currentStoredRole = existing.role || existingProgress.role || "user";

    if (currentStoredRole === normalizedRole && existing.role === normalizedRole) return;

    await setDoc(userRef, {
      email: existing.email || user.email || "",
      name: existing.name || user.displayName || user.email || "User",
      photo: existing.photo || user.photoURL || "https://i.pravatar.cc/40?img=12",
      role: normalizedRole,
      progress: {
        ...existingProgress,
        role: normalizedRole
      }
    }, { merge: true });
  } catch (error) {
    logRoleWarning("Unable to sync user role.", error);
  }
}

export function roleMeetsMinimum(role, minimumRole) {
  return (ROLE_ORDER[normalizeRole(role)] || 0) >= (ROLE_ORDER[normalizeRole(minimumRole)] || 0);
}

export function applyRoleNavigation(role, currentPath = "") {
  const normalized = normalizeRole(role);
  const adminLinks = document.querySelectorAll('[data-role-link="admin"]');
  const superAdminLinks = document.querySelectorAll('[data-role-link="super_admin"]');

  adminLinks.forEach((link) => {
    const isVisible = roleMeetsMinimum(normalized, "admin");
    link.hidden = !isVisible;
    link.setAttribute("aria-hidden", String(!isVisible));
    link.tabIndex = isVisible ? 0 : -1;
    link.style.display = isVisible ? "" : "none";
    link.classList.toggle("active-link", isVisible && currentPath && link.getAttribute("href") === currentPath);
  });

  superAdminLinks.forEach((link) => {
    const isVisible = roleMeetsMinimum(normalized, "super_admin");
    link.hidden = !isVisible;
    link.setAttribute("aria-hidden", String(!isVisible));
    link.tabIndex = isVisible ? 0 : -1;
    link.style.display = isVisible ? "" : "none";
    link.classList.toggle("active-link", isVisible && currentPath && link.getAttribute("href") === currentPath);
  });
}
