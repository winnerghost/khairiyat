/**
 * Parent status changes caused by calls (consent, opt-out) or time (auto-resume).
 * Each change is conditional on the current status, so repeats are no-ops.
 */
import { and, eq, inArray } from "drizzle-orm";
import { checkIns, parents } from "@/db/schema/app";
import type { DbOrTx } from "@/db/types";

export async function resumeParentIfDue(db: DbOrTx, parentId: string, now: Date): Promise<void> {
  const [p] = await db.select().from(parents).where(eq(parents.id, parentId)).limit(1);
  if (!p || p.status !== "paused" || !p.pausedUntil || p.pausedUntil > now) return;
  await db
    .update(parents)
    .set({
      status: p.consentGivenAt ? "active" : "awaiting_consent",
      pausedUntil: null,
      pauseReason: null,
      updatedAt: now,
    })
    .where(and(eq(parents.id, parentId), eq(parents.status, "paused")));
}

export async function markConsentGiven(db: DbOrTx, parentId: string, now: Date): Promise<boolean> {
  const rows = await db
    .update(parents)
    .set({ status: "active", consentGivenAt: now, consentRefusedAt: null, updatedAt: now })
    .where(and(eq(parents.id, parentId), eq(parents.status, "awaiting_consent")))
    .returning({ id: parents.id });
  return rows.length > 0;
}

export async function markConsentRefused(
  db: DbOrTx,
  parentId: string,
  now: Date,
): Promise<boolean> {
  const rows = await db
    .update(parents)
    .set({ status: "consent_refused", consentRefusedAt: now, updatedAt: now })
    .where(
      and(
        eq(parents.id, parentId),
        inArray(parents.status, ["awaiting_consent", "active", "paused"]),
      ),
    )
    .returning({ id: parents.id });
  await cancelOpenCheckIns(db, parentId, now);
  return rows.length > 0;
}

/** The parent asked us to stop. Stop immediately; the family is told. */
export async function markOptedOut(db: DbOrTx, parentId: string, now: Date): Promise<boolean> {
  const rows = await db
    .update(parents)
    .set({ status: "opted_out", optedOutAt: now, updatedAt: now })
    .where(
      and(
        eq(parents.id, parentId),
        inArray(parents.status, ["awaiting_consent", "active", "paused"]),
      ),
    )
    .returning({ id: parents.id });
  await cancelOpenCheckIns(db, parentId, now);
  return rows.length > 0;
}

export async function cancelOpenCheckIns(db: DbOrTx, parentId: string, now: Date): Promise<void> {
  await db
    .update(checkIns)
    .set({ status: "cancelled", finishedAt: now, updatedAt: now })
    .where(
      and(
        eq(checkIns.parentId, parentId),
        inArray(checkIns.status, ["scheduled", "retry_scheduled"]),
      ),
    );
}
