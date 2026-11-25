/**
 * Demo data: realistic families, then the REAL engine is run through the
 * last few weeks in virtual time, so dashboards, alerts, summaries and the
 * phone preview are all genuine engine output (not hand-written rows).
 *
 * Node-only. Never runs in production.
 */
import { hashPassword } from "better-auth/crypto";
import { and, desc, eq, lt, ne, sql } from "drizzle-orm";
import { DEFAULT_PLANS } from "@/config/defaults";
import { ensureReferenceData } from "@/db/bootstrap";
import {
  alerts,
  appSettings,
  emergencyContacts,
  engineLeases,
  familyMembers,
  familyNotes,
  families,
  invoices,
  jobRuns,
  medicines,
  parents,
  payments,
  schedules,
  subscriptions,
} from "@/db/schema/app";
import { account, user } from "@/db/schema/auth";
import type { Db } from "@/db/types";
import { FakeClock } from "@/engine/clock";
import type { EngineDeps } from "@/engine/deps";
import { runTick } from "@/engine/tick";
import { encryptText } from "@/lib/crypto";
import { createLogger } from "@/lib/logger";
import { addDaysToLocalDate, localDateOf } from "@/lib/time";
import { createMockEmailProvider } from "@/providers/email/mock";
import { createMockVoiceProvider, demoScenarioChooser, prng } from "@/providers/voice/mock";
import type { Scenario } from "@/providers/voice/mock-scripts";
import { createMockWhatsAppProvider } from "@/providers/whatsapp/mock";
import { DEMO_LOGIN } from "@/server/demo-accounts";
import { fastForward } from "./fast-forward";

const TABLES_TO_WIPE = [
  "users",
  "families",
  "app_settings",
  "audit_logs",
  "job_runs",
  "webhook_events",
  "mock_messages",
  "mock_calls",
  "rate_limits",
  "verifications",
];

/**
 * The hosted demo's "only one request builds the demo" lease. A wipe keeps
 * it: whoever is wiping holds it, and dropping it would let another request
 * tick the real engine in the middle of the rebuild.
 */
export const DEMO_WORLD_LEASE = "demo-world";

export async function wipeDemoData(db: Db): Promise<void> {
  await db.execute(sql.raw(`TRUNCATE ${TABLES_TO_WIPE.map((t) => `"${t}"`).join(", ")} CASCADE`));
  // The engine's own leases go: the history is replayed with a clock in the past.
  await db.delete(engineLeases).where(ne(engineLeases.name, DEMO_WORLD_LEASE));
  await ensureReferenceData(db);
}

async function createUser(
  db: Db,
  u: { email: string; password: string; name: string },
  createdAt: Date,
) {
  const id = `demo_${u.email.split("@")[0]!.replace(/\W/g, "")}`;
  await db.insert(user).values({
    id,
    name: u.name,
    email: u.email,
    emailVerified: true,
    createdAt,
    updatedAt: createdAt,
  });
  await db.insert(account).values({
    id: `${id}_cred`,
    accountId: id,
    providerId: "credential",
    userId: id,
    password: await hashPassword(u.password),
    createdAt,
    updatedAt: createdAt,
  });
  return id;
}

interface ParentSpec {
  key: string;
  name: string;
  addressAs: string;
  phone: string;
  city: string;
  language: "hi" | "hinglish" | "ur" | "en";
  voice: "female" | "male";
  hearing?: boolean;
  callTime: string;
  timezone?: string;
  meds: {
    name: string;
    timing: "morning" | "afternoon" | "night";
    withFood: "with" | "without" | "either";
  }[];
  topics: string[];
  avoid?: string[];
  health?: string;
  contact: { name: string; relation: string; phone: string };
  /** Days ago the family set this parent up. */
  since: number;
  status?: "active" | "awaiting_consent";
  sub: {
    plan: string;
    status: "trialing" | "active" | "past_due";
    trialDaysLeft?: number;
    graceDaysLeft?: number;
  };
  /** Scenario per "days ago" (0 = today). Others use the default mix. */
  plan?: Record<number, Scenario>;
  style?: Scenario[];
}

