import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Callout, Card } from "@/components/ui/card";
import { brand } from "@/config/brand";
import { parents, plans } from "@/db/schema/app";
import { getEnv } from "@/lib/env";
import { requireMember } from "@/server/session";
import { demoPayAction } from "../actions";

export const metadata: Metadata = { title: "Checkout" };

/**
 * Demo stand-in for Razorpay Checkout. With real keys, this page opens
 * Razorpay's own checkout and the server verifies the payment signature.
 */
export default async function CheckoutPage({ searchParams }: PageProps<"/app/billing/checkout">) {
  const sp = await searchParams;
  const { db, family } = await requireMember();
  if (getEnv().modes.payments !== "mock") redirect("/app/billing");
  const parentId = typeof sp.parent === "string" ? sp.parent : "";
  const planId = typeof sp.plan === "string" ? sp.plan : "";
  if (!/^[0-9a-f-]{36}$/i.test(parentId)) redirect("/app/billing");
  const [parent] = await db
    .select()
    .from(parents)
    .where(and(eq(parents.id, parentId), eq(parents.familyId, family.id)))
    .limit(1);
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  if (!parent || !plan) redirect("/app/billing");
  const action = demoPayAction.bind(null, parent.id, plan.id);
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <h1 className="font-heading text-3xl">Checkout</h1>
      <Callout tone="info" title="Demo payment">
        This is a pretend checkout. No money moves. With real Razorpay keys, the secure Razorpay
        window opens here.
      </Callout>
      <Card className="flex flex-col gap-3">
        <p className="text-base text-muted">{brand.name}</p>
        <p className="text-lg">
          {plan.name} plan for <strong>{parent.addressAs}</strong>
        </p>
        <p className="font-heading text-4xl">₹{plan.priceInr.toLocaleString("en-IN")}</p>
        <p className="text-sm text-muted">
          Every month · cancel anytime · calls continue until the end of the paid month
        </p>
        <form action={action} className="flex flex-col gap-2">
          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm font-semibold">Pay with</legend>
            {[
              ["upi", "UPI"],
              ["card", "Card (Indian or international)"],
              ["netbanking", "Netbanking"],
            ].map(([v, l], i) => (
              <label key={v} className="flex items-center gap-2 text-base">
                <input
                  type="radio"
                  name="method"
                  value={v}
                  defaultChecked={i === 0}
                  className="accent-[var(--brand-primary)]"
                />{" "}
                {l}
              </label>
            ))}
          </fieldset>
          <Button type="submit" name="outcome" value="success" size="lg">
            Pay ₹{plan.priceInr.toLocaleString("en-IN")} (demo)
          </Button>
          <Button type="submit" name="outcome" value="fail" variant="ghost">
            Simulate a failed payment
          </Button>
        </form>
      </Card>
    </div>
  );
}
