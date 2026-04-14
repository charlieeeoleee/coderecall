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
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  initSounds,
  initGlobalClickSound,
  tryStartMusic,
  restartThemeMusic
} from "./sound.js";
import { applyRoleNavigation, getRoleFromUserData, resolveUserRole, roleMeetsMinimum, syncUserRole } from "./role-utils.js";
import {
  fetchModuleDrafts,
  fetchQuizDrafts,
  saveModuleDraft as saveModuleDraftToSupabase,
  saveQuizDraft as saveQuizDraftToSupabase,
  reviewModuleDraft,
  reviewQuizDraft
} from "./supabase-content.js";

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
let learnersCache = [];

function syncMobileSidebarButton() {
  const layout = document.querySelector(".layout");
  const toggle = document.querySelector(".sidebar-toggle");
  if (!layout || !toggle) return;
  const isOpen = layout.classList.contains("mobile-nav-open");
  toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  toggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
}

window.toggleMobileSidebar = function() {
  const layout = document.querySelector(".layout");
  if (!layout || window.innerWidth > 980) return;
  layout.classList.toggle("mobile-nav-open");
  syncMobileSidebarButton();
};

function closeMobileSidebar() {
  const layout = document.querySelector(".layout");
  if (!layout) return;
  layout.classList.remove("mobile-nav-open");
  syncMobileSidebarButton();
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "auth.html";
    return;
  }

  currentUser = user;
  const currentRole = await resolveUserRole(db, user);
  await syncUserRole(db, user, currentRole);
  applyRoleNavigation(currentRole, "admin.html");

  if (!roleMeetsMinimum(currentRole, "admin")) {
    window.location.href = "dashboard.html";
    return;
  }

  updateUserUI(user);
  await loadAdminDashboard();
});

async function loadAdminDashboard() {
  const [usersSnap, moduleDrafts, quizDrafts] = await Promise.all([
    getDocs(collection(db, "users")),
    safeSupabaseRead("module drafts", fetchModuleDrafts),
    safeSupabaseRead("quiz drafts", fetchQuizDrafts)
  ]);

  const users = usersSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }));

  learnersCache = users.filter((user) => getRoleFromUserData(user) === "user");

  renderOverview(learnersCache);
  renderBottlenecks(learnersCache);
  renderDifficultyAnalytics(learnersCache);
  renderStudentTable(learnersCache);
  renderDraftReviews(moduleDrafts, quizDrafts);
  wireBuilderForms();
}

async function safeSupabaseRead(label, reader) {
  try {
    return await reader();
  } catch (error) {
    console.error(`Admin Supabase read failed for ${label}:`, error);
    return [];
  }
}

function renderOverview(learners) {
  const averageXp = learners.length
    ? Math.round(learners.reduce((sum, user) => sum + (user.xp || 0), 0) / learners.length)
    : 0;
  const modulesCleared = learners.reduce((sum, user) => sum + countCompletedModules(user.progress || {}), 0);
  const needsHelp = learners.filter((user) => learnerNeedsHelp(user.progress || {})).length;

  setText("adminTotalLearners", learners.length);
  setText("adminNeedsHelp", needsHelp);
  setText("adminAverageXp", `${averageXp} XP`);
  setText("adminModulesCleared", `${modulesCleared} clears`);
}

function renderBottlenecks(learners) {
  const grid = document.getElementById("bottleneckGrid");
  if (!grid) return;

  const bottlenecks = [
    { label: "Electrical Pre-Test", count: countStage(learners, "electrical", "pretest") },
    { label: "Electrical Modules", count: countStage(learners, "electrical", "modules") },
    { label: "Electrical Quiz", count: countStage(learners, "electrical", "quiz") },
    { label: "Electrical Post-Test", count: countStage(learners, "electrical", "posttest") },
    { label: "Hardware Pre-Test", count: countStage(learners, "hardware", "pretest") },
    { label: "Hardware Modules", count: countStage(learners, "hardware", "modules") },
    { label: "Hardware Quiz", count: countStage(learners, "hardware", "quiz") },
    { label: "Hardware Post-Test", count: countStage(learners, "hardware", "posttest") }
  ];

  grid.innerHTML = bottlenecks.map((item) => `
    <article class="bottleneck-card">
      <span>${item.label}</span>
      <strong>${item.count}</strong>
      <small>Learners currently slowing down here</small>
    </article>
  `).join("");
}

