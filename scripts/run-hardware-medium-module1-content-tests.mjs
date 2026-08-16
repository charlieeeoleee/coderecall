import assert from "node:assert/strict";
import fs from "node:fs";
import {
  HARDWARE_MEDIUM_MODULE1_CATEGORIES,
  HARDWARE_MEDIUM_MODULE1_CONTENT,
  HARDWARE_MEDIUM_MODULE1_LESSON
} from "../data/hardware-medium-module1-content.js";

let checks = 0;
function check(value, message) {
  assert.ok(value, message);
  checks += 1;
}

const expectedUnits = [
  "Unit 1: Core Motherboard Components",
  "Unit 2: Processor Sockets & Cooling",
  "Unit 3: Memory Hierarchy (RAM, ROM, Cache)",
  "Unit 4: Firmware & Software Interface",
  "Unit 5: Form Factors & Standards",
  "Unit 6: Legacy vs. Modern Connectivity"
];
check(HARDWARE_MEDIUM_MODULE1_LESSON.sections.length === 6, "Medium Module 1 must expose six authoritative units");
check(HARDWARE_MEDIUM_MODULE1_LESSON.sections.map((item) => item.heading).join("|") === expectedUnits.join("|"), "Six units must preserve PDF order and identity");
check(HARDWARE_MEDIUM_MODULE1_LESSON.introduction.includes("integrates your quiz data"), "Unusual authoritative introduction wording must be preserved");
check(HARDWARE_MEDIUM_MODULE1_LESSON.sections[0].rules.some((item) => item.includes('"Traffic Controller"')), "Authoritative chipset wording must be preserved");
check(HARDWARE_MEDIUM_MODULE1_LESSON.sections[2].rules.some((item) => item.includes("A temporary warehouse for data")), "Authoritative RAM wording must be preserved");
check(HARDWARE_MEDIUM_MODULE1_LESSON.sections[5].rules.some((item) => item.startsWith("Old Motherboards:")), "Authoritative Old Motherboards wording must be preserved");

const expectedCounts = new Map([
  ["core-motherboard-components", 9],
  ["processor-sockets-cooling", 4]
]);
check(HARDWARE_MEDIUM_MODULE1_CATEGORIES.length === 2, "Medium Module 1 must expose exactly two source-supported figure groups");
check(HARDWARE_MEDIUM_MODULE1_CONTENT.length === 13, "Medium Module 1 must expose exactly 13 authoritative figures");
check(new Set(HARDWARE_MEDIUM_MODULE1_CONTENT.map((item) => item.semanticId)).size === 13, "All Medium Module 1 semantic IDs must be unique");
check(new Set(HARDWARE_MEDIUM_MODULE1_CONTENT.map((item) => item.image)).size === 13, "All Medium Module 1 image mappings must be unique");
for (const category of HARDWARE_MEDIUM_MODULE1_CATEGORIES) {
  const records = HARDWARE_MEDIUM_MODULE1_CONTENT.filter((item) => item.categoryId === category.categoryId);
  check(records.length === expectedCounts.get(category.categoryId), `${category.categoryLabel} must preserve its approved count`);
  check(records.every((item) => item.categoryLabel === category.categoryLabel), `${category.categoryLabel} records must preserve their group label`);
}

const expectedMappings = [
  ["motherboard-overview", "Complete Motherboard", "image-03.png"],
  ["cpu-socket", "CPU Socket", "image-05.png"],
  ["chipset-northbridge-southbridge", "Chipset Diagram", "image-11.png"],
  ["ram-slots", "RAM Slots", "image-13.png"],
  ["expansion-slots", "Expansion Slots", "image-06.png"],
  ["sata-interface", "SATA Interface", "image-12.png"],
  ["vrm", "VRM", "image-02.png"],
  ["jumpers-dip-switches", "Jumpers / DIP Switches", "image-09.png"],
  ["cmos-battery", "CMOS Battery", "image-07.png"],
  ["lga", "LGA", "image-10.png"],
  ["pga", "PGA", "image-08.png"],
  ["bga", "BGA", "image-04.png"],
  ["cpu-fan-heatsink", "CPU Fan / Heatsink", "image-01.png"]
];
for (const [index, expected] of expectedMappings.entries()) {
  const item = HARDWARE_MEDIUM_MODULE1_CONTENT[index];
  const [semanticId, title, file] = expected;
  check(item.semanticId === semanticId, `${semanticId} must remain in approved PDF order`);
  check(item.title === title, `${semanticId} must preserve its approved title`);
  check(item.image.endsWith(file), `${semanticId} must use approved ${file}`);
  check(fs.existsSync(new URL(`../${item.image}`, import.meta.url)), `${semanticId} asset must exist`);
  check(item.videoUrl === null, `${semanticId} must not expose an invented video`);
  check(Boolean(item.alt && item.description && item.pdfPage && item.provenanceNote), `${semanticId} must contain complete semantic metadata`);
}
check(HARDWARE_MEDIUM_MODULE1_CONTENT.find((item) => item.semanticId === "chipset-northbridge-southbridge")?.detailMode === "readable-figure", "Chipset Diagram must use readable detail mode");

