import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { buildGamificationMutation, deriveQuizXp } = require("../api/_lib/gamification.js");

test("deriveQuizXp ignores arbitrary client xpAwarded values", () => {
  assert.equal(deriveQuizXp("quiz", 2, ["q1", "q2"]), 12);
});

test("record_quiz_result derives XP from score and question identity", () => {
  const mutation = buildGamificationMutation("record_quiz_result", {
    subject: "hardware",
    type: "quiz",
    difficulty: "easy",
    levelNumber: 1,
    score: 2,
    total: 5,
    xpAwarded: 999999,
    xpAwardedQuestionIds: ["q1", "q2", "q2"]
  }, {});

  assert.equal(mutation.xpDelta, 12);
  assert.equal(mutation.results.hardware_easy_quiz_level_1_result.xpEarned, 12);
  assert.equal(mutation.eventSummary.clientXpIgnored, true);
});

test("duplicate module XP marker has no second XP delta", () => {
  const mutation = buildGamificationMutation("award_module_xp", {
    subject: "hardware",
    difficulty: "easy",
    moduleNumber: 1
  }, {
    progress: {
      hardware_easy_module_1_done_xp_awarded: true
    }
  });

  assert.equal(mutation.xpDelta, 0);
});

test("guest transfer derives bounded XP from whitelisted flags", () => {
  const mutation = buildGamificationMutation("import_guest_progress", {
    xp: 999999,
    progress: {
      hardware_pretest: true,
      hardware_modules: true,
      attacker_flag: true
    }
  }, {});

  assert.equal(mutation.xpDelta, 20);
  assert.equal(mutation.progress.attacker_flag, undefined);
  assert.equal(mutation.eventSummary.clientXpIgnored, true);
});
