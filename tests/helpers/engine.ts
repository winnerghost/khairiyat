/**
 * Test harness: a fresh database, a fake clock, mock providers, and a
 * helper to create a family with a parent ready for calls.
 */
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import type { DbHandle } from "@/db/client";
import {
  demoScenarios,
  emergencyContacts,
  familyMembers,
  families,
  medicines,
  parents,
  schedules,
  subscriptions,
} from "@/db/schema/app";
import { account, user } from "@/db/schema/auth";
import { FakeClock } from "@/engine/clock";
import type { EngineDeps } from "@/engine/deps";
import { createLogger } from "@/lib/logger";
import { createMockEmailProvider } from "@/providers/email/mock";
import { createMockVoiceProvider, type MockVoiceOptions } from "@/providers/voice/mock";
import type { Scenario } from "@/providers/voice/mock-scripts";
import { createMockWhatsAppProvider } from "@/providers/whatsapp/mock";
import { createTestDb } from "./db";

export const TEST_KEY = Buffer.alloc(32, 9).toString("base64");

export interface Harness {
  h: DbHandle;
  clock: FakeClock;
  deps: EngineDeps;
  waFailures: Set<string>;
  emailFailures: Set<string>;
}

export async function createHarness(
  start: string,
  voiceOptions: MockVoiceOptions = {},
): Promise<Harness> {
  const h = await createTestDb();
  const clock = new FakeClock(start);
  const waFailures = new Set<string>();
  const emailFailures = new Set<string>();
  const deps: EngineDeps = {
    db: h.db,
    clock,
    voice: createMockVoiceProvider(h.db, clock, {
      resultDelaySecs: (_s, talk) => talk + 20,
      chooseScenario: () => "happy",
      ...voiceOptions,
    }),
    whatsapp: createMockWhatsAppProvider(h.db, clock, {
      shouldFail: (to) =>
        waFailures.has(to) ? "WhatsApp: recipient not on WhatsApp (mock)" : null,
    }),
    email: createMockEmailProvider(h.db, clock, {
      shouldFail: (to) => (emailFailures.has(to) ? "email bounced (mock)" : null),
    }),
    logger: createLogger({ test: true }, { level: "error", sink: () => {} }),
    appUrl: "https://khairiyat.test",
    encryptionKey: TEST_KEY,
  };
  return { h, clock, deps, waFailures, emailFailures };
}

let counter = 0;

export interface SeedOptions {
  status?: "active" | "awaiting_consent";
  timezone?: string;
  callTime?: string;
  days?: number[];
  memberWhatsapp?: string | null;
  memberTimezone?: string;
  notifyMode?: "every_call" | "alerts_only" | "daily_digest";
  contactWhatsapp?: string | null;
  contactEmail?: string | null;
  trialEndsAt?: Date;
  subscriptionStatus?: "trialing" | "active" | "past_due" | "halted" | "cancelled" | "expired";
  createdAt: Date;
  voice?: "female" | "male";
  language?: "hi" | "hinglish" | "ur" | "en";
}

export async function seedFamily(db: DbHandle["db"], opts: SeedOptions) {
  counter++;
  const userId = `user_${counter}_${Math.random().toString(36).slice(2, 8)}`;
  const email = `child${counter}.${Math.random().toString(36).slice(2, 6)}@example.com`;
  await db.insert(user).values({ id: userId, name: `Riya ${counter}`, email, emailVerified: true });
  await db.insert(account).values({
    id: `acc_${userId}`,
    accountId: userId,
    providerId: "credential",
    userId,
    password: await hashPassword("password123"),
  });
  const [family] = await db
    .insert(families)
    .values({ name: `Family ${counter}`, createdByUserId: userId })
    .returning();
  const [member] = await db
    .insert(familyMembers)
    .values({
      familyId: family!.id,
      userId,
      role: "owner",
      displayName: `Riya ${counter}`,
      whatsappE164:
        opts.memberWhatsapp === undefined
          ? `+9198${String(10000000 + counter).slice(-8)}`
          : opts.memberWhatsapp,
      notifyMode: opts.notifyMode ?? "every_call",
      timezone: opts.memberTimezone ?? "Asia/Kolkata",
    })
    .returning();
  const [parent] = await db
    .insert(parents)
    .values({
      familyId: family!.id,
      name: `Kamla Devi ${counter}`,
      addressAs: "Maa",
      phoneE164: `+9197${String(10000000 + counter).slice(-8)}`,
      status: opts.status ?? "active",
      timezone: opts.timezone ?? "Asia/Kolkata",
      voice: opts.voice ?? "female",
      language: opts.language ?? "hi",
      onboardingStep: 8,
      onboardingCompletedAt: opts.createdAt,
      consentGivenAt: (opts.status ?? "active") === "active" ? opts.createdAt : null,
      createdAt: opts.createdAt,
      updatedAt: opts.createdAt,
    })
    .returning();
  await db.insert(schedules).values({
    parentId: parent!.id,
    callTime: opts.callTime ?? "09:30",
    daysOfWeek: opts.days ?? [1, 2, 3, 4, 5, 6, 7],
    updatedAt: opts.createdAt,
  });
  await db.insert(medicines).values([
    { parentId: parent!.id, name: "Metformin", timing: "morning", withFood: "with" },
    { parentId: parent!.id, name: "Amlodipine", timing: "morning", withFood: "either" },
  ]);
  if (opts.contactWhatsapp !== null) {
    await db.insert(emergencyContacts).values({
      parentId: parent!.id,
      name: "Neighbour aunty",
      whatsappE164: opts.contactWhatsapp ?? `+9196${String(10000000 + counter).slice(-8)}`,
      email: opts.contactEmail ?? null,
    });
  }
  await db.insert(subscriptions).values({
    parentId: parent!.id,
    familyId: family!.id,
    planId: "standard",
    status: opts.subscriptionStatus ?? "trialing",
    trialEndsAt: opts.trialEndsAt ?? new Date(opts.createdAt.getTime() + 30 * 24 * 3600_000),
    currentPeriodEnd:
      opts.subscriptionStatus === "cancelled"
        ? new Date(opts.createdAt.getTime() + 10 * 24 * 3600_000)
        : null,
  });
  return { userId, email, family: family!, member: member!, parent: parent! };
}

export async function forceScenario(
  db: DbHandle["db"],
  parentId: string,
  scenario: Scenario,
  now: Date,
) {
  await db.delete(demoScenarios).where(eq(demoScenarios.parentId, parentId));
  await db.insert(demoScenarios).values({ parentId, scenario, createdAt: now });
}
