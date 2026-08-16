import assert from "node:assert/strict";
import fs from "node:fs";
import {
  HARDWARE_EASY_MODULE3_CONTENT,
  HARDWARE_EASY_MODULE3_LESSON
} from "../data/hardware-easy-module3-content.js";

let checks = 0;
function check(value, message) {
  assert.ok(value, message);
  checks += 1;
}

const expectedSections = new Map([
  ["Safety Lab Procedures", 6],
  ["Do’s", 10],
  ["Dont’s", 9],
  ["Electrical Safety", 4],
  ["Chemical Safety", 4],
  ["Fire Safety", 3],
  ["Personal safety", 2],
  ["Hazardous signs that you should be aware of:", 0]
]);

check(HARDWARE_EASY_MODULE3_LESSON.sections.length === 8, "Module 3 must expose all eight authoritative lesson sections");
for (const section of HARDWARE_EASY_MODULE3_LESSON.sections) {
  check(expectedSections.has(section.heading), `${section.heading} must be an approved authoritative heading`);
  check(section.rules.length === expectedSections.get(section.heading), `${section.heading} must preserve its approved rule count`);
}
check(HARDWARE_EASY_MODULE3_LESSON.sections.at(-1)?.heading.endsWith(":"), "Hazardous-sign heading must preserve its colon");
check(HARDWARE_EASY_MODULE3_LESSON.sections[2]?.heading === "Dont’s", "The authoritative Dont’s spelling must be preserved");
check(HARDWARE_EASY_MODULE3_LESSON.sections[1]?.rules.includes("Keep away any liquids away from sockets"), "Unusual authoritative socket wording must be preserved");
check(HARDWARE_EASY_MODULE3_LESSON.sections[0]?.rules.includes("Avoid living the workplace area unattended"), "Unusual authoritative unattended-workplace wording must be preserved");

check(HARDWARE_EASY_MODULE3_CONTENT.length === 4, "Module 3 must expose exactly four instructional figures");
check(new Set(HARDWARE_EASY_MODULE3_CONTENT.map((item) => item.semanticId)).size === 4, "Every Module 3 semantic ID must be unique");
check(new Set(HARDWARE_EASY_MODULE3_CONTENT.map((item) => item.image)).size === 4, "Every Module 3 figure asset must be unique");
check(HARDWARE_EASY_MODULE3_CONTENT.map((item) => item.image.split("/").at(-1)).join(",") === "image-03.png,image-01.png,image-02.png,image-04.png", "Figures must follow authoritative PDF order");
check(HARDWARE_EASY_MODULE3_CONTENT.map((item) => item.title).join("|") === "Laboratory Safety Rules|Safety Clothing and Hazard Icons|Complete PPE|Hazardous Signs", "Figure titles must follow the approved semantic order");
for (const item of HARDWARE_EASY_MODULE3_CONTENT) {
  check(fs.existsSync(new URL(`../${item.image}`, import.meta.url)), `${item.semanticId} asset must exist`);
  check(item.videoUrl === null, `${item.semanticId} must not expose an invented video URL`);
  check(!("categoryId" in item) && !("categoryLabel" in item), `${item.semanticId} must not introduce an artificial category`);
  check(Boolean(item.alt && item.description && item.title && item.pdfPage && item.provenanceNote), `${item.semanticId} must contain complete instructional metadata`);
  check(item.detailMode === "readable-figure", `${item.semanticId} must opt into readable figure detail mode`);
}
check(HARDWARE_EASY_MODULE3_CONTENT.find((item) => item.semanticId === "ohs-hazardous-signs")?.image.endsWith("image-04.png"), "Hazardous Signs must retain approved image-04");

