import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const adminPath = require.resolve("../api/_lib/firebase-admin.js");
const documents = new Map();
let tokenMintCount = 0;
let transactionQueue = Promise.resolve();

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function refFor(collection, id) {
  const key = `${collection}/${id}`;
  return {
    key,
    async get() {
      const data = documents.get(key);
      return { exists: Boolean(data), data: () => clone(data) };
    },
    async set(value, options = {}) {
      documents.set(key, options.merge ? { ...(documents.get(key) || {}), ...clone(value) } : clone(value));
    }
  };
}

const fakeDb = {
  collection(name) {
    return { doc: (id) => refFor(name, id) };
  },
  runTransaction(callback) {
    const run = transactionQueue.then(async () => {
      const writes = [];
      const transaction = {
        get: (ref) => ref.get(),
        set: (ref, value, options) => writes.push({ ref, value, options })
      };
      const result = await callback(transaction);
      for (const write of writes) await write.ref.set(write.value, write.options);
      return result;
    });
    transactionQueue = run.catch(() => {});
    return run;
  }
};

require.cache[adminPath] = {
  id: adminPath,
  filename: adminPath,
  loaded: true,
  exports: {
    adminAuth: () => ({
      async createCustomToken(uid) {
        tokenMintCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return `test-custom-token-${uid}-${tokenMintCount}`;
      }
    }),
    adminDb: () => fakeDb,
    FieldValue: { serverTimestamp: () => "server-timestamp" }
  }
};

const logs = [];
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;
console.log = (...args) => logs.push(args.join(" "));
console.warn = (...args) => logs.push(args.join(" "));
console.error = (...args) => logs.push(args.join(" "));

const {
  approveQrLoginRequest,
  createQrLoginRequest,
  exchangeQrLoginRequest,
  hashQrSecret,
  qrSecretMatches
} = require("../api/_lib/qr-login.js");

function expectCode(code) {
  return (error) => error?.code === code;
}

const created = await createQrLoginRequest({ requestId: "test-create", endpoint: "/create" });
const createdDoc = documents.get(`qrLoginRequests/${created.requestId}`);
assert.equal(createdDoc.status, "pending");
assert.equal(createdDoc.used, false);
assert.equal(qrSecretMatches(createdDoc.secretHash, created.secret), true);
assert.equal(qrSecretMatches(hashQrSecret(created.secret), "wrong-secret-value-that-is-long"), false);

await assert.rejects(
  () => approveQrLoginRequest({ uid: "user-a", token: {}, payload: { requestId: created.requestId, secret: "wrong-secret-value-that-is-long" } }),
  expectCode("permission_denied")
);

const expired = await createQrLoginRequest();
documents.get(`qrLoginRequests/${expired.requestId}`).expiresAtMs = Date.now() - 1;
await assert.rejects(
  () => approveQrLoginRequest({ uid: "user-a", token: {}, payload: expired }),
  expectCode("conflict")
);
assert.equal(documents.get(`qrLoginRequests/${expired.requestId}`).status, "expired");

await approveQrLoginRequest({ uid: "user-a", token: { email: "a@example.test" }, payload: created });
assert.equal(documents.get(`qrLoginRequests/${created.requestId}`).approvedUid, "user-a");
await assert.rejects(
  () => approveQrLoginRequest({ uid: "user-b", token: { email: "b@example.test" }, payload: created }),
  expectCode("conflict")
);
assert.equal(documents.get(`qrLoginRequests/${created.requestId}`).approvedUid, "user-a");

const pending = await createQrLoginRequest();
assert.deepEqual(await exchangeQrLoginRequest({ payload: pending }), { approved: false });

const concurrent = await Promise.allSettled([
  exchangeQrLoginRequest({ payload: created }),
  exchangeQrLoginRequest({ payload: created })
]);
assert.equal(concurrent.filter((item) => item.status === "fulfilled").length, 1);
assert.equal(concurrent.filter((item) => item.status === "rejected" && item.reason?.code === "conflict").length, 1);
assert.equal(tokenMintCount, 1, "Concurrent exchange must mint exactly one custom token.");
assert.equal(documents.get(`qrLoginRequests/${created.requestId}`).status, "exchanged");
await assert.rejects(() => exchangeQrLoginRequest({ payload: created }), expectCode("conflict"));

await assert.rejects(
  () => approveQrLoginRequest({ uid: "admin-a", token: {}, role: "admin", payload: pending }),
  expectCode("permission_denied")
);
assert.equal(documents.get(`qrLoginRequests/${pending.requestId}`).status, "pending");

const frontend = readFileSync("scripts/qr-approve.js", "utf8");
assert.match(frontend, /history\.replaceState/);
assert.match(frontend, /searchParams\.delete\("secret"\)/);
assert.doesNotMatch(frontend, /(localStorage|sessionStorage)\.setItem\([^\n]*(secret|requestId)/i);

const combinedLogs = logs.join("\n");
assert.ok(!combinedLogs.includes(created.secret), "Raw QR secret appeared in logs.");
assert.ok(!combinedLogs.includes(createdDoc.secretHash), "QR secret hash appeared in logs.");
assert.ok(!combinedLogs.includes("test-custom-token"), "Firebase custom token appeared in logs.");

console.log = originalLog;
console.warn = originalWarn;
console.error = originalError;
originalLog(JSON.stringify({ status: "ok", passed: 12, tokenMintCount }, null, 2));
