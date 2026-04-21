import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export const PUBLIC_LEADERBOARD_COLLECTION = "leaderboard_public";
const LEADERBOARD_CACHE_PREFIX = "leaderboard_public_cache";
const LEADERBOARD_CACHE_TTL_MS = 60 * 1000;

const DEFAULT_PHOTO = "https://i.pravatar.cc/40?img=12";

function sanitizeText(value, fallback) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function getCacheKey(field, itemLimit) {
  return `${LEADERBOARD_CACHE_PREFIX}:${field}:${itemLimit}`;
}

function readLeaderboardCache(field, itemLimit) {
  try {
    const raw = localStorage.getItem(getCacheKey(field, itemLimit));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const timestamp = Number(parsed?.timestamp || 0);
    const items = Array.isArray(parsed?.items) ? parsed.items : [];

    if (!timestamp || (Date.now() - timestamp) > LEADERBOARD_CACHE_TTL_MS) {
      return null;
    }

    return items;
  } catch {
    return null;
  }
}

function writeLeaderboardCache(field, itemLimit, items) {
  try {
    localStorage.setItem(
      getCacheKey(field, itemLimit),
      JSON.stringify({
        timestamp: Date.now(),
        items
      })
    );
  } catch {
    // Ignore cache write failures.
  }
}

export async function syncPublicLeaderboardEntry(db, uid, data = {}) {
  if (!db || !uid) return;

  const payload = {
    name: sanitizeText(data.name, "User"),
    photo: sanitizeText(data.photo, DEFAULT_PHOTO),
    xp: Math.max(0, Number(data.xp || 0)),
    xpWeekly: Math.max(0, Number(data.xpWeekly || 0)),
    xpChange: Math.max(0, Number(data.xpChange || 0)),
    updatedAt: new Date().toISOString()
  };

  await setDoc(doc(db, PUBLIC_LEADERBOARD_COLLECTION, uid), payload, { merge: true });
}

export async function loadPublicLeaderboard(db, field = "xp", itemLimit = 100) {
  const cached = readLeaderboardCache(field, itemLimit);
  if (cached) {
    return cached;
  }

  const snapshot = await getDocs(
    query(
      collection(db, PUBLIC_LEADERBOARD_COLLECTION),
      orderBy(field, "desc"),
      limit(itemLimit)
    )
  );

  const players = [];
  snapshot.forEach((docItem) => {
    const data = docItem.data() || {};
    players.push({
      id: docItem.id,
      name: sanitizeText(data.name, "User"),
      photo: sanitizeText(data.photo, DEFAULT_PHOTO),
      xp: Math.max(0, Number(data.xp || 0)),
      xpWeekly: Math.max(0, Number(data.xpWeekly || 0)),
      xpChange: Math.max(0, Number(data.xpChange || 0))
    });
  });

  writeLeaderboardCache(field, itemLimit, players);
  return players;
}
