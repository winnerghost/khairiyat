/**
 * Parent setup and family actions (pause, skip, notes, delete).
 * Callers must have checked access first (see authz.ts).
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { TRIAL_PLAN_ID } from "@/config/defaults";
import {
  checkIns,
  emergencyContacts,
  familyNotes,
  medicines,
  parentHealthNotes,
  parents,
  schedules,
  subscriptions,
} from "@/db/schema/app";
import type { DbOrTx } from "@/db/types";
import type {
  contactsSchema,
  medicinesSchema,
  personalizeSchema,
  profileSchema,
  scheduleSchema,
} from "@/domain/onboarding";
import { ONBOARDING_STEPS, type StepKey, stepIndex } from "@/domain/onboarding";
import type { Settings } from "@/engine/settings";
import { decryptText, encryptText } from "@/lib/crypto";
import { localDateOf } from "@/lib/time";

export type Parent = typeof parents.$inferSelect;

export async function getParent(db: DbOrTx, parentId: string): Promise<Parent | null> {
  const [row] = await db.select().from(parents).where(eq(parents.id, parentId)).limit(1);
  return row ?? null;
}

export async function listParents(db: DbOrTx, familyId: string): Promise<Parent[]> {
  return db
    .select()
    .from(parents)
    .where(eq(parents.familyId, familyId))
    .orderBy(asc(parents.createdAt));
}

/** Remember the furthest step reached so "continue setup" lands in the right place. */
async function markStepDone(db: DbOrTx, parentId: string, step: StepKey) {
  const next = stepIndex(step) + 2; // steps are 1-based; next step
  const p = await getParent(db, parentId);
  if (p && p.onboardingStep < next) {
    await db
      .update(parents)
      .set({ onboardingStep: next, updatedAt: new Date() })
      .where(eq(parents.id, parentId));
  }
}

export function nextStepAfter(step: StepKey): StepKey | null {
  const i = stepIndex(step);
  return ONBOARDING_STEPS[i + 1]?.key ?? null;
}

export async function createParent(
  db: DbOrTx,
  familyId: string,
  data: z.infer<typeof profileSchema>,
): Promise<Parent> {
  const [row] = await db
    .insert(parents)
    .values({
      familyId,
      name: data.name,
      addressAs: data.addressAs,
      phoneE164: data.phone,
      language: data.language,
      voice: data.voice,
      hearingDifficulty: data.hearingDifficulty,
      city: data.city,
      onboardingStep: 2,
    })
    .returning();
  return row!;
}

export async function saveProfile(
  db: DbOrTx,
  parentId: string,
  data: z.infer<typeof profileSchema>,
) {
  await db
    .update(parents)
    .set({
      name: data.name,
      addressAs: data.addressAs,
      phoneE164: data.phone,
      language: data.language,
      voice: data.voice,
      hearingDifficulty: data.hearingDifficulty,
      city: data.city,
      updatedAt: new Date(),
    })
    .where(eq(parents.id, parentId));
  await markStepDone(db, parentId, "profile");
}

export async function saveSchedule(
  db: DbOrTx,
  parentId: string,
  data: z.infer<typeof scheduleSchema>,
) {
  const days = [...new Set(data.days)].sort();
  await db
    .update(parents)
    .set({ timezone: data.timezone, updatedAt: new Date() })
    .where(eq(parents.id, parentId));
  await db
    .insert(schedules)
    .values({ parentId, slot: "daily", callTime: data.callTime, daysOfWeek: days, active: true })
    .onConflictDoUpdate({
      target: [schedules.parentId, schedules.slot],
      set: { callTime: data.callTime, daysOfWeek: days, active: true, updatedAt: new Date() },
    });
  await markStepDone(db, parentId, "schedule");
}

export async function saveMedicines(
  db: DbOrTx,
  parentId: string,
  data: z.infer<typeof medicinesSchema>,
) {
  await db.delete(medicines).where(eq(medicines.parentId, parentId));
  if (data.medicines.length > 0) {
    await db.insert(medicines).values(
      data.medicines.map((m, i) => ({
        parentId,
        name: m.name,
        timing: m.timing,
        customTime: m.timing === "custom" ? (m.customTime ?? null) : null,
        withFood: m.withFood,
        notes: m.notes,
        sortOrder: i,
      })),
    );
  }
  await markStepDone(db, parentId, "medicines");
}

