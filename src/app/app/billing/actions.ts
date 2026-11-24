"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { parents, plans, subscriptions } from "@/db/schema/app";
import {
  cancelSubscription,
  foundingSeatsLeft,
  recordPaymentFailure,
  recordPaymentSuccess,
  resumeSubscription,
} from "@/engine/billing";
import { getSettings } from "@/engine/settings";
import { getEnv } from "@/lib/env";
import { buildEngineDeps } from "@/server/engine-runner";
import { requireMember } from "@/server/session";

async function subscriptionFor(parentId: string) {
  const { db, family } = await requireMember();
  const [row] = await db
    .select({ sub: subscriptions, parent: parents })
    .from(subscriptions)
    .innerJoin(parents, eq(parents.id, subscriptions.parentId))
    .where(and(eq(subscriptions.parentId, parentId), eq(parents.familyId, family.id)))
    .limit(1);
  if (!row) redirect("/app/billing?error=notfound");
  return { db, ...row };
}

/** Demo checkout (stands in for Razorpay Checkout). */
export async function startCheckoutAction(parentId: string, formData: FormData) {
  const planId = String(formData.get("planId") ?? "");
  const { db } = await subscriptionFor(parentId);
  const [plan] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.id, planId), eq(plans.active, true)))
    .limit(1);
  if (!plan) redirect("/app/billing?error=plan");
  if (plan.id === "founding" && (await foundingSeatsLeft(db)) <= 0)
    redirect("/app/billing?error=founding");
  redirect(`/app/billing/checkout?parent=${parentId}&plan=${plan.id}`);
}

export async function demoPayAction(parentId: string, planId: string, formData: FormData) {
  const env = getEnv();
  if (env.modes.payments !== "mock") redirect("/app/billing");
  const outcome = String(formData.get("outcome") ?? "success");
  const { db, sub } = await subscriptionFor(parentId);
  if (outcome === "fail") {
    const deps = await buildEngineDeps(db);
    const settings = await getSettings(db);
    if (sub.status === "active" || sub.status === "trialing") {
      await recordPaymentFailure(deps, {
        subscriptionId: sub.id,
        reason: "demo: card declined",
        graceDays: settings.grace_days,
      });
    }
    revalidatePath("/app/billing");
    redirect("/app/billing?done=failed");
  }
  await recordPaymentSuccess(db, {
    subscriptionId: sub.id,
    planId,
    providerPaymentId: `demo_pay_${crypto.randomUUID()}`,
    method: String(formData.get("method") ?? "upi"),
    now: new Date(),
  });
  revalidatePath("/app/billing");
  redirect("/app/billing?done=paid");
}

export async function demoRenewalFailAction(parentId: string) {
  const env = getEnv();
  if (env.modes.payments !== "mock") redirect("/app/billing");
  const { db, sub } = await subscriptionFor(parentId);
  const deps = await buildEngineDeps(db);
  const settings = await getSettings(db);
  await recordPaymentFailure(deps, {
    subscriptionId: sub.id,
    reason: "demo: renewal failed",
    graceDays: settings.grace_days,
  });
  revalidatePath("/app/billing");
  redirect("/app/billing?done=failed");
}

export async function cancelAction(parentId: string) {
  const { db, sub } = await subscriptionFor(parentId);
  await cancelSubscription(db, sub.id, new Date());
  revalidatePath("/app/billing");
  redirect("/app/billing?done=cancelled");
}

export async function resumeAction(parentId: string) {
  const { db, sub } = await subscriptionFor(parentId);
  await resumeSubscription(db, sub.id, new Date());
  revalidatePath("/app/billing");
  redirect("/app/billing?done=resumed");
}
