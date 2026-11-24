/**
 * Step 1 of every tick: create today's check-ins that are due.
 *
 * Catch-up friendly: if ticks were missed for a while, the next tick still
 * creates the check-in (up to `late_call_limit_minutes` late). The unique
 * key (parent_id, local_date, slot) makes duplicate ticks harmless.
 */
import { and, eq, inArray, lte } from "drizzle-orm";
import { alerts, checkIns, parents, schedules, subscriptions } from "@/db/schema/app";
import { isoWeekdayOf, isWithinCallWindow, localDateOf, zonedToInstant } from "@/lib/time";
import type { EngineDeps } from "./deps";
import { billingAllowsCalls, slotForParent } from "./eligibility";
import { enqueueFamilyMessage } from "./notify";
import type { Settings } from "./settings";
import { resumeParentIfDue } from "./lifecycle";

export async function autoResumePaused(deps: EngineDeps): Promise<number> {
  const now = deps.clock.now();
  const due = await deps.db
    .select({ id: parents.id })
    .from(parents)
    .where(and(eq(parents.status, "paused"), lte(parents.pausedUntil, now)));
  for (const p of due) await resumeParentIfDue(deps.db, p.id, now);
  return due.length;
}

export async function materializeDueCheckIns(
  deps: EngineDeps,
  settings: Settings,
): Promise<{ created: number; missed: number }> {
  const now = deps.clock.now();
  const rows = await deps.db
    .select({ parent: parents, schedule: schedules, sub: subscriptions })
    .from(parents)
    .innerJoin(
      schedules,
      and(
        eq(schedules.parentId, parents.id),
        eq(schedules.active, true),
        eq(schedules.slot, "daily"),
      ),
    )
    .leftJoin(subscriptions, eq(subscriptions.parentId, parents.id))
    .where(inArray(parents.status, ["active", "awaiting_consent"]));

  type NewCheckIn = typeof checkIns.$inferInsert;
  const toCreate: NewCheckIn[] = [];
  const missed: { parent: (typeof rows)[number]["parent"]; localDate: string; slot: string }[] = [];
  const lateLimitMs = settings.late_call_limit_minutes * 60_000;

  for (const { parent, schedule, sub } of rows) {
    const slot = slotForParent(parent.status);
    if (!slot) continue;
    if (!billingAllowsCalls(sub, now)) continue;
    const localDate = localDateOf(now, parent.timezone);
    if (!schedule.daysOfWeek.includes(isoWeekdayOf(localDate))) continue;
    const scheduledFor = zonedToInstant(localDate, schedule.callTime, parent.timezone);
    if (now < scheduledFor) continue; // not yet

    // Ignore call times from before the parent was set up / last changed (no false alarms).
    const eligibleSince = Math.max(
      parent.onboardingCompletedAt?.getTime() ?? 0,
      schedule.updatedAt.getTime(),
      parent.consentGivenAt?.getTime() ?? 0,
    );
    if (scheduledFor.getTime() < eligibleSince) continue;

    const late = now.getTime() - scheduledFor.getTime();
    if (late > lateLimitMs || !isWithinCallWindow(now, parent.timezone, settings.call_window)) {
      missed.push({ parent, localDate, slot });
      continue;
    }
    toCreate.push({
      parentId: parent.id,
      localDate,
      slot,
      status: "scheduled",
      isConsentCall: slot === "consent",
      scheduledFor,
      nextAttemptAt: now,
      maxAttempts: 1 + settings.retry_policy.maxRetries,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Skip anything that already exists today (cheap: one query), and never
  // give a parent who agreed on today's consent call a daily call too.
  const candidateIds = [
    ...new Set(
      [...toCreate, ...missed.map((m) => ({ parentId: m.parent.id }))].map((c) => c.parentId),
    ),
  ];
  const candidateDates = [
    ...new Set([...toCreate.map((c) => c.localDate), ...missed.map((m) => m.localDate)]),
  ];
  if (candidateIds.length > 0) {
    const existing = await deps.db
      .select({ parentId: checkIns.parentId, localDate: checkIns.localDate, slot: checkIns.slot })
      .from(checkIns)
      .where(
        and(
          inArray(checkIns.parentId, candidateIds),
          inArray(checkIns.localDate, candidateDates),
          inArray(checkIns.slot, ["daily", "consent"]),
        ),
      );
    const have = new Set(existing.map((e) => `${e.parentId}:${e.localDate}:${e.slot}`));
    const consentToday = new Set(
      existing.filter((e) => e.slot === "consent").map((e) => `${e.parentId}:${e.localDate}`),
    );
    const keep = (parentId: string, localDate: string, slot: string) =>
      !have.has(`${parentId}:${localDate}:${slot}`) &&
      !(slot === "daily" && consentToday.has(`${parentId}:${localDate}`));
    for (let i = toCreate.length - 1; i >= 0; i--) {
      const c = toCreate[i]!;
      if (!keep(c.parentId, c.localDate, c.slot)) toCreate.splice(i, 1);
    }
    for (let i = missed.length - 1; i >= 0; i--) {
      const m = missed[i]!;
      if (!keep(m.parent.id, m.localDate, m.slot)) missed.splice(i, 1);
    }
  }

  let created = 0;
  for (let i = 0; i < toCreate.length; i += 500) {
    const batch = toCreate.slice(i, i + 500);
    const inserted = await deps.db
      .insert(checkIns)
      .values(batch)
      .onConflictDoNothing({ target: [checkIns.parentId, checkIns.localDate, checkIns.slot] })
      .returning({ id: checkIns.id });
    created += inserted.length;
  }

  // Our own fault (scheduler was down too long): never silent. Tell the family once.
  let missedCount = 0;
  for (const m of missed) {
    const inserted = await deps.db
      .insert(checkIns)
      .values({
        parentId: m.parent.id,
        localDate: m.localDate,
        slot: m.slot,
        status: "failed",
        isConsentCall: m.slot === "consent",
        scheduledFor: now,
        lastFailureReason: "missed: scheduler was not running at the call time",
        finishedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: [checkIns.parentId, checkIns.localDate, checkIns.slot] })
      .returning({ id: checkIns.id });
    const checkInId = inserted[0]?.id;
    if (!checkInId) continue;
    missedCount++;
    const [alert] = await deps.db
      .insert(alerts)
      .values({
        familyId: m.parent.familyId,
        parentId: m.parent.id,
        checkInId,
        type: "system_failure",
        severity: "warning",
        title: `Today's call to ${m.parent.addressAs} could not be made (our fault)`,
        detail: "The scheduler was not running at the planned time.",
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: alerts.id });
    await enqueueFamilyMessage(
      deps.db,
      {
        familyId: m.parent.familyId,
        parentId: m.parent.id,
        checkInId,
        alertId: alert?.id ?? null,
        key: `call_problem:${checkInId}`,
        template: "call_problem",
        params: { en: [m.parent.addressAs], hi: [m.parent.addressAs] },
        audience: "alert",
        alertKind: "unreachable",
        priority: "normal",
      },
      now,
    );
    deps.logger.error("scheduler: missed a call (late or outside window)", {
      parentId: m.parent.id,
      localDate: m.localDate,
    });
  }

  return { created, missed: missedCount };
}
