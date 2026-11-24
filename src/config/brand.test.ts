import { describe, expect, it } from "vitest";
import { assistantNameFor, brand } from "./brand";

describe("brand config", () => {
  it("names the assistant to match the chosen voice", () => {
    expect(assistantNameFor("female")).toBe("Roshni");
    expect(assistantNameFor("male")).toBe("Aman");
  });

  it("uses valid hex colours (they become CSS variables)", () => {
    for (const value of Object.values(brand.colors)) {
      expect(value).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
