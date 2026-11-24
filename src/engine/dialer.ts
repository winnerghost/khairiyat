/**
 * Step 2 of the tick: dial due check-ins, never more than the concurrency
 * limit at once.
 *
 * Safety order: claim rows (FOR UPDATE SKIP LOCKED) → re-check every rule →
 * insert the call_attempts row (the database trigger re-checks the calling
 * window and opt-out) → commit → only then ask the provider to dial.
 */
import { and, asc, count, eq, gt, inArray, lte } from "drizzle-orm";
import { callAttempts, checkIns, parents, subscriptions } from "@/db/schema/app";
import { dbErrorMessage, isGuardViolation } from "@/db/errors";
import type { DbOrTx } from "@/db/types";
import { isWithinCallWindow } from "@/lib/time";
import type { EngineDeps } from "./deps";
import { billingAllowsCalls, slotForParent } from "./eligibility";
import { buildCallContext } from "./memory";
import { dispatchDue } from "./notify";
import { raiseCallProblem, raiseUnreachable, recordNotReached } from "./post-call";
import type { Settings } from "./settings";

export interface DialStats {
  dialed: number;
  startFailed: number;
  cancelled: number;
  capacityLeft: number;
}

/** Calls currently ringing or talking (ignoring very old stuck ones, which reconciliation handles). */
export async function activeCallCount(db: DbOrTx, now: Date): Promise<number> {
  const since = new Date(now.getTime() - 30 * 60_000);
  const [row] = await db
    .select({ n: count() })
    .from(callAttempts)
    .where(
      and(
        inArray(callAttempts.status, ["dialing", "in_progress"]),
        gt(callAttempts.dialedAt, since),
      ),
    );
  return row?.n ?? 0;
}

