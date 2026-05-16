import { app } from "./firebase-config.js";
import {
  getAuth,
  multiFactor,
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
import { applyRoleNavigation, getRoleFromUserData, resolveUserRole, syncUserRole } from "./role-utils.js";
import { clearSuperAdminMfaSession } from "./super-admin-mfa-session.js";
import { enforcePrivilegedMfa, getFirebaseSecondFactorProvider, signedInWithSecondFactor } from "./firebase-native-mfa.js";
import { syncNativeMfaProfile } from "./native-mfa-profile.js";
import { writeSecurityAudit } from "./security-audit.js";
import { describeAutomaticMfaResetError, resetOwnMfaEnrollment } from "./privileged-mfa-reset.js";
import {
  fetchModuleDrafts,
  fetchQuizDrafts
} from "./supabase-content.js";
import { SUPER_ADMIN_EMAILS } from "../data/admin-config.js";


const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentRole = "user";
let systemPopupAction = null;
let systemPopupBusy = false;
let contactInboxUnsubscribe = null;
const SUPER_ADMIN_STATUS_DEFAULT = "Manage roles, review the whole system, and control app user records for the prototype.";
const SLOW_SUPER_ADMIN_LOAD_DELAY_MS = 5000;

applyRoleNavigation("guest", "super-admin.html");

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
    await writeSecurityAudit(db, user, "denied_super_admin_route", `Denied super-admin.html route for resolved role: ${role}`);
    window.location.href = "dashboard.html";
    return;
  }

  if (!await enforcePrivilegedMfa({
    auth,
    user,
    setupPath: "super-admin-mfa.html"
  })) {
    return;
  }

  await syncNativeMfaProfile(db, user, role, {
    method: "firebase_totp_super_admin_access"
  });
  await updateUserUI(user);
  await loadSuperAdminDashboard();
  startContactInboxSubscription();
});

async function loadSuperAdminDashboard() {
  const slowLoadTimer = startSlowSuperAdminNotice();
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

  const users = usersSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
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

  renderOverview(users);
  renderAccessGrantList(grants);
  renderSystemHealth(users, grants, pendingUsers, [], [], []);
  renderRetentionOversight(users);
  renderTwoFactorOversight(users, securityProfiles);
  renderSubjectCompletionBreakdown(users);
  renderMostMissedTopics(users);
  renderUserTable(users);
  wireAccessGrantForm();
  wireIntakeForm();
  stopSlowSuperAdminNotice(slowLoadTimer);

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
    const contactMessages = contactMessagesSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }));

    renderContactInboxCounts(contactMessages);
    renderSystemHealth(users, grants, pendingUsers, moduleDrafts, quizDrafts, notes);
    renderPublishingQueue(moduleDrafts, quizDrafts);
    renderManualImportChecklist();
    renderAuditLog(audits);
  });
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
    const nativeEnrolled = Boolean(profile?.firebaseMfaEnrolled || user.firebaseMfaEnrolled);
    const legacyEnrolled = Boolean(profile?.totpEnabled && profile?.totpSecret);
    const enrolled = nativeEnrolled || legacyEnrolled;
    const backupCodesRemaining = legacyEnrolled && Array.isArray(profile?.backupCodeHashes)
      ? profile.backupCodeHashes.length
      : null;
    const lastVerifiedMs = toTimestampMs(profile?.lastVerifiedAt || user.firebaseMfaSyncedAt);
    const enrolledMs = toTimestampMs(profile?.enrolledAt);
    const providerLabel = nativeEnrolled
      ? `Firebase Auth ${profile?.firebaseMfaProvider || user.firebaseMfaProvider || "TOTP"}`
      : "Legacy app 2FA";

    return {
      id: user.id,
      name: user.name || user.email || "Privileged User",
      email: user.email || "No email",
      role,
      enrolled,
      nativeEnrolled,
      legacyEnrolled,
      providerLabel,
      backupCodesRemaining,
      backupCodeUseCount: Math.max(0, Number(profile?.backupCodeUseCount || 0)),
      lastVerificationMethod: String(profile?.lastVerificationMethod || (user.firebaseMfaEnrolled ? "firebase_totp_admin_sync" : "")),
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
    lowBackupCount: rows.filter((row) => row.legacyEnrolled && row.backupCodesRemaining <= 2).length,
    backupUseCount: rows.reduce((sum, row) => sum + row.backupCodeUseCount, 0),
    rows
  };
}

