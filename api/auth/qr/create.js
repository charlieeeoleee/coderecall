const { createQrLoginRequest } = require("../../_lib/qr-login");
const { assertRateLimit } = require("../../_lib/rate-limit");
const { getClientIp, methodAllowed, readJsonBody, requestId, safeErrorPayload, sendJson } = require("../../_lib/http");

module.exports = async function handler(req, res) {
  const id = requestId(req);
  const endpoint = "/api/auth/qr/create";
  try {
    methodAllowed(req, ["POST"]);
    await readJsonBody(req, { maxBytes: 1024 });
    await assertRateLimit("createQrLoginRequest", getClientIp(req));
    const data = await createQrLoginRequest({ requestId: id, endpoint });
    sendJson(res, 201, { ok: true, data });
  } catch (error) {
    const safe = safeErrorPayload(error);
    sendJson(res, safe.status, safe.body);
  }
};
