import { describe, expect, it } from "vitest";
import { decryptText, encryptText, hmacSha256Hex, randomToken, timingSafeEqualStr } from "./crypto";

const KEY = Buffer.alloc(32, 3).toString("base64");
const OTHER_KEY = Buffer.alloc(32, 4).toString("base64");

describe("field encryption", () => {
  it("round-trips Hindi text", async () => {
    const secret = "घुटने में दर्द रहता है, sugar ki dawai";
    const stored = await encryptText(secret, KEY);
    expect(stored.startsWith("v1:")).toBe(true);
    expect(stored).not.toContain("sugar");
    expect(await decryptText(stored, KEY)).toBe(secret);
  });

  it("uses a fresh IV every time", async () => {
    expect(await encryptText("same", KEY)).not.toBe(await encryptText("same", KEY));
  });

  it("refuses the wrong key and tampered data", async () => {
    const stored = await encryptText("private", KEY);
    await expect(decryptText(stored, OTHER_KEY)).rejects.toThrow();
    const tampered = stored.slice(0, -4) + (stored.endsWith("AAAA") ? "BBBB" : "AAAA");
    await expect(decryptText(tampered, KEY)).rejects.toThrow();
  });
});

describe("hmac helpers", () => {
  it("matches a known HMAC-SHA256 vector", async () => {
    // RFC 4231 test case 2
    expect(await hmacSha256Hex("Jefe", "what do ya want for nothing?")).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
  });

  it("compares strings in constant time", () => {
    expect(timingSafeEqualStr("abc", "abc")).toBe(true);
    expect(timingSafeEqualStr("abc", "abd")).toBe(false);
    expect(timingSafeEqualStr("abc", "abcd")).toBe(false);
  });

  it("makes url-safe tokens", () => {
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
});
