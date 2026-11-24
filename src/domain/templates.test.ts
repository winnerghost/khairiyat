import { describe, expect, it } from "vitest";
import { sanitizeTemplateParam } from "@/providers/whatsapp/types";
import { render, TEMPLATES } from "./templates";
import { buildSummaryEn, cleanSummary } from "@/engine/summaries";

describe("WhatsApp templates", () => {
  it("sanitises parameters (no newlines, tabs or 4+ spaces)", () => {
    expect(sanitizeTemplateParam("line one\nline two\t\ttab     spaces")).toBe(
      "line one line two tab spaces",
    );
  });

  it("renders every template in English and Hindi with all parameters filled", () => {
    for (const [name, langs] of Object.entries(TEMPLATES)) {
      for (const lang of ["en", "hi"] as const) {
        const count = (langs[lang].match(/\{\{\d+\}\}/g) ?? []).length;
        const r = render(
          name as keyof typeof TEMPLATES,
          lang,
          Array.from({ length: 4 }, (_, i) => `P${i + 1}`),
        );
        expect(r.body).not.toMatch(/\{\{\d+\}\}/);
        expect(count).toBeGreaterThan(0);
      }
    }
  });

  it("keeps summaries under 600 characters and honest about self-reporting", () => {
    const s = buildSummaryEn({
      addressAs: "Maa",
      mood: 4,
      moodWords: "theek hoon",
      ateMeals: "dal chawal",
      medicines: [{ name: "Metformin", taken: "yes" }],
      sleep: "slept well",
      painOrSymptoms: "knee pain",
      notableMoments: "x".repeat(800),
      redFlagDetail: null,
      distress: false,
      isConsentCall: false,
      consentGiven: null,
    });
    expect(s.length).toBeLessThanOrEqual(600);
    expect(s).toContain("self-reported");
    expect(cleanSummary("short")).toBeNull();
  });
});
