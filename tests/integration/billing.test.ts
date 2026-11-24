import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { checkIns, invoices, notifications, subscriptions } from "@/db/schema/app";
import {
  cancelSubscription,
  processBillingTransitions,
  recordPaymentFailure,
  recordPaymentSuccess,
} from "@/engine/billing";
import { DEFAULT_SETTINGS } from "@/engine/settings";
import { runTick } from "@/engine/tick";
import { createHarness, type Harness, seedFamily } from "../helpers/engine";

let H: Harness | undefined;
afterEach(async () => {
  await H?.h.close();
  H = undefined;
});

const DAY = 24 * 3600_000;

async function setup(opts: Partial<Parameters<typeof seedFamily>[1]> = {}) {
  H = await createHarness("2026-11-24T02:00:00Z");
  const fam = await seedFamily(H.h.db, { createdAt: new Date("2026-11-20T00:00:00Z"), ...opts });
  const [sub] = await H.h.db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.parentId, fam.parent.id));
  return { h: H, ...fam, sub: sub! };
}

const billingMsgs = async (h: Harness) =>
  (await h.h.db.select().from(notifications)).filter(
    (n) => n.template === "billing_notice" || n.template === "payment_issue",
  );

describe("billing", () => {
  it("warns 2 days before the trial ends, then stops calls and says so", async () => {
    const { h, sub } = await setup({ trialEndsAt: new Date("2026-11-25T12:00:00Z") });
    await processBillingTransitions(h.deps, DEFAULT_SETTINGS);
    expect((await billingMsgs(h)).map((n) => n.body)).toEqual([expect.stringContaining("trial")]);
    await processBillingTransitions(h.deps, DEFAULT_SETTINGS); // idempotent
    expect(await billingMsgs(h)).toHaveLength(1);
    h.clock.set("2026-11-25T13:00:00Z");
    await processBillingTransitions(h.deps, DEFAULT_SETTINGS);
    const [after] = await h.h.db.select().from(subscriptions).where(eq(subscriptions.id, sub.id));
    expect(after!.status).toBe("expired");
    expect((await billingMsgs(h)).some((n) => n.body.includes("has ended"))).toBe(true);
  });

  it("activates on payment, issues one invoice, and ignores a duplicate payment event", async () => {
    const { h, sub } = await setup();
    const now = h.clock.now();
    await recordPaymentSuccess(h.h.db, {
      subscriptionId: sub.id,
      planId: "standard",
      providerPaymentId: "pay_1",
      method: "upi",
      now,
    });
    await recordPaymentSuccess(h.h.db, {
      subscriptionId: sub.id,
      planId: "standard",
      providerPaymentId: "pay_1",
      method: "upi",
      now,
    });
    const [after] = await h.h.db.select().from(subscriptions).where(eq(subscriptions.id, sub.id));
    expect(after).toMatchObject({ status: "active", planId: "standard" });
    expect(after!.currentPeriodEnd!.getTime() - now.getTime()).toBe(30 * DAY);
    expect(await h.h.db.select().from(invoices)).toHaveLength(1);
  });

  it("keeps calling during the grace period after a failed payment, then halts and tells the family", async () => {
    const { h, sub } = await setup({ subscriptionStatus: "active" });
    await recordPaymentFailure(h.deps, {
      subscriptionId: sub.id,
      reason: "card declined",
      graceDays: 3,
    });
    const [pd] = await h.h.db.select().from(subscriptions).where(eq(subscriptions.id, sub.id));
    expect(pd!.status).toBe("past_due");
    expect((await billingMsgs(h)).map((n) => n.template)).toContain("payment_issue");

    // Grace day 1, 09:30 IST: the call still happens.
    h.clock.set("2026-11-24T04:00:00Z");
    await runTick(h.deps);
    expect(await h.h.db.select().from(checkIns)).toHaveLength(1);

    // After the grace period: halted, family told, no call.
    h.clock.set("2026-11-27T05:00:00Z");
    await runTick(h.deps);
    const [halted] = await h.h.db.select().from(subscriptions).where(eq(subscriptions.id, sub.id));
    expect(halted!.status).toBe("halted");
    expect((await billingMsgs(h)).some((n) => n.body.includes("paused"))).toBe(true);
    h.clock.set("2026-11-28T04:00:00Z");
    await runTick(h.deps);
    expect(
      (await h.h.db.select().from(checkIns)).filter((c) => c.localDate === "2026-11-28"),
    ).toHaveLength(0);
  });

  it("after cancelling, calls continue until the paid period ends", async () => {
    const { h, sub } = await setup();
    await recordPaymentSuccess(h.h.db, {
      subscriptionId: sub.id,
      planId: "standard",
      providerPaymentId: "pay_2",
      method: "card",
      now: h.clock.now(),
    });
    await cancelSubscription(h.h.db, sub.id, h.clock.now());
    h.clock.set("2026-11-26T04:00:00Z");
    await runTick(h.deps);
    expect(
      (await h.h.db.select().from(checkIns)).filter((c) => c.localDate === "2026-11-26"),
    ).toHaveLength(1);
    h.clock.set(new Date(h.clock.now().getTime() + 31 * DAY));
    await processBillingTransitions(h.deps, DEFAULT_SETTINGS);
    const [after] = await h.h.db.select().from(subscriptions).where(eq(subscriptions.id, sub.id));
    expect(after!.status).toBe("expired");
  });
});
