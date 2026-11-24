/**
 * Billing state (per parent). Rules:
 * - 7-day free trial, no card.
 * - Payment failed → "past_due" with a grace period (default 3 days):
 *   calls CONTINUE and the family is told straight away.
 * - Grace over → "halted": calls stop, and the family is told (again).
 * - Cancelled → calls continue until the end of the paid period.
 * - We never stop a parent's calls without telling the family first: a
 *   warning goes out 2 days before a trial ends, and on every change.
 *
 * Every transition is idempotent (conditional updates + unique message keys).
 */
import { and, eq, inArray, lte } from "drizzle-orm";
import { invoices, parents, payments, plans, subscriptions } from "@/db/schema/app";
import type { DbOrTx } from "@/db/types";
import type { EngineDeps } from "./deps";
import { enqueueFamilyMessage } from "./notify";
import type { Settings } from "./settings";

const DAY = 24 * 3600_000;

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
}

type Sub = typeof subscriptions.$inferSelect;

async function parentOf(db: DbOrTx, sub: Sub) {
  const [p] = await db.select().from(parents).where(eq(parents.id, sub.parentId)).limit(1);
  return p ?? null;
}

async function notice(
  deps: EngineDeps,
  sub: Sub,
  key: string,
  en: [string, string],
  hi: [string, string],
) {
  await enqueueFamilyMessage(
    deps.db,
    {
      familyId: sub.familyId,
      parentId: sub.parentId,
      key: `billing:${key}:${sub.id}`,
      template: "billing_notice",
      params: { en, hi },
      audience: "members",
      priority: "normal",
    },
    deps.clock.now(),
  );
}

/** Tick step (every 15 minutes is plenty). */
export async function processBillingTransitions(
  deps: EngineDeps,
  settings: Settings,
): Promise<number> {
  const now = deps.clock.now();
  const link = `${deps.appUrl}/app/billing`;
  let changed = 0;

  // 1. Trial ends in ≤ 2 days: warn once.
  const ending = await deps.db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.status, "trialing"),
        lte(subscriptions.trialEndsAt, new Date(now.getTime() + 2 * DAY)),
      ),
    );
  for (const s of ending) {
    const p = await parentOf(deps.db, s);
    if (!p || !s.trialEndsAt) continue;
    if (s.trialEndsAt > now) {
      await notice(
        deps,
        s,
        `trial_ending:${s.trialEndsAt.toISOString().slice(0, 10)}`,
        [
          `The free trial for ${p.addressAs}'s calls ends on ${fmtDate(s.trialEndsAt)}.`,
          `To keep the daily calls going, choose a plan here: ${link}`,
        ],
        [
          `${p.addressAs} की कॉल का फ़्री ट्रायल ${fmtDate(s.trialEndsAt)} को ख़त्म होगा।`,
          `रोज़ की कॉल जारी रखने के लिए यहाँ प्लान चुनें: ${link}`,
        ],
      );
    } else {
      // 2. Trial over without a plan: stop calls (the warning went out 2 days ago) and say so.
      const rows = await deps.db
        .update(subscriptions)
        .set({ status: "expired", updatedAt: now })
        .where(and(eq(subscriptions.id, s.id), eq(subscriptions.status, "trialing")))
        .returning();
      if (rows.length) {
        changed++;
        await notice(
          deps,
          s,
          "trial_ended",
          [
            `The free trial for ${p.addressAs}'s calls has ended, so calls are paused.`,
            `Choose a plan anytime to restart them: ${link}`,
          ],
          [
            `${p.addressAs} की कॉल का फ़्री ट्रायल ख़त्म हो गया है, इसलिए कॉल रुकी हैं।`,
            `दोबारा शुरू करने के लिए प्लान चुनें: ${link}`,
          ],
        );
      }
    }
  }

  // 3. Grace period over: halt.
  const graceOver = await deps.db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.status, "past_due"), lte(subscriptions.graceUntil, now)));
  for (const s of graceOver) {
    const p = await parentOf(deps.db, s);
    const rows = await deps.db
      .update(subscriptions)
      .set({ status: "halted", updatedAt: now })
      .where(and(eq(subscriptions.id, s.id), eq(subscriptions.status, "past_due")))
      .returning();
    if (rows.length && p) {
      changed++;
      await notice(
        deps,
        s,
        "halted",
        [
          `We couldn't collect the payment for ${p.addressAs}'s calls, so calls are now paused.`,
          `Update your payment to restart them: ${link}`,
        ],
        [
          `${p.addressAs} की कॉल का भुगतान नहीं हो पाया, इसलिए कॉल अब रुकी हैं।`,
          `दोबारा शुरू करने के लिए भुगतान अपडेट करें: ${link}`,
        ],
      );
    }
  }

  // 4. Cancelled and the paid period is over: expire.
  const periodOver = await deps.db
    .select()
    .from(subscriptions)
    .where(
      and(inArray(subscriptions.status, ["cancelled"]), lte(subscriptions.currentPeriodEnd, now)),
    );
  for (const s of periodOver) {
    const p = await parentOf(deps.db, s);
    const rows = await deps.db
      .update(subscriptions)
      .set({ status: "expired", updatedAt: now })
      .where(and(eq(subscriptions.id, s.id), eq(subscriptions.status, "cancelled")))
      .returning();
    if (rows.length && p) {
      changed++;
      await notice(
        deps,
        s,
        "cancel_effective",
        [
          `As you asked, ${p.addressAs}'s daily calls have now stopped.`,
          `You can restart anytime: ${link}`,
        ],
        [
          `आपके कहे अनुसार ${p.addressAs} की रोज़ की कॉल अब बंद हो गई हैं।`,
          `कभी भी दोबारा शुरू कर सकते हैं: ${link}`,
        ],
      );
    }
  }
  void settings;
  return changed;
}

