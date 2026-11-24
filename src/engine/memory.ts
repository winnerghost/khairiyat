/**
 * Call memory: the short context the assistant gets before each call
 * (ElevenLabs "dynamic variables"). Kept SHORT on purpose: long prompts
 * slow the agent down and cost more.
 *
 * Keys starting with "secret__" are not sent to the language model
 * (https://elevenlabs.io/docs/eleven-agents/customization/personalization/dynamic-variables);
 * we use them to match the result back to our check-in.
 */
import { and, asc, desc, eq, gt, isNull, or } from "drizzle-orm";
import { renderFirstMessage } from "../../agent/first-messages";
import { assistantNameFor } from "@/config/brand";
import {
  callResults,
  checkIns,
  familyMembers,
  familyNotes,
  followUps,
  medicines,
  parentHealthNotes,
  plans,
  schedules,
  subscriptions,
} from "@/db/schema/app";
import type { DbOrTx } from "@/db/types";
import { LANGUAGE_LABELS } from "@/domain/onboarding";
import { moodWord } from "@/domain/status";
import { decryptText } from "@/lib/crypto";
import {
  formatClock,
  formatLocalDate,
  hhmmToMinutes,
  localDateOf,
  localTimeOf,
  zonedToInstant,
} from "@/lib/time";
import type { DynamicVariables } from "@/providers/voice/types";

type ParentRow = {
  id: string;
  familyId: string;
  name: string;
  addressAs: string;
  language: "hi" | "hinglish" | "ur" | "en";
  voice: "female" | "male";
  hearingDifficulty: boolean;
  timezone: string;
  topicsEnjoyed: string[];
  topicsToAvoid: string[];
};

const cap = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);

/** Which medicines are due around (or before) the call time, by name. */
export function medicinesDueAt(
  meds: { name: string; timing: string; customTime: string | null; withFood: string }[],
  callLocalTime: string,
): string[] {
  const t = hhmmToMinutes(callLocalTime);
  const food = (w: string) =>
    w === "with" ? " (khaane ke saath)" : w === "without" ? " (khaali pet)" : "";
  return meds
    .filter((m) => {
      switch (m.timing) {
        case "morning":
          return t >= hhmmToMinutes("08:00");
        case "afternoon":
          return t >= hhmmToMinutes("13:00");
        case "night":
          return t >= hhmmToMinutes("19:00");
        case "custom":
          return m.customTime ? hhmmToMinutes(m.customTime) <= t + 60 : false;
        default:
          return false;
      }
    })
    .map((m) => `${m.name}${food(m.withFood)}`);
}

export interface CallContext {
  dynamicVariables: DynamicVariables;
  maxDurationSecs: number;
  /** next_call notes and follow-ups included (marked used once the call completes). */
  noteIds: string[];
  followUpIds: string[];
}

