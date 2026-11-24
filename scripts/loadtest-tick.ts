/**
 * npm run loadtest:tick
 *
 * 1,000 parents all scheduled for 09:30 IST. Measures how long scheduler
 * ticks take and how the call queue drains with the concurrency limit.
 *
 *   npm run loadtest:tick -- 1000 4      # parents concurrency
 * Uses an in-memory database, or LOADTEST_DATABASE_URL for real Postgres.
 */
import { hashPassword } from "better-auth/crypto";
import { openDb } from "@/db/client";
import {
  appSettings,
  emergencyContacts,
  familyMembers,
  families,
  parents,
  schedules,
  subscriptions,
} from "@/db/schema/app";
import { account, user } from "@/db/schema/auth";
import { FakeClock } from "@/engine/clock";
import type { EngineDeps } from "@/engine/deps";
import { runTick } from "@/engine/tick";
import { createLogger } from "@/lib/logger";
import { createMockEmailProvider } from "@/providers/email/mock";
import { createMockVoiceProvider } from "@/providers/voice/mock";
import { createMockWhatsAppProvider } from "@/providers/whatsapp/mock";

async function main() {
  const n = Number(process.argv[2] ?? 1000);
  const concurrency = Number(process.argv[3] ?? 4);
  const handle = await openDb({
    pgliteDataDir: "memory://",
    databaseUrl: process.env.LOADTEST_DATABASE_URL || undefined,
  });
  const db = handle.db;
  const before = new Date("2026-11-20T00:00:00Z");
  const hash = await hashPassword("load-test");
  console.log(`Creating ${n} parents…`);
  for (let i = 0; i < n; i += 100) {
    const batch = Array.from({ length: Math.min(100, n - i) }, (_, k) => i + k);
    await db
      .insert(user)
      .values(batch.map((j) => ({ id: `lt_${j}`, name: `Child ${j}`, email: `lt${j}@load.test` })));
    await db.insert(account).values(
      batch.map((j) => ({
        id: `lt_${j}_c`,
        accountId: `lt_${j}`,
        providerId: "credential",
        userId: `lt_${j}`,
        password: hash,
      })),
    );
    const fams = await db
      .insert(families)
      .values(batch.map((j) => ({ name: `Family ${j}`, createdByUserId: `lt_${j}` })))
      .returning();
    await db.insert(familyMembers).values(
      fams.map((f, k) => ({
        familyId: f.id,
        userId: `lt_${batch[k]}`,
        role: "owner" as const,
        displayName: "Child",
        whatsappE164: `+9198${String(10000000 + batch[k]!)}`,
      })),
    );
    const ps = await db
      .insert(parents)
      .values(
        fams.map((f, k) => ({
          familyId: f.id,
          name: "Parent",
          addressAs: "Maa",
          phoneE164: `+9197${String(10000000 + batch[k]!)}`,
          status: "active" as const,
          onboardingStep: 8,
          onboardingCompletedAt: before,
          consentGivenAt: before,
          createdAt: before,
          updatedAt: before,
        })),
      )
      .returning();
    await db.insert(schedules).values(
      ps.map((p) => ({
        parentId: p.id,
        callTime: "09:30",
        daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
        updatedAt: before,
      })),
    );
    await db.insert(emergencyContacts).values(
      ps.map((p, k) => ({
        parentId: p.id,
        name: "N",
        whatsappE164: `+9196${String(10000000 + batch[k]!)}`,
      })),
    );
    await db.insert(subscriptions).values(
      ps.map((p) => ({
        parentId: p.id,
        familyId: p.familyId,
        planId: "standard",
        status: "active" as const,
      })),
    );
  }
  await db.insert(appSettings).values({ key: "concurrency_limit", value: concurrency });

  const clock = new FakeClock("2026-11-24T04:00:00Z"); // 09:30 IST
  const deps: EngineDeps = {
    db,
    clock,
    voice: createMockVoiceProvider(db, clock, {
      chooseScenario: () => "happy",
      resultDelaySecs: (_s, t) => t + 15,
    }),
    whatsapp: createMockWhatsAppProvider(db, clock),
    email: createMockEmailProvider(db, clock),
    logger: createLogger({}, { level: "error" }),
    appUrl: "https://load.test",
    encryptionKey: Buffer.alloc(32, 2).toString("base64"),
  };

  const durations: number[] = [];
  let first = 0;
  let minutes = 0;
  for (; minutes < 600; minutes++) {
    const t = performance.now();
    const stats = await runTick(deps);
    const ms = performance.now() - t;
    durations.push(ms);
    if (minutes === 0) {
      first = ms;
      console.log(
        `First tick (creates ${stats.created} check-ins, dials ${stats.dial?.dialed}): ${Math.round(ms)} ms`,
      );
    }
    const { checkIns } = await import("@/db/schema/app");
    const { inArray, count } = await import("drizzle-orm");
    const [open] = await db
      .select({ n: count() })
      .from(checkIns)
      .where(inArray(checkIns.status, ["scheduled", "retry_scheduled", "dialing", "in_progress"]));
    if ((open?.n ?? 0) === 0 && minutes > 0) break;
    clock.advanceMinutes(1);
  }
  durations.sort((a, b) => a - b);
  const p = (q: number) =>
    Math.round(durations[Math.min(durations.length - 1, Math.floor(q * durations.length))]!);
  console.table({
    parents: n,
    concurrency,
    firstTickMs: Math.round(first),
    medianTickMs: p(0.5),
    p95TickMs: p(0.95),
    maxTickMs: p(1),
    minutesToCallEveryone: minutes,
  });
  console.log(
    `With ${concurrency} simultaneous calls, the last of ${n} parents booked at 9:30 is called after about ${Math.round((minutes / 60) * 10) / 10} hours. ` +
      `Raise the concurrency (voice plan) or spread call times to keep calls punctual.`,
  );
  const ok = p(1) < 30_000;
  console.log(
    ok
      ? "✅ Every tick finished well within the 150 s Edge Function limit."
      : "❌ A tick was too slow.",
  );
  await handle.close();
  if (!ok) process.exit(1);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
