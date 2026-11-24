/**
 * Demo data: realistic families, then the REAL engine is run through the
 * last few weeks in virtual time, so dashboards, alerts, summaries and the
 * phone preview are all genuine engine output (not hand-written rows).
 *
 * Node-only. Never runs in production.
 */
import { hashPassword } from "better-auth/crypto";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { DEFAULT_PLANS } from "@/config/defaults";
import { ensureReferenceData } from "@/db/bootstrap";
import {
  alerts,
  emergencyContacts,
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
  "engine_leases",
  "rate_limits",
  "verifications",
];

export async function wipeDemoData(db: Db): Promise<void> {
  await db.execute(sql.raw(`TRUNCATE ${TABLES_TO_WIPE.map((t) => `"${t}"`).join(", ")} CASCADE`));
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

/**
 * Wipe and rebuild all demo data, ending at `now`.
 * `days` limits how much history is simulated (smaller = faster, e.g. for e2e tests).
 */
export async function seedDemo(
  db: Db,
  opts: { now: Date; days?: number; encryptionKey: string; appUrl: string },
): Promise<SeedResult> {
  const maxDays = opts.days ?? 21;
  await wipeDemoData(db);
  const start = new Date(opts.now.getTime() - maxDays * 24 * 3600_000);
  const clock = new FakeClock(start);
  const DAY = 24 * 3600_000;

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

  // Run the real engine through the past days.
  const rand = prng(7);
  const deps: EngineDeps = {
    db,
    clock,
    voice: createMockVoiceProvider(db, clock, {
      resultDelaySecs: (_s, talk) => talk + 15,
      seed: 11,
      chooseScenario: (input, r) => {
        const date = localDateOf(clock.now(), "Asia/Kolkata");
        const planned = plans[input.meta.parentId]?.[date];
        if (planned) return planned;
        if (input.dynamicVariables["is_consent_call"] === "yes") return "consent_yes";
        const style = styles[input.meta.parentId] ?? [];
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
  const { ticks } = await fastForward(deps, clock, opts.now, { maxStepMinutes: 120 });

  // Families have looked at older alerts already.
  await db
    .update(alerts)
    .set({ status: "resolved", acknowledgedAt: opts.now })
    .where(
      and(
        eq(alerts.status, "open"),
        lt(alerts.createdAt, new Date(opts.now.getTime() - 1.5 * DAY)),
      ),
    );

  return { families: FAMILIES.length, parents: parentCount, ticks };
}

/** Demo start-up: if the demo hasn't run for a while, replay the missing time. */
export async function catchUpDemo(
  db: Db,
  opts: { now: Date; encryptionKey: string; appUrl: string; maxDays?: number },
): Promise<{ ticks: number; fromMinutesAgo: number } | null> {
  const [last] = await db
    .select({ t: jobRuns.startedAt })
    .from(jobRuns)
    .orderBy(desc(jobRuns.startedAt))
    .limit(1);
  if (!last) return null;
  const gapMin = (opts.now.getTime() - last.t.getTime()) / 60_000;
  if (gapMin < 15) return null;
  const from = new Date(
    Math.max(last.t.getTime(), opts.now.getTime() - (opts.maxDays ?? 14) * 24 * 3600_000),
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
  const { ticks } = await fastForward(deps, clock, opts.now, { maxStepMinutes: 120 });
  return { ticks, fromMinutesAgo: Math.round(gapMin) };
}

export async function hasAnyUsers(db: Db): Promise<boolean> {
  const rows = await db.select({ id: user.id }).from(user).limit(1);
  return rows.length > 0;
}