interface FamilySpec {
  name: string;
  members: {
    email: string;
    password: string;
    name: string;
    whatsapp: string;
    timezone: string;
    mode: "every_call" | "alerts_only" | "daily_digest";
    lang: "en" | "hi";
  }[];
  parents: ParentSpec[];
  news?: Record<string, string[]>;
  notes?: Record<string, string[]>;
}

const pw = "khairiyat-demo";

const FAMILIES: FamilySpec[] = [
  {
    name: "Sharma family",
    members: [
      {
        ...DEMO_LOGIN.family,
        whatsapp: "+919876500001",
        timezone: "Asia/Kolkata",
        mode: "every_call",
        lang: "en",
      },
      {
        ...DEMO_LOGIN.sibling,
        whatsapp: "+447911500002",
        timezone: "Europe/London",
        mode: "daily_digest",
        lang: "hi",
      },
    ],
    parents: [
      {
        key: "maa",
        name: "Kamla Sharma",
        addressAs: "Maa",
        phone: "+919415500011",
        city: "Lucknow",
        language: "hi",
        voice: "female",
        callTime: "09:30",
        meds: [
          { name: "Metformin 500", timing: "morning", withFood: "with" },
          { name: "Amlodipine 5", timing: "morning", withFood: "either" },
          { name: "Calcium", timing: "night", withFood: "with" },
        ],
        topics: ["bhajans", "grandkids Kabir and Myra", "old Lata Mangeshkar songs", "her garden"],
        avoid: ["property matters"],
        health: "Knee pain in the mornings. Cataract surgery last year, so reading is hard.",
        contact: { name: "Sunita aunty", relation: "Neighbour", phone: "+919415500099" },
        since: 21,
        sub: { plan: "founding", status: "active" },
        plan: {
          16: "meds_missed",
          12: "no_answer",
          9: "lonely",
          6: "robot_question",
          3: "scam_otp",
          2: "talks_forever",
          1: "happy",
        },
        style: ["happy", "happy", "meds_missed", "happy", "lonely"],
      },
      {
        key: "papa",
        name: "Ramesh Sharma",
        addressAs: "Papa ji",
        phone: "+919415500012",
        city: "Lucknow",
        language: "hinglish",
        voice: "male",
        hearing: true,
        callTime: "10:00",
        meds: [
          { name: "Thyroxine 50", timing: "morning", withFood: "without" },
          { name: "Atorvastatin 10", timing: "night", withFood: "either" },
        ],
        topics: ["cricket", "Kishore Kumar songs", "the morning newspaper"],
        health: "Hard of hearing in the left ear.",
        contact: { name: "Sunita aunty", relation: "Neighbour", phone: "+919415500099" },
        since: 21,
        sub: { plan: "standard", status: "active" },
        plan: { 10: "voicemail", 4: "meds_missed", 1: "hard_of_hearing" },
        style: ["hard_of_hearing", "happy", "robot_question", "talks_forever"],
      },
    ],
    news: {
      maa: ["Riya's son Kabir won the school drawing competition"],
      papa: ["India won the test match series"],
    },
    notes: { maa: ["Ask if the plumber came to fix the kitchen tap"] },
  },
  {
    name: "Khan family",
    members: [
      {
        email: "sameer@demo.khairiyat.app",
        password: pw,
        name: "Sameer Khan",
        whatsapp: "+971501234567",
        timezone: "Asia/Dubai",
        mode: "every_call",
        lang: "en",
      },
    ],
    parents: [
      {
        key: "ammi",
        name: "Shabana Khan",
        addressAs: "Ammi",
        phone: "+919839500021",
        city: "Lucknow",
        language: "ur",
        voice: "female",
        callTime: "11:00",
        meds: [{ name: "BP ki goli", timing: "morning", withFood: "either" }],
        topics: ["ghazals", "cooking", "her grandchildren in Dubai"],
        contact: { name: "Imran", relation: "Nephew", phone: "+919839500098" },
        since: 0,
        status: "awaiting_consent",
        sub: { plan: "abroad", status: "trialing", trialDaysLeft: 7 },
      },
    ],
  },
  {
    name: "Gupta family",
    members: [
      {
        email: "neha@demo.khairiyat.app",
        password: pw,
        name: "Neha Gupta",
        whatsapp: "+919811500031",
        timezone: "America/New_York",
        mode: "every_call",
        lang: "en",
      },
    ],
    parents: [
      {
        key: "nanaji",
        name: "Suresh Gupta",
        addressAs: "Papa",
        phone: "+919811500032",
        city: "Delhi",
        language: "hinglish",
        voice: "female",
        callTime: "09:00",
        meds: [{ name: "Ecosprin 75", timing: "morning", withFood: "with" }],
        topics: ["politics", "his walk in Lodhi Garden"],
        contact: { name: "Ravi", relation: "Driver", phone: "+919811500039" },
        since: 14,
        sub: { plan: "abroad", status: "active" },
        plan: { 1: "chest_pain" },
      },
    ],
  },
  {
    name: "Iyer family",
    members: [
      {
        email: "lakshmi@demo.khairiyat.app",
        password: pw,
        name: "Lakshmi Iyer",
        whatsapp: "+919840500041",
        timezone: "Asia/Kolkata",
        mode: "alerts_only",
        lang: "en",
      },
    ],
    parents: [
      {
        key: "amma",
        name: "Meenakshi Iyer",
        addressAs: "Amma",
        phone: "+919840500042",
        city: "Chennai",
        language: "en",
        voice: "female",
        callTime: "08:30",
        meds: [{ name: "Insulin", timing: "morning", withFood: "with" }],
        topics: ["Carnatic music", "temple visits"],
        contact: { name: "Vasu", relation: "Son", phone: "+919840500049" },
        since: 3,
        sub: { plan: "standard", status: "trialing", trialDaysLeft: 4 },
      },
    ],
  },
  {
    name: "Fernandes family",
    members: [
      {
        email: "joel@demo.khairiyat.app",
        password: pw,
        name: "Joel Fernandes",
        whatsapp: "+919822500051",
        timezone: "Asia/Kolkata",
        mode: "every_call",
        lang: "en",
      },
    ],
    parents: [
      {
        key: "mae",
        name: "Maria Fernandes",
        addressAs: "Mãe",
        phone: "+919822500052",
        city: "Goa",
        language: "en",
        voice: "female",
        callTime: "10:30",
        meds: [],
        topics: ["church choir", "her dog Bruno"],
        contact: { name: "Anita", relation: "Neighbour", phone: "+919822500059" },
        since: 35,
        sub: { plan: "standard", status: "past_due", graceDaysLeft: 2 },
      },
    ],
  },
  {
    name: "Das family",
    members: [
      {
        email: "arnab@demo.khairiyat.app",
        password: pw,
        name: "Arnab Das",
        whatsapp: "+919830500061",
        timezone: "Asia/Singapore",
        mode: "every_call",
        lang: "en",
      },
    ],
    parents: [
      {
        key: "baba",
        name: "Subrata Das",
        addressAs: "Baba",
        phone: "+919830500062",
        city: "Kolkata",
        language: "hinglish",
        voice: "male",
        callTime: "09:45",
        meds: [],
        topics: ["football", "fish curry"],
        contact: { name: "Mitra", relation: "Daughter", phone: "+919830500069" },
        since: 10,
        sub: { plan: "standard", status: "active" },
        plan: { 5: "opt_out" },
      },
    ],
  },
];

