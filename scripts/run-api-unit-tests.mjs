import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { ApiError, readJsonBody, safeErrorPayload } = require("../api/_lib/http.js");
const { parseBearerToken } = require("../api/_lib/auth.js");
const { buildGamificationMutation, deriveQuizXp } = require("../api/_lib/gamification.js");

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test("parseBearerToken rejects missing Authorization header", () => {
  assert.throws(() => parseBearerToken(""), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, "unauthenticated");
    assert.equal(error.status, 401);
    return true;
  });
});

test("parseBearerToken rejects malformed Authorization header", () => {
  assert.throws(() => parseBearerToken("Basic abc123"), /Authorization bearer token/);
});

test("parseBearerToken returns the bearer token", () => {
  assert.equal(parseBearerToken("Bearer abc.def.ghi"), "abc.def.ghi");
});

test("readJsonBody rejects invalid payloads", async () => {
  const req = {
    async *[Symbol.asyncIterator]() {
      yield Buffer.from("{bad-json");
    }
  };
  await assert.rejects(() => readJsonBody(req), /valid JSON/);
});

test("safeErrorPayload returns structured safe JSON", () => {
  const result = safeErrorPayload(new ApiError("rate_limited", "Please try again shortly.", 429));
  assert.equal(result.status, 429);
  assert.deepEqual(result.body, {
    ok: false,
    code: "rate_limited",
    message: "Please try again shortly."
  });
});

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

let passed = 0;
for (const item of tests) {
  await item.fn();
  passed += 1;
}

console.log(JSON.stringify({
  status: "ok",
  passed
}, null, 2));
