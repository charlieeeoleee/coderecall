import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildModuleDifficultyUrl,
  buildModuleLessonUrl,
  buildModuleLevelsUrl,
  resolveModuleDifficultyRoute,
  resolveModuleLessonRoute,
  resolveModuleLevelsRoute
} from "./module-routing.mjs";

assert.equal(buildModuleDifficultyUrl("hardware"), "/module-difficulty?subject=hardware");
assert.equal(buildModuleDifficultyUrl("electrical"), "/module-difficulty?subject=electrical");
assert.equal(buildModuleLevelsUrl("hardware", "easy"), "/module-levels?subject=hardware&difficulty=easy");
assert.equal(buildModuleLevelsUrl("electrical", "hard"), "/module-levels?subject=electrical&difficulty=hard");
assert.deepEqual(resolveModuleDifficultyRoute("?subject=hardware"), { subject: "hardware", unlockMode: "" });
assert.deepEqual(resolveModuleDifficultyRoute("?subject=electrical"), { subject: "electrical", unlockMode: "" });
assert.deepEqual(resolveModuleLevelsRoute("?subject=hardware&difficulty=easy"), { subject: "hardware", difficulty: "easy", unlockMode: "" });
assert.deepEqual(resolveModuleLessonRoute("?subject=electrical&difficulty=hard&module=module2"), { subject: "electrical", difficulty: "hard", moduleKey: "module2" });
assert.equal(buildModuleLessonUrl("hardware", "medium", "module3"), "/module?subject=hardware&difficulty=medium&module=module3");
assert.throws(() => resolveModuleDifficultyRoute(""), /missing a valid subject/);
assert.throws(() => resolveModuleDifficultyRoute("?subject=unknown"), /missing a valid subject/);

const subjectSource = fs.readFileSync(new URL("./subject.js", import.meta.url), "utf8");
const difficultySource = fs.readFileSync(new URL("./module-difficulty.js", import.meta.url), "utf8");
const dashboardSource = fs.readFileSync(new URL("./dashboard.js", import.meta.url), "utf8");
const levelsSource = fs.readFileSync(new URL("./module-levels.js", import.meta.url), "utf8");
const moduleSource = fs.readFileSync(new URL("./module.js", import.meta.url), "utf8");

assert.match(subjectSource, /buildModuleDifficultyUrl\(subject, unlockMode\)/);
assert.match(subjectSource, /"Modules Locked", "Complete the Pre-Test first to unlock Modules\."/);
assert.match(subjectSource, /"Pre-Test Already Taken", "You already took the pre-test\."/);
assert.match(subjectSource, /function hasCompletedPretest\(\) \{\s*return getStepStatus\(\)\.pretestDone;/);
assert.doesNotMatch(subjectSource, /const initialProgressLoad = loadProgress/);
assert.match(difficultySource, /resolveModuleDifficultyRoute\(window\.location\.search\)/);
assert.match(difficultySource, /if \(routeError\) return;/);
assert.match(dashboardSource, /buildModuleDifficultyUrl\(subject\)/);
assert.match(levelsSource, /buildModuleDifficultyUrl\(subject\)/);
assert.match(levelsSource, /buildModuleLessonUrl\(subject, difficulty, `module\$\{level\}`\)/);
assert.match(moduleSource, /buildModuleLevelsUrl\(subject, difficulty\)/);
assert.doesNotMatch(levelsSource + moduleSource, /params\.get\("subject"\) \|\| "electrical"/);

for (const subject of ["hardware", "electrical"]) {
  for (const difficulty of ["easy", "medium", "hard"]) {
    const other = subject === "hardware" ? "electrical" : "hardware";
    const ownKey = `${subject}_${difficulty}_modules_done`;
    assert.notEqual(ownKey, `${other}_${difficulty}_modules_done`);
  }
}

console.log("Module routing and gating tests passed (15 checks).");
