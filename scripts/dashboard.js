/* =========================
   FIREBASE IMPORTS
========================= */
import { app } from "./firebase-config.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  onSnapshot,
  where,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  initSounds,
  initGlobalClickSound,
  tryStartMusic,
  restartThemeMusic
} from "./sound.js";
import { applyRoleNavigation, resolveUserRole } from "./role-utils.js";
import { loadPublicLeaderboard, syncPublicLeaderboardEntry } from "./leaderboard-public.js";
import { loadWrongAnswerReview } from "./review-store.js";
import { loadRetentionQueue, clearAllLocalRetentionQueueStorage } from "./retention-store.js";
import { loadStudyHistory } from "./study-history-store.js";
import { traceXPEvent } from "./xp-debug.js";
import { MODULE_STRUCTURE } from "../data/module-data.js";
import { getCareerProgress } from "./career-path.js";

/* =========================
   FIREBASE CONFIG
========================= */

const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentXP = 0;
let currentIsGuest = false;
let currentAchievements = [];
let leaderboardData = [];
let leaderboardState = "idle";
let leaderboardErrorCode = "";
let latestSubjectSnapshot = [];
const CONTACT_REPLY_SEEN_KEY_PREFIX = "contact_reply_seen";
const SELECTED_SUBJECT_KEY = "selectedSubject";
const DASHBOARD_STATUS_DEFAULT = "Jump straight back into your latest lesson or quiz";
const SLOW_LOAD_DELAY_MS = 4200;
const MODULE_XP_REWARD = 5;
const QUIZ_LEVEL_XP_PER_CORRECT = 2;
const QUIZ_LEVELS_PER_DIFFICULTY = 25;
const TOTAL_SYSTEM_XP = 1164;
const XP_RULES = {
  pretest: 1,
  posttest: 4
};
const SUBJECT_LABELS = {
  hardware: "Computer Hardware",
  electrical: "Electrical Wiring and Electronics"
};
let latestHistoryActionUrl = "";
let contactReplyBadgeUnsubscribe = null;

applyRoleNavigation("guest", "dashboard.html");

function setDashboardLoadStatus(message = DASHBOARD_STATUS_DEFAULT, isWarning = false) {
  const status = document.getElementById("dashboardLoadStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("slow-load-warning", isWarning);
}

function startSlowDashboardNotice() {
  return window.setTimeout(() => {
    setDashboardLoadStatus("Still loading your dashboard. Slow connections can take a few more seconds.", true);
    const title = document.getElementById("continueLearningTitle");
    const detail = document.getElementById("continueLearningDetail");
    const kind = document.getElementById("continueLearningKind");
    if (title) title.textContent = "Still checking your latest activity...";
    if (detail) detail.textContent = "The page is connected, but Firebase is taking longer than usual.";
    if (kind) kind.textContent = "slow network";
  }, SLOW_LOAD_DELAY_MS);
}

function stopSlowDashboardNotice(timerId) {
  window.clearTimeout(timerId);
  setDashboardLoadStatus();
}

function deferNonCriticalTask(task) {
  const run = () => {
    Promise.resolve()
      .then(task)
      .catch((error) => console.warn("Deferred dashboard task failed:", error));
  };

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(run, { timeout: 1200 });
  } else {
    window.setTimeout(run, 80);
  }
}

function timestampToMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function getReplySeenStorageKeyForUser(uid) {
  return uid ? `${CONTACT_REPLY_SEEN_KEY_PREFIX}:${uid}` : "";
}

function readSeenRepliesForUser(uid) {
  const key = getReplySeenStorageKeyForUser(uid);
  if (!key) return {};

  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) || {} : {};
  } catch {
    return {};
  }
}

function updateContactReplyBadge(count = 0) {
  const badge = document.getElementById("contactReplyBadge");
  const link = document.getElementById("dashboardContactLink");
  if (!badge || !link) return;

  const safeCount = Math.max(0, Number(count) || 0);
  badge.hidden = safeCount <= 0;
  badge.textContent = safeCount > 99 ? "99+" : String(safeCount);
  link.classList.toggle("has-unread-replies", safeCount > 0);
}

async function refreshContactReplyBadge() {
  if (!currentUser || currentIsGuest) {
    updateContactReplyBadge(0);
    return;
  }

  try {
    const snapshot = await getDocs(query(
      collection(db, "contactMessages"),
      where("createdByUid", "==", currentUser.uid)
    ));

    const seenReplies = readSeenRepliesForUser(currentUser.uid);
    const unreadCount = snapshot.docs.reduce((count, entry) => {
      const data = entry.data() || {};
      const replyTimestamp = timestampToMillis(data.repliedAt);
      if (!data.replyText || !replyTimestamp) {
        return count;
      }

      return seenReplies[entry.id] === replyTimestamp ? count : count + 1;
    }, 0);

    updateContactReplyBadge(unreadCount);
  } catch (error) {
    console.error("Unable to load contact reply badge:", error);
    updateContactReplyBadge(0);
  }
}

function stopContactReplyBadgeSubscription() {
  if (typeof contactReplyBadgeUnsubscribe === "function") {
    contactReplyBadgeUnsubscribe();
  }
  contactReplyBadgeUnsubscribe = null;
}

function startContactReplyBadgeSubscription() {
  stopContactReplyBadgeSubscription();

  if (!currentUser || currentIsGuest) {
    updateContactReplyBadge(0);
    return;
  }

  const source = query(
    collection(db, "contactMessages"),
    where("createdByUid", "==", currentUser.uid)
  );

  contactReplyBadgeUnsubscribe = onSnapshot(
    source,
    (snapshot) => {
      const seenReplies = readSeenRepliesForUser(currentUser.uid);
      const unreadCount = snapshot.docs.reduce((count, entry) => {
        const data = entry.data() || {};
        const replyTimestamp = timestampToMillis(data.repliedAt);
        if (!data.replyText || !replyTimestamp) {
          return count;
        }

        return seenReplies[entry.id] === replyTimestamp ? count : count + 1;
      }, 0);

      updateContactReplyBadge(unreadCount);
    },
    (error) => {
      console.error("Unable to subscribe to contact reply badge:", error);
      updateContactReplyBadge(0);
    }
  );
}

function readLocalResumeActivity() {
  try {
    return JSON.parse(localStorage.getItem("resume_activity") || "null");
  } catch {
    return null;
  }
}

function chooseLatestActivity(...items) {
  const validItems = items.filter((item) => item && (item.resumeUrl || item.actionUrl || item.updatedAt || item.timestamp));
  if (!validItems.length) return null;

  return validItems.sort((a, b) => {
    const left = new Date(a.updatedAt || a.timestamp || 0).getTime();
    const right = new Date(b.updatedAt || b.timestamp || 0).getTime();
    return right - left;
  })[0];
}

function formatResumeSavedAt(activity) {
  const rawDate = activity?.updatedAt || activity?.timestamp || "";
  const time = rawDate ? new Date(rawDate).getTime() : 0;
  if (!time) return "Progress will save as you learn";

  const elapsedMs = Date.now() - time;
  const elapsedMinutes = Math.max(0, Math.round(elapsedMs / 60000));
  if (elapsedMinutes < 1) return "Saved just now";
  if (elapsedMinutes < 60) return `Saved ${elapsedMinutes} min ago`;

  const elapsedHours = Math.round(elapsedMinutes / 60);
  if (elapsedHours < 24) return `Saved ${elapsedHours} hr ago`;

  return `Saved ${new Date(time).toLocaleDateString([], { month: "short", day: "numeric" })}`;
}

function formatResumeProgress(activity) {
  const total = Number(activity?.total || activity?.totalQuestions || 0);
  const currentIndex = Number(activity?.currentIndex || 0);
  const percent = Number(activity?.progressPercent || 0);

  if (activity?.kind === "module") {
    if (percent > 0) return `${Math.min(100, Math.max(0, percent))}% read`;
    return "Scroll position saved";
  }

  if (total > 0) {
    return `Question ${Math.min(total, currentIndex + 1)} of ${total}`;
  }

  return activity?.resumeUrl ? "Resume point saved" : "";
}

function getAssessmentXP(type, result = null) {
  if (type === "pretest") {
    return Math.max(0, Number(result?.score || 0) || 0);
  }

  if (type === "posttest") {
    return Math.max(0, Number(result?.score || 0) || 0);
  }

  return 0;
}