export interface SeedResult {
  families: number;
  parents: number;
  ticks: number;
}

interface DemoOptions {
  now: Date;
  encryptionKey: string;
  appUrl: string;
}

/**
 * Where the demo world's history build stands (app_settings "demo_world").
 * Kept in the database so the hosted demo can build it over several
 * requests: each one runs the engine a few seconds further.
 */
interface DemoWorldMarker {
  /** First moment of simulated history. */
  start: string;
  /** "Now" when the demo was created: planned scenarios count days back from it. */
  anchor: string;
  /**
   * False while the families are being created (an interrupted creation
   * starts over). Missing in markers written before this field existed.
   */
  created?: boolean;
  done: boolean;
  /** parentId → local date → forced scenario (the fall yesterday, the opt-out…). */
  plans: Record<string, Record<string, Scenario>>;
  /** parentId → the scenarios that parent's calls usually follow. */
  styles: Record<string, Scenario[]>;
}

const WORLD_KEY = "demo_world";

async function readMarker(db: Db): Promise<DemoWorldMarker | null> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, WORLD_KEY));
  return (row?.value as DemoWorldMarker | undefined) ?? null;
}

async function writeMarker(db: Db, marker: DemoWorldMarker): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key: WORLD_KEY, value: marker })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: marker, updatedAt: new Date() } });
}

