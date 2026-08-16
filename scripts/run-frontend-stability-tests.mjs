import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildSubjectUrl,
  resolveSubjectRoute
} from "./subject-routing.mjs";
import { buildAssessmentUrl, resolveAssessmentRoute } from "./assessment-routing.mjs";
import {
  buildModuleDifficultyUrl,
  buildModuleLessonUrl,
  buildModuleLevelsUrl,
  resolveModuleLessonRoute,
  resolveModuleLevelsRoute
} from "./module-routing.mjs";
import { hasAuthoritativeAssessmentCompletion } from "./assessment-completion.mjs";

let checks = 0;
function check(value, message) {
  assert.ok(value, message);
  checks += 1;
}

for (const subject of ["hardware", "electrical"]) {
  check(resolveSubjectRoute(`?subject=${subject}`).subject === subject, `${subject} subject URL must retain identity`);
  check(buildSubjectUrl(subject) === `/subject?subject=${subject}`, `${subject} subject URL must be canonical`);
  check(resolveAssessmentRoute(`?subject=${subject}&type=pretest`).subject === subject, `${subject} Pre-Test must retain identity`);
  check(buildAssessmentUrl(subject, "pretest") === `/quiz?subject=${subject}&type=pretest`, `${subject} Pre-Test URL must be canonical`);
  check(buildModuleDifficultyUrl(subject) === `/module-difficulty?subject=${subject}`, `${subject} module URL must retain identity`);
  check(resolveModuleLevelsRoute(`?subject=${subject}&difficulty=easy`).subject === subject, `${subject} module-level route must retain identity`);
  check(buildModuleLevelsUrl(subject, "easy") === `/module-levels?subject=${subject}&difficulty=easy`, `${subject} module-level URL must be canonical`);
  check(resolveModuleLessonRoute(`?subject=${subject}&difficulty=easy&module=module1`).subject === subject, `${subject} lesson route must retain identity`);
  check(buildModuleLessonUrl(subject, "easy", "module1") === `/module?subject=${subject}&difficulty=easy&module=module1`, `${subject} lesson URL must be canonical`);
}

for (const invalidSearch of ["", "?subject=unknown", "?subject=hardware&difficulty=unknown"]) {
  if (invalidSearch.includes("difficulty")) {
    assert.throws(() => resolveModuleLevelsRoute(invalidSearch));
  } else {
    assert.throws(() => resolveSubjectRoute(invalidSearch));
  }
  checks += 1;
}

const emptyLearner = { progress: {}, results: {} };
check(!hasAuthoritativeAssessmentCompletion(emptyLearner, "hardware", "pretest"), "Firestore Not Taken must remain Not Taken");
check(hasAuthoritativeAssessmentCompletion({ progress: { hardware_pretest: true } }, "hardware", "pretest"), "Firestore progress completion must unlock modules");
check(hasAuthoritativeAssessmentCompletion({ results: { hardware_pretest: { score: 1 } } }, "hardware", "pretest"), "Firestore result completion must block retake");

const subjectHtml = fs.readFileSync(new URL("../subject.html", import.meta.url), "utf8");
const difficultyHtml = fs.readFileSync(new URL("../module-difficulty.html", import.meta.url), "utf8");
const moduleHtml = fs.readFileSync(new URL("../module.html", import.meta.url), "utf8");
const subjectSource = fs.readFileSync(new URL("./subject.js", import.meta.url), "utf8");
const difficultySource = fs.readFileSync(new URL("./module-difficulty.js", import.meta.url), "utf8");
const levelsSource = fs.readFileSync(new URL("./module-levels.js", import.meta.url), "utf8");
const lessonSource = fs.readFileSync(new URL("./module.js", import.meta.url), "utf8");
const loadingSource = fs.readFileSync(new URL("./loading.js", import.meta.url), "utf8");

check(subjectHtml.includes("Loading subject..."), "Subject HTML must not claim Electrical before route bootstrap");
check(!/id="(?:pretestBtn|modulesBtn|quizzesBtn|posttestBtn|subjectBackBtn)"[^>]*onclick=/.test(subjectHtml), "Subject navigation must not use inline handlers");
check((subjectHtml.match(/application\/x-coderecall-legacy-disabled/g) || []).length === 1, "Subject legacy runtime must be inert");
check((difficultyHtml.match(/application\/x-coderecall-legacy-disabled/g) || []).length === 1, "Difficulty legacy runtime must be inert");
check((moduleHtml.match(/application\/x-coderecall-legacy-disabled/g) || []).length === 1, "Lesson legacy runtime must be inert");
check(subjectSource.includes('addEventListener("click", window.goBack)'), "Subject module must own Back navigation");
check(subjectSource.includes('buildAssessmentUrl(subject, "pretest")'), "Subject module must own canonical Pre-Test launch");
check(difficultySource.includes("resolveModuleDifficultyRoute(window.location.search)"), "Difficulty page must use strict route resolution");
check(levelsSource.includes("resolveModuleLevelsRoute(window.location.search)"), "Module levels must use strict route resolution");
check(lessonSource.includes("resolveModuleLessonRoute(window.location.search)"), "Lesson must use strict route resolution");
check(!/params\.get\("subject"\) \|\| "electrical"/.test(levelsSource + lessonSource), "Modules must have no silent Electrical fallback");
check(loadingSource.includes("clearDevelopmentOfflineCache"), "Development must clear prior CodeRecall caches");
check(loadingSource.includes('key.startsWith("code-recall-")'), "Development cleanup must be scoped to CodeRecall caches");
check(loadingSource.includes("registration.unregister()"), "Development must unregister the production service worker");

console.log(`Frontend stability tests passed (${checks} checks).`);
