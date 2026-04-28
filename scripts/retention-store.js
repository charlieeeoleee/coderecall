import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const RETENTION_QUEUE_KEY = "retention_queue_items";
const MAX_RETENTION_ITEMS = 80;
const RETENTION_INTERVAL_DAYS = [1, 3, 7, 14];

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
  if (payload?.seedReason === "wrong_answer" || payload?.seedReason === "low_confidence_correct") {
    return getImmediateDueIso();
  }

  return String(payload.dueAt || payload.retryAvailableAt || addDaysIso(RETENTION_INTERVAL_DAYS[stageIndex]));
}

function normalizeRetentionEntry(payload = {}) {
  const timestamp = new Date().toISOString();
  const stageIndex = Math.max(0, Number(payload.stageIndex || 0));
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
    selectedAnswer: String(payload.selectedAnswer || ""),
    correctAnswer: String(payload.correctAnswer || ""),
    rationale: String(payload.rationale || ""),
    actionUrl: String(payload.actionUrl || ""),
    confidence,
    seedReason,
    stageIndex,
    intervalDays: RETENTION_INTERVAL_DAYS[stageIndex] || RETENTION_INTERVAL_DAYS[RETENTION_INTERVAL_DAYS.length - 1],
    dueAt,
    retryAvailableAt: dueAt,
    completedCycles: Math.max(0, Number(payload.completedCycles || 0)),
    wrongCount: Math.max(0, Number(payload.wrongCount || (seedReason === "low_confidence_correct" ? 0 : 1))),
    lowConfidenceCount: Math.max(0, Number(payload.lowConfidenceCount || (seedReason === "low_confidence_correct" ? 1 : 0))),
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
                ? Number(item.intervalDays || RETENTION_INTERVAL_DAYS[Math.max(0, Number(item.stageIndex || 0))] || RETENTION_INTERVAL_DAYS[0])
                : RETENTION_INTERVAL_DAYS[0],
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
  const key = buildRetentionKey(payload);
  const target = items.find((item) => item.key === key);
  if (!target) return items;

  const timestamp = new Date().toISOString();
  const nextStageIndex = Number(target.stageIndex || 0) + 1;

  if (nextStageIndex >= RETENTION_INTERVAL_DAYS.length) {
    return items.filter((item) => item.key !== key);
  }

  const nextDueAt = addDaysIso(RETENTION_INTERVAL_DAYS[nextStageIndex]);
  return items
    .map((item) =>
      item.key === key
        ? {
            ...item,
            stageIndex: nextStageIndex,
            intervalDays: RETENTION_INTERVAL_DAYS[nextStageIndex],
            dueAt: nextDueAt,
            retryAvailableAt: nextDueAt,
            completedCycles: Math.max(0, Number(item.completedCycles || 0)) + 1,
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
