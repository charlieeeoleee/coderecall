const { requireFirebaseUser } = require("../_lib/auth");
const { recordGamificationEvent } = require("../_lib/gamification");
const { assertRateLimit } = require("../_lib/rate-limit");
const {
  getClientIp,
  hashValue,
  logEvent,
  methodAllowed,
  readJsonBody,
  requestId,
  safeErrorPayload,
  sendJson
} = require("../_lib/http");

module.exports = async function handler(req, res) {
  const startedAt = Date.now();
  const id = requestId(req);
  const endpoint = "/api/gamification/event";

  try {
    methodAllowed(req, ["POST"]);
    const payload = await readJsonBody(req);
    const user = await requireFirebaseUser(req, { requestId: id, endpoint });
    await assertRateLimit("recordGamificationEvent", user.uid);
    const data = await recordGamificationEvent({
      uid: user.uid,
      token: user.token,
      payload,
      requestId: id,
      endpoint
    });
    sendJson(res, 200, { ok: true, data });
  } catch (error) {
    const safe = safeErrorPayload(error);
    logEvent(error.status && error.status < 500 ? "warn" : "error", "api_request_failed", {
      requestId: id,
      endpoint,
      ipHash: hashValue(getClientIp(req)),
      result: safe.body.code,
      latencyMs: Date.now() - startedAt
    });
    sendJson(res, safe.status, safe.body);
  }
};
