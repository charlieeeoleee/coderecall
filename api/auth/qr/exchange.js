const { exchangeQrLoginRequest } = require("../../_lib/qr-login");
const { assertRateLimit } = require("../../_lib/rate-limit");
const { getClientIp, methodAllowed, readJsonBody, requestId, safeErrorPayload, sendJson } = require("../../_lib/http");

module.exports = async function handler(req, res) {
  const id = requestId(req);
  const endpoint = "/api/auth/qr/exchange";
  try {
    methodAllowed(req, ["POST"]);
    const payload = await readJsonBody(req);
    await assertRateLimit("exchangeQrLoginRequest", getClientIp(req));
    const data = await exchangeQrLoginRequest({
      payload,
      context: { requestId: id, endpoint }
    });
    sendJson(res, 200, { ok: true, data });
  } catch (error) {
    const safe = safeErrorPayload(error);
    sendJson(res, safe.status, safe.body);
  }
};
