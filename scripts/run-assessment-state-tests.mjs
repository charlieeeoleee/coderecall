import assert from "node:assert/strict";
import fs from "node:fs";
import { hasAuthoritativeAssessmentCompletion } from "./assessment-completion.mjs";

for (const subject of ["hardware", "electrical"]) {
  const key = `${subject}_pretest`;
  assert.equal(hasAuthoritativeAssessmentCompletion({}, subject, "pretest"), false);
  assert.equal(hasAuthoritativeAssessmentCompletion({ progress: { [key]: true } }, subject, "pretest"), true);
  assert.equal(hasAuthoritativeAssessmentCompletion({ results: { [key]: { score: 30, total: 30 } } }, subject, "pretest"), true);
  const other = subject === "hardware" ? "electrical" : "hardware";
  assert.equal(hasAuthoritativeAssessmentCompletion({ results: { [`${other}_pretest`]: {} } }, subject, "pretest"), false);
}

const quiz = fs.readFileSync(new URL("./quiz.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../quiz.html", import.meta.url), "utf8");
const subject = fs.readFileSync(new URL("./subject.js", import.meta.url), "utf8");

assert.match(html, /<section class="confidence-panel"[^>]* hidden>/);
assert.match(quiz, /document\.querySelector\("\.confidence-panel"\)\?\.setAttribute\("hidden", ""\);\s*loadTheme\(\);\s*await authReadyPromise/);
assert.match(quiz, /if \(currentUser\) \{\s*const data = await getCachedUserData\(currentUser\.uid, \{ force: true \}\);\s*return hasAuthoritativeAssessmentCompletion/);
assert.match(quiz, /if \(!currentIsGuest\) return false;/);
assert.match(quiz, /if \(await isPretestAlreadyTaken\(\)\)/);
assert.doesNotMatch(quiz, /if \(isPretestAlreadyTaken\(\)\)/);
assert.match(quiz, /const nextIds = currentUser\s*\? new Set\(\)/);
assert.match(quiz, /if \(panel\) panel\.hidden = false;/);
assert.match(quiz, /function requiresConfidenceSelection\(\) \{\s*return !isStandardTestAssessment\(\);/);
assert.match(subject, /hasAuthoritativeAssessmentCompletion\(data, subject, "pretest"\)/);

console.log("Assessment retake and confidence-state tests passed (18 checks).");
