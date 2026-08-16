import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const emulatorHost = String(process.env.FIRESTORE_EMULATOR_HOST || "").trim();
if (!emulatorHost) {
  throw new Error("REFUSING TO RUN: FIRESTORE_EMULATOR_HOST is required; production Firestore must never be targeted.");
}
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(emulatorHost)) {
  throw new Error(`REFUSING TO RUN: FIRESTORE_EMULATOR_HOST must be loopback, received ${emulatorHost}.`);
}

console.log("REAL FIRESTORE EMULATOR QR TRANSACTION VALIDATION");
console.log(`FIRESTORE_EMULATOR_HOST=${emulatorHost}`);

const require = createRequire(import.meta.url);
const projectId = `coderecall-qr-emulator-${process.pid}`;
const app = initializeApp({ projectId }, `qr-emulator-${process.pid}`);
const realDb = getFirestore(app);
const createdRefs = new Map();
let tokenMintCount = 0;
let transactionCalls = 0;
let transactionCallbackInvocations = 0;
let passed = 0;

function check(value, message) {
  assert.ok(value, message);
  passed += 1;
}

async function rejectsCode(fn, code) {
  await assert.rejects(fn, (error) => error?.code === code);
  passed += 1;
}

const db = {
  collection(name) {
    const collection = realDb.collection(name);
    return {
      doc(id) {
        const ref = collection.doc(id);
        if (name === "qrLoginRequests") createdRefs.set(ref.path, ref);
        return ref;
      }
    };
  },
  runTransaction(callback) {
    transactionCalls += 1;
    return realDb.runTransaction(async (transaction) => {
      transactionCallbackInvocations += 1;
      return callback(transaction);
    });
  }
};

const adminHelperPath = require.resolve("../api/_lib/firebase-admin.js");
require.cache[adminHelperPath] = {
  id: adminHelperPath,
  filename: adminHelperPath,
  loaded: true,
  exports: {
    FieldValue,
    adminDb: () => db,
    adminAuth: () => ({
      async createCustomToken(uid) {
        tokenMintCount += 1;
        const refs = [...createdRefs.values()];
        const exchanging = await Promise.all(refs.map((ref) => ref.get()));
        const active = exchanging.map((snap) => snap.data()).find((data) => data?.status === "exchanging" && data?.approvedUid === uid);
        assert.ok(active?.used, "Exchange must be reserved and non-reusable before token minting.");
        await new Promise((resolve) => setTimeout(resolve, 60));
        return `emulator-only-custom-token-${tokenMintCount}`;
      }
    })
  }
};

const {
  approveQrLoginRequest,
  cancelQrLoginRequest,
  createQrLoginRequest,
  denyQrLoginRequest,
  exchangeQrLoginRequest,
  matchQrLoginRequest
} = require("../api/_lib/qr-login.js");

const learnerA = { uid: "emulator-learner-a", token: { email: "a@example.test", email_verified: true, name: "A" }, role: "" };
const learnerB = { uid: "emulator-learner-b", token: { email: "b@example.test", email_verified: true, name: "B" }, role: "" };
const payload = (request, extra = {}) => ({ requestId: request.requestId, secret: request.secret, ...extra });
const ref = (request) => realDb.collection("qrLoginRequests").doc(request.requestId);
const read = async (request) => (await ref(request).get()).data();
const create = () => createQrLoginRequest({
  requestId: crypto.randomUUID(),
  endpoint: "/emulator/create",
  protocolVersion: 2,
  userAgent: "Mozilla/5.0 (Windows NT 10.0) AppleWebKit Chrome/124.0"
});
const match = (request, learner = learnerA, code = request.matchingCode) => matchQrLoginRequest({
  uid: learner.uid,
  role: learner.role,
  payload: payload(request, { matchingCode: code }),
  context: { requestId: crypto.randomUUID(), endpoint: "/emulator/match" }
});
const approve = (request, learner = learnerA) => approveQrLoginRequest({
  uid: learner.uid,
  token: learner.token,
  role: learner.role,
  payload: payload(request),
  context: { requestId: crypto.randomUUID(), endpoint: "/emulator/approve" }
});
const cancel = (request) => cancelQrLoginRequest({
  payload: { requestId: request.requestId, cancelCapability: request.cancelCapability },
  context: { requestId: crypto.randomUUID(), endpoint: "/emulator/cancel" }
});
const deny = (request, learner = learnerA) => denyQrLoginRequest({
  uid: learner.uid,
  role: learner.role,
  payload: payload(request),
  context: { requestId: crypto.randomUUID(), endpoint: "/emulator/deny" }
});

