import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const adminPath = require.resolve("../api/_lib/firebase-admin.js");
const documents = new Map();
let tokenMintCount = 0;
let transactionQueue = Promise.resolve();
let passed = 0;

function clone(value) { return value === undefined ? undefined : structuredClone(value); }
function check(value, message) { assert.ok(value, message); passed += 1; }
async function rejectsCode(fn, code) {
  let capturedError;
  await assert.rejects(fn, (error) => {
    capturedError = error;
    return error?.code === code;
  });
  passed += 1;
  return capturedError;
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
  collection(name) { return { doc: (id) => refFor(name, id) }; },
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

const capturedLogs = [];
const consoleOriginals = { log: console.log, warn: console.warn, error: console.error };
console.log = (...args) => capturedLogs.push(args.join(" "));
console.warn = (...args) => capturedLogs.push(args.join(" "));
console.error = (...args) => capturedLogs.push(args.join(" "));

const {
  approveQrLoginRequest,
  cancelQrLoginRequest,
  createQrLoginRequest,
  denyQrLoginRequest,
  exchangeQrLoginRequest,
  getQrLoginContext,
  hashQrSecret,
  hmacVerifier,
  matchQrLoginRequest
} = require("../api/_lib/qr-login.js");

const learnerA = { uid: "learner-a", token: { email: "a@example.test", email_verified: true, name: "A" }, role: "" };
const learnerB = { uid: "learner-b", token: { email: "b@example.test", email_verified: true, name: "B" }, role: "" };
const payload = (request, extra = {}) => ({ requestId: request.requestId, secret: request.secret, ...extra });
const doc = (request) => documents.get(`qrLoginRequests/${request.requestId}`);
const create = (userAgent = "Mozilla/5.0 (Windows NT 10.0) AppleWebKit Chrome/124.0") => createQrLoginRequest({ requestId: "test-create", endpoint: "/create", userAgent, protocolVersion: 2 });
const match = (request, learner = learnerA, code = request.matchingCode) => matchQrLoginRequest({ uid: learner.uid, role: learner.role, payload: payload(request, { matchingCode: code }), context: { endpoint: "/match" } });
const approve = (request, learner = learnerA) => approveQrLoginRequest({ uid: learner.uid, token: learner.token, role: learner.role, payload: payload(request), context: { endpoint: "/approve" } });

const created = await create();
check(doc(created).status === "pending", "Create must store pending state.");
check(created.protocolVersion === 2, "Create must return protocol v2.");
check(/^\d{3}$/.test(created.matchingCode), "Create must return a three-digit desktop code.");
check(created.cancelCapability.length >= 24, "Create must return a cancellation capability.");
check(created.expiresAtMs - doc(created).createdAtMs === 180000, "Protocol-v2 TTL must be three minutes.");
check(!("matchingCode" in doc(created)), "Raw matching code must not be stored.");
check(!("cancelCapability" in doc(created)) && !JSON.stringify(doc(created)).includes(created.cancelCapability), "Raw cancellation capability must not be stored.");
check(doc(created).browserCategory === "Chrome" && doc(created).osCategory === "Windows", "Request context must be normalized.");

const legacyCreate = await createQrLoginRequest({ requestId: "legacy-create", endpoint: "/create" });
check(legacyCreate.protocolVersion === 1 && !legacyCreate.matchingCode && !legacyCreate.cancelCapability, "Legacy create calls must remain deployment-skew compatible.");
check(legacyCreate.expiresAtMs - doc(legacyCreate).createdAtMs === 300000, "Legacy create TTL must remain five minutes.");

const context = await getQrLoginContext({ payload: payload(created), uid: learnerA.uid, context: { endpoint: "/context" } });
check(context.status === "pending" && context.matchingRequired === true, "Context must return safe pending metadata.");
check(!("matchingCode" in context) && !("matchingVerifier" in context) && !("secretHash" in context), "Context must omit sensitive fields.");
await rejectsCode(() => getQrLoginContext({ payload: payload(created, { secret: "wrong-capability-value-that-is-long" }), uid: learnerA.uid }), "permission_denied");

const leadingZero = await create();
leadingZero.matchingCode = "007";
doc(leadingZero).matchingVerifier = hmacVerifier(leadingZero.secret, "match", leadingZero.requestId, "007");
await match(leadingZero);
check(doc(leadingZero).status === "matching_verified", "Leading-zero matching code must work.");

const wrong = await create();
const incorrectCode = wrong.matchingCode === "999" ? "998" : "999";
const wrongMatchError = await rejectsCode(() => match(wrong, learnerA, incorrectCode), "matching_failed");
check(wrongMatchError.status === 409 && !/permission/i.test(wrongMatchError.message), "First wrong match must return a safe dedicated 409 response without generic permission wording.");
check(doc(wrong).status === "denied" && doc(wrong).terminalReason === "matching_failed", "Wrong match must terminally deny.");
await rejectsCode(() => match(wrong), "conflict");
const wrongMatchContext = await getQrLoginContext({ payload: payload(wrong), uid: learnerA.uid });
check(wrongMatchContext.status === "denied" && wrongMatchContext.terminalReason === "matching_failed", "Reloaded phone context must retain the safe matching-failure reason.");

const privileged = await create();
await rejectsCode(() => match(privileged, { ...learnerA, role: "admin" }), "permission_denied");
check(doc(privileged).status === "pending", "Privileged match must not change request.");

const bound = await create();
await match(bound, learnerA);
await rejectsCode(() => approve(bound, learnerB), "permission_denied");
await approve(bound, learnerA);
check(doc(bound).approvedUid === learnerA.uid, "Same matched learner must approve successfully.");

const withoutMatch = await create();
await rejectsCode(() => approve(withoutMatch), "conflict");

const matchTimeout = await create();
await match(matchTimeout);
doc(matchTimeout).matchingExpiresAtMs = Date.now() - 1;
await rejectsCode(() => approve(matchTimeout), "conflict");
check(doc(matchTimeout).status === "expired", "Matching timeout must become terminal.");

const overallExpired = await create();
doc(overallExpired).expiresAtMs = Date.now() - 1;
await rejectsCode(() => match(overallExpired), "conflict");
check(doc(overallExpired).status === "expired", "Overall expiry must be terminal.");

const denyPending = await create();
await denyQrLoginRequest({ uid: learnerA.uid, role: "", payload: payload(denyPending) });
check(doc(denyPending).status === "denied", "Phone deny from pending must work.");
const denyMatched = await create();
await match(denyMatched);
await denyQrLoginRequest({ uid: learnerA.uid, role: "", payload: payload(denyMatched) });
check(doc(denyMatched).status === "denied", "Phone deny from matching_verified must work.");
await rejectsCode(() => denyQrLoginRequest({ uid: learnerA.uid, role: "", payload: payload(bound) }), "conflict");

const cancelPending = await create();
await cancelQrLoginRequest({ payload: { requestId: cancelPending.requestId, cancelCapability: cancelPending.cancelCapability } });
check(doc(cancelPending).status === "cancelled", "Desktop cancel from pending must work.");
const cancelMatched = await create();
await match(cancelMatched);
await cancelQrLoginRequest({ payload: { requestId: cancelMatched.requestId, cancelCapability: cancelMatched.cancelCapability } });
check(doc(cancelMatched).status === "cancelled", "Desktop cancel from matching_verified must work.");
await rejectsCode(() => cancelQrLoginRequest({ payload: { requestId: bound.requestId, cancelCapability: bound.cancelCapability } }), "conflict");

const matchingFailurePoll = await exchangeQrLoginRequest({ payload: payload(wrong) });
check(matchingFailurePoll.status === "denied" && matchingFailurePoll.terminalReason === "matching_failed", "Desktop poll must distinguish matching failure from intentional denial.");
const intentionalDenyPoll = await exchangeQrLoginRequest({ payload: payload(denyPending) });
check(intentionalDenyPoll.status === "denied" && intentionalDenyPoll.terminalReason === "user_denied", "Explicit phone denial must retain its intentional-denial reason.");
check((await exchangeQrLoginRequest({ payload: payload(cancelPending) })).status === "cancelled", "Cancelled poll must terminate.");
check((await exchangeQrLoginRequest({ payload: payload(overallExpired) })).status === "expired", "Expired poll must terminate.");

const exchange = await create();
await match(exchange);
await approve(exchange);
const concurrentExchange = await Promise.allSettled([
  exchangeQrLoginRequest({ payload: payload(exchange) }),
  exchangeQrLoginRequest({ payload: payload(exchange) })
]);
check(concurrentExchange.filter((item) => item.status === "fulfilled" && item.value.approved).length === 1, "One concurrent exchange must succeed.");
const successfulExchange = concurrentExchange.find((item) => item.status === "fulfilled" && item.value.approved)?.value;
check(successfulExchange?.status === "exchanged" && successfulExchange?.terminal === true && Boolean(successfulExchange?.customToken), "Successful exchange must return one terminal exchanged response with a custom token.");
check(tokenMintCount === 1, "Concurrent exchange must mint exactly one custom token.");
await rejectsCode(() => exchangeQrLoginRequest({ payload: payload(exchange) }), "conflict");

const concurrentMatch = await create();
const matchResults = await Promise.allSettled([match(concurrentMatch), match(concurrentMatch)]);
check(matchResults.filter((item) => item.status === "fulfilled").length === 1 && doc(concurrentMatch).status === "matching_verified", "Only one concurrent match transition may succeed.");

const approveCancel = await create();
await match(approveCancel);
const approveCancelResults = await Promise.allSettled([
  approve(approveCancel),
  cancelQrLoginRequest({ payload: { requestId: approveCancel.requestId, cancelCapability: approveCancel.cancelCapability } })
]);
check(approveCancelResults.filter((item) => item.status === "fulfilled").length === 1, "Approve versus cancel must have one winner.");

const approveDeny = await create();
await match(approveDeny);
const approveDenyResults = await Promise.allSettled([
  approve(approveDeny),
  denyQrLoginRequest({ uid: learnerA.uid, role: "", payload: payload(approveDeny) })
]);
check(approveDenyResults.filter((item) => item.status === "fulfilled").length === 1, "Approve versus deny must have one winner.");

const legacySecret = "legacy-capability-value-that-is-long-enough";
const legacyId = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
documents.set(`qrLoginRequests/${legacyId}`, {
  status: "pending", secretHash: hashQrSecret(legacySecret), createdAtMs: Date.now(), expiresAtMs: Date.now() + 60000, used: false
});
await approveQrLoginRequest({ uid: learnerA.uid, token: learnerA.token, payload: { requestId: legacyId, secret: legacySecret } });
check(documents.get(`qrLoginRequests/${legacyId}`).status === "approved", "Legacy hardened browser request must remain compatible.");

const desktopSource = readFileSync("scripts/auth.js", "utf8");
const authHtmlSource = readFileSync("auth.html", "utf8");
const phoneSource = readFileSync("scripts/qr-approve.js", "utf8");
check(!/matchingCode/.test(desktopSource.match(/approvalUrl[\s\S]{0,300}/)?.[0] || ""), "Matching code must not be encoded into QR URL.");
check(desktopSource.includes('new URL("/qr-approve", window.location.origin)'), "Desktop QR must use the clean approval route on the current origin without a query-dropping redirect.");
check(!desktopSource.includes('new URL("qr-approve.html"'), "Desktop QR must not target the redirected .html approval route.");
check(phoneSource.includes("/api/auth/qr/context") && phoneSource.includes("/api/auth/qr/match"), "Browser fallback must use protocol v2.");
check(phoneSource.includes('showTerminalState("approved")') && phoneSource.includes('showTerminalState("denied")'), "Phone approval and denial must render terminal UI states.");
check(phoneSource.includes('error?.code === "matching_failed"') && phoneSource.includes('showTerminalState("matching_failed")'), "Phone must immediately render a dedicated terminal state for the first wrong matching code.");
check(phoneSource.includes('requestContext.terminalReason === "matching_failed"'), "Phone must restore the dedicated matching-failure terminal state from safe context metadata.");
check(!phoneSource.match(/matching_failed[\s\S]{0,240}permission_denied/), "Phone matching-failure handling must not map to generic permission wording.");
check(phoneSource.includes('document.querySelector(".approval-actions").hidden = true'), "Phone terminal states must hide all request-mutating actions.");
check(phoneSource.includes('document.getElementById("matchingCodeForm").hidden = true') && phoneSource.includes('document.getElementById("phonePasswordForm").hidden = true'), "Phone terminal states must hide matching and sign-in forms.");
check(phoneSource.includes('exchanged: { tone: "neutral"') && phoneSource.includes('exchange_failed: { tone: "danger"'), "Phone already-used and exchange-failure states must have explicit semantic presentations.");
check(desktopSource.includes('result.terminalReason === "matching_failed"') && desktopSource.includes("denied because the matching code was incorrect"), "Desktop must distinguish matching failure from explicit phone denial.");
check(phoneSource.includes("history.replaceState"), "Phone URL must still be sanitized.");
check(phoneSource.indexOf('params.get("requestId")') < phoneSource.indexOf("history.replaceState"), "Phone must copy the request ID into memory before sanitizing the URL.");
check(phoneSource.indexOf('params.get("secret")') < phoneSource.indexOf("history.replaceState"), "Phone must copy the capability into memory before sanitizing the URL.");
check(!/(localStorage|sessionStorage)\.setItem\([^\n]*(requestId|secret)/i.test(phoneSource), "Phone capability must remain memory-only.");
check(authHtmlSource.includes('id="qrLoginOpenBtn"') && !/onclick="openQrLoginPopup\(\)"/.test(authHtmlSource), "QR open button must use module-owned wiring.");
check(/getElementById\("qrLoginOpenBtn"\)\?\.addEventListener\("click", openQrLoginPopup\)/.test(desktopSource), "QR open button listener must invoke the protocol-v2 module function.");
check(/body:\s*\{\s*protocolVersion:\s*2\s*\}/.test(desktopSource), "QR open flow must request protocol v2.");
check(desktopSource.includes("validateQrCreateResult"), "Desktop QR create must validate the response before rendering or polling.");
check(desktopSource.includes("Number(result.protocolVersion) === 2"), "Desktop QR create must reject a downgraded protocol response.");
check(desktopSource.includes('/^\\d{3}$/.test(String(result.matchingCode || ""))'), "Desktop QR create must require a separate three-digit matching code.");
const successfulDesktopExchangeBranch = desktopSource.indexOf('if (result.approved && result.status === "exchanged" && result.customToken)');
const terminalDesktopExchangeBranch = desktopSource.indexOf("if (result.terminal)", successfulDesktopExchangeBranch);
check(successfulDesktopExchangeBranch >= 0 && terminalDesktopExchangeBranch > successfulDesktopExchangeBranch, "Desktop must consume a successful exchanged response before generic terminal-state handling.");
const successfulDesktopExchangeSource = desktopSource.slice(successfulDesktopExchangeBranch, terminalDesktopExchangeBranch);
check(successfulDesktopExchangeSource.indexOf("stopQrLoginPolling()") < successfulDesktopExchangeSource.indexOf("signInWithCustomToken"), "Desktop must stop polling before consuming the one-time custom token.");
check(successfulDesktopExchangeSource.includes("return;"), "Desktop must not poll again after consuming a successful exchange response.");

const logText = capturedLogs.join("\n");
for (const sensitive of [created.secret, created.cancelCapability, doc(created).matchingVerifier, doc(created).cancelCapabilityVerifier, "test-custom-token"]) {
  check(!logText.includes(sensitive), "Sensitive QR material appeared in logs.");
}
const parsedLogs = capturedLogs.map((line) => { try { return JSON.parse(line); } catch { return {}; } });
check(parsedLogs.every((entry) => !("matchingCode" in entry) && !("matchingVerifier" in entry)), "Matching code or verifier field appeared in logs.");

console.log = consoleOriginals.log;
console.warn = consoleOriginals.warn;
console.error = consoleOriginals.error;
consoleOriginals.log(JSON.stringify({ status: "ok", passed, tokenMintCount }, null, 2));
