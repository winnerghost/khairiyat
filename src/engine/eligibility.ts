/**
 * Who may be called. A parent is called only when ALL of these hold:
 * - they gave consent (or this IS the consent call),
 * - they haven't opted out and aren't paused,
 * - billing is in good standing: trial running, active, grace period, or
 *   cancelled but still inside the paid period.
 */
type SubStatus = "trialing" | "active" | "past_due" | "halted" | "cancelled" | "expired";

export interface BillingState {
  status: SubStatus;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  graceUntil: Date | null;
}

export function billingAllowsCalls(sub: BillingState | null, now: Date): boolean {
  if (!sub) return false;
  const t = now.getTime();
  switch (sub.status) {
    case "trialing":
      return !!sub.trialEndsAt && sub.trialEndsAt.getTime() > t;
    case "active":
      return true;
    case "past_due":
      return !!sub.graceUntil && sub.graceUntil.getTime() > t;
    case "cancelled":
      return !!sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > t;
    case "halted":
    case "expired":
      return false;
  }
}

export type ParentStatus =
  "onboarding" | "awaiting_consent" | "active" | "paused" | "opted_out" | "consent_refused";

/** "daily" for consenting parents, "consent" for the introduction call, null = don't call. */
export function slotForParent(status: ParentStatus): "daily" | "consent" | null {
  if (status === "active") return "daily";
  if (status === "awaiting_consent") return "consent";
  return null;
}
