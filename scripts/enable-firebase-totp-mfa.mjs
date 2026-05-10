import { readFile } from "node:fs/promises";
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function readArg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : "";
}

function showUsageAndExit() {
  console.error(`
Usage:
  node scripts/enable-firebase-totp-mfa.mjs --project=gamifiedlearningsystem

Options:
  --project=<id>             Firebase project id. Defaults to FIREBASE_PROJECT_ID.
  --adjacent-intervals=<n>   Accepted adjacent TOTP windows, 0-10. Defaults to 5.

Auth:
  Set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON path, set
  FIREBASE_SERVICE_ACCOUNT to the full service-account JSON string, or use
  Application Default Credentials for the Firebase project.

  Firebase CLI login alone is not enough for the Admin SDK in this environment.
`);
  process.exit(1);
}

async function getCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const raw = await readFile(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8");
    return cert(JSON.parse(raw));
  }

  return applicationDefault();
}

function readAdjacentIntervals() {
  const raw = readArg("adjacent-intervals") || process.env.FIREBASE_TOTP_ADJACENT_INTERVALS || "5";
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 10) {
    throw new Error("--adjacent-intervals must be an integer from 0 to 10.");
  }
  return value;
}

async function main() {
  const projectId = readArg("project") || process.env.FIREBASE_PROJECT_ID;
  if (!projectId) showUsageAndExit();

  const adjacentIntervals = readAdjacentIntervals();
  initializeApp({
    credential: await getCredential(),
    projectId
  });

  await getAuth().projectConfigManager().updateProjectConfig({
    multiFactorConfig: {
      providerConfigs: [
        {
          state: "ENABLED",
          totpProviderConfig: {
            adjacentIntervals
          }
        }
      ]
    }
  });

  console.log(JSON.stringify({
    projectId,
    totpMfa: "ENABLED",
    adjacentIntervals
  }, null, 2));
}

main().catch((error) => {
  console.error("Unable to enable Firebase TOTP MFA.");
  console.error(error?.message || error);
  process.exit(1);
});