function computeExpectedSystemXP(progress = {}, results = {}) {
  const moduleXP = Object.entries(progress).reduce((sum, [key, value]) => {
    if (!/^(hardware|electrical)_(easy|medium|hard)_module_\d+_done_xp_awarded$/.test(key)) {
      return sum;
    }
    return value ? sum + MODULE_XP_REWARD : sum;
  }, 0);

  const quickCheckXP = Object.entries(progress).reduce((sum, [key, value]) => {
    if (!/^(hardware|electrical)_(easy|medium|hard)_module_\d+_done_quick_check_best_score$/.test(key)) {
      return sum;
    }
    return sum + Math.max(0, Number(value || 0));
  }, 0);

  const quizXP = Object.entries(results).reduce((sum, [key, value]) => {
    if (/^(hardware|electrical)_(easy|medium|hard)_quiz_level_\d+_result$/.test(key)) {
      return sum + (Math.max(0, Number(value?.score || 0)) * QUIZ_LEVEL_XP_PER_CORRECT);
    }

    if (/^(hardware|electrical)_(pretest|posttest)$/.test(key)) {
      return sum + getAssessmentXP(value?.type, value);
    }

    return sum;
  }, 0);

  return moduleXP + quickCheckXP + quizXP;
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
  if (!layout || window.innerWidth > 900) return;

  layout.classList.toggle("mobile-nav-open");
  syncMobileSidebarButton();
};

function closeMobileSidebar() {
  const layout = document.querySelector(".layout");
  if (!layout) return;

  layout.classList.remove("mobile-nav-open");
  syncMobileSidebarButton();
}

/* =========================
   AUTH STATE
========================= */
onAuthStateChanged(auth, async (user) => {
  stopContactReplyBadgeSubscription();
  const isGuest = localStorage.getItem("guest") === "true";

  if (user) {
    currentUser = user;
    currentIsGuest = false;
    applyRoleNavigation(await resolveUserRole(db, user), "dashboard.html");

    await loadDashboard();
    startContactReplyBadgeSubscription();
    deferNonCriticalTask(updateUserStreak);
  } else if (isGuest) {
    currentUser = null;
    currentIsGuest = true;
    applyRoleNavigation("guest", "dashboard.html");
    updateGuestStreak();
    loadGuestDashboard();
    updateContactReplyBadge(0);
  } else {
    window.location.href = "auth.html";
  }
});

/* =========================
   LOAD REAL USER DASHBOARD
========================= */
async function loadDashboard() {
  const slowLoadTimer = startSlowDashboardNotice();
  setInsightLoadingState(true);
  updateContactReplyBadge(0);
  const userRef = doc(db, "users", currentUser.uid);
  const docSnap = await getDoc(userRef);

  let xp = 0;
  let xpWeekly = 0;
  let xpChange = 0;
  let name = "User";
  let photo = "https://i.pravatar.cc/40?img=12";
  let data = { progress: {}, results: {} };

  if (docSnap.exists()) {
    data = docSnap.data();
    data = await reconcileLocalProgressToFirestore(userRef, data);
    xp = data.xp || 0;
    xpWeekly = data.xpWeekly || 0;
    xpChange = data.xpChange || 0;
    name =
      data.name ||
      currentUser.displayName ||
      currentUser.email ||
      "User";
    photo =
      data.photo ||
      currentUser.photoURL ||
      "https://i.pravatar.cc/40?img=12";
  } else {
    xp = 0;
    name =
      currentUser.displayName ||
      currentUser.email ||
      "User";
    photo =
      currentUser.photoURL ||
      "https://i.pravatar.cc/40?img=12";

    const initialData = {
      xp: 0,
      xpWeekly: 0,
      xpChange: 0,
      lastWeeklyReset: getWeekKey(),
      progress: {},
      results: {},
      name: name,
      photo: photo,
      email: currentUser.email || "",
      streak: 1,
      lastActiveDate: getTodayString()
    };

    await setDoc(userRef, initialData);

    const refreshedData = await reconcileLocalProgressToFirestore(userRef, initialData);
    data = refreshedData;
    xp = refreshedData.xp || 0;
    xpWeekly = refreshedData.xpWeekly || 0;
    xpChange = refreshedData.xpChange || 0;
  }

  currentXP = xp;
  updateUserUI(name, photo);
  updateStatsUI(xp);
  const subjectSnapshot = buildSubjectProgressSnapshot(data.progress || {}, data.results || {});
  latestSubjectSnapshot = subjectSnapshot;
  renderCareerPathCard(xp, subjectSnapshot);
  renderSubjectProgressSection(subjectSnapshot);
  renderCertificatesPreview(subjectSnapshot);
  stopSlowDashboardNotice(slowLoadTimer);
  deferNonCriticalTask(async () => {
    await syncPublicLeaderboardEntry(db, currentUser.uid, {
      name,
      photo,
      xp,
      xpWeekly,
      xpChange
    });

    await Promise.all([
      renderReviewInsights(data),
      renderMemoryReviewInsights(data),
      renderStudyHistoryInsights(data, subjectSnapshot),
      loadLeaderboard()
    ]);
    renderDashboardAchievementsExpanded({
      xp,
      isGuest: false,
      streak: Number(data.streak || 0),
      progress: data.progress || {},
      results: data.results || {}
    });
    renderDashboardLeaderboardPreview();
    await refreshContactReplyBadge();
  });
}

async function reconcileLocalProgressToFirestore(userRef, data) {
  const progress = { ...(data.progress || {}) };
  const results = { ...(data.results || {}) };
  const currentWeek = getWeekKey();
  const lastWeeklyReset = data.lastWeeklyReset || currentWeek;

  let xpDelta = 0;
  let progressChanged = false;
  let resultsChanged = false;

  const markProgress = (key, value = true) => {
    if (progress[key] === value) return false;
    progress[key] = value;
    progressChanged = true;
    return true;
  };

  const hasLocalDone = (baseKey) =>
    localStorage.getItem(baseKey) === "true" ||
    localStorage.getItem(`${baseKey}_done`) === "true" ||
    localStorage.getItem(`${baseKey}_attempt_done`) === "true";

  ["hardware", "electrical"].forEach((subject) => {
    ["pretest", "posttest"].forEach((type) => {
      const baseKey = `${subject}_${type}`;
      const alreadyTracked = progress[baseKey] === true || results[baseKey] != null;

      if (!alreadyTracked && hasLocalDone(baseKey)) {
        markProgress(baseKey);
        results[baseKey] = {
          subject,
          type,
          score: Number(localStorage.getItem(`${baseKey}_score`) || 0),
          percent: Number(localStorage.getItem(`${baseKey}_percent`) || 0),
          completedAt: new Date().toISOString()
        };
        resultsChanged = true;
      }

      const expectedXP = getAssessmentXP(type, results[baseKey]);
      const xpProgressKey = `${baseKey}_xp_awarded`;
      const trackedXP = Number(progress[xpProgressKey] || 0);

      if (expectedXP > trackedXP) {
        progress[xpProgressKey] = expectedXP;
        progressChanged = true;
        xpDelta += expectedXP - trackedXP;
      }
    });
  });

  Object.keys(localStorage).forEach((key) => {
    if (/_module_\d+_done$/.test(key) && localStorage.getItem(key) === "true") {
      markProgress(key);
    }

    if (/_module_\d+_done_xp_awarded$/.test(key) && localStorage.getItem(key) === "true") {
      if (markProgress(key)) {
        xpDelta += MODULE_XP_REWARD;
      }
    }

    if (/_module_\d+_done_quick_check_best_score$/.test(key)) {
      const localBest = Number(localStorage.getItem(key) || 0);
      const remoteBest = Number(progress[key] || 0);
      if (localBest > remoteBest) {
        progress[key] = localBest;
        progressChanged = true;
        xpDelta += localBest - remoteBest;
      }
    }

    if (/^(hardware|electrical)_(easy|medium|hard)_quiz_level_\d+_done$/.test(key) && localStorage.getItem(key) === "true") {
      markProgress(key);
    }

    if (/^(hardware|electrical)_(easy|medium|hard)_quiz_level_\d+_result$/.test(key)) {
      const doneKey = key.replace(/_result$/, "_done");
      const alreadyTracked = progress[doneKey] === true;
      const raw = localStorage.getItem(key);
      if (!raw) return;

      try {
        const parsed = JSON.parse(raw);
        if (!alreadyTracked) {
          progress[doneKey] = true;
          progressChanged = true;
          xpDelta += Math.max(0, Number(parsed.score) || 0) * QUIZ_LEVEL_XP_PER_CORRECT;
        }
      } catch {
        // ignore malformed local quiz level payloads
      }
    }

    if (/^(hardware|electrical)_(easy|medium|hard)_quiz$/.test(key) && localStorage.getItem(key) === "true") {
      markProgress(key);
    }
  });

  const currentXP = Number(data.xp || 0);
  const currentWeeklyXP = lastWeeklyReset === currentWeek ? Number(data.xpWeekly || 0) : 0;
  const expectedXP = computeExpectedSystemXP(progress, results);
  const canonicalDelta = Math.max(0, expectedXP - (currentXP + xpDelta));
  const finalDelta = xpDelta + canonicalDelta;

  if (!progressChanged && !resultsChanged && finalDelta <= 0) {
    return data;
  }

  const nextData = {
    ...data,
    xp: currentXP + finalDelta,
    xpWeekly: currentWeeklyXP + finalDelta,
    xpChange: finalDelta > 0 ? finalDelta : Number(data.xpChange || 0),
    lastWeeklyReset: currentWeek,
    progress,
    results
  };

  traceXPEvent({
    channel: "dashboard_reconcile",
    source: "local_progress_sync",
    amount: finalDelta,
    nextXP: nextData.xp,
    uid: currentUser?.uid || "",
    progressChanged,
    resultsChanged,
    canonicalDelta
  });

  await updateDoc(userRef, {
    xp: nextData.xp,
    xpWeekly: nextData.xpWeekly,
    xpChange: nextData.xpChange,
    lastWeeklyReset: nextData.lastWeeklyReset,
    progress: nextData.progress,
    results: nextData.results
  });

  return nextData;
}

