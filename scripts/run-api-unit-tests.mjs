import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { ApiError, readJsonBody, safeErrorPayload } = require("../api/_lib/http.js");
const { parseBearerToken } = require("../api/_lib/auth.js");
const { buildGamificationMutation, deriveQuizXp } = require("../api/_lib/gamification.js");
const { assertDevelopmentEnvironment, createAuthCheckHandler } = require("../api/auth/check.js");

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

function createMockResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[name] = value; },
    end(value) { this.body = String(value || ""); }
  };
}

async function invokeAuthCheck({ environment = "development", authorization = "", verifyUser }) {
  const previousEnvironment = process.env.VERCEL_ENV;
  const previousProject = process.env.FIREBASE_ADMIN_PROJECT_ID;
  process.env.VERCEL_ENV = environment;
  process.env.FIREBASE_ADMIN_PROJECT_ID = "coderecall-preview";
  try {
    const req = { method: "POST", headers: { authorization } };
    const res = createMockResponse();
    await createAuthCheckHandler({ verifyUser })(req, res);
    return { status: res.statusCode, body: JSON.parse(res.body) };
  } finally {
    if (previousEnvironment === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousEnvironment;
    if (previousProject === undefined) delete process.env.FIREBASE_ADMIN_PROJECT_ID;
    else process.env.FIREBASE_ADMIN_PROJECT_ID = previousProject;
  }
}

test("Development auth check returns only sanitized verification metadata", async () => {
  const result = await invokeAuthCheck({
    authorization: "Bearer preview.valid.token",
    verifyUser: async (req) => ({ uid: parseBearerToken(req.headers.authorization) ? "verified-uid" : "" })
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    authenticated: true,
    environment: "development",
    firebaseProject: "coderecall-preview",
    uidPresent: true
  });
  assert.doesNotMatch(JSON.stringify(result.body), /token|email|claim|credential|private/i);
});

test("Development auth check rejects missing, malformed, invalid, and wrong-project tokens", async () => {
  for (const authorization of ["", "Basic invalid"]) {
    const result = await invokeAuthCheck({ authorization, verifyUser: async (req) => ({ uid: parseBearerToken(req.headers.authorization) }) });
    assert.equal(result.status, 401);
  }
  for (const message of ["invalid token", "wrong project token"]) {
    const result = await invokeAuthCheck({
      authorization: "Bearer rejected.token.value",
      verifyUser: async () => { throw new ApiError("unauthenticated", message, 401); }
    });
    assert.equal(result.status, 401);
  }
});

test("Preview and Production cannot expose the Development auth check", async () => {
  for (const environment of ["preview", "production"]) {
    let verifierCalled = false;
    const result = await invokeAuthCheck({
      environment,
      authorization: "Bearer preview.valid.token",
      verifyUser: async () => { verifierCalled = true; return { uid: "verified-uid" }; }
    });
    assert.equal(result.status, 404);
    assert.equal(verifierCalled, false);
  }
  const localResult = await invokeAuthCheck({
    environment: "",
    authorization: "Bearer preview.valid.token",
    verifyUser: async () => ({ uid: "verified-uid" })
  });
  assert.equal(localResult.status, 200);
  assert.throws(() => assertDevelopmentEnvironment("preview"), (error) => error instanceof ApiError && error.status === 404);
});

test("readJsonBody accepts Vercel pre-parsed JSON bodies", async () => {
  const result = await readJsonBody({ body: { protocolVersion: 2 } }, { maxBytes: 1024 });
  assert.deepEqual(result, { protocolVersion: 2 });
});

test("readJsonBody enforces limits for Vercel pre-parsed JSON bodies", async () => {
  await assert.rejects(
    () => readJsonBody({ body: { value: "x".repeat(32) } }, { maxBytes: 16 }),
    /too large/
  );
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

test("safeErrorPayload preserves the dedicated matching failure contract", () => {
  const result = safeErrorPayload(new ApiError("matching_failed", "The matching code was incorrect. This QR login request was cancelled. Generate a new QR code."));
  assert.equal(result.status, 409);
  assert.equal(result.body.code, "matching_failed");
  assert.ok(!/permission/i.test(result.body.message));
});

test("deriveQuizXp ignores arbitrary client xpAwarded values", () => {
  assert.equal(deriveQuizXp("quiz", 2, ["q1", "q2"]), 4);
  assert.equal(deriveQuizXp("pretest", 30), 30);
  assert.equal(deriveQuizXp("posttest", 30), 30);
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

  assert.equal(mutation.xpDelta, 4);
  assert.equal(mutation.results.hardware_easy_quiz_level_1_result.xpEarned, 4);
  assert.equal(mutation.eventSummary.clientXpIgnored, true);
});

test("Hardware Pre-Test completion awards 25 XP once and persists only its subject marker", () => {
  const first = buildGamificationMutation("record_quiz_result", {
    subject: "hardware",
    type: "pretest",
    difficulty: "easy",
    score: 25,
    total: 30,
    xpAwarded: 999999
  }, {});
  assert.equal(first.xpDelta, 25);
  assert.equal(first.progress.hardware_pretest, true);
  assert.equal(first.progress.electrical_pretest, undefined);
  assert.equal(first.results.hardware_pretest.xpEarned, 25);

  const duplicate = buildGamificationMutation("record_quiz_result", {
    subject: "hardware",
    type: "pretest",
    difficulty: "easy",
    score: 25,
    total: 30
  }, { progress: first.progress, results: first.results, xp: 25 });
  assert.equal(duplicate.xpDelta, 0);
  assert.equal(duplicate.progress.hardware_pretest_xp_awarded, 25);
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
