/**
 * What happens after a call: classify it (answered / not reached /
 * voicemail), store the result, detect red flags, update memory and
 * consent, raise alerts, queue messages. Every path is idempotent: the same
 * event processed twice (or out of order) changes nothing the second time.
 */
import { and, eq, inArray } from "drizzle-orm";
import {
  alerts,
  callAttempts,
  callResults,
  checkIns,
  familyNotes,
  followUps,
  medicines,
  parents,
  type MedicineAnswer,
} from "@/db/schema/app";
import type { DbOrTx } from "@/db/types";
import { formatClock, isWithinCallWindow, localDateOf } from "@/lib/time";
import type {
  CallEvent,
  InitiationFailureEvent,
  TranscriptionEvent,
} from "@/providers/voice/types";
import type { EngineDeps } from "./deps";
import { markConsentGiven, markConsentRefused, markOptedOut } from "./lifecycle";
import { dispatchDue, enqueueFamilyMessage } from "./notify";
import { looksLikeVoicemail, scanDistress, scanRedFlags, scanStopRequest } from "./red-flags";
import type { Settings } from "./settings";
import { buildSummaryEn, buildSummaryHi, cleanSummary } from "./summaries";

type Attempt = typeof callAttempts.$inferSelect;
type CheckIn = typeof checkIns.$inferSelect;
type Parent = typeof parents.$inferSelect;

export type NotReachedReason = "no_answer" | "busy" | "voicemail" | "failed" | "unknown";

const TERMINAL_ATTEMPT = new Set([
  "completed",
  "no_answer",
  "busy",
  "voicemail",
  "failed",
  "unknown",
]);
const OPEN_CHECKIN = new Set(["dialing", "in_progress"]);

export type HandleResult =
  | { status: "processed"; outcome: "completed" | "not_reached" | "audio" }
  | { status: "duplicate" }
  | { status: "ignored"; reason: string };

/** Find our attempt for a provider conversation (or via the secret ids we sent). */
async function findAttempt(db: DbOrTx, event: CallEvent): Promise<Attempt | null> {
  const [byConv] = await db
    .select()
    .from(callAttempts)
    .where(eq(callAttempts.providerConversationId, event.conversationId))
    .limit(1);
  if (byConv) return byConv;
  if (event.type === "transcription") {
    const id = event.dynamicVariables["secret__attempt_id"];
    if (typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)) {
      const [byId] = await db.select().from(callAttempts).where(eq(callAttempts.id, id)).limit(1);
      if (byId && !byId.providerConversationId) {
        // The dial request crashed before we saved the id: link it now.
        await db
          .update(callAttempts)
          .set({ providerConversationId: event.conversationId })
          .where(eq(callAttempts.id, byId.id));
        return { ...byId, providerConversationId: event.conversationId };
      }
      if (byId) return byId;
    }
  }
  return null;
}

export async function handleCallEvent(
  deps: EngineDeps,
  event: CallEvent,
  settings: Settings,
): Promise<HandleResult> {
  const attempt = await findAttempt(deps.db, event);
  if (!attempt) return { status: "ignored", reason: "no matching call attempt" };
  const now = deps.clock.now();

  if (event.type === "audio") {
    await deps.db
      .update(callResults)
      .set({ hasAudio: true })
      .where(eq(callResults.attemptId, attempt.id));
    return { status: "processed", outcome: "audio" };
  }

  if (TERMINAL_ATTEMPT.has(attempt.status)) return { status: "duplicate" };

  if (event.type === "initiation_failure") {
    await recordNotReached(deps, attempt, mapFailure(event), settings, now);
    return { status: "processed", outcome: "not_reached" };
  }

  const kind = classify(event, settings);
  if (kind.answered) {
    return completeCall(deps, attempt, event, settings, now);
  }
  await recordNotReached(deps, attempt, kind.reason, settings, now, event);
  return { status: "processed", outcome: "not_reached" };
}

function mapFailure(e: InitiationFailureEvent): NotReachedReason {
  return e.reason === "busy" ? "busy" : e.reason === "no_answer" ? "no_answer" : "failed";
}

