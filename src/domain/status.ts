/**
 * Plain-language descriptions for the family: today's status card, mood
 * words, and the weekly "what changed" digest. Pure functions (tested).
 *
 * Honesty rules: everything is "what they told us" (self-reported); no
 * medical conclusions; gentle wording even when something was missed.
 */
import { formatClock } from "@/lib/time";

export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

export const MOOD_WORDS: Record<number, string> = {
  1: "very low",
  2: "a bit low",
  3: "okay",
  4: "good",
  5: "cheerful",
};

export function moodWord(mood: number | null | undefined): string | null {
  if (!mood) return null;
  return MOOD_WORDS[Math.max(1, Math.min(5, Math.round(mood)))] ?? null;
}

type ParentStatus =
  "onboarding" | "awaiting_consent" | "active" | "paused" | "opted_out" | "consent_refused";
type CheckInStatus =
  | "scheduled"
  | "dialing"
  | "in_progress"
  | "completed"
  | "not_answered"
  | "retry_scheduled"
  | "unreachable"
  | "failed"
  | "skipped"
  | "paused"
  | "cancelled"
  | "needs_review";

export interface TodayInput {
  parentStatus: ParentStatus;
  pausedUntil: Date | null;
  timezone: string;
  isCallDay: boolean;
  scheduledAt: Date | null; // today's planned call time (if any)
  checkIn: {
    status: CheckInStatus;
    isConsentCall: boolean;
    nextAttemptAt: Date | null;
    attemptsCount: number;
    maxAttempts: number;
    finishedAt: Date | null;
  } | null;
  result: {
    mood: number | null;
    medsSummary: "yes" | "partly" | "no" | "unclear" | null;
    redFlag: boolean;
    distress: boolean;
    answeredAt: Date | null;
  } | null;
  alertSent: boolean;
}

export interface TodayStatus {
  tone: Tone;
  headline: string;
  detail: string | null;
}

export function describeToday(input: TodayInput): TodayStatus {
  const tz = input.timezone;
  const at = (d: Date) => formatClock(d, tz);

  switch (input.parentStatus) {
    case "onboarding":
      return {
        tone: "neutral",
        headline: "Setup not finished",
        detail: "Finish setup to start calls.",
      };
    case "opted_out":
      return {
        tone: "warning",
        headline: "Calls stopped at your parent's request",
        detail:
          "They asked us not to call. We won't call again unless you restart after talking to them.",
      };
    case "consent_refused":
      return {
        tone: "warning",
        headline: "Your parent said no to daily calls",
        detail:
          "We have paused. You can talk to them and ask us to try the introduction call again.",
      };
    case "paused":
      return {
        tone: "neutral",
        headline: "Calls paused",
        detail: input.pausedUntil
          ? `Resuming on ${input.pausedUntil.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.`
          : "Resume whenever you're ready.",
      };
    default:
      break;
  }

  const c = input.checkIn;
  if (!c) {
    if (input.parentStatus === "awaiting_consent") {
      return {
        tone: "info",
        headline: "Introduction call coming up",
        detail: input.scheduledAt
          ? `The first call (to introduce ourselves and ask permission) is planned around ${at(input.scheduledAt)}.`
          : "The first call introduces the assistant and asks permission. It happens at the next call time.",
      };
    }
    if (!input.isCallDay)
      return {
        tone: "neutral",
        headline: "No call today",
        detail: "Today isn't one of the chosen days.",
      };
    return {
      tone: "info",
      headline: input.scheduledAt
        ? `Call planned at ${at(input.scheduledAt)}`
        : "Call planned today",
      detail: null,
    };
  }

  const label = c.isConsentCall ? "Introduction call" : "Call";
  switch (c.status) {
    case "scheduled":
      return {
        tone: "info",
        headline: `${label} planned at ${input.scheduledAt ? at(input.scheduledAt) : "the usual time"}`,
        detail: null,
      };
    case "dialing":
    case "in_progress":
      return { tone: "info", headline: "On a call right now", detail: null };
    case "retry_scheduled":
    case "not_answered":
      return {
        tone: "warning",
        headline: c.nextAttemptAt
          ? `Not reached yet · trying again at ${at(c.nextAttemptAt)}`
          : "Not reached yet · trying again soon",
        detail: `Attempt ${c.attemptsCount} of ${c.maxAttempts}.`,
      };
    case "unreachable":
      return {
        tone: "danger",
        headline: `Not reached after ${c.attemptsCount} tries${input.alertSent ? " · alert sent" : ""}`,
        detail: "Please try calling them yourself or ask someone nearby to check.",
      };
    case "failed":
    case "needs_review":
      return {
        tone: "warning",
        headline: "Today's call had a problem on our side",
        detail: "We've been alerted and are looking into it. Sorry about this.",
      };
    case "skipped":
      return {
        tone: "neutral",
        headline: "Skipped today",
        detail: "As you asked. Calls continue tomorrow.",
      };
    case "paused":
    case "cancelled":
      return { tone: "neutral", headline: "No call today", detail: null };
    case "completed": {
      const r = input.result;
      if (!r) return { tone: "success", headline: "Spoke today", detail: null };
      const parts = [
        r.answeredAt ? `Spoke at ${at(r.answeredAt)}` : "Spoke today",
        moodWord(r.mood) ? `sounded ${moodWord(r.mood)}` : null,
        r.medsSummary ? `meds: ${medsLabel(r.medsSummary)}` : null,
      ].filter(Boolean);
      if (r.redFlag || r.distress) {
        return {
          tone: "danger",
          headline: parts.join(" · "),
          detail: `Something worrying was mentioned${input.alertSent ? " · alert sent" : ""}. See the call notes below.`,
        };
      }
      return { tone: "success", headline: parts.join(" · "), detail: null };
    }
  }
}

