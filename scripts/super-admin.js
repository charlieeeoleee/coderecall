import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  initSounds,
  initGlobalClickSound,
  tryStartMusic,
  restartThemeMusic
} from "./sound.js";
import { applyRoleNavigation, getRoleFromUserData, resolveUserRole, syncUserRole } from "./role-utils.js";

const firebaseConfig = {
  apiKey: "AIzaSyDZiVk1T6ZbpKJrhRt1wQAr2vSSn4Wa_KU",
  authDomain: "gamifiedlearningsystem.firebaseapp.com",
  projectId: "gamifiedlearningsystem",
  storageBucket: "gamifiedlearningsystem.firebasestorage.app",
  messagingSenderId: "516998404507",
  appId: "1:516998404507:web:0c625f9af2809ca4b6a93e"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "auth.html";
    return;
  }

  currentUser = user;
  const role = await resolveUserRole(db, user);
  await syncUserRole(db, user, role);
  applyRoleNavigation(role, "super-admin.html");

  if (role !== "super_admin") {
    window.location.href = "dashboard.html";
    return;
  }

  updateUserUI(user);
  await loadSuperAdminDashboard();
});

async function loadSuperAdminDashboard() {
  const [
    usersSnap,
    grantsSnap,
    pendingUsersSnap,
    moduleDraftsSnap,
    quizDraftsSnap,
    notesSnap,
    auditSnap
  ] = await Promise.all([
    safeGetDocs("users", collection(db, "users")),
    safeGetDocs("accessRoles", collection(db, "accessRoles")),
    safeGetDocs("pendingUsers", collection(db, "pendingUsers")),
    safeGetDocs("moduleDrafts", collection(db, "moduleDrafts")),
    safeGetDocs("quizDrafts", collection(db, "quizDrafts")),
    safeGetDocs("feedbackNotes", collection(db, "feedbackNotes")),
    safeGetDocs("auditLogs", query(collection(db, "auditLogs"), orderBy("createdAt", "desc"), limit(12)))
  ]);

  const users = usersSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
  const grants = grantsSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
  const pendingUsers = pendingUsersSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
  const moduleDrafts = moduleDraftsSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
  const quizDrafts = quizDraftsSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
  const notes = notesSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
  const audits = auditSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }));

  renderOverview(users);
  renderAccessGrantList(grants);
  renderSystemHealth(users, grants, pendingUsers, moduleDrafts, quizDrafts, notes);
  renderUserTable(users);
  renderAuditLog(audits);
  wireAccessGrantForm();
  wireIntakeForm();
}

async function syncGrantedRoleToExistingUsers(email, role) {
  if (!email) return 0;

  const matchingUsers = await getDocs(
    query(collection(db, "users"), where("email", "==", email))
  );

  let updatedCount = 0;

  for (const userSnap of matchingUsers.docs) {
    const data = userSnap.data() || {};
    await updateDoc(doc(db, "users", userSnap.id), {
      role,
      progress: {
        ...(data.progress || {}),
        role
      }
    });
    updatedCount += 1;
  }

  return updatedCount;
}

async function safeGetDocs(label, source) {
  try {
    return await getDocs(source);
  } catch (error) {
    console.error(`Super Admin read blocked for collection/query: ${label}`, error);
    return { docs: [] };
  }
}

function renderOverview(users) {
  const totalUsers = users.length;
  const totalAdmins = users.filter((user) => getRoleFromUserData(user) === "admin").length;
  const totalSupers = users.filter((user) => getRoleFromUserData(user) === "super_admin").length;
  const averageXp = users.length
    ? Math.round(users.reduce((sum, user) => sum + (user.xp || 0), 0) / users.length)
    : 0;

  setText("superTotalUsers", totalUsers);
  setText("superAdminCount", totalAdmins);
  setText("superSuperCount", totalSupers);
  setText("superAverageXp", `${averageXp} XP`);
}

function renderSystemHealth(users, grants, pendingUsers, moduleDrafts, quizDrafts, notes) {
  const grid = document.getElementById("systemHealthGrid");
  if (!grid) return;

  const suspendedUsers = users.filter((user) => user.status === "suspended").length;
  const pendingModuleDrafts = moduleDrafts.filter((draft) => (draft.status || "pending") === "pending").length;
  const pendingQuizDrafts = quizDrafts.filter((draft) => (draft.status || "pending") === "pending").length;

  const cards = [
    { title: "Email Grants", value: grants.length, detail: "Saved admin and super admin access grants." },
    { title: "Pending Intake", value: pendingUsers.length, detail: "User records prepared for onboarding before first login." },
    { title: "Suspended Users", value: suspendedUsers, detail: "Accounts currently blocked from normal system use." },
    { title: "Pending Module Drafts", value: pendingModuleDrafts, detail: "Module drafts waiting for admin review." },
    { title: "Pending Quiz Drafts", value: pendingQuizDrafts, detail: "Quiz drafts waiting for admin review." },
    { title: "Support Notes", value: notes.length, detail: "Coaching notes recorded by admins for learners." },
    { title: "Active Records", value: users.filter((user) => (user.status || "active") === "active").length, detail: "Users currently marked active in the platform." }
  ];

  grid.innerHTML = cards.map((card) => `
    <article class="analytics-card">
      <span>${card.title}</span>
      <strong>${card.value}</strong>
      <p>${card.detail}</p>
    </article>
  `).join("");
}