/** Did a real person talk to us, or was it voicemail / no answer? */
export function classify(
  e: TranscriptionEvent,
  settings: Pick<Settings, "voicemail_min_secs">,
): { answered: true } | { answered: false; reason: NotReachedReason } {
  if (e.callResult === "busy") return { answered: false, reason: "busy" };
  if (e.callResult === "no_answer") return { answered: false, reason: "no_answer" };
  if (e.callResult === "failed") return { answered: false, reason: "failed" };
  if (e.callResult === "voicemail") return { answered: false, reason: "voicemail" };
  const userWords = e.transcript
    .filter((t) => t.role === "user")
    .reduce((n, t) => n + t.message.split(/\s+/).filter(Boolean).length, 0);
  if (looksLikeVoicemail(e.transcript)) return { answered: false, reason: "voicemail" };
  if (userWords === 0) return { answered: false, reason: "voicemail" };
  if (userWords < 3 && e.durationSecs < settings.voicemail_min_secs)
    return { answered: false, reason: "voicemail" };
  return { answered: true };
}

function costPaise(durationSecs: number, settings: Settings): number {
  const r = settings.cost_rates;
  const perMin = r.aiPerMinInr + r.platformPerMinInr + r.telephonyPerMinInr;
  return Math.round((durationSecs / 60) * perMin * 100);
}

async function loadContext(
  db: DbOrTx,
  attempt: Attempt,
): Promise<{ checkIn: CheckIn; parent: Parent } | null> {
  const [checkIn] = await db
    .select()
    .from(checkIns)
    .where(eq(checkIns.id, attempt.checkInId))
    .limit(1);
  const [parent] = await db.select().from(parents).where(eq(parents.id, attempt.parentId)).limit(1);
  return checkIn && parent ? { checkIn, parent } : null;
}

/**
 * Not reached: retry in N minutes if allowed (and still inside the calling
 * window, same day), otherwise mark unreachable and alert the family.
 */
export async function recordNotReached(
  deps: EngineDeps,
  attempt: Attempt,
  reason: NotReachedReason,
  settings: Settings,
  now: Date,
  event?: TranscriptionEvent,
): Promise<void> {
  const urgentIds: string[] = [];
  await deps.db.transaction(async (tx) => {
    const updated = await tx
      .update(callAttempts)
      .set({
        status: reason === "unknown" ? "unknown" : reason,
        failureReason: reason,
        endedAt: now,
        durationSecs: event?.durationSecs ?? null,
        costPaise: event ? costPaise(event.durationSecs, settings) : null,
        webhookReceivedAt: now,
      })
      .where(
        and(
          eq(callAttempts.id, attempt.id),
          inArray(callAttempts.status, ["dialing", "in_progress"]),
        ),
      )
      .returning({ id: callAttempts.id });
    if (updated.length === 0) return; // already handled

    const ctx = await loadContext(tx, attempt);
    if (!ctx) return;
    const { checkIn, parent } = ctx;
    if (!OPEN_CHECKIN.has(checkIn.status)) return;

    const retryAt = new Date(now.getTime() + settings.retry_policy.delayMinutes * 60_000);
    const canRetry =
      checkIn.attemptsCount < checkIn.maxAttempts &&
      isWithinCallWindow(retryAt, parent.timezone, settings.call_window) &&
      localDateOf(retryAt, parent.timezone) === checkIn.localDate &&
      (parent.status === "active" || parent.status === "awaiting_consent");

    if (canRetry) {
      await tx
        .update(checkIns)
        .set({
          status: "retry_scheduled",
          nextAttemptAt: retryAt,
          lastFailureReason: reason,
          version: checkIn.version + 1,
          updatedAt: now,
        })
        .where(and(eq(checkIns.id, checkIn.id), eq(checkIns.version, checkIn.version)));
      return;
    }

    await tx
      .update(checkIns)
      .set({
        status: "unreachable",
        lastFailureReason: reason,
        finishedAt: now,
        version: checkIn.version + 1,
        updatedAt: now,
      })
      .where(and(eq(checkIns.id, checkIn.id), eq(checkIns.version, checkIn.version)));

    // An extra "call now" that isn't answered doesn't alarm everyone.
    if (checkIn.slot.startsWith("manual")) return;
    urgentIds.push(
      ...(await raiseUnreachable(tx, deps, { ...checkIn, status: "unreachable" }, parent, now)),
    );
  });
  if (urgentIds.length) {
    await dispatchDue(deps, { ids: urgentIds });
    deps.onUrgent?.();
  }
}

