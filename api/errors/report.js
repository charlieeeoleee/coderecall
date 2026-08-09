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
const { assertRateLimit } = require("../_lib/rate-limit");

function sanitize(value, maxLength = 240) {
  return String(value || "")
    .replace(/(apiKey|token|secret|password|authorization)=?[^&\s]*/gi, "$1=[redacted]")
    .slice(0, maxLength);
}

module.exports = async function handler(req, res) {
  const id = requestId(req);
  const endpoint = "/api/errors/report";
  try {
    methodAllowed(req, ["POST"]);
    const ip = getClientIp(req);
    await assertRateLimit("reportFrontendError", ip);
    const payload = await readJsonBody(req, { maxBytes: 8 * 1024 });
    logEvent("warn", "frontend_error_reported", {
      requestId: id,
      endpoint,
      ipHash: hashValue(ip),
      clientEvent: sanitize(payload.event, 80),
      message: sanitize(payload.message),
      source: sanitize(payload.source, 180),
      route: sanitize(payload.route, 180),
      userAgent: sanitize(payload.userAgent, 180)
    });
    sendJson(res, 200, { ok: true });
  } catch (error) {
    const safe = safeErrorPayload(error);
    logEvent(safe.status < 500 ? "warn" : "error", "frontend_error_report_failed", {
      requestId: id,
      endpoint,
      result: safe.body.code
    });
    sendJson(res, safe.status, safe.body);
  }
};
