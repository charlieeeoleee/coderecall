const { FieldValue, adminDb } = require("./firebase-admin");
const { ApiError, hashValue } = require("./http");

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_TTL_MS = 60 * 60 * 1000;
const RATE_LIMITS = {
  createQrLoginRequest: { limit: 12, windowMs: RATE_LIMIT_WINDOW_MS },
  approveQrLoginRequest: { limit: 20, windowMs: RATE_LIMIT_WINDOW_MS },
  exchangeQrLoginRequest: { limit: 30, windowMs: RATE_LIMIT_WINDOW_MS },
  resetOwnMfaEnrollment: { limit: 5, windowMs: 10 * RATE_LIMIT_WINDOW_MS },
  recordGamificationEvent: { limit: 180, windowMs: RATE_LIMIT_WINDOW_MS },
  reportFrontendError: { limit: 12, windowMs: RATE_LIMIT_WINDOW_MS }
};

async function assertRateLimit(event, subject, options = {}) {
  const config = RATE_LIMITS[event] || { limit: 30, windowMs: RATE_LIMIT_WINDOW_MS };
  const db = adminDb();
  const bucket = Math.floor(Date.now() / config.windowMs);
  const subjectHash = hashValue(subject);
  const ref = db.collection("rateLimits").doc(`${event}_${subjectHash}_${bucket}`);

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const count = snap.exists ? Number(snap.data()?.count || 0) : 0;
    if (count >= config.limit) {
      throw new ApiError("rate_limited", "Please try again shortly.", 429);
    }

    transaction.set(ref, {
      event,
      subjectHash,
      count: count + 1,
      windowMs: config.windowMs,
      updatedAt: FieldValue.serverTimestamp(),
      expiresAtMs: Date.now() + (options.ttlMs || RATE_LIMIT_TTL_MS)
    }, { merge: true });
  });
}

module.exports = {
  RATE_LIMITS,
  assertRateLimit
};