export function medsLabel(m: "yes" | "partly" | "no" | "unclear"): string {
  return { yes: "yes", partly: "some", no: "not yet", unclear: "unclear" }[m];
}

/** Collapse per-medicine answers into one summary word. */
export function summariseMeds(
  answers: { taken: "yes" | "no" | "unclear" }[],
): "yes" | "partly" | "no" | "unclear" | null {
  if (answers.length === 0) return null;
  const yes = answers.filter((a) => a.taken === "yes").length;
  const no = answers.filter((a) => a.taken === "no").length;
  if (yes === answers.length) return "yes";
  if (no === answers.length) return "no";
  if (yes > 0) return "partly";
  return "unclear";
}

// ── Weekly digest ────────────────────────────────────────────────────────

export interface DigestDay {
  localDate: string;
  status: CheckInStatus | "none";
  mood: number | null;
  meds: "yes" | "partly" | "no" | "unclear" | null;
  painOrSymptoms: string | null;
  redFlag: boolean;
}

export interface WeeklyDigest {
  lines: string[];
  callsCompleted: number;
  callsMissed: number;
  avgMood: number | null;
}

function avg(nums: number[]): number | null {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

/**
 * "What changed this week" compared with the week before. Plain sentences,
 * factual and gentle, never a medical judgement.
 */
export function buildWeeklyDigest(
  thisWeek: DigestDay[],
  lastWeek: DigestDay[],
  name: string,
): WeeklyDigest {
  const done = thisWeek.filter((d) => d.status === "completed");
  const missed = thisWeek.filter((d) => d.status === "unreachable");
  const moodNow = avg(done.map((d) => d.mood).filter((m): m is number => m !== null));
  const moodBefore = avg(
    lastWeek
      .filter((d) => d.status === "completed")
      .map((d) => d.mood)
      .filter((m): m is number => m !== null),
  );
  const lines: string[] = [];

  if (done.length === 0) {
    lines.push(`We didn't get to speak with ${name} this week.`);
  } else {
    lines.push(`Spoke with ${name} on ${done.length} day${done.length === 1 ? "" : "s"}.`);
  }
  if (missed.length > 0) {
    lines.push(
      `Couldn't reach them on ${missed.length} day${missed.length === 1 ? "" : "s"} (you were alerted each time).`,
    );
  }
  if (moodNow !== null) {
    const word = moodWord(moodNow);
    if (moodBefore !== null && moodNow - moodBefore >= 0.6)
      lines.push(`Sounded brighter than last week (mostly ${word}).`);
    else if (moodBefore !== null && moodBefore - moodNow >= 0.6)
      lines.push(
        `Sounded a little lower than last week (mostly ${word}). A call from you might cheer them up.`,
      );
    else lines.push(`Mood was mostly ${word}, similar to last week.`);
  }
  const medDays = done.filter((d) => d.meds !== null);
  if (medDays.length > 0) {
    const allYes = medDays.filter((d) => d.meds === "yes").length;
    lines.push(
      `Said they took their medicines on ${allYes} of ${medDays.length} days (self-reported).`,
    );
  }
  const symptoms = Array.from(
    new Set(done.map((d) => d.painOrSymptoms).filter((s): s is string => !!s && s.length > 0)),
  );
  if (symptoms.length > 0) lines.push(`Mentioned: ${symptoms.slice(0, 3).join("; ")}.`);
  const flags = thisWeek.filter((d) => d.redFlag).length;
  if (flags > 0)
    lines.push(`${flags} call${flags === 1 ? "" : "s"} had something worrying; you were alerted.`);

  return { lines, callsCompleted: done.length, callsMissed: missed.length, avgMood: moodNow };
}
