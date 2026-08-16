import { spawnSync } from "node:child_process";

const requiredSteps = [
  ["frontend stability", "node", ["scripts/run-frontend-stability-tests.mjs"]],
  ["error experience", "node", ["scripts/run-error-experience-tests.mjs"]],
  ["shared module state", "node", ["scripts/run-shared-module-state-tests.mjs"]],
  ["Hardware Easy Module 1 gallery", "node", ["scripts/run-hardware-module1-gallery-tests.mjs"]],
  ["Hardware Easy Module 2 gallery", "node", ["scripts/run-hardware-module2-gallery-tests.mjs"]],
  ["Hardware Easy Module 3 content", "node", ["scripts/run-hardware-module3-content-tests.mjs"]],
  ["Hardware Medium Module 1 content", "node", ["scripts/run-hardware-medium-module1-content-tests.mjs"]],
  ["Hardware Medium Module 2 content", "node", ["scripts/run-hardware-medium-module2-content-tests.mjs"]],
  ["subject routing", "node", ["scripts/run-subject-routing-tests.mjs"]],
  ["module routing", "node", ["scripts/run-module-routing-tests.mjs"]],
  ["assessment state", "node", ["scripts/run-assessment-state-tests.mjs"]],
  ["progression consistency", "node", ["scripts/run-progression-consistency-tests.mjs"]],
  ["assessment contract", "node", ["scripts/run-assessment-contract-tests.mjs"]],
  ["Firebase environments", "node", ["scripts/run-firebase-environment-tests.mjs"]],
  ["Vercel API contract", "node", ["scripts/verify-vercel-api-contract.mjs"]],
  ["API and gamification units", "node", ["scripts/run-api-unit-tests.mjs"]],
  ["release safety", "node", ["scripts/verify-release-safety.mjs"]],
  ["secret audit", "node", ["scripts/audit-secrets.mjs"]],
  ["diff integrity", "git", ["diff", "--check"]]
];

const canRunRealGamification = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
  && process.env.FIREBASE_ADMIN_PROJECT_ID === "coderecall-preview"
  && process.env.CODE_RECALL_FIREBASE_PROJECT_ID === "coderecall-preview";

if (canRunRealGamification) {
  requiredSteps.splice(9, 0, [
    "real Firestore gamification",
    "node",
    ["scripts/run-gamification-firestore-emulator-tests.mjs"]
  ]);
} else {
  console.log("Real Firestore gamification: SKIPPED (requires the loopback emulator plus explicit coderecall-preview client/admin project identity). ");
}

for (const [name, command, args] of requiredSteps) {
  console.log(`\n===== ${name} =====`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error(`Stability gate failed at: ${name}`);
    process.exit(result.status || 1);
  }
}

console.log("\nCodeRecall stability gate passed.");
