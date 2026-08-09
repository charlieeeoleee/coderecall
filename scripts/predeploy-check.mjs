import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: options.stdio || "pipe"
  }).trim();
}

function tryRun(command, args) {
  try {
    return run(command, args);
  } catch (error) {
    return `FAILED: ${error?.message || error}`;
  }
}

function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  mkdirSync("logs", { recursive: true });

  const report = {
    generatedAt: new Date().toISOString(),
    git: {
      branch: tryRun("git", ["branch", "--show-current"]),
      commit: tryRun("git", ["rev-parse", "HEAD"]),
      status: tryRun("git", ["status", "--short"])
    },
    firebase: {
      project: tryRun("node", ["-e", "console.log(require('./.firebaserc').projects.default)"]),
      deployVerify: tryRun("npm.cmd", ["run", "deploy:verify"]),
      releaseSafety: tryRun("npm.cmd", ["run", "release:safety-gate"]),
      secretAudit: tryRun("npm.cmd", ["run", "security:audit-secrets"])
    },
    rollbackChecklist: [
      "Create a release tag before deploy, for example: git tag vX.Y.Z && git push origin vX.Y.Z",
      "Capture Firebase Hosting release ID from Firebase Console after deployment.",
      "Rollback Hosting from Firebase Console release history if needed.",
      "Rollback Firestore Rules by checking out the prior tag and running npm run firebase:deploy:rules.",
      "Rollback Functions by checking out the prior tag and deploying the functions source after confirming plan support.",
      "Restore runtime config from the operator vault if configuration caused the incident.",
      "Run post-rollback smoke checks for landing, auth, dashboard, quiz/module, contact, rules, robots, and sitemap."
    ]
  };

  const outputPath = `logs/predeploy-${stamp}.json`;
  writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(outputPath);
}

main();