// ── Payment events (from the payment provider, or the demo checkout) ─────

export async function foundingSeatsLeft(db: DbOrTx): Promise<number> {
  const [plan] = await db.select().from(plans).where(eq(plans.id, "founding")).limit(1);
  if (!plan?.seatLimit || !plan.active) return 0;
  const taken = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.planId, "founding"),
        inArray(subscriptions.status, ["active", "past_due", "cancelled"]),
      ),
    );
  return Math.max(0, plan.seatLimit - taken.length);
}

/** A successful payment: activate (or renew) for one month and issue an invoice. Idempotent per payment id. */
export async function recordPaymentSuccess(
  db: DbOrTx,
  input: {
    subscriptionId: string;
    planId: string;
    providerPaymentId: string;
    method: string;
    now: Date;
  },
): Promise<{ invoiceId: string | null }> {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.id, input.subscriptionId))
    .limit(1);
  if (!sub) throw new Error("subscription not found");
  const [plan] = await db.select().from(plans).where(eq(plans.id, input.planId)).limit(1);
  if (!plan) throw new Error("plan not found");
  const [pay] = await db
    .insert(payments)
    .values({
      subscriptionId: sub.id,
      familyId: sub.familyId,
      amountInr: plan.priceInr,
      status: "captured",
      providerPaymentId: input.providerPaymentId,
      method: input.method,
      createdAt: input.now,
    })
    .onConflictDoNothing({ target: payments.providerPaymentId })
    .returning();
  if (!pay) return { invoiceId: null }; // already processed
  const start =
    sub.currentPeriodEnd && sub.currentPeriodEnd > input.now ? sub.currentPeriodEnd : input.now;
  const end = new Date(start.getTime() + 30 * DAY);
  await db
    .update(subscriptions)
    .set({
      planId: plan.id,
      status: "active",
      currentPeriodStart: start,
      currentPeriodEnd: end,
      graceUntil: null,
      cancelAtPeriodEnd: false,
      updatedAt: input.now,
    })
    .where(eq(subscriptions.id, sub.id));
  const [p] = await db.select().from(parents).where(eq(parents.id, sub.parentId)).limit(1);
  const number = `KH-${input.now.getUTCFullYear()}${String(input.now.getUTCMonth() + 1).padStart(2, "0")}-${pay.id.slice(0, 6).toUpperCase()}`;
  const [inv] = await db
    .insert(invoices)
    .values({
      familyId: sub.familyId,
      subscriptionId: sub.id,
      paymentId: pay.id,
      number,
      description: `${plan.name} plan for ${p?.addressAs ?? "parent"} (monthly)`,
      amountInr: plan.priceInr,
      periodStart: start,
      periodEnd: end,
      createdAt: input.now,
    })
    .returning({ id: invoices.id });
  return { invoiceId: inv?.id ?? null };
}

/** A failed renewal: grace period, calls continue, family told now. */
export async function recordPaymentFailure(
  deps: EngineDeps,
  input: { subscriptionId: string; reason: string; graceDays: number },
): Promise<void> {
  const now = deps.clock.now();
  const graceUntil = new Date(now.getTime() + input.graceDays * DAY);
  const rows = await deps.db
    .update(subscriptions)
    .set({ status: "past_due", graceUntil, updatedAt: now })
    .where(
      and(
        eq(subscriptions.id, input.subscriptionId),
        inArray(subscriptions.status, ["active", "trialing"]),
      ),
    )
    .returning();
  const sub = rows[0];
  if (!sub) return;
  const p = await parentOf(deps.db, sub);
  if (!p) return;
  await enqueueFamilyMessage(
    deps.db,
    {
      familyId: sub.familyId,
      parentId: sub.parentId,
      key: `billing:payment_failed:${sub.id}:${now.toISOString().slice(0, 10)}`,
      template: "payment_issue",
      params: {
        en: [p.addressAs, fmtDate(graceUntil), `${deps.appUrl}/app/billing`],
        hi: [p.addressAs, fmtDate(graceUntil), `${deps.appUrl}/app/billing`],
      },
      audience: "members",
      priority: "normal",
    },
    now,
  );
}

/** Cancel anytime: calls continue until the paid period ends. */
export async function cancelSubscription(
  db: DbOrTx,
  subscriptionId: string,
  now: Date,
): Promise<void> {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.id, subscriptionId))
    .limit(1);
  if (!sub) return;
  if (sub.status === "trialing") {
    await db
      .update(subscriptions)
      .set({ status: "expired", updatedAt: now })
      .where(eq(subscriptions.id, sub.id));
    return;
  }
  await db
    .update(subscriptions)
    .set({ status: "cancelled", cancelAtPeriodEnd: true, updatedAt: now })
    .where(
      and(eq(subscriptions.id, sub.id), inArray(subscriptions.status, ["active", "past_due"])),
    );
}

export async function resumeSubscription(
  db: DbOrTx,
  subscriptionId: string,
  now: Date,
): Promise<void> {
  await db
    .update(subscriptions)
    .set({ status: "active", cancelAtPeriodEnd: false, updatedAt: now })
    .where(
      and(
        eq(subscriptions.id, subscriptionId),
        eq(subscriptions.status, "cancelled"),
        inArray(subscriptions.cancelAtPeriodEnd, [true]),
      ),
    );
}
