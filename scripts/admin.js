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
  addDoc,
  doc,
  setDoc,
  query,
  where,
  onSnapshot,
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
import { clearSuperAdminMfaSession } from "./super-admin-mfa-session.js";
import { clearAdminMfaSession } from "./admin-mfa-session.js";
import { enforcePrivilegedMfa } from "./firebase-native-mfa.js";
import { syncNativeMfaProfile } from "./native-mfa-profile.js";
import { writeSecurityAudit } from "./security-audit.js";
import { describeAutomaticMfaResetError, resetOwnMfaEnrollment } from "./privileged-mfa-reset.js";


const auth = getAuth(app);
const db = getFirestore(app);
const QUIZ_LEVELS_PER_DIFFICULTY = 25;
const QUIZ_LEVEL_XP_PER_CORRECT = 2;
const DEMO_ANALYTICS_MODE = new URLSearchParams(window.location.search).get("analytics") === "preview";
const DEMO_ANALYTICS_SUBJECTS = ["hardware", "electrical"];
const DEMO_ANALYTICS_DIFFICULTIES = ["easy", "medium", "hard"];
const DEMO_ANALYTICS_QUIZ_LEVELS = 25;
const DEMO_ANALYTICS_QUIZ_TOTAL = 3;
const DEMO_ANALYTICS_MODULES_PER_DIFFICULTY = 3;

let currentUser = null;
let currentRole = "user";
let learnersCache = [];
let contactInboxUnsubscribe = null;

applyRoleNavigation("guest", "admin.html");

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
  currentRole = await resolveUserRole(db, user);
  await syncUserRole(db, user, currentRole);
  applyRoleNavigation(currentRole, "admin.html");

  if (!roleMeetsMinimum(currentRole, "admin")) {
    await writeSecurityAudit(db, user, "denied_admin_route", `Denied admin.html route for resolved role: ${currentRole}`);
    window.location.href = "dashboard.html";
    return;
  }

  if (!await enforcePrivilegedMfa({
    auth,
    user,
    setupPath: currentRole === "super_admin" ? "super-admin-mfa.html" : "admin-mfa.html"
  })) {
    return;
  }

  await syncNativeMfaProfile(db, user, currentRole, {
    method: "firebase_totp_admin_access"
  });
  await updateUserUI(user);
  setAdminMfaPanelVisibility(currentRole);
  await loadAdminDashboard();
  startContactInboxSubscription();
});

async function loadAdminDashboard() {
  const [usersSnap, moduleDrafts, quizDrafts, contactMessages] = await Promise.all([
    getDocs(collection(db, "users")),
    safeSupabaseRead("module drafts", fetchModuleDrafts),
    safeSupabaseRead("quiz drafts", fetchQuizDrafts),
    fetchAccessibleContactMessages()
  ]);

  const users = applyDemoAnalyticsOverlay(
    usersSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }))
  );

  learnersCache = users.filter((user) => getRoleFromUserData(user) === "user");

  renderAnalyticsPreviewNavCue();
  renderDemoAnalyticsNotice();
  renderContactInboxCounts(contactMessages);
  renderOverview(learnersCache);
  renderLearningInsights(learnersCache);
  renderBottlenecks(learnersCache);
  renderDifficultyAnalytics(learnersCache);
  renderSubjectCompletionBreakdown(learnersCache);
  renderStudentTable(learnersCache);
  wireLearnerScoreExport();
  renderDraftReviews(moduleDrafts, quizDrafts);
  wireBuilderForms();
}

function renderDemoAnalyticsNotice() {
  document.body.classList.toggle("demo-analytics-mode", DEMO_ANALYTICS_MODE);

  if (!DEMO_ANALYTICS_MODE) return;

  const main = document.querySelector(".main");
  if (!main || document.getElementById("adminDemoAnalyticsNotice")) return;

  const notice = document.createElement("div");
  notice.id = "adminDemoAnalyticsNotice";
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
  adminPreviewLink.className = DEMO_ANALYTICS_MODE ? "active-link" : "";
  menu.appendChild(adminPreviewLink);

  const superPreviewLink = document.createElement("a");
  superPreviewLink.id = "superPreviewNavLink";
  superPreviewLink.href = "super-admin.html?analytics=preview";
  superPreviewLink.textContent = "👑 SUPER ADMIN";
  superPreviewLink.hidden = currentRole !== "super_admin";
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
    });

    return nextUser;
  });
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

async function fetchAccessibleContactMessages() {
  if (!currentUser) return [];

  const sources = [
    query(collection(db, "contactMessages"), where("assignedAdminUid", "==", "")),
    query(collection(db, "contactMessages"), where("assignedAdminUid", "==", currentUser.uid)),
    query(collection(db, "contactMessages"), where("createdByUid", "==", currentUser.uid))
  ];

  const snapshots = await Promise.all(sources.map((source) => getDocs(source)));
  const messageMap = new Map();

  snapshots.forEach((snapshot) => {
    snapshot.docs.forEach((entry) => {
      messageMap.set(entry.id, { id: entry.id, ...entry.data() });
    });
  });

  return Array.from(messageMap.values());
}

function renderContactInboxCounts(messages) {
  const openCount = messages.filter((message) => (message.status || "open") !== "resolved").length;
  updateInboxBadge("adminContactInboxBadge", openCount);
  updateInboxPanelBadge("adminInboxPanelBadge", openCount);
}

function stopContactInboxSubscription() {
  if (typeof contactInboxUnsubscribe === "function") {
    contactInboxUnsubscribe();
  }
  contactInboxUnsubscribe = null;
}

