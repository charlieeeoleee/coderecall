import assert from "node:assert/strict";
import fs from "node:fs";
import {
  createFreshMatchingSolvedSet,
  getRailTargetActivationOffset,
  getScopedLocalProgressKey,
  readScopedLocalProgress,
  resolveModuleRailLayout,
  selectActiveRailKey,
  shouldPersistMatchingCompletion,
  writeScopedLocalProgress
} from "./module-state.mjs";

let checks = 0;
function check(value, message) {
  assert.ok(value, message);
  checks += 1;
}

class MemoryStorage {
  constructor(entries = []) {
    this.values = new Map(entries);
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

const routeA = "hardware_medium_module_2_done_matching_activity_done";
const routeB = "hardware_medium_module_1_done_matching_activity_done";
const userAKey = getScopedLocalProgressKey(routeA, "learner-a");
const userBKey = getScopedLocalProgressKey(routeA, "learner-b");
const guestKey = getScopedLocalProgressKey(routeA);
check(userAKey !== userBKey, "Authenticated matching state must be isolated by UID");
check(userAKey !== guestKey && userBKey !== guestKey, "Guest matching state must use an explicit isolated namespace");
check(getScopedLocalProgressKey(routeA, "learner-a") !== getScopedLocalProgressKey(routeB, "learner-a"), "Module routes must remain isolated");

const storage = new MemoryStorage([[routeA, "true"]]);
check(readScopedLocalProgress(storage, routeA, "learner-a") === null, "Ambiguous legacy keys must not migrate into an authenticated account");
check(readScopedLocalProgress(storage, routeA) === null, "Legacy guest migration must require an explicit migration policy");
check(readScopedLocalProgress(storage, routeA, null, { migrateLegacyGuest: true }) === "true", "Existing anonymous progress must migrate into the explicit guest namespace");
check(storage.getItem(routeA) === "true", "Legacy keys must be retained rather than blindly deleted");
writeScopedLocalProgress(storage, routeA, true, "learner-a");
check(readScopedLocalProgress(storage, routeA, "learner-a") === "true", "Account A must restore its scoped durable marker");
check(readScopedLocalProgress(storage, routeA, "learner-b") === null, "Account B must not inherit Account A's marker");

const firstPractice = createFreshMatchingSolvedSet();
firstPractice.add("match-0");
const reloadedPractice = createFreshMatchingSolvedSet();
check(reloadedPractice.size === 0, "A new or reloaded matching board must start visually unanswered");
check(firstPractice !== reloadedPractice, "Partial visual matching state must not survive reload");
check(!shouldPersistMatchingCompletion(true), "Replaying completed matching must not resubmit durable progress");
check(shouldPersistMatchingCompletion(false), "First matching completion must still persist durable progress");
firstPractice.clear();
check(firstPractice.size === 0, "Reset must clear only the current visual solved set");
check(readScopedLocalProgress(storage, routeA, "learner-a") === "true", "Reset must not revoke durable matching completion");

const structuredRail = resolveModuleRailLayout({ structured: true });
check(structuredRail.notes.visible && structuredRail.notes.target === "moduleDocumentSection", "Structured Notes must target the visible learner-facing notes section");
check(structuredRail.path.visible && structuredRail.path.target === "moduleDocument", "Structured Lesson Path must target the rendered lesson-card body");
check(structuredRail.notes.target !== structuredRail.path.target, "Structured Notes and Lesson Path must have distinct meaningful targets");
const clearedStructuredRail = resolveModuleRailLayout({ structured: true, completed: true });
check(clearedStructuredRail.notes.visible && clearedStructuredRail.path.visible, "Cleared state must not disable structured Notes or Lesson Path navigation");

const legacyRail = resolveModuleRailLayout();
check(legacyRail.notes.visible && legacyRail.notes.target === "moduleDocumentSection", "Legacy Notes navigation must remain available");
check(legacyRail.path.visible && legacyRail.path.target === "moduleSectionsSection", "Legacy Lesson Path must retain its existing target");

const troubleshootingRail = resolveModuleRailLayout({ structured: true, troubleshooting: true });
check(!troubleshootingRail.notes.visible, "Troubleshooting must omit its intentionally hidden Notes target");
check(troubleshootingRail.path.visible && troubleshootingRail.path.target === "moduleSectionsSection", "Troubleshooting Lesson Path must retain its learner-facing section target");

const structuredSteps = [
  { key: "brief", documentTop: 300 },
  { key: "notes", documentTop: 700 },
  { key: "objectives", documentTop: 1900 },
  {
    key: "path",
    documentTop: 780,
    activationOffset: getRailTargetActivationOffset({ key: "path", target: "moduleDocument", viewportHeight: 800 })
  },
  { key: "challenge", documentTop: 2300 },
  { key: "continue", documentTop: 2700 }
];
check(selectActiveRailKey(structuredSteps, 250) === "brief", "Mission Brief must be active at page top");
check(selectActiveRailKey(structuredSteps, 750) === "notes", "Notes must be active near the beginning of its section");
check(selectActiveRailKey(structuredSteps, 700 + Math.round(800 * 0.32)) === "notes", "A Notes click must settle with Notes active");
check(selectActiveRailKey(structuredSteps, 1100) === "path", "Lesson Path must activate inside the structured lesson body");
check(selectActiveRailKey(structuredSteps, 780 + Math.round(800 * 0.32)) === "path", "A Lesson Path click must settle with Lesson Path active");
check(selectActiveRailKey(structuredSteps, 2000) === "objectives", "Objectives must override the earlier nested Lesson Path by document position");
check(selectActiveRailKey(structuredSteps, 2400) === "challenge", "Challenge must activate at its document position");
check(selectActiveRailKey(structuredSteps, 2800) === "continue", "Continue must activate at its document position");
check(selectActiveRailKey(structuredSteps, 720) === "notes", "Scrolling upward must restore Notes rather than leaving Lesson Path stuck");
check(selectActiveRailKey([...structuredSteps, { key: "hidden", documentTop: 2900, hidden: true }], 3000) === "continue", "Hidden rail items must never become active");
check(selectActiveRailKey(structuredSteps.map((step) => ({ ...step, done: true })), 2000) === "objectives", "Done styling must not influence the single active step");

const legacySteps = [
  { key: "brief", documentTop: 300 },
  { key: "notes", documentTop: 700 },
  { key: "objectives", documentTop: 1200 },
  { key: "path", documentTop: 1500 },
  { key: "challenge", documentTop: 1900 },
  { key: "continue", documentTop: 2200 }
];
check(selectActiveRailKey(legacySteps, 1600) === "path", "Legacy Lesson Path highlighting must follow its document position");
check(selectActiveRailKey(legacySteps, 1250) === "objectives", "Legacy upward scrolling must restore Objectives");

const troubleshootingSteps = legacySteps.filter((step) => step.key !== "notes");
check(selectActiveRailKey(troubleshootingSteps, 800) === "brief", "Troubleshooting must ignore its omitted Notes control");
check(selectActiveRailKey(troubleshootingSteps, 1600) === "path", "Troubleshooting Lesson Path must remain scroll-spy eligible");

const moduleSource = fs.readFileSync(new URL("./module.js", import.meta.url), "utf8");
const moduleHtml = fs.readFileSync(new URL("../module.html", import.meta.url), "utf8");
for (const label of ["Mission Brief", "Notes", "Objectives", "Lesson Path", "Challenge", "Continue"]) {
  check(moduleHtml.includes(`<strong>${label}</strong>`), `The shared module rail must retain ${label}`);
}
check(moduleHtml.includes('id="moduleDocumentSection"') && moduleHtml.includes('id="moduleDocument"'), "Structured Notes and Lesson Path targets must both exist in the shared DOM");
const matchingStart = moduleSource.indexOf("function renderMatchingActivity");
const matchingEnd = moduleSource.indexOf("function getDragDropActivity", matchingStart);
const matchingSource = moduleSource.slice(matchingStart, matchingEnd);
check(matchingSource.includes("createFreshMatchingSolvedSet()"), "Runtime must initialize a fresh visual matching board");
check(!matchingSource.includes("pairs.forEach((pair) => solved.add(pair.id))"), "Runtime must not reconstruct correct answers from durable completion");
check(matchingSource.includes("shouldPersistMatchingCompletion(currentModuleGateState.matchingCompleted)"), "Runtime must preserve first-completion-only persistence");
check(!matchingSource.includes("awardQuickCheckXP") && !matchingSource.includes("awardModuleXPOnce"), "Matching replay must remain zero XP");
check(moduleSource.includes("configureModuleProgressRail({"), "Runtime must configure rail targets from rendered layout");
check(moduleSource.includes("target.getBoundingClientRect().top + window.scrollY"), "Runtime must compare targets using absolute document geometry");
check(moduleSource.includes("setModuleRailActiveStep(button)"), "Rail clicks must update active feedback immediately");

const moduleStyles = fs.readFileSync(new URL("../styles/module.css", import.meta.url), "utf8");
check(/\.module-rail-step\[hidden\]\s*\{[^}]*display:\s*none;/s.test(moduleStyles), "Omitted rail controls must not appear falsely locked");

console.log(`Shared module state tests passed (${checks} checks).`);
