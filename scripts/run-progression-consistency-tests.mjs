import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildGamificationMutation } = require("../api/_lib/gamification.js");

const hardware = buildGamificationMutation("record_quiz_result", {
  subject: "hardware",
  type: "pretest",
  difficulty: "easy",
  score: 30,
  total: 30
}, {});
assert.equal(hardware.progress.hardware_pretest, true);
assert.equal(hardware.results.hardware_pretest.score, 30);
assert.equal(hardware.progress.hardware_pretest_xp_awarded, hardware.results.hardware_pretest.xpEarned);
assert.equal(hardware.progress.electrical_pretest, undefined);

const electrical = buildGamificationMutation("record_quiz_result", {
  subject: "electrical",
  type: "pretest",
  difficulty: "easy",
  score: 20,
  total: 30
}, {});
assert.equal(electrical.progress.electrical_pretest, true);
assert.equal(electrical.results.electrical_pretest.score, 20);
assert.equal(electrical.progress.electrical_pretest_xp_awarded, electrical.results.electrical_pretest.xpEarned);
assert.equal(electrical.progress.hardware_pretest, undefined);

const subjectSource = fs.readFileSync(new URL("./subject.js", import.meta.url), "utf8");
assert.match(subjectSource, /const displayedResults = currentUser \? remoteResults : readLocalQuizTrackResults\(\)/);
assert.match(subjectSource, /if \(currentUser\) \{\s*const result = remoteResults\[resultKey\] \|\| null;/);
assert.match(subjectSource, /hasAuthoritativeAssessmentCompletion\(data, subject, "pretest"\)/);
assert.doesNotMatch(subjectSource, /remoteResults\[`\$\{subject\}_pretest`\] \|\| readLocalAssessmentResult/);
assert.match(subjectSource, /completed: remoteCompleted,\s*completedAt: remoteCompletedAt/);
assert.match(subjectSource, /if \(!status\.modulesDone\) return "Complete the Modules first to unlock the quiz track\."/);
assert.match(subjectSource, /if \(!status\.quizDone\) return "Complete the Quiz Track first to unlock the Post-Test\."/);

console.log("Progression consistency tests passed (12 checks).");