function renderUserTable(users) {
  const body = document.getElementById("superUserTableBody");
  if (!body) return;

  body.innerHTML = "";

  if (!users.length) {
    body.innerHTML = `<tr><td colspan="7">No users found.</td></tr>`;
    return;
  }

  users.forEach((user) => {
    const row = document.createElement("tr");
    const progressCount = Object.keys(user.progress || {}).filter((key) => user.progress[key] === true).length;
    const statusValue = user.status || "active";

    row.innerHTML = `
      <td>${escapeHtml(user.name || "User")}</td>
      <td>${escapeHtml(user.email || "No email")}</td>
      <td>
        <select class="inline-select" data-role-select="${user.id}">
          <option value="user" ${getRoleFromUserData(user) === "user" ? "selected" : ""}>User</option>
          <option value="admin" ${getRoleFromUserData(user) === "admin" ? "selected" : ""}>Admin</option>
          <option value="super_admin" ${getRoleFromUserData(user) === "super_admin" ? "selected" : ""}>Super Admin</option>
        </select>
      </td>
      <td>
        <select class="inline-select" data-status-select="${user.id}">
          <option value="active" ${statusValue === "active" ? "selected" : ""}>Active</option>
          <option value="suspended" ${statusValue === "suspended" ? "selected" : ""}>Suspended</option>
          <option value="archived" ${statusValue === "archived" ? "selected" : ""}>Archived</option>
        </select>
      </td>
      <td>${user.xp || 0}</td>
      <td>${progressCount} flags</td>
      <td>
        <button class="primary-action compact-action" data-save-user="${user.id}">Save</button>
        <button class="danger-action compact-action" data-delete-user="${user.id}" ${user.id === currentUser.uid ? "disabled" : ""}>Delete Record</button>
      </td>
    `;

    body.appendChild(row);
  });

  body.querySelectorAll("[data-save-user]").forEach((button) => {
    button.addEventListener("click", async () => {
      const userId = button.getAttribute("data-save-user");
      const roleSelect = body.querySelector(`[data-role-select="${userId}"]`);
      const statusSelect = body.querySelector(`[data-status-select="${userId}"]`);
      const selectedRole = roleSelect?.value || "user";
      const selectedStatus = statusSelect?.value || "active";
      const userRecord = users.find((entry) => entry.id === userId) || {};
      const nextProgress = {
        ...(userRecord.progress || {}),
        role: selectedRole
      };

      await updateDoc(doc(db, "users", userId), {
        role: selectedRole,
        status: selectedStatus,
        progress: nextProgress
      });

      await writeAuditLog("user_access_updated", `Updated user ${userId} to role ${selectedRole} and status ${selectedStatus}`);
      setStatus("User access updated successfully.");
      await loadSuperAdminDashboard();
    });
  });

  body.querySelectorAll("[data-delete-user]").forEach((button) => {
    button.addEventListener("click", async () => {
      const userId = button.getAttribute("data-delete-user");
      if (!userId || userId === currentUser.uid) return;
      const confirmed = window.confirm("Delete this user record from Firestore? This will not remove the Firebase Auth account.");
      if (!confirmed) return;
      await deleteDoc(doc(db, "users", userId));
      await writeAuditLog("user_record_deleted", `Deleted Firestore record for user ${userId}`);
      setStatus("User record removed. Reloading table...");
      await loadSuperAdminDashboard();
    });
  });
}

function wireAccessGrantForm() {
  const form = document.getElementById("accessGrantForm");
  if (!form || form.dataset.bound) return;

  form.dataset.bound = "true";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("accessEmailInput").value.trim().toLowerCase();
    const role = document.getElementById("accessRoleInput").value;

    if (!email) {
      setGrantStatus("Enter an email before saving.");
      return;
    }

    await setDoc(doc(db, "accessRoles", encodeURIComponent(email)), {
      email,
      role,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser.email || ""
    });

    const syncedUsers = await syncGrantedRoleToExistingUsers(email, role);

    await writeAuditLog("email_access_saved", `Granted ${role} access to ${email}`);

    form.reset();
    setGrantStatus(
      syncedUsers
        ? `Email access saved. Updated ${syncedUsers} existing user record(s) immediately.`
        : "Email access saved successfully."
    );
    await loadSuperAdminDashboard();
  });
}

