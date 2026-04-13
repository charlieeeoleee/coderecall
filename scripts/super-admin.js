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
import {
  fetchModuleDrafts,
  fetchQuizDrafts
} from "./supabase-content.js";
import { SUPER_ADMIN_EMAILS } from "../data/admin-config.js";

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
let systemPopupAction = null;

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
    moduleDrafts,
    quizDrafts,
    notesSnap,
    auditSnap
  ] = await Promise.all([
    safeGetDocs("users", collection(db, "users")),
    safeGetDocs("accessRoles", collection(db, "accessRoles")),
    safeGetDocs("pendingUsers", collection(db, "pendingUsers")),
    safeSupabaseRead("module drafts", fetchModuleDrafts),
    safeSupabaseRead("quiz drafts", fetchQuizDrafts),
    safeGetDocs("feedbackNotes", collection(db, "feedbackNotes")),
    safeGetDocs("auditLogs", query(collection(db, "auditLogs"), orderBy("createdAt", "desc"), limit(12)))
  ]);

  const users = usersSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
  const grants = grantsSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
  const pendingUsers = pendingUsersSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
  const notes = notesSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
  const audits = auditSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }));

  renderOverview(users);
  renderAccessGrantList(grants);
  renderSystemHealth(users, grants, pendingUsers, moduleDrafts, quizDrafts, notes);
  renderUserTable(users);
  renderPublishingQueue(moduleDrafts, quizDrafts);
  renderManualImportChecklist();
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

