import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  FIREBASE_PUBLIC_ENV_NAMES,
  buildFirebaseRuntimeConfiguration,
  resolveDeploymentEnvironment
} from "./firebase-environment-contract.mjs";
import { resolveBrowserFirestoreEmulator } from "./firestore-emulator-routing.mjs";

const require = createRequire(import.meta.url);
const { ApiError } = require("../api/_lib/http.js");
const { assertFirebaseAdminRuntimeSafety } = require("../api/_lib/firebase-admin.js");

const publicConfig = Object.fromEntries(
  FIREBASE_PUBLIC_ENV_NAMES.map((name) => [name, `test-${name.toLowerCase()}`])
);
publicConfig.CODE_RECALL_FIREBASE_PROJECT_ID = "coderecall-isolated-test";

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

function withProcessEnv(overrides, fn) {
  const names = new Set([...Object.keys(overrides), "VERCEL_ENV", "FIRESTORE_EMULATOR_HOST", "FIREBASE_ADMIN_PROJECT_ID", "CODE_RECALL_FIREBASE_PROJECT_ID", "CODE_RECALL_PRODUCTION_FIREBASE_PROJECT_ID"]);
  const original = Object.fromEntries([...names].map((name) => [name, process.env[name]]));
  try {
    [...names].forEach((name) => delete process.env[name]);
    Object.assign(process.env, overrides);
    return fn();
  } finally {
    [...names].forEach((name) => {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    });
  }
}

test("Production requires every explicit public Firebase value", () => {
  assert.throws(
    () => buildFirebaseRuntimeConfiguration({ VERCEL_ENV: "production" }),
    /Missing required Firebase public configuration/
  );
});

test("Preview cannot fall back when its public config is absent", () => {
  assert.throws(
    () => buildFirebaseRuntimeConfiguration({ VERCEL_ENV: "preview" }),
    /Missing required Firebase public configuration/
  );
});

test("Preview requires a Production project identity for isolation comparison", () => {
  assert.throws(
    () => buildFirebaseRuntimeConfiguration({ VERCEL_ENV: "preview", ...publicConfig }),
    /CODE_RECALL_PRODUCTION_FIREBASE_PROJECT_ID/
  );
});

test("Preview rejects the Production Firebase project", () => {
  assert.throws(
    () => buildFirebaseRuntimeConfiguration({
      VERCEL_ENV: "preview",
      ...publicConfig,
      CODE_RECALL_PRODUCTION_FIREBASE_PROJECT_ID: publicConfig.CODE_RECALL_FIREBASE_PROJECT_ID
    }),
    /must not use the Production project/
  );
});

test("Preview accepts an explicitly isolated Firebase project", () => {
  const result = buildFirebaseRuntimeConfiguration({
    VERCEL_ENV: "preview",
    ...publicConfig,
    CODE_RECALL_PRODUCTION_FIREBASE_PROJECT_ID: "coderecall-production-test"
  });
  assert.equal(result.environment, "preview");
  assert.equal(result.config.projectId, "coderecall-isolated-test");
});

test("Production does not consume Preview-specific variable names", () => {
  const result = buildFirebaseRuntimeConfiguration({
    VERCEL_ENV: "production",
    ...publicConfig,
    CODE_RECALL_PRODUCTION_FIREBASE_PROJECT_ID: publicConfig.CODE_RECALL_FIREBASE_PROJECT_ID
  });
  assert.equal(result.environment, "production");
});

test("Production rejects a non-Production Firebase project", () => {
  assert.throws(
    () => buildFirebaseRuntimeConfiguration({
      VERCEL_ENV: "production",
      ...publicConfig,
      CODE_RECALL_PRODUCTION_FIREBASE_PROJECT_ID: "coderecall-production-test"
    }),
    /does not match the Production project contract/
  );
});

test("Development remains explicit and emulator-compatible", () => {
  const result = buildFirebaseRuntimeConfiguration({ ...publicConfig });
  assert.equal(resolveDeploymentEnvironment({}), "development");
  assert.equal(result.environment, "development");
});

test("Development localhost routes browser Firestore to loopback emulator", () => {
  assert.deepEqual(resolveBrowserFirestoreEmulator({
    environment: "development",
    protocol: "http:",
    hostname: "localhost",
    port: "3000"
  }), { enabled: true, host: "127.0.0.1", port: 18080 });
});

test("Development loopback IP routes browser Firestore to loopback emulator", () => {
  assert.deepEqual(resolveBrowserFirestoreEmulator({
    environment: "development",
    protocol: "http:",
    hostname: "127.0.0.1",
    port: "3000"
  }), { enabled: true, host: "127.0.0.1", port: 18080 });
});

test("Development private LAN origin routes browser Firestore to the same PC host", () => {
  assert.deepEqual(resolveBrowserFirestoreEmulator({
    environment: "development",
    protocol: "http:",
    hostname: "192.168.40.25",
    port: "3000"
  }), { enabled: true, host: "192.168.40.25", port: 18080 });
});

test("Development wrong web port is rejected without remote fallback", () => {
  assert.throws(() => resolveBrowserFirestoreEmulator({
    environment: "development",
    protocol: "http:",
    hostname: "localhost",
    port: "3001"
  }), /approved local HTTP origin/);
});

test("Development public hostname is rejected without remote fallback", () => {
  assert.throws(() => resolveBrowserFirestoreEmulator({
    environment: "development",
    protocol: "http:",
    hostname: "development.example.com",
    port: "3000"
  }), /origin is not approved/);
});

test("Development public IPv4 address is rejected without remote fallback", () => {
  assert.throws(() => resolveBrowserFirestoreEmulator({
    environment: "development",
    protocol: "http:",
    hostname: "8.8.8.8",
    port: "3000"
  }), /origin is not approved/);
});

