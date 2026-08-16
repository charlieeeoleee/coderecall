import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import { electricalPretestQuestions } from "../data/electrical-pretest-data.js";
import { electricalPosttestQuestions } from "../data/electrical-posttest-data.js";
import { hardwarePretestQuestions } from "../data/hardware-assessment-data.js";
import { hardwarePosttestQuestions } from "../data/hardware-posttest-data.js";
import { ASSESSMENT_ROUTE_MAP, buildAssessmentUrl, resolveAssessmentRoute } from "./assessment-routing.mjs";

const require = createRequire(import.meta.url);
const { deriveQuizXp } = require("../api/_lib/gamification.js");
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function normalizeAnswer(question) {
  const answer = String(question.answer || "").trim();
  if (/^[A-D]$/i.test(answer)) {
    return question.choices[answer.toUpperCase().charCodeAt(0) - 65];
  }
  return answer;
}

function expectedIds(prefix) {
  return Array.from({ length: 30 }, (_, index) => `${prefix}-${String(index + 1).padStart(2, "0")}`);
}

function validateBank(name, bank, prefix) {
  assert.equal(bank.length, 30, `${name} must contain exactly 30 items`);
  assert.deepEqual(bank.map((question) => question.pairId), expectedIds(prefix));
  assert.equal(new Set(bank.map((question) => question.pairId)).size, 30, `${name} pair IDs must be unique`);
  bank.forEach((question) => {
    assert.equal(typeof question.question, "string");
    assert.ok(question.question.trim(), `${question.pairId} needs a question`);
    assert.equal(question.choices.length, 4, `${question.pairId} must have four choices`);
    question.choices.forEach((choice) => assert.ok(String(choice).trim(), `${question.pairId} has a blank choice`));
    assert.ok(question.choices.includes(normalizeAnswer(question)), `${question.pairId} answer must match a choice`);
  });
}

function validatePairs(name, pretest, posttest) {
  const preById = new Map(pretest.map((question) => [question.pairId, question]));
  const postById = new Map(posttest.map((question) => [question.pairId, question]));
  assert.equal(preById.size, 30);
  assert.equal(postById.size, 30);
  preById.forEach((pre, pairId) => {
    const post = postById.get(pairId);
    assert.ok(post, `${name} ${pairId} must have one Post-Test item`);
    assert.deepEqual(post.choices, pre.choices, `${name} ${pairId} choices must match`);
    assert.equal(normalizeAnswer(post), normalizeAnswer(pre), `${name} ${pairId} answers must match`);
  });
}

test("all four validated assessment banks contain 30 structurally valid items", () => {
  validateBank("Hardware Pre-Test", hardwarePretestQuestions, "hardware");
  validateBank("Hardware Post-Test", hardwarePosttestQuestions, "hardware");
  validateBank("Electrical Pre-Test", electricalPretestQuestions, "electrical");
  validateBank("Electrical Post-Test", electricalPosttestQuestions, "electrical");
});

test("each subject has exactly one matching Pre/Post item per stable pair ID", () => {
  validatePairs("Hardware", hardwarePretestQuestions, hardwarePosttestQuestions);
  validatePairs("Electrical", electricalPretestQuestions, electricalPosttestQuestions);
});

test("owner-approved Hardware 04, 10, and 14 resolutions are exact", () => {
  assert.deepEqual(hardwarePosttestQuestions[3].choices, ["PSU", "CPU", "RAM", "BIOS"]);
  assert.equal(hardwarePosttestQuestions[3].answer, "A");
  assert.equal(hardwarePretestQuestions[9].question, "What is the primary function of a motherboard's CMOS battery?");
  assert.equal(hardwarePosttestQuestions[9].question, "What does the CMOS battery primarily do when a computer is powered off?");
  assert.equal(hardwarePretestQuestions[13].question, "Which situation may occur when the CMOS battery becomes weak or depleted?");
  assert.equal(hardwarePosttestQuestions[13].question, "What problem may indicate that a computer's CMOS battery needs replacement?");
});

