/**
 * Read models for the admin panel (the founder's view of everything).
 */
import { and, count, desc, eq, gte, ilike, inArray, lt, or, sql, sum } from "drizzle-orm";
import {
  alerts,
  auditLogs,
  callAttempts,
  checkIns,
  familyMembers,
  families,
  jobRuns,
  notifications,
  parents,
  payments,
  plans,
  problemReports,
  schedules,
  subscriptions,
  webhookEvents,
} from "@/db/schema/app";
import { user } from "@/db/schema/auth";
import type { DbOrTx } from "@/db/types";
import { activeCallCount } from "@/engine/dialer";
import type { Settings } from "@/engine/settings";
import { localDateOf, zonedToInstant } from "@/lib/time";

export async function audit(
  db: DbOrTx,
  actor: { id: string; email: string },
  action: string,
  target: { type: string; id: string },
  details: Record<string, unknown> = {},
): Promise<void> {
  await db.insert(auditLogs).values({
    actorUserId: actor.id,
    actorLabel: actor.email,
    action,
    targetType: target.type,
    targetId: target.id,
    details,
  });
}

/** Today (IST calendar day) in UTC instants. */
function todayBoundsIST(now: Date) {
  const d = localDateOf(now, "Asia/Kolkata");
  const start = zonedToInstant(d, "00:00", "Asia/Kolkata");
  return { start, end: new Date(start.getTime() + 24 * 3600_000), date: d };
}

export async function getTodayOverview(db: DbOrTx, now: Date, settings: Settings) {
  const { start, end, date } = todayBoundsIST(now);
  const rows = await db
    .select({ status: checkIns.status, n: count() })
    .from(checkIns)
    .where(and(gte(checkIns.scheduledFor, start), lt(checkIns.scheduledFor, end)))
    .groupBy(checkIns.status);
  const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
  const openAlerts = await db
    .select({
      a: alerts,
      parentName: parents.name,
      addressAs: parents.addressAs,
      familyName: families.name,
    })
    .from(alerts)
    .leftJoin(parents, eq(parents.id, alerts.parentId))
    .innerJoin(families, eq(families.id, alerts.familyId))
    .where(eq(alerts.status, "open"))
    .orderBy(desc(alerts.createdAt))
    .limit(20);
  const [lastTick] = await db
    .select()
    .from(jobRuns)
    .where(eq(jobRuns.job, "tick"))
    .orderBy(desc(jobRuns.startedAt))
    .limit(1);
  const [failedTicks] = await db
    .select({ n: count() })
    .from(jobRuns)
    .where(
      and(
        eq(jobRuns.job, "tick"),
        eq(jobRuns.ok, false),
        gte(jobRuns.startedAt, new Date(now.getTime() - 3600_000)),
      ),
    );
  const [deadMsgs] = await db
    .select({ n: count() })
    .from(notifications)
    .where(eq(notifications.status, "dead"));
  const [retryingMsgs] = await db
    .select({ n: count() })
    .from(notifications)
    .where(eq(notifications.status, "failed"));
  const [badHooks] = await db
    .select({ n: count() })
    .from(webhookEvents)
    .where(inArray(webhookEvents.status, ["failed"]));
  const active = await activeCallCount(db, now);
  const [scheduledToday] = await db
    .select({ n: count() })
    .from(parents)
    .where(inArray(parents.status, ["active", "awaiting_consent"]));
  return {
    date,
    byStatus,
    openAlerts,
    lastTick,
    failedTicksLastHour: failedTicks?.n ?? 0,
    deadMessages: deadMsgs?.n ?? 0,
    retryingMessages: retryingMsgs?.n ?? 0,
    failedWebhooks: badHooks?.n ?? 0,
    activeCalls: active,
    concurrency: settings.concurrency_limit,
    callingParents: scheduledToday?.n ?? 0,
    callsEnabled: settings.calls_enabled,
  };
}

