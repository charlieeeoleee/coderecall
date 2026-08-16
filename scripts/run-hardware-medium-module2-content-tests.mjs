import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import {
  HARDWARE_MEDIUM_MODULE2_CONTENT,
  HARDWARE_MEDIUM_MODULE2_HERO_IDS,
  HARDWARE_MEDIUM_MODULE2_LESSON
} from "../data/hardware-medium-module2-content.js";

let checks = 0;
function check(value, message) {
  assert.ok(value, message);
  checks += 1;
}

const expectedSections = [
  "Preparation and Safety Protocols",
  "Disassembly Procedures",
  "Assembly and Component Installation",
  "Post-Assembly Testing and Troubleshooting"
];

check(HARDWARE_MEDIUM_MODULE2_LESSON.sourceTitle === "Basic Computer Configuration Setup", "Lesson must use the approved normalized title");
check(HARDWARE_MEDIUM_MODULE2_LESSON.titleStatus.includes("does not present a standalone title heading"), "Title provenance must remain explicit internally");
check(HARDWARE_MEDIUM_MODULE2_LESSON.sections.length === 4, "Lesson must contain four authoritative sections");
check(HARDWARE_MEDIUM_MODULE2_LESSON.sections.map((item) => item.heading).join("|") === expectedSections.join("|"), "Sections must preserve exact PDF order");
check(HARDWARE_MEDIUM_MODULE2_LESSON.sections.every(Object.isFrozen), "Every lesson section must be immutable");
check(HARDWARE_MEDIUM_MODULE2_LESSON.sections.every((item) => Object.isFrozen(item.rules)), "Every procedural list must be immutable");

const lessonText = HARDWARE_MEDIUM_MODULE2_LESSON.sections.flatMap((item) => item.rules).join("\n");
for (const phrase of [
  "large, level, well-lit, and well-ventilated",
  "carpeted floors",
  "Phillips-head screwdriver",
  "Flat-head screwdriver",
  "Anti-static wrist strap",
  "Needle-nose pliers",
  "15–30 minutes",
  "motherboard should generally be the final component",
  "labeled containers",
  "standoffs",
  "thermal paste",
  "DDR modules are not compatible with DDR2 or DDR3 sockets",
  "power-switch and LED connectors",
  "Power-On Self-Test (POST)",
  "single beep typically means all clear",
  "siren-like sound",
  "cannot find an operating system"
]) {
  check(lessonText.includes(phrase), `Authoritative detail must retain: ${phrase}`);
}

check(HARDWARE_MEDIUM_MODULE2_CONTENT.length === 4, "Exactly four approved figures must be rendered");
check(new Set(HARDWARE_MEDIUM_MODULE2_CONTENT.map((item) => item.semanticId)).size === 4, "Figure semantic IDs must be unique");
check(HARDWARE_MEDIUM_MODULE2_CONTENT.filter((item) => item.provenanceType === "pdf-derived").length === 1, "Exactly one figure must be PDF-derived");
check(HARDWARE_MEDIUM_MODULE2_CONTENT.filter((item) => item.image.endsWith("image-01.png")).length === 1, "The authoritative image must be used once");
const authoritativeFigure = fs.readFileSync(new URL("../assets/modules/hardware/medium/module2/image-01.png", import.meta.url));
check(crypto.createHash("sha256").update(authoritativeFigure).digest("hex") === "ecf821f2274a295adeb2f67c86527f18aaa8ca1eb4a120afadc569cab83bca19", "The certified PDF-derived figure must remain byte-for-byte unchanged");
check(!HARDWARE_MEDIUM_MODULE2_CONTENT.some((item) => item.image.endsWith("config-02-workspace.png")), "Duplicate workspace PNG must not be rendered");
check(HARDWARE_MEDIUM_MODULE2_CONTENT.some((item) => item.image.endsWith("assembly-component-installation.jpg") && item.sourceTitle === "Motherboard-come-si-monta.jpg"), "Assembly must use the approved photograph");
check(HARDWARE_MEDIUM_MODULE2_CONTENT.some((item) => item.image.endsWith("internal-computer-configuration.jpg") && item.sourceTitle === "Ensemble PC.jpg"), "Internal configuration must use the approved photograph");
check(HARDWARE_MEDIUM_MODULE2_CONTENT.some((item) => item.image.endsWith("post-diagnostics-troubleshooting.jpg") && item.sourceTitle === "BIOS POST card for PCI, PCIe and LPC bus.jpg"), "POST diagnostics must use the approved photograph");
check(HARDWARE_MEDIUM_MODULE2_CONTENT.filter((item) => item.provenanceType === "supplemental-open-license").length === 3, "Exactly three photographs must be open-license supplements");
check(HARDWARE_MEDIUM_MODULE2_CONTENT.filter((item) => item.provenanceType === "supplemental-open-license").every((item) => item.sourceUrl?.startsWith("https://commons.wikimedia.org/wiki/File:") && item.creator && item.license === "CC0 1.0 Universal Public Domain Dedication" && item.licenseUrl === "https://creativecommons.org/publicdomain/zero/1.0/"), "Every external photograph must retain source, creator, and license metadata");
check(!HARDWARE_MEDIUM_MODULE2_CONTENT.some((item) => item.image.endsWith("config-03-assembly.svg")), "Old assembly SVG must not render on this route");
check(!HARDWARE_MEDIUM_MODULE2_CONTENT.some((item) => item.image.endsWith("config-04-testing.svg")), "Old testing SVG must not render on this route");
check(!HARDWARE_MEDIUM_MODULE2_CONTENT.some((item) => item.image.endsWith("config-04-testing.png")), "Incorrect testing PNG must not be used");
check(HARDWARE_MEDIUM_MODULE2_CONTENT.every((item) => item.detailMode === "standard"), "All Module 2 figures must use standard modal mode");
check(HARDWARE_MEDIUM_MODULE2_CONTENT.every((item) => item.videoUrl === null), "No unsupported videos may be exposed");
check(HARDWARE_MEDIUM_MODULE2_CONTENT.every((item) => item.alt && item.description && item.provenanceNote), "Every figure must have complete semantic metadata");
for (const item of HARDWARE_MEDIUM_MODULE2_CONTENT) {
  check(fs.existsSync(new URL(`../${item.image}`, import.meta.url)), `${item.semanticId} asset must exist`);
}

