/**
 * The "virtual week": many parents, random answers, no-answers, red flags,
 * slow / lost / duplicate webhooks, provider outages and failing WhatsApp
 * numbers, all driven through the REAL engine with a fake clock.
 * Afterwards we check the hard rules and return any violations.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import {
  alerts,
  callAttempts,
  callResults,
  checkIns,
  emergencyContacts,
  familyMembers,
  families,
  medicines,
  notifications,
  parents,
  schedules,
  subscriptions,
  webhookEvents,
} from "@/db/schema/app";
import { account, user } from "@/db/schema/auth";
import type { Db } from "@/db/types";
import { FakeClock } from "@/engine/clock";
import type { EngineDeps } from "@/engine/deps";
import { activeCallCount } from "@/engine/dialer";
import { DEFAULT_SETTINGS } from "@/engine/settings";
import { createLogger } from "@/lib/logger";
import { localDateOf, localTimeOf, minutesToHHMM } from "@/lib/time";
import { createMockEmailProvider } from "@/providers/email/mock";
import { createMockVoiceProvider, prng } from "@/providers/voice/mock";
import type { Scenario } from "@/providers/voice/mock-scripts";
import { createMockWhatsAppProvider } from "@/providers/whatsapp/mock";
import { fastForward } from "./fast-forward";

export interface SimulationOptions {
  parents: number;
  days: number;
  seed?: number;
  /** Start of the simulation (UTC). Default: Monday 23 Nov 2026, 00:00 IST. */
  start?: Date;
  log?: (msg: string) => void;
}

export interface SimulationReport {
  parents: number;
  days: number;
  ticks: number;
  checkIns: number;
  attempts: number;
  completed: number;
  unreachable: number;
  redFlags: number;
  optOuts: number;
  notificationsSent: number;
  emailFallbacks: number;
  maxConcurrentCalls: number;
  violations: string[];
  seconds: number;
}

const WEIGHTED: [Scenario, number][] = [
  ["happy", 40],
  ["meds_missed", 8],
  ["short_answers", 5],
  ["lonely", 5],
  ["robot_question", 3],
  ["talks_forever", 3],
  ["hard_of_hearing", 3],
  ["no_answer", 10],
  ["busy", 3],
  ["voicemail", 5],
  ["lost_webhook", 4],
  ["fall", 2],
  ["chest_pain", 1],
  ["hopeless", 1],
  ["opt_out", 1],
  ["silence", 1],
];
const TOTAL = WEIGHTED.reduce((a, [, w]) => a + w, 0);

function pick(rand: () => number): Scenario {
  let r = rand() * TOTAL;
  for (const [s, w] of WEIGHTED) {
    if ((r -= w) < 0) return s;
  }
  return "happy";
}

const ZONES = [
  "Asia/Kolkata",
  "Asia/Kolkata",
  "Asia/Kolkata",
  "Asia/Kolkata",
  "Asia/Kolkata",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Europe/London",
];

