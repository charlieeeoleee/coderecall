import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const STUDY_HISTORY_KEY = "study_history_items";
const MAX_STUDY_HISTORY_ITEMS = 20;

function normalizeItem(payload = {}) {
  const timestamp = payload.timestamp || new Date().toISOString();
  return {
    key: String(payload.key || `${payload.kind || "activity"}|${payload.actionUrl || timestamp}`),
    kind: String(payload.kind || "activity"),
    title: String(payload.title || "Learning Activity"),
    subject: String(payload.subject || ""),
    difficulty: String(payload.difficulty || ""),
    detail: String(payload.detail || ""),
    actionUrl: String(payload.actionUrl || ""),
    timestamp
  };
}

function readLocalStudyHistory() {
  try {
    const raw = localStorage.getItem(STUDY_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalStudyHistory(items) {
  localStorage.setItem(STUDY_HISTORY_KEY, JSON.stringify(items.slice(0, MAX_STUDY_HISTORY_ITEMS)));
}

function upsertHistoryItem(items, payload) {
  const item = normalizeItem(payload);
  const nextItems = [item, ...items.filter((entry) => entry?.key !== item.key)];
  return nextItems.slice(0, MAX_STUDY_HISTORY_ITEMS);
}

export async function saveStudyHistory({ db, user, payload }) {
  const localItems = upsertHistoryItem(readLocalStudyHistory(), payload);
  return setStudyHistory({ db, user, items: localItems });
}

export async function loadStudyHistory({ db, user }) {
  const localItems = readLocalStudyHistory();

  if (!db || !user?.uid) {
    return localItems;
  }

  try {
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      return localItems;
    }

    const remoteItems = Array.isArray(snap.data()?.studyHistory) ? snap.data().studyHistory : [];
    if (!remoteItems.length) {
      return localItems;
    }

    writeLocalStudyHistory(remoteItems);
    return remoteItems;
  } catch {
    return localItems;
  }
}

export async function clearStudyHistory({ db, user }) {
  await setStudyHistory({ db, user, items: [] });
}

export async function setStudyHistory({ db, user, items }) {
  const normalizedItems = Array.isArray(items) ? items.slice(0, MAX_STUDY_HISTORY_ITEMS) : [];
  writeLocalStudyHistory(normalizedItems);

  if (!db || !user?.uid) {
    return normalizedItems;
  }

  const userRef = doc(db, "users", user.uid);
  await setDoc(userRef, { studyHistory: normalizedItems }, { merge: true });
  return normalizedItems;
}
