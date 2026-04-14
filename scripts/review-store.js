import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const WRONG_ANSWER_REVIEW_KEY = "wrong_answer_review_items";
const MAX_REVIEW_ITEMS = 60;

function safeParseItems(raw) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadLocalItems() {
  return safeParseItems(localStorage.getItem(WRONG_ANSWER_REVIEW_KEY));
}

function saveLocalItems(items) {
  localStorage.setItem(WRONG_ANSWER_REVIEW_KEY, JSON.stringify(items.slice(0, MAX_REVIEW_ITEMS)));
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

function buildKey(payload = {}) {
  return [
    payload.source || "quiz",
    payload.subject || "subject",
    payload.quizType || payload.difficulty || "default",
    payload.quizLevel || payload.level || "na",
    getQuestionIdentity(payload)
  ].join("|");
}

function normalizeEntry(payload = {}) {
  const timestamp = new Date().toISOString();
  return {
    key: buildKey(payload),
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
    wrongCount: Math.max(1, Number(payload.wrongCount || 1)),
    updatedAt: payload.updatedAt || timestamp
  };
}

function upsertItems(items, payload) {
  const entry = normalizeEntry(payload);
  const existing = items.find((item) => item.key === entry.key);

  const nextItems = existing
    ? items.map((item) =>
        item.key === entry.key
          ? {
              ...item,
              ...entry,
              wrongCount: Math.max(1, Number(item.wrongCount || 0) + 1)
            }
          : item
      )
    : [entry, ...items];

  return nextItems
    .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
    .slice(0, MAX_REVIEW_ITEMS);
}

function removeItemByPayload(items, payload = {}) {
  const key = buildKey(payload);
  return items.filter((item) => item.key !== key);
}

async function syncRemoteItems(db, user, items) {
  if (!db || !user?.uid) return;

  await setDoc(
    doc(db, "users", user.uid),
    {
      wrongAnswerReview: items
    },
    { merge: true }
  );
}

export async function saveWrongAnswerReview({ db, user, payload }) {
  const localItems = loadLocalItems();
  const nextItems = upsertItems(localItems, payload);
  saveLocalItems(nextItems);
  await syncRemoteItems(db, user, nextItems);
  return nextItems;
}

export async function resolveWrongAnswerReview({ db, user, payload }) {
  const localItems = loadLocalItems();
  const nextItems = removeItemByPayload(localItems, payload);
  saveLocalItems(nextItems);
  await syncRemoteItems(db, user, nextItems);
  return nextItems;
}

export async function loadWrongAnswerReview({ db, user }) {
  const localItems = loadLocalItems();

  if (!db || !user?.uid) {
    return localItems;
  }

  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    const remoteItems = Array.isArray(snap.data()?.wrongAnswerReview) ? snap.data().wrongAnswerReview : [];

    const mergedMap = new Map();
    [...remoteItems, ...localItems].forEach((item) => {
      const normalized = normalizeEntry(item);
      const existing = mergedMap.get(normalized.key);
      if (!existing || new Date(normalized.updatedAt || 0).getTime() >= new Date(existing.updatedAt || 0).getTime()) {
        mergedMap.set(normalized.key, normalized);
      }
    });

    const merged = Array.from(mergedMap.values())
      .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
      .slice(0, MAX_REVIEW_ITEMS);

    saveLocalItems(merged);
    return merged;
  } catch {
    return localItems;
  }
}

export async function clearWrongAnswerReview({ db, user }) {
  saveLocalItems([]);
  await syncRemoteItems(db, user, []);
}