async function addCurrentSessionMfaProfile(profiles) {
  if (!currentUser || !["admin", "super_admin"].includes(currentRole)) return profiles;
  const secondFactorProvider = await getFirebaseSecondFactorProvider(currentUser);
  if (!secondFactorProvider && !await signedInWithSecondFactor(currentUser)) return profiles;

  const currentEmail = normalizeEmail(currentUser.email);
  const existingIndex = profiles.findIndex((profile) => {
    const ids = [profile.id, profile.uid].filter(Boolean).map(String);
    return ids.includes(currentUser.uid) || normalizeEmail(profile.email) === currentEmail;
  });

  const sessionProfile = {
    id: currentUser.uid,
    uid: currentUser.uid,
    email: currentUser.email || "",
    role: currentRole,
    firebaseMfaEnrolled: true,
    firebaseMfaProvider: secondFactorProvider || "TOTP",
    firebaseMfaSource: "firebase_auth",
    lastVerifiedAt: Date.now(),
    lastVerificationMethod: "firebase_totp_current_session",
    updatedAt: Date.now()
  };

  if (existingIndex >= 0) {
    return profiles.map((profile, index) => (
      index === existingIndex
        ? { ...profile, ...sessionProfile }
        : profile
    ));
  }

  return [...profiles, sessionProfile];
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
      ? `${summary.enrolledCount} privileged account(s) have Firebase Auth 2FA recorded.`
      : "No privileged accounts are enrolled yet."
  );
  setText("superMfaPendingCount", summary.pendingCount);
  setText(
    "superMfaPendingCountDetail",
    summary.pendingCount
      ? `${summary.pendingCount} privileged account(s) still need a recorded Firebase 2FA verification.`
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
      ? `${summary.lowBackupCount} legacy 2FA account(s) should re-enroll soon because only 2 or fewer backup codes remain.`
      : "Native Firebase 2FA accounts do not use app backup-code reserves."
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
    .filter((row) => row.legacyEnrolled)
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
    "No legacy backup-code risk is being tracked for native Firebase 2FA accounts."
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

  document.getElementById("missedTopicModal")?.classList.add("active");
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

function setMfaStatus(message) {
  const el = document.getElementById("superAdminMfaStatus");
  if (el) el.textContent = message;
}

async function markOwnMfaProfileReset(role) {
  if (!currentUser) return;
  await setDoc(doc(db, "securityProfiles", currentUser.uid), {
    uid: currentUser.uid,
    email: currentUser.email || "",
    role,
    firebaseMfaEnrolled: false,
    firebaseMfaProvider: "",
    firebaseMfaSource: "firebase_auth",
    lastVerificationMethod: "firebase_totp_reset",
    updatedAt: serverTimestamp()
  }, { merge: true });
}

async function resetOwnFirebaseMfa(role, setupPath) {
  if (!currentUser) return;
  const factorUser = multiFactor(currentUser);
  const enrolledFactors = factorUser.enrolledFactors || [];

  clearSuperAdminMfaSession();
  if (!enrolledFactors.length) {
    await markOwnMfaProfileReset(role);
    setMfaStatus("No Firebase 2FA factor was found. Opening setup so you can enroll again.");
    window.location.href = setupPath;
    return;
  }

  setMfaStatus("Resetting your Firebase 2FA. Please wait...");
  await resetOwnMfaEnrollment();
  await currentUser.reload();
  await markOwnMfaProfileReset(role);
  await writeSecurityAudit(
    db,
    currentUser,
    "reset_own_super_admin_mfa",
    "Super admin reset their own Firebase Auth multi-factor enrollment."
  );

  setMfaStatus("2FA reset. Signing out so you can enroll a fresh authenticator.");
  await signOut(auth);
  window.location.href = "auth.html";
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
      setGrantStatus("Unable to complete the action. Please try again.");
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
  clearSuperAdminMfaSession();
  if (auth.currentUser) {
    await signOut(auth);
  }
  window.location.href = "auth.html";
};

window.resetMySuperAdminMfa = function() {
  if (!currentUser) return;
  const enrolledCount = multiFactor(currentUser).enrolledFactors?.length || 0;
  openSystemPopup(
    "Reset Super Admin 2FA",
    enrolledCount
      ? "This will remove your current authenticator enrollment, clear this privileged session, and sign you out. After signing in again, you can set up a new authenticator."
      : "No Firebase 2FA factor is recorded on this session. This will clear your privileged session and open the setup page.",
    async () => {
      const resetBtn = document.getElementById("superAdminMfaResetBtn");
      if (resetBtn) resetBtn.disabled = true;
      try {
        await resetOwnFirebaseMfa(currentRole, "super-admin-mfa.html");
      } catch (error) {
        console.error("Unable to reset super-admin MFA.", error);
        setMfaStatus(describeAutomaticMfaResetError(error));
        if (resetBtn) resetBtn.disabled = false;
        closeSystemPopup();
      }
    },
    {
      confirmLabel: enrolledCount ? "Reset My 2FA" : "Open Setup"
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
