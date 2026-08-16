import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
let checks = 0;

function check(value, message) {
  assert.ok(value, message);
  checks += 1;
}

const [notFoundHtml, moduleHtml, bootstrap, moduleSource, vercelSource] = await Promise.all([
  read("404.html"),
  read("module.html"),
  read("scripts/module-bootstrap.js"),
  read("scripts/module.js"),
  read("vercel.json")
]);
const vercel = JSON.parse(vercelSource);

check(/class="error-code"[^>]*>\s*404\s*</i.test(notFoundHtml), "404 page must identify the HTTP status");
check(/Page Not Found/i.test(notFoundHtml), "404 page must explain the failure");
check(/href="\/"/.test(notFoundHtml), "404 page must offer a home action");
check(/href="\/dashboard"/.test(notFoundHtml), "404 page must offer a dashboard action");
check(!/location\.(?:href|replace|assign)|http-equiv=["']refresh/i.test(notFoundHtml), "404 page must not redirect automatically");
check(!/<script/i.test(notFoundHtml), "404 page must remain static and script-free");

check(vercel.cleanUrls === true, "clean URLs must remain enabled");
check(vercel.rewrites?.some((entry) => entry.source === "/api/(.*)" && entry.destination === "/api/404"), "unknown API paths must use the JSON fallback");

const api404 = require("../api/404.js");
const responseHeaders = {};
let responseBody = "";
const response = {
  statusCode: 0,
  setHeader(name, value) { responseHeaders[name.toLowerCase()] = value; },
  end(value) { responseBody = value; }
};
api404({}, response);
const apiPayload = JSON.parse(responseBody);
check(response.statusCode === 404, "API fallback must return HTTP 404");
check(responseHeaders["content-type"] === "application/json; charset=utf-8", "API fallback must return JSON");
check(responseHeaders["cache-control"] === "no-store", "API fallback must not be cached");
check(apiPayload.code === "not_found" && apiPayload.ok === false, "API fallback must return a sanitized not-found payload");
check(!/(stack|token|credential|secret)/i.test(responseBody), "API fallback must not expose sensitive diagnostics");

check(moduleHtml.includes('id="moduleFailureState"'), "module page must include a static failure state");
check(moduleHtml.includes('id="moduleFailureRetry"'), "module failure state must offer retry");
check(moduleHtml.includes('id="moduleFailureBackLink"'), "module failure state must offer a safe back action");
check(moduleHtml.indexOf("scripts/module-bootstrap.js") < moduleHtml.indexOf("scripts/firebase-config.runtime.js"), "module failure bootstrap must load before fallible runtime scripts");
check(moduleHtml.includes('id="firebaseRuntimeConfig"') && moduleHtml.includes('id="moduleRuntimeScript"'), "critical module scripts must be identifiable to the failure bootstrap");

check(!bootstrap.includes("innerHTML"), "module failure UI must not inject HTML");
check(bootstrap.includes("URLSearchParams") && bootstrap.includes("new URLSearchParams({ subject, difficulty })"), "module back URL must be safely constructed");
check(bootstrap.includes('["hardware", "electrical"].includes(subject)'), "module back URL must allowlist subjects");
check(bootstrap.includes('["easy", "medium", "hard"].includes(difficulty)'), "module back URL must allowlist difficulties");
check(bootstrap.includes('window.location.reload()'), "retry must reload the current lesson");
check(bootstrap.includes('coderecall:module-invalid') && bootstrap.includes('coderecall:module-failed'), "module bootstrap must distinguish invalid and load-failure events");

check(/if \(!data\) \{\s*window\.dispatchEvent\(new CustomEvent\("coderecall:module-invalid"\)\);\s*return;/m.test(moduleSource), "missing module data must render the invalid state");
check(!moduleSource.includes("Module content coming soon"), "missing module data must not fabricate lesson content");
check(moduleSource.includes('new CustomEvent("coderecall:module-ready")') && moduleSource.includes('new CustomEvent("coderecall:module-failed")'), "module runtime must signal success and failure");

console.log(`Error experience contract passed (${checks} checks).`);
