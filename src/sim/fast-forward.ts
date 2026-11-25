/**
 * Drive the REAL engine through virtual time (fake clock), jumping over
 * quiet periods. Used by:
 * - the demo seed (3 weeks of realistic history in about a minute),
 * - demo start-up (catch up on days the demo wasn't running),
 * - the week simulation (50 parents, outages, lost webhooks…).
 *
 * Node-only (scripts and demo mode).
 */
import { and, eq, inArray, min } from "drizzle-orm";
import {
  callAttempts,
  checkIns,
  mockCalls,
  notifications,
  parents,
  schedules,
} from "@/db/schema/app";
import type { DbOrTx } from "@/db/types";
import type { FakeClock } from "@/engine/clock";
import type { EngineDeps } from "@/engine/deps";
import { getSettings } from "@/engine/settings";
import { runTick, type TickStats } from "@/engine/tick";
import { addDaysToLocalDate, localDateOf, zonedToInstant } from "@/lib/time";

export interface FastForwardOptions {
  /** Longest jump when nothing is happening (default 60 min). */
  maxStepMinutes?: number;
  /** Called after every tick (simulation checks invariants here). */
  onTick?: (stats: TickStats, now: Date) => Promise<void> | void;
  /**
   * Checked after every tick: return true to stop early (the hosted demo
   * advances in short steps). The next run resumes from the last tick.
   */
  shouldStop?: () => boolean;
}

async function nextScheduledCall(db: DbOrTx, now: Date): Promise<number | null> {
  const rows = await db
    .select({ callTime: schedules.callTime, tz: parents.timezone })
    .from(schedules)
    .innerJoin(parents, eq(parents.id, schedules.parentId))
    .where(inArray(parents.status, ["active", "awaiting_consent", "paused"]));
  // (Cheap and good enough: next occurrence of any call time, today or tomorrow.)
  let best: number | null = null;
  for (const r of rows) {
    const today = localDateOf(now, r.tz);
    for (const d of [today, addDaysToLocalDate(today, 1)]) {
      const t = zonedToInstant(d, r.callTime, r.tz).getTime();
      if (t > now.getTime() && (best === null || t < best)) best = t;
    }
  }
  return best;
}

async function nextEventAt(
  deps: EngineDeps,
  now: Date,
  reconcileMinutes: number,
): Promise<number | null> {
  const db = deps.db;
  const [ci] = await db
    .select({ t: min(checkIns.nextAttemptAt) })
    .from(checkIns)
    .where(inArray(checkIns.status, ["scheduled", "retry_scheduled"]));
  const [mc] = await db
    .select({ t: min(mockCalls.deliverAt) })
    .from(mockCalls)
    .where(and(eq(mockCalls.delivered, false), eq(mockCalls.dropWebhook, false)));
  const [nt] = await db
    .select({ t: min(notifications.nextAttemptAt) })
    .from(notifications)
    .where(inArray(notifications.status, ["pending", "failed"]));
  const [ca] = await db
    .select({ t: min(callAttempts.dialedAt) })
    .from(callAttempts)
    .where(inArray(callAttempts.status, ["dialing", "in_progress"]));
  const ms = (v: unknown): number | undefined =>
    v ? new Date(v as string | Date).getTime() : undefined;
  const dialing = ms(ca?.t);
  const candidates = [
    ms(ci?.t),
    ms(mc?.t),
    ms(nt?.t),
    dialing !== undefined ? dialing + reconcileMinutes * 60_000 : undefined,
    await nextScheduledCall(db, now),
  ].filter((x): x is number => typeof x === "number");
  if (candidates.length === 0) return null;
  return Math.min(...candidates);
}

export async function fastForward(
  deps: EngineDeps,
  clock: FakeClock,
  until: Date,
  opts: FastForwardOptions = {},
): Promise<{ ticks: number; reached: boolean }> {
  const maxStep = (opts.maxStepMinutes ?? 60) * 60_000;
  const settings = await getSettings(deps.db);
  let ticks = 0;
  while (clock.now().getTime() < until.getTime()) {
    const stats = await runTick(deps);
    ticks++;
    await opts.onTick?.(stats, clock.now());
    const now = clock.now().getTime();
    const next = await nextEventAt(deps, clock.now(), settings.reconcile_after_minutes);
    // Tick every minute while something is due soon; otherwise jump ahead.
    let target =
      next === null ? now + maxStep : Math.max(now + 60_000, Math.min(next, now + maxStep));
    // Align to whole minutes, like a real once-a-minute cron.
    target = Math.ceil(target / 60_000) * 60_000;
    clock.set(new Date(Math.min(target, until.getTime())));
    if (target >= until.getTime()) break;
    if (opts.shouldStop?.()) return { ticks, reached: false };
  }
  return { ticks, reached: true };
}
