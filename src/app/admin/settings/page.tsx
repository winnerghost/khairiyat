import { asc } from "drizzle-orm";
import { Callout, Card, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { plans } from "@/db/schema/app";
import { getSettings } from "@/engine/settings";
import { requireAdmin } from "@/server/session";
import { savePlanAction, saveSettingsAction } from "../actions";

export const metadata = { title: "Settings" };

export default async function AdminSettings({ searchParams }: PageProps<"/admin/settings">) {
  const sp = await searchParams;
  const { db } = await requireAdmin();
  const s = await getSettings(db);
  const allPlans = await db.select().from(plans).orderBy(asc(plans.sortOrder));
  return (
    <>
      <h1 className="font-heading text-3xl">Settings</h1>
      {sp.done === "saved" && (
        <Callout tone="success">Saved (and recorded in the audit log).</Callout>
      )}
      {sp.done === "invalid" && (
        <Callout tone="danger">Some values were invalid. Nothing unsafe was saved.</Callout>
      )}

      <Card className="flex flex-col gap-4">
        <CardTitle>Plans and prices</CardTitle>
        <p className="text-sm text-muted">
          Prices are per parent per month. Changes apply to new payments.
        </p>
        {allPlans.map((p) => (
          <form
            key={p.id}
            action={savePlanAction.bind(null, p.id)}
            className="grid items-end gap-2 rounded-xl border border-foreground/10 p-3 sm:grid-cols-6"
          >
            <Field label="Name" htmlFor={`n-${p.id}`}>
              <Input id={`n-${p.id}`} name="name" defaultValue={p.name} />
            </Field>
            <Field label="₹ / month" htmlFor={`p-${p.id}`}>
              <Input id={`p-${p.id}`} name="priceInr" type="number" defaultValue={p.priceInr} />
            </Field>
            <Field label="Max minutes" htmlFor={`m-${p.id}`}>
              <Input
                id={`m-${p.id}`}
                name="maxCallMinutes"
                type="number"
                defaultValue={p.maxCallMinutes}
              />
            </Field>
            <Field label="Seat limit" htmlFor={`s-${p.id}`}>
              <Input
                id={`s-${p.id}`}
                name="seatLimit"
                type="number"
                defaultValue={p.seatLimit ?? ""}
              />
            </Field>
            <Checkbox name="active" defaultChecked={p.active} label="Active" />
            <SubmitButton size="sm" variant="secondary">
              Save {p.id}
            </SubmitButton>
          </form>
        ))}
      </Card>

      <form action={saveSettingsAction} className="flex flex-col gap-5">
        <Card className="flex flex-col gap-4">
          <CardTitle>Calls</CardTitle>
          <Checkbox
            name="calls_enabled"
            defaultChecked={s.calls_enabled}
            label="Calls are ON"
            hint="Emergency stop: untick to stop all new calls at the next tick. Alerts keep working."
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Simultaneous calls" htmlFor="cc" hint="Match your ElevenLabs plan.">
              <Input
                id="cc"
                name="concurrency_limit"
                type="number"
                min={1}
                defaultValue={s.concurrency_limit}
              />
            </Field>
            <Field label="Retry after (min)" htmlFor="rd">
              <Input
                id="rd"
                name="retry_delay"
                type="number"
                min={5}
                defaultValue={s.retry_policy.delayMinutes}
              />
            </Field>
            <Field label="Max retries" htmlFor="rm">
              <Input
                id="rm"
                name="retry_max"
                type="number"
                min={0}
                max={5}
                defaultValue={s.retry_policy.maxRetries}
              />
            </Field>
            <Field label="Earliest call" htmlFor="ws" hint="Can only narrow 08:00–20:00.">
              <Input id="ws" name="window_start" type="time" defaultValue={s.call_window.start} />
            </Field>
            <Field label="Latest call start" htmlFor="we">
              <Input id="we" name="window_end" type="time" defaultValue={s.call_window.end} />
            </Field>
            <Field label="Reconcile after (min)" htmlFor="ra">
              <Input
                id="ra"
                name="reconcile_after_minutes"
                type="number"
                min={2}
                defaultValue={s.reconcile_after_minutes}
              />
            </Field>
          </div>
        </Card>
        <Card className="flex flex-col gap-4">
          <CardTitle>Billing</CardTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Free trial (days)" htmlFor="td">
              <Input id="td" name="trial_days" type="number" min={0} defaultValue={s.trial_days} />
            </Field>
            <Field label="Grace period (days)" htmlFor="gd">
              <Input id="gd" name="grace_days" type="number" min={0} defaultValue={s.grace_days} />
            </Field>
          </div>
          <Checkbox
            name="gst_enabled"
            defaultChecked={s.gst.enabled}
            label="GST invoices (only once registered)"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="GSTIN" htmlFor="gstin">
              <Input id="gstin" name="gstin" defaultValue={s.gst.gstin} />
            </Field>
            <Field label="GST rate %" htmlFor="gr">
              <Input id="gr" name="gst_rate" type="number" defaultValue={s.gst.ratePercent} />
            </Field>
            <Field label="Legal name" htmlFor="gn">
              <Input id="gn" name="gst_name" defaultValue={s.gst.legalName} />
            </Field>
            <Field label="Address" htmlFor="ga">
              <Input id="ga" name="gst_address" defaultValue={s.gst.address} />
            </Field>
          </div>
        </Card>
        <Card className="flex flex-col gap-4">
          <CardTitle>Costs (for the margin report)</CardTitle>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="AI ₹/min" htmlFor="ai">
              <Input
                id="ai"
                name="ai_rate"
                type="number"
                step="0.01"
                defaultValue={s.cost_rates.aiPerMinInr}
              />
            </Field>
            <Field label="Platform ₹/min" htmlFor="pl">
              <Input
                id="pl"
                name="platform_rate"
                type="number"
                step="0.01"
                defaultValue={s.cost_rates.platformPerMinInr}
              />
            </Field>
            <Field label="Telephony ₹/min" htmlFor="te">
              <Input
                id="te"
                name="telephony_rate"
                type="number"
                step="0.01"
                defaultValue={s.cost_rates.telephonyPerMinInr}
              />
            </Field>
            <Field label="WhatsApp ₹/msg" htmlFor="wa">
              <Input
                id="wa"
                name="whatsapp_rate"
                type="number"
                step="0.001"
                defaultValue={s.cost_rates.whatsappPerMessageInr}
              />
            </Field>
          </div>
        </Card>
        <Card className="flex flex-col gap-3">
          <CardTitle>Feature flags</CardTitle>
          <Checkbox
            name="ff_weekly"
            defaultChecked={s.feature_flags.weeklyDigest}
            label="Weekly digest messages (Sunday evening)"
          />
          <Checkbox
            name="ff_browser_voice"
            defaultChecked={s.feature_flags.browserVoiceDemo}
            label="'Talk to the assistant' in the browser"
          />
          <Checkbox
            name="ff_email_fallback"
            defaultChecked={s.feature_flags.emailFallback}
            label="Email fallback when WhatsApp fails"
          />
        </Card>
        <SubmitButton>Save settings</SubmitButton>
      </form>
    </>
  );
}
