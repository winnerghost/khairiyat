import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { user as userTable } from "@/db/schema/auth";
import { getEnv } from "@/lib/env";
import { formatPhone } from "@/lib/phone";
import { COMMON_TIMEZONES } from "@/lib/time";
import { listMembers } from "@/server/families";
import { requireMember } from "@/server/session";
import { logoutAction } from "@/app/(auth)/actions";
import {
  deleteAccountAction,
  inviteAction,
  retentionAction,
  savePreferencesAction,
} from "./actions";

export const metadata: Metadata = { title: "Settings" };

const ERRORS: Record<string, string> = {
  invalid: "Please check the form and try again.",
  phone: "That WhatsApp number doesn't look right.",
  channels: "Keep at least one way to reach you (WhatsApp or email), so alerts are never lost.",
  invite: "Please enter a valid email to invite.",
  owner: "Only the family owner can change this.",
  retention: "Pick between 30 and 730 days.",
  confirm: "Type DELETE to confirm. Nothing was deleted.",
};

export default async function SettingsPage({ searchParams }: PageProps<"/app/settings">) {
  const sp = await searchParams;
  const { db, member, family, user } = await requireMember();
  const members = await listMembers(db, family.id);
  const emails = await Promise.all(
    members.map(
      async (m) =>
        (
          await db
            .select({ email: userTable.email })
            .from(userTable)
            .where(eq(userTable.id, m.userId))
        )[0]?.email ?? "",
    ),
  );
  const env = getEnv();
  const invite = typeof sp.invite === "string" ? `${env.APP_URL}/invite/${sp.invite}` : null;
  const error = typeof sp.error === "string" ? ERRORS[sp.error] : undefined;
  const zones = Array.from(new Set([member.timezone, ...COMMON_TIMEZONES]));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-heading text-3xl">Settings</h1>
        <form action={logoutAction}>
          <Button type="submit" variant="secondary" size="sm">
            Log out
          </Button>
        </form>
      </div>
      {sp.saved === "1" && <Callout tone="success">Saved.</Callout>}
      {error && <Callout tone="danger">{error}</Callout>}

      <Card className="flex flex-col gap-4">
        <CardTitle>How we reach you</CardTitle>
        <form action={savePreferencesAction} className="flex flex-col gap-4">
          <Field label="Your name" htmlFor="displayName">
            <Input
              id="displayName"
              name="displayName"
              defaultValue={member.displayName}
              required
              maxLength={80}
            />
          </Field>
          <Field
            label="Your WhatsApp number"
            htmlFor="whatsapp"
            hint="Summaries and alerts arrive here."
          >
            <Input
              id="whatsapp"
              name="whatsapp"
              type="tel"
              defaultValue={member.whatsappE164 ? formatPhone(member.whatsappE164) : ""}
              placeholder="+91 98765 43210"
            />
          </Field>
          <p className="-mt-2 text-sm text-muted">Email: {user.email} (backup for alerts)</p>
          <Field label="What should we send you?" htmlFor="notifyMode">
            <Select id="notifyMode" name="notifyMode" defaultValue={member.notifyMode}>
              <option value="every_call">A short summary after every call (plus alerts)</option>
              <option value="daily_digest">One message per day (plus alerts)</option>
              <option value="alerts_only">Only alerts (not reached, something worrying)</option>
            </Select>
          </Field>
          <Field label="Summary language" htmlFor="summaryLanguage">
            <Select
              id="summaryLanguage"
              name="summaryLanguage"
              defaultValue={member.summaryLanguage}
            >
              <option value="en">English</option>
              <option value="hi">Hindi (हिन्दी)</option>
            </Select>
          </Field>
          <Field
            label="Your time zone"
            htmlFor="timezone"
            hint="Call times are also shown in your time."
          >
            <Select id="timezone" name="timezone" defaultValue={member.timezone}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replace("_", " ")}
                </option>
              ))}
            </Select>
          </Field>
          <Checkbox
            name="whatsappEnabled"
            defaultChecked={member.whatsappEnabled}
            label="Send to WhatsApp"
          />
          <Checkbox
            name="emailEnabled"
            defaultChecked={member.emailEnabled}
            label="Send to email (and as backup if WhatsApp fails)"
          />
          <SubmitButton size="md">Save</SubmitButton>
        </form>
      </Card>

      <Card id="family" className="flex flex-col gap-3">
        <CardTitle>Family members</CardTitle>
        <p className="text-base text-muted">
          Brothers, sisters, cousins: each gets their own summaries and alerts.
        </p>
        <ul className="flex flex-col gap-1 text-base">
          {members.map((m, i) => (
            <li key={m.id}>
              {m.displayName}{" "}
              <span className="text-sm text-muted">
                · {emails[i]} · {m.role}
              </span>
            </li>
          ))}
        </ul>
        {invite && (
          <Callout tone="success" title="Invite link created">
            Send this link to them (it works for 14 days):{" "}
            <span className="break-all font-mono text-sm">{invite}</span>
          </Callout>
        )}
        <form action={inviteAction} className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="invite-email" className="sr-only">
            Email to invite
          </label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            placeholder="sibling@example.com"
            required
          />
          <Button type="submit" variant="secondary" className="shrink-0">
            Create invite link
          </Button>
        </form>
      </Card>

      <Card id="privacy" className="flex flex-col gap-4">
        <CardTitle>Privacy</CardTitle>
        <div className="flex flex-col gap-2">
          <p className="text-base">
            Download everything we hold about your family (profiles, calls, transcripts, messages).
          </p>
          <a href="/api/export" className="text-base font-semibold text-primary underline">
            Download all data (JSON)
          </a>
        </div>
        <form action={retentionAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field
            label="Keep call transcripts for (days)"
            htmlFor="days"
            hint="Older transcripts are deleted automatically. Summaries stay."
          >
            <Input
              id="days"
              name="days"
              type="number"
              min={30}
              max={730}
              defaultValue={family.transcriptRetentionDays}
              disabled={member.role !== "owner"}
            />
          </Field>
          {member.role === "owner" && (
            <Button type="submit" variant="secondary">
              Save
            </Button>
          )}
        </form>
        <details className="rounded-xl border border-danger/30 p-3">
          <summary className="cursor-pointer text-base font-semibold text-danger">
            Delete my account
          </summary>
          <form action={deleteAccountAction} className="mt-3 flex flex-col gap-2">
            <p className="text-base">
              Deletes your login. If you are the only family member, it also deletes every parent
              and all call history. This cannot be undone.
            </p>
            <label htmlFor="confirm" className="text-sm font-semibold">
              Type DELETE to confirm
            </label>
            <Input id="confirm" name="confirm" autoComplete="off" required />
            <SubmitButton variant="danger" size="md" pendingText="Deleting…">
              Delete my account
            </SubmitButton>
          </form>
        </details>
      </Card>
    </div>
  );
}
