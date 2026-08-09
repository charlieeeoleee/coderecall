const { requireFirebaseUser } = require("../../_lib/auth");
const { approveQrLoginRequest } = require("../../_lib/qr-login");
const { assertRateLimit } = require("../../_lib/rate-limit");
const { methodAllowed, readJsonBody, requestId, safeErrorPayload, sendJson } = require("../../_lib/http");

module.exports = async function handler(req, res) {
  const id = requestId(req);
  const endpoint = "/api/auth/qr/approve";
  try {
    methodAllowed(req, ["POST"]);
    const payload = await readJsonBody(req);
    const user = await requireFirebaseUser(req, { requestId: id, endpoint });
    await assertRateLimit("approveQrLoginRequest", user.uid);
    const data = await approveQrLoginRequest({
      uid: user.uid,
      token: user.token,
      payload,
      context: { requestId: id, endpoint }
    });
    sendJson(res, 200, { ok: true, data });
  } catch (error) {
    const safe = safeErrorPayload(error);
    sendJson(res, safe.status, safe.body);
  }
};