test("Preview browser Firestore emulator routing is forbidden", () => {
  assert.deepEqual(resolveBrowserFirestoreEmulator({
    environment: "preview",
    protocol: "http:",
    hostname: "localhost",
    port: "3000"
  }), { enabled: false });
});

test("Production browser Firestore emulator routing is forbidden", () => {
  assert.deepEqual(resolveBrowserFirestoreEmulator({
    environment: "production",
    protocol: "http:",
    hostname: "localhost",
    port: "3000"
  }), { enabled: false });
});

test("Browser emulator initialization is centralized before application Firestore use", () => {
  const firebaseSource = readFileSync("scripts/firebase-config.js", "utf8");
  const authSource = readFileSync("scripts/auth.js", "utf8");
  const initializeIndex = firebaseSource.indexOf("export const db = initializeCodeRecallFirestore()");
  const connectIndex = firebaseSource.indexOf("connectFirestoreEmulator(firestore");
  const appCheckIndex = firebaseSource.indexOf("initializeCodeRecallAppCheck();");

  assert.ok(initializeIndex > 0);
  assert.ok(connectIndex > initializeIndex);
  assert.ok(appCheckIndex > connectIndex);
  assert.match(authSource, /^import \{ app \} from "\.\/firebase-config\.js";/);
  assert.ok(authSource.indexOf("getFirestore(app)") > authSource.indexOf("firebase-config.js"));
});

test("Generated public config contains no Firebase Admin fields", () => {
  const result = buildFirebaseRuntimeConfiguration({ ...publicConfig });
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /FIREBASE_ADMIN|private[_-]?key|client[_-]?email/i);
});

test("Production Firebase Admin refuses a Firestore emulator", () => {
  withProcessEnv({ VERCEL_ENV: "production", FIRESTORE_EMULATOR_HOST: "127.0.0.1:18080" }, () => {
    assert.throws(assertFirebaseAdminRuntimeSafety, (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 503);
      return true;
    });
  });
});

test("Production Firebase Admin requires matching client, server, and Production projects", () => {
  withProcessEnv({
    VERCEL_ENV: "production",
    FIREBASE_ADMIN_PROJECT_ID: "coderecall-production-test",
    CODE_RECALL_FIREBASE_PROJECT_ID: "coderecall-isolated-test",
    CODE_RECALL_PRODUCTION_FIREBASE_PROJECT_ID: "coderecall-production-test"
  }, () => {
    assert.throws(assertFirebaseAdminRuntimeSafety, (error) => error instanceof ApiError && error.status === 503);
  });
});

test("Development Firebase Admin permits the Firestore emulator", () => {
  withProcessEnv({
    VERCEL_ENV: "development",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:18080",
    FIREBASE_ADMIN_PROJECT_ID: "coderecall-isolated-test",
    CODE_RECALL_FIREBASE_PROJECT_ID: "coderecall-isolated-test"
  }, () => {
    assert.doesNotThrow(assertFirebaseAdminRuntimeSafety);
  });
});

test("Development Firebase Admin rejects a token-project mismatch before verification", () => {
  withProcessEnv({
    VERCEL_ENV: "development",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:18080",
    FIREBASE_ADMIN_PROJECT_ID: "coderecall-production-test",
    CODE_RECALL_FIREBASE_PROJECT_ID: "coderecall-isolated-test"
  }, () => {
    assert.throws(assertFirebaseAdminRuntimeSafety, (error) => error instanceof ApiError && error.status === 503);
  });
});

test("local Vercel Dev without VERCEL_ENV still enforces Development project alignment", () => {
  withProcessEnv({
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:18080",
    FIREBASE_ADMIN_PROJECT_ID: "coderecall-production-test",
    CODE_RECALL_FIREBASE_PROJECT_ID: "coderecall-isolated-test"
  }, () => {
    assert.throws(assertFirebaseAdminRuntimeSafety, (error) => error instanceof ApiError && error.status === 503);
  });
});

test("Preview Firebase Admin rejects the Production project", () => {
  withProcessEnv({
    VERCEL_ENV: "preview",
    FIREBASE_ADMIN_PROJECT_ID: "coderecall-production-test",
    CODE_RECALL_FIREBASE_PROJECT_ID: "coderecall-production-test",
    CODE_RECALL_PRODUCTION_FIREBASE_PROJECT_ID: "coderecall-production-test"
  }, () => {
    assert.throws(assertFirebaseAdminRuntimeSafety, (error) => error instanceof ApiError && error.status === 503);
  });
});

test("Preview Firebase Admin does not fall back when credentials are absent", () => {
  withProcessEnv({
    VERCEL_ENV: "preview",
    CODE_RECALL_FIREBASE_PROJECT_ID: "coderecall-isolated-test",
    CODE_RECALL_PRODUCTION_FIREBASE_PROJECT_ID: "coderecall-production-test"
  }, () => {
    assert.throws(assertFirebaseAdminRuntimeSafety, (error) => error instanceof ApiError && error.status === 503);
  });
});

test("Preview Firebase Admin requires the same isolated client and server project", () => {
  withProcessEnv({
    VERCEL_ENV: "preview",
    FIREBASE_ADMIN_PROJECT_ID: "coderecall-other-test",
    CODE_RECALL_FIREBASE_PROJECT_ID: "coderecall-isolated-test",
    CODE_RECALL_PRODUCTION_FIREBASE_PROJECT_ID: "coderecall-production-test"
  }, () => {
    assert.throws(assertFirebaseAdminRuntimeSafety, (error) => error instanceof ApiError && error.status === 503);
  });
});

let passed = 0;
for (const item of tests) {
  await item.fn();
  passed += 1;
}

console.log(JSON.stringify({ status: "ok", passed }, null, 2));
