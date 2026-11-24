/**
 * ElevenLabs webhook signatures.
 *
 * Header "ElevenLabs-Signature: t=<unix seconds>,v0=<hex>" where the hex is
 * HMAC-SHA256(secret, `${t}.${rawBody}`). Requests older than 30 minutes
 * are rejected. Format confirmed against the official SDK
 * (@elevenlabs/elevenlabs-js 2.80.0, wrapper/webhooks.js constructEvent) and
 * https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks
 */
import { hmacSha256Hex, timingSafeEqualStr } from "@/lib/crypto";

export const SIGNATURE_HEADER = "elevenlabs-signature";
const TOLERANCE_SECS = 30 * 60;
/** We also refuse timestamps far in the future (clock skew allowance). */
const FUTURE_SKEW_SECS = 5 * 60;

export type SignatureCheck = { ok: true } | { ok: false; error: string };

export async function verifyElevenLabsSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  now: Date,
): Promise<SignatureCheck> {
  if (!header) return { ok: false, error: "missing signature header" };
  const parts = header.split(",").map((p) => p.trim());
  const t = parts.find((p) => p.startsWith("t="))?.slice(2);
  const v0 = parts.find((p) => p.startsWith("v0="));
  if (!t || !v0 || !/^\d+$/.test(t)) return { ok: false, error: "malformed signature header" };
  const ts = Number(t);
  const nowSecs = Math.floor(now.getTime() / 1000);
  if (ts < nowSecs - TOLERANCE_SECS) return { ok: false, error: "signature timestamp too old" };
  if (ts > nowSecs + FUTURE_SKEW_SECS)
    return { ok: false, error: "signature timestamp in the future" };
  const expected = `v0=${await hmacSha256Hex(secret, `${t}.${rawBody}`)}`;
  if (!timingSafeEqualStr(expected, v0)) return { ok: false, error: "signature mismatch" };
  return { ok: true };
}

/** Used by the mock provider and tests to produce a valid header. */
export async function signElevenLabsPayload(
  rawBody: string,
  secret: string,
  now: Date,
): Promise<string> {
  const t = Math.floor(now.getTime() / 1000);
  return `t=${t},v0=${await hmacSha256Hex(secret, `${t}.${rawBody}`)}`;
}
