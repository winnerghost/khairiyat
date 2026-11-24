import { describe, expect, it } from "vitest";
import { classify, parseMedicinesTaken, parseMood } from "./post-call";
import type { TranscriptionEvent } from "@/providers/voice/types";

const ev = (over: Partial<TranscriptionEvent>): TranscriptionEvent => ({
  type: "transcription",
  conversationId: "c",
  status: "done",
  transcript: [],
  durationSecs: 120,
  startedAt: null,
  providerCost: null,
  callResult: null,
  terminationReason: null,
  callSuccessful: null,
  providerSummary: null,
  dataCollection: {},
  dynamicVariables: {},
  hasAudio: false,
  ...over,
});

describe("classify", () => {
  const s = { voicemail_min_secs: 20 };
  it("uses the provider's call result when present", () => {
    expect(classify(ev({ callResult: "voicemail" }), s)).toEqual({
      answered: false,
      reason: "voicemail",
    });
    expect(classify(ev({ callResult: "busy" }), s)).toEqual({ answered: false, reason: "busy" });
  });
  it("treats no words from the parent as not reached", () => {
    expect(
      classify(ev({ transcript: [{ role: "agent", message: "Namaste?", timeInCallSecs: 0 }] }), s),
    ).toEqual({ answered: false, reason: "voicemail" });
  });
  it("treats a very short call with 1-2 words as not reached", () => {
    expect(
      classify(
        ev({
          durationSecs: 8,
          transcript: [{ role: "user", message: "Hello?", timeInCallSecs: 2 }],
        }),
        s,
      ).answered,
    ).toBe(false);
  });
  it("accepts a real conversation", () => {
    expect(
      classify(
        ev({
          transcript: [{ role: "user", message: "Haan beta main theek hoon", timeInCallSecs: 3 }],
        }),
        s,
      ),
    ).toEqual({ answered: true });
  });
});

describe("parsing analysis fields", () => {
  it("parses mood 1-5", () => {
    expect(parseMood(4)).toBe(4);
    expect(parseMood("5")).toBe(5);
    expect(parseMood(9)).toBe(5);
    expect(parseMood("happy")).toBeNull();
  });
  it("matches medicine answers to the parent's list", () => {
    expect(
      parseMedicinesTaken("Metformin 500: yes; Amlodipine 5: no", [
        "Metformin 500",
        "Amlodipine 5",
        "Calcium",
      ]),
    ).toEqual([
      { name: "Metformin 500", taken: "yes" },
      { name: "Amlodipine 5", taken: "no" },
      { name: "Calcium", taken: "unclear" },
    ]);
    expect(parseMedicinesTaken("yes", ["A", "B"])).toEqual([
      { name: "A", taken: "yes" },
      { name: "B", taken: "yes" },
    ]);
    expect(parseMedicinesTaken(null, [])).toEqual([]);
  });
});