/**
 * Wipe and rebuild all demo data, ending at `now`.
 * `days` limits how much history is simulated (smaller = faster, e.g. for e2e tests).
 */
export async function seedDemo(db: Db, opts: DemoOptions & { days?: number }): Promise<SeedResult> {
  const created = await startDemoWorld(db, opts);
  const { ticks } = await continueDemoWorld(db, opts);
  return { ...created, ticks };
}

/**
 * Step 1 of the demo (fast): wipe, then create the families, parents,
 * medicines and subscriptions as they were `days` ago. The history is made
 * by continueDemoWorld().
 */
export async function startDemoWorld(
  db: Db,
  opts: DemoOptions & { days?: number },
): Promise<{ families: number; parents: number }> {
  const maxDays = opts.days ?? 21;
  await wipeDemoData(db);
  const start = new Date(opts.now.getTime() - maxDays * 24 * 3600_000);
  const DAY = 24 * 3600_000;
  // First thing after the wipe: from now on everyone sees "being built".
  await writeMarker(db, {
    start: start.toISOString(),
    anchor: opts.now.toISOString(),
    created: false,
    done: false,
    plans: {},
    styles: {},
  });

  const plans: Record<string, Record<string, Scenario>> = {}; // parentId → localDate → scenario
  const styles: Record<string, Scenario[]> = {};
  let parentCount = 0;

  const adminCreated = new Date(start.getTime() - DAY);
  await createUser(db, DEMO_LOGIN.admin, adminCreated);

  for (const fam of FAMILIES) {
    const oldest = Math.min(maxDays, Math.max(...fam.parents.map((p) => p.since)));
    const famCreated = new Date(opts.now.getTime() - oldest * DAY - 3600_000);
    const memberIds: string[] = [];
    let familyId = "";
    for (const [i, m] of fam.members.entries()) {
      const uid = await createUser(db, m, famCreated);
      if (i === 0) {
        const [f] = await db
          .insert(families)
          .values({ name: fam.name, createdByUserId: uid, createdAt: famCreated })
          .returning();
        familyId = f!.id;
      }
      const [mem] = await db
        .insert(familyMembers)
        .values({
          familyId,
          userId: uid,
          role: i === 0 ? "owner" : "member",
          displayName: m.name,
          whatsappE164: m.whatsapp,
          notifyMode: m.mode,
          summaryLanguage: m.lang,
          timezone: m.timezone,
          createdAt: famCreated,
        })
        .returning();
      memberIds.push(mem!.id);
    }

    for (const p of fam.parents) {
      parentCount++;
      const since = new Date(opts.now.getTime() - Math.min(maxDays, p.since) * DAY - 3600_000);
      const status = p.status ?? "active";
      const [row] = await db
        .insert(parents)
        .values({
          familyId,
          name: p.name,
          addressAs: p.addressAs,
          phoneE164: p.phone,
          city: p.city,
          language: p.language,
          voice: p.voice,
          hearingDifficulty: p.hearing ?? false,
          timezone: p.timezone ?? "Asia/Kolkata",
          status,
          onboardingStep: 8,
          onboardingCompletedAt: status === "awaiting_consent" ? opts.now : since,
          familyConfirmedToldParentAt: since,
          consentGivenAt: status === "active" ? since : null,
          topicsEnjoyed: p.topics,
          topicsToAvoid: p.avoid ?? [],
          createdAt: since,
          updatedAt: since,
        })
        .returning();
      const parentId = row!.id;
      await db.insert(schedules).values({
        parentId,
        callTime: p.callTime,
        daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
        updatedAt: since,
      });
      if (p.meds.length) {
        await db
          .insert(medicines)
          .values(p.meds.map((m, i) => ({ parentId, ...m, sortOrder: i, createdAt: since })));
      }
      await db.insert(emergencyContacts).values({
        parentId,
        name: p.contact.name,
        relation: p.contact.relation,
        whatsappE164: p.contact.phone,
        createdAt: since,
      });
      if (p.health) {
        const { parentHealthNotes } = await import("@/db/schema/app");
        await db
          .insert(parentHealthNotes)
          .values({ parentId, ciphertext: await encryptText(p.health, opts.encryptionKey) });
      }
      for (const text of fam.news?.[p.key] ?? []) {
        await db.insert(familyNotes).values({
          parentId,
          kind: "news",
          text,
          createdByMemberId: memberIds[0],
          expiresAt: new Date(opts.now.getTime() + 7 * DAY),
          createdAt: new Date(opts.now.getTime() - 2 * DAY),
        });
      }
      for (const text of fam.notes?.[p.key] ?? []) {
        // Added "yesterday evening": used on the next call.
        await db.insert(familyNotes).values({
          parentId,
          kind: "next_call",
          text,
          createdByMemberId: memberIds[0],
          createdAt: new Date(opts.now.getTime() - 0.5 * DAY),
        });
      }

      const plan = DEFAULT_PLANS.find((x) => x.id === p.sub.plan)!;
      const [sub] = await db
        .insert(subscriptions)
        .values({
          parentId,
          familyId,
          planId: plan.id,
          status: p.sub.status,
          trialEndsAt:
            p.sub.status === "trialing"
              ? new Date(opts.now.getTime() + (p.sub.trialDaysLeft ?? 7) * DAY)
              : new Date(since.getTime() + 7 * DAY),
          currentPeriodStart:
            p.sub.status === "trialing" ? null : new Date(opts.now.getTime() - 12 * DAY),
          currentPeriodEnd:
            p.sub.status === "trialing" ? null : new Date(opts.now.getTime() + 18 * DAY),
          graceUntil:
            p.sub.status === "past_due"
              ? new Date(opts.now.getTime() + (p.sub.graceDaysLeft ?? 3) * DAY)
              : null,
          provider: "mock",
          providerSubscriptionId: `mock_sub_${parentId.slice(0, 8)}`,
          createdAt: since,
          updatedAt: since,
        })
        .returning();
      if (p.sub.status !== "trialing") {
        const [pay] = await db
          .insert(payments)
          .values({
            subscriptionId: sub!.id,
            familyId,
            amountInr: plan.priceInr,
            status: "captured",
            providerPaymentId: `mock_pay_${parentId.slice(0, 8)}`,
            method: "upi",
            createdAt: new Date(opts.now.getTime() - 12 * DAY),
          })
          .returning();
        await db.insert(invoices).values({
          familyId,
          subscriptionId: sub!.id,
          paymentId: pay!.id,
          number: `KH-DEMO-${parentId.slice(0, 6).toUpperCase()}`,
          description: `${plan.name} plan for ${p.addressAs} (monthly)`,
          amountInr: plan.priceInr,
          periodStart: new Date(opts.now.getTime() - 12 * DAY),
          periodEnd: new Date(opts.now.getTime() + 18 * DAY),
          createdAt: new Date(opts.now.getTime() - 12 * DAY),
        });
      }

      const tz = p.timezone ?? "Asia/Kolkata";
      const today = localDateOf(opts.now, tz);
      plans[parentId] = {};
      for (const [daysAgo, scenario] of Object.entries(p.plan ?? {})) {
        plans[parentId][addDaysToLocalDate(today, -Number(daysAgo))] = scenario;
      }
      styles[parentId] = p.style ?? [];
    }
  }

  await writeMarker(db, {
    start: start.toISOString(),
    anchor: opts.now.toISOString(),
    created: true,
    done: false,
    plans,
    styles,
  });
  return { families: FAMILIES.length, parents: parentCount };
}

