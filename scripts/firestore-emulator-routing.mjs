export const FIRESTORE_EMULATOR_PORT = 18080;
export const LOCAL_DEVELOPMENT_WEB_PORT = "3000";

function isCanonicalPrivateIpv4(hostname) {
  const parts = String(hostname || "").split(".");
  if (parts.length !== 4 || parts.some((part) => !/^(0|[1-9]\d{0,2})$/.test(part))) {
    return false;
  }

  const octets = parts.map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return false;

  return octets[0] === 10
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168);
}

export function resolveBrowserFirestoreEmulator({
  environment,
  protocol,
  hostname,
  port
} = {}) {
  const normalizedEnvironment = String(environment || "").trim().toLowerCase();
  if (normalizedEnvironment === "preview" || normalizedEnvironment === "production") {
    return Object.freeze({ enabled: false });
  }

  if (normalizedEnvironment !== "development") {
    throw new Error("Browser Firestore environment is invalid; refusing remote fallback.");
  }

  const normalizedProtocol = String(protocol || "").trim().toLowerCase();
  const normalizedHostname = String(hostname || "").trim().toLowerCase();
  const normalizedPort = String(port || "").trim();

  if (normalizedProtocol !== "http:" || normalizedPort !== LOCAL_DEVELOPMENT_WEB_PORT) {
    throw new Error("Development Firestore requires the approved local HTTP origin on port 3000.");
  }

  if (normalizedHostname === "localhost" || normalizedHostname === "127.0.0.1") {
    return Object.freeze({
      enabled: true,
      host: "127.0.0.1",
      port: FIRESTORE_EMULATOR_PORT
    });
  }

  if (isCanonicalPrivateIpv4(normalizedHostname)) {
    return Object.freeze({
      enabled: true,
      host: normalizedHostname,
      port: FIRESTORE_EMULATOR_PORT
    });
  }

  throw new Error("Development Firestore origin is not approved; refusing remote fallback.");
}
