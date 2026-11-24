/**
 * Time-zone helpers (Luxon handles daylight saving correctly).
 *
 * Vocabulary:
 * - instant:    a real moment (JS Date, UTC inside)
 * - local date: "YYYY-MM-DD" on the parent's calendar
 * - local time: "HH:MM" on the parent's clock
 *
 * Runtime-agnostic: safe for the engine on Node and Deno.
 */
import { DateTime, IANAZone } from "luxon";

/** The hard calling window. Settings can only narrow it, never widen it. */
export const HARD_WINDOW = { start: "08:00", end: "20:00" } as const;
/** Latest time a family may pick, leaving room for retries before 20:00. */
export const LATEST_SCHEDULE_TIME = "19:30";

export const DEFAULT_TIMEZONE = "Asia/Kolkata";

export function isValidTimeZone(tz: string): boolean {
  return IANAZone.isValidZone(tz);
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidHHMM(value: string): boolean {
  return HHMM.test(value);
}

export function hhmmToMinutes(value: string): number {
  const m = HHMM.exec(value);
  if (!m) throw new Error(`Invalid time "${value}"`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function minutesToHHMM(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Parent-local calendar date of an instant. */
export function localDateOf(instant: Date, tz: string): string {
  return DateTime.fromJSDate(instant, { zone: tz }).toISODate()!;
}

/** Parent-local clock time "HH:MM" of an instant. */
export function localTimeOf(instant: Date, tz: string): string {
  return DateTime.fromJSDate(instant, { zone: tz }).toFormat("HH:mm");
}

/** ISO weekday of a local date: 1 = Monday … 7 = Sunday. */
export function isoWeekdayOf(localDate: string): number {
  return DateTime.fromISO(localDate, { zone: "UTC" }).weekday;
}

/**
 * The instant at which it is `localTime` on `localDate` in `tz`.
 * If that local time doesn't exist (spring-forward gap), Luxon moves it
 * forward, so a 02:30 call becomes 03:30, never skipped.
 */
export function zonedToInstant(localDate: string, localTime: string, tz: string): Date {
  const dt = DateTime.fromISO(`${localDate}T${localTime}`, { zone: tz });
  if (!dt.isValid) throw new Error(`Invalid local date/time ${localDate} ${localTime} in ${tz}`);
  return dt.toJSDate();
}

export function addDaysToLocalDate(localDate: string, days: number): string {
  return DateTime.fromISO(localDate, { zone: "UTC" }).plus({ days }).toISODate()!;
}

export interface CallWindow {
  start: string;
  end: string;
}

/**
 * The effective window: settings may narrow it but never go outside 08:00–20:00.
 */
export function effectiveWindow(settings?: Partial<CallWindow>): CallWindow {
  const hardStart = hhmmToMinutes(HARD_WINDOW.start);
  const hardEnd = hhmmToMinutes(HARD_WINDOW.end);
  const s =
    settings?.start && isValidHHMM(settings.start) ? hhmmToMinutes(settings.start) : hardStart;
  const e = settings?.end && isValidHHMM(settings.end) ? hhmmToMinutes(settings.end) : hardEnd;
  const start = Math.max(s, hardStart);
  const end = Math.min(e, hardEnd);
  if (start >= end) return { ...HARD_WINDOW };
  return { start: minutesToHHMM(start), end: minutesToHHMM(end) };
}

/** True if a call may START at this instant for a parent in `tz`. */
export function isWithinCallWindow(
  instant: Date,
  tz: string,
  window?: Partial<CallWindow>,
): boolean {
  const w = effectiveWindow(window);
  const t = hhmmToMinutes(localTimeOf(instant, tz));
  return t >= hhmmToMinutes(w.start) && t < hhmmToMinutes(w.end);
}

/** "9:12 am" in a zone, for people. */
export function formatClock(instant: Date, tz: string): string {
  return DateTime.fromJSDate(instant, { zone: tz }).toFormat("h:mm a").toLowerCase();
}

/** "Tue 24 Nov, 9:12 am". */
export function formatDayTime(instant: Date, tz: string): string {
  return DateTime.fromJSDate(instant, { zone: tz })
    .toFormat("ccc d LLL, h:mm a")
    .replace(/AM|PM/, (m) => m.toLowerCase());
}

/** "Tue 24 Nov" for a local date. */
export function formatLocalDate(localDate: string): string {
  return DateTime.fromISO(localDate, { zone: "UTC" }).toFormat("ccc d LLL");
}

/** Convert a parent-local "HH:MM" today into the viewer's zone, e.g. for families abroad. */
export function convertLocalTime(
  localTime: string,
  fromTz: string,
  toTz: string,
  onDate: Date,
): { time: string; dayShift: number } {
  const localDate = localDateOf(onDate, fromTz);
  const instant = zonedToInstant(localDate, localTime, fromTz);
  const there = DateTime.fromJSDate(instant, { zone: toTz });
  const dayShift = Math.round(
    there.startOf("day").diff(DateTime.fromISO(localDate, { zone: toTz }).startOf("day"), "days")
      .days,
  );
  return { time: there.toFormat("h:mm a").toLowerCase(), dayShift };
}

/** A short list of time zones families commonly live in (onboarding dropdown). */
export const COMMON_TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Qatar",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "America/Toronto",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
] as const;