/* =========================
   LOAD GUEST DASHBOARD
========================= */
function loadGuestDashboard() {
  const slowLoadTimer = startSlowDashboardNotice();
  setInsightLoadingState(true);
  updateContactReplyBadge(0);
  const guestXP = parseInt(localStorage.getItem("guest_xp")) || 0;
  const guestSnapshot = buildGuestSubjectProgressSnapshot();
  latestSubjectSnapshot = guestSnapshot;

  currentXP = guestXP;
  updateUserUI("Guest", "https://i.pravatar.cc/40?img=8");
  updateStatsUI(guestXP);
  renderCareerPathCard(guestXP, guestSnapshot);
  renderSubjectProgressSection(guestSnapshot);
  renderCertificatesPreview(guestSnapshot);
  stopSlowDashboardNotice(slowLoadTimer);
  deferNonCriticalTask(() => {
    renderReviewInsights();
    renderMemoryReviewInsights({});
    renderStudyHistoryInsights({}, guestSnapshot);
    renderDashboardAchievementsExpanded({
      xp: guestXP,
      isGuest: true,
      streak: parseInt(localStorage.getItem("guest_streak")) || 0,
      progress: {},
      results: {}
    });
    renderDashboardLeaderboardPreview();
  });
}

function getTotalModulesForSubject(subject) {
  return Object.values(MODULE_STRUCTURE?.[subject] || {}).reduce((sum, count) => sum + Number(count || 0), 0);
}

function getTotalTrackableItemsForSubject(subject) {
  return getTotalModulesForSubject(subject) + (QUIZ_LEVELS_PER_DIFFICULTY * 3) + 2;
}

function toPercent(value, max) {
  if (!max) return 0;
  return Math.max(0, Math.min(100, Math.round((Number(value || 0) / max) * 100)));
}

function getNextSubjectStep({ subject, pretestDone, modulesDone, quizTrackDone, posttestDone }) {
  if (!pretestDone) {
    return {
      label: "Pre-Test",
      detail: "Take the baseline assessment",
      url: `quiz.html?subject=${subject}&level=easy&type=pretest`
    };
  }

  if (!modulesDone) {
    return {
      label: "Modules",
      detail: "Continue the lesson path",
      url: `module-difficulty.html?subject=${subject}`
    };
  }

  if (!quizTrackDone) {
    return {
      label: "Quiz Track",
      detail: "Clear the practice levels",
      url: `quiz-difficulty.html?subject=${subject}`
    };
  }

  if (!posttestDone) {
    return {
      label: "Post-Test",
      detail: "Finish the final assessment",
      url: `quiz.html?subject=${subject}&level=easy&type=posttest`
    };
  }

  return {
    label: "Certificate",
    detail: "Open the unlocked certificate",
    url: certificateKindUrl(subject)
  };
}

function certificateKindUrl(subject) {
  return `certificate.html?subject=${subject}`;
}

function buildSubjectProgressSnapshot(progress = {}, results = {}) {
  return ["hardware", "electrical"].map((subject) => {
    const totalModules = getTotalModulesForSubject(subject);
    const totalItems = getTotalTrackableItemsForSubject(subject);
    const totalQuizLevels = QUIZ_LEVELS_PER_DIFFICULTY * 3;
    const quizTrackMaxScore = totalQuizLevels * 3;
    const quizTrackMaxXP = quizTrackMaxScore * QUIZ_LEVEL_XP_PER_CORRECT;

    const moduleDoneCount = Object.keys(progress).filter((key) =>
      new RegExp(`^${subject}_(easy|medium|hard)_module_\\d+_done$`).test(key) && progress[key] === true
    ).length;

    const quizLevelDoneCount = Object.keys(progress).filter((key) =>
      new RegExp(`^${subject}_(easy|medium|hard)_quiz_level_\\d+_done$`).test(key) && progress[key] === true
    ).length;

    const pretestDone = progress[`${subject}_pretest`] === true || results[`${subject}_pretest`] != null;
    const posttestDone = progress[`${subject}_posttest`] === true || results[`${subject}_posttest`] != null;
    const modulesDone = progress[`${subject}_modules`] === true || moduleDoneCount >= totalModules;
    const quizTrackDone =
      progress[`${subject}_quiz`] === true ||
      progress[`${subject}_hard_quiz`] === true ||
      quizLevelDoneCount >= totalQuizLevels;
    const pretestResult = results[`${subject}_pretest`] || {};
    const posttestResult = results[`${subject}_posttest`] || {};
    const pretestXP = getAssessmentXP("pretest", results[`${subject}_pretest`]);
    const posttestXP = getAssessmentXP("posttest", results[`${subject}_posttest`]);
    const pretestScore = Math.max(0, Number(pretestResult?.score || 0));
    const posttestScore = Math.max(0, Number(posttestResult?.score || 0));
    const pretestTotal = Math.max(pretestScore, Number(pretestResult?.total || 0) || 10);
    const posttestTotal = Math.max(posttestScore, Number(posttestResult?.total || 0) || 10);

    const quickCheckXP = Object.entries(progress).reduce((sum, [key, value]) => {
      if (!new RegExp(`^${subject}_(easy|medium|hard)_module_\\d+_done_quick_check_best_score$`).test(key)) {
        return sum;
      }
      return sum + Number(value || 0);
    }, 0);

      const moduleXP = Object.entries(progress).reduce((sum, [key, value]) => {
        if (!new RegExp(`^${subject}_(easy|medium|hard)_module_\\d+_done_xp_awarded$`).test(key) || !value) {
          return sum;
        }
        return sum + MODULE_XP_REWARD;
      }, 0);

    const quizXP = Object.entries(results).reduce((sum, [key, value]) => {
      if (!new RegExp(`^${subject}_(easy|medium|hard)_quiz_level_\\d+_result$`).test(key)) {
        return sum;
      }
      return sum + (Number(value?.score || 0) * QUIZ_LEVEL_XP_PER_CORRECT);
    }, 0);

    const quizTrack = Object.entries(results).reduce((summary, [key, value]) => {
      if (!new RegExp(`^${subject}_(easy|medium|hard)_quiz_level_\\d+_result$`).test(key)) {
        return summary;
      }

      summary.correct += Math.max(0, Number(value?.score || 0));
      summary.questions += Math.max(Number(value?.total || 0) || 0, 3);
      return summary;
    }, { correct: 0, questions: 0 });

    const testXP = (pretestDone ? pretestXP : 0) + (posttestDone ? posttestXP : 0);
    const completedItems = moduleDoneCount + quizLevelDoneCount + (pretestDone ? 1 : 0) + (posttestDone ? 1 : 0);
    const percent = totalItems ? Math.round((completedItems / totalItems) * 100) : 0;

    return {
      subject,
      label: SUBJECT_LABELS[subject],
      completedItems,
      totalItems,
      percent,
      xp: moduleXP + quickCheckXP + quizXP + testXP,
      moduleDoneCount,
      totalModules,
      quizLevelDoneCount,
      totalQuizLevels,
      modulesDone,
      quizTrackDone,
      nextStep: getNextSubjectStep({
        subject,
        pretestDone,
        modulesDone,
        quizTrackDone,
        posttestDone
      }),
      assessments: {
        pretest: {
          state: pretestDone ? "Completed" : "Not taken",
          score: pretestScore,
          total: pretestTotal,
          xp: pretestDone ? pretestXP : 0,
          scorePercent: pretestDone ? toPercent(pretestScore, pretestTotal) : 0,
          xpPercent: pretestDone ? toPercent(pretestXP, pretestTotal) : 0
        },
        quizTrack: {
          state: quizLevelDoneCount ? `${quizLevelDoneCount}/${totalQuizLevels} levels cleared` : "No quiz levels cleared",
          score: quizTrack.correct,
          total: Math.max(quizTrack.questions, quizTrackMaxScore),
          xp: quizXP,
          scorePercent: toPercent(quizTrack.correct, quizTrackMaxScore),
          xpPercent: toPercent(quizXP, quizTrackMaxXP)
        },
        posttest: {
          state: posttestDone ? "Completed" : "Not taken",
          score: posttestScore,
          total: posttestTotal,
          xp: posttestDone ? posttestXP : 0,
          scorePercent: posttestDone ? toPercent(posttestScore, posttestTotal) : 0,
          xpPercent: posttestDone ? toPercent(posttestXP, posttestTotal) : 0
        }
      }
    };
  });
}