/** Alert the family that we couldn't reach their parent today (idempotent). Returns new notification ids. */
export async function raiseUnreachable(
  tx: DbOrTx,
  deps: Pick<EngineDeps, "appUrl">,
  checkIn: CheckIn,
  parent: Parent,
  now: Date,
): Promise<string[]> {
  const [alert] = await tx
    .insert(alerts)
    .values({
      familyId: parent.familyId,
      parentId: parent.id,
      checkInId: checkIn.id,
      type: "unreachable",
      severity: "urgent",
      title: `Couldn't reach ${parent.addressAs} today`,
      detail: `We tried ${checkIn.attemptsCount} time${checkIn.attemptsCount === 1 ? "" : "s"}. Please call them or ask someone nearby to check.`,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: alerts.id });
  const firstTry = formatClock(checkIn.scheduledFor, parent.timezone);
  const link = `${deps.appUrl}/app/parents/${parent.id}/calls/${checkIn.id}`;
  const tries = String(Math.max(1, checkIn.attemptsCount));
  return enqueueFamilyMessage(
    tx,
    {
      familyId: parent.familyId,
      parentId: parent.id,
      checkInId: checkIn.id,
      alertId: alert?.id ?? null,
      key: `unreachable:${checkIn.id}`,
      template: "not_reached_alert",
      params: {
        en: [parent.addressAs, firstTry, tries, link],
        hi: [parent.addressAs, firstTry, tries, link],
      },
      audience: "alert",
      alertKind: "unreachable",
      priority: "urgent",
    },
    now,
  );
}

/** Tell the family a call couldn't be made because of a problem on our side (idempotent). */
export async function raiseCallProblem(
  tx: DbOrTx,
  checkIn: CheckIn,
  parent: Parent,
  reason: string,
  now: Date,
): Promise<string[]> {
  const [alert] = await tx
    .insert(alerts)
    .values({
      familyId: parent.familyId,
      parentId: parent.id,
      checkInId: checkIn.id,
      type: "system_failure",
      severity: "warning",
      title: `Today's call to ${parent.addressAs} couldn't be made (our fault)`,
      detail: reason,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: alerts.id });
  return enqueueFamilyMessage(
    tx,
    {
      familyId: parent.familyId,
      parentId: parent.id,
      checkInId: checkIn.id,
      alertId: alert?.id ?? null,
      key: `call_problem:${checkIn.id}`,
      template: "call_problem",
      params: { en: [parent.addressAs], hi: [parent.addressAs] },
      audience: "alert",
      alertKind: "unreachable",
      priority: "normal",
    },
    now,
  );
}

// ── Answered calls ───────────────────────────────────────────────────────

const str = (v: unknown): string | null => {
  if (typeof v !== "string") return v === null || v === undefined ? null : String(v);
  const t = v.trim();
  return t && !/^(none|null|n\/a|na|-|unknown)$/i.test(t) ? t : null;
};
const bool = (v: unknown): boolean =>
  v === true || (typeof v === "string" && /^(true|yes|haan|ha|1)$/i.test(v.trim()));

export function parseMood(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number.parseFloat(v) : Number.NaN;
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.min(5, Math.round(n)));
}

/**
 * medicines_taken arrives as text like "Metformin: yes; BP ki goli: no".
 * Match it against the parent's medicine list; anything unmatched is "unclear".
 */
