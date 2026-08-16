const { requireQrEligibleUser } = require("../../_lib/auth");
const { getQrLoginContext } = require("../../_lib/qr-login");
const { assertRateLimit } = require("../../_lib/rate-limit");
const { methodAllowed, readJsonBody, requestId, safeErrorPayload, sendJson } = require("../../_lib/http");

module.exports = async function handler(req, res) {
  const id = requestId(req);
  const endpoint = "/api/auth/qr/context";
  try {
    methodAllowed(req, ["POST"]);
    const payload = await readJsonBody(req, { maxBytes: 2048 });
    const user = await requireQrEligibleUser(req, { requestId: id, endpoint });
    await assertRateLimit("contextQrLoginRequest", user.uid);
    const data = await getQrLoginContext({ payload, uid: user.uid, context: { requestId: id, endpoint } });
    sendJson(res, 200, { ok: true, data });
  } catch (error) {
    const safe = safeErrorPayload(error);
    sendJson(res, safe.status, safe.body);
  }
};
