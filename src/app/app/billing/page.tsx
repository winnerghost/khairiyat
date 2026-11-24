import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Badge, Callout, Card, CardTitle } from "@/components/ui/card";
import { invoices, parents, plans, subscriptions } from "@/db/schema/app";
import { foundingSeatsLeft } from "@/engine/billing";
import { getEnv } from "@/lib/env";
import { requireMember } from "@/server/session";
import { cancelAction, demoRenewalFailAction, resumeAction, startCheckoutAction } from "./actions";

export const metadata: Metadata = { title: "Billing" };

const fmt = (d: Date | null) =>
  d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "-";
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

const DONE: Record<string, string> = {
  paid: "Payment successful. Thank you! Your invoice is below.",
  failed:
    "The payment didn't go through. Don't worry: calls continue during the grace period, and we've messaged you.",
  cancelled: "Cancelled. Calls continue until the end of the period you've paid for.",
  resumed: "Your plan continues as before.",
};

export default async function BillingPage({ searchParams }: PageProps<"/app/billing">) {
  const sp = await searchParams;
  const { db, family } = await requireMember();
  const env = getEnv();
  const rows = await db
    .select({ sub: subscriptions, parent: parents, plan: plans })
    .from(subscriptions)
    .innerJoin(parents, eq(parents.id, subscriptions.parentId))
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(parents.familyId, family.id))
    .orderBy(asc(parents.createdAt));
  const allPlans = await db
    .select()
    .from(plans)
    .where(eq(plans.active, true))
    .orderBy(asc(plans.sortOrder));
  const seats = await foundingSeatsLeft(db);
  const choosable = allPlans.filter((p) => p.id !== "founding" || seats > 0);
  const invs = await db
    .select()
    .from(invoices)
    .where(eq(invoices.familyId, family.id))
    .orderBy(desc(invoices.createdAt));
  const now = new Date();
  const done = typeof sp.done === "string" ? DONE[sp.done] : undefined;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-heading text-3xl">Billing</h1>
      {env.modes.payments === "mock" && (
        <Callout tone="info">
          Demo mode: payments are simulated. No money moves and no card is needed.
        </Callout>
      )}
      {done && <Callout tone={sp.done === "failed" ? "warning" : "success"}>{done}</Callout>}
      {sp.error === "founding" && (
        <Callout tone="warning">Sorry, all 50 founding places are taken.</Callout>
      )}

      {rows.length === 0 && (
        <Card>
          <p className="text-base">Plans start after you set up a parent (7 days free, no card).</p>
        </Card>
      )}

      {rows.map(({ sub, parent, plan }) => {
        const trialDays = sub.trialEndsAt
          ? Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - now.getTime()) / 86400000))
          : 0;
        const status =
          sub.status === "trialing"
            ? {
                tone: "info" as const,
                label: `Free trial · ${trialDays} day${trialDays === 1 ? "" : "s"} left`,
              }
            : sub.status === "active"
              ? {
                  tone: "success" as const,
                  label: `${plan.name} · renews ${fmt(sub.currentPeriodEnd)}`,
                }
              : sub.status === "past_due"
                ? {
                    tone: "warning" as const,
                    label: `Payment due · calls continue until ${fmt(sub.graceUntil)}`,
                  }
                : sub.status === "cancelled"
                  ? {
                      tone: "neutral" as const,
                      label: `Cancelled · calls until ${fmt(sub.currentPeriodEnd)}`,
                    }
                  : { tone: "danger" as const, label: "Calls paused · choose a plan to restart" };
        const needsPlan = ["trialing", "expired", "halted", "past_due"].includes(sub.status);
        return (
          <Card key={sub.id} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>{parent.addressAs}</CardTitle>
              <Badge tone={status.tone}>{status.label}</Badge>
            </div>
            {sub.status === "past_due" && (
              <Callout tone="warning">
                Your last payment didn&apos;t go through. Calls continue until {fmt(sub.graceUntil)}
                . Please pay below to keep them going.
              </Callout>
            )}
            {needsPlan && (
              <div className="grid gap-3 sm:grid-cols-3">
                {choosable.map((p) => (
                  <form
                    key={p.id}
                    action={startCheckoutAction.bind(null, parent.id)}
                    className="flex flex-col gap-2 rounded-xl border border-foreground/15 p-3"
                  >
                    <input type="hidden" name="planId" value={p.id} />
                    <p className="font-semibold">{p.name}</p>
                    <p className="font-heading text-2xl">
                      {inr(p.priceInr)}
                      <span className="text-base font-normal text-muted">/month</span>
                    </p>
                    {p.priceUsdLabel && <p className="text-sm text-muted">{p.priceUsdLabel}</p>}
                    <p className="text-sm text-muted">{p.description}</p>
                    {p.id === "founding" && (
                      <p className="text-sm font-semibold text-primary">{seats} places left</p>
                    )}
                    <Button type="submit" size="sm">
                      Choose {p.name}
                    </Button>
                  </form>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {(sub.status === "active" || sub.status === "past_due") && (
                <form action={cancelAction.bind(null, parent.id)}>
                  <Button type="submit" variant="secondary" size="sm">
                    Cancel plan
                  </Button>
                </form>
              )}
              {sub.status === "cancelled" && (
                <form action={resumeAction.bind(null, parent.id)}>
                  <Button type="submit" size="sm">
                    Keep my plan
                  </Button>
                </form>
              )}
              {env.modes.payments === "mock" && sub.status === "active" && (
                <form action={demoRenewalFailAction.bind(null, parent.id)}>
                  <Button type="submit" variant="ghost" size="sm">
                    Demo: simulate a failed renewal
                  </Button>
                </form>
              )}
            </div>
          </Card>
        );
      })}

      <Card className="flex flex-col gap-3">
        <CardTitle>Invoices</CardTitle>
        {invs.length === 0 ? (
          <p className="text-base text-muted">No invoices yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-foreground/10">
            {invs.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {fmt(i.createdAt)} · {i.description}
                </span>
                <Link href={`/app/billing/invoices/${i.id}`} className="text-primary underline">
                  {i.number} · {inr(i.amountInr + i.gstInr)}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-muted">
          Payment methods: UPI, cards (incl. international), netbanking, via Razorpay.
        </p>
      </Card>
    </div>
  );
}
