/**
 * Read models for the family dashboard. Server-only (no writes).
 */
import { and, asc, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import {
  alerts,
  callAttempts,
  callResults,
  checkIns,
  emergencyContacts,
  familyNotes,
  followUps,
  medicines,
  schedules,
  subscriptions,
  plans,
} from "@/db/schema/app";
import type { DbOrTx } from "@/db/types";
import {
  buildWeeklyDigest,
  describeToday,
  type DigestDay,
  summariseMeds,
  type TodayStatus,
} from "@/domain/status";
import { addDaysToLocalDate, isoWeekdayOf, localDateOf, zonedToInstant } from "@/lib/time";
import type { Parent } from "./parents";

export type CheckInRow = typeof checkIns.$inferSelect;
export type ResultRow = typeof callResults.$inferSelect;

export async function getTodayStatus(db: DbOrTx, parent: Parent, now: Date): Promise<TodayStatus> {
  const localDate = localDateOf(now, parent.timezone);
  const [schedule] = await db
    .select()
    .from(schedules)
    .where(eq(schedules.parentId, parent.id))
    .limit(1);
  const today = await db
    .select()
    .from(checkIns)
    .where(and(eq(checkIns.parentId, parent.id), eq(checkIns.localDate, localDate)))
    .orderBy(desc(checkIns.createdAt));
  // Prefer the most "important" check-in of the day: a running one, then the latest.
  const running = today.find((c) => c.status === "dialing" || c.status === "in_progress");
  const checkIn = running ?? today[0] ?? null;
  const [result] = checkIn
    ? await db.select().from(callResults).where(eq(callResults.checkInId, checkIn.id)).limit(1)
    : [];
  const [answered] = checkIn
    ? await db
        .select({ answeredAt: callAttempts.answeredAt })
        .from(callAttempts)
        .where(and(eq(callAttempts.checkInId, checkIn.id), eq(callAttempts.status, "completed")))
        .limit(1)
    : [];
  const [alert] = checkIn
    ? await db
        .select({ id: alerts.id })
        .from(alerts)
        .where(eq(alerts.checkInId, checkIn.id))
        .limit(1)
    : [];

  const isCallDay = schedule ? schedule.daysOfWeek.includes(isoWeekdayOf(localDate)) : false;
  const scheduledAt = schedule
    ? zonedToInstant(localDate, schedule.callTime, parent.timezone)
    : null;

  return describeToday({
    parentStatus: parent.status,
    pausedUntil: parent.pausedUntil,
    timezone: parent.timezone,
    isCallDay,
    scheduledAt: checkIn?.scheduledFor ?? scheduledAt,
    checkIn: checkIn
      ? {
          status: checkIn.status,
          isConsentCall: checkIn.isConsentCall,
          nextAttemptAt: checkIn.nextAttemptAt,
          attemptsCount: checkIn.attemptsCount,
          maxAttempts: checkIn.maxAttempts,
          finishedAt: checkIn.finishedAt,
        }
      : null,
    result: result
      ? {
          mood: result.mood,
          medsSummary: summariseMeds(result.medicinesTaken),
          redFlag: result.redFlag,
          distress: result.distress,
          answeredAt: answered?.answeredAt ?? null,
        }
      : null,
    alertSent: !!alert,
  });
}

export interface TimelineItem {
  checkIn: CheckInRow;
  result: ResultRow | null;
}

export async function getTimeline(
  db: DbOrTx,
  parentId: string,
  limit = 30,
): Promise<TimelineItem[]> {
  const rows = await db
    .select({ checkIn: checkIns, result: callResults })
    .from(checkIns)
    .leftJoin(callResults, eq(callResults.checkInId, checkIns.id))
    .where(
      and(
        eq(checkIns.parentId, parentId),
        inArray(checkIns.status, [
          "completed",
          "unreachable",
          "skipped",
          "failed",
          "needs_review",
          "retry_scheduled",
          "in_progress",
          "dialing",
        ]),
      ),
    )
    .orderBy(desc(checkIns.localDate), desc(checkIns.createdAt))
    .limit(limit);
  return rows;
}

export interface MoodPoint {
  localDate: string;
  mood: number | null;
  status: CheckInRow["status"] | "none";
}

/** One point per day for the last `days` days (gaps where we didn't speak). */
export async function getMoodSeries(
  db: DbOrTx,
  parent: Parent,
  now: Date,
  days: number,
): Promise<MoodPoint[]> {
  const end = localDateOf(now, parent.timezone);
  const start = addDaysToLocalDate(end, -(days - 1));
  const rows = await db
    .select({
      localDate: checkIns.localDate,
      status: checkIns.status,
      mood: callResults.mood,
      slot: checkIns.slot,
    })
    .from(checkIns)
    .leftJoin(callResults, eq(callResults.checkInId, checkIns.id))
    .where(
      and(
        eq(checkIns.parentId, parent.id),
        gte(checkIns.localDate, start),
        lte(checkIns.localDate, end),
      ),
    )
    .orderBy(asc(checkIns.localDate));
  const byDay = new Map<string, MoodPoint>();
  for (const r of rows) {
    const prev = byDay.get(r.localDate);
    // A completed call with a mood wins over other check-ins that day.
    if (!prev || (r.mood !== null && prev.mood === null)) {
      byDay.set(r.localDate, { localDate: r.localDate, mood: r.mood, status: r.status });
    }
  }
  const out: MoodPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDaysToLocalDate(start, i);
    out.push(byDay.get(d) ?? { localDate: d, mood: null, status: "none" });
  }
  return out;
}