export interface DemoProgress {
  /** "seed": building the first history. "catch_up": replaying time nobody visited. */
  kind: "seed" | "catch_up" | "none";
  /** True when the demo world has reached `now`. */
  done: boolean;
  ticks: number;
  /** Seed only: share of the history built so far (0–1). */
  progress: number;
  /** Simulated time still to replay, in minutes. */
  minutesLeft: number;
}

/**
 * Step 2: run the REAL engine through virtual time up to `now`, either the
 * first history (after startDemoWorld) or the time since the demo last ran.
 * With `budgetMs` it stops after about that long; call it again to go on.
 */
export async function continueDemoWorld(
  db: Db,
  opts: DemoOptions & { budgetMs?: number },
): Promise<DemoProgress> {
  const marker = await readMarker(db);
  if (marker?.created === false) {
    throw new Error("The demo families are still being created: call startDemoWorld() first.");
  }
  if (marker && !marker.done) return continueSeed(db, marker, opts);
  const r = await catchUpDemo(db, opts);
  if (!r) return { kind: "none", done: true, ticks: 0, progress: 1, minutesLeft: 0 };
  return { kind: "catch_up", ...r };
}

/**
 * Fast-forward jumps over quiet hours, so its last tick can be well before
 * `now`. One tick at `now` records that the world is up to date.
 */
