const { sendJson } = require("./_lib/http");

module.exports = function apiNotFound(_req, res) {
  sendJson(res, 404, {
    ok: false,
    code: "not_found",
    message: "API endpoint not found."
  });
};
