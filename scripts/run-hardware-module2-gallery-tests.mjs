import assert from "node:assert/strict";
import fs from "node:fs";
import {
  HARDWARE_EASY_MODULE2_CATEGORIES,
  HARDWARE_EASY_MODULE2_CONTENT
} from "../data/hardware-easy-module2-content.js";

let checks = 0;
function check(value, message) {
  assert.ok(value, message);
  checks += 1;
}

const expectedCounts = new Map([
  ["personal-protective-equipment", 9],
  ["esd-tools", 4],
  ["cleaning-tools", 4]
]);

check(HARDWARE_EASY_MODULE2_CATEGORIES.length === 3, "Module 2 must expose three authoritative categories");
check(HARDWARE_EASY_MODULE2_CONTENT.length === 17, "Module 2 must expose exactly 17 instructional entries");
check(new Set(HARDWARE_EASY_MODULE2_CONTENT.map((item) => item.semanticId)).size === 17, "Every Module 2 semantic ID must be unique");
check(new Set(HARDWARE_EASY_MODULE2_CONTENT.map((item) => item.image)).size === 17, "Every Module 2 asset path must be unique");

for (const category of HARDWARE_EASY_MODULE2_CATEGORIES) {
  const records = HARDWARE_EASY_MODULE2_CONTENT.filter((item) => item.categoryId === category.categoryId);
  check(records.length === expectedCounts.get(category.categoryId), `${category.categoryLabel} must have its approved entry count`);
  check(records.every((item) => item.categoryLabel === category.categoryLabel), `${category.categoryLabel} records must use the approved label`);
}

for (const item of HARDWARE_EASY_MODULE2_CONTENT) {
  check(fs.existsSync(new URL(`../${item.image}`, import.meta.url)), `${item.semanticId} asset must exist`);
  check(item.videoUrl === null, `${item.semanticId} must not expose an unapproved video URL`);
  check(Boolean(item.alt && item.description && item.title && item.pdfPage), `${item.semanticId} must contain complete instructional metadata`);
}

const byId = new Map(HARDWARE_EASY_MODULE2_CONTENT.map((item) => [item.semanticId, item]));
check(byId.get("ppe-dust-mask")?.image.endsWith("image-01.png"), "Dust Mask must use approved image-01");
check(byId.get("ppe-dust-mask")?.alt.includes("full-face respirator"), "Dust Mask alt text must describe both pictured respirators");
check(byId.get("esd-anti-static-wrist-trap")?.image.endsWith("image-03.png"), "Anti-Static Wrist Trap must use approved image-03");
check(byId.get("esd-anti-static-wrist-trap")?.title === "Anti-Static Wrist Trap", "The authoritative Wrist Trap wording must be preserved");
check(byId.get("esd-anti-static-gloves")?.image.endsWith("image-09.png"), "Anti-Static Gloves must use approved image-09");
check(byId.get("cleaning-lint-free-cloth")?.image.endsWith("image-02.png"), "Lint Free Cloth must use approved image-02");
check(HARDWARE_EASY_MODULE2_CONTENT.filter((item) => item.categoryId === "cleaning-tools").length === 4, "Cleaning Tools must contain four entries");

const moduleSource = fs.readFileSync(new URL("./module.js", import.meta.url), "utf8");
check((moduleSource.match(/\.\.\/data\/hardware-easy-module2-content\.js/g) || []).length === 1, "Active runtime must import the exact Module 2 semantic-content path once");
check(moduleSource.includes('moduleKey === "module2"'), "Active runtime must include a Module 2 route branch");
check(moduleSource.includes("renderAuthoritativeHardwareModuleTwoGallery"), "Module 2 must use the authoritative categorized renderer");
check(moduleSource.includes('const HARDWARE_EASY_MODULE2_HERO_IDS = [\n  "ppe-safety-goggles",\n  "esd-anti-static-wrist-trap",\n  "cleaning-compressed-air"'), "Module 2 hero must preserve the approved semantic sequence");
check(moduleSource.includes('subject === "hardware" && difficulty === "easy" && moduleKey === "module2"'), "Module 2 hero must activate only for the exact Hardware Easy Module 2 route");
check(moduleSource.includes("applySemanticHero(hero, HARDWARE_EASY_MODULE2_CONTENT, HARDWARE_EASY_MODULE2_HERO_IDS)"), "Module 2 hero must resolve images from authoritative semantic records");
check(!moduleSource.includes('HARDWARE_EASY_MODULE2_HERO_IDS = [\n  "image-'), "Module 2 hero must not duplicate hardcoded asset paths");
check(moduleSource.includes('const HARDWARE_EASY_MODULE1_HERO_IDS = [\n  "main-system-unit",\n  "input-keyboard",\n  "output-monitor"'), "Certified Module 1 hero order must remain unchanged");
check(moduleSource.includes('hero.classList.toggle("module-hero-media-contain", isHardwareEasyModuleTwo)'), "Module 2 must reuse the certified contained hero layout");
check(moduleSource.includes("openModuleImageModal(image)"), "Cards and modal must consume the same semantic record");
check(moduleSource.includes('loading="lazy" decoding="async"'), "Authoritative gallery images must use lazy async loading");
check(moduleSource.includes('"Safety Tools": {'), "Existing Safety Tools lesson/activity configuration must remain present");
check(moduleSource.includes('{ label: "Dust mask", zone: "technician" }'), "Existing Module 2 drag/drop activity must remain present");
check(moduleSource.includes('question: "Which item helps prevent electrostatic discharge while handling components?"'), "Existing Module 2 Quick Check must remain present");
check(moduleSource.includes("const MODULE_XP_REWARD = 5;"), "Module checkpoint reward must remain 5 XP");
check(moduleSource.includes("const QUICK_CHECK_XP_PER_CORRECT = 1;"), "Quick Check reward must remain 1 XP per correct answer");
check(moduleSource.includes("function getNextModuleUrl()"), "Existing next-module progression contract must remain present");

console.log(`Hardware Easy Module 2 gallery tests passed (${checks} checks).`);
