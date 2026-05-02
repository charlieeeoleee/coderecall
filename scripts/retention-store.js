import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const RETENTION_QUEUE_KEY = "retention_queue_items";
const RETENTION_CONFIG_KEY = "retention_schedule_config";
const MAX_RETENTION_ITEMS = 80;
const DEFAULT_RETENTION_CONFIG = {
  immediateOnSeed: true,
  intervals: [1, 3, 7, 14]
};

function safeParseItems(raw) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readLocalRetentionQueue() {
  return safeParseItems(localStorage.getItem(RETENTION_QUEUE_KEY));
}

function writeLocalRetentionQueue(items) {
  localStorage.setItem(RETENTION_QUEUE_KEY, JSON.stringify(items.slice(0, MAX_RETENTION_ITEMS)));
}

function normalizeRetentionConfig(config = {}) {
  const rawIntervals = Array.isArray(config?.intervals) ? config.intervals : DEFAULT_RETENTION_CONFIG.intervals;
  const nextIntervals = rawIntervals
    .map((value) => Math.max(0, Math.floor(Number(value || 0))))
    .slice(0, DEFAULT_RETENTION_CONFIG.intervals.length);

  while (nextIntervals.length < DEFAULT_RETENTION_CONFIG.intervals.length) {
    nextIntervals.push(DEFAULT_RETENTION_CONFIG.intervals[nextIntervals.length]);
  }

  for (let index = 1; index < nextIntervals.length; index += 1) {
    if (nextIntervals[index] < nextIntervals[index - 1]) {
      nextIntervals[index] = nextIntervals[index - 1];
    }
  }

  return {
    immediateOnSeed: config?.immediateOnSeed !== false,
    intervals: nextIntervals
  };
}

export function getRetentionScheduleConfig() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RETENTION_CONFIG_KEY) || "null");
    return normalizeRetentionConfig(parsed || DEFAULT_RETENTION_CONFIG);
  } catch {
    return normalizeRetentionConfig(DEFAULT_RETENTION_CONFIG);
  }
}

export function saveRetentionScheduleConfig(config = {}) {
  const normalized = normalizeRetentionConfig(config);
  localStorage.setItem(RETENTION_CONFIG_KEY, JSON.stringify(normalized));
  return normalized;
}

function getQuestionIdentity(payload = {}) {
  if (payload.level != null && payload.sub != null) {
    return `${payload.level}.${payload.sub}`;
  }

  return String(payload.question || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "unknown";
}

function buildRetentionKey(payload = {}) {
  return [
    payload.source || "quiz",
    payload.subject || "subject",
    payload.quizType || payload.difficulty || "default",
    payload.quizLevel || payload.level || "na",
    getQuestionIdentity(payload)
  ].join("|");
}

function addDaysIso(days) {
  const next = new Date();
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + Math.max(0, Number(days || 0)));
  return next.toISOString();
}

function getImmediateDueIso() {
  return new Date(Date.now() - 1000).toISOString();
}

function getInitialDueAt(payload = {}, stageIndex = 0) {
  const scheduleConfig = getRetentionScheduleConfig();
  if (scheduleConfig.immediateOnSeed && (payload?.seedReason === "wrong_answer" || payload?.seedReason === "low_confidence_correct")) {
    return getImmediateDueIso();
  }

  return String(payload.dueAt || payload.retryAvailableAt || addDaysIso(scheduleConfig.intervals[stageIndex]));
}

function normalizeRetentionEntry(payload = {}) {
  const timestamp = new Date().toISOString();
  const stageIndex = Math.max(0, Number(payload.stageIndex || 0));
  const scheduleConfig = getRetentionScheduleConfig();
  const seedReason = String(payload.seedReason || "wrong_answer");
  const confidence = String(payload.confidence || "");
  const dueAt = getInitialDueAt(payload, stageIndex);

  return {
    key: buildRetentionKey(payload),
    source: String(payload.source || "quiz"),
    subject: String(payload.subject || ""),
    difficulty: String(payload.difficulty || ""),
    quizType: String(payload.quizType || ""),
    quizLevel: Number(payload.quizLevel || payload.level || 0) || 0,
    level: Number(payload.level || 0) || 0,
    sub: Number(payload.sub || 0) || 0,
    title: String(payload.title || ""),
    question: String(payload.question || ""),
    image: String(payload.image || ""),
    imageCropBottom: Number(payload.imageCropBottom || 0) || 0,
    selectedAnswer: String(payload.selectedAnswer || ""),
    correctAnswer: String(payload.correctAnswer || ""),
    rationale: String(payload.rationale || ""),
    actionUrl: String(payload.actionUrl || ""),
    confidence,
    seedReason,
    stageIndex,
    intervalDays: scheduleConfig.intervals[stageIndex] || scheduleConfig.intervals[scheduleConfig.intervals.length - 1],
    dueAt,
    retryAvailableAt: dueAt,
    completedCycles: Math.max(0, Number(payload.completedCycles || 0)),
    wrongCount: Math.max(0, Number(payload.wrongCount || (seedReason === "low_confidence_correct" ? 0 : 1))),
    lowConfidenceCount: Math.max(0, Number(payload.lowConfidenceCount || (seedReason === "low_confidence_correct" ? 1 : 0))),
    lastRecallQuality: String(payload.lastRecallQuality || ""),
    createdAt: String(payload.createdAt || timestamp),
    lastQueuedAt: String(payload.lastQueuedAt || timestamp),
    lastCompletedAt: String(payload.lastCompletedAt || ""),
    updatedAt: String(payload.updatedAt || timestamp)
  };
}