function startContactInboxSubscription() {
  stopContactInboxSubscription();
  if (!currentUser) return;

  const sources = [
    query(collection(db, "contactMessages"), where("assignedAdminUid", "==", "")),
    query(collection(db, "contactMessages"), where("assignedAdminUid", "==", currentUser.uid)),
    query(collection(db, "contactMessages"), where("createdByUid", "==", currentUser.uid))
  ];

  const sourceCaches = sources.map(() => new Map());
  const rebuildCounts = () => {
    const merged = new Map();
    sourceCaches.forEach((cache) => {
      cache.forEach((value, key) => merged.set(key, value));
    });
    renderContactInboxCounts(Array.from(merged.values()));
  };

  const unsubscribers = sources.map((source, index) => onSnapshot(
    source,
    (snapshot) => {
      const nextCache = new Map();
      snapshot.docs.forEach((snap) => {
        nextCache.set(snap.id, { id: snap.id, ...snap.data() });
      });
      sourceCaches[index] = nextCache;
      rebuildCounts();
    },
    (error) => {
      console.error("Unable to subscribe to admin contact inbox counts:", error);
    }
  ));

  contactInboxUnsubscribe = () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
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
  const pretestAverage = summarizeAssessmentAverage(learners, "pretest");
  const quizAverage = summarizeQuizTrackAverage(learners);
  const posttestAverage = summarizeAssessmentAverage(learners, "posttest");
  const hardwareCompletion = summarizeSubjectCompletion(learners, "hardware");
  const electricalCompletion = summarizeSubjectCompletion(learners, "electrical");
  const retentionSummary = summarizeRetentionInsights(learners);

  setText("adminTotalLearners", learners.length);
  setText("adminNeedsHelp", needsHelp);
  setText("adminAverageXp", `${averageXp} XP`);
  setText("adminModulesCleared", `${modulesCleared} clears`);
  setText("adminAveragePretest", `${pretestAverage.percent}%`);
  setText("adminAveragePretestDetail", `${pretestAverage.count} recorded tests`);
  setText("adminAverageQuizTrack", `${quizAverage.percent}%`);
  setText("adminAverageQuizTrackDetail", `${quizAverage.count} recorded quiz levels`);
  setText("adminAveragePosttest", `${posttestAverage.percent}%`);
  setText("adminAveragePosttestDetail", `${posttestAverage.count} recorded tests`);
  setText("adminHardwareCompletion", `${hardwareCompletion.percent}%`);
  setText("adminHardwareCompletionDetail", `${hardwareCompletion.completed} of ${hardwareCompletion.total} learners`);
  setText("adminElectricalCompletion", `${electricalCompletion.percent}%`);
  setText("adminElectricalCompletionDetail", `${electricalCompletion.completed} of ${electricalCompletion.total} learners`);
  setText("adminDueRetentionCards", retentionSummary.dueCards);
  setText(
    "adminDueRetentionCardsDetail",
    retentionSummary.dueCards
      ? `${retentionSummary.dueCards} flashcard review item(s) are already due.`
      : "No due flashcards right now"
  );
  setText("adminLearnersWithDueRetention", retentionSummary.learnersWithDue);
  setText(
    "adminLearnersWithDueRetentionDetail",
    `${retentionSummary.learnersWithDue} learner(s) need memory review`
  );
  renderLastUpdated("adminLastUpdated", "adminLastUpdatedDetail");
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

    summary.totalCards += items.length;
    summary.dueCards += dueCount;
    summary.lowConfidenceCards += items.reduce((sum, item) => sum + Math.max(0, Number(item?.lowConfidenceCount || 0)), 0);
    summary.recoveries += items.reduce((sum, item) => sum + Math.max(0, Number(item?.completedCycles || 0)), 0);

    if (dueCount > 0) {
      summary.learnersWithDue += 1;
    }

    return summary;
  }, {
    totalCards: 0,
    dueCards: 0,
    lowConfidenceCards: 0,
    recoveries: 0,
    learnersWithDue: 0
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

function renderLearningInsights(learners) {
  const reviewBacklog = learners.reduce((sum, learner) => sum + (Array.isArray(learner.wrongAnswerReview) ? learner.wrongAnswerReview.length : 0), 0);
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const retentionSummary = summarizeRetentionInsights(learners);
  const activeThisWeek = learners.filter((learner) =>
    Array.isArray(learner.studyHistory) && learner.studyHistory.some((item) => new Date(item?.timestamp || 0).getTime() >= sevenDaysAgo)
  );

  setText("adminReviewBacklog", reviewBacklog);
  setText(
    "adminReviewBacklogDetail",
    reviewBacklog
      ? `${reviewBacklog} wrong-answer items are currently waiting across learner review lists.`
      : "No learners are waiting on wrong-answer review."
  );
  setText("adminActiveThisWeek", activeThisWeek.length);
  setText(
    "adminActiveThisWeekDetail",
    activeThisWeek.length
      ? `${activeThisWeek.length} learner(s) opened at least one module, quiz, or test in the last 7 days.`
      : "No recent study activity recorded yet."
  );
  setText("adminLowConfidenceRetention", retentionSummary.lowConfidenceCards);
  setText(
    "adminLowConfidenceRetentionDetail",
    retentionSummary.lowConfidenceCards
      ? `${retentionSummary.lowConfidenceCards} low-confidence memory card(s) are still being tracked in learner queues.`
      : "No low-confidence cards recorded yet."
  );
  setText("adminRetentionRecoveries", retentionSummary.recoveries);
  setText(
    "adminRetentionRecoveriesDetail",
    retentionSummary.recoveries
      ? `${retentionSummary.recoveries} successful recovery cycle(s) have already been recorded across learner flashcards.`
      : "No flashcard recoveries recorded yet."
  );

  renderInsightList(
    "adminMostActiveLearners",
    [...learners]
      .map((learner) => ({
        title: learner.name || learner.email || "Learner",
        metric: Array.isArray(learner.studyHistory) ? learner.studyHistory.length : 0,
        detail: learner.email || "No email"
      }))
      .filter((item) => item.metric > 0)
      .sort((a, b) => b.metric - a.metric)
      .slice(0, 5),
    "No study history activity has been recorded yet."
  );

  renderInsightList(
    "adminReviewQueues",
    [...learners]
      .map((learner) => ({
        title: learner.name || learner.email || "Learner",
        metric: Array.isArray(learner.wrongAnswerReview) ? learner.wrongAnswerReview.length : 0,
        detail: learner.email || "No email"
      }))
      .filter((item) => item.metric > 0)
      .sort((a, b) => b.metric - a.metric)
      .slice(0, 5),
    "No learner currently has a review queue."
  );
  renderInsightList(
    "adminRetentionLoads",
    summarizeHighestRetentionLoads(learners, 5),
    "No due flashcards are waiting right now."
  );
  renderInsightList(
    "adminLowestRetentionRecovery",
    summarizeLowestRetentionRecovery(learners, 5),
    "No learner has entered the retention queue yet."
  );

  renderMissedTopicList("adminMostMissedTopics", summarizeMostMissedTopics(learners, 5));
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

function renderMissedTopicList(targetId, items) {
  const target = document.getElementById(targetId);
  if (!target) return;

  if (!items.length) {
    target.innerHTML = `<div class="review-item"><p>No missed-topic data is available yet.</p></div>`;
    return;
  }

  target.innerHTML = items.map((item, index) => `
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

  const topicButtons = target.querySelectorAll("[data-topic-detail]");
  topicButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const detailIndex = Number(button.dataset.topicDetail || -1);
      if (detailIndex < 0 || detailIndex >= items.length) return;
      openMissedTopicModal(items[detailIndex]);
    });
  });
}

function renderSubjectCompletionBreakdown(learners) {
  const grid = document.getElementById("adminCompletionBreakdown");
  if (!grid) return;

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
  document.querySelector("#missedTopicModal .admin-modal-box")?.focus({ preventScroll: true });
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
    body.innerHTML = `<tr><td data-label="Learners" colspan="8">No learner records yet.</td></tr>`;
    return;
  }

  learners.forEach((learner) => {
    const progress = learner.progress || {};
    const electricalStage = describeSubjectStage(progress, "electrical");
    const hardwareStage = describeSubjectStage(progress, "hardware");
    const needsReview = learnerNeedsHelp(progress);

    const row = document.createElement("tr");
    row.innerHTML = `
      <td data-label="Name">${escapeHtml(learner.name || "User")}</td>
      <td data-label="Email">${escapeHtml(learner.email || "No email")}</td>
      <td data-label="Role"><span class="status-pill">${escapeHtml(learner.role || "user")}</span></td>
      <td data-label="XP">${learner.xp || 0}</td>
      <td data-label="Electrical">${electricalStage}</td>
      <td data-label="Hardware">${hardwareStage}</td>
      <td data-label="Status"><span class="status-pill ${needsReview ? "warning" : ""}">${needsReview ? "Needs attention" : "On track"}</span></td>
      <td data-label="Actions"><button class="secondary-action" data-open-profile="${learner.id}">Open</button></td>
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

function wireLearnerScoreExport() {
  const button = document.getElementById("adminExportScoresBtn");
  if (!button || button.dataset.bound === "true") return;

  button.dataset.bound = "true";
  button.addEventListener("click", () => {
    exportLearnerScoresCsv(learnersCache, DEMO_ANALYTICS_MODE ? "analytics-preview" : "live");
  });
}

function exportLearnerScoresCsv(learners, mode) {
  const headers = [
    "Mode",
    "Name",
    "Email",
    "XP",
    "Completed Modules",
    "Electrical Pre-Test",
    "Electrical Quiz Track",
    "Electrical Post-Test",
    "Electrical Completion",
    "Hardware Pre-Test",
    "Hardware Quiz Track",
    "Hardware Post-Test",
    "Hardware Completion"
  ];

  const rows = learners.map((learner) => {
    const electrical = summarizeLearnerSubjectForExport(learner, "electrical");
    const hardware = summarizeLearnerSubjectForExport(learner, "hardware");

    return [
      mode,
      learner.name || "User",
      learner.email || "",
      learner.xp || 0,
      countCompletedModules(learner.progress || {}),
      electrical.pretest,
      electrical.quiz,
      electrical.posttest,
      electrical.completion,
      hardware.pretest,
      hardware.quiz,
      hardware.posttest,
      hardware.completion
    ];
  });

  downloadCsv(`code-recall-learner-scores-${mode}.csv`, [headers, ...rows]);
}

function summarizeLearnerSubjectForExport(learner, subject) {
  const results = learner.results || {};
  const progress = learner.progress || {};

  return {
    pretest: formatExportResult(results[`${subject}_pretest`]),
    quiz: formatExportQuizTrack(results, subject),
    posttest: formatExportResult(results[`${subject}_posttest`]),
    completion: progress[`${subject}_posttest`] === true || results[`${subject}_posttest`] ? "Complete" : describeSubjectStage(progress, subject)
  };
}

function formatExportResult(result) {
  if (!result) return "No live record yet";

  const score = readResultNumber(result, ["score", "correct", "correctAnswers", "points"]);
  const total = readResultNumber(result, ["total", "items", "questionCount", "totalQuestions", "maxScore"]);
  const percent = Number(result.percent);

  if (Number.isFinite(score) && Number.isFinite(total)) return `${score}/${total}`;
  if (Number.isFinite(percent)) return `${Math.round(percent)}%`;
  if (Number.isFinite(score)) return `${score}`;
  return "Recorded";
}

function formatExportQuizTrack(results, subject) {
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

  if (!summary.count) return "No live record yet";
  return `${summary.score}/${summary.max || "?"} across ${summary.count} level${summary.count === 1 ? "" : "s"}`;
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

function escapeCsvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
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
  const weakTopics = summarizeLearnerWeakTopics(learner);
  const studyHistory = summarizeLearnerStudyHistory(learner);
  const assessmentBars = buildLearnerAssessmentBars(learner);
  const assessmentSummary = buildLearnerAssessmentSummary(learner);
  const retentionSnapshot = summarizeLearnerRetentionSnapshot(learner);
  const dueRetentionItems = summarizeLearnerDueRetentionItems(learner);

  if (body) {
    body.innerHTML = `
      <div class="profile-stats">
        <div class="profile-stat-card"><span>Total XP</span><strong>${learner.xp || 0}</strong></div>
        <div class="profile-stat-card"><span>Completed Modules</span><strong>${countCompletedModules(progress)}</strong></div>
        <div class="profile-stat-card"><span>Electrical Stage</span><strong>${describeSubjectStage(progress, "electrical")}</strong></div>
        <div class="profile-stat-card"><span>Hardware Stage</span><strong>${describeSubjectStage(progress, "hardware")}</strong></div>
      </div>
      <section class="profile-section">
        <h4>Assessment Summary</h4>
        <div class="profile-assessment-summary">
          ${assessmentSummary}
        </div>
      </section>
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
      <section class="profile-section">
        <h4>Assessment Performance</h4>
        <div class="learner-assessment-grid">
          ${buildLearnerAssessmentBarMarkup(assessmentBars)}
        </div>
      </section>
      <div class="profile-columns">
        <section class="profile-section">
          <h4>Weak Topics</h4>
          <div class="review-list">
            ${buildWeakTopicRows(weakTopics)}
          </div>
        </section>
        <section class="profile-section">
          <h4>Recent Activity History</h4>
          <div class="review-list">
            ${buildStudyHistoryRows(studyHistory)}
          </div>
        </section>
      </div>
      <div class="profile-columns">
        <section class="profile-section">
          <h4>Retention Snapshot</h4>
          <div class="profile-list">
            ${buildLearnerRetentionSnapshotRows(retentionSnapshot)}
          </div>
        </section>
        <section class="profile-section">
          <h4>Due Memory Queue</h4>
          <div class="review-list">
            ${buildLearnerDueRetentionRows(dueRetentionItems)}
          </div>
        </section>
      </div>
    `;
  }

  const hiddenField = document.getElementById("feedbackStudentId");
  if (hiddenField) hiddenField.value = learner.id;

  await loadFeedbackNotes(learner.id);
  openStudentProfileModal();
}

function syncStudentProfileModalPosition() {
  const modal = document.getElementById("studentProfileModal");
  const modalBox = modal?.querySelector(".admin-modal-box");
  if (modalBox) modalBox.scrollTop = 0;
}

function openStudentProfileModal() {
  const modal = document.getElementById("studentProfileModal");
  if (!modal) return;

  modal.classList.add("active");
  document.body.classList.add("student-profile-open");
  const modalBox = modal.querySelector(".admin-modal-box");
  if (modalBox) {
    modalBox.scrollTop = 0;
    modalBox.focus({ preventScroll: true });
  }
  syncStudentProfileModalPosition();
}

function stopStudentProfileModalFollow() {
  const modal = document.getElementById("studentProfileModal");
  const modalBox = modal?.querySelector(".admin-modal-box");
  if (modalBox) modalBox.scrollTop = 0;
}

function buildProgressRows(progress) {
  const rows = summarizeProgressFlags(progress)
    .map((item) => `<div class="profile-row"><span>${escapeHtml(item.label)}</span><span>${escapeHtml(item.value)}</span></div>`);

  return rows.length ? rows.join("") : `<div class="profile-row"><span>No progress flags recorded yet.</span><span>-</span></div>`;
}

function buildResultRows(results) {
  const rows = summarizeAssessmentResults(results)
    .map((item) => `<div class="profile-row"><span>${escapeHtml(item.label)}</span><span>${escapeHtml(item.value)}</span></div>`);

  return rows.length ? rows.join("") : `<div class="profile-row"><span>No assessment results recorded yet.</span><span>-</span></div>`;
}

function summarizeProgressFlags(progress = {}) {
  const completedEntries = Object.entries(progress || {}).filter(([, value]) => value === true);
  const usedKeys = new Set();
  const directRows = [];
  const groupedRows = new Map();

  const addGroupedProgress = (key, groupKey, label, unit) => {
    usedKeys.add(key);
    const current = groupedRows.get(groupKey) || { label, unit, count: 0 };
    current.count += 1;
    groupedRows.set(groupKey, current);
  };

  completedEntries.forEach(([key]) => {
    let match = String(key).match(/^(hardware|electrical)_(pretest|modules|quiz|posttest)$/);
    if (match) {
      usedKeys.add(key);
      directRows.push({
        label: `${getSubjectLabel(match[1])} ${getStageLabel(match[2])}`,
        value: "Complete"
      });
      return;
    }

    match = String(key).match(/^(hardware|electrical)_(easy|medium|hard)_module_(\d+)_(done|done_read_bottom|done_quick_check_attempted|matching_activity_done|drag_drop_activity_done)$/);
    if (match) {
      const [, subject, difficulty, , kind] = match;
      const label = `${getSubjectLabel(subject)} ${getDifficultyLabel(difficulty)} Modules`;
      const unitByKind = {
        done: "modules completed",
        done_read_bottom: "modules fully read",
        done_quick_check_attempted: "quick checks attempted",
        matching_activity_done: "matching activities completed",
        drag_drop_activity_done: "drag-and-drop activities completed"
      };
      addGroupedProgress(key, `${subject}_${difficulty}_module_${kind}`, label, unitByKind[kind] || "items completed");
      return;
    }

    match = String(key).match(/^(hardware|electrical)_(easy|medium|hard)_quiz_level_(\d+)_done$/);
    if (match) {
      const [, subject, difficulty] = match;
      addGroupedProgress(
        key,
        `${subject}_${difficulty}_quiz_done`,
        `${getSubjectLabel(subject)} ${getDifficultyLabel(difficulty)} Quiz`,
        "levels completed"
      );
      return;
    }

    match = String(key).match(/^(hardware|electrical)_quiz_level_(\d+)_done$/);
    if (match) {
      const [, subject] = match;
      addGroupedProgress(key, `${subject}_quiz_done`, `${getSubjectLabel(subject)} Quiz`, "levels completed");
    }
  });

  const grouped = Array.from(groupedRows.values()).map((item) => ({
    label: item.label,
    value: `${item.count} ${item.unit}`
  }));
  const remainingRows = completedEntries
    .filter(([key]) => !usedKeys.has(key))
    .slice(0, 8)
    .map(([key]) => ({ label: formatProfileKey(key), value: "Done" }));
  const hiddenCount = Math.max(0, completedEntries.length - usedKeys.size - remainingRows.length);

  if (hiddenCount > 0) {
    remainingRows.push({ label: "Other Progress Flags", value: `${hiddenCount} more recorded` });
  }

  return [...directRows, ...grouped, ...remainingRows].slice(0, 20);
}

function summarizeAssessmentResults(results = {}) {
  const entries = Object.entries(results || {});
  const usedKeys = new Set();
  const rows = [];
  const quizGroups = new Map();

  ["hardware", "electrical"].forEach((subject) => {
    ["pretest", "posttest"].forEach((stage) => {
      const key = `${subject}_${stage}`;
      if (results?.[key] === undefined) return;
      usedKeys.add(key);
      rows.push({
        label: `${getSubjectLabel(subject)} ${getStageLabel(stage)}`,
        value: formatLearnerResultValue(results[key])
      });
    });
  });

  entries.forEach(([key, value]) => {
    const match = String(key).match(/^(hardware|electrical)_(easy|medium|hard)_quiz_level_(\d+)_result$/);
    if (!match) return;

    const [, subject, difficulty] = match;
    const groupKey = `${subject}_${difficulty}_quiz`;
    const group = quizGroups.get(groupKey) || {
      label: `${getSubjectLabel(subject)} ${getDifficultyLabel(difficulty)} Quiz Track`,
      count: 0,
      score: 0,
      total: 0,
      xp: 0
    };
    const score = readResultNumber(value, ["score", "correct", "correctAnswers", "points"]);
    const total = readResultNumber(value, ["total", "items", "questionCount", "totalQuestions", "maxScore"]);
    const xp = readResultNumber(value, ["xpEarned", "xp", "xpAwarded", "earnedXp"]);

    usedKeys.add(key);
    group.count += 1;
    if (Number.isFinite(score)) group.score += score;
    if (Number.isFinite(total)) group.total += total;
    if (Number.isFinite(xp)) group.xp += xp;
    quizGroups.set(groupKey, group);
  });

  Array.from(quizGroups.values()).forEach((group) => {
    const parts = [`${group.count} level${group.count === 1 ? "" : "s"}`];
    if (group.total > 0) parts.push(`${group.score}/${group.total} pts`);
    if (group.xp > 0) parts.push(`${group.xp} XP`);
    rows.push({ label: group.label, value: parts.join(" | ") });
  });

  const remainingRows = entries
    .filter(([key]) => !usedKeys.has(key))
    .slice(0, 8)
    .map(([key, value]) => ({
      label: formatProfileKey(key),
      value: formatLearnerResultValue(value)
    }));
  const hiddenCount = Math.max(0, entries.length - usedKeys.size - remainingRows.length);

  if (hiddenCount > 0) {
    remainingRows.push({ label: "Other Assessment Records", value: `${hiddenCount} more recorded` });
  }

  return [...rows, ...remainingRows].slice(0, 16);
}

function formatProfileKey(key = "") {
  const text = String(key)
    .replace(/_/g, " ")
    .replace(/\bhardware\b/gi, "Computer Hardware")
    .replace(/\belectrical\b/gi, "Electrical")
    .replace(/\bpretest\b/gi, "Pre-Test")
    .replace(/\bposttest\b/gi, "Post-Test")
    .replace(/\bquiz\b/gi, "Quiz")
    .replace(/\bmodule\b/gi, "Module")
    .replace(/\blevel\b/gi, "Level")
    .replace(/\bdone read bottom\b/gi, "Fully Read")
    .replace(/\bdone quick check attempted\b/gi, "Quick Check Attempted")
    .replace(/\bmatching activity done\b/gi, "Matching Activity Complete")
    .replace(/\bdrag drop activity done\b/gi, "Drag-and-Drop Activity Complete")
    .replace(/\bdone\b/gi, "Complete")
    .replace(/\bresult\b/gi, "Result")
    .replace(/\bxp\b/gi, "XP")
    .replace(/\s+/g, " ")
    .trim();

  return text.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getSubjectLabel(subject = "") {
  if (subject === "hardware") return "Computer Hardware";
  if (subject === "electrical") return "Electrical";
  return formatProfileKey(subject);
}

function getDifficultyLabel(difficulty = "") {
  if (difficulty === "easy") return "Easy";
  if (difficulty === "medium") return "Medium";
  if (difficulty === "hard") return "Hard";
  return formatProfileKey(difficulty);
}

function getStageLabel(stage = "") {
  if (stage === "pretest") return "Pre-Test";
  if (stage === "posttest") return "Post-Test";
  if (stage === "modules") return "Modules";
  if (stage === "quiz") return "Quiz";
  return formatProfileKey(stage);
}


function formatLearnerResultValue(value) {
  if (typeof value === "number") return `${value}`;
  if (!value || typeof value !== "object") return String(value || "-");

  const score = readResultNumber(value, ["score", "correct", "correctAnswers", "points"]);
  const total = readResultNumber(value, ["total", "items", "questionCount", "totalQuestions", "maxScore"]);
  const xp = readResultNumber(value, ["xpEarned", "xp", "xpAwarded", "earnedXp"]);
  const parts = [];

  if (Number.isFinite(score) && Number.isFinite(total)) {
    parts.push(`${score}/${total} pts`);
  } else if (Number.isFinite(score)) {
    parts.push(`${score} pts`);
  }

  if (Number.isFinite(xp)) {
    parts.push(`${xp} XP`);
  }

  if (value.completedAt || value.submittedAt) {
    parts.push(formatHistoryTimestamp(value.completedAt || value.submittedAt));
  }

  return parts.length ? parts.join(" | ") : "Recorded";
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

function buildLearnerAssessmentBars(learner) {
  return [
    buildLearnerSubjectAssessment(learner, "hardware", "Computer Hardware"),
    buildLearnerSubjectAssessment(learner, "electrical", "Electrical")
  ];
}

function buildLearnerAssessmentSummary(learner) {
  const subjects = buildLearnerAssessmentBars(learner);
  const totals = subjects.reduce((summary, subject) => {
    subject.stages.forEach((stage) => {
      if (stage.label === "Pre-Test") {
        summary.preScore += stage.score;
        summary.preTotal += stage.total;
      } else if (stage.label === "Quiz Track") {
        summary.quizScore += stage.score;
        summary.quizTotal += stage.total;
      } else if (stage.label === "Post-Test") {
        summary.postScore += stage.score;
        summary.postTotal += stage.total;
      }
      summary.xp += stage.xp;
    });
    return summary;
  }, {
    preScore: 0,
    preTotal: 0,
    quizScore: 0,
    quizTotal: 0,
    postScore: 0,
    postTotal: 0,
    xp: 0
  });

  const items = [
    { label: "Pre-Test", value: formatScoreTotal(totals.preScore, totals.preTotal) },
    { label: "Quiz Track", value: formatScoreTotal(totals.quizScore, totals.quizTotal) },
    { label: "Post-Test", value: formatScoreTotal(totals.postScore, totals.postTotal) },
    { label: "Modules", value: `${countCompletedModules(learner.progress || {})} completed` },
    { label: "XP", value: `${learner.xp || totals.xp || 0} XP` }
  ];

  return items.map((item) => `
    <article class="profile-assessment-summary-card">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
    </article>
  `).join("");
}

function formatScoreTotal(score, total) {
  return total ? `${score}/${total}` : "No live record yet";
}

function buildLearnerSubjectAssessment(learner, subject, label) {
  const results = learner.results || {};
  const totalQuizLevels = QUIZ_LEVELS_PER_DIFFICULTY * 3;
  const quizTrackMaxScore = totalQuizLevels * 3;
  const quizTrackMaxXp = quizTrackMaxScore * QUIZ_LEVEL_XP_PER_CORRECT;

  const pretest = normalizeLearnerResult(results[`${subject}_pretest`], 10);
  const posttest = normalizeLearnerResult(results[`${subject}_posttest`], 10);

  const quizTrack = Object.entries(results).reduce((summary, [key, value]) => {
    if (!new RegExp(`^${subject}_(easy|medium|hard)_quiz_level_\\d+_result$`).test(key)) {
      return summary;
    }

    const score = Math.max(0, Number(value?.score || 0));
    const total = Math.max(score, Number(value?.total || 0) || 3);
    summary.score += score;
    summary.total += total;
    return summary;
  }, { score: 0, total: 0 });

  const quizTrackXp = quizTrack.score * QUIZ_LEVEL_XP_PER_CORRECT;

  return {
    label,
    stages: [
      {
        label: "Pre-Test",
        score: pretest.score,
        total: pretest.total,
        xp: pretest.xp,
        scorePercent: getPercent(pretest.score, pretest.total),
        xpPercent: getPercent(pretest.xp, pretest.total)
      },
      {
        label: "Quiz Track",
        score: quizTrack.score,
        total: Math.max(quizTrack.total, quizTrackMaxScore),
        xp: quizTrackXp,
        scorePercent: getPercent(quizTrack.score, quizTrackMaxScore),
        xpPercent: getPercent(quizTrackXp, quizTrackMaxXp)
      },
      {
        label: "Post-Test",
        score: posttest.score,
        total: posttest.total,
        xp: posttest.xp,
        scorePercent: getPercent(posttest.score, posttest.total),
        xpPercent: getPercent(posttest.xp, posttest.total)
      }
    ]
  };
}

function normalizeLearnerResult(result, fallbackTotal = 10) {
  const score = Math.max(0, Number(result?.score || 0));
  const total = Math.max(score, Number(result?.total || 0) || fallbackTotal);
  const xp = Math.max(0, Number(result?.xpEarned || score || 0));
  return { score, total, xp };
}

function getPercent(value, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((Number(value || 0) / Number(total || 1)) * 100)));
}

function buildLearnerAssessmentBarMarkup(subjects) {
  return subjects.map((subject) => `
    <article class="learner-assessment-card">
      <h5>${escapeHtml(subject.label)}</h5>
      <div class="learner-assessment-stack">
        ${subject.stages.map((stage) => `
          <section class="learner-assessment-row">
            <div class="learner-assessment-head">
              <div>
                <strong>${escapeHtml(stage.label)}</strong>
                <span>${stage.score}/${stage.total} pts</span>
              </div>
              <span>${stage.xp} XP</span>
            </div>
            <div class="learner-assessment-track">
              <div class="learner-assessment-fill score" style="width:${stage.scorePercent}%"></div>
            </div>
            <div class="learner-assessment-track xp">
              <div class="learner-assessment-fill xp" style="width:${stage.xpPercent}%"></div>
            </div>
          </section>
        `).join("")}
      </div>
    </article>
  `).join("");
}

function summarizeLearnerWeakTopics(learner) {
  const items = Array.isArray(learner.wrongAnswerReview) ? learner.wrongAnswerReview : [];
  const topicMap = new Map();

  items.forEach((item) => {
    const title = String(item?.title || item?.question || "Unlabeled Topic").trim();
    const subject = String(item?.subject || "general").trim() || "general";
    const key = `${subject}::${title}`;
    const existing = topicMap.get(key) || {
      title,
      subject,
      misses: 0,
      latestQuestion: String(item?.question || "No question text saved.")
    };

    existing.misses += Math.max(1, Number(item?.wrongCount || 1));
    if (item?.question) {
      existing.latestQuestion = String(item.question);
    }
    topicMap.set(key, existing);
  });

  return Array.from(topicMap.values())
    .sort((a, b) => b.misses - a.misses || a.title.localeCompare(b.title))
    .slice(0, 6);
}

function buildWeakTopicRows(items) {
  if (!items.length) {
    return `<div class="review-item"><p>No weak-topic data recorded yet.</p></div>`;
  }

  return items.map((item) => `
    <article class="review-item">
      <h5>${escapeHtml(item.title)}</h5>
      <div class="review-meta">
        <span class="meta-pill">${escapeHtml(item.subject)}</span>
        <span class="meta-pill">${item.misses} miss(es)</span>
      </div>
      <p>${escapeHtml(item.latestQuestion)}</p>
    </article>
  `).join("");
}

function summarizeLearnerRetentionSnapshot(learner) {
  const items = getLearnerRetentionItems(learner);
  const dueItems = items.filter(isDueRetentionItem);
  const lowConfidenceCards = items.reduce((sum, item) => sum + Math.max(0, Number(item?.lowConfidenceCount || 0)), 0);
  const recoveries = items.reduce((sum, item) => sum + Math.max(0, Number(item?.completedCycles || 0)), 0);
  const nextDueItem = [...items]
    .filter((item) => item?.dueAt)
    .sort((a, b) => new Date(a.dueAt || 0).getTime() - new Date(b.dueAt || 0).getTime())[0];

  return {
    totalCards: items.length,
    dueCards: dueItems.length,
    lowConfidenceCards,
    recoveries,
    nextDueLabel: nextDueItem?.dueAt ? formatHistoryTimestamp(nextDueItem.dueAt) : "No upcoming due date"
  };
}

function buildLearnerRetentionSnapshotRows(snapshot) {
  return [
    { label: "Retention cards", value: snapshot.totalCards },
    { label: "Due now", value: snapshot.dueCards },
    { label: "Low-confidence cards", value: snapshot.lowConfidenceCards },
    { label: "Recovery cycles", value: snapshot.recoveries },
    { label: "Next due", value: snapshot.nextDueLabel }
  ].map((item) => `<div class="profile-row"><span>${escapeHtml(item.label)}</span><span>${escapeHtml(String(item.value))}</span></div>`).join("");
}

function summarizeLearnerDueRetentionItems(learner) {
  return getLearnerRetentionItems(learner)
    .filter(isDueRetentionItem)
    .sort((a, b) => new Date(a.dueAt || 0).getTime() - new Date(b.dueAt || 0).getTime())
    .slice(0, 6);
}

function buildLearnerDueRetentionRows(items) {
  if (!items.length) {
    return `<div class="review-item"><p>No flashcards are due for this learner right now.</p></div>`;
  }

  return items.map((item) => `
    <article class="review-item">
      <h5>${escapeHtml(item.title || item.question || "Memory Card")}</h5>
      <div class="review-meta">
        <span class="meta-pill">${escapeHtml(item.subject || "general")}</span>
        <span class="meta-pill">Stage ${Number(item.stageIndex || 0) + 1}</span>
        <span class="meta-pill">${escapeHtml(item.seedReason === "low_confidence_correct" ? "Low confidence" : "Wrong answer")}</span>
      </div>
      <p>${escapeHtml(item.question || "No question text saved.")}</p>
      <p>Due ${escapeHtml(formatHistoryTimestamp(item.dueAt))}</p>
    </article>
  `).join("");
}

function summarizeLearnerStudyHistory(learner) {
  const items = Array.isArray(learner.studyHistory) ? learner.studyHistory : [];
  return [...items]
    .sort((a, b) => new Date(b?.timestamp || 0).getTime() - new Date(a?.timestamp || 0).getTime())
    .slice(0, 8);
}

function buildStudyHistoryRows(items) {
  if (!items.length) {
    return `<div class="review-item"><p>No activity history recorded yet.</p></div>`;
  }

  return items.map((item) => `
    <article class="review-item">
      <h5>${escapeHtml(item?.title || "Learning Activity")}</h5>
      <div class="review-meta">
        <span class="meta-pill">${escapeHtml(item?.subject || "general")}</span>
        <span class="meta-pill">${escapeHtml(item?.difficulty || item?.kind || "activity")}</span>
      </div>
      <p>${escapeHtml(item?.detail || "No activity detail saved.")}</p>
      <p>${escapeHtml(formatHistoryTimestamp(item?.timestamp))}</p>
    </article>
  `).join("");
}

function formatHistoryTimestamp(value) {
  const date = value?.toDate
    ? value.toDate()
    : value?.seconds
      ? new Date(value.seconds * 1000)
      : new Date(value || 0);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
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
  document.body.classList.remove("student-profile-open");
  stopStudentProfileModalFollow();
  const status = document.getElementById("feedbackNoteStatus");
  if (status) status.textContent = "";
};

window.closeMissedTopicModal = function() {
  document.getElementById("missedTopicModal")?.classList.remove("active");
};

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (document.getElementById("studentProfileModal")?.classList.contains("active")) {
    window.closeStudentProfile();
    return;
  }
  if (document.getElementById("missedTopicModal")?.classList.contains("active")) {
    window.closeMissedTopicModal();
  }
});

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

async function updateUserUI(user) {
  let profile = {};
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    profile = snap.exists() ? (snap.data() || {}) : {};
  } catch (error) {
    console.warn("Unable to load admin profile header.", error);
  }

  setText("username", profile.name || user.displayName || user.email || "Admin");
  const photo = document.getElementById("userPhoto");
  if (photo) {
    photo.src = profile.photo || user.photoURL || "https://i.pravatar.cc/40?img=12";
  }
}

function setAdminMfaPanelVisibility(role) {
  const panel = document.getElementById("adminMfaPanel");
  if (!panel) return;
  panel.hidden = true;
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
  stopContactInboxSubscription();
  clearAdminMfaSession();
  clearSuperAdminMfaSession();
  if (auth.currentUser) {
    await signOut(auth);
  }
  window.location.href = "auth.html";
};

function setMfaStatus(message) {
  const el = document.getElementById("adminMfaStatus");
  if (el) el.textContent = message;
}

async function markOwnMfaProfileReset() {
  if (!currentUser) return;
  await setDoc(doc(db, "securityProfiles", currentUser.uid), {
    uid: currentUser.uid,
    email: currentUser.email || "",
    role: currentRole,
    firebaseMfaEnrolled: false,
    firebaseMfaProvider: "",
    firebaseMfaSource: "firebase_auth",
    lastVerificationMethod: "firebase_totp_reset",
    updatedAt: serverTimestamp()
  }, { merge: true });
}

window.resetMyAdminMfa = async function() {
  if (!currentUser) return;
  const enrolledCount = multiFactor(currentUser).enrolledFactors?.length || 0;
  const message = enrolledCount
    ? "Reset your current authenticator enrollment? You will be signed out and asked to set up 2FA again on your next login."
    : "No Firebase 2FA factor is recorded on this session. Open the setup page so you can enroll again?";
  if (!window.confirm(message)) return;

  const resetBtn = document.getElementById("adminMfaResetBtn");
  if (resetBtn) resetBtn.disabled = true;
  setMfaStatus(enrolledCount ? "Resetting your Firebase 2FA. Please wait..." : "Opening 2FA setup...");

  clearAdminMfaSession();
  try {
    await resetOwnMfaEnrollment();
    await currentUser.reload();
    await markOwnMfaProfileReset();
    await writeSecurityAudit(
      db,
      currentUser,
      "reset_own_admin_mfa",
      "Admin reset their own Firebase Auth multi-factor enrollment."
    );

    if (!enrolledCount) {
      window.location.href = currentRole === "super_admin" ? "super-admin-mfa.html" : "admin-mfa.html";
      return;
    }

    setMfaStatus("2FA reset. Signing out so you can enroll a fresh authenticator.");
    await signOut(auth);
    window.location.href = "auth.html";
  } catch (error) {
    console.error("Unable to reset admin MFA.", error);
    setMfaStatus(describeAutomaticMfaResetError(error));
    if (resetBtn) resetBtn.disabled = false;
  }
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