function buildGuestSubjectProgressSnapshot() {
  const progress = {};
  const results = {};

  Object.keys(localStorage).forEach((key) => {
    const rawValue = localStorage.getItem(key);
    if (rawValue == null) return;

    if (rawValue === "true") {
      progress[key] = true;
    } else if (!Number.isNaN(Number(rawValue)) && rawValue.trim() !== "") {
      progress[key] = Number(rawValue);
    }

    if (/^(hardware|electrical)_(easy|medium|hard)_quiz_level_\d+_result$/.test(key) || /^(hardware|electrical)_(pretest|posttest)$/.test(key)) {
      try {
        results[key] = JSON.parse(rawValue);
      } catch {
        // Ignore malformed local result payloads.
      }
    }
  });

  return buildSubjectProgressSnapshot(progress, results);
}

function renderSubjectProgressSection(subjects = []) {
  const grid = document.getElementById("subjectProgressGrid");
  if (!grid) return;

  grid.innerHTML = subjects.map((item) => `
    <article class="subject-progress-card">
      <div class="subject-progress-top">
        <div>
          <h4>${escapeHtml(item.label)}</h4>
          <p>${item.completedItems}/${item.totalItems} tracked activities completed</p>
        </div>
        <span class="subject-progress-percent">${item.percent}%</span>
      </div>
      <div class="progress-bar subject-progress-bar">
        <div class="subject-progress-fill" style="width:${item.percent}%"></div>
      </div>
      <div class="subject-progress-meta">
        <span>${item.moduleDoneCount}/${item.totalModules} modules</span>
        <span>${item.quizLevelDoneCount}/${item.totalQuizLevels} quiz levels</span>
        <strong>${item.xp} XP</strong>
      </div>
      <div class="subject-step-strip">
        ${[
          { label: "Pre-Test", done: item.assessments.pretest.state === "Completed" },
          { label: "Modules", done: item.modulesDone },
          { label: "Quiz Track", done: item.quizTrackDone },
          { label: "Post-Test", done: item.assessments.posttest.state === "Completed" }
        ].map((step) => `
          <span class="subject-step-chip ${step.done ? "done" : item.nextStep?.label === step.label ? "current" : "locked"}">
            ${step.label}
          </span>
        `).join("")}
      </div>
      <button class="subject-next-btn" type="button" onclick="window.location.href='${escapeHtml(item.nextStep?.url || `subject.html?subject=${item.subject}`)}'">
        ${item.percent >= 100 ? "View Certificate" : `Next: ${escapeHtml(item.nextStep?.label || "Open Subject")}`}
      </button>
      <div class="subject-assessment-stack">
        ${[
          { label: "Pre-Test", data: item.assessments.pretest },
          { label: "Quiz Track", data: item.assessments.quizTrack },
          { label: "Post-Test", data: item.assessments.posttest }
        ].map((assessment) => `
          <section class="subject-assessment-row">
            <div class="subject-assessment-head">
              <div>
                <h5>${assessment.label}</h5>
                <p>${escapeHtml(assessment.data.state)}</p>
              </div>
              <div class="subject-assessment-values">
                <span>${assessment.data.score}/${assessment.data.total} pts</span>
                <strong>${assessment.data.xp} XP</strong>
              </div>
            </div>
            <div class="subject-assessment-track">
              <div class="subject-assessment-fill score" style="width:${assessment.data.scorePercent}%"></div>
            </div>
            <div class="subject-assessment-track xp">
              <div class="subject-assessment-fill xp" style="width:${assessment.data.xpPercent}%"></div>
            </div>
          </section>
        `).join("")}
      </div>
    </article>
  `).join("");
}

function renderCareerPathCard(xp = 0, subjects = []) {
  const career = getCareerProgress({ xp, subjects });
  const title = document.getElementById("careerRoleTitle");
  const path = document.getElementById("careerRolePath");
  const next = document.getElementById("careerRoleNext");
  const fill = document.getElementById("careerRoleFill");

  if (title) title.textContent = career.current.title;
  if (path) path.textContent = `${career.subjectLabel} career path`;
  if (next) {
    next.textContent = career.next
      ? `Next: ${career.next.title} - ${career.nextRequirement}`
      : "Top role reached for this path.";
  }
  if (fill) fill.style.width = `${career.progressToNext}%`;
}

function buildCertificatePreviewItems(subjects = []) {
  const hardware = subjects.find((item) => item.subject === "hardware");
  const electrical = subjects.find((item) => item.subject === "electrical");
  const hardwareUnlocked = Boolean(hardware && hardware.percent === 100);
  const electricalUnlocked = Boolean(electrical && electrical.percent === 100);

  return [
    {
      key: "hardware",
      title: "Computer Hardware",
      detail: hardwareUnlocked ? "Subject certificate unlocked" : "Complete the full Hardware path",
      unlocked: hardwareUnlocked
    },
    {
      key: "electrical",
      title: "Electrical Wiring",
      detail: electricalUnlocked ? "Subject certificate unlocked" : "Complete the full Electrical path",
      unlocked: electricalUnlocked
    },
    {
      key: "dual",
      title: "Dual Completion",
      detail: hardwareUnlocked && electricalUnlocked ? "Full system certificate unlocked" : "Complete both subjects to unlock",
      unlocked: hardwareUnlocked && electricalUnlocked
    }
  ];
}

function renderCertificatesPreview(subjects = []) {
  const container = document.getElementById("dashboardCertificatesPreview");
  if (!container) return;

  const items = buildCertificatePreviewItems(subjects);
  container.innerHTML = items.map((item) => `
    <article class="dashboard-certificate-card ${item.unlocked ? "unlocked" : "locked"}">
      <div class="dashboard-certificate-mark">${item.unlocked ? "✓" : "•"}</div>
      <div class="dashboard-certificate-copy">
        <h4>${escapeHtml(item.title)}</h4>
        <p>${escapeHtml(item.detail)}</p>
      </div>
      <span class="dashboard-certificate-pill">${item.unlocked ? "Ready" : "Locked"}</span>
    </article>
  `).join("");
}

function setInsightLoadingState(isLoading) {
  [
    "memoryReviewCard",
    "continueLearningCard",
    "wrongAnswerReviewCard",
    "studyHistoryCard",
    "missedTopicsList"
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle("is-loading", isLoading);
  });
}

function prettifySourceLabel(item = {}) {
  if (item.quizType === "pretest") return "Pre-Test";
  if (item.quizType === "posttest") return "Post-Test";
  if (item.source === "quiz-level" || item.quizLevel) {
    return `${item.difficulty ? `${item.difficulty} ` : ""}Quiz`.trim();
  }
  return item.source
    ? item.source
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase())
    : "Activity";
}

function buildMissedTopicSummary(items = []) {
  const grouped = new Map();

  items.forEach((item) => {
    const title = String(item.title || item.question || "Untitled topic").trim();
    const groupKey = `${item.subject || "general"}|${title.toLowerCase()}`;
    const existing = grouped.get(groupKey) || {
      title,
      subject: item.subject || "general",
      latestSource: prettifySourceLabel(item),
      wrongCount: 0
    };

    existing.wrongCount += Math.max(1, Number(item.wrongCount || 1));
    existing.latestSource = prettifySourceLabel(item);
    grouped.set(groupKey, existing);
  });

  return Array.from(grouped.values())
    .sort((a, b) => b.wrongCount - a.wrongCount)
    .slice(0, 3);
}