export interface MedicineAdherence {
  name: string;
  yes: number;
  no: number;
  unclear: number;
}

export async function getMedicineAdherence(
  db: DbOrTx,
  parent: Parent,
  now: Date,
  days = 7,
): Promise<MedicineAdherence[]> {
  const meds = await db
    .select()
    .from(medicines)
    .where(and(eq(medicines.parentId, parent.id), eq(medicines.active, true)))
    .orderBy(asc(medicines.sortOrder));
  if (meds.length === 0) return [];
  const end = localDateOf(now, parent.timezone);
  const start = addDaysToLocalDate(end, -(days - 1));
  const results = await db
    .select({ medicinesTaken: callResults.medicinesTaken })
    .from(callResults)
    .innerJoin(checkIns, eq(checkIns.id, callResults.checkInId))
    .where(and(eq(checkIns.parentId, parent.id), gte(checkIns.localDate, start)));
  return meds.map((m) => {
    const tally = { name: m.name, yes: 0, no: 0, unclear: 0 };
    for (const r of results) {
      const a = r.medicinesTaken.find((x) => x.name.toLowerCase() === m.name.toLowerCase());
      if (a) tally[a.taken]++;
    }
    return tally;
  });
}

export async function getDigest(db: DbOrTx, parent: Parent, now: Date) {
  const series = await getDetailedDays(db, parent, now, 14);
  const lastWeek = series.slice(0, 7);
  const thisWeek = series.slice(7);
  return buildWeeklyDigest(thisWeek, lastWeek, parent.addressAs);
}

async function getDetailedDays(
  db: DbOrTx,
  parent: Parent,
  now: Date,
  days: number,
): Promise<DigestDay[]> {
  const end = localDateOf(now, parent.timezone);
  const start = addDaysToLocalDate(end, -(days - 1));
  const rows = await db
    .select({ checkIn: checkIns, result: callResults })
    .from(checkIns)
    .leftJoin(callResults, eq(callResults.checkInId, checkIns.id))
    .where(
      and(
        eq(checkIns.parentId, parent.id),
        gte(checkIns.localDate, start),
        lte(checkIns.localDate, end),
      ),
    );
  const byDay = new Map<string, DigestDay>();
  for (const { checkIn, result } of rows) {
    const day: DigestDay = {
      localDate: checkIn.localDate,
      status: checkIn.status,
      mood: result?.mood ?? null,
      meds: result ? summariseMeds(result.medicinesTaken) : null,
      painOrSymptoms: result?.painOrSymptoms ?? null,
      redFlag: result?.redFlag ?? false,
    };
    const prev = byDay.get(checkIn.localDate);
    if (!prev || prev.status !== "completed") byDay.set(checkIn.localDate, day);
  }
  const out: DigestDay[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDaysToLocalDate(start, i);
    out.push(
      byDay.get(d) ?? {
        localDate: d,
        status: "none",
        mood: null,
        meds: null,
        painOrSymptoms: null,
        redFlag: false,
      },
    );
  }
  return out;
}

export async function getOpenAlerts(db: DbOrTx, parentId: string) {
  return db
    .select()
    .from(alerts)
    .where(and(eq(alerts.parentId, parentId), eq(alerts.status, "open")))
    .orderBy(desc(alerts.createdAt))
    .limit(10);
}

export async function getOpenFollowUps(db: DbOrTx, parentId: string) {
  return db
    .select()
    .from(followUps)
    .where(and(eq(followUps.parentId, parentId), isNull(followUps.resolvedAt)))
    .orderBy(desc(followUps.createdAt))
    .limit(5);
}

export async function getPendingNotes(db: DbOrTx, parentId: string) {
  return db
    .select()
    .from(familyNotes)
    .where(
      and(
        eq(familyNotes.parentId, parentId),
        eq(familyNotes.kind, "next_call"),
        isNull(familyNotes.usedAt),
      ),
    )
    .orderBy(asc(familyNotes.createdAt));
}

export async function getSchedule(db: DbOrTx, parentId: string) {
  const [s] = await db.select().from(schedules).where(eq(schedules.parentId, parentId)).limit(1);
  return s ?? null;
}

export async function getContactsCount(db: DbOrTx, parentId: string): Promise<number> {
  const rows = await db
    .select({ id: emergencyContacts.id })
    .from(emergencyContacts)
    .where(eq(emergencyContacts.parentId, parentId));
  return rows.length;
}

export async function getSubscription(db: DbOrTx, parentId: string) {
  const [row] = await db
    .select({ sub: subscriptions, plan: plans })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.parentId, parentId))
    .limit(1);
  return row ?? null;
}

export async function getCallDetail(db: DbOrTx, parentId: string, checkInId: string) {
  const [row] = await db
    .select({ checkIn: checkIns, result: callResults })
    .from(checkIns)
    .leftJoin(callResults, eq(callResults.checkInId, checkIns.id))
    .where(and(eq(checkIns.id, checkInId), eq(checkIns.parentId, parentId)))
    .limit(1);
  if (!row) return null;
  const attempts = await db
    .select()
    .from(callAttempts)
    .where(eq(callAttempts.checkInId, checkInId))
    .orderBy(asc(callAttempts.attemptNo));
  const callAlerts = await db.select().from(alerts).where(eq(alerts.checkInId, checkInId));
  return { ...row, attempts, alerts: callAlerts };
}