async function finalTick(deps: EngineDeps, clock: FakeClock, now: Date): Promise<void> {
  clock.set(now);
  await runTick(deps);
}

function stopAfter(budgetMs: number | undefined): (() => boolean) | undefined {
  if (budgetMs === undefined) return undefined;
  const until = performance.now() + budgetMs;
  return () => performance.now() > until;
}

async function lastTickAt(db: Db): Promise<Date | null> {
  const [last] = await db
    .select({ t: jobRuns.startedAt })
    .from(jobRuns)
    .orderBy(desc(jobRuns.startedAt))
    .limit(1);
  return last?.t ?? null;
}

async function continueSeed(
  db: Db,
  marker: DemoWorldMarker,
  opts: DemoOptions & { budgetMs?: number },
): Promise<DemoProgress> {
  const start = new Date(marker.start);
  const last = await lastTickAt(db);
  const from = new Date(Math.max(start.getTime(), last?.getTime() ?? 0));
  const clock = new FakeClock(from);
  const rand = prng(7 + (Math.floor(from.getTime() / 60_000) % 9973));
  const deps: EngineDeps = {
    db,
    clock,
    voice: createMockVoiceProvider(db, clock, {
      resultDelaySecs: (_s, talk) => talk + 15,
      seed: 11 + (Math.floor(from.getTime() / 60_000) % 9973),
      chooseScenario: (input, r) => {
        const date = localDateOf(clock.now(), "Asia/Kolkata");
        const planned = marker.plans[input.meta.parentId]?.[date];
        if (planned) return planned;
        if (input.dynamicVariables["is_consent_call"] === "yes") return "consent_yes";
        const style = marker.styles[input.meta.parentId] ?? [];
        if (style.length && r() < 0.85) return style[Math.floor(rand() * style.length)]!;
        return demoScenarioChooser(input, r);
      },
    }),
    whatsapp: createMockWhatsAppProvider(db, clock),
    email: createMockEmailProvider(db, clock),
    logger: createLogger({ seed: true }, { level: "error" }),
    appUrl: opts.appUrl,
    encryptionKey: opts.encryptionKey,
  };
  const { ticks, reached } = await fastForward(deps, clock, opts.now, {
    maxStepMinutes: 120,
    shouldStop: stopAfter(opts.budgetMs),
  });

  const total = Math.max(1, opts.now.getTime() - start.getTime());
  if (reached) await finalTick(deps, clock, opts.now);
  if (!reached) {
    const at = clock.now().getTime();
    return {
      kind: "seed",
      done: false,
      ticks,
      progress: Math.min(0.99, (at - start.getTime()) / total),
      minutesLeft: Math.round((opts.now.getTime() - at) / 60_000),
    };
  }

  // Families have looked at older alerts already.
  await db
    .update(alerts)
    .set({ status: "resolved", acknowledgedAt: opts.now })
    .where(
      and(
        eq(alerts.status, "open"),
        lt(alerts.createdAt, new Date(opts.now.getTime() - 1.5 * 24 * 3600_000)),
      ),
    );
  await writeMarker(db, { ...marker, done: true });
  return { kind: "seed", done: true, ticks, progress: 1, minutesLeft: 0 };
}