function renderMissedTopics(items = []) {
  const list = document.getElementById("missedTopicsList");
  if (!list) return;

  const topics = buildMissedTopicSummary(items);
  list.classList.remove("is-loading");

  if (!topics.length) {
    list.innerHTML = `
      <article class="review-empty-state compact-empty-state">
        <h4>No repeat misses yet</h4>
        <p>Your most-missed topics will appear here once you start building a review list.</p>
      </article>
    `;
    return;
  }

  list.innerHTML = topics.map((topic) => `
    <article class="missed-topic-card">
      <div class="missed-topic-copy">
        <div class="wrong-answer-meta">
          <span class="wrong-answer-chip">${escapeHtml(topic.subject || "general")}</span>
          <span class="wrong-answer-chip secondary">${escapeHtml(topic.latestSource)}</span>
        </div>
        <h4>${escapeHtml(topic.title)}</h4>
        <p>Missed ${topic.wrongCount} time${topic.wrongCount === 1 ? "" : "s"} so far.</p>
      </div>
      <strong class="missed-topic-count">${topic.wrongCount}x</strong>
    </article>
  `).join("");
}

function buildRecommendedLearningAction(subjects = latestSubjectSnapshot) {
  const candidates = Array.isArray(subjects) ? subjects : [];
  const activeSubject = candidates
    .filter((item) => item && item.percent < 100)
    .sort((a, b) => {
      const aStarted = a.completedItems > 0 ? 1 : 0;
      const bStarted = b.completedItems > 0 ? 1 : 0;
      if (aStarted !== bStarted) return bStarted - aStarted;
      return b.percent - a.percent;
    })[0];

  if (activeSubject?.nextStep) {
    return {
      title: `${activeSubject.nextStep.label}: ${activeSubject.label}`,
      detail: activeSubject.nextStep.detail,
      actionUrl: activeSubject.nextStep.url,
      source: "recommended",
      updatedAt: new Date().toISOString()
    };
  }

  if (candidates.length && candidates.every((item) => item.percent >= 100)) {
    return {
      title: "Certificates Ready",
      detail: "Both subject paths are complete. Open your certificates.",
      actionUrl: "certificates.html",
      source: "certificate",
      updatedAt: new Date().toISOString()
    };
  }

  return {
    title: "Choose a Subject",
    detail: "Start with Hardware or Electrical to begin your learning path.",
    actionUrl: "subjects.html",
    source: "start",
    updatedAt: new Date().toISOString()
  };
}

async function renderReviewInsights(userData = {}) {
  const countEl = document.getElementById("wrongAnswerReviewCount");
  if (!countEl) return;

  const items = Array.isArray(userData?.wrongAnswerReview)
    ? userData.wrongAnswerReview
    : await loadWrongAnswerReview({
        db,
        user: currentUser
      });

  countEl.textContent = String(items.length);
  document.getElementById("wrongAnswerReviewCard")?.classList.remove("is-loading");
  renderMissedTopics(items);
}

function isDueMemoryReviewItem(item) {
  if (!item || !item?.actionUrl) return false;
  const dueAt = item?.dueAt ? new Date(item.dueAt) : null;
  if (!dueAt || Number.isNaN(dueAt.getTime())) return false;
  return dueAt.getTime() <= Date.now();
}

async function renderMemoryReviewInsights(userData = {}) {
  const countEl = document.getElementById("memoryReviewCount");
  const textEl = document.getElementById("memoryReviewPreviewText");
  const cardEl = document.getElementById("memoryReviewCard");
  if (!countEl || !textEl || !cardEl) return;

  const queueItems = Array.isArray(userData?.retentionQueue)
    ? userData.retentionQueue
    : await loadRetentionQueue({
        db,
        user: currentUser
      });

  const dueItems = queueItems
    .filter(isDueMemoryReviewItem)
    .sort((a, b) => new Date(a?.dueAt || 0).getTime() - new Date(b?.dueAt || 0).getTime());

  countEl.textContent = String(dueItems.length);
  cardEl.classList.remove("is-loading");

  if (!dueItems.length) {
    textEl.textContent = "No retention items are due right now. New items will appear here after their spaced review interval unlocks.";
    return;
  }

  const latest = dueItems[0];
  const title = latest?.title || latest?.question || "Review item";
  const subject = latest?.subject || "general";
  const stageDays = Number(latest?.intervalDays || 0);
  textEl.textContent = `${title} • ${subject} • ${dueItems.length} due • ${stageDays ? `${stageDays}-day review` : "review due"}`;
}

function renderContinueLearning(items = [], userData = {}, subjects = latestSubjectSnapshot) {
  const titleEl = document.getElementById("continueLearningTitle");
  const detailEl = document.getElementById("continueLearningDetail");
  const kindEl = document.getElementById("continueLearningKind");
  const savedAtEl = document.getElementById("continueLearningSavedAt");
  const buttonEl = document.getElementById("continueLearningBtn");
  const cardEl = document.getElementById("continueLearningCard");
  if (!titleEl || !detailEl || !kindEl || !buttonEl || !cardEl) return;

  cardEl.classList.remove("is-loading");

  const latestHistory = items[0] || null;
  const latestResume = chooseLatestActivity(readLocalResumeActivity());
  const remoteResume = chooseLatestActivity(userData?.resumeActivity);
  const latest = chooseLatestActivity(latestResume, remoteResume, latestHistory);
  const recommended = buildRecommendedLearningAction(subjects);

  if (!latest) {
    latestHistoryActionUrl = recommended.actionUrl;
    titleEl.textContent = recommended.title;
    detailEl.textContent = recommended.detail;
    kindEl.textContent = "next step";
    if (savedAtEl) savedAtEl.textContent = "Recommended path";
    buttonEl.textContent = recommended.actionUrl === "certificates.html" ? "Open Certificates" : "Continue";
    return;
  }

  latestHistoryActionUrl = latest.resumeUrl || latest.actionUrl || recommended.actionUrl;
  const progressLabel = formatResumeProgress(latest);
  titleEl.textContent = latest.title || "Continue Learning";
  detailEl.textContent = [latest.detail || "Resume your latest activity.", progressLabel]
    .filter(Boolean)
    .join(" • ");
  kindEl.textContent = latest.resumeUrl ? "resume ready" : prettifySourceLabel(latest);
  if (savedAtEl) savedAtEl.textContent = formatResumeSavedAt(latest);
  buttonEl.textContent = latest.resumeUrl || latest.actionUrl ? "Resume Now" : "Continue";
}

function renderRecentActivityCards(items = []) {
  const container = document.getElementById("recentActivityCards");
  if (!container) return;

  const recentItems = items.slice(0, 3);
  if (!recentItems.length) {
    container.innerHTML = `
      <article class="recent-activity-card empty">
        <strong>No activity yet</strong>
        <span>Your latest module, quiz, or test will appear here.</span>
      </article>
    `;
    return;
  }

  container.innerHTML = recentItems.map((item) => `
    <button class="recent-activity-card" type="button" onclick="window.location.href='${escapeHtml(item.resumeUrl || item.actionUrl || "history.html")}'">
      <span class="recent-activity-kind">${escapeHtml(prettifySourceLabel(item))}</span>
      <strong>${escapeHtml(item.title || "Learning Activity")}</strong>
      <small>${escapeHtml(item.detail || formatResumeSavedAt(item))}</small>
    </button>
  `).join("");
}

async function renderStudyHistoryInsights(userData = {}, subjects = latestSubjectSnapshot) {
  const countEl = document.getElementById("studyHistoryCount");
  const textEl = document.getElementById("studyHistoryPreviewText");
  if (!countEl || !textEl) return;

  const mergedItems = Array.isArray(userData?.studyHistory)
    ? userData.studyHistory
    : await loadStudyHistory({
        db,
        user: currentUser
      });

  countEl.textContent = String(mergedItems.length);
  document.getElementById("studyHistoryCard")?.classList.remove("is-loading");
  renderRecentActivityCards(mergedItems);
  if (!mergedItems.length) {
    textEl.textContent = "Your recent modules and quizzes will appear here.";
    renderContinueLearning(mergedItems, userData, subjects);
    setInsightLoadingState(false);
    return;
  }

  const latest = mergedItems[0];
  textEl.textContent = `${latest.title} • ${latest.detail || "Recent activity"}`;
  renderContinueLearning(mergedItems, userData, subjects);
  setInsightLoadingState(false);
}

