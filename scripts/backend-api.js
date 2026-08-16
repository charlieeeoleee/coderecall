import { app, firebaseEnvironment } from "./firebase-config.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const DEFAULT_TIMEOUT_MS = 12000;

export class BackendApiError extends Error {
  constructor(code, message, status = 0, details = {}) {
    super(message || "Request failed.");
    this.name = "BackendApiError";
    this.code = code || "request_failed";
    this.status = status;
    this.details = details;
  }
}

async function readSafeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function apiRequest(path, options = {}) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  const user = options.auth === false ? null : getAuth(app).currentUser;
  if (options.auth !== false) {
    if (!user) {
      logDevelopmentAuthDiagnostic("no_current_user", path);
      window.clearTimeout(timeout);
      throw new BackendApiError("unauthenticated", "Sign in before continuing.", 401);
    }
    try {
      headers.Authorization = `Bearer ${await user.getIdToken()}`;
    } catch (error) {
      logDevelopmentAuthDiagnostic("id_token_acquisition_failed", path, error?.code);
      window.clearTimeout(timeout);
      throw new BackendApiError("unauthenticated", "Sign in again before continuing.", 401);
    }
  }

  try {
    const send = async () => {
      const response = await fetch(path, {
        method: options.method || "POST",
        headers,
        body: JSON.stringify(options.body || {}),
        credentials: "same-origin",
        signal: controller.signal
      });
      return { response, payload: await readSafeJson(response) };
    };

    let { response, payload } = await send();
    if (user && options.auth !== false && options.retryAuth !== false && response.status === 401 && payload?.code === "unauthenticated") {
      logDevelopmentAuthDiagnostic("server_rejected_token_refreshing_once", path);
      try {
        headers.Authorization = `Bearer ${await user.getIdToken(true)}`;
      } catch (error) {
        logDevelopmentAuthDiagnostic("forced_id_token_refresh_failed", path, error?.code);
        throw new BackendApiError("unauthenticated", "Sign in again before continuing.", 401);
      }
      ({ response, payload } = await send());
    }

    if (!response.ok || payload?.ok === false) {
      if (response.status === 401) logDevelopmentAuthDiagnostic("server_rejected_refreshed_token", path, payload?.code);
      throw new BackendApiError(
        payload?.code || `http_${response.status}`,
        payload?.message || "The server could not complete the request.",
        response.status,
        payload || {}
      );
    }

    return payload?.data ?? payload ?? {};
  } catch (error) {
    if (error instanceof BackendApiError) throw error;
    if (error?.name === "AbortError") {
      throw new BackendApiError("timeout", "The request took too long. Please try again.", 0);
    }
    throw new BackendApiError("network_error", "Check your connection and try again.", 0);
  } finally {
    window.clearTimeout(timeout);
  }
}

function logDevelopmentAuthDiagnostic(result, path, code = "") {
  if (firebaseEnvironment !== "development") return;
  console.warn("CodeRecall Development API auth diagnostic", {
    result,
    path,
    code: String(code || "").slice(0, 80)
  });
}

export function describeBackendError(error, fallback = "The request could not be completed right now.") {
  const code = String(error?.code || "");
  if (code === "unauthenticated") return "Sign in again, then retry.";
  if (code === "permission_denied") return "You do not have permission to do that.";
  if (code === "rate_limited") return "Please wait a moment, then try again.";
  if (code === "timeout") return "The request took too long. Please try again.";
  if (code === "network_error") return "Check your connection and try again.";
  return String(error?.message || fallback);
}