const moduleSource = fs.readFileSync(new URL("./module.js", import.meta.url), "utf8");
const moduleStyles = fs.readFileSync(new URL("../styles/module.css", import.meta.url), "utf8");
check((moduleSource.match(/\.\.\/data\/hardware-easy-module3-content\.js/g) || []).length === 1, "Active runtime must import the exact Module 3 semantic-content path once");
check(moduleSource.includes('subject === "hardware" && difficulty === "easy" && moduleKey === "module3"'), "Module 3 must activate only on its exact route");
check(moduleSource.includes("authoritativeLesson: HARDWARE_EASY_MODULE3_LESSON"), "Module 3 must consume the authoritative structured lesson");
check(moduleSource.includes("renderAuthoritativeHardwareModuleThreeGallery"), "Module 3 must use its noncategorized figure renderer");
check(moduleSource.includes('const HARDWARE_EASY_MODULE3_HERO_IDS = [\n  "ohs-laboratory-safety-rules",\n  "ohs-complete-ppe",\n  "ohs-hazardous-signs"'), "Module 3 hero must preserve the approved semantic sequence");
check(moduleSource.includes("applySemanticHero(hero, HARDWARE_EASY_MODULE3_CONTENT, HARDWARE_EASY_MODULE3_HERO_IDS)"), "Module 3 hero must resolve through semantic records");
check(moduleSource.includes('const HARDWARE_EASY_MODULE1_HERO_IDS = [\n  "main-system-unit",\n  "input-keyboard",\n  "output-monitor"'), "Certified Module 1 hero must remain unchanged");
check(moduleSource.includes('const HARDWARE_EASY_MODULE2_HERO_IDS = [\n  "ppe-safety-goggles",\n  "esd-anti-static-wrist-trap",\n  "cleaning-compressed-air"'), "Certified Module 2 hero must remain unchanged");
check(moduleSource.includes('title: "OHS Habit Check"'), "Existing Module 3 challenge must remain configured");
check(moduleSource.includes('question: "Which is a correct OHS practice?"'), "Existing Module 3 Quick Check must remain configured");
check(moduleSource.includes("const MODULE_XP_REWARD = 5;"), "Module checkpoint reward must remain 5 XP");
check(moduleSource.includes("const QUICK_CHECK_XP_PER_CORRECT = 1;"), "Quick Check reward must remain 1 XP per correct answer");
check(!moduleSource.includes('HARDWARE_EASY_MODULE3_CATEGORIES'), "Module 3 must not be forced into artificial categories");
check(moduleStyles.includes('.module-gallery-figures {\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));'), "Module 3 figure gallery must use a dedicated two-column desktop layout");
check(moduleStyles.includes('@media (max-width: 520px) {\n  .module-gallery-figures {\n    grid-template-columns: 1fr;'), "Module 3 figure gallery must collapse to one column on narrow screens");
check(moduleStyles.includes('.module-gallery-figures .authoritative-image-card .module-figure-media'), "Module 3 must have an isolated larger media viewport");
check(moduleStyles.includes('object-fit: contain;'), "Instructional figures must retain contained image fitting");
check(moduleSource.includes('card.addEventListener("click", () => openModuleImageModal(image))'), "Module 3 cards must retain the certified semantic modal integration");
check(moduleSource.includes('profile.detailMode === "readable-figure"'), "Modal mode must be selected by semantic data rather than filenames");
check(moduleSource.includes('modal.classList.toggle("readable-figure", usesReadableFigureMode)'), "Readable mode must remain isolated from standard image records");
check(moduleSource.includes('zoomInBtn?.addEventListener("click"'), "Zoom In must use a native button handler");
check(moduleSource.includes('zoomOutBtn?.addEventListener("click"'), "Zoom Out must use a native button handler");
check(moduleSource.includes('zoomResetBtn?.addEventListener("click"'), "Fit must use a native button handler");
const moduleMarkup = fs.readFileSync(new URL("../module.html", import.meta.url), "utf8");
check(moduleMarkup.includes('id="moduleImageModalZoomIn" aria-label="Zoom in"'), "Zoom In must be an accessible button");
check(moduleMarkup.includes('id="moduleImageModalZoomOut" aria-label="Zoom out"'), "Zoom Out must be an accessible button");
check(moduleMarkup.includes('id="moduleImageModalZoomReset" aria-label="Reset image to fit"'), "Fit must be an accessible button");
check(!moduleSource.includes("panzoom") && !moduleSource.includes("zoom.js"), "Readable mode must not introduce a third-party zoom dependency");

console.log(`Hardware Easy Module 3 content tests passed (${checks} checks).`);