/* =========================
   LEADERBOARD DATA
========================= */
async function loadLeaderboard() {
  try {
    leaderboardState = "loading";
    leaderboardErrorCode = "";
    leaderboardData = await loadPublicLeaderboard(db, "xp", 50);

    if (!leaderboardData.length && currentUser) {
      const q = query(
        collection(db, "users"),
        orderBy("xp", "desc"),
        limit(50)
      );

      const snapshot = await getDocs(q);
      snapshot.forEach((docItem) => {
        leaderboardData.push({
          id: docItem.id,
          ...docItem.data()
        });
      });
    }

    leaderboardState = "ready";
  } catch (error) {
    console.error("Leaderboard Error:", error);
    leaderboardData = [];
    leaderboardState = "error";
    leaderboardErrorCode = String(error?.code || "");
  }
}

function buildDashboardLeaderboardPlayers() {
  const players = [...leaderboardData];

  if (currentIsGuest) {
    players.push({
      id: "guest-user",
      name: "Guest",
      photo: "https://i.pravatar.cc/40?img=8",
      xp: currentXP
    });
  }

  players.sort((a, b) => (b.xp || 0) - (a.xp || 0));
  return players.slice(0, 3);
}

function renderDashboardLeaderboardPreview() {
  const container = document.getElementById("dashboardLeaderboardPreview");
  if (!container) return;

  container.innerHTML = "";

  const topPlayers = buildDashboardLeaderboardPlayers();

  if (!topPlayers.length) {
    if (leaderboardState === "error") {
      const message = leaderboardErrorCode.includes("permission-denied")
        ? "Leaderboard unavailable for this account right now."
        : "Leaderboard is temporarily unavailable.";
      container.innerHTML = `<div class="preview-empty">${message}</div>`;
      return;
    }

    container.innerHTML = `<div class="preview-empty">No leaderboard data yet.</div>`;
    return;
  }

  topPlayers.forEach((player, index) => {
    const positionClass = index === 0 ? "first" : index === 1 ? "second" : "third";
    const medal = index === 0 ? "👑" : index === 1 ? "🥈" : "🥉";
    const rankLabel = index === 0 ? "1st Place" : index === 1 ? "2nd Place" : "3rd Place";

    const card = document.createElement("div");
    card.className = `preview-player ${positionClass}`;

    card.innerHTML = `
      <div class="preview-badge">${medal}</div>
      <img class="preview-avatar" src="${player.photo || "https://i.pravatar.cc/40?img=12"}" alt="${escapeHtml(player.name || "User")}">
      <div class="preview-name">${escapeHtml(player.name || "User")}</div>
      <div class="preview-rank">${rankLabel}</div>
      <div class="preview-xp">${player.xp || 0} XP</div>
    `;

    container.appendChild(card);
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

window.goToLeaderboard = function() {
  window.location.href = "leaderboard.html";
};

window.goToWrongAnswerReview = function() {
  window.location.href = "review.html";
};

window.goToMemoryReview = function() {
  window.location.href = "review.html?mode=retention";
};

window.goToMemoryFlashcards = function() {
  window.location.href = "review.html?mode=flashcards";
};

window.goToStudyHistory = function() {
  window.location.href = "history.html";
};

/* =========================
   UPDATE USER STREAK (REAL USER)
========================= */
async function updateUserStreak() {
  const userRef = doc(db, "users", currentUser.uid);
  const docSnap = await getDoc(userRef);
  const today = getTodayString();

  if (!docSnap.exists()) return;

  const data = docSnap.data();
  const lastActiveDate = data.lastActiveDate || "";
  let streak = data.streak || 0;

  if (lastActiveDate === today) {
    return;
  }

  if (isYesterday(lastActiveDate, today)) {
    streak += 1;
  } else {
    streak = 1;
  }

  await updateDoc(userRef, {
    streak,
    lastActiveDate: today
  });
}

/* =========================
   UPDATE GUEST STREAK
========================= */
function updateGuestStreak() {
  const today = getTodayString();
  const lastActiveDate = localStorage.getItem("guest_last_active_date") || "";
  let streak = parseInt(localStorage.getItem("guest_streak")) || 0;

  if (lastActiveDate === today) return;

  if (isYesterday(lastActiveDate, today)) {
    streak += 1;
  } else {
    streak = 1;
  }

  localStorage.setItem("guest_streak", String(streak));
  localStorage.setItem("guest_last_active_date", today);
}

/* =========================
   UPDATE USER UI
========================= */
function updateUserUI(name, photo) {
  document.getElementById("username").textContent = name;
  document.getElementById("userPhoto").src = photo;
}

/* =========================
   UPDATE STATS UI
========================= */
function updateStatsUI(xp) {
  const level = Math.floor(xp / 100) + 1;
  const progress = Math.min(100, Math.round((Math.max(0, xp) / TOTAL_SYSTEM_XP) * 100));
  const xpIntoLevel = Math.max(0, xp % 100);
  const xpNeeded = level >= Math.floor(TOTAL_SYSTEM_XP / 100) + 1 ? 0 : Math.max(0, 100 - xpIntoLevel);
  const xpToNext = document.getElementById("xpToNext");
  const levelDetail = document.getElementById("levelDetail");

  document.getElementById("xp").textContent = xp;
  document.getElementById("level").textContent = level;
  if (xpToNext) {
    xpToNext.textContent = xpNeeded > 0 ? `${xpNeeded} XP to Level ${level + 1}` : "Top level progress reached";
  }
  if (levelDetail) {
    levelDetail.textContent = `${xpIntoLevel}/100 XP in this level`;
  }
  animateNumber("xp", xp);
  animateNumber("level", level);
  animateProgress(progress);
}

window.continueLatestActivity = function() {
  if (latestHistoryActionUrl) {
    window.location.href = latestHistoryActionUrl;
    return;
  }

  const hasHistory = Number(document.getElementById("studyHistoryCount")?.textContent || 0) > 0;
  window.location.href = hasHistory ? "history.html" : "subjects.html";
};

function animateNumber(elementId, targetValue) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const duration = 900;
  const start = 0;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(start + (targetValue - start) * eased);

    el.textContent = value;

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

function animateProgress(target) {
  const text = document.getElementById("progressText");
  const fill = document.getElementById("progressFill");
  if (!text || !fill) return;

  let current = 0;
  const duration = 1000;
  const startTime = performance.now();

  fill.style.width = "0%";
  text.textContent = "0%";

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    current = Math.round(target * eased);

    fill.style.width = `${current}%`;
    text.textContent = `${current}%`;

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

/* =========================
   DASHBOARD ACHIEVEMENTS
========================= */
function renderDashboardAchievements(xp, isGuest) {
  const grid = document.getElementById("achievementsGrid");
  if (!grid) return;

  let streak = 0;
  if (isGuest) {
    streak = parseInt(localStorage.getItem("guest_streak")) || 0;
  }

  const quizStarted =
    localStorage.getItem("hardware_quiz") === "true" ||
    localStorage.getItem("electrical_quiz") === "true" ||
    localStorage.getItem("hardware_pretest") === "true" ||
    localStorage.getItem("electrical_pretest") === "true";

  const moduleRead =
    localStorage.getItem("hardware_modules") === "true" ||
    localStorage.getItem("electrical_modules") === "true";

  const exploredHardware =
    localStorage.getItem("hardware_pretest") === "true" ||
    localStorage.getItem("hardware_modules") === "true" ||
    localStorage.getItem("hardware_quiz") === "true" ||
    localStorage.getItem("hardware_posttest") === "true";

  const exploredElectrical =
    localStorage.getItem("electrical_pretest") === "true" ||
    localStorage.getItem("electrical_modules") === "true" ||
    localStorage.getItem("electrical_quiz") === "true" ||
    localStorage.getItem("electrical_posttest") === "true";

  currentAchievements = [
    {
      key: "first_win",
      icon: "🥇",
      title: "First Win",
      unlocked: xp > 0 || quizStarted,
      description: "Earn your first XP or complete your first quiz activity.",
      lockedText: "Start learning and earn your first XP to unlock this achievement."
    },
    {
      key: "fast_learner",
      icon: "⚡",
      title: "Fast Learner",
      unlocked: xp >= 50,
      description: "Reach 50 XP through active participation.",
      lockedText: "Earn 50 XP to unlock this achievement."
    },
    {
      key: "three_day_streak",
      icon: "🔥",
      title: "3-Day Streak",
      unlocked: streak >= 3,
      description: "Stay active for 3 consecutive days.",
      lockedText: "Come back and play for 3 days in a row to unlock this achievement."
    },
    {
      key: "quiz_starter",
      icon: "🎯",
      title: "Quiz Starter",
      unlocked: quizStarted,
      description: "Complete your first quiz or test activity.",
      lockedText: "Start your first quiz or test to unlock this achievement."
    },
    {
      key: "module_reader",
      icon: "📘",
      title: "Module Reader",
      unlocked: moduleRead,
      description: "Finish reading your first learning module.",
      lockedText: "Open and complete your first module to unlock this achievement."
    },
    {
      key: "subject_explorer",
      icon: "👻",
      title: "Subject Explorer",
      unlocked: exploredHardware && exploredElectrical,
      description: "Try both available subjects in the system.",
      lockedText: "Explore both subjects to unlock this achievement."
    }
  ];

  grid.innerHTML = "";

  currentAchievements.forEach((achievement, index) => {
    const card = document.createElement("button");
    card.className = `achievement-card ${achievement.unlocked ? "unlocked" : "locked"}`;
    card.style.animation = `fadeSlideUp 0.55s ease both`;
    card.style.animationDelay = `${0.08 * (index + 1)}s`;

    card.innerHTML = `
      <div class="achievement-top">
        <div class="achievement-icon">${achievement.icon}</div>
        <div class="achievement-status ${achievement.unlocked ? "unlocked" : "locked"}">
          ${achievement.unlocked ? "Unlocked" : "Locked"}
        </div>
      </div>
      <div>
        <div class="achievement-title">${achievement.title}</div>
        <div class="achievement-subtext">
          ${achievement.unlocked ? achievement.description : achievement.lockedText}
        </div>
      </div>
    `;

    card.addEventListener("click", () => openAchievementModal(achievement));
    grid.appendChild(card);
  });
}

/* =========================
   ACHIEVEMENT MODAL
========================= */
function openAchievementModal(achievement) {
  document.getElementById("achievementModalIcon").textContent = achievement.icon;
  document.getElementById("achievementModalTitle").textContent = achievement.title;
  document.getElementById("achievementModalDesc").textContent =
    achievement.unlocked ? achievement.description : achievement.lockedText;

  const status = document.getElementById("achievementModalStatus");
  status.textContent = achievement.unlocked ? "Unlocked" : "Locked";
  status.className = `achievement-modal-status ${achievement.unlocked ? "unlocked" : "locked"}`;

  document.getElementById("achievementModal").classList.add("active");

  if (achievement.unlocked) {
    launchConfetti();
  }
}

window.closeAchievementModal = function() {
  document.getElementById("achievementModal").classList.remove("active");
};

/* =========================
   CONFETTI
========================= */
function launchConfetti() {
  const container = document.getElementById("confettiContainer");
  if (!container) return;

  container.innerHTML = "";

  const colors = ["#ff2e97", "#00e5ff", "#00ffcc", "#ff8c00", "#ffffff"];

  for (let i = 0; i < 70; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = `${Math.random() * 100}vw`;
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDuration = `${2 + Math.random() * 2}s`;
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    container.appendChild(piece);
  }

  setTimeout(() => {
    container.innerHTML = "";
  }, 4000);
}

/* =========================
   OPEN SUBJECT PAGE
========================= */
window.startGame = function(subject) {
  sessionStorage.setItem(SELECTED_SUBJECT_KEY, subject);
  window.location.href = `subject.html?subject=${subject}`;
};

/* =========================
   GUEST LOGOUT POPUP
========================= */
function hasGuestProgress() {
  const guestXP = parseInt(localStorage.getItem("guest_xp")) || 0;
  const progressKeys = [
    "hardware_pretest",
    "hardware_modules",
    "hardware_quiz",
    "hardware_posttest",
    "electrical_pretest",
    "electrical_modules",
    "electrical_quiz",
    "electrical_posttest"
  ];
  const hasProgressKey = progressKeys.some((key) => localStorage.getItem(key) === "true");
  return guestXP > 0 || hasProgressKey;
}

function openGuestLogoutPopup(withProgress = true) {
  const popup = document.getElementById("guestLogoutPopup");
  const title = document.getElementById("guestLogoutTitle");
  const message = document.getElementById("guestLogoutMessage");
  const primaryBtn = document.getElementById("guestPrimaryBtn");
  const secondaryBtn = document.getElementById("guestSecondaryBtn");
  const cancelBtn = document.getElementById("guestCancelBtn");

  if (withProgress) {
    title.textContent = "Save Your Progress";
    message.textContent = "You are currently using a guest account. Register an account now to save your progress and XP before logging out.";
    primaryBtn.style.display = "block";
    primaryBtn.textContent = "Register to Save Progress";
    primaryBtn.onclick = registerGuestAccount;
    secondaryBtn.style.display = "block";
    secondaryBtn.textContent = "Log Out Anyway";
    secondaryBtn.onclick = confirmGuestLogout;
    cancelBtn.style.display = "block";
  } else {
    title.textContent = "Log Out Guest Session";
    message.textContent = "You are currently using guest mode. Are you sure you want to log out?";
    primaryBtn.style.display = "block";
    primaryBtn.textContent = "Log Out";
    primaryBtn.onclick = confirmGuestLogout;
    secondaryBtn.style.display = "none";
    cancelBtn.style.display = "block";
  }

  popup.classList.add("active");
}

window.closeGuestLogoutPopup = function() {
  document.getElementById("guestLogoutPopup").classList.remove("active");
};

window.registerGuestAccount = function() {
  localStorage.setItem("guest_pending_save", "true");
  closeGuestLogoutPopup();
  window.location.href = "auth.html";
};

window.confirmGuestLogout = function() {
  clearGuestSession();
  closeGuestLogoutPopup();
  window.location.href = "auth.html";
};

function clearGuestSession() {
  const keysToRemove = [
    "guest",
    "guest_xp",
    "guest_xpWeekly",
    "guest_streak",
    "guest_last_active_date",
    "guest_pending_save",
    "wrong_answer_review_items",
    "study_history_items",
    "hardware_pretest",
    "hardware_modules",
    "hardware_quiz",
    "hardware_posttest",
    "electrical_pretest",
    "electrical_modules",
    "electrical_quiz",
    "electrical_posttest"
  ];

  keysToRemove.forEach((key) => localStorage.removeItem(key));
  clearAllLocalRetentionQueueStorage();
}

/* =========================
   LOGOUT
========================= */
window.logout = async function() {
  closeMobileSidebar();
  stopContactReplyBadgeSubscription();

  if (currentIsGuest) {
    if (hasGuestProgress()) {
      openGuestLogoutPopup(true);
      return;
    } else {
      openGuestLogoutPopup(false);
      return;
    }
  }

  if (auth.currentUser) {
    await signOut(auth);
  }

  window.location.href = "auth.html";
};

/* =========================
   DATE HELPERS
========================= */
function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function renderDashboardAchievementsExpanded({
  xp = 0,
  isGuest = false,
  streak = 0,
  progress = {},
  results = {}
} = {}) {
  const grid = document.getElementById("achievementsGrid");
  if (!grid) return;

  if (isGuest) {
    streak = parseInt(localStorage.getItem("guest_streak")) || 0;
  }

  const getSaved = (key) =>
    progress[key] === true ||
    results[key] != null ||
    localStorage.getItem(key) === "true" ||
    localStorage.getItem(`${key}_done`) === "true" ||
    localStorage.getItem(`${key}_attempt_done`) === "true";

  const quizStarted =
    getSaved("hardware_quiz") ||
    getSaved("electrical_quiz") ||
    getSaved("hardware_pretest") ||
    getSaved("electrical_pretest");

  const hardwareStarted =
    getSaved("hardware_pretest") ||
    getSaved("hardware_modules") ||
    getSaved("hardware_quiz") ||
    getSaved("hardware_posttest");

  const electricalStarted =
    getSaved("electrical_pretest") ||
    getSaved("electrical_modules") ||
    getSaved("electrical_quiz") ||
    getSaved("electrical_posttest");

  const remoteModuleCount = Object.keys(progress).filter((key) =>
    /^(hardware|electrical)_(easy|medium|hard)_module_\d+_done$/.test(key) && progress[key] === true
  ).length;
  const localModuleCount = Object.keys(localStorage).filter((key) =>
    /^(hardware|electrical)_(easy|medium|hard)_module_\d+_done$/.test(key) && localStorage.getItem(key) === "true"
  ).length;
  const moduleDoneCount = Math.max(remoteModuleCount, localModuleCount);

  const remoteQuickCheckPoints = Object.keys(progress).reduce((sum, key) => {
    if (!/^(hardware|electrical)_(easy|medium|hard)_module_\d+_done_quick_check_best_score$/.test(key)) {
      return sum;
    }
    return sum + Number(progress[key] || 0);
  }, 0);
  const localQuickCheckPoints = Object.keys(localStorage).reduce((sum, key) => {
    if (!/^(hardware|electrical)_(easy|medium|hard)_module_\d+_done_quick_check_best_score$/.test(key)) {
      return sum;
    }
    return sum + Number(localStorage.getItem(key) || 0);
  }, 0);
  const quickCheckPoints = Math.max(remoteQuickCheckPoints, localQuickCheckPoints);

  const wrongAnswerItems = (() => {
    try {
      const raw = JSON.parse(localStorage.getItem("wrong_answer_review_items") || "[]");
      return Array.isArray(raw) ? raw.length : 0;
    } catch {
      return 0;
    }
  })();

  const studyHistoryItems = (() => {
    try {
      const raw = JSON.parse(localStorage.getItem("study_history_items") || "[]");
      return Array.isArray(raw) ? raw.length : 0;
    } catch {
      return 0;
    }
  })();

  const moduleRead = moduleDoneCount >= 1 || getSaved("hardware_modules") || getSaved("electrical_modules");
  const hardwareCompleted = getSaved("hardware_posttest");
  const electricalCompleted = getSaved("electrical_posttest");
  const dualCompleted = hardwareCompleted && electricalCompleted;
  const reviewOpened = localStorage.getItem("review_page_opened") === "true" || wrongAnswerItems > 0;
  const historyOpened = localStorage.getItem("study_history_opened") === "true" || studyHistoryItems > 0;
  const systemExplorer = hardwareStarted && electricalStarted && reviewOpened && historyOpened;

  currentAchievements = [
    {
      key: "first_win",
      icon: "🥇",
      title: "First Win",
      unlocked: xp > 0 || quizStarted,
      description: "Earn your first XP or complete your first quiz activity.",
      lockedText: "Start learning and earn your first XP to unlock this achievement."
    },
    {
      key: "fast_learner",
      icon: "⚡",
      title: "Fast Learner",
      unlocked: xp >= 50,
      description: "Reach 50 XP through active participation.",
      lockedText: "Earn 50 XP to unlock this achievement."
    },
    {
      key: "steady_progress",
      icon: "📈",
      title: "Steady Progress",
      unlocked: xp >= 100,
      description: "Reach 100 XP and build stronger momentum in the system.",
      lockedText: "Reach 100 XP to unlock this achievement."
    },
    {
      key: "three_day_streak",
      icon: "🔥",
      title: "3-Day Streak",
      unlocked: streak >= 3,
      description: "Stay active for 3 consecutive days.",
      lockedText: "Come back and play for 3 days in a row to unlock this achievement."
    },
    {
      key: "week_warrior",
      icon: "📅",
      title: "Week Warrior",
      unlocked: streak >= 7,
      description: "Keep your learning streak alive for a full week.",
      lockedText: "Stay active for 7 straight days to unlock this achievement."
    },
    {
      key: "quiz_starter",
      icon: "🎯",
      title: "Quiz Starter",
      unlocked: quizStarted,
      description: "Complete your first quiz or test activity.",
      lockedText: "Start your first quiz or test to unlock this achievement."
    },
    {
      key: "module_reader",
      icon: "📘",
      title: "Module Reader",
      unlocked: moduleRead,
      description: "Finish reading your first learning module.",
      lockedText: "Open and complete your first module to unlock this achievement."
    },
    {
      key: "subject_explorer",
      icon: "🧭",
      title: "Subject Explorer",
      unlocked: hardwareStarted && electricalStarted,
      description: "Try both available subjects in the system.",
      lockedText: "Explore both subjects to unlock this achievement."
    },
    {
      key: "module_scout",
      icon: "📚",
      title: "Module Scout",
      unlocked: moduleDoneCount >= 3,
      description: "Clear your first 3 completed modules.",
      lockedText: "Finish 3 modules to unlock this achievement."
    },
    {
      key: "quick_check_ready",
      icon: "📝",
      title: "Quick Check Ready",
      unlocked: quickCheckPoints >= 3,
      description: "Earn points from your first module quick check.",
      lockedText: "Answer a quick check and earn at least 3 points to unlock this achievement."
    },
    {
      key: "review_rebound",
      icon: "🔁",
      title: "Review Rebound",
      unlocked: reviewOpened,
      description: "Open the wrong-answer review and start learning from missed questions.",
      lockedText: "Use the wrong-answer review to unlock this achievement."
    },
    {
      key: "history_keeper",
      icon: "🕒",
      title: "History Keeper",
      unlocked: historyOpened,
      description: "Build a visible study trail through your recent activity.",
      lockedText: "Open your history or create recent activity to unlock this achievement."
    },
    {
      key: "hardware_finisher",
      icon: "🖥️",
      title: "Hardware Finisher",
      unlocked: hardwareCompleted,
      description: "Complete the full Computer Hardware subject path.",
      lockedText: "Finish the full Computer Hardware path to unlock this achievement."
    },
    {
      key: "electrical_finisher",
      icon: "⚙️",
      title: "Electrical Finisher",
      unlocked: electricalCompleted,
      description: "Complete the full Electrical Wiring subject path.",
      lockedText: "Finish the full Electrical path to unlock this achievement."
    },
    {
      key: "dual_achiever",
      icon: "🎓",
      title: "Dual Achiever",
      unlocked: dualCompleted,
      description: "Complete both subjects and prove full-system progress.",
      lockedText: "Complete both subjects to unlock this achievement."
    },
    {
      key: "system_explorer",
      icon: "🌍",
      title: "System Explorer",
      unlocked: systemExplorer,
      description: "Use subjects, review, and history like a full platform learner.",
      lockedText: "Use both subjects, review, and history to unlock this achievement."
    }
  ];

  grid.innerHTML = "";

  currentAchievements.forEach((achievement, index) => {
    const card = document.createElement("button");
    card.className = `achievement-card ${achievement.unlocked ? "unlocked" : "locked"}`;
    card.style.animation = `fadeSlideUp 0.55s ease both`;
    card.style.animationDelay = `${0.05 * (index + 1)}s`;

    card.innerHTML = `
      <div class="achievement-top">
        <div class="achievement-icon">${achievement.icon}</div>
        <div class="achievement-status ${achievement.unlocked ? "unlocked" : "locked"}">
          ${achievement.unlocked ? "Unlocked" : "Locked"}
        </div>
      </div>
      <div>
        <div class="achievement-title">${achievement.title}</div>
        <div class="achievement-subtext">
          ${achievement.unlocked ? achievement.description : achievement.lockedText}
        </div>
      </div>
    `;

    card.addEventListener("click", () => openAchievementModal(achievement));
    grid.appendChild(card);
  });
}

function getWeekKey() {
  const now = new Date();
  const year = now.getFullYear();
  const firstDay = new Date(year, 0, 1);
  const pastDays = Math.floor((now - firstDay) / 86400000);
  const week = Math.ceil((pastDays + firstDay.getDay() + 1) / 7);
  return `${year}-W${week}`;
}

function isYesterday(previousDate, currentDate) {
  if (!previousDate || !currentDate) return false;

  const prev = new Date(previousDate + "T00:00:00");
  const curr = new Date(currentDate + "T00:00:00");
  const diff = curr.getTime() - prev.getTime();

  return diff === 24 * 60 * 60 * 1000;
}

/* =========================
   THEME
========================= */
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
  icon.textContent =
    document.body.classList.contains("light-mode") ? "☀️" : "🌙";
}

loadTheme();
initSounds();
initGlobalClickSound();
window.addEventListener("load", () => {
  window.setTimeout(tryStartMusic, 120);
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
  if (window.innerWidth > 900) return;
  if (sidebar.contains(event.target) || toggle.contains(event.target)) return;

  closeMobileSidebar();
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 900) {
    closeMobileSidebar();
  }
});

window.addEventListener("focus", () => {
  if (currentUser && !currentIsGuest) {
    refreshContactReplyBadge();
  }
});

window.addEventListener("storage", (event) => {
  if (!currentUser || currentIsGuest) return;
  if (!event.key || !event.key.startsWith(CONTACT_REPLY_SEEN_KEY_PREFIX)) return;

  refreshContactReplyBadge();
});

document.body.addEventListener("click", () => {
  tryStartMusic();
}, { once: true });