export async function savePersonalize(
  db: DbOrTx,
  parentId: string,
  data: z.infer<typeof personalizeSchema>,
  now: Date,
  memberId: string | null,
) {
  await db
    .update(parents)
    .set({
      topicsEnjoyed: data.topicsEnjoyed,
      topicsToAvoid: data.topicsToAvoid,
      updatedAt: new Date(),
    })
    .where(eq(parents.id, parentId));
  // Replace the current (unused) family news with what the form shows.
  await db
    .delete(familyNotes)
    .where(
      and(
        eq(familyNotes.parentId, parentId),
        eq(familyNotes.kind, "news"),
        isNull(familyNotes.usedAt),
      ),
    );
  if (data.familyNews.length > 0) {
    await db.insert(familyNotes).values(
      data.familyNews.map((text) => ({
        parentId,
        kind: "news" as const,
        text,
        createdByMemberId: memberId,
        expiresAt: new Date(now.getTime() + 14 * 24 * 3600_000),
      })),
    );
  }
  await markStepDone(db, parentId, "personalize");
}

export async function saveHealthNotes(db: DbOrTx, parentId: string, notes: string, keyB64: string) {
  if (!notes.trim()) {
    await db.delete(parentHealthNotes).where(eq(parentHealthNotes.parentId, parentId));
  } else {
    const ciphertext = await encryptText(notes.trim(), keyB64);
    await db
      .insert(parentHealthNotes)
      .values({ parentId, ciphertext })
      .onConflictDoUpdate({
        target: parentHealthNotes.parentId,
        set: { ciphertext, updatedAt: new Date() },
      });
  }
  await markStepDone(db, parentId, "health");
}

export async function readHealthNotes(
  db: DbOrTx,
  parentId: string,
  keyB64: string,
): Promise<string> {
  const [row] = await db
    .select()
    .from(parentHealthNotes)
    .where(eq(parentHealthNotes.parentId, parentId))
    .limit(1);
  return row ? decryptText(row.ciphertext, keyB64) : "";
}

export async function saveContacts(
  db: DbOrTx,
  parentId: string,
  data: z.infer<typeof contactsSchema>,
) {
  await db.delete(emergencyContacts).where(eq(emergencyContacts.parentId, parentId));
  await db.insert(emergencyContacts).values(
    data.contacts.map((c, i) => ({
      parentId,
      name: c.name,
      relation: c.relation,
      whatsappE164: c.whatsapp,
      email: c.email,
      alertOnUnreachable: c.alertOnUnreachable,
      alertOnRedFlag: c.alertOnRedFlag,
      sortOrder: i,
    })),
  );
  await markStepDone(db, parentId, "contacts");
}

/**
 * Last step. The family confirms they told their parent; the parent's own
 * consent is asked on the first (introduction) call. Starts the free trial.
 */
export async function completeOnboarding(
  db: DbOrTx,
  parentId: string,
  now: Date,
  settings: Pick<Settings, "trial_days">,
): Promise<void> {
  const p = await getParent(db, parentId);
  if (!p) throw new Error("Parent not found");
  const missing = await missingSetup(db, parentId);
  if (missing.length > 0) throw new Error(`Setup incomplete: ${missing.join(", ")}`);
  if (p.status === "onboarding") {
    await db
      .update(parents)
      .set({
        status: "awaiting_consent",
        familyConfirmedToldParentAt: now,
        onboardingCompletedAt: now,
        onboardingStep: ONBOARDING_STEPS.length + 1,
        updatedAt: now,
      })
      .where(and(eq(parents.id, parentId), eq(parents.status, "onboarding")));
  }
  await db
    .insert(subscriptions)
    .values({
      parentId,
      familyId: p.familyId,
      planId: TRIAL_PLAN_ID,
      status: "trialing",
      trialEndsAt: new Date(now.getTime() + settings.trial_days * 24 * 3600_000),
      provider: "mock",
    })
    .onConflictDoNothing({ target: subscriptions.parentId });
}

/** Which required parts of setup are still missing. */
export async function missingSetup(db: DbOrTx, parentId: string): Promise<StepKey[]> {
  const missing: StepKey[] = [];
  const [schedule] = await db
    .select()
    .from(schedules)
    .where(eq(schedules.parentId, parentId))
    .limit(1);
  if (!schedule) missing.push("schedule");
  const [contact] = await db
    .select({ id: emergencyContacts.id })
    .from(emergencyContacts)
    .where(eq(emergencyContacts.parentId, parentId))
    .limit(1);
  if (!contact) missing.push("contacts");
  return missing;
}

