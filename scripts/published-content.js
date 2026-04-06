import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

function getTimestampValue(value) {
  if (!value) return 0;
  if (typeof value.seconds === "number") return value.seconds;
  if (typeof value === "number") return value;
  return 0;
}

function sortByPublishOrder(items) {
  return [...items].sort((a, b) => {
    const orderDiff = (a.publishedOrder || 0) - (b.publishedOrder || 0);
    if (orderDiff !== 0) return orderDiff;

    const timeDiff = getTimestampValue(a.publishedAt) - getTimestampValue(b.publishedAt);
    if (timeDiff !== 0) return timeDiff;

    return (a.title || a.question || "").localeCompare(b.title || b.question || "");
  });
}

export async function fetchPublishedModules(db, filters = {}) {
  const snap = await getDocs(collection(db, "publishedModules"));
  const items = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));

  return sortByPublishOrder(items).filter((item) => {
    if (filters.subject && item.subject !== filters.subject) return false;
    if (filters.difficulty && item.difficulty !== filters.difficulty) return false;
    return true;
  });
}

export async function fetchPublishedQuizzes(db, filters = {}) {
  const snap = await getDocs(collection(db, "publishedQuizzes"));
  const items = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));

  return sortByPublishOrder(items).filter((item) => {
    if (filters.subject && item.subject !== filters.subject) return false;
    if (filters.quizType && item.quizType !== filters.quizType) return false;
    return true;
  });
}

export function chunkPublishedQuizLevels(items, chunkSize = 3) {
  const chunks = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}
