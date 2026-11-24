import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import {
  alerts,
  appSettings,
  callAttempts,
  callResults,
  checkIns,
  mockMessages,
  notifications,
  parents,
  webhookEvents,
} from "@/db/schema/app";
import { runTick } from "@/engine/tick";
import { requestManualCall } from "@/engine/manual";
import { DEFAULT_SETTINGS } from "@/engine/settings";
import type { Scenario } from "@/providers/voice/mock-scripts";
import { createHarness, forceScenario, type Harness, seedFamily } from "../helpers/engine";

// Tuesday 24 Nov 2026, 09:29 IST
const START = "2026-11-24T03:59:00Z";

let H: Harness | undefined;
afterEach(async () => {
  await H?.h.close();
  H = undefined;
});

async function tickFor(h: Harness, minutes: number) {
  for (let i = 0; i < minutes; i++) {
    h.clock.advanceMinutes(1);
    await runTick(h.deps);
  }
}

async function setup(chooser?: Scenario, extra: Parameters<typeof createHarness>[1] = {}) {
  H = await createHarness(START, {
    ...(chooser ? { chooseScenario: () => chooser } : {}),
    ...extra,
  });
  const fam = await seedFamily(H.h.db, { createdAt: new Date("2026-11-20T00:00:00Z") });
  return { h: H, ...fam };
}

describe("call engine: happy path", () => {
  it("calls at the scheduled time, stores the result and sends a summary", async () => {
    const { h, parent, member } = await setup();
    await runTick(h.deps); // 09:29 → nothing yet
    expect(await h.h.db.select().from(checkIns)).toHaveLength(0);

    await tickFor(h, 1); // 09:30 → created + dialed
    const [c] = await h.h.db.select().from(checkIns);
    expect(c).toMatchObject({
      parentId: parent.id,
      slot: "daily",
      status: "dialing",
      attemptsCount: 1,
    });

    await tickFor(h, 5); // result webhook arrives
    const [done] = await h.h.db.select().from(checkIns);
    expect(done!.status).toBe("completed");
    const [r] = await h.h.db.select().from(callResults);
    expect(r!.mood).toBe(5);
    expect(r!.summaryEn).toBeTruthy();
    expect(r!.summaryEn!.length).toBeLessThanOrEqual(600);
    expect(r!.medicinesTaken).toEqual([
      { name: "Metformin", taken: "yes" },
      { name: "Amlodipine", taken: "yes" },
    ]);
    expect(r!.redFlag).toBe(false);

    const wa = await h.h.db
      .select()
      .from(mockMessages)
      .where(eq(mockMessages.toAddress, member.whatsappE164!));
    expect(wa).toHaveLength(1);
    expect(wa[0]!.body).toContain("Today's call with Maa");
  });

  it("never double-calls when two ticks run at the same moment", async () => {
    const { h } = await setup();
    h.clock.advanceMinutes(1);
    await Promise.all([runTick(h.deps), runTick(h.deps), runTick(h.deps, { holder: "x" })]);
    h.clock.advanceSeconds(5);
    await Promise.all([runTick(h.deps), runTick(h.deps)]);
    expect(await h.h.db.select().from(checkIns)).toHaveLength(1);
    expect(await h.h.db.select().from(callAttempts)).toHaveLength(1);
  });

  it("passes memory to the agent (medicines, notes, follow-ups) as dynamic variables", async () => {
    const { h } = await setup();
    await tickFor(h, 1);
    const [a] = await h.h.db.select().from(callAttempts);
    const { mockCalls } = await import("@/db/schema/app");
    const [m] = await h.h.db
      .select()
      .from(mockCalls)
      .where(eq(mockCalls.conversationId, a!.providerConversationId!));
    const events = (
      m!.payload as {
        events: {
          data: {
            conversation_initiation_client_data?: { dynamic_variables: Record<string, unknown> };
          };
        }[];
      }
    ).events;
    const vars = events[0]!.data.conversation_initiation_client_data!.dynamic_variables;
    expect(vars).toMatchObject({
      address_as: "Maa",
      assistant_name: "Roshni",
      medicines_due_now: expect.stringContaining("Metformin"),
      is_consent_call: "no",
      max_minutes: 4,
      secret__attempt_id: a!.id,
    });
  });
});