function renderDifficultyAnalytics(learners) {
  const grid = document.getElementById("difficultyAnalytics");
  if (!grid) return;

  const metrics = [
    {
      title: "Electrical Risk Group",
      value: learners.filter((learner) => getCurrentStage(learner.progress || {}, "electrical") === "quiz").length,
      detail: "Learners likely struggling to advance through electrical quiz milestones."
    },
    {
      title: "Hardware Risk Group",
      value: learners.filter((learner) => getCurrentStage(learner.progress || {}, "hardware") === "quiz").length,
      detail: "Learners likely struggling to advance through hardware quiz milestones."
    },
    {
      title: "Easy Modules Cleared",
      value: countDifficultyModuleClears(learners, "easy"),
      detail: "Checkpoint clears recorded across the easy module path."
    },
    {
      title: "Medium + Hard Clears",
      value: countDifficultyModuleClears(learners, "medium") + countDifficultyModuleClears(learners, "hard"),
      detail: "Checkpoint clears recorded across deeper module difficulty paths."
    }
  ];

  grid.innerHTML = metrics.map((metric) => `
    <article class="analytics-card">
      <span>${metric.title}</span>
      <strong>${metric.value}</strong>
      <p>${metric.detail}</p>
    </article>
  `).join("");
}

function renderStudentTable(learners) {
  const body = document.getElementById("studentTableBody");
  if (!body) return;

  body.innerHTML = "";

  if (!learners.length) {
    body.innerHTML = `<tr><td colspan="8">No learner records yet.</td></tr>`;
    return;
  }

  learners.forEach((learner) => {
    const progress = learner.progress || {};
    const electricalStage = describeSubjectStage(progress, "electrical");
    const hardwareStage = describeSubjectStage(progress, "hardware");
    const needsReview = learnerNeedsHelp(progress);

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(learner.name || "User")}</td>
      <td>${escapeHtml(learner.email || "No email")}</td>
      <td><span class="status-pill">${escapeHtml(learner.role || "user")}</span></td>
      <td>${learner.xp || 0}</td>
      <td>${electricalStage}</td>
      <td>${hardwareStage}</td>
      <td><span class="status-pill ${needsReview ? "warning" : ""}">${needsReview ? "Needs attention" : "On track"}</span></td>
      <td><button class="secondary-action" data-open-profile="${learner.id}">Open</button></td>
    `;
    body.appendChild(row);
  });

  body.querySelectorAll("[data-open-profile]").forEach((button) => {
    button.addEventListener("click", async () => {
      const learnerId = button.getAttribute("data-open-profile");
      const learner = learnersCache.find((entry) => entry.id === learnerId);
      if (learner) {
        await openStudentProfile(learner);
      }
    });
  });
}

function renderDraftReviews(moduleDrafts, quizDrafts) {
  const moduleList = document.getElementById("moduleDraftReviewList");
  const quizList = document.getElementById("quizDraftReviewList");

  if (moduleList) moduleList.innerHTML = buildDraftMarkup(moduleDrafts, "module");
  if (quizList) quizList.innerHTML = buildDraftMarkup(quizDrafts, "quiz");

  bindDraftActions(moduleList, "moduleDrafts");
  bindDraftActions(quizList, "quizDrafts");
}

function buildDraftMarkup(drafts, type) {
  if (!drafts.length) {
    return `<div class="review-item"><h5>No ${type} drafts yet</h5><p>Once admins start saving drafts, they will appear here for review.</p></div>`;
  }

  return drafts
    .sort((a, b) => ((b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)))
    .map((draft) => `
      <article class="review-item">
        <h5>${escapeHtml(draft.title || draft.question || "Untitled draft")}</h5>
        <div class="review-meta">
          <span class="meta-pill">${escapeHtml(draft.subject || "general")}</span>
          <span class="meta-pill">${escapeHtml(draft.difficulty || draft.quizType || "draft")}</span>
          <span class="meta-pill">${escapeHtml(draft.status || "pending")}</span>
        </div>
        <p>${escapeHtml(getDraftPreviewText(draft, type))}</p>
        <p>Created by: ${escapeHtml(draft.createdByEmail || "Unknown")}</p>
        <div class="review-actions">
          <button class="primary-action" data-approve-draft="${draft.id}" data-collection="${type === "module" ? "moduleDrafts" : "quizDrafts"}">Approve</button>
          <button class="danger-action" data-reject-draft="${draft.id}" data-collection="${type === "module" ? "moduleDrafts" : "quizDrafts"}">Reject</button>
        </div>
      </article>
    `)
    .join("");
}

function bindDraftActions(container, collectionName) {
  if (!container) return;

  container.querySelectorAll("[data-approve-draft]").forEach((button) => {
    button.addEventListener("click", async () => {
      const draftId = button.getAttribute("data-approve-draft");
      await updateDraftStatus(collectionName, draftId, "approved");
    });
  });

  container.querySelectorAll("[data-reject-draft]").forEach((button) => {
    button.addEventListener("click", async () => {
      const draftId = button.getAttribute("data-reject-draft");
      await updateDraftStatus(collectionName, draftId, "rejected");
    });
  });
}

async function updateDraftStatus(collectionName, draftId, status) {
  if (collectionName === "moduleDrafts") {
    await reviewModuleDraft(draftId, status, currentUser.email || "");
  } else {
    await reviewQuizDraft(draftId, status, currentUser.email || "");
  }

  await writeAuditLog("draft_review", `${status} ${collectionName} entry ${draftId}`);
  await loadAdminDashboard();
}

function getDraftPreviewText(draft, type) {
  const fileName = type === "module"
    ? extractStoredFileName(draft.tip)
    : extractStoredFileName(draft.rationale);
  const notes = type === "module"
    ? (draft.content || "")
    : stripStoredFileName(draft.rationale || "");
  const noteText = notes.trim() ? `Notes: ${notes.trim().slice(0, 140)}` : "No reviewer notes provided.";

  return fileName ? `Attached file: ${fileName}. ${noteText}` : noteText;
}

function countStage(learners, subject, stage) {
  return learners.filter((learner) => getCurrentStage(learner.progress || {}, subject) === stage).length;
}

function getCurrentStage(progress, subject) {
  const pretest = progress[`${subject}_pretest`] === true;
  const modules = progress[`${subject}_modules`] === true;
  const quiz = progress[`${subject}_quiz`] === true;
  const posttest = progress[`${subject}_posttest`] === true;

  if (!pretest) return "pretest";
  if (!modules) return "modules";
  if (!quiz) return "quiz";
  if (!posttest) return "posttest";
  return "complete";
}

function describeSubjectStage(progress, subject) {
  const stage = getCurrentStage(progress, subject);
  if (stage === "complete") return "Complete";
  if (stage === "pretest") return "Needs Pre-Test";
  if (stage === "modules") return "Working Through Modules";
  if (stage === "quiz") return "Preparing for Quiz";
  return "Ready for Post-Test";
}

function learnerNeedsHelp(progress) {
  const electricalStage = getCurrentStage(progress, "electrical");
  const hardwareStage = getCurrentStage(progress, "hardware");
  return electricalStage === "modules" || electricalStage === "quiz" || hardwareStage === "modules" || hardwareStage === "quiz";
}

function countCompletedModules(progress) {
  return Object.entries(progress).filter(([key, value]) => key.includes("_module_") && key.endsWith("_done") && value === true).length;
}

function countDifficultyModuleClears(learners, difficulty) {
  return learners.reduce((sum, learner) => {
    const progress = learner.progress || {};
    const clears = Object.entries(progress).filter(([key, value]) => key.includes(`_${difficulty}_module_`) && key.endsWith("_done") && value === true).length;
    return sum + clears;
  }, 0);
}

function wireBuilderForms() {
  const moduleForm = document.getElementById("moduleDraftForm");
  const quizForm = document.getElementById("quizDraftForm");
  const feedbackForm = document.getElementById("feedbackNoteForm");
  const moduleDocInput = document.getElementById("moduleDocInput");
  const quizDocInput = document.getElementById("quizDocInput");

  wireFileNamePreview(moduleDocInput, "moduleDocName");
  wireFileNamePreview(quizDocInput, "quizDocName");

  if (moduleForm && !moduleForm.dataset.bound) {
    moduleForm.dataset.bound = "true";
    moduleForm.addEventListener("submit", saveModuleDraft);
  }

  if (quizForm && !quizForm.dataset.bound) {
    quizForm.dataset.bound = "true";
    quizForm.addEventListener("submit", saveQuizDraft);
  }

  if (feedbackForm && !feedbackForm.dataset.bound) {
    feedbackForm.dataset.bound = "true";
    feedbackForm.addEventListener("submit", saveFeedbackNote);
  }
}

async function saveModuleDraft(event) {
  event.preventDefault();

  const docFile = document.getElementById("moduleDocInput")?.files?.[0];
  const status = document.getElementById("moduleDraftStatus");
  const docPayload = await fileToDataUrl(docFile);

  if (!docFile || !docPayload) {
    if (status) status.textContent = "Please upload a `.docx` module file first.";
    return;
  }

  await saveModuleDraftToSupabase({
    subject: document.getElementById("moduleSubject").value,
    difficulty: document.getElementById("moduleDifficulty").value,
    title: document.getElementById("moduleTitleInput").value.trim(),
    content: document.getElementById("moduleContentInput").value.trim(),
    tip: formatStoredFileName(docFile.name, document.getElementById("moduleTipInput").value.trim()),
    imageDataUrl: docPayload,
    status: "pending",
    createdBy: currentUser.uid,
    createdByEmail: currentUser.email || ""
  });

  await writeAuditLog("module_draft_created", `Created module draft upload: ${document.getElementById("moduleTitleInput").value.trim()} (${docFile.name})`);

  event.target.reset();
  resetFileNamePreview("moduleDocName");
  if (status) status.textContent = "Module draft file saved. It is now waiting for review and manual encoding.";
  await loadAdminDashboard();
}

async function saveQuizDraft(event) {
  event.preventDefault();

  const docFile = document.getElementById("quizDocInput")?.files?.[0];
  const status = document.getElementById("quizDraftStatus");
  const docPayload = await fileToDataUrl(docFile);

  if (!docFile || !docPayload) {
    if (status) status.textContent = "Please upload a `.docx` quiz file first.";
    return;
  }

  await saveQuizDraftToSupabase({
    subject: document.getElementById("quizSubject").value,
    quizType: document.getElementById("quizType").value,
    question: document.getElementById("quizQuestionInput").value.trim(),
    choices: [],
    answerLetter: "",
    answerText: "",
    rationale: formatStoredFileName(docFile.name, document.getElementById("quizRationaleInput").value.trim()),
    imageDataUrl: docPayload,
    status: "pending",
    createdBy: currentUser.uid,
    createdByEmail: currentUser.email || ""
  });

  await writeAuditLog("quiz_draft_created", `Created quiz draft upload for ${document.getElementById("quizType").value} (${docFile.name})`);

  event.target.reset();
  resetFileNamePreview("quizDocName");
  if (status) status.textContent = "Quiz draft file saved. It is now waiting for review and manual encoding.";
  await loadAdminDashboard();
}

async function openStudentProfile(learner) {
  setText("studentProfileTitle", learner.name || "Learner Profile");
  setText("studentProfileSubtitle", `${learner.email || "No email"} • ${learner.xp || 0} XP`);
  const body = document.getElementById("studentProfileBody");
  const progress = learner.progress || {};
  const results = learner.results || {};

  if (body) {
    body.innerHTML = `
      <div class="profile-stats">
        <div class="profile-stat-card"><span>Total XP</span><strong>${learner.xp || 0}</strong></div>
        <div class="profile-stat-card"><span>Completed Modules</span><strong>${countCompletedModules(progress)}</strong></div>
        <div class="profile-stat-card"><span>Electrical Stage</span><strong>${describeSubjectStage(progress, "electrical")}</strong></div>
        <div class="profile-stat-card"><span>Hardware Stage</span><strong>${describeSubjectStage(progress, "hardware")}</strong></div>
      </div>
      <div class="profile-columns">
        <section class="profile-section">
          <h4>Progress Breakdown</h4>
          <div class="profile-list">
            ${buildProgressRows(progress)}
          </div>
        </section>
        <section class="profile-section">
          <h4>Assessment Snapshot</h4>
          <div class="profile-list">
            ${buildResultRows(results)}
          </div>
        </section>
      </div>
    `;
  }

  const hiddenField = document.getElementById("feedbackStudentId");
  if (hiddenField) hiddenField.value = learner.id;

  await loadFeedbackNotes(learner.id);
  document.getElementById("studentProfileModal")?.classList.add("active");
}

function buildProgressRows(progress) {
  const rows = Object.entries(progress)
    .filter(([, value]) => value === true)
    .slice(0, 20)
    .map(([key]) => `<div class="profile-row"><span>${escapeHtml(key)}</span><span>Done</span></div>`);

  return rows.length ? rows.join("") : `<div class="profile-row"><span>No progress flags recorded yet.</span><span>-</span></div>`;
}

function buildResultRows(results) {
  const rows = Object.entries(results)
    .slice(0, 12)
    .map(([key, value]) => `<div class="profile-row"><span>${escapeHtml(key)}</span><span>${typeof value === "number" ? value : escapeHtml(String(value))}</span></div>`);

  return rows.length ? rows.join("") : `<div class="profile-row"><span>No assessment results recorded yet.</span><span>-</span></div>`;
}

async function loadFeedbackNotes(studentId) {
  const list = document.getElementById("feedbackNotesList");
  if (!list || !studentId) return;

  const notesSnap = await getDocs(collection(db, "feedbackNotes"));
  const notes = notesSnap.docs
    .map((snap) => ({ id: snap.id, ...snap.data() }))
    .filter((note) => note.studentId === studentId)
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    .slice(0, 6);

  list.innerHTML = notes.length
    ? notes.map((note) => `
        <div class="review-item">
          <p>${escapeHtml(note.note || "")}</p>
          <p>By ${escapeHtml(note.createdByEmail || "Admin")}</p>
        </div>
      `).join("")
    : `<div class="review-item"><p>No notes for this learner yet.</p></div>`;
}

async function saveFeedbackNote(event) {
  event.preventDefault();
  const studentId = document.getElementById("feedbackStudentId").value;
  const note = document.getElementById("feedbackNoteInput").value.trim();
  const status = document.getElementById("feedbackNoteStatus");

  if (!studentId || !note) {
    if (status) status.textContent = "Open a learner profile and write a note first.";
    return;
  }

  await addDoc(collection(db, "feedbackNotes"), {
    studentId,
    note,
    createdBy: currentUser.uid,
    createdByEmail: currentUser.email || "",
    createdAt: serverTimestamp()
  });

  await writeAuditLog("feedback_note", `Saved support note for learner ${studentId}`);
  document.getElementById("feedbackNoteInput").value = "";
  if (status) status.textContent = "Support note saved.";
  await loadFeedbackNotes(studentId);
}

window.closeStudentProfile = function() {
  document.getElementById("studentProfileModal")?.classList.remove("active");
  const status = document.getElementById("feedbackNoteStatus");
  if (status) status.textContent = "";
};

function wireFileNamePreview(input, statusId) {
  const status = document.getElementById(statusId);
  if (!input || !status || input.dataset.bound) return;

  input.dataset.bound = "true";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) {
      resetFileNamePreview(statusId);
      return;
    }
    status.textContent = `Attached file: ${file.name}`;
  });
}

function resetFileNamePreview(statusId) {
  const status = document.getElementById(statusId);
  if (!status) return;
  status.textContent = "";
}

function fileToDataUrl(file) {
  if (!file) return Promise.resolve("");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatStoredFileName(fileName, notes = "") {
  const safeName = String(fileName || "").trim();
  const safeNotes = String(notes || "").trim();
  return safeNotes ? `FILE:${safeName}\n${safeNotes}` : `FILE:${safeName}`;
}

function extractStoredFileName(value) {
  const text = String(value || "");
  const match = text.match(/^FILE:(.+)$/m);
  return match ? match[1].trim() : "";
}

function stripStoredFileName(value) {
  return String(value || "").replace(/^FILE:.+\n?/m, "");
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

function updateUserUI(user) {
  setText("username", user.displayName || user.email || "Admin");
  const photo = document.getElementById("userPhoto");
  if (photo) {
    photo.src = user.photoURL || "https://i.pravatar.cc/40?img=12";
  }
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

window.logout = async function() {
  closeMobileSidebar();
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

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".menu a").forEach((link) => {
    link.addEventListener("click", closeMobileSidebar);
  });
  syncMobileSidebarButton();
});

document.addEventListener("click", (event) => {
  const layout = document.querySelector(".layout");
  const sidebar = document.querySelector(".sidebar");
  const toggle = document.querySelector(".sidebar-toggle");
  if (!layout || !sidebar || !toggle) return;
  if (!layout.classList.contains("mobile-nav-open")) return;
  if (window.innerWidth > 980) return;
  if (sidebar.contains(event.target) || toggle.contains(event.target)) return;
  closeMobileSidebar();
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 980) closeMobileSidebar();
});
