/**
 * Encryption for sensitive fields (e.g. health notes) and HMAC helpers.
 *
 * AES-256-GCM via Web Crypto, so it runs on Node and Deno.
 * Stored format: "v1:<base64(iv[12] + ciphertext + tag[16])>".
 * The "v1" prefix lets us rotate keys later without breaking old data.
 */

const VERSION = "v1";
const IV_BYTES = 12;

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

const keyCache = new Map<string, Promise<CryptoKey>>();

function importKey(keyB64: string): Promise<CryptoKey> {
  let key = keyCache.get(keyB64);
  if (!key) {
    const raw = b64ToBytes(keyB64);
    if (raw.length !== 32) throw new Error("Encryption key must be 32 bytes (base64).");
    key = crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    keyCache.set(keyB64, key);
  }
  return key;
}

export async function encryptText(plaintext: string, keyB64: string): Promise<string> {
  const key = await importKey(keyB64);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)),
  );
  const packed = new Uint8Array(iv.length + cipher.length);
  packed.set(iv, 0);
  packed.set(cipher, iv.length);
  return `${VERSION}:${bytesToB64(packed)}`;
}

export async function decryptText(stored: string, keyB64: string): Promise<string> {
  const [version, payload] = stored.split(":", 2);
  if (version !== VERSION || !payload) throw new Error("Unknown encrypted data format.");
  const key = await importKey(keyB64);
  const packed = b64ToBytes(payload);
  const iv = packed.slice(0, IV_BYTES);
  const cipher = packed.slice(IV_BYTES);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new TextDecoder().decode(plain);
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)),
  );
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison (prevents timing attacks on signatures). */
export function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** URL-safe random token (invites, demo ids). */
export function randomToken(bytes = 24): string {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  return bytesToB64(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