async function clearGrantedRoleFromExistingUsers(email) {
  if (!email) return 0;

  const matchingUsers = await getDocs(
    query(collection(db, "users"), where("email", "==", email))
  );

  let updatedCount = 0;
  const nextRole = SUPER_ADMIN_EMAILS.includes(email) ? "super_admin" : "user";

  for (const userSnap of matchingUsers.docs) {
    const data = userSnap.data() || {};
    await updateDoc(doc(db, "users", userSnap.id), {
      role: nextRole,
      progress: {
        ...(data.progress || {}),
        role: nextRole
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

async function safeSupabaseRead(label, reader) {
  try {
    return await reader();
  } catch (error) {
    console.error(`Super Admin Supabase read failed for ${label}:`, error);
    return [];
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
    { title: "Approved Module Drafts", value: moduleDrafts.filter((draft) => (draft.status || "pending") === "approved").length, detail: "Approved module files waiting for manual system entry." },
    { title: "Approved Quiz Drafts", value: quizDrafts.filter((draft) => (draft.status || "pending") === "approved").length, detail: "Approved quiz files waiting for manual system entry." },
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

function renderPublishingQueue(moduleDrafts, quizDrafts) {
  const moduleList = document.getElementById("superModulePublishList");
  const quizList = document.getElementById("superQuizPublishList");

  if (moduleList) {
    moduleList.innerHTML = buildPublishMarkup(moduleDrafts, "module");
  }

  if (quizList) {
    quizList.innerHTML = buildPublishMarkup(quizDrafts, "quiz");
  }
}

function renderManualImportChecklist() {
  const container = document.getElementById("manualImportChecklist");
  if (!container) return;

  const steps = [
    {
      title: "1. Download and review the approved `.docx` draft",
      body: "Open the uploaded draft file, verify the subject, difficulty, and content quality, and confirm it matches the approved notes."
    },
    {
      title: "2. Add module content to the built-in files manually",
      body: "For lessons, copy the final text into the existing static module data files and keep the current structure used by the learner pages."
    },
    {
      title: "3. Add quiz items to the built-in assessment files manually",
      body: "For quizzes, encode each approved question into the existing quiz data files so progression stays tied to the built-in system."
    },
    {
      title: "4. Verify progression locally before release",
      body: "Run through the real student flow: pre-test, modules, quizzes, and post-test. Confirm unlocks, back buttons, and completion flags still work."
    },
    {
      title: "5. Record the manual import in the audit trail",
      body: "After the static files are updated, leave a clear implementation note or audit entry so the team knows the draft has already been imported."
    }
  ];

  container.innerHTML = steps.map((step) => `
    <article class="review-item">
      <h5>${step.title}</h5>
      <p>${step.body}</p>
    </article>
  `).join("");
}

function buildPublishMarkup(drafts, type) {
  if (!drafts.length) {
    return `<div class="review-item"><h5>No ${type} drafts yet</h5><p>Uploaded drafts will appear here for super-admin visibility.</p></div>`;
  }

  const items = drafts
    .slice()
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    .filter((draft) => ["pending", "approved", "rejected"].includes(draft.status || "pending"));

  if (!items.length) {
    return `<div class="review-item"><h5>No visible ${type} drafts yet</h5><p>Once admins upload drafts, their review status will appear here.</p></div>`;
  }

  return items.map((draft) => {
    const title = draft.title || draft.question || "Untitled draft";
    const meta = draft.difficulty || draft.quizType || "draft";
    const fileName = type === "module" ? extractStoredFileName(draft.tip) : extractStoredFileName(draft.rationale);
    const notes = type === "module" ? (draft.content || "") : stripStoredFileName(draft.rationale || "");
    const status = draft.status || "pending";
    const statusNote = status === "approved"
      ? "Manual import required"
      : status === "pending"
        ? "Waiting for admin review"
        : "Rejected draft";

    return `
      <article class="review-item">
        <h5>${escapeHtml(title)}</h5>
        <div class="review-meta">
          <span class="meta-pill">${escapeHtml(draft.subject || "general")}</span>
          <span class="meta-pill">${escapeHtml(meta)}</span>
          <span class="meta-pill">${escapeHtml(status)}</span>
        </div>
        <p>${escapeHtml(fileName ? `Attached file: ${fileName}` : "No attached file name recorded.")}</p>
        <p>${escapeHtml(notes.trim() || "No reviewer notes provided.")}</p>
        <p>Created by: ${escapeHtml(draft.createdByEmail || "Unknown")}</p>
        <div class="review-actions"><span class="meta-pill">${escapeHtml(statusNote)}</span></div>
      </article>
    `;
  }).join("");
}

function extractStoredFileName(value) {
  const text = String(value || "");
  const match = text.match(/^FILE:(.+)$/m);
  return match ? match[1].trim() : "";
}

function stripStoredFileName(value) {
  return String(value || "").replace(/^FILE:.+\n?/m, "");
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
      openSystemPopup(
        "Delete User Record",
        "Delete this user record from Firestore? This will not remove the Firebase Auth account.",
        async () => {
          await deleteDoc(doc(db, "users", userId));
          await writeAuditLog("user_record_deleted", `Deleted Firestore record for user ${userId}`);
          setStatus("User record removed. Reloading table...");
          closeSystemPopup();
          await loadSuperAdminDashboard();
        }
      );
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
      openSystemPopup(
        "Remove Email Access",
        "Remove this email access grant?",
        async () => {
          await deleteDoc(doc(db, "accessRoles", grantId));
          const syncedUsers = await clearGrantedRoleFromExistingUsers(grant.email || "");
          await writeAuditLog("email_access_removed", `Removed email access grant ${grantId}`);
          setGrantStatus(
            syncedUsers
              ? `Email access removed. Reverted ${syncedUsers} existing user record(s).`
              : "Email access removed."
          );
          closeSystemPopup();
          await loadSuperAdminDashboard();
        }
      );
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

function openSystemPopup(title, message, confirmAction) {
  const popup = document.getElementById("systemPopup");
  const titleEl = document.getElementById("systemPopupTitle");
  const messageEl = document.getElementById("systemPopupMessage");
  const confirmBtn = document.getElementById("systemPopupConfirmBtn");
  if (!popup || !titleEl || !messageEl || !confirmBtn) return;

  systemPopupAction = confirmAction;
  titleEl.textContent = title;
  messageEl.textContent = message;
  confirmBtn.onclick = async () => {
    if (typeof systemPopupAction === "function") {
      await systemPopupAction();
    }
  };
  popup.classList.add("active");
}

window.closeSystemPopup = function() {
  const popup = document.getElementById("systemPopup");
  const confirmBtn = document.getElementById("systemPopupConfirmBtn");
  systemPopupAction = null;
  if (confirmBtn) confirmBtn.onclick = null;
  if (popup) popup.classList.remove("active");
};

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
