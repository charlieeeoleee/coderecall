import {
  fetchPublishedModules as fetchSupabasePublishedModules,
  fetchPublishedQuizzes as fetchSupabasePublishedQuizzes
} from "./supabase-content.js";

function getTimestampValue(value) {
  if (!value) return 0;
  if (typeof value.seconds === "number") return value.seconds;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : Math.floor(parsed / 1000);
  }
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

export async function fetchPublishedModules(_db, filters = {}) {
  const items = await fetchSupabasePublishedModules(filters);
  return sortByPublishOrder(items);
}

export async function fetchPublishedQuizzes(_db, filters = {}) {
  const items = await fetchSupabasePublishedQuizzes(filters);
  return sortByPublishOrder(items);
}

export function chunkPublishedQuizLevels(items, chunkSize = 3) {
  const chunks = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}