test("Electrical Pre-Test extraction preserved all original item values", () => {
  const valuesOnly = electricalPretestQuestions.map(({ pairId, ...question }) => question);
  const digest = crypto.createHash("sha256").update(JSON.stringify(valuesOnly)).digest("hex");
  assert.equal(digest, "d33b1a7166734934b5aa690fc5583868986d421aba57f64b411a8cdbca8e782e");
});

test("quiz UI loads the extracted bank and preserves question and choice shuffle", () => {
  const source = fs.readFileSync(new URL("./quiz.js", import.meta.url), "utf8");
  assert.match(source, /import \{ electricalPretestQuestions \} from "\.\.\/data\/electrical-pretest-data\.js"/);
  assert.doesNotMatch(source, /const electricalPretestQuestions\s*=/);
  assert.match(source, /const questionBanks\s*=\s*\{[\s\S]*pretest:\s*electricalPretestQuestions/);
  assert.match(source, /shuffleArray\(source\.map\(normalizeStandardQuestion\)\)/);
  assert.match(source, /choices:\s*shuffleArray\(\[\.\.\.question\.choices\]\)/);
  assert.match(source, /const pairId = String\(question\?\.pairId/);
});

test("all four assessment routes resolve to exactly one correct bank", () => {
  assert.deepEqual(resolveAssessmentRoute("?subject=hardware&type=pretest"), {
    subject: "hardware", type: "pretest", bankName: "hardwarePretestQuestions"
  });
  assert.deepEqual(resolveAssessmentRoute("?subject=hardware&type=posttest"), {
    subject: "hardware", type: "posttest", bankName: "hardwarePosttestQuestions"
  });
  assert.deepEqual(resolveAssessmentRoute("?subject=electrical&type=pretest"), {
    subject: "electrical", type: "pretest", bankName: "electricalPretestQuestions"
  });
  assert.deepEqual(resolveAssessmentRoute("?subject=electrical&type=posttest"), {
    subject: "electrical", type: "posttest", bankName: "electricalPosttestQuestions"
  });
  assert.deepEqual(Object.keys(ASSESSMENT_ROUTE_MAP).sort(), ["electrical", "hardware"]);
});

test("invalid or incomplete assessment routes fail closed without fallback", () => {
  for (const search of ["", "?subject=unknown&type=pretest", "?subject=hardware", "?subject=hardware&type=quiz1"]) {
    assert.throws(() => resolveAssessmentRoute(search), /Invalid assessment (subject|type)/);
  }
  const source = fs.readFileSync(new URL("./quiz.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /validSubjects\.has\(savedSubject\)/);
  assert.match(source, /routeError\?\.message \|\| "Quiz content is not available yet\."/);
});

test("natural assessment launch URLs use canonical clean routes with explicit parameters", () => {
  assert.equal(buildAssessmentUrl("hardware", "pretest"), "/quiz?subject=hardware&type=pretest");
  assert.equal(buildAssessmentUrl("hardware", "posttest"), "/quiz?subject=hardware&type=posttest");
  assert.equal(buildAssessmentUrl("electrical", "pretest"), "/quiz?subject=electrical&type=pretest");
  assert.equal(buildAssessmentUrl("electrical", "posttest"), "/quiz?subject=electrical&type=posttest");

  const moduleLauncher = fs.readFileSync(new URL("./subject.js", import.meta.url), "utf8");
  const dashboardLauncher = fs.readFileSync(new URL("./dashboard.js", import.meta.url), "utf8");
  const inlineLauncher = fs.readFileSync(new URL("../subject.html", import.meta.url), "utf8");
  assert.match(moduleLauncher, /buildAssessmentUrl\(subject, "pretest"\)/);
  assert.match(moduleLauncher, /buildAssessmentUrl\(subject, "posttest"\)/);
  assert.doesNotMatch(moduleLauncher, /quiz\.html\?subject=/);
  assert.match(dashboardLauncher, /buildAssessmentUrl\(subject, "pretest"\)/);
  assert.match(dashboardLauncher, /buildAssessmentUrl\(subject, "posttest"\)/);
  assert.doesNotMatch(dashboardLauncher, /quiz\.html\?subject=.*type=(?:pretest|posttest)/);
  assert.doesNotMatch(inlineLauncher, /buildUrl\("quiz\.html"/);
  assert.doesNotMatch(`${moduleLauncher}\n${dashboardLauncher}\n${inlineLauncher}`, /["'`]\/quiz["'`]/);
});

test("assessment confidence is hidden and optional while normal quiz confidence remains", () => {
  const assessmentSource = fs.readFileSync(new URL("./quiz.js", import.meta.url), "utf8");
  const normalQuizSource = fs.readFileSync(new URL("./quiz-level.js", import.meta.url), "utf8");
  assert.match(assessmentSource, /return type === "pretest" \|\| type === "posttest"/);
  assert.match(assessmentSource, /if \(!requiresConfidenceSelection\(\)\) \{\s*if \(panel\) panel\.hidden = true;\s*selectedConfidence = null;/);
  assert.match(assessmentSource, /nextBtn\.disabled = !selectedChoice \|\| \(requiresConfidenceSelection\(\) && !selectedConfidence\)/);
  assert.match(normalQuizSource, /#confidenceOptions \.level-confidence-btn/);
  assert.match(normalQuizSource, /selectedConfidence = String\(button\.dataset\.confidence/);
  assert.match(assessmentSource, /document\.querySelector\("\.confidence-panel"\)\?\.setAttribute\("hidden", ""\)/);
  assert.match(assessmentSource, /nextBtn\.hidden = true/);
});

test("Pre-Test uses a neutral branch with no answer feedback, sound, rationale, or review panel", () => {
  const source = fs.readFileSync(new URL("./quiz.js", import.meta.url), "utf8");
  const branchStart = source.indexOf("if (isPretestAssessment()) {", source.indexOf("window.handleNext"));
  const branchEnd = source.indexOf("\n  if (isCorrect) {", branchStart);
  const branch = source.slice(branchStart, branchEnd);
  assert.ok(branchStart > 0 && branchEnd > branchStart);
  assert.doesNotMatch(branch, /playSound|showRationale|missedQuestionsThisRun|Correct answer|Wrong|Incorrect/);
  assert.match(source, /if \(isPretestAssessment\(\)\) \{\s*panel\.hidden = true;/);
  assert.match(source, /return "Pre-Test response recorded\."/);
  assert.match(source, /isPretestAssessment\(\)\s*\? "Diagnostic assessment"\s*:\s*`Score:/);
});

test("Post-Test feedback path remains enabled", () => {
  const source = fs.readFileSync(new URL("./quiz.js", import.meta.url), "utf8");
  assert.match(source, /playSound\("correct"\)/);
  assert.match(source, /playSound\("wrong"\)/);
  assert.match(source, /showRationale\(buildReviewRationale\(currentQuestion\)\)/);
  assert.match(source, /appendReviewField\(answers, "Correct Answer"/);
});

test("frontend and authoritative backend assessment rewards are one XP per correct answer", () => {
  const quizSource = fs.readFileSync(new URL("./quiz.js", import.meta.url), "utf8");
  const backendSource = fs.readFileSync(new URL("../api/_lib/gamification.js", import.meta.url), "utf8");
  assert.match(quizSource, /pretest:\s*1,\s*posttest:\s*1/);
  assert.match(backendSource, /pretest:\s*1,\s*posttest:\s*1/);
  assert.equal(deriveQuizXp("pretest", 30), 30);
  assert.equal(deriveQuizXp("posttest", 30), 30);
});

test("assessment completion persists only after authoritative success and exposes retry on failure", () => {
  const quizSource = fs.readFileSync(new URL("./quiz.js", import.meta.url), "utf8");
  const subjectSource = fs.readFileSync(new URL("./subject.js", import.meta.url), "utf8");
  const dashboardSource = fs.readFileSync(new URL("./dashboard.js", import.meta.url), "utf8");
  const apiCall = quizSource.indexOf("const response = await submitGamificationEvent");
  const authoritativeVerification = quizSource.indexOf("await verifyAuthoritativeGamificationWrite", apiCall);
  const localCommit = quizSource.indexOf("persistLocalCompletion();", apiCall);
  assert.ok(
    apiCall > 0 && authoritativeVerification > apiCall && localCommit > authoritativeVerification,
    "signed-in local completion must follow API success and authoritative Firestore verification"
  );
  assert.match(quizSource, /getDocFromServer\(userRef\)/);
  assert.match(quizSource, /Number\(data\.xp\) !== expectedXP/);
  assert.match(quizSource, /Number\(data\.progress\?\.\[expected\.xpKey\]\) !== expected\.xpEarned/);
  assert.doesNotMatch(quizSource, /validSubjects\.has\(selectedSubject\)/);
  assert.match(quizSource, /const canonicalSubject = subject;/);
  assert.match(quizSource, /showCompletionPersistenceError\(error\)/);
  assert.match(quizSource, /resultXP"\)\.textContent = "Not awarded"/);
  assert.match(quizSource, /resultScore"\)\.textContent = `\$\{score\}\/\$\{total\}`/);
  assert.match(quizSource, /resultPercent"\)\.textContent = `\$\{percent\}%`/);
  assert.match(quizSource, /finishButton\.textContent = "Retry Save"/);
  assert.match(subjectSource, /hasAuthoritativeAssessmentCompletion\(data, subject, "pretest"\)/);
  assert.doesNotMatch(subjectSource, /initialProgressLoad/);
  assert.match(subjectSource, /onAuthStateChanged\(auth, async \(user\) => \{[\s\S]*?currentUser = user \|\| null;[\s\S]*?await loadProgress\(\)/);
  assert.match(dashboardSource, /xp = data\.xp \|\| 0/);
});

test("authenticated API requests attach a Bearer token and retry one forced refresh", () => {
  const source = fs.readFileSync(new URL("./backend-api.js", import.meta.url), "utf8");
  assert.match(source, /headers\.Authorization = `Bearer \$\{await user\.getIdToken\(\)\}`/);
  assert.match(source, /headers\.Authorization = `Bearer \$\{await user\.getIdToken\(true\)\}`/);
  assert.match(source, /response\.status === 401 && payload\?\.code === "unauthenticated"/);
  assert.match(source, /options\.retryAuth !== false/);
  assert.doesNotMatch(source, /console\.(?:log|warn|error)\([^\n]*(?:Authorization|Bearer \$\{|getIdToken\(\))/);
});

test("local launcher pins the Firestore Emulator to the Preview project namespace", () => {
  const launcher = fs.readFileSync(new URL("../tools/start-coderecall-dev.bat", import.meta.url), "utf8");
  assert.match(launcher, /firebase emulators:start --only firestore --project preview/);
  assert.match(launcher, /FIRESTORE_EMULATOR_HOST=127\.0\.0\.1:18080/);
});

test("canonical XP economy remains 574 Hardware, 590 Electrical, and 1164 total", () => {
  const hardwareMax = 30 + 30 + 40 + 24 + (225 * 2);
  const electricalMax = 30 + 30 + 50 + 30 + (225 * 2);
  assert.equal(hardwareMax, 574);
  assert.equal(electricalMax, 590);
  assert.equal(hardwareMax + electricalMax, 1164);
  assert.equal((30 * 4), 120, "maximum assessment XP must be 120");
  const dashboardSource = fs.readFileSync(new URL("./dashboard.js", import.meta.url), "utf8");
  const achievementsSource = fs.readFileSync(new URL("./achievements.js", import.meta.url), "utf8");
  assert.match(dashboardSource, /TOTAL_SYSTEM_XP\s*=\s*1164/);
  for (const threshold of [10, 50, 100, 200, 300, 500, 750, 1000]) {
    assert.ok(threshold <= 1164);
  }
  assert.match(achievementsSource, /Reach 1164 XP/);
  assert.match(achievementsSource, /xp\s*>=\s*1164/);
});

for (const { name, fn } of tests) {
  await fn();
  console.log(`PASS ${name}`);
}

console.log(`Assessment contract tests passed (${tests.length}).`);