export async function buildCallContext(
  db: DbOrTx,
  input: {
    parent: ParentRow;
    checkIn: { id: string; isConsentCall: boolean };
    attemptId: string;
    now: Date;
    encryptionKey: string;
  },
): Promise<CallContext> {
  const { parent, checkIn, now } = input;
  const callLocal = localTimeOf(now, parent.timezone);

  const [owner] = await db
    .select({ name: familyMembers.displayName })
    .from(familyMembers)
    .where(eq(familyMembers.familyId, parent.familyId))
    .orderBy(asc(familyMembers.role), asc(familyMembers.createdAt))
    .limit(1);

  const meds = await db
    .select()
    .from(medicines)
    .where(and(eq(medicines.parentId, parent.id), eq(medicines.active, true)))
    .orderBy(asc(medicines.sortOrder));

  const notes = await db
    .select()
    .from(familyNotes)
    .where(
      and(
        eq(familyNotes.parentId, parent.id),
        isNull(familyNotes.usedAt),
        or(
          eq(familyNotes.kind, "next_call"),
          and(eq(familyNotes.kind, "news"), gt(familyNotes.expiresAt, now)),
        ),
      ),
    )
    .orderBy(asc(familyNotes.createdAt))
    .limit(4);

  const recent = await db
    .select({ localDate: checkIns.localDate, r: callResults })
    .from(callResults)
    .innerJoin(checkIns, eq(checkIns.id, callResults.checkInId))
    .where(and(eq(checkIns.parentId, parent.id), eq(checkIns.status, "completed")))
    .orderBy(desc(checkIns.localDate), desc(callResults.createdAt))
    .limit(4);

  const openFollowUps = await db
    .select()
    .from(followUps)
    .where(and(eq(followUps.parentId, parent.id), isNull(followUps.resolvedAt)))
    .orderBy(desc(followUps.createdAt))
    .limit(3);

  const [health] = await db
    .select()
    .from(parentHealthNotes)
    .where(eq(parentHealthNotes.parentId, parent.id))
    .limit(1);
  let gentle = "";
  if (health) {
    try {
      gentle = cap(await decryptText(health.ciphertext, input.encryptionKey), 300);
    } catch {
      gentle = "";
    }
  }

  const [plan] = await db
    .select({ minutes: plans.maxCallMinutes })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.parentId, parent.id))
    .limit(1);
  const maxMinutes = plan?.minutes ?? 4;

  const [schedule] = await db
    .select()
    .from(schedules)
    .where(eq(schedules.parentId, parent.id))
    .limit(1);
  const usualTime = schedule
    ? formatClock(
        zonedToInstant(localDateOf(now, parent.timezone), schedule.callTime, parent.timezone),
        parent.timezone,
      )
    : formatClock(now, parent.timezone);

  const lastCalls = recent
    .map(({ localDate, r }) => {
      const bits = [
        moodWord(r.mood) && `mood ${moodWord(r.mood)}`,
        r.painOrSymptoms && `mentioned ${r.painOrSymptoms}`,
        r.notableMoments,
      ].filter(Boolean);
      return bits.length ? `${formatLocalDate(localDate)}: ${bits.join(", ")}` : null;
    })
    .filter(Boolean)
    .join(" | ");

  const nextCallNotes = notes.filter((n) => n.kind === "next_call").map((n) => n.text);
  const news = notes.filter((n) => n.kind === "news").map((n) => n.text);
  const due = medicinesDueAt(meds, callLocal);

  const familyMemberName = (owner?.name ?? "aapke bachche").split(" ")[0] ?? "aapke bachche";
  const dynamicVariables: DynamicVariables = {
    first_message: renderFirstMessage({
      addressAs: parent.addressAs,
      assistantName: assistantNameFor(parent.voice),
      familyMemberName,
      language: parent.language,
      gender: parent.voice,
      isConsentCall: checkIn.isConsentCall,
    }),
    parent_name: parent.name,
    address_as: parent.addressAs,
    assistant_name: assistantNameFor(parent.voice),
    /** Hindi verbs change with gender ("bol rahi hoon" / "bol raha hoon"). */
    assistant_gender: parent.voice,
    family_member_name: familyMemberName,
    language: LANGUAGE_LABELS[parent.language],
    hearing_difficulty: parent.hearingDifficulty ? "yes" : "no",
    medicines_due_now: cap(due.join(", ") || "none", 300),
    family_note_for_today: cap([...nextCallNotes, ...news].join("; ") || "none", 300),
    last_calls_summary: cap(lastCalls || "This is one of the first calls.", 400),
    follow_ups: cap(openFollowUps.map((f) => f.text).join("; ") || "none", 250),
    topics_enjoyed: cap(parent.topicsEnjoyed.join(", ") || "none", 200),
    topics_to_avoid: cap(parent.topicsToAvoid.join(", ") || "none", 200),
    be_gentle_about: gentle || "none",
    is_consent_call: checkIn.isConsentCall ? "yes" : "no",
    call_time: usualTime,
    max_minutes: maxMinutes,
    secret__check_in_id: checkIn.id,
    secret__attempt_id: input.attemptId,
    secret__note_ids: notes
      .filter((n) => n.kind === "next_call")
      .map((n) => n.id)
      .join(","),
    secret__follow_up_ids: openFollowUps.map((f) => f.id).join(","),
  };

  return {
    dynamicVariables,
    maxDurationSecs: maxMinutes * 60,
    noteIds: notes.filter((n) => n.kind === "next_call").map((n) => n.id),
    followUpIds: openFollowUps.map((f) => f.id),
  };
}
