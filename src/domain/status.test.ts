import { describe, expect, it } from "vitest";
import { buildWeeklyDigest, describeToday, summariseMeds, type DigestDay } from "./status";

const base = {
  parentStatus: "active" as const,
  pausedUntil: null,
  timezone: "Asia/Kolkata",
  isCallDay: true,
  scheduledAt: new Date("2026-11-24T04:00:00Z"),
  checkIn: null,
  result: null,
  alertSent: false,
};

describe("today's status card", () => {
  it("shows the planned time", () => {
    expect(describeToday(base).headline).toBe("Call planned at 9:30 am");
  });
  it("shows a gentle completed summary", () => {
    const s = describeToday({
      ...base,
      checkIn: {
        status: "completed",
        isConsentCall: false,
        nextAttemptAt: null,
        attemptsCount: 1,
        maxAttempts: 3,
        finishedAt: null,
      },
      result: {
        mood: 5,
        medsSummary: "yes",
        redFlag: false,
        distress: false,
        answeredAt: new Date("2026-11-24T03:42:00Z"),
      },
    });
    expect(s).toEqual({
      tone: "success",
      headline: "Spoke at 9:12 am · sounded cheerful · meds: yes",
      detail: null,
    });
  });
  it("shows retries and alerts", () => {
    const retry = describeToday({
      ...base,
      checkIn: {
        status: "retry_scheduled",
        isConsentCall: false,
        nextAttemptAt: new Date("2026-11-24T04:15:00Z"),
        attemptsCount: 1,
        maxAttempts: 3,
        finishedAt: null,
      },
    });
    expect(retry.headline).toBe("Not reached yet · trying again at 9:45 am");
    const gone = describeToday({
      ...base,
      alertSent: true,
      checkIn: {
        status: "unreachable",
        isConsentCall: false,
        nextAttemptAt: null,
        attemptsCount: 3,
        maxAttempts: 3,
        finishedAt: null,
      },
    });
    expect(gone).toMatchObject({
      tone: "danger",
      headline: "Not reached after 3 tries · alert sent",
    });
  });
  it("is honest about opt-out", () => {
    expect(describeToday({ ...base, parentStatus: "opted_out" }).headline).toContain("stopped");
  });
});

describe("meds and digest", () => {
  it("summarises medicine answers", () => {
    expect(summariseMeds([{ taken: "yes" }, { taken: "yes" }])).toBe("yes");
    expect(summariseMeds([{ taken: "yes" }, { taken: "no" }])).toBe("partly");
    expect(summariseMeds([])).toBeNull();
  });
  it("writes a factual weekly digest", () => {
    const day = (
      d: number,
      mood: number | null,
      status: DigestDay["status"] = "completed",
    ): DigestDay => ({
      localDate: `2026-11-${String(d).padStart(2, "0")}`,
      status,
      mood,
      meds: status === "completed" ? "yes" : null,
      painOrSymptoms: null,
      redFlag: false,
    });
    const last = [1, 2, 3, 4, 5, 6, 7].map((d) => day(d, 2));
    const now = [8, 9, 10, 11, 12, 13].map((d) => day(d, 4)).concat(day(14, null, "unreachable"));
    const dg = buildWeeklyDigest(now, last, "Maa");
    expect(dg.callsCompleted).toBe(6);
    expect(dg.callsMissed).toBe(1);
    expect(dg.lines.join(" ")).toContain("brighter than last week");
    expect(dg.lines.join(" ")).toContain("self-reported");
  });
});
