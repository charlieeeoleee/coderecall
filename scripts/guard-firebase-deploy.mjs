import { readFileSync } from "node:fs";

const APPROVED_PROJECTS = Object.freeze({
  production: "gamifiedlearningsystem",
  preview: "coderecall-preview"
});

function readArgument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length).trim() || "";
}

function fail(message) {
  console.error(`Firebase deployment blocked: ${message}`);
  process.exit(2);
}

const environment = readArgument("environment");
const projectId = readArgument("project");
const expectedProjectId = APPROVED_PROJECTS[environment];

if (!expectedProjectId) {
  fail("environment must be the fixed preview or production target.");
}

if (projectId !== expectedProjectId) {
  fail("the requested project does not match the approved environment target.");
}

if (APPROVED_PROJECTS.preview === APPROVED_PROJECTS.production) {
  fail("Preview and Production project targets must differ.");
}

const firebaseRc = JSON.parse(readFileSync(".firebaserc", "utf8"));
const aliases = firebaseRc.projects || {};
if (Object.hasOwn(aliases, "default")) {
  fail("the unsafe default Firebase project alias is present.");
}
if (aliases.production !== APPROVED_PROJECTS.production) {
  fail("the Production alias does not match the approved Production project.");
}
if (aliases.preview !== APPROVED_PROJECTS.preview) {
  fail("the Preview alias does not match the approved Preview project.");
}

if (environment === "production") {
  const confirmation = String(
    process.env.CODE_RECALL_CONFIRM_PRODUCTION_FIREBASE || ""
  ).trim();
  if (confirmation !== APPROVED_PROJECTS.production) {
    fail(
      "set CODE_RECALL_CONFIRM_PRODUCTION_FIREBASE to the approved Production project ID for this command only."
    );
  }
}

console.log(`Firebase ${environment} deployment guard passed for the approved explicit target.`);
