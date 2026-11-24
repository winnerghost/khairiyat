import { describe, expect, it } from "vitest";
import {
  convertLocalTime,
  effectiveWindow,
  isoWeekdayOf,
  isWithinCallWindow,
  localDateOf,
  localTimeOf,
  zonedToInstant,
} from "./time";

describe("time zones", () => {
  it("converts IST local time to the right instant", () => {
    expect(zonedToInstant("2026-11-24", "09:30", "Asia/Kolkata").toISOString()).toBe(
      "2026-11-24T04:00:00.000Z",
    );
  });

  it("knows the parent's local date even when UTC is still 'yesterday'", () => {
    const instant = new Date("2026-11-23T20:00:00Z"); // 01:30 IST on the 24th
    expect(localDateOf(instant, "Asia/Kolkata")).toBe("2026-11-24");
    expect(localTimeOf(instant, "Asia/Kolkata")).toBe("01:30");
  });

  it("handles daylight saving for a parent in London", () => {
    expect(zonedToInstant("2026-07-01", "09:00", "Europe/London").toISOString()).toBe(
      "2026-07-01T08:00:00.000Z",
    );
    expect(zonedToInstant("2026-12-01", "09:00", "Europe/London").toISOString()).toBe(
      "2026-12-01T09:00:00.000Z",
    );
  });

  it("moves a non-existent spring-forward time forward instead of skipping it", () => {
    // 29 Mar 2026, clocks jump 01:00 → 02:00 in London.
    const instant = zonedToInstant("2026-03-29", "01:30", "Europe/London");
    expect(localTimeOf(instant, "Europe/London")).toBe("02:30");
  });

  it("computes ISO weekdays", () => {
    expect(isoWeekdayOf("2026-11-23")).toBe(1); // Monday
    expect(isoWeekdayOf("2026-11-29")).toBe(7); // Sunday
  });

  it("shows a parent's 9:30 IST call time to a son in New York", () => {
    const res = convertLocalTime(
      "09:30",
      "Asia/Kolkata",
      "America/New_York",
      new Date("2026-11-24T00:00:00Z"),
    );
    expect(res).toEqual({ time: "11:00 pm", dayShift: -1 });
  });
});

describe("calling window", () => {
  it("allows 08:00 up to 19:59 and refuses 20:00", () => {
    const tz = "Asia/Kolkata";
    expect(isWithinCallWindow(zonedToInstant("2026-11-24", "07:59", tz), tz)).toBe(false);
    expect(isWithinCallWindow(zonedToInstant("2026-11-24", "08:00", tz), tz)).toBe(true);
    expect(isWithinCallWindow(zonedToInstant("2026-11-24", "19:59", tz), tz)).toBe(true);
    expect(isWithinCallWindow(zonedToInstant("2026-11-24", "20:00", tz), tz)).toBe(false);
  });

  it("lets settings narrow the window but never widen it", () => {
    expect(effectiveWindow({ start: "06:00", end: "22:00" })).toEqual({
      start: "08:00",
      end: "20:00",
    });
    expect(effectiveWindow({ start: "09:00", end: "18:00" })).toEqual({
      start: "09:00",
      end: "18:00",
    });
    expect(effectiveWindow({ start: "19:00", end: "09:00" })).toEqual({
      start: "08:00",
      end: "20:00",
    });
  });
});
