const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function normalizeSecret(secret = "") {
  return secret.replace(/\s+/g, "").toUpperCase();
}

function base32ToBytes(secret) {
  const cleaned = normalizeSecret(secret);
  let bits = "";

  for (const char of cleaned) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value === -1) continue;
    bits += value.toString(2).padStart(5, "0");
  }

  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(parseInt(bits.slice(index, index + 8), 2));
  }

  return new Uint8Array(bytes);
}

function bytesToBase32(bytes) {
  let bits = "";
  bytes.forEach((byte) => {
    bits += byte.toString(2).padStart(8, "0");
  });

  let output = "";
  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, "0");
    output += BASE32_ALPHABET[parseInt(chunk, 2)];
  }

  return output;
}

export function formatSecret(secret = "") {
  return normalizeSecret(secret).replace(/(.{4})/g, "$1 ").trim();
}

export function generateBase32Secret(length = 20) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return bytesToBase32(bytes).slice(0, 32);
}

async function importTotpKey(secret) {
  const secretBytes = base32ToBytes(secret);
  return crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
}

async function generateHotp(secret, counter) {
  const key = await importTotpKey(secret);
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint32(4, counter);

  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, buffer));
  const offset = signature[signature.length - 1] & 0x0f;
  const binary =
    ((signature[offset] & 0x7f) << 24) |
    ((signature[offset + 1] & 0xff) << 16) |
    ((signature[offset + 2] & 0xff) << 8) |
    (signature[offset + 3] & 0xff);

  return String(binary % 1000000).padStart(6, "0");
}

export async function verifyTotpCode(secret, code, options = {}) {
  const normalizedCode = String(code || "").replace(/\D/g, "");
  if (normalizedCode.length !== 6) return false;

  const stepSeconds = options.stepSeconds || 30;
  const windowSize = options.windowSize ?? 1;
  const now = options.now || Date.now();
  const currentCounter = Math.floor(now / 1000 / stepSeconds);

  for (let offset = -windowSize; offset <= windowSize; offset += 1) {
    const candidate = await generateHotp(secret, currentCounter + offset);
    if (candidate === normalizedCode) return true;
  }

  return false;
}

export function buildOtpAuthUri({ secret, email, issuer = "Code Recall" }) {
  const safeIssuer = encodeURIComponent(issuer);
  const safeLabel = encodeURIComponent(`${issuer}:${email || "super-admin"}`);
  return `otpauth://totp/${safeLabel}?secret=${encodeURIComponent(normalizeSecret(secret))}&issuer=${safeIssuer}&algorithm=SHA1&digits=6&period=30`;
}

export function generateBackupCodes(count = 6) {
  const codes = [];
  const randomValues = crypto.getRandomValues(new Uint32Array(count));

  for (let index = 0; index < count; index += 1) {
    const raw = String(randomValues[index] % 100000000).padStart(8, "0");
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }

  return codes;
}

export async function sha256Hex(value) {
  const data = new TextEncoder().encode(String(value || "").trim().toUpperCase());
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashBackupCodes(codes = []) {
  const hashes = [];
  for (const code of codes) {
    hashes.push(await sha256Hex(code));
  }
  return hashes;
}

export async function findMatchingBackupCodeIndex(input, hashes = []) {
  const digest = await sha256Hex(input);
  return hashes.findIndex((hash) => hash === digest);
}