export function parseMedicinesTaken(v: unknown, known: string[]): MedicineAnswer[] {
  if (known.length === 0) return [];
  const text = typeof v === "string" ? v : "";
  const answer = (s: string): MedicineAnswer["taken"] =>
    /\b(no|nahi|nahin|not|skip|bhool|forgot)\b/i.test(s)
      ? "no"
      : /\b(yes|haan|ha|li|le li|taken|took|kha li)\b/i.test(s)
        ? "yes"
        : "unclear";
  const parts = text
    .split(/[;\n]|,(?![^(]*\))/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 1 && !parts[0]!.includes(":")) {
    const all = answer(parts[0]!);
    return known.map((name) => ({ name, taken: all }));
  }
  return known.map((name) => {
    const lower = name.toLowerCase();
    const firstWord = lower.split(/\s+/)[0] ?? lower;
    const part = parts.find((p) => {
      const pl = p.toLowerCase();
      return pl.includes(lower) || pl.split(":")[0]!.trim().includes(firstWord);
    });
    return { name, taken: part ? answer(part.split(":").slice(1).join(":") || part) : "unclear" };
  });
}

async function completeCall(
  deps: EngineDeps,
  attempt: Attempt,
  e: TranscriptionEvent,
  settings: Settings,
  now: Date,
): Promise<HandleResult> {
  const urgentIds: string[] = [];
  let duplicate = false;

  await deps.db.transaction(async (tx) => {
    const ctx = await loadContext(tx, attempt);
    if (!ctx) {
      duplicate = true;
      return;
    }
    const { checkIn, parent } = ctx;
    const dc = e.dataCollection;

    const meds = await tx
      .select({ name: medicines.name })
      .from(medicines)
      .where(and(eq(medicines.parentId, parent.id), eq(medicines.active, true)));
    const dueNames = String(e.dynamicVariables["medicines_due_now"] ?? "")
      .split(",")
      .map((s) => s.replace(/\(.*?\)/g, "").trim())
      .filter((s) => s && s !== "none");
    const askedAbout = meds
      .map((m) => m.name)
      .filter(
        (n) => dueNames.length === 0 || dueNames.some((d) => d.toLowerCase() === n.toLowerCase()),
      );
    const medicinesTaken = parseMedicinesTaken(dc["medicines_taken"], askedAbout);

    const keywordFlags = scanRedFlags(e.transcript);
    const distressHits = scanDistress(e.transcript);
    const agentFlag = bool(dc["red_flag"]);
    const redFlag = agentFlag || keywordFlags.length > 0;
    const distress = bool(dc["distress"]) || distressHits.length > 0;
    const stopQuote = scanStopRequest(e.transcript);
    const wantsToStop = bool(dc["wants_to_stop_calls"]) || stopQuote !== null;
    const consentRaw = str(dc["consent_given"]);
    const consentGiven: "yes" | "no" | "unclear" | null = checkIn.isConsentCall
      ? consentRaw && /^(yes|true|haan|ha)$/i.test(consentRaw)
        ? "yes"
        : consentRaw && /^(no|false|nahi|nahin)$/i.test(consentRaw)
          ? "no"
          : "unclear"
      : null;

    const redFlagDetail = redFlag
      ? (str(dc["red_flag_detail"]) ??
        (keywordFlags.length
          ? `mentioned ${keywordFlags.map((k) => k.label).join(", ")}`
          : "something worrying"))
      : null;
    const facts = {
      addressAs: parent.addressAs,
      mood: parseMood(dc["mood"]),
      moodWords: str(dc["mood_words"]),
      ateMeals: str(dc["ate_meals"]),
      medicines: medicinesTaken,
      sleep: str(dc["sleep"]),
      painOrSymptoms: str(dc["pain_or_symptoms"]),
      notableMoments: str(dc["notable_moments"]),
      redFlagDetail,
      distress,
      isConsentCall: checkIn.isConsentCall,
      consentGiven,
    };
    const summaryEn = cleanSummary(str(dc["summary_for_family_en"])) ?? buildSummaryEn(facts);
    const summaryHi = cleanSummary(str(dc["summary_for_family_hi"])) ?? buildSummaryHi(facts);

    const inserted = await tx
      .insert(callResults)
      .values({
        checkInId: checkIn.id,
        attemptId: attempt.id,
        transcript: e.transcript,
        analysis: { ...dc, provider_summary: e.providerSummary, call_successful: e.callSuccessful },
        consentGiven,
        mood: facts.mood,
        moodWords: facts.moodWords,
        ateMeals: facts.ateMeals,
        medicinesTaken,
        sleep: facts.sleep,
        painOrSymptoms: facts.painOrSymptoms,
        redFlag,
        redFlagDetail,
        redFlagSources: [
          ...(agentFlag ? ["agent"] : []),
          ...keywordFlags.map((k) => `keyword:${k.quote}`),
        ],
        distress,
        wantsToStop,
        followUp: str(dc["follow_up_for_next_call"]),
        notableMoments: facts.notableMoments,
        summaryEn,
        summaryHi,
        hasAudio: e.hasAudio,
        createdAt: now,
      })
      .onConflictDoNothing({ target: callResults.checkInId })
      .returning({ id: callResults.id });
    if (inserted.length === 0) {
      duplicate = true;
      return;
    }

    const answeredAt = e.startedAt ?? attempt.dialedAt;
    await tx
      .update(callAttempts)
      .set({
        status: "completed",
        answeredAt,
        endedAt: new Date(answeredAt.getTime() + e.durationSecs * 1000),
        durationSecs: e.durationSecs,
        costPaise: costPaise(e.durationSecs, settings),
        webhookReceivedAt: now,
      })
      .where(eq(callAttempts.id, attempt.id));
    await tx
      .update(checkIns)
      .set({ status: "completed", finishedAt: now, version: checkIn.version + 1, updatedAt: now })
      .where(eq(checkIns.id, checkIn.id));

    // Memory: the notes and follow-ups we passed in were covered on this call.
    const noteIds = String(e.dynamicVariables["secret__note_ids"] ?? "")
      .split(",")
      .filter((s) => /^[0-9a-f-]{36}$/i.test(s));
    if (noteIds.length) {
      await tx
        .update(familyNotes)
        .set({ usedAt: now, usedInCheckInId: checkIn.id })
        .where(inArray(familyNotes.id, noteIds));
    }
    const followIds = String(e.dynamicVariables["secret__follow_up_ids"] ?? "")
      .split(",")
      .filter((s) => /^[0-9a-f-]{36}$/i.test(s));
    if (followIds.length) {
      await tx.update(followUps).set({ resolvedAt: now }).where(inArray(followUps.id, followIds));
    }
    const followUp = str(dc["follow_up_for_next_call"]);
    if (followUp) {
      await tx.insert(followUps).values({
        parentId: parent.id,
        text: followUp.slice(0, 200),
        sourceCheckInId: checkIn.id,
        createdAt: now,
      });
    }

    const link = `${deps.appUrl}/app/parents/${parent.id}/calls/${checkIn.id}`;
    const base = { familyId: parent.familyId, parentId: parent.id, checkInId: checkIn.id };

    // 1) Safety first: red flags and distress → urgent alerts, sent immediately.
    if (redFlag || distress) {
      const label = redFlag ? (keywordFlags[0]?.label ?? "something worrying") : "feeling very low";
      const quote =
        (redFlag
          ? (keywordFlags[0]?.quote ?? redFlagDetail)
          : (distressHits[0]?.quote ?? "very low")) ?? "";
      const labelHi = redFlag ? "कुछ चिंता की बात" : "बहुत उदासी";
      const [alert] = await tx
        .insert(alerts)
        .values({
          ...base,
          type: redFlag ? "red_flag" : "distress",
          severity: "urgent",
          title: redFlag
            ? `${parent.addressAs} mentioned ${label}`
            : `${parent.addressAs} sounded very low`,
          detail: redFlag
            ? `${redFlagDetail}. We asked them to call family or 112.`
            : "They said something that suggests they're feeling hopeless. We responded with care and shared Tele-MANAS 14416.",
          createdAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: alerts.id });
      urgentIds.push(
        ...(await enqueueFamilyMessage(
          tx,
          {
            ...base,
            alertId: alert?.id ?? null,
            key: `urgent:${checkIn.id}`,
            template: "urgent_alert",
            params: {
              en: [parent.addressAs, label, quote, link],
              hi: [parent.addressAs, labelHi, quote, link],
            },
            audience: "alert",
            alertKind: "red_flag",
            priority: "urgent",
          },
          now,
        )),
      );
    }

    // 2) Consent call outcome, or a request to stop.
    if (wantsToStop) {
      await markOptedOut(tx, parent.id, now);
      const [alert] = await tx
        .insert(alerts)
        .values({
          ...base,
          type: "opted_out",
          severity: "warning",
          title: `${parent.addressAs} asked us to stop calling`,
          detail:
            "We have stopped all calls. If you talk to them and they change their mind, you can restart from the dashboard.",
          createdAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: alerts.id });
      await enqueueFamilyMessage(
        tx,
        {
          ...base,
          alertId: alert?.id ?? null,
          key: `optout:${checkIn.id}`,
          template: "consent_status",
          params: {
            en: [
              `${parent.addressAs} asked us to stop calling, so we have stopped.`,
              `We won't call again unless you restart after talking to them. ${link}`,
            ],
            hi: [
              `${parent.addressAs} ने कॉल बंद करने को कहा, इसलिए हमने कॉल रोक दी हैं।`,
              `जब तक आप उनसे बात करके दोबारा शुरू न करें, हम फ़ोन नहीं करेंगे। ${link}`,
            ],
          },
          audience: "members",
          priority: "normal",
        },
        now,
      );
    } else if (checkIn.isConsentCall) {
      if (consentGiven === "yes") await markConsentGiven(tx, parent.id, now);
      if (consentGiven === "no") await markConsentRefused(tx, parent.id, now);
      const en =
        consentGiven === "yes"
          ? [
              `Good news: ${parent.addressAs} agreed to daily calls. 🌼`,
              `The first daily call is at the usual time on the next call day. ${summaryEn}`,
            ]
          : consentGiven === "no"
            ? [
                `${parent.addressAs} said they don't want daily calls right now, so we've paused.`,
                `You can talk to them and restart anytime from the dashboard. ${link}`,
              ]
            : [
                `We introduced ourselves to ${parent.addressAs}, but couldn't clearly confirm they're happy with daily calls.`,
                `We'll gently ask again on the next call. ${link}`,
              ];
      const hi =
        consentGiven === "yes"
          ? [
              `अच्छी ख़बर: ${parent.addressAs} रोज़ की कॉल के लिए मान गए। 🌼`,
              `पहली रोज़ की कॉल अगले दिन तय समय पर होगी। ${summaryHi}`,
            ]
          : consentGiven === "no"
            ? [
                `${parent.addressAs} ने अभी रोज़ की कॉल के लिए मना किया है, इसलिए हमने कॉल रोक दी हैं।`,
                `आप उनसे बात करके डैशबोर्ड से दोबारा शुरू कर सकते हैं। ${link}`,
              ]
            : [
                `हमने ${parent.addressAs} से परिचय किया, पर साफ़ नहीं हुआ कि वे रोज़ की कॉल के लिए राज़ी हैं।`,
                `अगली कॉल पर हम फिर प्यार से पूछेंगे। ${link}`,
              ];
      if (consentGiven !== "unclear") {
        await tx
          .insert(alerts)
          .values({
            ...base,
            type: consentGiven === "yes" ? "consent_given" : "consent_refused",
            severity: consentGiven === "yes" ? "info" : "warning",
            title:
              consentGiven === "yes"
                ? `${parent.addressAs} agreed to daily calls`
                : `${parent.addressAs} said no to daily calls`,
            status: consentGiven === "yes" ? "resolved" : "open",
            createdAt: now,
          })
          .onConflictDoNothing();
      }
      await enqueueFamilyMessage(
        tx,
        {
          ...base,
          key: `consent:${checkIn.id}`,
          template: "consent_status",
          params: { en, hi },
          audience: "members",
          priority: "normal",
        },
        now,
      );
    } else {
      // 3) The normal warm summary for members who want one after every call.
      const time = formatClock(answeredAt, parent.timezone);
      await enqueueFamilyMessage(
        tx,
        {
          ...base,
          key: `summary:${checkIn.id}`,
          template: "daily_summary",
          params: {
            en: [parent.addressAs, time, summaryEn, link],
            hi: [parent.addressAs, time, summaryHi, link],
          },
          audience: "summary",
          priority: "normal",
        },
        now,
      );
    }
  });

  if (duplicate) return { status: "duplicate" };
  if (urgentIds.length) {
    await dispatchDue(deps, { ids: urgentIds });
    deps.onUrgent?.();
  }
  return { status: "processed", outcome: "completed" };
}