async function syncRemoteRetentionQueue(db, user, items) {
  if (!db || !user?.uid) return;

  await setDoc(
    doc(db, "users", user.uid),
    {
      retentionQueue: items
    },
    { merge: true }
  );
}

function upsertRetentionItem(items, payload = {}) {
  if (!payload || payload.quizType === "pretest" || !payload.actionUrl) {
    return items;
  }

  const scheduleConfig = getRetentionScheduleConfig();
  const entry = normalizeRetentionEntry(payload);
  const existing = items.find((item) => item.key === entry.key);
  const isLowConfidenceSeed = entry.seedReason === "low_confidence_correct";

  const nextItems = existing
    ? items.map((item) =>
        item.key === entry.key
          ? {
              ...item,
              ...entry,
              stageIndex: isLowConfidenceSeed ? Number(item.stageIndex || 0) : 0,
              intervalDays: isLowConfidenceSeed
                ? Number(item.intervalDays || scheduleConfig.intervals[Math.max(0, Number(item.stageIndex || 0))] || scheduleConfig.intervals[0])
                : scheduleConfig.intervals[0],
              dueAt: isLowConfidenceSeed ? String(item.dueAt || entry.dueAt) : entry.dueAt,
              retryAvailableAt: isLowConfidenceSeed ? String(item.retryAvailableAt || entry.dueAt) : entry.dueAt,
              wrongCount: isLowConfidenceSeed
                ? Math.max(1, Number(item.wrongCount || 1))
                : Math.max(1, Number(item.wrongCount || 0) + 1),
              lowConfidenceCount: isLowConfidenceSeed
                ? Math.max(0, Number(item.lowConfidenceCount || 0) + 1)
                : Math.max(0, Number(item.lowConfidenceCount || 0)),
              lastQueuedAt: entry.lastQueuedAt,
              updatedAt: entry.updatedAt
            }
          : item
      )
    : [entry, ...items];

  return nextItems
    .sort((a, b) => new Date(a.dueAt || 0).getTime() - new Date(b.dueAt || 0).getTime())
    .slice(0, MAX_RETENTION_ITEMS);
}

function advanceRetentionItem(items, payload = {}) {
  const scheduleConfig = getRetentionScheduleConfig();
  const key = buildRetentionKey(payload);
  const target = items.find((item) => item.key === key);
  if (!target) return items;

  const timestamp = new Date().toISOString();
  const recallQuality = String(payload.recallQuality || "hard").toLowerCase();
  const stageJump = recallQuality === "easy" ? 2 : 1;
  const nextStageIndex = Number(target.stageIndex || 0) + stageJump;

  if (nextStageIndex >= scheduleConfig.intervals.length) {
    return items.filter((item) => item.key !== key);
  }

  const nextDueAt = addDaysIso(scheduleConfig.intervals[nextStageIndex]);
  return items
    .map((item) =>
      item.key === key
        ? {
            ...item,
            stageIndex: nextStageIndex,
            intervalDays: scheduleConfig.intervals[nextStageIndex],
            dueAt: nextDueAt,
            retryAvailableAt: nextDueAt,
            completedCycles: Math.max(0, Number(item.completedCycles || 0)) + 1,
            lastRecallQuality: recallQuality,
            lastCompletedAt: timestamp,
            updatedAt: timestamp
          }
        : item
    )
    .sort((a, b) => new Date(a.dueAt || 0).getTime() - new Date(b.dueAt || 0).getTime())
    .slice(0, MAX_RETENTION_ITEMS);
}

export async function saveRetentionReview({ db, user, payload }) {
  const localItems = readLocalRetentionQueue();
  const nextItems = upsertRetentionItem(localItems, payload);
  writeLocalRetentionQueue(nextItems);
  await syncRemoteRetentionQueue(db, user, nextItems);
  return nextItems;
}

export async function resolveRetentionReview({ db, user, payload }) {
  const localItems = readLocalRetentionQueue();
  const nextItems = advanceRetentionItem(localItems, payload);
  writeLocalRetentionQueue(nextItems);
  await syncRemoteRetentionQueue(db, user, nextItems);
  return nextItems;
}

export async function loadRetentionQueue({ db, user }) {
  const localItems = readLocalRetentionQueue();

  if (!db || !user?.uid) {
    return localItems;
  }

  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    const remoteItems = Array.isArray(snap.data()?.retentionQueue) ? snap.data().retentionQueue : [];

    const mergedMap = new Map();
    [...remoteItems, ...localItems].forEach((item) => {
      const normalized = normalizeRetentionEntry(item);
      const existing = mergedMap.get(normalized.key);
      if (!existing || new Date(normalized.updatedAt || 0).getTime() >= new Date(existing.updatedAt || 0).getTime()) {
        mergedMap.set(normalized.key, normalized);
      }
    });

    const merged = Array.from(mergedMap.values())
      .sort((a, b) => new Date(a.dueAt || 0).getTime() - new Date(b.dueAt || 0).getTime())
      .slice(0, MAX_RETENTION_ITEMS);

    writeLocalRetentionQueue(merged);
    return merged;
  } catch {
    return localItems;
  }
}

export async function clearRetentionQueue({ db, user }) {
  writeLocalRetentionQueue([]);
  await syncRemoteRetentionQueue(db, user, []);
}
