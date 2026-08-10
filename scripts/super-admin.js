import { app } from "./firebase-config.js";
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
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  initSounds,
  initGlobalClickSound,
  tryStartMusic,
  restartThemeMusic
} from "./sound.js";
import { applyRoleNavigation, getRoleFromUserData, resolveUserRole, syncUserRole } from "./role-utils.js?v=20260525a";
import { clearSuperAdminMfaSession, isSuperAdminMfaVerified } from "./super-admin-mfa-session.js";
import { writeSecurityAudit } from "./security-audit.js";
import { resetOwnAppMfaProfile } from "./app-level-mfa-profile.js";
import {
  fetchModuleDrafts,
  fetchQuizDrafts
} from "./supabase-content.js";
import { SUPER_ADMIN_EMAILS } from "../data/admin-config.js";
import { signOutWithSessionCleanup } from "./auth-session.js";


const auth = getAuth(app);
const db = getFirestore(app);
const DEMO_ANALYTICS_MODE = new URLSearchParams(window.location.search).get("analytics") === "preview";
const DEMO_ANALYTICS_SUBJECTS = ["hardware", "electrical"];
const DEMO_ANALYTICS_DIFFICULTIES = ["easy", "medium", "hard"];
const DEMO_ANALYTICS_QUIZ_LEVELS = 25;
const DEMO_ANALYTICS_QUIZ_TOTAL = 3;
const DEMO_ANALYTICS_MODULES_PER_DIFFICULTY = 3;
const DEMO_ANALYTICS_SCORE_OVERRIDES = {
  "iancisesanjose@gmail.com": {
    electrical_pretest: { score: 24, total: 30 },
    electrical_posttest: { score: 28, total: 30 },
    hardware_pretest: { score: 23, total: 30 },
    hardware_posttest: { score: 27, total: 30 }
  }
};
const QUIZ_LEVEL_XP_PER_CORRECT = 2;

let currentUser = null;
let currentRole = "user";
let superUsersCache = [];
let auditLogCache = [];
let superDashboardLoading = false;
let systemPopupAction = null;
let systemPopupBusy = false;
let contactInboxUnsubscribe = null;
const SUPER_ADMIN_STATUS_DEFAULT = "Manage roles, review the whole system, and control app user records for the prototype.";
const SLOW_SUPER_ADMIN_LOAD_DELAY_MS = 5000;

applyRoleNavigation("guest", "super-admin.html");

function openAccessDenied(area, role) {
  const params = new URLSearchParams({
    area,
    role: role || "unknown"
  });
  window.location.href = `access-denied.html?${params.toString()}`;
}

function setSuperAdminLoadStatus(message = SUPER_ADMIN_STATUS_DEFAULT, isWarning = false) {
  const status = document.getElementById("superAdminLoadStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("slow-load-warning", isWarning);
}

function startSlowSuperAdminNotice() {
  return window.setTimeout(() => {
    setSuperAdminLoadStatus(
      "Still loading Super Admin data. Large learner records or slow Firebase responses can take a few more seconds.",
      true
    );
  }, SLOW_SUPER_ADMIN_LOAD_DELAY_MS);
}

function stopSlowSuperAdminNotice(timerId) {
  window.clearTimeout(timerId);
  setSuperAdminLoadStatus();
}

function deferSuperAdminTask(task) {
  const run = () => {
    Promise.resolve()
      .then(task)
      .catch((error) => console.warn("Deferred Super Admin task failed:", error));
  };

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(run, { timeout: 1500 });
  } else {
    window.setTimeout(run, 100);
  }
}

function renderAdminLoadingState(targetId, message = "Loading...") {
  const target = document.getElementById(targetId);
  if (!target) return;
  target.innerHTML = `
    <article class="review-item admin-loading-card">
      <h5>${escapeHtml(message)}</h5>
      <p>We are fetching this section in the background.</p>
    </article>
  `;
}

function renderAdminGridLoadingState(targetId, message = "Loading...") {
  const target = document.getElementById(targetId);
  if (!target) return;
  target.innerHTML = `
    <article class="analytics-card admin-loading-card">
      <span>${escapeHtml(message)}</span>
      <strong>...</strong>
      <p>Fetching background data.</p>
    </article>
  `;
}

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
  stopContactInboxSubscription();
  if (!user) {
    window.location.href = "auth.html";
    return;
  }

  currentUser = user;
  const role = await resolveUserRole(db, user);
  currentRole = role;
  await syncUserRole(db, user, role);
  applyRoleNavigation(role, "super-admin.html");

  if (role !== "super_admin") {
    await writeSecurityAudit(
      db,
      user,
      "denied_super_admin_route",
      `Denied super-admin.html route for resolved role: ${role}`,
      {
        route: "super-admin.html",
        requiredRole: "super_admin",
        resolvedRole: role
      }
    );
    openAccessDenied("super-admin", role);
    return;
  }

  if (!isSuperAdminMfaVerified(user.uid)) {
    await writeSecurityAudit(
      db,
      user,
      "mfa_required_privileged_route",
      "Super-admin route requires app-level 2FA verification.",
      {
        route: "super-admin.html",
        requiredRole: "super_admin",
        resolvedRole: role
      }
    );
    window.location.replace("super-admin-mfa.html");
    return;
  }

  await updateUserUI(user);
  await loadSuperAdminDashboard();
  startContactInboxSubscription();
});

async function loadSuperAdminDashboard() {
  if (superDashboardLoading) return;
  superDashboardLoading = true;
  setSuperRefreshState(true, "Refreshing super-admin data...");
  const slowLoadTimer = startSlowSuperAdminNotice();

  try {
    const [
      usersSnap,
      securityProfilesSnap,
      grantsSnap,
      pendingUsersSnap
    ] = await Promise.all([
      safeGetDocs("users", collection(db, "users")),
      safeGetDocs("securityProfiles", collection(db, "securityProfiles")),
      safeGetDocs("accessRoles", collection(db, "accessRoles")),
      safeGetDocs("pendingUsers", collection(db, "pendingUsers"))
    ]);

    const users = applyDemoAnalyticsOverlay(
      usersSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }))
    );
    superUsersCache = users;
    const securityProfiles = await addCurrentSessionMfaProfile(
      securityProfilesSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }))
    );
    const grants = grantsSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
    const pendingUsers = pendingUsersSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }));

    renderAdminGridLoadingState("systemHealthGrid", "Loading system health");
    renderAdminLoadingState("superModulePublishList", "Loading module drafts");
    renderAdminLoadingState("superQuizPublishList", "Loading quiz drafts");
    renderAdminLoadingState("manualImportChecklist", "Preparing checklist");
    renderAdminLoadingState("auditLogList", "Loading audit trail");

    renderAnalyticsPreviewNavCue();
    renderDemoAnalyticsNotice();
    renderOverview(users);
    renderAccessGrantList(grants);
    renderSystemHealth(users, grants, pendingUsers, [], [], []);
    renderRetentionOversight(users);
    renderTwoFactorOversight(users, securityProfiles);
    renderSubjectCompletionBreakdown(users);
    renderMostMissedTopics(users);
    renderUserTable(users);
    wireLearnerScoreExport();
    wireDataExportCenter();
    wireAccessGrantForm();
    wireIntakeForm();
    stopSlowSuperAdminNotice(slowLoadTimer);
    setSuperRefreshState(false, "Data refreshed just now.");

    deferSuperAdminTask(async () => {
      const [
        moduleDrafts,
        quizDrafts,
        notesSnap,
        auditSnap,
        contactMessagesSnap
      ] = await Promise.all([
        safeSupabaseRead("module drafts", fetchModuleDrafts),
        safeSupabaseRead("quiz drafts", fetchQuizDrafts),
        safeGetDocs("feedbackNotes", collection(db, "feedbackNotes")),
        safeGetDocs("auditLogs", query(collection(db, "auditLogs"), orderBy("createdAt", "desc"), limit(12))),
        safeGetDocs("contactMessages", collection(db, "contactMessages"))
      ]);

      const notes = notesSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
      const audits = auditSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
      auditLogCache = audits;
      const contactMessages = contactMessagesSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }));

      renderContactInboxCounts(contactMessages);
      renderSystemHealth(users, grants, pendingUsers, moduleDrafts, quizDrafts, notes);
      renderPublishingQueue(moduleDrafts, quizDrafts);
      renderManualImportChecklist();
      wireAuditSearch();
      renderAuditLog(getFilteredAuditEntries());
    });
  } catch (error) {
    console.error("Unable to load super-admin dashboard data:", error);
    stopSlowSuperAdminNotice(slowLoadTimer);
    setSuperRefreshState(false, "Unable to refresh Firebase data. Check your connection, then retry.", true);
    renderSuperLoadError();
  } finally {
    superDashboardLoading = false;
  }
}

function setSuperRefreshState(isLoading, message, isWarning = false) {
  const button = document.getElementById("superRefreshBtn");
  const status = document.getElementById("superRefreshStatus");
  if (button) {
    button.disabled = isLoading;
    button.textContent = isLoading ? "Refreshing..." : "Refresh Data";
  }
  if (status) {
    status.textContent = message;
    status.classList.toggle("warning", Boolean(isWarning));
  }
}

function renderSuperLoadError() {
  const empty = `
    <article class="review-item">
      <h5>Data could not be loaded</h5>
      <p>Use Refresh Data after checking the connection or Firebase permissions.</p>
    </article>
  `;
  ["systemHealthGrid", "superModulePublishList", "superQuizPublishList", "manualImportChecklist", "auditLogList"].forEach((id) => {
    const target = document.getElementById(id);
    if (target) target.innerHTML = empty;
  });
}

document.getElementById("superRefreshBtn")?.addEventListener("click", () => {
  loadSuperAdminDashboard();
});