/** Parents per 30-minute window of call time (IST), vs what the concurrency allows. */
export async function getCapacity(db: DbOrTx, now: Date, settings: Settings) {
  const rows = await db
    .select({ callTime: schedules.callTime, tz: parents.timezone })
    .from(schedules)
    .innerJoin(parents, eq(parents.id, schedules.parentId))
    .where(
      and(eq(schedules.active, true), inArray(parents.status, ["active", "awaiting_consent"])),
    );
  const buckets = new Map<string, number>();
  for (const r of rows) {
    const inst = zonedToInstant(localDateOf(now, r.tz), r.callTime, r.tz);
    const ist = new Date(inst.getTime() + 5.5 * 3600_000);
    const h = ist.getUTCHours();
    const m = ist.getUTCMinutes() < 30 ? "00" : "30";
    const key = `${String(h).padStart(2, "0")}:${m}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const perWindow = settings.concurrency_limit * 6; // ~5-minute calls → 6 per line per 30 minutes
  return [...buckets.entries()]
    .sort()
    .map(([window, n]) => ({ window, parents: n, capacity: perWindow, over: n > perWindow }));
}

export async function listFamilies(db: DbOrTx, q: string) {
  const term = q.trim();
  const fams = await db
    .select({ f: families, ownerEmail: user.email, ownerName: familyMembers.displayName })
    .from(families)
    .leftJoin(
      familyMembers,
      and(eq(familyMembers.familyId, families.id), eq(familyMembers.role, "owner")),
    )
    .leftJoin(user, eq(user.id, familyMembers.userId))
    .where(
      term
        ? or(
            ilike(families.name, `%${term}%`),
            ilike(user.email, `%${term}%`),
            sql`exists (select 1 from ${parents} p where p.family_id = ${families.id} and (p.name ilike ${`%${term}%`} or p.address_as ilike ${`%${term}%`}))`,
          )
        : undefined,
    )
    .orderBy(desc(families.createdAt))
    .limit(100);
  const ids = fams.map((f) => f.f.id);
  const ps = ids.length
    ? await db
        .select({ p: parents, sub: subscriptions, plan: plans })
        .from(parents)
        .leftJoin(subscriptions, eq(subscriptions.parentId, parents.id))
        .leftJoin(plans, eq(plans.id, subscriptions.planId))
        .where(inArray(parents.familyId, ids))
    : [];
  const pids = ps.map((x) => x.p.id);
  const last = pids.length
    ? await db
        .selectDistinctOn([checkIns.parentId], {
          parentId: checkIns.parentId,
          status: checkIns.status,
          localDate: checkIns.localDate,
        })
        .from(checkIns)
        .where(inArray(checkIns.parentId, pids))
        .orderBy(checkIns.parentId, desc(checkIns.localDate), desc(checkIns.createdAt))
    : [];
  const lastBy = new Map(last.map((l) => [l.parentId, l]));
  return fams.map((f) => ({
    ...f,
    parents: ps
      .filter((x) => x.p.familyId === f.f.id)
      .map((x) => ({ ...x, last: lastBy.get(x.p.id) ?? null })),
  }));
}

export interface FamilyCost {
  familyId: string;
  familyName: string;
  minutes: number;
  calls: number;
  whatsapp: number;
  callCostInr: number;
  messageCostInr: number;
  costInr: number;
  mrrInr: number;
  marginInr: number;
  overBudget: string[];
}

/** Month-to-date costs vs monthly revenue, per family and overall. */
export async function getCosts(db: DbOrTx, now: Date, settings: Settings) {
  const monthStart = zonedToInstant(
    `${localDateOf(now, "Asia/Kolkata").slice(0, 7)}-01`,
    "00:00",
    "Asia/Kolkata",
  );
  const r = settings.cost_rates;
  const perMin = r.aiPerMinInr + r.platformPerMinInr + r.telephonyPerMinInr;

  const mins = await db
    .select({
      familyId: parents.familyId,
      secs: sum(callAttempts.durationSecs),
      calls: count(callAttempts.id),
    })
    .from(callAttempts)
    .innerJoin(parents, eq(parents.id, callAttempts.parentId))
    .where(gte(callAttempts.dialedAt, monthStart))
    .groupBy(parents.familyId);
  const msgs = await db
    .select({ familyId: notifications.familyId, n: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.channel, "whatsapp"),
        inArray(notifications.status, ["sent", "delivered", "read"]),
        gte(notifications.createdAt, monthStart),
      ),
    )
    .groupBy(notifications.familyId);
  const subs = await db
    .select({
      familyId: subscriptions.familyId,
      status: subscriptions.status,
      price: plans.priceInr,
      maxMin: plans.maxCallMinutes,
      parentId: subscriptions.parentId,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId));
  const longCalls = await db
    .select({
      familyId: parents.familyId,
      parentId: parents.id,
      name: parents.addressAs,
      secs: callAttempts.durationSecs,
    })
    .from(callAttempts)
    .innerJoin(parents, eq(parents.id, callAttempts.parentId))
    .where(and(gte(callAttempts.dialedAt, monthStart), eq(callAttempts.status, "completed")));
  const [paid] = await db
    .select({ total: sum(payments.amountInr) })
    .from(payments)
    .where(and(eq(payments.status, "captured"), gte(payments.createdAt, monthStart)));
  const fams = await db.select({ id: families.id, name: families.name }).from(families);

  const rows: FamilyCost[] = fams.map((f) => {
    const m = mins.find((x) => x.familyId === f.id);
    const minutes = Number(m?.secs ?? 0) / 60;
    const wa = msgs.find((x) => x.familyId === f.id)?.n ?? 0;
    const famSubs = subs.filter((s) => s.familyId === f.id);
    const mrr = famSubs
      .filter((s) => ["active", "past_due", "cancelled"].includes(s.status))
      .reduce((a, s) => a + s.price, 0);
    const callCost = minutes * perMin;
    const msgCost = wa * r.whatsappPerMessageInr;
    const overBudget: string[] = [];
    for (const s of famSubs) {
      const calls = longCalls.filter((c) => c.parentId === s.parentId);
      const over = calls.filter((c) => (c.secs ?? 0) > s.maxMin * 60 + 30);
      if (over.length)
        overBudget.push(
          `${calls[0]?.name ?? "parent"}: ${over.length} call(s) over ${s.maxMin} min`,
        );
    }
    return {
      familyId: f.id,
      familyName: f.name,
      minutes: Math.round(minutes * 10) / 10,
      calls: m?.calls ?? 0,
      whatsapp: wa,
      callCostInr: Math.round(callCost),
      messageCostInr: Math.round(msgCost * 100) / 100,
      costInr: Math.round(callCost + msgCost),
      mrrInr: mrr,
      marginInr: Math.round(mrr - (callCost + msgCost)),
      overBudget,
    };
  });
  const totals = rows.reduce(
    (a, x) => ({
      minutes: a.minutes + x.minutes,
      cost: a.cost + x.costInr,
      mrr: a.mrr + x.mrrInr,
      whatsapp: a.whatsapp + x.whatsapp,
    }),
    { minutes: 0, cost: 0, mrr: 0, whatsapp: 0 },
  );
  return {
    monthStart,
    perMin,
    rows: rows.sort((a, b) => b.costInr - a.costInr),
    totals,
    collectedThisMonth: Number(paid?.total ?? 0),
  };
}

export async function getFailures(db: DbOrTx) {
  const msgs = await db
    .select()
    .from(notifications)
    .where(inArray(notifications.status, ["dead", "failed"]))
    .orderBy(desc(notifications.updatedAt))
    .limit(50);
  const hooks = await db
    .select()
    .from(webhookEvents)
    .where(inArray(webhookEvents.status, ["failed", "ignored"]))
    .orderBy(desc(webhookEvents.receivedAt))
    .limit(50);
  const calls = await db
    .select({ c: checkIns, name: parents.name })
    .from(checkIns)
    .innerJoin(parents, eq(parents.id, checkIns.parentId))
    .where(inArray(checkIns.status, ["failed", "needs_review"]))
    .orderBy(desc(checkIns.updatedAt))
    .limit(50);
  const reports = await db
    .select({ r: problemReports, name: parents.name })
    .from(problemReports)
    .leftJoin(parents, eq(parents.id, problemReports.parentId))
    .where(eq(problemReports.status, "open"))
    .orderBy(desc(problemReports.createdAt))
    .limit(50);
  const ticks = await db
    .select()
    .from(jobRuns)
    .where(eq(jobRuns.ok, false))
    .orderBy(desc(jobRuns.startedAt))
    .limit(20);
  return { msgs, hooks, calls, reports, ticks };
}
