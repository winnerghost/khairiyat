/**
 * Digests: one evening message for members who chose "daily digest", and a
 * weekly "what changed" message on Sunday evening (their own time zone).
 */
import { and, eq, gte, inArray, lte, lt, sql } from "drizzle-orm";
import { callResults, checkIns, familyMembers, families, parents } from "@/db/schema/app";
import { buildWeeklyDigest, type DigestDay, moodWord, summariseMeds } from "@/domain/status";
import { addDaysToLocalDate, localDateOf, localTimeOf } from "@/lib/time";
import { DateTime } from "luxon";
import type { EngineDeps } from "./deps";
import { enqueueFamilyMessage } from "./notify";
import type { Settings } from "./settings";

const DAILY_DIGEST_AT = "20:30";
const WEEKLY_DIGEST_AT = "19:00";

async function daysFor(
  deps: EngineDeps,
  parentId: string,
  start: string,
  end: string,
): Promise<DigestDay[]> {
  const rows = await deps.db
    .select({ c: checkIns, r: callResults })
    .from(checkIns)
    .leftJoin(callResults, eq(callResults.checkInId, checkIns.id))
    .where(
      and(
        eq(checkIns.parentId, parentId),
        gte(checkIns.localDate, start),
        lte(checkIns.localDate, end),
      ),
    );
  const map = new Map<string, DigestDay>();
  for (const { c, r } of rows) {
    const d: DigestDay = {
      localDate: c.localDate,
      status: c.status,
      mood: r?.mood ?? null,
      meds: r ? summariseMeds(r.medicinesTaken) : null,
      painOrSymptoms: r?.painOrSymptoms ?? null,
      redFlag: r?.redFlag ?? false,
    };
    const prev = map.get(c.localDate);
    if (!prev || prev.status !== "completed") map.set(c.localDate, d);
  }
  const out: DigestDay[] = [];
  for (let d = start; d <= end; d = addDaysToLocalDate(d, 1)) {
    out.push(
      map.get(d) ?? {
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

export async function sendDigests(
  deps: EngineDeps,
  settings: Settings,
): Promise<{ daily: number; weekly: number }> {
  const now = deps.clock.now();
  const rows = await deps.db
    .select({ m: familyMembers, p: parents })
    .from(familyMembers)
    .innerJoin(families, eq(families.id, familyMembers.familyId))
    .innerJoin(parents, eq(parents.familyId, families.id))
    .where(inArray(parents.status, ["active", "paused"]));
  let daily = 0;
  let weekly = 0;
  for (const { m, p } of rows) {
    const memberDate = localDateOf(now, m.timezone);
    const memberTime = localTimeOf(now, m.timezone);
    const link = `${deps.appUrl}/app/parents/${p.id}`;

    if (m.notifyMode === "daily_digest" && memberTime >= DAILY_DIGEST_AT) {
      const parentDate = localDateOf(now, p.timezone);
      const [today] = await daysFor(deps, p.id, parentDate, parentDate);
      const line =
        !today || today.status === "none"
          ? "No call today."
          : today.status === "completed"
            ? [
                moodWord(today.mood) ? `Sounded ${moodWord(today.mood)}.` : "Spoke today.",
                today.meds ? `Medicines: ${today.meds} (self-reported).` : null,
                today.painOrSymptoms ? `Mentioned: ${today.painOrSymptoms}.` : null,
              ]
                .filter(Boolean)
                .join(" ")
            : today.status === "unreachable"
              ? "We couldn't reach them today (you were alerted)."
              : "No conversation today.";
      const ids = await enqueueFamilyMessage(
        deps.db,
        {
          familyId: p.familyId,
          parentId: p.id,
          key: `daily_digest:${p.id}:${memberDate}:member:${m.id}`,
          template: "daily_digest",
          params: { en: [p.addressAs, line, link], hi: [p.addressAs, line, link] },
          audience: "digest",
          priority: "normal",
        },
        now,
      );
      daily += ids.length;
    }

    if (
      settings.feature_flags.weeklyDigest &&
      DateTime.fromJSDate(now, { zone: m.timezone }).weekday === 7 &&
      memberTime >= WEEKLY_DIGEST_AT
    ) {
      const end = localDateOf(now, p.timezone);
      const days = await daysFor(deps, p.id, addDaysToLocalDate(end, -13), end);
      const digest = buildWeeklyDigest(days.slice(7), days.slice(0, 7), p.addressAs);
      const ids = await enqueueFamilyMessage(
        deps.db,
        {
          familyId: p.familyId,
          parentId: p.id,
          key: `weekly:${p.id}:${memberDate}`,
          template: "weekly_digest",
          params: {
            en: [p.addressAs, digest.lines.join(" "), link],
            hi: [p.addressAs, digest.lines.join(" "), link],
          },
          audience: "members",
          priority: "normal",
        },
        now,
      );
      weekly += ids.length;
    }
  }
  return { daily, weekly };
}

/** Delete transcripts older than each family's retention setting (summaries stay). */
export async function purgeOldTranscripts(deps: EngineDeps): Promise<number> {
  const now = deps.clock.now();
  const fams = await deps.db
    .select({ id: families.id, days: families.transcriptRetentionDays })
    .from(families);
  let purged = 0;
  for (const f of fams) {
    const cutoff = new Date(now.getTime() - f.days * 24 * 3600_000);
    const old = await deps.db
      .select({ id: callResults.id })
      .from(callResults)
      .innerJoin(checkIns, eq(checkIns.id, callResults.checkInId))
      .innerJoin(parents, eq(parents.id, checkIns.parentId))
      .where(
        and(
          eq(parents.familyId, f.id),
          lt(callResults.createdAt, cutoff),
          sql`jsonb_array_length(${callResults.transcript}) > 0`,
        ),
      );
    if (old.length === 0) continue;
    const ids = old.map((o) => o.id);
    await deps.db
      .update(callResults)
      .set({ transcript: [], analysis: {} })
      .where(inArray(callResults.id, ids));
    purged += ids.length;
  }
  return purged;
}