describe("call engine: not reached", () => {
  it("retries every 15 minutes, then alerts the family and emergency contact", async () => {
    const { h, member } = await setup("no_answer");
    await tickFor(h, 1);
    await tickFor(h, 3);
    let [c] = await h.h.db.select().from(checkIns);
    expect(c!.status).toBe("retry_scheduled");
    // The "no answer" result arrived at 09:31, so the retry is 15 minutes later (09:46 IST).
    expect(c!.nextAttemptAt!.toISOString()).toBe("2026-11-24T04:16:00.000Z");

    await tickFor(h, 40);
    [c] = await h.h.db.select().from(checkIns);
    expect(c!.status).toBe("unreachable");
    expect(c!.attemptsCount).toBe(3);
    const as = await h.h.db.select().from(alerts);
    expect(as.map((a) => a.type)).toEqual(["unreachable"]);
    const sent = await h.h.db
      .select()
      .from(notifications)
      .where(eq(notifications.template, "not_reached_alert"));
    expect(sent.map((n) => n.toAddress)).toContain(member.whatsappE164);
    expect(sent.length).toBeGreaterThanOrEqual(2); // member + emergency contact
    expect(sent.every((n) => n.status === "sent")).toBe(true);
  });

  it("treats voicemail / switched-off messages as not reached", async () => {
    const { h } = await setup("voicemail");
    await tickFor(h, 3);
    const [a] = await h.h.db.select().from(callAttempts);
    expect(a!.status).toBe("voicemail");
    expect(await h.h.db.select().from(callResults)).toHaveLength(0);
  });

  it("never retries after 8 pm: a 19:30 call ends unreachable after 2 tries", async () => {
    H = await createHarness("2026-11-24T13:59:00Z", { chooseScenario: () => "no_answer" }); // 19:29 IST
    await seedFamily(H.h.db, { createdAt: new Date("2026-11-20T00:00:00Z"), callTime: "19:30" });
    await tickFor(H, 50);
    const [c] = await H.h.db.select().from(checkIns);
    expect(c!.status).toBe("unreachable");
    expect(c!.attemptsCount).toBe(2);
    const attempts = await H.h.db.select().from(callAttempts);
    for (const a of attempts) {
      const ist = new Date(a.dialedAt.getTime() + 5.5 * 3600_000);
      expect(ist.getUTCHours()).toBeLessThan(20);
    }
  });

  it("retries when the provider is down at dial time", async () => {
    let down = true;
    const { h } = await setup(undefined, { failStart: () => (down ? "503 from provider" : null) });
    await tickFor(h, 1);
    let [c] = await h.h.db.select().from(checkIns);
    expect(c!.status).toBe("retry_scheduled");
    down = false;
    await tickFor(h, 20);
    [c] = await h.h.db.select().from(checkIns);
    expect(c!.status).toBe("completed");
  });
});