const moduleSource = fs.readFileSync(new URL("./module.js", import.meta.url), "utf8");
check((moduleSource.match(/\.\.\/data\/hardware-medium-module1-content\.js/g) || []).length === 1, "Runtime must import the Medium Module 1 model exactly once");
check(moduleSource.includes('subject === "hardware" && difficulty === "medium" && moduleKey === "module1"'), "Semantic model must be isolated to the exact Medium Module 1 route");
check(moduleSource.includes("authoritativeLesson: HARDWARE_MEDIUM_MODULE1_LESSON"), "Runtime must consume the authoritative lesson model");
check(moduleSource.includes("renderAuthoritativeHardwareMediumModuleOneGallery"), "Runtime must use the categorized authoritative gallery");
check(moduleSource.includes('const HARDWARE_MEDIUM_MODULE1_HERO_IDS = [\n  "motherboard-overview",\n  "cpu-socket",\n  "chipset-northbridge-southbridge"'), "Hero must preserve the approved semantic sequence");
check(moduleSource.includes("applySemanticHero(hero, HARDWARE_MEDIUM_MODULE1_CONTENT, HARDWARE_MEDIUM_MODULE1_HERO_IDS)"), "Hero must resolve through semantic records");
check(moduleSource.includes('heading.textContent = "Motherboard Form Factors"'), "Visible form-factor heading must use the approved learner-facing title");
check(moduleSource.includes("Supplemental repository image supporting the PDF's form-factor lesson; not an extracted PDF figure."), "Internal form-factor provenance must remain explicit");
check(moduleSource.includes("function getMotherboardFormFactorModalProfile(card)"), "Form factors must use a structured adapter for the existing modal");
check(moduleSource.includes('class="module-form-factor-panel module-form-factor-enlarge"'), "All form-factor media panels must be native enlarge controls");
check(moduleSource.includes('control.addEventListener("click", () => openModuleImageModal(getMotherboardFormFactorModalProfile(card)))'), "Form factors must reuse the certified modal architecture");
check((moduleSource.match(/semanticId: "form-factor-/g) || []).length === 4, "Exactly four form-factor semantic controls must remain configured");
check(moduleSource.indexOf('title: "ATX"') < moduleSource.indexOf('title: "E-ATX"') && moduleSource.indexOf('title: "E-ATX"') < moduleSource.indexOf('title: "Micro-ATX"') && moduleSource.indexOf('title: "Micro-ATX"') < moduleSource.indexOf('title: "Mini-ITX"'), "Form-factor order must remain ATX, E-ATX, Micro-ATX, Mini-ITX");
check(!moduleSource.includes("function openFormFactorModal"), "No duplicate form-factor modal implementation may be introduced");
check(moduleSource.includes('prompt: "Match each motherboard part to its purpose."'), "Existing matching activity must remain intact");
check(moduleSource.includes('title: "Motherboard Map Challenge"'), "Existing Motherboard Map Challenge must remain intact");
check(moduleSource.includes('question: "Which motherboard part holds the processor?"'), "Existing Quick Check must remain intact");
check(moduleSource.includes("const MODULE_XP_REWARD = 5;"), "Module checkpoint reward must remain 5 XP");
check(moduleSource.includes("const QUICK_CHECK_XP_PER_CORRECT = 1;"), "Quick Check reward must remain 1 XP per correct answer");
check(!moduleSource.includes('HARDWARE_MEDIUM_MODULE1_HERO_IDS = [\n  "image-'), "Hero must not duplicate asset paths");

console.log(`Hardware Medium Module 1 content tests passed (${checks} checks).`);
