const { requireFirebaseUser } = require("../_lib/auth");
const { ApiError, methodAllowed, safeErrorPayload, sendJson } = require("../_lib/http");

function assertDevelopmentEnvironment(environment = process.env.VERCEL_ENV) {
  const normalizedEnvironment = String(environment || "").trim().toLowerCase() || "development";
  if (normalizedEnvironment !== "development") {
    throw new ApiError("not_found", "Endpoint not found.", 404);
  }
}

function createAuthCheckHandler({ verifyUser = requireFirebaseUser } = {}) {
  return async function authCheckHandler(req, res) {
    try {
      assertDevelopmentEnvironment();
      methodAllowed(req, ["POST"]);
      const user = await verifyUser(req, { endpoint: "/api/auth/check" });
      sendJson(res, 200, {
        authenticated: true,
        environment: "development",
        firebaseProject: String(process.env.FIREBASE_ADMIN_PROJECT_ID || ""),
        uidPresent: Boolean(user?.uid)
      });
    } catch (error) {
      const safe = safeErrorPayload(error);
      sendJson(res, safe.status, safe.body);
    }
  };
}

module.exports = createAuthCheckHandler();
module.exports.assertDevelopmentEnvironment = assertDevelopmentEnvironment;
module.exports.createAuthCheckHandler = createAuthCheckHandler;