function renderDemoAnalyticsNotice() {
  document.body.classList.toggle("demo-analytics-mode", DEMO_ANALYTICS_MODE);

  if (!DEMO_ANALYTICS_MODE) return;

  const main = document.querySelector(".main");
  if (!main || document.getElementById("superDemoAnalyticsNotice")) return;

  const notice = document.createElement("div");
  notice.id = "superDemoAnalyticsNotice";
  notice.className = "demo-analytics-notice analytics-preview-footer";
  notice.innerHTML = `
    <strong>Analytics Preview</strong>
    <span>Sample assessment data is displayed for presentation preview. Live learner records are unchanged.</span>
  `;
  main.appendChild(notice);
}

function renderAnalyticsPreviewNavCue() {
  const menu = document.querySelector(".sidebar .menu");
  const adminLink = document.querySelector('.sidebar .menu a[href^="admin.html"]');
  const superAdminLink = document.querySelector('.sidebar .menu a[href^="super-admin.html"]');

  if (adminLink) {
    adminLink.href = "admin.html";
    adminLink.textContent = "🛠 Admin";
  }

  if (superAdminLink) {
    superAdminLink.href = "super-admin.html";
    superAdminLink.textContent = "👑 Super Admin";
  }

  if (!menu || document.getElementById("adminPreviewNavLink")) return;

  const divider = document.createElement("span");
  divider.className = "nav-section-label";
  divider.textContent = "Analytics";
  menu.appendChild(divider);

  const adminPreviewLink = document.createElement("a");
  adminPreviewLink.id = "adminPreviewNavLink";
  adminPreviewLink.href = "admin.html?analytics=preview";
  adminPreviewLink.textContent = "🛠 ADMIN";
  menu.appendChild(adminPreviewLink);

  const superPreviewLink = document.createElement("a");
  superPreviewLink.id = "superPreviewNavLink";
  superPreviewLink.href = "super-admin.html?analytics=preview";
  superPreviewLink.textContent = "👑 SUPER ADMIN";
  superPreviewLink.className = DEMO_ANALYTICS_MODE ? "active-link" : "";
  menu.appendChild(superPreviewLink);
}

function applyDemoAnalyticsOverlay(users) {
  if (!DEMO_ANALYTICS_MODE) return users;

  return users.map((user, index) => {
    if (getRoleFromUserData(user) !== "user") return user;

    const nextUser = {
      ...user,
      progress: { ...(user.progress || {}) },
      results: { ...(user.results || {}) }
    };

    nextUser.xp = Math.max(Number(nextUser.xp || 0), buildDemoXpTotal(index));
    nextUser.xpWeekly = Math.max(Number(nextUser.xpWeekly || 0), Math.round(nextUser.xp * 0.34));

    DEMO_ANALYTICS_SUBJECTS.forEach((subject, subjectIndex) => {
      const pretestKey = `${subject}_pretest`;
      const posttestKey = `${subject}_posttest`;

      addDemoModuleCompletion(nextUser, subject);

      if (!nextUser.results[pretestKey]) {
        nextUser.results[pretestKey] = buildDemoPretestResult(index, subjectIndex);
        nextUser.progress[pretestKey] = true;
        nextUser.progress[`${pretestKey}_demo_preview`] = true;
      }

      addDemoQuizTrackResults(nextUser, subject, index, subjectIndex);

      const demoResult = buildDemoPosttestResult(nextUser.results[pretestKey], index, subjectIndex);
      nextUser.results[posttestKey] = demoResult;
      nextUser.progress[posttestKey] = true;
      nextUser.progress[`${posttestKey}_demo_preview`] = true;

      applyDemoAssessmentOverride(nextUser, pretestKey);
      applyDemoAssessmentOverride(nextUser, posttestKey);
    });

    return nextUser;
  });
}

function applyDemoAssessmentOverride(user, key) {
  const email = String(user.email || "").toLowerCase();
  const override = DEMO_ANALYTICS_SCORE_OVERRIDES[email]?.[key];
  if (!override) return;

  const total = Math.max(1, Number(override.total || 30) || 30);
  const score = Math.min(total, Math.max(0, Number(override.score || 0)));
  user.results[key] = {
    score,
    total,
    percent: Math.round((score / total) * 100),
    xpEarned: score,
    source: "analytics_preview_override",
    note: "Sample score adjusted only for admin panel presentation mode."
  };
  user.progress[key] = true;
  user.progress[`${key}_demo_preview`] = true;
}

function buildDemoXpTotal(learnerIndex) {
  return 520 + ((learnerIndex * 47) % 280);
}

function addDemoModuleCompletion(user, subject) {
  DEMO_ANALYTICS_DIFFICULTIES.forEach((difficulty) => {
    for (let moduleNumber = 1; moduleNumber <= DEMO_ANALYTICS_MODULES_PER_DIFFICULTY; moduleNumber += 1) {
      user.progress[`${subject}_${difficulty}_module_${moduleNumber}_done`] = true;
      user.progress[`${subject}_${difficulty}_module_${moduleNumber}_done_read_bottom`] = true;
      user.progress[`${subject}_${difficulty}_module_${moduleNumber}_done_quick_check_attempted`] = true;
    }
  });

  user.progress[`${subject}_modules`] = true;
}

function buildDemoPretestResult(learnerIndex, subjectIndex) {
  const total = 30;
  const percent = 42 + ((learnerIndex * 7 + subjectIndex * 11) % 32);
  const score = Math.round((percent / 100) * total);

  return {
    score,
    total,
    percent: Math.round((score / total) * 100),
    xpEarned: score,
    source: "analytics_preview",
    note: "Sample pre-test score generated only for admin panel presentation mode."
  };
}

function buildDemoPosttestResult(pretest, learnerIndex, subjectIndex) {
  const total = Math.max(1, Number(pretest.total || pretest.totalQuestions || 30) || 30);
  const prePercent = getResultPercent(pretest, total);
  const improvement = 12 + ((learnerIndex + subjectIndex * 3) % 6) * 2;
  const minimumImprovedPercent = prePercent >= 100 ? 100 : Math.min(100, prePercent + 1);
  const demoPercent = Math.min(100, Math.max(minimumImprovedPercent, prePercent + improvement));
  const score = Math.min(total, Math.max(0, Math.round((demoPercent / 100) * total)));

  return {
    score,
    total,
    percent: Math.round((score / total) * 100),
    xpEarned: score,
    source: "demo_analytics_preview",
    note: "Sample score generated only for admin panel presentation mode."
  };
}

function addDemoQuizTrackResults(user, subject, learnerIndex, subjectIndex) {
  let addedAny = false;

  DEMO_ANALYTICS_DIFFICULTIES.forEach((difficulty, difficultyIndex) => {
    for (let level = 1; level <= DEMO_ANALYTICS_QUIZ_LEVELS; level += 1) {
      const resultKey = `${subject}_${difficulty}_quiz_level_${level}_result`;
      const doneKey = `${subject}_${difficulty}_quiz_level_${level}_done`;

      const scoreSeed = learnerIndex + subjectIndex + difficultyIndex + level;
      const score = scoreSeed % 6 === 0 ? 2 : DEMO_ANALYTICS_QUIZ_TOTAL;
      user.results[resultKey] = {
        subject,
        difficulty,
        quizLevel: level,
        score,
        total: DEMO_ANALYTICS_QUIZ_TOTAL,
        earnedXP: score * QUIZ_LEVEL_XP_PER_CORRECT,
        source: "analytics_preview",
        completedAt: new Date().toISOString(),
        note: "Sample quiz score generated only for admin panel presentation mode."
      };
      user.progress[doneKey] = true;
      user.progress[`${doneKey}_demo_preview`] = true;
      addedAny = true;
    }

    user.progress[`${subject}_${difficulty}_quiz`] = true;
  });

  if (addedAny || Object.keys(user.results).some((key) => key.startsWith(`${subject}_`) && key.includes("_quiz_level_"))) {
    user.progress[`${subject}_quiz`] = true;
  }
}

function getResultPercent(result, fallbackTotal = 30) {
  const score = Number(result?.score ?? result?.correct ?? result?.correctAnswers ?? result?.points);
  const total = Math.max(1, Number(result?.total ?? result?.totalQuestions ?? result?.items ?? fallbackTotal) || fallbackTotal);
  const percent = Number(result?.percent);

  if (Number.isFinite(score)) return Math.round((score / total) * 100);
  if (Number.isFinite(percent)) return Math.round(percent);
  return 0;
}

function renderContactInboxCounts(messages) {
  const openCount = messages.filter((message) => (message.status || "open") !== "resolved").length;
  updateInboxBadge("superAdminContactInboxBadge", openCount);
  updateInboxPanelBadge("superAdminInboxPanelBadge", openCount);
}

function stopContactInboxSubscription() {
  if (typeof contactInboxUnsubscribe === "function") {
    contactInboxUnsubscribe();
  }
  contactInboxUnsubscribe = null;
}

function startContactInboxSubscription() {
  stopContactInboxSubscription();

  contactInboxUnsubscribe = onSnapshot(
    collection(db, "contactMessages"),
    (snapshot) => {
      const messages = snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
      renderContactInboxCounts(messages);
    },
    (error) => {
      console.error("Unable to subscribe to super admin contact inbox counts:", error);
    }
  );
}

function updateInboxBadge(id, count) {
  const badge = document.getElementById(id);
  if (!badge) return;

  const safeCount = Math.max(0, Number(count) || 0);
  badge.hidden = safeCount <= 0;
  badge.textContent = safeCount > 99 ? "99+" : String(safeCount);
}