// ── Family actions ───────────────────────────────────────────────────────

const OPEN_STATUSES = ["scheduled", "retry_scheduled"] as const;

/** Pause calls (travel, hospital). Optional auto-resume date. */
export async function pauseParent(
  db: DbOrTx,
  parentId: string,
  input: { until: Date | null; reason: string | null; now: Date },
): Promise<void> {
  await db
    .update(parents)
    .set({
      status: "paused",
      pausedUntil: input.until,
      pauseReason: input.reason,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(parents.id, parentId),
        inArray(parents.status, ["active", "awaiting_consent", "paused"]),
      ),
    );
  await db
    .update(checkIns)
    .set({ status: "paused", updatedAt: input.now })
    .where(and(eq(checkIns.parentId, parentId), inArray(checkIns.status, [...OPEN_STATUSES])));
}

export async function resumeParent(db: DbOrTx, parentId: string, now: Date): Promise<void> {
  const p = await getParent(db, parentId);
  if (!p || p.status !== "paused") return;
  await db
    .update(parents)
    .set({
      status: p.consentGivenAt ? "active" : "awaiting_consent",
      pausedUntil: null,
      pauseReason: null,
      updatedAt: now,
    })
    .where(eq(parents.id, parentId));
}

/**
 * After an opt-out or refused consent, the family may (after talking to
 * their parent) ask us to try again: this schedules a fresh consent call.
 */
export async function restartWithConsentCall(
  db: DbOrTx,
  parentId: string,
  now: Date,
): Promise<void> {
  await db
    .update(parents)
    .set({
      status: "awaiting_consent",
      consentGivenAt: null,
      consentRefusedAt: null,
      optedOutAt: null,
      familyConfirmedToldParentAt: now,
      updatedAt: now,
    })
    .where(
      and(eq(parents.id, parentId), inArray(parents.status, ["opted_out", "consent_refused"])),
    );
}

export type SkipResult = { ok: true } | { ok: false; reason: "already_done" | "in_progress" };

/** Skip today's daily call. Safe to press twice. */
export async function skipToday(db: DbOrTx, parent: Parent, now: Date): Promise<SkipResult> {
  const localDate = localDateOf(now, parent.timezone);
  const [existing] = await db
    .select()
    .from(checkIns)
    .where(
      and(
        eq(checkIns.parentId, parent.id),
        eq(checkIns.localDate, localDate),
        eq(checkIns.slot, "daily"),
      ),
    )
    .limit(1);
  if (!existing) {
    await db
      .insert(checkIns)
      .values({
        parentId: parent.id,
        localDate,
        slot: "daily",
        status: "skipped",
        scheduledFor: now,
        finishedAt: now,
      })
      .onConflictDoNothing();
    return { ok: true };
  }
  if (existing.status === "skipped") return { ok: true };
  if (
    existing.status === "scheduled" ||
    existing.status === "retry_scheduled" ||
    existing.status === "paused"
  ) {
    await db
      .update(checkIns)
      .set({ status: "skipped", finishedAt: now, updatedAt: now, version: existing.version + 1 })
      .where(and(eq(checkIns.id, existing.id), eq(checkIns.version, existing.version)));
    return { ok: true };
  }
  if (existing.status === "dialing" || existing.status === "in_progress")
    return { ok: false, reason: "in_progress" };
  return { ok: false, reason: "already_done" };
}

export async function addNextCallNote(
  db: DbOrTx,
  parentId: string,
  text: string,
  memberId: string | null,
): Promise<void> {
  await db
    .insert(familyNotes)
    .values({ parentId, kind: "next_call", text: text.trim(), createdByMemberId: memberId });
}

export async function deleteNote(db: DbOrTx, parentId: string, noteId: string): Promise<void> {
  await db
    .delete(familyNotes)
    .where(and(eq(familyNotes.id, noteId), eq(familyNotes.parentId, parentId)));
}

/** Permanently delete a parent and everything about them (calls, notes, transcripts). */
export async function deleteParent(db: DbOrTx, parentId: string): Promise<void> {
  await db.delete(parents).where(eq(parents.id, parentId));
}
