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
  addDoc,
  doc,
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


const auth = getAuth(app);
const db = getFirestore(app);
const QUIZ_LEVELS_PER_DIFFICULTY = 25;
const QUIZ_LEVEL_XP_PER_CORRECT = 2;

let currentUser = null;
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
  const currentRole = await resolveUserRole(db, user);
  await syncUserRole(db, user, currentRole);
  applyRoleNavigation(currentRole, "admin.html");

  if (!roleMeetsMinimum(currentRole, "admin")) {
    window.location.href = "dashboard.html";
    return;
  }

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

  const users = usersSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }));

  learnersCache = users.filter((user) => getRoleFromUserData(user) === "user");

  renderContactInboxCounts(contactMessages);
  renderOverview(learnersCache);
  renderLearningInsights(learnersCache);
  renderBottlenecks(learnersCache);
  renderDifficultyAnalytics(learnersCache);
  renderSubjectCompletionBreakdown(learnersCache);
  renderStudentTable(learnersCache);
  renderDraftReviews(moduleDrafts, quizDrafts);
  wireBuilderForms();
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
  const weakTopics = summarizeLearnerWeakTopics(learner);
  const studyHistory = summarizeLearnerStudyHistory(learner);
  const assessmentBars = buildLearnerAssessmentBars(learner);
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

function buildLearnerAssessmentBars(learner) {
  return [
    buildLearnerSubjectAssessment(learner, "hardware", "Computer Hardware"),
    buildLearnerSubjectAssessment(learner, "electrical", "Electrical")
  ];
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
  const date = new Date(value || 0);
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
  const status = document.getElementById("feedbackNoteStatus");
  if (status) status.textContent = "";
};

window.closeMissedTopicModal = function() {
  document.getElementById("missedTopicModal")?.classList.remove("active");
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

window.resetMyAdminMfa = function() {
  clearAdminMfaSession();
  setMfaStatus("Legacy app-level 2FA has been retired. Use Firebase Auth multi-factor enrollment instead.");
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