/** A gap shorter than this is handled by one normal tick (it catches up by itself). */
export const CATCH_UP_AFTER_MINUTES = 15;

/** Demo start-up: if the demo hasn't run for a while, replay the missing time. */
export async function catchUpDemo(
  db: Db,
  opts: DemoOptions & { maxDays?: number; budgetMs?: number },
): Promise<{
  ticks: number;
  fromMinutesAgo: number;
  done: boolean;
  progress: number;
  minutesLeft: number;
} | null> {
  const last = await lastTickAt(db);
  if (!last) return null;
  const gapMin = (opts.now.getTime() - last.getTime()) / 60_000;
  if (gapMin < CATCH_UP_AFTER_MINUTES) return null;
  const from = new Date(
    Math.max(last.getTime(), opts.now.getTime() - (opts.maxDays ?? 14) * 24 * 3600_000),
  );
  const clock = new FakeClock(from);
  const deps: EngineDeps = {
    db,
    clock,
    voice: createMockVoiceProvider(db, clock, {
      resultDelaySecs: (_s, talk) => talk + 15,
      seed: Math.floor(from.getTime() / 1000) % 9973,
    }),
    whatsapp: createMockWhatsAppProvider(db, clock),
    email: createMockEmailProvider(db, clock),
    logger: createLogger({ catchUp: true }, { level: "error" }),
    appUrl: opts.appUrl,
    encryptionKey: opts.encryptionKey,
  };
  const { ticks, reached } = await fastForward(deps, clock, opts.now, {
    maxStepMinutes: 120,
    shouldStop: stopAfter(opts.budgetMs),
  });
  if (reached) await finalTick(deps, clock, opts.now);
  const total = Math.max(1, opts.now.getTime() - from.getTime());
  const at = reached ? opts.now.getTime() : clock.now().getTime();
  return {
    ticks,
    fromMinutesAgo: Math.round(gapMin),
    done: reached,
    progress: reached ? 1 : Math.min(0.99, (at - from.getTime()) / total),
    minutesLeft: Math.round((opts.now.getTime() - at) / 60_000),
  };
}

export async function hasAnyUsers(db: Db): Promise<boolean> {
  const rows = await db.select({ id: user.id }).from(user).limit(1);
  return rows.length > 0;
}

export type DemoWorldNeed =
  | { need: "start" }
  | { need: "continue"; kind: "seed" | "catch_up"; progress: number; minutesLeft: number }
  | { need: "tick" }
  | { need: "nothing" };

/**
 * What the demo world needs right now (cheap: three small queries).
 * Used by the hosted demo, which has no background scheduler.
 */
export async function demoWorldNeed(
  db: Db,
  now: Date,
  tickEveryMs: number,
): Promise<DemoWorldNeed> {
  const marker = await readMarker(db);
  // No demo yet, or a creation that was interrupted (it starts over).
  if (marker?.created === false || !(await hasAnyUsers(db))) return { need: "start" };
  const last = await lastTickAt(db);
  const minutesLeft = (from: number) => Math.round((now.getTime() - from) / 60_000);
  if (marker && !marker.done) {
    const start = new Date(marker.start).getTime();
    const at = Math.max(start, last?.getTime() ?? 0);
    return {
      need: "continue",
      kind: "seed",
      progress: Math.min(0.99, (at - start) / Math.max(1, now.getTime() - start)),
      minutesLeft: minutesLeft(at),
    };
  }
  if (!last) return { need: "tick" };
  const gapMs = now.getTime() - last.getTime();
  if (gapMs >= CATCH_UP_AFTER_MINUTES * 60_000) {
    return {
      need: "continue",
      kind: "catch_up",
      progress: 0,
      minutesLeft: minutesLeft(last.getTime()),
    };
  }
  return gapMs >= tickEveryMs ? { need: "tick" } : { need: "nothing" };
}
