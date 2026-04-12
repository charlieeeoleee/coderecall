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

const DEFAULT_PHOTO = "https://i.pravatar.cc/40?img=12";

function sanitizeText(value, fallback) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
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

  return players;
}