export async function dialDue(deps: EngineDeps, settings: Settings): Promise<DialStats> {
  const stats: DialStats = { dialed: 0, startFailed: 0, cancelled: 0, capacityLeft: 0 };
  if (!settings.calls_enabled) return stats;
  const now = deps.clock.now();
  const capacity = settings.concurrency_limit - (await activeCallCount(deps.db, now));
  if (capacity <= 0) return stats;

  type Claimed = {
    attempt: typeof callAttempts.$inferSelect;
    checkIn: typeof checkIns.$inferSelect;
    parent: typeof parents.$inferSelect;
  };
  const toDial: Claimed[] = [];
  const toFinalize: { checkInId: string; reason: string }[] = [];

  await deps.db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(checkIns)
      .where(
        and(
          inArray(checkIns.status, ["scheduled", "retry_scheduled"]),
          lte(checkIns.nextAttemptAt, now),
        ),
      )
      .orderBy(asc(checkIns.nextAttemptAt))
      .limit(capacity)
      .for("update", { skipLocked: true });
    if (due.length === 0) return;

    const parentRows = await tx
      .select({ parent: parents, sub: subscriptions })
      .from(parents)
      .leftJoin(subscriptions, eq(subscriptions.parentId, parents.id))
      .where(
        inArray(
          parents.id,
          due.map((d) => d.parentId),
        ),
      );
    const byId = new Map(parentRows.map((r) => [r.parent.id, r]));

    for (const c of due) {
      const row = byId.get(c.parentId);
      if (!row) continue;
      const { parent, sub } = row;
      const slot = slotForParent(parent.status);
      const manual = c.slot.startsWith("manual");
      const stillWanted =
        slot !== null &&
        billingAllowsCalls(sub, now) &&
        (manual || (c.isConsentCall ? slot === "consent" : slot === "daily"));
      if (!stillWanted) {
        await tx
          .update(checkIns)
          .set({
            status: parent.status === "paused" ? "paused" : "cancelled",
            finishedAt: now,
            updatedAt: now,
            version: c.version + 1,
          })
          .where(eq(checkIns.id, c.id));
        stats.cancelled++;
        continue;
      }
      if (!isWithinCallWindow(now, parent.timezone, settings.call_window)) {
        toFinalize.push({ checkInId: c.id, reason: "outside calling window" });
        continue;
      }
      try {
        const attempt = await tx.transaction(async (sp) => {
          const [a] = await sp
            .insert(callAttempts)
            .values({
              checkInId: c.id,
              parentId: parent.id,
              attemptNo: c.attemptsCount + 1,
              provider: deps.voice.name,
              status: "dialing",
              dialedAt: now,
              createdAt: now,
            })
            .returning();
          await sp
            .update(checkIns)
            .set({
              status: "dialing",
              attemptsCount: c.attemptsCount + 1,
              // A manual call to someone who agreed is a normal call.
              isConsentCall: manual ? parent.status === "awaiting_consent" : c.isConsentCall,
              version: c.version + 1,
              updatedAt: now,
            })
            .where(eq(checkIns.id, c.id));
          return a!;
        });
        toDial.push({ attempt, checkIn: { ...c, attemptsCount: c.attemptsCount + 1 }, parent });
      } catch (error) {
        if (!isGuardViolation(error)) throw error;
        // The database refused (quiet hours / opt-out). This means a code bug: stop and tell admin.
        deps.logger.error("dialer: database guard refused a dial", {
          checkInId: c.id,
          error: dbErrorMessage(error),
        });
        toFinalize.push({ checkInId: c.id, reason: `guard: ${dbErrorMessage(error)}` });
      }
    }
  });

  for (const f of toFinalize) await finalizeUndialable(deps, f.checkInId, f.reason);

  for (const { attempt, checkIn, parent } of toDial) {
    let result;
    try {
      const ctx = await buildCallContext(deps.db, {
        parent,
        checkIn,
        attemptId: attempt.id,
        now,
        encryptionKey: deps.encryptionKey,
      });
      result = await deps.voice.startCall({
        toNumber: parent.phoneE164,
        dynamicVariables: ctx.dynamicVariables,
        maxDurationSecs: ctx.maxDurationSecs,
        voice: parent.voice,
        language: parent.language,
        meta: { parentId: parent.id, checkInId: checkIn.id, attemptId: attempt.id },
      });
    } catch (error) {
      result = {
        ok: false as const,
        error: error instanceof Error ? error.message : String(error),
        retryable: true,
      };
    }
    if (result.ok) {
      stats.dialed++;
      await deps.db
        .update(callAttempts)
        .set({
          providerConversationId: result.conversationId,
          providerCallId: result.providerCallId,
        })
        .where(eq(callAttempts.id, attempt.id));
    } else {
      stats.startFailed++;
      deps.logger.warn("dialer: provider refused to start the call", {
        checkInId: checkIn.id,
        error: result.error,
      });
      await recordNotReached(deps, attempt, "failed", settings, now);
    }
  }
  stats.capacityLeft = Math.max(0, capacity - toDial.length);
  return stats;
}

/**
 * A check-in we can no longer dial (e.g. the scheduler ran late and it's now
 * past 8 pm): close it and tell the family. Never silent.
 */
async function finalizeUndialable(
  deps: EngineDeps,
  checkInId: string,
  reason: string,
): Promise<void> {
  const now = deps.clock.now();
  const ids = await deps.db.transaction(async (tx) => {
    const [c] = await tx.select().from(checkIns).where(eq(checkIns.id, checkInId)).limit(1);
    if (!c || (c.status !== "scheduled" && c.status !== "retry_scheduled")) return [];
    const [p] = await tx.select().from(parents).where(eq(parents.id, c.parentId)).limit(1);
    if (!p) return [];
    const wasRetry = c.attemptsCount > 0;
    const updated = await tx
      .update(checkIns)
      .set({
        status: wasRetry ? "unreachable" : "failed",
        lastFailureReason: reason,
        finishedAt: now,
        version: c.version + 1,
        updatedAt: now,
      })
      .where(and(eq(checkIns.id, c.id), eq(checkIns.version, c.version)))
      .returning();
    const row = updated[0];
    if (!row || c.slot.startsWith("manual")) return [];
    return wasRetry
      ? raiseUnreachable(tx, deps, row, p, now)
      : raiseCallProblem(tx, row, p, reason, now);
  });
  if (ids.length) await dispatchDue(deps, { ids });
}
