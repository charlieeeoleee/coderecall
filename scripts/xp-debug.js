const XP_DEBUG_KEY = "xp_debug_log";
const XP_DEBUG_LIMIT = 80;

function safeParseLog() {
  try {
    const raw = localStorage.getItem(XP_DEBUG_KEY) || "[]";
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function traceXPEvent(entry = {}) {
  try {
    const payload = {
      timestamp: new Date().toISOString(),
      page: typeof window !== "undefined" ? window.location.pathname.split("/").pop() || "" : "",
      ...entry
    };

    const log = safeParseLog();
    log.unshift(payload);
    localStorage.setItem(XP_DEBUG_KEY, JSON.stringify(log.slice(0, XP_DEBUG_LIMIT)));

    console.info("[XP TRACE]", payload);
  } catch (error) {
    console.warn("[XP TRACE] Unable to record debug event.", error);
  }
}

export function clearXPDebugLog() {
  try {
    localStorage.removeItem(XP_DEBUG_KEY);
  } catch {
    // Ignore local storage failures in debug helper.
  }
}
