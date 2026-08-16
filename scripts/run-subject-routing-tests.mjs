import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildSubjectUrl,
  normalizeSubjectUrl,
  resolveSubjectRoute
} from "./subject-routing.mjs";

assert.equal(buildSubjectUrl("hardware"), "/subject?subject=hardware");
assert.equal(buildSubjectUrl("electrical"), "/subject?subject=electrical");
assert.deepEqual(resolveSubjectRoute("?subject=hardware"), { subject: "hardware", unlockMode: "" });
assert.deepEqual(resolveSubjectRoute("?subject=electrical"), { subject: "electrical", unlockMode: "" });
assert.throws(() => resolveSubjectRoute(""), /missing a valid subject/);
assert.throws(() => resolveSubjectRoute("?subject=invalid"), /missing a valid subject/);
assert.equal(normalizeSubjectUrl("subject.html?subject=hardware"), "/subject?subject=hardware");
assert.equal(normalizeSubjectUrl("/subject?subject=electrical"), "/subject?subject=electrical");
assert.equal(normalizeSubjectUrl("/subject"), null);

const dashboard = fs.readFileSync(new URL("./dashboard.js", import.meta.url), "utf8");
const subjects = fs.readFileSync(new URL("./subjects.js", import.meta.url), "utf8");
const subject = fs.readFileSync(new URL("./subject.js", import.meta.url), "utf8");
const quiz = fs.readFileSync(new URL("./quiz.js", import.meta.url), "utf8");
const moduleDifficulty = fs.readFileSync(new URL("./module-difficulty.js", import.meta.url), "utf8");
const certificate = fs.readFileSync(new URL("./certificate.js", import.meta.url), "utf8");

assert.match(dashboard, /window\.location\.href = buildSubjectUrl\(subject\)/);
assert.match(subjects, /window\.location\.href = buildSubjectUrl\(subject\)/);
assert.match(quiz, /window\.location\.href = buildSubjectUrl\(subject\)/);
assert.match(moduleDifficulty, /window\.location\.href = buildSubjectUrl\(subject, unlockMode\)/);
assert.match(certificate, /window\.location\.href = buildSubjectUrl\(subject\)/);
assert.match(subject, /resolveSubjectRoute\(window\.location\.search\)/);
assert.match(subject, /title: "INVALID SUBJECT LINK"/);
assert.doesNotMatch(subject, /validSubjects\.has\(savedSubject\)/);

for (const source of [dashboard, subjects, quiz, moduleDifficulty, certificate]) {
  assert.doesNotMatch(source, /subject\.html\?subject=/);
}

console.log("Subject entry routing tests passed (17 groups).");
