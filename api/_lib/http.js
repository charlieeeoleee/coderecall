const crypto = require("crypto");

const ERROR_STATUS = {
  invalid_request: 400,
  unauthenticated: 401,
  permission_denied: 403,
  not_found: 404,
  conflict: 409,
  matching_failed: 409,
  rate_limited: 429,
  temporary_unavailable: 503,
  internal: 500
};

class ApiError extends Error {
  constructor(code, message, status = ERROR_STATUS[code] || 500) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

function requestId(req) {
  return String(req.headers["x-vercel-id"] || req.headers["x-request-id"] || crypto.randomUUID());
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function methodAllowed(req, allowed) {
  if (allowed.includes(req.method)) return;
  throw new ApiError("invalid_request", "Unsupported request method.", 405);
}

async function readJsonBody(req, options = {}) {
  const maxBytes = options.maxBytes || 16 * 1024;
  if (req.body !== undefined && req.body !== null) {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : req.body;
    const serialized = typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody);
    if (Buffer.byteLength(serialized, "utf8") > maxBytes) {
      throw new ApiError("invalid_request", "Request body is too large.", 413);
    }
    try {
      const parsed = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("JSON body must be an object.");
      }
      return parsed;
    } catch {
      throw new ApiError("invalid_request", "Request body must be valid JSON.");
    }
  }

  let size = 0;
  let raw = "";

  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new ApiError("invalid_request", "Request body is too large.", 413);
    }
    raw += chunk.toString("utf8");
  }

  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("JSON body must be an object.");
    }
    return parsed;
  } catch {
    throw new ApiError("invalid_request", "Request body must be valid JSON.");
  }
}

function safeErrorPayload(error) {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      body: {
        ok: false,
        code: error.code,
        message: error.message
      }
    };
  }

  return {
    status: 500,
    body: {
      ok: false,
      code: "internal",
      message: "Something went wrong. Please try again shortly."
    }
  };
}

function logEvent(severity, event, fields = {}) {
  const safeFields = Object.fromEntries(
    Object.entries(fields || {}).filter(([, value]) => value !== undefined)
  );
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    severity,
    event,
    ...safeFields
  });
  if (severity === "error") console.error(line);
  else if (severity === "warn") console.warn(line);
  else console.log(line);
}

function getClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "");
  return forwarded.split(",")[0].trim() || String(req.socket?.remoteAddress || "unknown");
}

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value || "unknown")).digest("hex").slice(0, 32);
}

module.exports = {
  ApiError,
  ERROR_STATUS,
  getClientIp,
  hashValue,
  logEvent,
  methodAllowed,
  readJsonBody,
  requestId,
  safeErrorPayload,
  sendJson
};