const expectedHero = [
  "preparation-safety-protocols",
  "assembly-component-installation",
  "post-diagnostics-troubleshooting"
];
check(HARDWARE_MEDIUM_MODULE2_HERO_IDS.join("|") === expectedHero.join("|"), "Hero must preserve approved semantic order");
check(Object.isFrozen(HARDWARE_MEDIUM_MODULE2_LESSON), "Lesson model must be immutable");
check(Object.isFrozen(HARDWARE_MEDIUM_MODULE2_CONTENT), "Figure model must be immutable");
check(Object.isFrozen(HARDWARE_MEDIUM_MODULE2_HERO_IDS), "Hero model must be immutable");

const moduleSource = fs.readFileSync(new URL("./module.js", import.meta.url), "utf8");
check((moduleSource.match(/\.\.\/data\/hardware-medium-module2-content\.js/g) || []).length === 1, "Runtime must import the model exactly once");
check((moduleSource.match(/subject === "hardware" && difficulty === "medium" && moduleKey === "module2"/g) || []).length >= 3, "Data, hero, and gallery must use exact route isolation");
check(moduleSource.includes("authoritativeLesson: HARDWARE_MEDIUM_MODULE2_LESSON"), "Runtime must consume the authoritative lesson model");
check(moduleSource.includes("applySemanticHero(hero, HARDWARE_MEDIUM_MODULE2_CONTENT, HARDWARE_MEDIUM_MODULE2_HERO_IDS)"), "Hero must resolve through semantic records");
check(moduleSource.includes("renderAuthoritativeHardwareMediumModuleTwoGallery"), "Route must use its focused figure renderer");
check(moduleSource.includes("card.addEventListener(\"click\", () => openModuleImageModal(image))"), "Figures must reuse the shared modal");
check(!moduleSource.includes("function openHardwareMediumModuleTwoModal"), "No duplicate modal may be introduced");
check(moduleSource.includes("function getMatchingActivity(data, lessonDetails = {})"), "Generic three-pair matching path must remain available");
check(!moduleSource.includes('"Basic Computer Configuration Setup": {\n      prompt: "Sort'), "Module 2 must not gain a drag/drop preset");

const quickCheckStart = moduleSource.indexOf('"Basic Computer Configuration Setup": [');
const quickCheckEnd = moduleSource.indexOf('"Preventive Maintenance": [', quickCheckStart);
const quickCheckSource = moduleSource.slice(quickCheckStart, quickCheckEnd);
check(quickCheckStart >= 0 && quickCheckEnd > quickCheckStart, "Module 2 Quick Check contract must be locatable");
check((quickCheckSource.match(/question:/g) || []).length === 3, "Module 2 Quick Check must remain three questions");
check(moduleSource.includes("const QUICK_CHECK_XP_PER_CORRECT = 1;"), "Quick Check must remain 1 XP per correct answer");
check(moduleSource.includes("const MODULE_XP_REWARD = 5;"), "Checkpoint must remain 5 XP");
check(3 * 1 === 3, "Maximum fresh Quick Check reward must remain 3 XP");
check(3 + 5 === 8, "Maximum fresh Module 2 reward must remain 8 XP");

const matchingStart = moduleSource.indexOf("function renderMatchingActivity");
const matchingEnd = moduleSource.indexOf("function getDragDropActivity", matchingStart);
const matchingSource = moduleSource.slice(matchingStart, matchingEnd);
check(!matchingSource.includes("awardQuickCheckXP") && !matchingSource.includes("awardModuleXPOnce"), "Matching must remain a zero-XP progress gate");

const moduleStyles = fs.readFileSync(new URL("../styles/module.css", import.meta.url), "utf8");
check(/\.module-gallery-figures\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s.test(moduleStyles), "Four figures must use the existing two-column desktop grid");
check(/\.authoritative-image-card \.module-figure-media img\s*\{[^}]*object-fit:\s*contain;/s.test(moduleStyles), "Figure photographs must remain contained without destructive cropping");
check(/@media \(max-width: 520px\)[\s\S]*?\.module-gallery-figures\s*\{[^}]*grid-template-columns:\s*1fr;/s.test(moduleStyles), "Figure gallery must stack to one column on narrow screens");

console.log(`Hardware Medium Module 2 content tests passed (${checks} checks).`);
