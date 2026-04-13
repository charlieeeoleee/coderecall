import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { SUPER_ADMIN_EMAILS } from "../data/admin-config.js";

const ROLE_ORDER = {
  guest: 0,
  user: 1,
  admin: 2,
  super_admin: 3
};

export function normalizeRole(role) {
  if (role === "super_admin" || role === "admin" || role === "user" || role === "guest") {
    return role;
  }
  return "user";
}

export function getRoleFromUserData(data = {}) {
  return normalizeRole(data.role || data.progress?.role || "user");
}

export async function resolveUserRole(db, user) {
  if (!user) return "guest";
  const normalizedEmail = (user.email || "").trim().toLowerCase();

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
    console.warn("Unable to resolve user role from email grants.", error);
  }

  if (SUPER_ADMIN_EMAILS.includes(normalizedEmail)) return "super_admin";

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    const userData = userSnap.exists() ? userSnap.data() || {} : {};
    const storedRole = getRoleFromUserData(userData);

    if (storedRole === "super_admin" || storedRole === "admin") {
      return storedRole;
    }
  } catch (error) {
    console.warn("Unable to read stored user role.", error);
  }

  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    const data = snap.exists() ? snap.data() || {} : {};
    return getRoleFromUserData(data);
  } catch (error) {
    console.warn("Unable to resolve user role from email grants.", error);
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
    console.warn("Unable to sync user role.", error);
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
    link.hidden = !roleMeetsMinimum(normalized, "admin");
    if (!link.hidden && currentPath && link.getAttribute("href") === currentPath) {
      link.classList.add("active-link");
    }
  });

  superAdminLinks.forEach((link) => {
    link.hidden = !roleMeetsMinimum(normalized, "super_admin");
    if (!link.hidden && currentPath && link.getAttribute("href") === currentPath) {
      link.classList.add("active-link");
    }
  });
}
