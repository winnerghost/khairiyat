import { describe, expect, it } from "vitest";
import { rateLimit } from "./rate-limit";

describe("rateLimit", () => {
  it("allows up to max per window, then refuses until the window passes", () => {
    const t = 1_000_000;
    expect(rateLimit("k", 2, 1000, t)).toBe(true);
    expect(rateLimit("k", 2, 1000, t + 10)).toBe(true);
    expect(rateLimit("k", 2, 1000, t + 20)).toBe(false);
    expect(rateLimit("k", 2, 1000, t + 1500)).toBe(true);
    expect(rateLimit("other", 2, 1000, t + 20)).toBe(true);
  });
});