function updateInboxPanelBadge(id, count) {
  const badge = document.getElementById(id);
  if (!badge) return;

  const safeCount = Math.max(0, Number(count) || 0);
  badge.hidden = safeCount <= 0;
  badge.textContent = `${safeCount > 99 ? "99+" : safeCount} open`;
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
  const learners = users.filter((user) => getRoleFromUserData(user) === "user");
  const averageXp = users.length
    ? Math.round(users.reduce((sum, user) => sum + (user.xp || 0), 0) / users.length)
    : 0;
  const pretestAverage = summarizeAssessmentAverage(learners, "pretest");
  const quizAverage = summarizeQuizTrackAverage(learners);
  const posttestAverage = summarizeAssessmentAverage(learners, "posttest");
  const hardwareCompletion = summarizeSubjectCompletion(learners, "hardware");
  const electricalCompletion = summarizeSubjectCompletion(learners, "electrical");
  const retentionSummary = summarizeRetentionInsights(learners);

  setText("superTotalUsers", totalUsers);
  setText("superAdminCount", totalAdmins);
  setText("superSuperCount", totalSupers);
  setText("superAverageXp", `${averageXp} XP`);
  setText("superAveragePretest", `${pretestAverage.percent}%`);
  setText("superAveragePretestDetail", `${pretestAverage.count} recorded tests`);
  setText("superAverageQuizTrack", `${quizAverage.percent}%`);
  setText("superAverageQuizTrackDetail", `${quizAverage.count} recorded quiz levels`);
  setText("superAveragePosttest", `${posttestAverage.percent}%`);
  setText("superAveragePosttestDetail", `${posttestAverage.count} recorded tests`);
  setText("superHardwareCompletion", `${hardwareCompletion.percent}%`);
  setText("superHardwareCompletionDetail", `${hardwareCompletion.completed} of ${hardwareCompletion.total} learners`);
  setText("superElectricalCompletion", `${electricalCompletion.percent}%`);
  setText("superElectricalCompletionDetail", `${electricalCompletion.completed} of ${electricalCompletion.total} learners`);
  setText("superDueRetentionCards", retentionSummary.dueCards);
  setText(
    "superDueRetentionCardsDetail",
    retentionSummary.dueCards
      ? `${retentionSummary.dueCards} flashcard review item(s) are already due.`
      : "No due flashcards right now"
  );
  setText("superLearnersWithDueRetention", retentionSummary.learnersWithDue);
  setText("superLearnersWithDueRetentionDetail", `${retentionSummary.learnersWithDue} learner(s) need memory review`);
  renderLastUpdated("superLastUpdated", "superLastUpdatedDetail");
}

function summarizeAssessmentAverage(learners, stage) {
  const entries = learners.flatMap((learner) => {
    const results = learner.results || {};

    return Object.entries(results)
      .filter(([key, value]) => key.endsWith(`_${stage}`) && value && typeof value === "object")
      .map(([, value]) => {
        const score = Math.max(0, Number(value.score || 0));
        const total = Math.max(score, Number(value.total || 0) || 0);
        const percent = total ? (score / total) * 100 : Number(value.percent || 0);
        return Number.isFinite(percent) ? percent : null;
      })
      .filter((value) => value != null);
  });

  if (!entries.length) {
    return { percent: 0, count: 0 };
  }

  return {
    percent: Math.round(entries.reduce((sum, value) => sum + value, 0) / entries.length),
    count: entries.length
  };
}

function summarizeQuizTrackAverage(learners) {
  const entries = learners.flatMap((learner) => {
    const results = learner.results || {};
    return Object.entries(results)
      .filter(([key, value]) => key.includes("_quiz_level_") && key.endsWith("_result") && value && typeof value === "object")
      .map(([, value]) => {
        const score = Math.max(0, Number(value.score || value.correct || value.correctAnswers || value.points || 0));
        const total = Math.max(score, Number(value.total || value.items || value.totalQuestions || value.maxScore || 0));
        return total ? (score / total) * 100 : null;
      })
      .filter((value) => value != null && Number.isFinite(value));
  });

  if (!entries.length) {
    return { percent: 0, count: 0 };
  }

  return {
    percent: Math.round(entries.reduce((sum, value) => sum + value, 0) / entries.length),
    count: entries.length
  };
}

