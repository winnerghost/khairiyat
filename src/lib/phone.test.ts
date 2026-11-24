import { describe, expect, it } from "vitest";
import { formatPhone, maskedPhone, normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it.each([
    ["9876543210", "+919876543210"],
    ["98765 43210", "+919876543210"],
    ["098765-43210", "+919876543210"],
    ["+91 98765 43210", "+919876543210"],
    ["919876543210", "+919876543210"],
    ["0091 9876543210", "+919876543210"],
    ["+44 7911 123456", "+447911123456"],
    ["+1 (415) 555-2671", "+14155552671"],
  ])("normalises %s to %s", (input, expected) => {
    expect(normalizePhone(input)).toEqual({ ok: true, e164: expected });
  });

  it.each(["", "12345", "abcdefghij", "+91 12345"])("rejects %j", (input) => {
    expect(normalizePhone(input).ok).toBe(false);
  });

  it("formats and masks for display", () => {
    expect(formatPhone("+919876543210")).toBe("+91 98765 43210");
    expect(maskedPhone("+919876543210")).toBe("•••• 210");
  });
});
