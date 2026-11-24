/**
 * Call capacity: with N simultaneous calls and ~5 minutes per call, about
 * N × 3 calls fit in a 15-minute window. Warn families (and admin) before
 * a popular time gets too crowded, so calls don't run late.
 */
import { and, eq, inArray, ne } from "drizzle-orm";
import { parents, schedules } from "@/db/schema/app";
import type { DbOrTx } from "@/db/types";
import { localDateOf, zonedToInstant } from "@/lib/time";

const MINUTES_PER_CALL = 5;
const WINDOW_MINUTES = 15;

export function callsPerWindow(concurrency: number): number {
  return Math.max(1, Math.floor((concurrency * WINDOW_MINUTES) / MINUTES_PER_CALL));
}

/** How many other parents are booked within ±15 minutes of this time (compared as real instants). */
export async function slotLoad(
  db: DbOrTx,
  input: { callTime: string; timezone: string; now: Date; excludeParentId?: string },
): Promise<number> {
  const day = localDateOf(input.now, input.timezone);
  const target = zonedToInstant(day, input.callTime, input.timezone).getTime();
  const rows = await db
    .select({ callTime: schedules.callTime, timezone: parents.timezone })
    .from(schedules)
    .innerJoin(parents, eq(parents.id, schedules.parentId))
    .where(
      and(
        eq(schedules.active, true),
        inArray(parents.status, ["active", "awaiting_consent"]),
        input.excludeParentId ? ne(parents.id, input.excludeParentId) : undefined,
      ),
    );
  let count = 0;
  for (const r of rows) {
    const d = localDateOf(input.now, r.timezone);
    const t = zonedToInstant(d, r.callTime, r.timezone).getTime();
    if (Math.abs(t - target) <= WINDOW_MINUTES * 60_000) count++;
  }
  return count;
}

export function capacityWarning(load: number, concurrency: number): string | null {
  const cap = callsPerWindow(concurrency);
  if (load >= cap) {
    return `This time is very popular right now (${load} parents within 15 minutes). Calls may start up to ${Math.ceil(load / concurrency) * MINUTES_PER_CALL} minutes late. A slightly different time will be more punctual.`;
  }
  if (load >= Math.floor(cap * 0.8)) {
    return "This time is getting busy. Your parent's call may start a few minutes late.";
  }
  return null;
}