function renderLastUpdated(timeId, detailId) {
  const now = new Date();
  setText(timeId, now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  setText(detailId, now.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" }));
}

function summarizeSubjectCompletion(learners, subject) {
  const completed = learners.filter((learner) => {
    const progress = learner.progress || {};
    const results = learner.results || {};
    return progress[`${subject}_posttest`] === true || results[`${subject}_posttest`] != null;
  }).length;

  return {
    completed,
    total: learners.length,
    percent: learners.length ? Math.round((completed / learners.length) * 100) : 0
  };
}

function summarizeSubjectStatusBuckets(learners, subject) {
  return learners.reduce((summary, learner) => {
    const progress = learner.progress || {};
    const results = learner.results || {};
    const completed = progress[`${subject}_posttest`] === true || results[`${subject}_posttest`] != null;
    const started = completed
      || progress[`${subject}_pretest`] === true
      || progress[`${subject}_modules`] === true
      || progress[`${subject}_quiz`] === true
      || results[`${subject}_pretest`] != null
      || Object.keys(progress).some((key) => key.startsWith(`${subject}_`) && progress[key] === true)
      || Object.keys(results).some((key) => key.startsWith(`${subject}_`));

    if (completed) {
      summary.completed += 1;
    } else if (started) {
      summary.inProgress += 1;
    } else {
      summary.notStarted += 1;
    }

    return summary;
  }, { notStarted: 0, inProgress: 0, completed: 0 });
}

function getLearnerRetentionItems(learner) {
  return Array.isArray(learner?.retentionQueue) ? learner.retentionQueue : [];
}

function isDueRetentionItem(item) {
  const dueAt = new Date(item?.dueAt || 0).getTime();
  return Number.isFinite(dueAt) && dueAt <= Date.now();
}

function summarizeRetentionInsights(learners) {
  return learners.reduce((summary, learner) => {
    const items = getLearnerRetentionItems(learner);
    const dueCount = items.filter(isDueRetentionItem).length;

    summary.dueCards += dueCount;
    summary.learnersWithDue += dueCount > 0 ? 1 : 0;
    summary.lowConfidenceCards += items.reduce((sum, item) => sum + Math.max(0, Number(item?.lowConfidenceCount || 0)), 0);
    summary.recoveries += items.reduce((sum, item) => sum + Math.max(0, Number(item?.completedCycles || 0)), 0);

    return summary;
  }, {
    dueCards: 0,
    learnersWithDue: 0,
    lowConfidenceCards: 0,
    recoveries: 0
  });
}

function summarizeTwoFactorOversight(users, profiles) {
  const privilegedUsers = users.filter((user) => ["admin", "super_admin"].includes(getRoleFromUserData(user)));
  const profileIndex = buildSecurityProfileIndex(profiles);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startMs = startOfToday.getTime();

  const rows = privilegedUsers.map((user) => {
    const role = getRoleFromUserData(user);
    const profile = getSecurityProfileForUser(user, profileIndex);
    const appEnrolled = Boolean(profile?.appMfaEnabled && profile?.totpSecret);
    const legacyEnrolled = Boolean(profile?.totpEnabled && profile?.totpSecret);
    const enrolled = appEnrolled || legacyEnrolled;
    const backupCodesRemaining = (appEnrolled || legacyEnrolled) && Array.isArray(profile?.backupCodeHashes)
      ? profile.backupCodeHashes.length
      : null;
    const lastVerifiedMs = toTimestampMs(profile?.lastVerifiedAt);
    const enrolledMs = toTimestampMs(profile?.enrolledAt);
    const providerLabel = appEnrolled ? "App authenticator 2FA" : "Legacy app 2FA";

    return {
      id: user.id,
      name: user.name || user.email || "Privileged User",
      email: user.email || "No email",
      role,
      enrolled,
      nativeEnrolled: false,
      legacyEnrolled,
      appEnrolled,
      providerLabel,
      backupCodesRemaining,
      backupCodeUseCount: Math.max(0, Number(profile?.backupCodeUseCount || 0)),
      lastVerificationMethod: String(profile?.lastVerificationMethod || ""),
      lastVerifiedMs,
      lastVerifiedLabel: lastVerifiedMs ? formatAdminDateTime(lastVerifiedMs) : "Not verified yet",
      enrolledLabel: enrolledMs ? formatAdminDateTime(enrolledMs) : "Not enrolled yet",
      verifiedToday: lastVerifiedMs >= startMs
    };
  });

  return {
    privilegedCount: rows.length,
    enrolledCount: rows.filter((row) => row.enrolled).length,
    pendingCount: rows.filter((row) => !row.enrolled).length,
    verifiedTodayCount: rows.filter((row) => row.verifiedToday).length,
    lowBackupCount: rows.filter((row) => row.enrolled && row.backupCodesRemaining <= 2).length,
    backupUseCount: rows.reduce((sum, row) => sum + row.backupCodeUseCount, 0),
    rows
  };
}

async function addCurrentSessionMfaProfile(profiles) {
  return profiles;
}

function buildSecurityProfileIndex(profiles) {
  const byId = new Map();
  const byEmail = new Map();

  profiles.forEach((profile) => {
    const keys = [profile.id, profile.uid].filter(Boolean);
    keys.forEach((key) => byId.set(String(key), profile));

    const email = normalizeEmail(profile.email);
    if (email) byEmail.set(email, profile);
  });

  return { byId, byEmail };
}

function getSecurityProfileForUser(user, profileIndex) {
  const keys = [user.id, user.uid, user.authUid, user.firebaseUid].filter(Boolean);
  for (const key of keys) {
    const profile = profileIndex.byId.get(String(key));
    if (profile) return profile;
  }

  const profileByEmail = profileIndex.byEmail.get(normalizeEmail(user.email));
  return profileByEmail || null;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function toTimestampMs(value) {
  if (!value) return 0;
  if (typeof value?.toDate === "function") {
    return value.toDate().getTime();
  }
  if (typeof value?.seconds === "number") {
    return (value.seconds * 1000) + Math.round(Number(value.nanoseconds || 0) / 1000000);
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAdminDateTime(value) {
  const ms = toTimestampMs(value);
  if (!ms) return "Unknown time";
  return new Date(ms).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function summarizeHighestRetentionLoads(learners, limit = 5) {
  return [...learners]
    .map((learner) => {
      const items = getLearnerRetentionItems(learner);
      const dueCount = items.filter(isDueRetentionItem).length;
      return {
        title: learner.name || learner.email || "Learner",
        metric: dueCount,
        detail: `${items.length} total card(s) • ${learner.email || "No email"}`
      };
    })
    .filter((item) => item.metric > 0)
    .sort((a, b) => b.metric - a.metric || a.title.localeCompare(b.title))
    .slice(0, limit);
}

function summarizeLowestRetentionRecovery(learners, limit = 5) {
  return [...learners]
    .map((learner) => {
      const items = getLearnerRetentionItems(learner);
      const totalCards = items.length;
      const recoveredCards = items.filter((item) => Number(item?.completedCycles || 0) > 0).length;
      const dueCards = items.filter(isDueRetentionItem).length;
      const recoveryPercent = totalCards ? Math.round((recoveredCards / totalCards) * 100) : 0;

      return {
        title: learner.name || learner.email || "Learner",
        metric: `${recoveryPercent}%`,
        detail: `${recoveredCards}/${totalCards} recovered • ${dueCards} due • ${learner.email || "No email"}`,
        totalCards,
        sortPercent: recoveryPercent,
        sortDue: dueCards
      };
    })
    .filter((item) => item.totalCards > 0)
    .sort((a, b) => a.sortPercent - b.sortPercent || b.sortDue - a.sortDue || a.title.localeCompare(b.title))
    .slice(0, limit);
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

function renderRetentionOversight(users) {
  const learners = users.filter((user) => getRoleFromUserData(user) === "user");
  const summary = summarizeRetentionInsights(learners);

  setText("superLowConfidenceRetention", summary.lowConfidenceCards);
  setText(
    "superLowConfidenceRetentionDetail",
    summary.lowConfidenceCards
      ? `${summary.lowConfidenceCards} low-confidence memory card(s) are still being tracked in learner queues.`
      : "No low-confidence cards recorded yet."
  );
  setText("superRetentionRecoveries", summary.recoveries);
  setText(
    "superRetentionRecoveriesDetail",
    summary.recoveries
      ? `${summary.recoveries} successful recovery cycle(s) have already been recorded across learner flashcards.`
      : "No flashcard recoveries recorded yet."
  );

  renderInsightList(
    "superRetentionLoads",
    summarizeHighestRetentionLoads(learners, 5),
    "No due flashcards are waiting right now."
  );
  renderInsightList(
    "superLowestRetentionRecovery",
    summarizeLowestRetentionRecovery(learners, 5),
    "No learner has entered the retention queue yet."
  );
}

function renderTwoFactorOversight(users, profiles) {
  const summary = summarizeTwoFactorOversight(users, profiles);

  setText("superMfaPrivilegedCount", summary.privilegedCount);
  setText(
    "superMfaPrivilegedCountDetail",
    summary.privilegedCount
      ? `${summary.privilegedCount} admin or super-admin account(s) are being monitored for privileged access.`
      : "No admin or super-admin records found yet."
  );
  setText("superMfaEnrolledCount", summary.enrolledCount);
  setText(
    "superMfaEnrolledCountDetail",
    summary.enrolledCount
      ? `${summary.enrolledCount} privileged account(s) have app-level authenticator 2FA recorded.`
      : "No privileged accounts are enrolled yet."
  );
  setText("superMfaPendingCount", summary.pendingCount);
  setText(
    "superMfaPendingCountDetail",
    summary.pendingCount
      ? `${summary.pendingCount} privileged account(s) still need app-level 2FA enrollment.`
      : "No enrollment gaps found."
  );
  setText("superMfaVerifiedTodayCount", summary.verifiedTodayCount);
  setText(
    "superMfaVerifiedTodayCountDetail",
    summary.verifiedTodayCount
      ? `${summary.verifiedTodayCount} privileged account(s) completed a 2FA check today.`
      : "No privileged verifications recorded today."
  );
  setText("superMfaLowBackupCount", summary.lowBackupCount);
  setText(
    "superMfaLowBackupCountDetail",
    summary.lowBackupCount
      ? `${summary.lowBackupCount} app-level 2FA account(s) should re-enroll soon because only 2 or fewer backup codes remain.`
      : "No app-level 2FA account has a low backup-code reserve."
  );
  setText("superMfaBackupUseCount", summary.backupUseCount);
  setText(
    "superMfaBackupUseCountDetail",
    summary.backupUseCount
      ? `${summary.backupUseCount} backup-code recovery sign-in(s) have been used so far.`
      : "No backup-code recovery has been used yet."
  );

  const enrollmentRows = summary.rows
    .slice()
    .sort((a, b) => {
      if (a.enrolled !== b.enrolled) return a.enrolled ? 1 : -1;
      if (a.role !== b.role) return a.role.localeCompare(b.role);
      return a.name.localeCompare(b.name);
    })
    .map((row) => ({
      title: row.name,
      metric: row.enrolled ? "Enrolled" : "Pending",
      detail: `${row.role} • ${row.email} • Provider: ${row.enrolled ? row.providerLabel : "Not recorded"} • Last verified: ${row.lastVerifiedLabel}`
    }));

  const recentRows = summary.rows
    .filter((row) => row.lastVerifiedMs > 0)
    .sort((a, b) => b.lastVerifiedMs - a.lastVerifiedMs)
    .slice(0, 6)
    .map((row) => ({
      title: row.name,
      metric: row.lastVerifiedLabel,
      detail: `${row.role} • ${row.email} • Method: ${row.lastVerificationMethod || "unknown"} • Provider: ${row.providerLabel}`
    }));

  const recoveryRiskRows = summary.rows
    .filter((row) => row.enrolled)
    .sort((a, b) => a.backupCodesRemaining - b.backupCodesRemaining || b.backupCodeUseCount - a.backupCodeUseCount || a.name.localeCompare(b.name))
    .slice(0, 6)
    .map((row) => ({
      title: row.name,
      metric: `${row.backupCodesRemaining} codes`,
      detail: `${row.role} • ${row.email} • Backup recoveries used: ${row.backupCodeUseCount} • Last verified: ${row.lastVerifiedLabel}`
    }));

  renderInsightList(
    "superMfaEnrollmentList",
    enrollmentRows,
    "No privileged accounts are available to audit yet."
  );
  renderInsightList(
    "superMfaRecentVerificationList",
    recentRows,
    "No privileged account has completed 2FA verification yet."
  );
  renderInsightList(
    "superMfaRecoveryRiskList",
    recoveryRiskRows,
    "No app-level backup-code risk is currently being tracked."
  );
}

function renderMostMissedTopics(users) {
  const container = document.getElementById("superMostMissedTopics");
  if (!container) return;

  const learners = users.filter((user) => getRoleFromUserData(user) === "user");
  const items = summarizeMostMissedTopics(learners, 6);

  if (!items.length) {
    container.innerHTML = `<div class="review-item"><p>No missed-topic data is available yet.</p></div>`;
    return;
  }

  container.innerHTML = items.map((item, index) => `
    <article class="review-item topic-breakdown-card">
      <div class="insight-review-item">
        <div>
          <h5>${escapeHtml(item.title)}</h5>
          <p>${escapeHtml(item.detail)}</p>
        </div>
        <strong>${item.metric}</strong>
      </div>
      <div class="topic-breakdown-stats">
        <span class="topic-breakdown-stat">${item.learners.length} learner(s)</span>
        <span class="topic-breakdown-stat">${escapeHtml(item.subject)}</span>
      </div>
      <button type="button" class="secondary-action topic-detail-btn" data-topic-detail="${index}">View Details</button>
    </article>
  `).join("");

  const topicButtons = container.querySelectorAll("[data-topic-detail]");
  topicButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const detailIndex = Number(button.dataset.topicDetail || -1);
      if (detailIndex < 0 || detailIndex >= items.length) return;
      openMissedTopicModal(items[detailIndex]);
    });
  });
}

function summarizeMostMissedTopics(learners, limit = 5) {
  const topicMap = new Map();

  learners.forEach((learner) => {
    const items = Array.isArray(learner.wrongAnswerReview) ? learner.wrongAnswerReview : [];

    items.forEach((item) => {
      const title = String(item?.title || item?.question || "Unlabeled Topic").trim();
      const subject = String(item?.subject || "").trim();
      const weight = Math.max(1, Number(item?.wrongCount || 1));
      const key = `${subject}::${title}`;
      const existing = topicMap.get(key) || {
        title,
        metric: 0,
        learners: new Set(),
        subject
      };

      existing.metric += weight;
      existing.learners.add(learner.id || learner.email || learner.name || `learner-${existing.learners.size + 1}`);
      topicMap.set(key, existing);
    });
  });

  return Array.from(topicMap.values())
    .map((item) => ({
      title: item.title,
      metric: item.metric,
      detail: `${item.learners.size} learner(s) • ${item.subject || "general"}`,
      learners: Array.from(item.learners),
      subject: item.subject || "general",
      entries: learners.flatMap((learner) => {
        const reviewItems = Array.isArray(learner.wrongAnswerReview) ? learner.wrongAnswerReview : [];
        return reviewItems
          .filter((review) => String(review?.title || review?.question || "Unlabeled Topic").trim() === item.title && String(review?.subject || "").trim() === item.subject)
          .map((review) => ({
            learnerName: learner.name || learner.email || "Learner",
            learnerEmail: learner.email || "",
            question: review.question || "No question text saved.",
            wrongCount: Math.max(1, Number(review.wrongCount || 1))
          }));
      })
    }))
    .sort((a, b) => b.metric - a.metric || a.title.localeCompare(b.title))
    .slice(0, limit);
}

function renderSubjectCompletionBreakdown(users) {
  const grid = document.getElementById("superCompletionBreakdown");
  if (!grid) return;

  const learners = users.filter((user) => getRoleFromUserData(user) === "user");
  const subjects = [
    { key: "hardware", label: "Computer Hardware" },
    { key: "electrical", label: "Electrical" }
  ];

  grid.innerHTML = subjects.map((subject) => {
    const buckets = summarizeSubjectStatusBuckets(learners, subject.key);
    return `
      <article class="analytics-card">
        <span>${subject.label}</span>
        <strong>${buckets.completed} completed</strong>
        <p>${buckets.inProgress} in progress • ${buckets.notStarted} not started</p>
      </article>
    `;
  }).join("");
}

function openMissedTopicModal(item) {
  setText("missedTopicModalTitle", item.title || "Missed Topic");
  setText("missedTopicModalSubtitle", `${item.metric} total misses • ${item.learners.length} learner(s) • ${item.subject || "general"}`);
  const body = document.getElementById("missedTopicModalBody");
  if (body) {
    const learnerRows = item.entries.length
      ? item.entries.map((entry) => `
          <div class="topic-modal-row">
            <strong>${escapeHtml(entry.learnerName)}</strong>
            <p>${escapeHtml(entry.question)}</p>
            <small>${escapeHtml(entry.learnerEmail || "No email")} • ${entry.wrongCount} miss(es)</small>
          </div>
        `).join("")
      : `<div class="topic-modal-row"><p>No learner entries available.</p></div>`;

    body.innerHTML = `
      <section class="topic-modal-group">
        <h4>Affected Learners</h4>
        <div class="topic-modal-list">${learnerRows}</div>
      </section>
    `;
  }

  const modal = document.getElementById("missedTopicModal");
  modal?.classList.add("active");
  modal?.querySelector(".admin-modal-box")?.focus({ preventScroll: true });
}

function renderInsightList(targetId, items, emptyMessage) {
  const target = document.getElementById(targetId);
  if (!target) return;

  if (!items.length) {
    target.innerHTML = `<div class="review-item"><p>${escapeHtml(emptyMessage)}</p></div>`;
    return;
  }

  target.innerHTML = items.map((item) => `
    <article class="review-item insight-review-item">
      <div>
        <h5>${escapeHtml(item.title)}</h5>
        <p>${escapeHtml(item.detail)}</p>
      </div>
      <strong>${item.metric}</strong>
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
      <td data-label="Name">${escapeHtml(user.name || "User")}</td>
      <td data-label="Email">${escapeHtml(user.email || "No email")}</td>
      <td data-label="Role">
        <select class="inline-select" data-role-select="${user.id}">
          <option value="user" ${getRoleFromUserData(user) === "user" ? "selected" : ""}>User</option>
          <option value="admin" ${getRoleFromUserData(user) === "admin" ? "selected" : ""}>Admin</option>
          <option value="super_admin" ${getRoleFromUserData(user) === "super_admin" ? "selected" : ""}>Super Admin</option>
        </select>
      </td>
      <td data-label="Status">
        <select class="inline-select" data-status-select="${user.id}">
          <option value="active" ${statusValue === "active" ? "selected" : ""}>Active</option>
          <option value="suspended" ${statusValue === "suspended" ? "selected" : ""}>Suspended</option>
          <option value="archived" ${statusValue === "archived" ? "selected" : ""}>Archived</option>
        </select>
      </td>
      <td data-label="XP">${user.xp || 0}</td>
      <td data-label="Progress">${progressCount} flags</td>
      <td data-label="Actions">
        <button class="primary-action compact-action" data-save-user="${user.id}">Save</button>
        <button class="secondary-action compact-action" data-reset-user="${user.id}">Reset Learner Data</button>
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

  body.querySelectorAll("[data-reset-user]").forEach((button) => {
    button.addEventListener("click", async () => {
      const userId = button.getAttribute("data-reset-user");
      if (!userId) return;
      const userRecord = users.find((entry) => entry.id === userId) || {};
      const userName = userRecord.name || userRecord.email || "this learner";
      const role = getRoleFromUserData(userRecord);
      const resetProgress = role && role !== "user" ? { role } : {};

      openSystemPopup(
        "Reset Learner Data",
        `Reset XP, progress, assessment results, review queues, and leaderboard score for ${userName}? The account record, role, email, and login access will stay.`,
        async () => {
          setStatus("Resetting learner data...");
          await Promise.all([
            setDoc(doc(db, "users", userId), {
              xp: 0,
              xpWeekly: 0,
              xpChange: 0,
              streak: 0,
              progress: resetProgress,
              results: {},
              wrongAnswerReview: [],
              studyHistory: [],
              retentionQueue: [],
              resumeActivity: null,
              lastWeeklyReset: "",
              lastActiveDate: "",
              updatedAt: serverTimestamp()
            }, { merge: true }),
            setDoc(doc(db, "leaderboard_public", userId), {
              name: userRecord.name || userRecord.email || "User",
              photo: userRecord.photo || "https://i.pravatar.cc/40?img=12",
              xp: 0,
              xpWeekly: 0,
              xpChange: 0,
              updatedAt: new Date().toISOString()
            }, { merge: true })
          ]);
          await writeAuditLog("learner_data_reset", `Reset learner data and leaderboard score for user ${userId}`);
          setStatus("Learner data reset. Reloading table...");
          closeSystemPopup();
          await loadSuperAdminDashboard();
        },
        { confirmLabel: "Reset Data" }
      );
    });
  });

  body.querySelectorAll("[data-delete-user]").forEach((button) => {
    button.addEventListener("click", async () => {
      const userId = button.getAttribute("data-delete-user");
      if (!userId || userId === currentUser.uid) return;
      const userRecord = users.find((entry) => entry.id === userId) || {};
      const userEmail = String(userRecord.email || "").trim().toLowerCase();
      openSystemPopup(
        "Delete User Record",
        "Delete this user's Firestore app record, public leaderboard entry, 2FA profile, and email access grant? This will not remove the Firebase Auth account or clear saved data on the learner's own browser.",
        async () => {
          setStatus("Deleting user record and revoking app access...");
          const deletionTasks = [
            deleteDoc(doc(db, "users", userId)),
            deleteDoc(doc(db, "leaderboard_public", userId)),
            deleteDoc(doc(db, "securityProfiles", userId))
          ];

          if (userEmail) {
            deletionTasks.push(setDoc(doc(db, "accessRoles", encodeURIComponent(userEmail)), {
              email: userEmail,
              role: "user",
              revokedAt: serverTimestamp(),
              revokedByUid: currentUser.uid,
              revokedByEmail: currentUser.email || ""
            }, { merge: true }));
          }

          await Promise.all(deletionTasks);
          await writeAuditLog("user_record_deleted", `Deleted Firestore user, leaderboard, security profile, and revoked app role for user ${userId}`);
          setStatus("User record removed and app access revoked. Reloading table...");
          closeSystemPopup();
          await loadSuperAdminDashboard();
        }
      );
    });
  });
}

function wireLearnerScoreExport() {
  const button = document.getElementById("superExportScoresBtn");
  const answersButton = document.getElementById("superExportAnswersBtn");

  if (button && button.dataset.bound !== "true") {
    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      const learners = superUsersCache.filter((user) => getRoleFromUserData(user) === "user");
      exportLearnerScoresCsv(learners, DEMO_ANALYTICS_MODE ? "analytics-preview" : "live");
    });
  }

  if (answersButton && answersButton.dataset.bound !== "true") {
    answersButton.dataset.bound = "true";
    answersButton.addEventListener("click", () => {
      const learners = superUsersCache.filter((user) => getRoleFromUserData(user) === "user");
      exportLearnerAnswerDetailsCsv(learners, DEMO_ANALYTICS_MODE ? "analytics-preview" : "live");
    });
  }
}

function wireDataExportCenter() {
  const scoresBtn = document.getElementById("superCenterScoresBtn");
  const answersBtn = document.getElementById("superCenterAnswersBtn");
  const auditBtn = document.getElementById("superCenterAuditBtn");
  const snapshotBtn = document.getElementById("superCenterSnapshotBtn");

  if (scoresBtn && scoresBtn.dataset.bound !== "true") {
    scoresBtn.dataset.bound = "true";
    scoresBtn.addEventListener("click", () => {
      const learners = superUsersCache.filter((user) => getRoleFromUserData(user) === "user");
      exportLearnerScoresCsv(learners, DEMO_ANALYTICS_MODE ? "analytics-preview" : "live");
      setExportCenterStatus("Learner score summary CSV downloaded.");
    });
  }

  if (answersBtn && answersBtn.dataset.bound !== "true") {
    answersBtn.dataset.bound = "true";
    answersBtn.addEventListener("click", () => {
      const learners = superUsersCache.filter((user) => getRoleFromUserData(user) === "user");
      exportLearnerAnswerDetailsCsv(learners, DEMO_ANALYTICS_MODE ? "analytics-preview" : "live");
      setExportCenterStatus("Question-level answer CSV downloaded.");
    });
  }

  if (auditBtn && auditBtn.dataset.bound !== "true") {
    auditBtn.dataset.bound = "true";
    auditBtn.addEventListener("click", () => {
      exportAuditLogCsv().catch((error) => {
        console.error("Unable to export audit log:", error);
        setExportCenterStatus("Unable to export audit log right now.", true);
      });
    });
  }

  if (snapshotBtn && snapshotBtn.dataset.bound !== "true") {
    snapshotBtn.dataset.bound = "true";
    snapshotBtn.addEventListener("click", () => {
      exportFirestoreSnapshotJson().catch((error) => {
        console.error("Unable to export Firestore snapshot:", error);
        setExportCenterStatus("Unable to export Firestore snapshot right now.", true);
      });
    });
  }
}

function setExportCenterStatus(message, isWarning = false) {
  const status = document.getElementById("superExportCenterStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("warning", Boolean(isWarning));
}

function exportLearnerScoresCsv(learners, mode) {
  const button = document.getElementById("superExportScoresBtn");
  const previousText = button?.textContent || "Export Learner Scores";
  const status = document.getElementById("superExportStatus");
  if (button) {
    button.disabled = true;
    button.textContent = "Preparing CSV...";
  }
  if (status) status.textContent = `Preparing ${learners.length} learner record${learners.length === 1 ? "" : "s"} for export.`;

  const headers = [
    "Mode",
    "Exported At",
    "Name",
    "Email",
    "Role",
    "XP",
    "Badges",
    "Completed Modules",
    "Certificate Status",
    "Electrical Pre-Test",
    "Electrical Pre-Test Percent",
    "Electrical Quiz Track",
    "Electrical Quiz Track Percent",
    "Electrical Post-Test",
    "Electrical Post-Test Percent",
    "Electrical Modules",
    "Electrical Completion",
    "Electrical Certificate",
    "Hardware Pre-Test",
    "Hardware Pre-Test Percent",
    "Hardware Quiz Track",
    "Hardware Quiz Track Percent",
    "Hardware Post-Test",
    "Hardware Post-Test Percent",
    "Hardware Modules",
    "Hardware Completion",
    "Hardware Certificate"
  ];

  const rows = learners.map((learner) => {
    const electrical = summarizeLearnerSubjectForExport(learner, "electrical");
    const hardware = summarizeLearnerSubjectForExport(learner, "hardware");

    return [
      mode,
      formatExportTimestamp(new Date()),
      learner.name || "User",
      learner.email || "",
      getRoleFromUserData(learner),
      learner.xp || 0,
      countLearnerBadges(learner),
      countCompletedModules(learner.progress || {}),
      getOverallCertificateStatus(learner),
      electrical.pretest,
      electrical.pretestPercent,
      electrical.quiz,
      electrical.quizPercent,
      electrical.posttest,
      electrical.posttestPercent,
      electrical.modules,
      electrical.completion,
      electrical.certificate,
      hardware.pretest,
      hardware.pretestPercent,
      hardware.quiz,
      hardware.quizPercent,
      hardware.posttest,
      hardware.posttestPercent,
      hardware.modules,
      hardware.completion,
      hardware.certificate
    ];
  });

  const filename = `code-recall-learner-scores-${mode}-${formatExportDateStamp(new Date())}.csv`;
  downloadCsv(filename, [headers, ...rows]);
  if (status) status.textContent = `Export ready: ${filename}`;
  if (button) {
    button.disabled = false;
    button.textContent = previousText;
  }
}

function summarizeLearnerSubjectForExport(learner, subject) {
  const results = learner.results || {};
  const progress = learner.progress || {};
  const pretest = getExportResultMetrics(results[`${subject}_pretest`]);
  const quiz = getExportQuizTrackMetrics(results, subject);
  const posttest = getExportResultMetrics(results[`${subject}_posttest`]);

  return {
    pretest: pretest.label,
    pretestPercent: pretest.percentLabel,
    quiz: quiz.label,
    quizPercent: quiz.percentLabel,
    posttest: posttest.label,
    posttestPercent: posttest.percentLabel,
    modules: `${countSubjectCompletedModules(progress, subject)}/${getSubjectModuleTarget()} modules`,
    completion: progress[`${subject}_posttest`] === true || results[`${subject}_posttest`] ? "Complete" : describeSubjectStage(progress, subject),
    certificate: getSubjectCertificateStatus(learner, subject)
  };
}

function formatExportResult(result) {
  return getExportResultMetrics(result).label;
}

function getExportResultMetrics(result) {
  if (!result) return { label: "No live record yet", percentLabel: "No live record yet", percent: 0 };

  const score = readResultNumber(result, ["score", "correct", "correctAnswers", "points"]);
  const total = readResultNumber(result, ["total", "items", "questionCount", "totalQuestions", "maxScore"]);
  const percent = Number(result.percent);

  if (Number.isFinite(score) && Number.isFinite(total)) {
    const computedPercent = getPercent(score, total);
    return { label: `${score}/${total}`, percentLabel: `${computedPercent}%`, percent: computedPercent };
  }

  if (Number.isFinite(percent)) {
    const roundedPercent = Math.round(percent);
    return { label: `${roundedPercent}%`, percentLabel: `${roundedPercent}%`, percent: roundedPercent };
  }

  if (Number.isFinite(score)) return { label: `${score}`, percentLabel: "Recorded", percent: 0 };
  return { label: "Recorded", percentLabel: "Recorded", percent: 0 };
}

function formatExportQuizTrack(results, subject) {
  return getExportQuizTrackMetrics(results, subject).label;
}

function getExportQuizTrackMetrics(results, subject) {
  const entries = Object.entries(results || {})
    .filter(([key]) => key.startsWith(`${subject}_`) && key.includes("_quiz_level_") && key.endsWith("_result"));
  const summary = entries.reduce((total, [, value]) => {
    const score = readResultNumber(value, ["score", "correct", "correctAnswers", "points"]);
    const max = readResultNumber(value, ["total", "items", "questionCount", "totalQuestions", "maxScore"]);
    if (Number.isFinite(score)) total.score += score;
    if (Number.isFinite(max)) total.max += max;
    total.count += 1;
    return total;
  }, { score: 0, max: 0, count: 0 });

  if (!summary.count) return { label: "No live record yet", percentLabel: "No live record yet", percent: 0, count: 0 };

  const targetMax = DEMO_ANALYTICS_QUIZ_LEVELS * DEMO_ANALYTICS_DIFFICULTIES.length * DEMO_ANALYTICS_QUIZ_TOTAL;
  const max = summary.max || targetMax;
  const percent = getPercent(summary.score, max);

  return {
    label: `${summary.score}/${max} across ${summary.count} level${summary.count === 1 ? "" : "s"}`,
    percentLabel: `${percent}%`,
    percent,
    count: summary.count
  };
}

function getSubjectModuleTarget() {
  return DEMO_ANALYTICS_DIFFICULTIES.length * DEMO_ANALYTICS_MODULES_PER_DIFFICULTY;
}

function getSubjectQuizTargetLevels() {
  return DEMO_ANALYTICS_QUIZ_LEVELS * DEMO_ANALYTICS_DIFFICULTIES.length;
}

function countSubjectCompletedModules(progress = {}, subject) {
  return Object.entries(progress || {}).filter(([key, value]) => {
    return value === true && key.startsWith(`${subject}_`) && key.includes("_module_") && key.endsWith("_done");
  }).length;
}

function getSubjectCompletionSteps(learner, subject) {
  const progress = learner.progress || {};
  const results = learner.results || {};
  return [
    { label: "Pre-Test", complete: progress[`${subject}_pretest`] === true || Boolean(results[`${subject}_pretest`]) },
    { label: "Modules", complete: progress[`${subject}_modules`] === true || countSubjectCompletedModules(progress, subject) >= getSubjectModuleTarget() },
    { label: "Quiz Track", complete: progress[`${subject}_quiz`] === true || getExportQuizTrackMetrics(results, subject).count >= getSubjectQuizTargetLevels() },
    { label: "Post-Test", complete: progress[`${subject}_posttest`] === true || Boolean(results[`${subject}_posttest`]) }
  ];
}

function getSubjectCertificateStatus(learner, subject) {
  return getSubjectCompletionSteps(learner, subject).every((step) => step.complete) ? "Ready" : "Locked";
}

function getOverallCertificateStatus(learner) {
  const hardwareReady = getSubjectCertificateStatus(learner, "hardware") === "Ready";
  const electricalReady = getSubjectCertificateStatus(learner, "electrical") === "Ready";
  if (hardwareReady && electricalReady) return "Dual certificate ready";
  if (hardwareReady) return "Hardware certificate ready";
  if (electricalReady) return "Electrical certificate ready";
  return "No certificate yet";
}

function countLearnerBadges(learner) {
  const badges = learner.badges || learner.earnedBadges || learner.unlockedBadges || [];
  if (Array.isArray(badges)) return badges.length;
  if (badges && typeof badges === "object") return Object.values(badges).filter(Boolean).length;
  return 0;
}

function exportLearnerAnswerDetailsCsv(learners, mode) {
  const button = document.getElementById("superExportAnswersBtn");
  const previousText = button?.textContent || "Export Answer Details";
  const status = document.getElementById("superExportStatus");
  if (button) {
    button.disabled = true;
    button.textContent = "Preparing answers...";
  }
  if (status) status.textContent = `Preparing answer details for ${learners.length} learner record${learners.length === 1 ? "" : "s"}.`;

  const headers = [
    "Mode",
    "Exported At",
    "Name",
    "Email",
    "Subject",
    "Assessment Type",
    "Level",
    "Question No.",
    "Question",
    "Learner Answer",
    "Correct Answer",
    "Result",
    "Confidence",
    "Wrong Count",
    "Rationale",
    "Source",
    "Answered At"
  ];

  const exportedAt = formatExportTimestamp(new Date());
  const rows = learners.flatMap((learner) => {
    const details = collectLearnerAnswerDetails(learner);
    if (!details.length) {
      return [[
        mode,
        exportedAt,
        learner.name || "User",
        learner.email || "",
        "",
        "",
        "",
        "",
        "No question-level answer records saved yet",
        "",
        "",
        "No details",
        "",
        "",
        "Older score-only attempts may not include selected answers.",
        "summary",
        ""
      ]];
    }

    return details.map((item) => [
      mode,
      exportedAt,
      learner.name || "User",
      learner.email || "",
      item.subject,
      item.type,
      item.level,
      item.questionNumber,
      item.question,
      item.selectedAnswer,
      item.correctAnswer,
      item.result,
      item.confidence,
      item.wrongCount,
      item.rationale,
      item.source,
      item.answeredAt
    ]);
  });

  const filename = `code-recall-answer-details-${mode}-${formatExportDateStamp(new Date())}.csv`;
  downloadCsv(filename, [headers, ...rows]);
  if (status) status.textContent = `Answer-detail export ready: ${filename}`;
  if (button) {
    button.disabled = false;
    button.textContent = previousText;
  }
}

async function exportAuditLogCsv() {
  setExportCenterStatus("Preparing audit log CSV...");
  setExportCenterBusy("superCenterAuditBtn", true);

  try {
    const auditSnap = await safeGetDocs("auditLogs", collection(db, "auditLogs"));
    const entries = auditSnap.docs
      .map((snap) => ({ id: snap.id, ...snap.data() }))
      .sort((a, b) => toExportTimeMs(b.createdAt) - toExportTimeMs(a.createdAt));
    const headers = [
      "Exported At",
      "Audit ID",
      "Action",
      "Title",
      "Actor Email",
      "Details",
      "Route",
      "Required Role",
      "Resolved Role",
      "Created At"
    ];
    const exportedAt = formatExportTimestamp(new Date());
    const rows = entries.map((entry) => [
      exportedAt,
      entry.id || "",
      formatAuditAction(entry.action),
      formatAuditTitle(entry),
      entry.actorEmail || "",
      entry.details || "",
      entry.metadata?.route || "",
      formatRoleLabel(entry.metadata?.requiredRole || ""),
      formatRoleLabel(entry.metadata?.resolvedRole || ""),
      formatExportAnswerTimestamp(entry.createdAt || "")
    ]);
    const filename = `code-recall-audit-log-${formatExportDateStamp(new Date())}.csv`;
    downloadCsv(filename, [headers, ...rows]);
    setExportCenterStatus(`Audit log export ready: ${filename}`);
  } finally {
    setExportCenterBusy("superCenterAuditBtn", false);
  }
}

async function exportFirestoreSnapshotJson() {
  setExportCenterStatus("Preparing Firestore JSON snapshot...");
  setExportCenterBusy("superCenterSnapshotBtn", true);

  try {
    const collectionNames = [
      "users",
      "leaderboard",
      "accessRoles",
      "pendingUsers",
      "securityProfiles",
      "auditLogs",
      "feedbackNotes",
      "contactMessages"
    ];
    const exportedAt = new Date();
    const snapshots = await Promise.all(collectionNames.map(async (name) => {
      try {
        const snap = await safeGetDocs(name, collection(db, name));
        return {
          name,
          records: snap.docs.map((docSnap) => ({
            id: docSnap.id,
            data: sanitizeForJsonExport(docSnap.data() || {})
          }))
        };
      } catch (error) {
        return {
          name,
          error: error?.message || "Unable to read collection.",
          records: []
        };
      }
    }));
    const payload = {
      app: "Code Recall",
      kind: "firestore-app-data-snapshot",
      mode: DEMO_ANALYTICS_MODE ? "analytics-preview" : "live",
      exportedAt: exportedAt.toISOString(),
      exportedBy: currentUser?.email || "",
      collections: snapshots.reduce((summary, item) => {
        summary[item.name] = item.error
          ? { error: item.error, records: [] }
          : item.records;
        return summary;
      }, {})
    };
    const filename = `code-recall-firestore-snapshot-${formatExportDateStamp(exportedAt)}.json`;
    downloadJson(filename, payload);
    setExportCenterStatus(`Firestore snapshot export ready: ${filename}`);
  } finally {
    setExportCenterBusy("superCenterSnapshotBtn", false);
  }
}

function setExportCenterBusy(buttonId, isBusy) {
  const button = document.getElementById(buttonId);
  if (!button) return;
  button.disabled = Boolean(isBusy);
}

function collectLearnerAnswerDetails(learner) {
  const rows = [];
  const seen = new Set();

  Object.entries(learner.results || {}).forEach(([key, result]) => {
    const answerItems = Array.isArray(result?.answerItems) ? result.answerItems : [];
    answerItems.forEach((item, index) => {
      const row = normalizeAnswerDetailRow({
        ...item,
        subject: item.subject || result.subject || parseSubjectFromResultKey(key),
        type: item.type || result.type || parseTypeFromResultKey(key),
        level: item.level || result.level || "",
        questionNumber: item.questionNumber || index + 1,
        source: item.source || "saved_attempt",
        answeredAt: item.answeredAt || result.completedAt || ""
      });
      addAnswerDetailRow(rows, seen, row);
    });
  });

  (Array.isArray(learner.wrongAnswerReview) ? learner.wrongAnswerReview : []).forEach((item) => {
    addAnswerDetailRow(rows, seen, normalizeAnswerDetailRow({
      ...item,
      type: item.quizType || item.type || "review",
      questionNumber: item.sub || "",
      result: "Wrong",
      source: "wrong_answer_review",
      answeredAt: item.lastAnsweredAt || item.updatedAt || ""
    }));
  });

  (Array.isArray(learner.retentionQueue) ? learner.retentionQueue : []).forEach((item) => {
    addAnswerDetailRow(rows, seen, normalizeAnswerDetailRow({
      ...item,
      type: item.quizType || item.type || "retention",
      questionNumber: item.sub || "",
      result: item.seedReason === "low_confidence_correct" ? "Correct" : "Wrong",
      source: item.seedReason || "retention_queue",
      answeredAt: item.lastAnsweredAt || item.updatedAt || item.createdAt || ""
    }));
  });

  return rows.sort((a, b) =>
    String(a.subject).localeCompare(String(b.subject)) ||
    String(a.type).localeCompare(String(b.type)) ||
    Number(a.questionNumber || 9999) - Number(b.questionNumber || 9999)
  );
}

function addAnswerDetailRow(rows, seen, row) {
  const key = [
    row.subject,
    row.type,
    row.level,
    row.question,
    row.selectedAnswer,
    row.source
  ].join("|").toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  rows.push(row);
}

function normalizeAnswerDetailRow(item = {}) {
  const result = item.result || (item.isCorrect === true ? "Correct" : item.isCorrect === false ? "Wrong" : "");
  return {
    subject: String(item.subject || ""),
    type: String(item.quizType || item.type || ""),
    level: String(item.quizLevel || item.level || ""),
    questionNumber: String(item.questionNumber || item.number || item.sub || ""),
    question: String(item.question || ""),
    selectedAnswer: String(item.selectedAnswer || item.learnerAnswer || ""),
    correctAnswer: String(item.correctAnswer || item.answer || ""),
    result: result || "Recorded",
    confidence: String(item.confidence || ""),
    wrongCount: String(item.wrongCount || (result === "Wrong" ? 1 : "")),
    rationale: String(item.rationale || ""),
    source: String(item.source || ""),
    answeredAt: formatExportAnswerTimestamp(item.answeredAt || item.lastAnsweredAt || item.updatedAt || item.completedAt || "")
  };
}

function parseSubjectFromResultKey(key = "") {
  const match = String(key).match(/^(hardware|electrical)_/);
  return match?.[1] || "";
}

function parseTypeFromResultKey(key = "") {
  if (String(key).includes("_pretest")) return "pretest";
  if (String(key).includes("_posttest")) return "posttest";
  if (String(key).includes("_quiz_")) return "quiz";
  return "";
}

function formatExportAnswerTimestamp(value) {
  if (!value) return "";
  const date = value?.toDate
    ? value.toDate()
    : value?.seconds
      ? new Date(value.seconds * 1000)
      : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "");
  return formatExportTimestamp(date);
}

function toExportTimeMs(value) {
  const date = value?.toDate
    ? value.toDate()
    : value?.seconds
      ? new Date(value.seconds * 1000)
      : new Date(value || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function sanitizeForJsonExport(value) {
  if (value?.toDate) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map((item) => sanitizeForJsonExport(item));
  if (value && typeof value === "object") {
    return Object.entries(value).reduce((next, [key, item]) => {
      next[key] = sanitizeForJsonExport(item);
      return next;
    }, {});
  }
  return value;
}

function countCompletedModules(progress) {
  return Object.entries(progress || {}).filter(([key, value]) => key.includes("_module_") && key.endsWith("_done") && value === true).length;
}

function describeSubjectStage(progress, subject) {
  const pretest = progress[`${subject}_pretest`] === true;
  const modules = progress[`${subject}_modules`] === true;
  const quiz = progress[`${subject}_quiz`] === true;
  const posttest = progress[`${subject}_posttest`] === true;

  if (!pretest) return "Needs Pre-Test";
  if (!modules) return "Needs Modules";
  if (!quiz) return "Needs Quiz";
  if (!posttest) return "Needs Post-Test";
  return "Complete";
}

function readResultNumber(value, keys) {
  for (const key of keys) {
    const direct = Number(value?.[key]);
    if (Number.isFinite(direct)) return direct;

    const nestedValue = value?.[key]?.value ?? value?.[key]?.count ?? value?.[key]?.score;
    const nested = Number(nestedValue);
    if (Number.isFinite(nested)) return nested;
  }

  return NaN;
}

function getPercent(value, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((Number(value || 0) / Number(total || 1)) * 100)));
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatExportDateStamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function formatExportTimestamp(date) {
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
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

    try {
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
    } catch (error) {
      console.error("Unable to save email access.", error);
      setGrantStatus("Unable to save email access right now. Check your current role and try again.");
    }
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
        <div class="grant-copy">
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
      const grant = grants.find((entry) => entry.id === grantId);
      const removingCurrentAccount = (grant?.email || "").toLowerCase() === (currentUser?.email || "").toLowerCase();
      openSystemPopup(
        "Remove Email Access",
        removingCurrentAccount
          ? "You are removing access from the account you are currently using. If you continue, your current super-admin access may be removed and you may be redirected to the dashboard."
          : "You are removing granted email access for this account. The assigned admin or super-admin role will be removed for matching users, and the change will apply immediately to synced records and on the next login.",
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
          if (removingCurrentAccount) {
            const nextRole = await resolveUserRole(db, currentUser);
            await syncUserRole(db, currentUser, nextRole);
            if (nextRole !== "super_admin") {
              setGrantStatus("Your current account no longer has super admin access. Redirecting to dashboard...");
              applyRoleNavigation(nextRole, "dashboard.html");
              window.setTimeout(() => {
                window.location.href = "dashboard.html";
              }, 900);
              return;
            }
          }
          await loadSuperAdminDashboard();
        },
        {
          confirmLabel: removingCurrentAccount ? "Remove My Current Access" : "Remove"
        }
      );
    });
  });
}

function renderAuditLog(entries) {
  const list = document.getElementById("auditLogList");
  if (!list) return;

  if (!entries.length) {
    const hasSearch = Boolean(getAuditSearchTerm());
    list.innerHTML = hasSearch
      ? `<div class="review-item"><h5>No matching audit entries</h5><p>Try another action, email, route, or role keyword.</p></div>`
      : `<div class="review-item"><h5>No audit entries yet</h5><p>System actions will appear here as soon as admins and super admins start working.</p></div>`;
    return;
  }

  list.innerHTML = entries.map((entry) => `
    <article class="review-item">
      <div class="review-meta">
        <span class="meta-pill">${escapeHtml(formatAuditAction(entry.action))}</span>
        <span class="meta-pill">${escapeHtml(entry.actorEmail || "system")}</span>
        <span class="meta-pill">${escapeHtml(formatAdminDateTime(entry.createdAt))}</span>
        ${entry.metadata?.route ? `<span class="meta-pill">${escapeHtml(entry.metadata.route)}</span>` : ""}
      </div>
      <h5>${escapeHtml(formatAuditTitle(entry))}</h5>
      <p>${escapeHtml(entry.details || "No details recorded.")}</p>
      ${renderAuditMetadata(entry.metadata)}
    </article>
  `).join("");
}

function wireAuditSearch() {
  const input = document.getElementById("auditSearchInput");
  if (!input || input.dataset.wired === "true") return;

  input.dataset.wired = "true";
  input.addEventListener("input", () => {
    renderAuditLog(getFilteredAuditEntries());
  });
}

function getAuditSearchTerm() {
  return String(document.getElementById("auditSearchInput")?.value || "").trim().toLowerCase();
}

function getFilteredAuditEntries() {
  const term = getAuditSearchTerm();
  if (!term) return auditLogCache;

  return auditLogCache.filter((entry) => {
    const metadata = entry.metadata || {};
    const haystack = [
      entry.action,
      formatAuditAction(entry.action),
      formatAuditTitle(entry),
      entry.actorEmail,
      entry.details,
      metadata.route,
      metadata.requiredRole,
      metadata.resolvedRole,
      formatRoleLabel(metadata.requiredRole),
      formatRoleLabel(metadata.resolvedRole),
      formatAdminDateTime(entry.createdAt)
    ].join(" ").toLowerCase();

    return haystack.includes(term);
  });
}

function formatAuditAction(action) {
  const labels = {
    denied_admin_route: "Access blocked",
    denied_super_admin_route: "Access blocked",
    mfa_required_privileged_route: "2FA required",
    mfa_enrollment_required: "2FA enrollment",
    reset_own_admin_mfa: "Admin 2FA reset",
    reset_own_super_admin_mfa: "Super Admin 2FA reset"
  };
  return labels[action] || action || "Audit event";
}

function formatAuditTitle(entry) {
  if (entry.action === "denied_admin_route") return "Admin route access was denied";
  if (entry.action === "denied_super_admin_route") return "Super Admin route access was denied";
  if (entry.action === "reset_own_admin_mfa") return "Admin reset their own app-level 2FA";
  if (entry.action === "reset_own_super_admin_mfa") return "Super Admin reset their own app-level 2FA";
  if (entry.action === "mfa_required_privileged_route") return "Privileged route required a 2FA check";
  if (entry.action === "mfa_enrollment_required") return "Privileged account needs 2FA enrollment";
  return "Security audit event";
}

function renderAuditMetadata(metadata = {}) {
  const items = [
    metadata.requiredRole ? `Required: ${formatRoleLabel(metadata.requiredRole)}` : "",
    metadata.resolvedRole ? `Detected: ${formatRoleLabel(metadata.resolvedRole)}` : "",
    metadata.method ? `Method: ${metadata.method}` : ""
  ].filter(Boolean);

  if (!items.length) return "";

  return `
    <div class="review-meta audit-detail-meta">
      ${items.map((item) => `<span class="meta-pill">${escapeHtml(item)}</span>`).join("")}
    </div>
  `;
}

function formatRoleLabel(role) {
  if (role === "super_admin") return "Super Admin";
  if (role === "admin") return "Admin";
  if (role === "user") return "Learner";
  if (role === "guest") return "Guest";
  return role || "Unknown";
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

function formatFirebaseError(error) {
  const code = error?.code || "";
  if (code === "permission-denied") {
    return "Permission denied. Make sure your super admin session has completed app-level 2FA.";
  }

  return error?.message || "Please try again.";
}

function setStatus(message) {
  const el = document.getElementById("superAdminStatus");
  if (el) el.textContent = message;
}

function setGrantStatus(message) {
  const el = document.getElementById("accessGrantStatus");
  if (el) el.textContent = message;
}

function setMfaStatus(message) {
  const el = document.getElementById("superAdminMfaStatus");
  if (el) el.textContent = message;
}

async function resetOwnAppMfa(role, setupPath) {
  if (!currentUser) return;
  clearSuperAdminMfaSession();
  setMfaStatus("Resetting app-level 2FA...");
  await resetOwnAppMfaProfile(db, currentUser, role);
  await writeSecurityAudit(
    db,
    currentUser,
    "reset_own_super_admin_mfa",
    "Super admin reset their own app-level authenticator enrollment."
  );

  setMfaStatus("2FA reset. Opening setup so you can enroll a fresh authenticator.");
  window.location.href = setupPath;
}

async function updateUserUI(user) {
  let profile = {};
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    profile = snap.exists() ? (snap.data() || {}) : {};
  } catch (error) {
    console.warn("Unable to load super-admin profile header.", error);
  }

  setText("username", profile.name || user.displayName || user.email || "Super Admin");
  const photo = document.getElementById("userPhoto");
  if (photo) {
    photo.src = profile.photo || user.photoURL || "https://i.pravatar.cc/40?img=12";
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

function openSystemPopup(title, message, confirmAction, options = {}) {
  const popup = document.getElementById("systemPopup");
  const titleEl = document.getElementById("systemPopupTitle");
  const messageEl = document.getElementById("systemPopupMessage");
  const confirmBtn = document.getElementById("systemPopupConfirmBtn");
  if (!popup || !titleEl || !messageEl || !confirmBtn) return;

  systemPopupBusy = false;
  systemPopupAction = confirmAction;
  titleEl.textContent = title;
  messageEl.textContent = message;
  confirmBtn.disabled = false;
  confirmBtn.textContent = options.confirmLabel || "Confirm";
  popup.classList.add("active");
}

window.closeSystemPopup = function() {
  const popup = document.getElementById("systemPopup");
  const confirmBtn = document.getElementById("systemPopupConfirmBtn");
  const cancelBtn = document.getElementById("systemPopupCancelBtn");
  systemPopupAction = null;
  systemPopupBusy = false;
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = "Confirm";
  }
  if (cancelBtn) {
    cancelBtn.disabled = false;
  }
  if (popup) popup.classList.remove("active");
};

window.closeMissedTopicModal = function() {
  document.getElementById("missedTopicModal")?.classList.remove("active");
};

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (document.getElementById("missedTopicModal")?.classList.contains("active")) {
    closeMissedTopicModal();
  }
});

function initializeSystemPopup() {
  const popup = document.getElementById("systemPopup");
  const popupBox = popup?.querySelector(".popup-box");
  const confirmBtn = document.getElementById("systemPopupConfirmBtn");
  const cancelBtn = document.getElementById("systemPopupCancelBtn");

  popup?.addEventListener("click", (event) => {
    if (event.target === popup && !systemPopupBusy) {
      closeSystemPopup();
    }
  });

  popupBox?.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  confirmBtn?.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (systemPopupBusy || typeof systemPopupAction !== "function") return;

    systemPopupBusy = true;
    confirmBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;
    confirmBtn.textContent = "Removing...";

    try {
      await systemPopupAction();
    } catch (error) {
      console.error("System popup action failed:", error);
      setStatus(`Unable to complete the action: ${formatFirebaseError(error)}`);
      systemPopupBusy = false;
      confirmBtn.disabled = false;
      if (cancelBtn) cancelBtn.disabled = false;
      confirmBtn.textContent = "Confirm";
    }
  });
}

window.logout = async function() {
  closeMobileSidebar();
  stopContactInboxSubscription();
  await signOutWithSessionCleanup(auth);
  window.location.href = "auth.html";
};

window.resetMySuperAdminMfa = function() {
  if (!currentUser) return;
  openSystemPopup(
    "Reset Super Admin 2FA",
    "This will clear your current app-level authenticator setup and open enrollment so you can connect a fresh authenticator.",
    async () => {
      const resetBtn = document.getElementById("superAdminMfaResetBtn");
      if (resetBtn) resetBtn.disabled = true;
      try {
        await resetOwnAppMfa(currentRole, "super-admin-mfa.html");
      } catch (error) {
        console.error("Unable to reset super-admin MFA.", error);
        setMfaStatus("Unable to reset 2FA right now. Check your connection and try again.");
        if (resetBtn) resetBtn.disabled = false;
        closeSystemPopup();
      }
    },
    {
      confirmLabel: "Reset My 2FA"
    }
  );
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
initializeSystemPopup();

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
