/**
 * "Call now" from the family dashboard: an extra call today, on its own
 * slot ("manual-1", "manual-2", …) so it can never collide with the daily
 * call. Same safety rules as every call: consent, calling window, kill switch.
 */
import { and, eq, inArray, like } from "drizzle-orm";
import { checkIns, parents } from "@/db/schema/app";
import type { DbOrTx } from "@/db/types";
import { isUniqueViolation } from "@/db/errors";
import { isWithinCallWindow, localDateOf } from "@/lib/time";
import type { Settings } from "./settings";

export const MAX_MANUAL_CALLS_PER_DAY = 3;

export type ManualCallResult =
  | { ok: true; checkInId: string }
  | {
      ok: false;
      reason:
        | "not_allowed_status"
        | "outside_window"
        | "calls_disabled"
        | "limit_reached"
        | "call_in_progress";
    };

export async function requestManualCall(
  db: DbOrTx,
  parentId: string,
  now: Date,
  settings: Settings,
): Promise<ManualCallResult> {
  const [parent] = await db.select().from(parents).where(eq(parents.id, parentId)).limit(1);
  if (!parent || (parent.status !== "active" && parent.status !== "awaiting_consent")) {
    return { ok: false, reason: "not_allowed_status" };
  }
  if (!settings.calls_enabled) return { ok: false, reason: "calls_disabled" };
  if (!isWithinCallWindow(now, parent.timezone, settings.call_window))
    return { ok: false, reason: "outside_window" };

  const localDate = localDateOf(now, parent.timezone);
  const today = await db
    .select({ slot: checkIns.slot, status: checkIns.status })
    .from(checkIns)
    .where(and(eq(checkIns.parentId, parent.id), eq(checkIns.localDate, localDate)));
  if (
    today.some(
      (c) =>
        c.status === "dialing" ||
        c.status === "in_progress" ||
        (c.status === "scheduled" && c.slot.startsWith("manual")),
    )
  ) {
    return { ok: false, reason: "call_in_progress" };
  }
  const manualCount = today.filter((c) => c.slot.startsWith("manual-")).length;
  if (manualCount >= MAX_MANUAL_CALLS_PER_DAY) return { ok: false, reason: "limit_reached" };

  // Before consent, any call is the introduction call.
  const isConsentCall = parent.status === "awaiting_consent";
  for (let n = manualCount + 1; n <= MAX_MANUAL_CALLS_PER_DAY; n++) {
    try {
      const [row] = await db
        .insert(checkIns)
        .values({
          parentId: parent.id,
          localDate,
          slot: `manual-${n}`,
          status: "scheduled",
          isConsentCall,
          scheduledFor: now,
          nextAttemptAt: now,
          maxAttempts: 1, // a "call now" is not retried; the family is right there
        })
        .returning({ id: checkIns.id });
      return { ok: true, checkInId: row!.id };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Someone pressed twice: try the next slot number.
    }
  }
  return { ok: false, reason: "limit_reached" };
}

/** Manual slots that are still waiting (used by tests / admin). */
export async function pendingManualCalls(db: DbOrTx, parentId: string) {
  return db
    .select()
    .from(checkIns)
    .where(
      and(
        eq(checkIns.parentId, parentId),
        like(checkIns.slot, "manual-%"),
        inArray(checkIns.status, ["scheduled"]),
      ),
    );
}
