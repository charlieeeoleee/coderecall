import assert from "node:assert/strict";
import fs from "node:fs";
import {
  HARDWARE_EASY_MODULE1_CATEGORIES,
  HARDWARE_EASY_MODULE1_CONTENT
} from "../data/hardware-easy-module1-content.js";

let checks = 0;
function check(value, message) {
  assert.ok(value, message);
  checks += 1;
}

const expectedCounts = new Map([
  ["main-computer-parts", 6],
  ["internal-parts", 18],
  ["ports", 10],
  ["input-devices", 7],
  ["output-devices", 6]
]);

check(HARDWARE_EASY_MODULE1_CATEGORIES.length === 5, "Module 1 must expose five authoritative categories");
check(HARDWARE_EASY_MODULE1_CONTENT.length === 47, "Module 1 must expose exactly 47 instructional entries");

const semanticIds = HARDWARE_EASY_MODULE1_CONTENT.map((item) => item.semanticId);
const assetPaths = HARDWARE_EASY_MODULE1_CONTENT.map((item) => item.image);
check(new Set(semanticIds).size === 47, "Every Module 1 semantic ID must be unique");
check(new Set(assetPaths).size === 47, "Every approved Module 1 asset must be represented exactly once");

for (const category of HARDWARE_EASY_MODULE1_CATEGORIES) {
  const actual = HARDWARE_EASY_MODULE1_CONTENT.filter((item) => item.categoryId === category.categoryId);
  check(actual.length === expectedCounts.get(category.categoryId), `${category.categoryLabel} must have its approved entry count`);
  check(actual.every((item) => item.categoryLabel === category.categoryLabel), `${category.categoryLabel} records must use the approved label`);
}

for (const item of HARDWARE_EASY_MODULE1_CONTENT) {
  check(fs.existsSync(new URL(`../${item.image}`, import.meta.url)), `${item.semanticId} asset must exist`);
  check(item.videoUrl === null, `${item.semanticId} must not expose an unapproved video URL`);
  check(Boolean(item.alt && item.description && item.title), `${item.semanticId} must have accessible and instructional content`);
}

const byId = new Map(HARDWARE_EASY_MODULE1_CONTENT.map((item) => [item.semanticId, item]));
check(byId.get("main-system-unit")?.image.endsWith("image-11.png"), "Module 1 hero must source the approved System unit asset");
check(byId.get("input-keyboard")?.image.endsWith("image-25.png"), "Module 1 hero must source the approved Keyboard asset");
check(byId.get("output-monitor")?.image.endsWith("image-34.png"), "Module 1 hero must source the approved Monitor asset");
check(byId.get("internal-rom")?.title === "ROM", "ROM must retain the authoritative PDF title");
check(byId.get("internal-rom")?.image.endsWith("image-26.png"), "ROM must use approved image-26");
check(byId.get("internal-rom")?.alt.includes("hard disk drive"), "ROM alt text must honestly describe the pictured HDD hardware");
check(byId.get("internal-expansion-slots")?.image.endsWith("image-04.png"), "Expansion Slots must use approved image-04");
check(byId.get("internal-expansion-bus")?.image.endsWith("image-30.png"), "Expansion Bus must use approved image-30");
check(byId.get("internal-bios-chip")?.image.endsWith("image-35.png"), "BIOS Chip must use approved image-35");
check(byId.get("internal-cmos")?.image.endsWith("image-46.png"), "CMOS must use approved image-46");
check(byId.get("output-headphones")?.image.endsWith("image-22.png"), "Headphones must use approved image-22");
check(byId.get("port-ide")?.description.endsWith("used to"), "IDE description must retain the source truncation");

const moduleSource = fs.readFileSync(new URL("./module.js", import.meta.url), "utf8");
const moduleHtml = fs.readFileSync(new URL("../module.html", import.meta.url), "utf8");
const moduleCss = fs.readFileSync(new URL("../styles/module.css", import.meta.url), "utf8");
check(moduleSource.includes("renderAuthoritativeHardwareModuleOneGallery"), "Active module runtime must use the authoritative renderer");
check(moduleSource.includes('const HARDWARE_EASY_MODULE1_HERO_IDS = [\n  "main-system-unit",\n  "input-keyboard",\n  "output-monitor"'), "Module 1 hero must use the approved semantic sequence");
check(moduleSource.includes('hero.classList.toggle("module-hero-media-contain", isHardwareEasyModuleOne)'), "Contained hero styling must be scoped to Hardware Easy Module 1");
check(moduleSource.includes("configureModuleHero();"), "Module bootstrap must configure the route-specific hero");
check((moduleSource.match(/\.\.\/data\/hardware-easy-module1-content\.js/g) || []).length === 1, "Active runtime must import the exact physical semantic-content path once");
check(moduleSource.includes("openModuleImageModal(image)"), "Authoritative cards must reuse the existing image modal");
check(moduleSource.includes('loading="lazy" decoding="async"'), "Authoritative gallery images must use lazy async loading");
check(moduleSource.includes("profile.categoryLabel || \"Image Detail\""), "Modal must display the authoritative category");
check(moduleHtml.includes('id="moduleImageModalVideo"'), "Existing modal must be ready for optional validated video links");
check(!moduleHtml.includes('id="moduleSubject">Electrical</span>'), "Loading shell must not claim Electrical before module bootstrap");
check(moduleHtml.includes('hardware: "Computer Hardware"'), "Loading shell must reflect a valid Hardware route before module imports finish");
check(moduleCss.includes("grid-template-columns: repeat(5, minmax(0, 1fr))"), "Wide gallery must target five columns");
check(moduleCss.includes("@media (max-width: 430px)"), "Gallery must include a narrow mobile layout");
check(moduleSource.includes('class="module-figure-media"'), "Authoritative cards must have a dedicated media wrapper");
check(moduleSource.includes('class="module-figure-caption"'), "Authoritative cards must have a body separate from the media wrapper");
check(moduleSource.indexOf('class="module-figure-zoom"') > moduleSource.indexOf('class="module-figure-media"'), "Enlarge control must remain inside the card media wrapper");
check(moduleCss.includes(".authoritative-image-card {\n  display: flex;\n  height: 100%;"), "Authoritative cards must use a uniform column-height contract");
check(moduleCss.includes("overflow: hidden;\n  padding: 10px;"), "Card media must contain images without overflow");
check(moduleCss.includes("object-fit: contain;"), "Instructional images must use intentional non-cropping containment");
check(moduleCss.includes("object-position: center;"), "Instructional images must stay centered in their viewport");
check(moduleCss.includes(".module-hero-media.module-hero-media-contain img"), "Module 1 hero containment must use a route-specific class");
check(moduleCss.includes("pointer-events: none;\n  box-shadow:"), "Enlarge label must remain an anchored non-competing control");
check(!/image-\d+\.png[^}]*\{/.test(moduleCss), "Gallery CSS must not contain per-image layout hacks");

console.log(`Hardware Easy Module 1 gallery tests passed (${checks} checks).`);