describe("call engine: safety", () => {
  it("sends an urgent alert (WhatsApp + email) the moment a fall is mentioned", async () => {
    const { h, parent, member, email } = await setup();
    await forceScenario(h.h.db, parent.id, "fall", h.clock.now());
    await tickFor(h, 1);
    await tickFor(h, 3);
    const [r] = await h.h.db.select().from(callResults);
    expect(r!.redFlag).toBe(true);
    expect(r!.redFlagSources).toContain("agent");
    expect(r!.redFlagSources.some((s) => s.startsWith("keyword:"))).toBe(true);
    const urgent = await h.h.db
      .select()
      .from(notifications)
      .where(eq(notifications.template, "urgent_alert"));
    const to = urgent.map((n) => n.toAddress);
    expect(to).toContain(member.whatsappE164);
    expect(to).toContain(email);
    expect(urgent.every((n) => n.status === "sent")).toBe(true);
    // Sent within a minute of the result arriving.
    const [ev] = await h.h.db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.eventType, "post_call_transcription"));
    for (const n of urgent)
      expect(n.sentAt!.getTime() - ev!.receivedAt.getTime()).toBeLessThanOrEqual(60_000);
  });

  it("stops calling immediately when the parent asks, and tells the family", async () => {
    const { h, parent } = await setup();
    await forceScenario(h.h.db, parent.id, "opt_out", h.clock.now());
    await tickFor(h, 4);
    const [p] = await h.h.db.select().from(parents).where(eq(parents.id, parent.id));
    expect(p!.status).toBe("opted_out");
    const msgs = await h.h.db
      .select()
      .from(notifications)
      .where(eq(notifications.template, "consent_status"));
    expect(msgs.length).toBeGreaterThan(0);
    // Next day: no call.
    h.clock.set("2026-11-25T04:05:00Z");
    await runTick(h.deps);
    const next = await h.h.db.select().from(checkIns).where(eq(checkIns.localDate, "2026-11-25"));
    expect(next).toHaveLength(0);
  });

  it("respects the kill switch", async () => {
    const { h } = await setup();
    await h.h.db.insert(appSettings).values({ key: "calls_enabled", value: false });
    await tickFor(h, 3);
    expect(await h.h.db.select().from(callAttempts)).toHaveLength(0);
  });

  it("does not call when the trial has ended", async () => {
    H = await createHarness(START);
    await seedFamily(H.h.db, {
      createdAt: new Date("2026-11-10T00:00:00Z"),
      trialEndsAt: new Date("2026-11-17T00:00:00Z"),
    });
    await tickFor(H, 3);
    expect(await H.h.db.select().from(checkIns)).toHaveLength(0);
  });
});

describe("call engine: consent call", () => {
  it("asks permission first and starts daily calls only after a yes", async () => {
    H = await createHarness(START);
    const { parent } = await seedFamily(H.h.db, {
      status: "awaiting_consent",
      createdAt: new Date("2026-11-20T00:00:00Z"),
    });
    await forceScenario(H.h.db, parent.id, "consent_yes", H.clock.now());
    await tickFor(H, 6);
    const [c] = await H.h.db.select().from(checkIns);
    expect(c).toMatchObject({ slot: "consent", isConsentCall: true, status: "completed" });
    const [p] = await H.h.db.select().from(parents).where(eq(parents.id, parent.id));
    expect(p!.status).toBe("active");
    // Same day: no extra daily call.
    await tickFor(H, 10);
    expect(await H.h.db.select().from(checkIns)).toHaveLength(1);
  });

  it("pauses and tells the family when the parent says no", async () => {
    H = await createHarness(START);
    const { parent } = await seedFamily(H.h.db, {
      status: "awaiting_consent",
      createdAt: new Date("2026-11-20T00:00:00Z"),
    });
    await forceScenario(H.h.db, parent.id, "consent_no", H.clock.now());
    await tickFor(H, 6);
    const [p] = await H.h.db.select().from(parents).where(eq(parents.id, parent.id));
    expect(p!.status).toBe("consent_refused");
    const a = await H.h.db.select().from(alerts).where(eq(alerts.type, "consent_refused"));
    expect(a).toHaveLength(1);
  });
});