try {
  const concurrentMatch = await create();
  const matchResults = await Promise.allSettled(Array.from({ length: 8 }, () => match(concurrentMatch)));
  check(matchResults.filter((result) => result.status === "fulfilled").length === 1, "Only one concurrent matching transition may succeed.");
  check((await read(concurrentMatch)).status === "matching_verified", "Concurrent matching must finish in matching_verified.");
  await rejectsCode(() => match(concurrentMatch), "conflict");

  const approveCancel = await create();
  await match(approveCancel);
  const approveCancelResults = await Promise.allSettled([approve(approveCancel), cancel(approveCancel)]);
  check(approveCancelResults.filter((result) => result.status === "fulfilled").length === 1, "Approve versus cancel must have exactly one winner.");
  const approveCancelState = (await read(approveCancel)).status;
  check(["approved", "cancelled"].includes(approveCancelState), "Approve/cancel final state must be valid.");
  if (approveCancelState === "approved") await rejectsCode(() => cancel(approveCancel), "conflict");
  else await rejectsCode(() => approve(approveCancel), "conflict");

  const approveDeny = await create();
  await match(approveDeny);
  const approveDenyResults = await Promise.allSettled([approve(approveDeny), deny(approveDeny)]);
  check(approveDenyResults.filter((result) => result.status === "fulfilled").length === 1, "Approve versus deny must have exactly one winner.");
  const approveDenyState = (await read(approveDeny)).status;
  check(["approved", "denied"].includes(approveDenyState), "Approve/deny final state must be valid.");
  if (approveDenyState === "approved") await rejectsCode(() => deny(approveDeny), "conflict");
  else await rejectsCode(() => approve(approveDeny), "conflict");

  const doubleApproval = await create();
  await match(doubleApproval, learnerA);
  const approvalResults = await Promise.allSettled([approve(doubleApproval, learnerA), approve(doubleApproval, learnerB)]);
  check(approvalResults.filter((result) => result.status === "fulfilled").length === 1, "Double approval must have one winner.");
  check((await read(doubleApproval)).approvedUid === learnerA.uid, "Second account must not overwrite approved UID.");

  const exchange = await create();
  await match(exchange);
  await approve(exchange);
  const exchangeResults = await Promise.allSettled([
    exchangeQrLoginRequest({ payload: payload(exchange) }),
    exchangeQrLoginRequest({ payload: payload(exchange) })
  ]);
  check(exchangeResults.filter((result) => result.status === "fulfilled" && result.value.approved).length === 1, "Only one exchange claimant may receive a token.");
  const successfulExchange = exchangeResults.find((result) => result.status === "fulfilled" && result.value.approved)?.value;
  check(successfulExchange?.status === "exchanged" && successfulExchange?.terminal === true && Boolean(successfulExchange?.customToken), "Winning exchange must return exactly one consumable terminal response.");
  check(tokenMintCount === 1, "Concurrent exchange must cross the token-mint boundary once.");
  const exchangedData = await read(exchange);
  check(exchangedData.status === "exchanged" && exchangedData.used === true, "Exchange must remain terminal and non-reusable.");
  await rejectsCode(() => exchangeQrLoginRequest({ payload: payload(exchange) }), "conflict");

  const cancelPending = await create();
  await cancel(cancelPending);
  check((await read(cancelPending)).status === "cancelled", "Pending request must cancel.");
  const cancelMatched = await create();
  await match(cancelMatched);
  await cancel(cancelMatched);
  check((await read(cancelMatched)).status === "cancelled", "Matched request must cancel.");

  const denyPending = await create();
  await deny(denyPending);
  check((await read(denyPending)).status === "denied", "Pending request must deny.");
  const denyMatched = await create();
  await match(denyMatched);
  await deny(denyMatched);
  check((await read(denyMatched)).status === "denied", "Matched request must deny.");

  const wrongMatch = await create();
  const wrongCode = wrongMatch.matchingCode === "999" ? "998" : "999";
  await rejectsCode(() => match(wrongMatch, learnerA, wrongCode), "matching_failed");
  const wrongMatchData = await read(wrongMatch);
  check(wrongMatchData.status === "denied" && wrongMatchData.terminalReason === "matching_failed", "Wrong matching code must terminally deny with a safe reason.");
  await rejectsCode(() => match(wrongMatch), "conflict");

  const overallExpired = await create();
  await ref(overallExpired).set({ expiresAtMs: Date.now() - 1 }, { merge: true });
  await rejectsCode(() => match(overallExpired), "conflict");
  check((await read(overallExpired)).status === "expired", "Overall expiry must become terminal.");
  await rejectsCode(() => approve(overallExpired), "conflict");

  const matchExpired = await create();
  await match(matchExpired);
  await ref(matchExpired).set({ matchingExpiresAtMs: Date.now() - 1 }, { merge: true });
  await rejectsCode(() => approve(matchExpired), "conflict");
  check((await read(matchExpired)).status === "expired", "Matching timeout must become terminal.");

  const sameUid = await create();
  await match(sameUid, learnerA);
  await rejectsCode(() => approve(sameUid, learnerB), "permission_denied");
  await approve(sameUid, learnerA);
  check((await read(sameUid)).approvedUid === learnerA.uid, "Matched learner must approve while another learner cannot.");

  for (const status of ["denied", "cancelled", "expired", "exchanged", "exchange_failed"]) {
    const terminal = await create();
    await ref(terminal).set({ status, used: ["exchanged", "exchange_failed"].includes(status) }, { merge: true });
    await rejectsCode(() => match(terminal), "conflict");
    await rejectsCode(() => approve(terminal), "conflict");
    check((await read(terminal)).status === status, `${status} must not be reopened.`);
  }

  const retriesObserved = transactionCallbackInvocations - transactionCalls;
  check(transactionCalls > 0, "Production helpers must execute real Firestore transactions.");
  console.log(JSON.stringify({
    status: "ok",
    engine: "REAL_FIRESTORE_EMULATOR",
    emulatorHost,
    projectId,
    passed,
    tokenMintCount,
    transactionCalls,
    transactionCallbackInvocations,
    retriesObserved
  }, null, 2));
} finally {
  const deletions = [...createdRefs.values()].map((documentRef) => documentRef.delete().catch(() => {}));
  await Promise.all(deletions);
  await deleteApp(app);
}
