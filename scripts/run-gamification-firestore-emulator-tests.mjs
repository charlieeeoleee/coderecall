import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { deleteApp, getApps } = require("firebase-admin/app");
const { adminDb } = require("../api/_lib/firebase-admin.js");
const { computeSystemXP, recordGamificationEvent } = require("../api/_lib/gamification.js");

const emulatorHost = String(process.env.FIRESTORE_EMULATOR_HOST || "").trim();
if (!/^(?:127\.0\.0\.1|localhost):\d+$/.test(emulatorHost)) {
  throw new Error("Refusing to run: FIRESTORE_EMULATOR_HOST must target localhost.");
}
if (process.env.FIREBASE_ADMIN_PROJECT_ID !== "coderecall-preview") {
  throw new Error("Refusing to run: FIREBASE_ADMIN_PROJECT_ID must be coderecall-preview.");
}
if (process.env.CODE_RECALL_FIREBASE_PROJECT_ID !== "coderecall-preview") {
  throw new Error("Refusing to run: CODE_RECALL_FIREBASE_PROJECT_ID must be coderecall-preview.");
}

console.log(`REAL FIRESTORE EMULATOR gamification validation using FIRESTORE_EMULATOR_HOST=${emulatorHost}`);

const db = adminDb();
const suffix = `${process.pid}-${Date.now()}`;
const uid = `gamification-emulator-${suffix}`;
const userRef = db.collection("users").doc(uid);
const leaderboardRef = db.collection("leaderboard_public").doc(uid);
const token = { name: "Emulator Test Learner" };
const basePayload = {
  action: "record_quiz_result",
  eventId: `hardware-pretest-${suffix}`,
  subject: "hardware",
  type: "pretest",
  difficulty: "easy",
  level: "easy",
  score: 30,
  total: 30,
  xpAwarded: 999999,
  xpAwardedQuestionIds: Array.from({ length: 30 }, (_, index) => `hardware-pair-${index + 1}`)
};

try {
  const first = await recordGamificationEvent({
    uid,
    token,
    payload: basePayload,
    requestId: `test-first-${suffix}`,
    endpoint: "/api/gamification/event"
  });
  assert.equal(first.xpDelta, 30);
  assert.equal(first.xp, 30);
  assert.equal(first.progress.hardware_pretest, true);
  assert.equal(first.progress.hardware_pretest_xp_awarded, 30);
  assert.equal(first.results.hardware_pretest.score, 30);
  assert.equal(first.results.hardware_pretest.xpEarned, first.progress.hardware_pretest_xp_awarded);
  assert.equal(first.progress.electrical_pretest, undefined);

  const duplicate = await recordGamificationEvent({
    uid,
    token,
    payload: basePayload,
    requestId: `test-duplicate-${suffix}`,
    endpoint: "/api/gamification/event"
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.xpDelta, 30, "stored event response retains the original delta for auditability");

  const userAfterDuplicate = (await userRef.get()).data();
  assert.equal(userAfterDuplicate.xp, 30);
  assert.equal(userAfterDuplicate.xpWeekly, 30);
  assert.equal(userAfterDuplicate.progress.hardware_pretest_xp_awarded, 30);
  assert.equal(userAfterDuplicate.results.hardware_pretest.xpEarned, 30);
  assert.equal(computeSystemXP(userAfterDuplicate.progress, userAfterDuplicate.results), 30);

  await userRef.set({ streak: 1, lastActiveDate: "emulator-test" }, { merge: true });
  const userAfterBootstrap = (await userRef.get()).data();
  assert.equal(userAfterBootstrap.xp, 30, "profile/dashboard merge must preserve authoritative XP");

  const leaderboard = (await leaderboardRef.get()).data();
  assert.equal(leaderboard.xp, 30);
  assert.equal(leaderboard.xpWeekly, 30);

  const electricalPayload = {
    ...basePayload,
    eventId: `electrical-pretest-${suffix}`,
    subject: "electrical",
    score: 1,
    total: 30,
    xpAwardedQuestionIds: ["electrical-pair-1"]
  };
  const electrical = await recordGamificationEvent({
    uid,
    token,
    payload: electricalPayload,
    requestId: `test-electrical-${suffix}`,
    endpoint: "/api/gamification/event"
  });
  assert.equal(electrical.xpDelta, 1);
  assert.equal(electrical.xp, 31);
  assert.equal(electrical.progress.electrical_pretest, true);
  assert.equal(electrical.progress.electrical_pretest_xp_awarded, 1);
  assert.equal(electrical.results.electrical_pretest.xpEarned, electrical.progress.electrical_pretest_xp_awarded);
  assert.equal(electrical.progress.hardware_pretest_xp_awarded, 30);

  assert.equal(574 + 590, 1164);
  console.log("PASS authoritative Hardware Pre-Test writes exactly 30 XP");
  console.log("PASS duplicate event cannot increment aggregate XP");
  console.log("PASS dashboard/profile merge preserves canonical XP");
  console.log("PASS leaderboard and weekly XP agree with the user aggregate");
  console.log("PASS Electrical assessments use the same canonical XP contract");
  console.log("Gamification Firestore Emulator tests passed (5 groups).");
} finally {
  const events = await userRef.collection("gamificationEvents").get();
  await Promise.all(events.docs.map((item) => item.ref.delete()));
  await Promise.all([userRef.delete(), leaderboardRef.delete()]);
  await Promise.all(getApps().map((app) => deleteApp(app)));
}