describe("call engine: webhooks", () => {
  it("handles duplicate and out-of-order webhooks exactly once", async () => {
    const { h } = await setup(undefined, { duplicateWebhooks: true, audioFirst: true });
    await tickFor(h, 6);
    expect(await h.h.db.select().from(callResults)).toHaveLength(1);
    const events = await h.h.db.select().from(webhookEvents);
    expect(events).toHaveLength(2); // transcription + audio, each stored once
    const summaries = await h.h.db
      .select()
      .from(notifications)
      .where(eq(notifications.template, "daily_summary"));
    expect(summaries).toHaveLength(1);
  });

  it("finds the result through reconciliation when the webhook is lost", async () => {
    const { h, parent } = await setup();
    await forceScenario(h.h.db, parent.id, "lost_webhook", h.clock.now());
    await tickFor(h, 6);
    let [c] = await h.h.db.select().from(checkIns);
    expect(c!.status).toBe("dialing");
    await tickFor(h, 6); // > 10 minutes after dialing
    [c] = await h.h.db.select().from(checkIns);
    expect(c!.status).toBe("completed");
    const [ev] = await h.h.db.select().from(webhookEvents);
    expect((ev!.payload as { source?: string }).source).toBe("reconciliation");
  });

  it("rejects webhooks with a bad or old signature", async () => {
    const { h } = await setup();
    const { receiveVoiceWebhook } = await import("@/engine/tick");
    const { signElevenLabsPayload } = await import("@/providers/voice/signature");
    const raw = JSON.stringify({ type: "post_call_audio", data: { conversation_id: "x" } });
    const bad = await receiveVoiceWebhook(
      h.deps,
      raw,
      new Headers({ "elevenlabs-signature": "t=1,v0=deadbeef" }),
    );
    expect(bad.status).toBe(401);
    const old = await signElevenLabsPayload(
      raw,
      "demo-elevenlabs-webhook-secret",
      new Date(h.clock.now().getTime() - 31 * 60_000),
    );
    expect(
      (await receiveVoiceWebhook(h.deps, raw, new Headers({ "elevenlabs-signature": old }))).status,
    ).toBe(401);
    const good = await signElevenLabsPayload(raw, "demo-elevenlabs-webhook-secret", h.clock.now());
    expect(
      (await receiveVoiceWebhook(h.deps, raw, new Headers({ "elevenlabs-signature": good })))
        .status,
    ).toBe(200);
  });
});

describe("notification outbox", () => {
  it("retries WhatsApp failures with backoff and falls back to email", async () => {
    const { h, member, email } = await setup();
    h.waFailures.add(member.whatsappE164!);
    await tickFor(h, 6);
    let [n] = await h.h.db
      .select()
      .from(notifications)
      .where(
        and(eq(notifications.template, "daily_summary"), eq(notifications.channel, "whatsapp")),
      );
    expect(n!.status).toBe("failed");
    await tickFor(h, 300); // 1 + 5 + 15 + 60 + 180 minutes of backoff
    [n] = await h.h.db
      .select()
      .from(notifications)
      .where(
        and(eq(notifications.template, "daily_summary"), eq(notifications.channel, "whatsapp")),
      );
    expect(n!.status).toBe("dead");
    const fallback = await h.h.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.template, "daily_summary"), eq(notifications.channel, "email")));
    expect(fallback).toHaveLength(1);
    expect(fallback[0]!.toAddress).toBe(email);
    expect(fallback[0]!.status).toBe("sent");
  });
});

describe("call now", () => {
  it("adds an extra call on its own slot and respects limits", async () => {
    const { h, parent } = await setup();
    h.clock.set("2026-11-24T06:00:00Z"); // 11:30 IST
    const r1 = await requestManualCall(h.h.db, parent.id, h.clock.now(), DEFAULT_SETTINGS);
    expect(r1.ok).toBe(true);
    const r2 = await requestManualCall(h.h.db, parent.id, h.clock.now(), DEFAULT_SETTINGS);
    expect(r2).toEqual({ ok: false, reason: "call_in_progress" });
    h.clock.set("2026-11-24T15:00:00Z"); // 20:30 IST
    const r3 = await requestManualCall(h.h.db, parent.id, h.clock.now(), DEFAULT_SETTINGS);
    expect(r3).toEqual({ ok: false, reason: "outside_window" });
  });
});

describe("time zones", () => {
  it("calls a parent in London at 09:00 local time in summer and in winter", async () => {
    H = await createHarness("2026-07-15T07:58:00Z");
    await seedFamily(H.h.db, {
      createdAt: new Date("2026-07-01T00:00:00Z"),
      timezone: "Europe/London",
      callTime: "09:00",
      subscriptionStatus: "active",
    });
    await tickFor(H, 2); // 08:00 UTC = 09:00 BST
    const [summer] = await H.h.db.select().from(callAttempts);
    expect(summer!.dialedAt.toISOString()).toBe("2026-07-15T08:00:00.000Z");
    H.clock.set("2026-12-15T08:58:00Z");
    await tickFor(H, 3); // 09:00 GMT
    const winter = (await H.h.db.select().from(callAttempts)).find(
      (a) => a.dialedAt.getUTCMonth() === 11,
    );
    expect(winter!.dialedAt.toISOString()).toBe("2026-12-15T09:00:00.000Z");
  });
});