function wireIntakeForm() {
  const form = document.getElementById("intakeUserForm");
  if (!form || form.dataset.bound) return;

  form.dataset.bound = "true";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = document.getElementById("intakeNameInput").value.trim();
    const email = document.getElementById("intakeEmailInput").value.trim().toLowerCase();
    const role = document.getElementById("intakeRoleInput").value;
    const statusEl = document.getElementById("intakeUserStatus");

    if (!name || !email) {
      if (statusEl) statusEl.textContent = "Enter both name and email to create a pending record.";
      return;
    }

    await addDoc(collection(db, "pendingUsers"), {
      name,
      email,
      role,
      status: "pending",
      xp: 0,
      xpWeekly: 0,
      xpChange: 0,
      progress: {},
      results: {},
      photo: "https://i.pravatar.cc/40?img=12",
      createdAt: serverTimestamp(),
      createdBy: currentUser.email || ""
    });

    await writeAuditLog("pending_user_created", `Created pending ${role} record for ${email}`);
    form.reset();
    if (statusEl) statusEl.textContent = "Pending user record created. Once that email signs in, the record is already ready.";
    await loadSuperAdminDashboard();
  });
}

function renderAccessGrantList(grants) {
  const list = document.getElementById("accessGrantList");
  if (!list) return;

  if (!grants.length) {
    list.innerHTML = `<div class="grant-item"><div><strong>No email grants yet</strong><p>Add an email above to grant admin or super admin access.</p></div></div>`;
    return;
  }

  list.innerHTML = "";

  grants
    .sort((a, b) => (a.email || "").localeCompare(b.email || ""))
    .forEach((grant) => {
      const item = document.createElement("div");
      item.className = "grant-item";
      item.innerHTML = `
        <div>
          <strong>${escapeHtml(grant.email || "Unknown email")}</strong>
          <p>Assigned role: ${escapeHtml(grant.role || "user")}</p>
        </div>
        <div class="grant-actions">
          <span class="status-pill">${escapeHtml(grant.role || "user")}</span>
          <button class="danger-action" data-remove-grant="${grant.id}">Remove</button>
        </div>
      `;
      list.appendChild(item);
    });

  list.querySelectorAll("[data-remove-grant]").forEach((button) => {
    button.addEventListener("click", async () => {
      const grantId = button.getAttribute("data-remove-grant");
      if (!grantId) return;
      const confirmed = window.confirm("Remove this email access grant?");
      if (!confirmed) return;
      await deleteDoc(doc(db, "accessRoles", grantId));
      await writeAuditLog("email_access_removed", `Removed email access grant ${grantId}`);
      setGrantStatus("Email access removed.");
      await loadSuperAdminDashboard();
    });
  });
}

function renderAuditLog(entries) {
  const list = document.getElementById("auditLogList");
  if (!list) return;

  if (!entries.length) {
    list.innerHTML = `<div class="review-item"><h5>No audit entries yet</h5><p>System actions will appear here as soon as admins and super admins start working.</p></div>`;
    return;
  }

  list.innerHTML = entries.map((entry) => `
    <article class="review-item">
      <div class="review-meta">
        <span class="meta-pill">${escapeHtml(entry.action || "action")}</span>
        <span class="meta-pill">${escapeHtml(entry.actorEmail || "system")}</span>
      </div>
      <p>${escapeHtml(entry.details || "No details recorded.")}</p>
    </article>
  `).join("");
}

async function writeAuditLog(action, details) {
  await addDoc(collection(db, "auditLogs"), {
    action,
    details,
    actorUid: currentUser.uid,
    actorEmail: currentUser.email || "",
    createdAt: serverTimestamp()
  });
}

function setStatus(message) {
  const el = document.getElementById("superAdminStatus");
  if (el) el.textContent = message;
}

function setGrantStatus(message) {
  const el = document.getElementById("accessGrantStatus");
  if (el) el.textContent = message;
}

function updateUserUI(user) {
  setText("username", user.displayName || user.email || "Super Admin");
  const photo = document.getElementById("userPhoto");
  if (photo) {
    photo.src = user.photoURL || "https://i.pravatar.cc/40?img=12";
  }
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

window.logout = async function() {
  if (auth.currentUser) {
    await signOut(auth);
  }
  window.location.href = "auth.html";
};

function loadTheme() {
  const saved = localStorage.getItem("theme");
  if (saved === "light") {
    document.body.classList.add("light-mode");
  }
  updateIcon();
}

window.toggleTheme = function() {
  document.body.classList.toggle("light-mode");
  const mode = document.body.classList.contains("light-mode") ? "light" : "dark";
  localStorage.setItem("theme", mode);
  updateIcon();
  restartThemeMusic();
};

function updateIcon() {
  const icon = document.getElementById("themeIcon");
  if (!icon) return;
  icon.textContent = document.body.classList.contains("light-mode") ? "\u2600\uFE0F" : "\uD83C\uDF19";
}

loadTheme();
initSounds();
initGlobalClickSound();
tryStartMusic();

document.body.addEventListener("click", () => {
  tryStartMusic();
}, { once: true });