export async function runSimulation(db: Db, opts: SimulationOptions): Promise<SimulationReport> {
  const t0 = Date.now();
  const log = opts.log ?? (() => {});
  const rand = prng(opts.seed ?? 2026);
  const start = opts.start ?? new Date("2026-11-22T18:30:00Z");
  const clock = new FakeClock(start);
  const before = new Date(start.getTime() - 3600_000);
  const failingNumbers = new Set<string>();

  // ── Families ───────────────────────────────────────────────────────────
  const pwHash = await hashPassword("simulation-password");
  for (let i = 0; i < opts.parents; i++) {
    const uid = `sim_user_${i}`;
    await db
      .insert(user)
      .values({
        id: uid,
        name: `Child ${i}`,
        email: `child${i}@sim.test`,
        emailVerified: true,
        createdAt: before,
        updatedAt: before,
      });
    await db
      .insert(account)
      .values({
        id: `${uid}_c`,
        accountId: uid,
        providerId: "credential",
        userId: uid,
        password: pwHash,
        createdAt: before,
        updatedAt: before,
      });
    const [fam] = await db
      .insert(families)
      .values({ name: `Sim family ${i}`, createdByUserId: uid, createdAt: before })
      .returning();
    const wa = `+9198${String(70000000 + i)}`;
    if (rand() < 0.08) failingNumbers.add(wa); // WhatsApp keeps failing for these → email fallback
    await db
      .insert(familyMembers)
      .values({
        familyId: fam!.id,
        userId: uid,
        role: "owner",
        displayName: `Child ${i}`,
        whatsappE164: wa,
        createdAt: before,
      });
    const tz = ZONES[Math.floor(rand() * ZONES.length)]!;
    // Call times between 08:00 and 19:30, clustered around mornings, some at the edges.
    const minutes =
      rand() < 0.1
        ? 19 * 60 + 30
        : rand() < 0.6
          ? 9 * 60 + Math.floor(rand() * 90)
          : 8 * 60 + Math.floor(rand() * 690);
    const status = rand() < 0.1 ? "awaiting_consent" : "active";
    const [p] = await db
      .insert(parents)
      .values({
        familyId: fam!.id,
        name: `Parent ${i}`,
        addressAs: i % 2 ? "Papa ji" : "Maa",
        phoneE164: `+9197${String(70000000 + i)}`,
        timezone: tz,
        status,
        voice: i % 2 ? "male" : "female",
        onboardingStep: 8,
        onboardingCompletedAt: before,
        consentGivenAt: status === "active" ? before : null,
        createdAt: before,
        updatedAt: before,
      })
      .returning();
    await db
      .insert(schedules)
      .values({
        parentId: p!.id,
        callTime: minutesToHHMM(Math.min(minutes, 19 * 60 + 30)),
        daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
        updatedAt: before,
      });
    await db
      .insert(medicines)
      .values({ parentId: p!.id, name: "BP tablet", timing: "morning", withFood: "either" });
    await db
      .insert(emergencyContacts)
      .values({
        parentId: p!.id,
        name: "Neighbour",
        whatsappE164: `+9196${String(70000000 + i)}`,
        email: `neighbour${i}@sim.test`,
      });
    await db
      .insert(subscriptions)
      .values({
        parentId: p!.id,
        familyId: fam!.id,
        planId: "standard",
        status: "active",
        currentPeriodEnd: new Date(start.getTime() + 40 * 86400_000),
      });
  }
  log(`created ${opts.parents} families`);

  // ── Chaos ──────────────────────────────────────────────────────────────
  // A full provider outage on day 2 from 09:00 to 09:40 IST, plus 2% random dial failures.
  const outageFrom = new Date(start.getTime() + 1 * 86400_000 + 9 * 3600_000);
  const outageTo = new Date(outageFrom.getTime() + 40 * 60_000);
  const deps: EngineDeps = {
    db,
    clock,
    voice: createMockVoiceProvider(db, clock, {
      seed: opts.seed ?? 2026,
      chooseScenario: (input, r) =>
        input.dynamicVariables["is_consent_call"] === "yes"
          ? r() < 0.85
            ? "consent_yes"
            : "consent_no"
          : pick(r),
      failStart: () => {
        const now = clock.now();
        if (now >= outageFrom && now < outageTo)
          return "503 Service Unavailable (simulated outage)";
        return rand() < 0.02 ? "connection reset (simulated)" : null;
      },
      // Webhooks arrive 10 s to 9 min after the call ends (some will look "stuck" and get reconciled).
      resultDelaySecs: (_s, talk) => talk + 10 + Math.floor(rand() * 540),
      duplicateWebhooks: () => rand() < 0.1,
      audioFirst: rand() < 0.5,
    }),
    whatsapp: createMockWhatsAppProvider(db, clock, {
      shouldFail: (to) => (failingNumbers.has(to) ? "recipient not on WhatsApp (simulated)" : null),
    }),
    email: createMockEmailProvider(db, clock),
    logger: createLogger({ sim: true }, { level: "error", sink: (line) => log(line) }),
    appUrl: "https://sim.khairiyat.test",
    encryptionKey: Buffer.alloc(32, 1).toString("base64"),
  };

  const violations: string[] = [];
  let maxConcurrent = 0;
  const end = new Date(start.getTime() + opts.days * 86400_000);
  const { ticks } = await fastForward(deps, clock, end, {
    maxStepMinutes: 10,
    onTick: async () => {
      const n = await activeCallCount(deps);
      maxConcurrent = Math.max(maxConcurrent, n);
      if (n > DEFAULT_SETTINGS.concurrency_limit)
        violations.push(`concurrency exceeded: ${n} calls at ${clock.now().toISOString()}`);
    },
  });
  // Let the last calls finish and messages go out.
  await fastForward(deps, clock, new Date(end.getTime() + 2 * 3600_000), { maxStepMinutes: 1 });
  log(`ran ${ticks} ticks`);

  // ── Checks ─────────────────────────────────────────────────────────────
  const allParents = await db.select().from(parents);
  const byParent = new Map(allParents.map((p) => [p.id, p]));
  const cis = await db.select().from(checkIns);
  const attempts = await db.select().from(callAttempts).orderBy(asc(callAttempts.dialedAt));

  // 1. No double calls.
  const slotKeys = new Set<string>();
  for (const c of cis) {
    const k = `${c.parentId}:${c.localDate}:${c.slot}`;
    if (slotKeys.has(k)) violations.push(`double check-in ${k}`);
    slotKeys.add(k);
  }
  const attemptsByCheckIn = new Map<string, typeof attempts>();
  for (const a of attempts)
    attemptsByCheckIn.set(a.checkInId, [...(attemptsByCheckIn.get(a.checkInId) ?? []), a]);
  for (const [cid, list] of attemptsByCheckIn) {
    const ci = cis.find((c) => c.id === cid)!;
    if (list.length > ci.maxAttempts)
      violations.push(`too many attempts (${list.length}) for check-in ${cid}`);
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1]!;
      if (!prev.endedAt || prev.endedAt > list[i]!.dialedAt)
        violations.push(`overlapping attempts for check-in ${cid}`);
    }
  }
  // Same parent never on two calls at once (daily + manual etc.).
  const byParentAttempts = new Map<string, typeof attempts>();
  for (const a of attempts)
    byParentAttempts.set(a.parentId, [...(byParentAttempts.get(a.parentId) ?? []), a]);
  for (const [pid, list] of byParentAttempts) {
    const sameDay = new Map<string, number>();
    for (const a of list) {
      const p = byParent.get(pid)!;
      const d = localDateOf(a.dialedAt, p.timezone);
      sameDay.set(d, (sameDay.get(d) ?? 0) + 1);
    }
    for (const [d, n] of sameDay)
      if (n > 3) violations.push(`parent ${pid} dialled ${n} times on ${d}`);
  }

  // 2. No calls outside 08:00–20:00 local.
  for (const a of attempts) {
    const p = byParent.get(a.parentId)!;
    const t = localTimeOf(a.dialedAt, p.timezone);
    if (t < "08:00" || t >= "20:00") violations.push(`call at ${t} local for parent ${a.parentId}`);
  }

  // 3. Every unreachable (daily/consent) produced an alert and a delivered message.
  const unreachable = cis.filter((c) => c.status === "unreachable" && !c.slot.startsWith("manual"));
  for (const c of unreachable) {
    const al = await db
      .select()
      .from(alerts)
      .where(and(eq(alerts.checkInId, c.id), eq(alerts.type, "unreachable")));
    if (al.length !== 1) violations.push(`unreachable check-in ${c.id} has ${al.length} alerts`);
    const msgs = await db
      .select()
      .from(notifications)
      .where(
        and(eq(notifications.checkInId, c.id), eq(notifications.template, "not_reached_alert")),
      );
    if (!msgs.some((m) => m.status === "sent"))
      violations.push(`unreachable check-in ${c.id}: no alert message delivered`);
  }

  // 4. Every red flag alerted within 1 minute of the result arriving.
  const flagged = await db.select().from(callResults).where(eq(callResults.redFlag, true));
  for (const r of flagged) {
    const [attempt] = await db.select().from(callAttempts).where(eq(callAttempts.id, r.attemptId!));
    const events = await db
      .select()
      .from(webhookEvents)
      .where(
        inArray(webhookEvents.eventKey, [
          `${attempt!.providerConversationId}:post_call_transcription`,
        ]),
      );
    const received = events[0]?.receivedAt;
    const urgent = await db
      .select()
      .from(notifications)
      .where(
        and(eq(notifications.checkInId, r.checkInId), eq(notifications.template, "urgent_alert")),
      );
    const firstSent = urgent
      .filter((n) => n.sentAt)
      .map((n) => n.sentAt!.getTime())
      .sort()[0];
    if (!received || !firstSent) violations.push(`red flag ${r.checkInId}: no urgent alert sent`);
    else if (firstSent - received.getTime() > 60_000)
      violations.push(
        `red flag ${r.checkInId}: alert took ${(firstSent - received.getTime()) / 1000}s`,
      );
    // Each recipient must have received it on at least one channel.
    const recipients = new Set(urgent.map((n) => n.recipientMemberId ?? n.recipientContactId));
    for (const rec of recipients) {
      if (
        !urgent.some(
          (n) => (n.recipientMemberId ?? n.recipientContactId) === rec && n.status === "sent",
        )
      ) {
        violations.push(`red flag ${r.checkInId}: recipient ${rec} got nothing`);
      }
    }
  }

  // 5. Never called after an opt-out.
  const optedOut = allParents.filter((p) => p.optedOutAt);
  for (const p of optedOut) {
    const after = attempts.filter((a) => a.parentId === p.id && a.dialedAt > p.optedOutAt!);
    if (after.length)
      violations.push(`parent ${p.id} called ${after.length} times after opting out`);
  }

  // 6. Everything converged: nothing stuck, no unprocessed webhooks, no lost messages.
  const stuck = cis.filter(
    (c) =>
      c.status === "dialing" ||
      c.status === "in_progress" ||
      c.status === "scheduled" ||
      c.status === "retry_scheduled",
  );
  if (stuck.length) violations.push(`${stuck.length} check-ins never finished`);
  const pendingHooks = await db
    .select()
    .from(webhookEvents)
    .where(inArray(webhookEvents.status, ["pending", "failed"]));
  if (pendingHooks.length) violations.push(`${pendingHooks.length} webhook events not processed`);
  const notifs = await db.select().from(notifications);
  const unsent = notifs.filter(
    (n) => n.status === "pending" || n.status === "sending" || n.status === "failed",
  );
  if (unsent.length) violations.push(`${unsent.length} notifications still unsent`);
  for (const n of notifs.filter((x) => x.status === "dead" && x.channel === "whatsapp")) {
    if (!notifs.some((e) => e.fallbackOfId === n.id && e.status === "sent"))
      violations.push(`dead WhatsApp ${n.id} has no email fallback`);
  }

  return {
    parents: opts.parents,
    days: opts.days,
    ticks,
    checkIns: cis.length,
    attempts: attempts.length,
    completed: cis.filter((c) => c.status === "completed").length,
    unreachable: unreachable.length,
    redFlags: flagged.length,
    optOuts: optedOut.length,
    notificationsSent: notifs.filter((n) => n.status === "sent").length,
    emailFallbacks: notifs.filter((n) => n.fallbackOfId).length,
    maxConcurrentCalls: maxConcurrent,
    violations,
    seconds: Math.round((Date.now() - t0) / 1000),
  };
}
