import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardTitle } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { AutoRefresh } from "@/components/auto-refresh";
import { jobRuns, parents } from "@/db/schema/app";
import { SCENARIO_LABELS, SCENARIOS } from "@/providers/voice/mock-scripts";
import { getTodayStatus } from "@/server/dashboard";
import { isAdminEmail, requireMember } from "@/server/session";
import { demoCallAction, demoResetAction, demoTickAction } from "./actions";

export const metadata: Metadata = { title: "Demo room" };

const ERRORS: Record<string, string> = {
  parent: "Pick a parent.",
  scenario: "Pick a scenario.",
  not_allowed_status: "Calls aren't active for this parent (opted out, paused or not set up).",
  outside_window:
    "It's outside 8 am – 8 pm in the parent's time zone, so no calls (even in the demo). Try between 8 am and 8 pm IST.",
  calls_disabled: "Calls are switched off in Admin → Settings.",
  limit_reached: "Max 3 extra calls per day for this parent.",
  call_in_progress: "A call for this parent is already in progress. Wait a few seconds.",
};

export default async function DemoRoom({ searchParams }: PageProps<"/demo">) {
  const sp = await searchParams;
  const { db, family, user } = await requireMember();
  const admin = isAdminEmail(user.email);
  const list = await db
    .select()
    .from(parents)
    .where(
      admin
        ? inArray(parents.status, [
            "active",
            "awaiting_consent",
            "paused",
            "opted_out",
            "consent_refused",
          ])
        : eq(parents.familyId, family.id),
    );
  const now = new Date();
  const statuses = await Promise.all(list.map((p) => getTodayStatus(db, p, now)));
  const [lastTick] = await db.select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(1);
  const error = typeof sp.error === "string" ? ERRORS[sp.error] : undefined;
  const calling =
    typeof sp.calling === "string" ? list.find((p) => p.id === sp.calling) : undefined;

  return (
    <>
      {calling && <AutoRefresh seconds={4} />}
      <div>
        <h1 className="font-heading text-3xl">Demo room</h1>
        <p className="text-lg text-muted">
          Make a pretend call happen right now and watch everything the family would see. Calls
          finish about 12 seconds after dialing.
        </p>
      </div>
      {error && <Callout tone="danger">{error}</Callout>}
      {calling && (
        <Callout tone="info" role="status" title={`Calling ${calling.addressAs}…`}>
          This page refreshes by itself. Then open the{" "}
          <Link href={`/app/parents/${calling.id}`} className="font-semibold underline">
            dashboard
          </Link>{" "}
          or the{" "}
          <Link href="/demo/phone" className="font-semibold underline">
            phone preview
          </Link>
          .
        </Callout>
      )}
      {sp.ticked === "1" && <Callout tone="success">Ran the scheduler once.</Callout>}

      <Card className="flex flex-col gap-4">
        <CardTitle>Make a call now</CardTitle>
        {list.length === 0 ? (
          <p className="text-base text-muted">
            No parents yet.{" "}
            <Link href="/app/parents/new" className="underline">
              Add one
            </Link>{" "}
            first.
          </p>
        ) : (
          <form action={demoCallAction} className="flex flex-col gap-4">
            <Field label="Parent" htmlFor="parentId">
              <Select id="parentId" name="parentId" defaultValue={calling?.id ?? list[0]!.id}>
                {list.map((p, i) => (
                  <option key={p.id} value={p.id}>
                    {p.addressAs} ({p.name}) · {statuses[i]!.headline}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="What happens on the call"
              htmlFor="scenario"
              hint="Red flags send urgent WhatsApp + email alerts immediately."
            >
              <Select id="scenario" name="scenario" defaultValue="happy">
                {SCENARIOS.map((s) => (
                  <option key={s} value={s}>
                    {SCENARIO_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <SubmitButton pendingText="Dialing…">Call now</SubmitButton>
          </form>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="flex flex-col gap-2">
          <CardTitle>See what the family gets</CardTitle>
          <Link href="/demo/phone" className="text-lg font-semibold text-primary underline">
            📱 WhatsApp phone preview
          </Link>
          <Link href="/demo/inbox" className="text-lg font-semibold text-primary underline">
            ✉️ Demo email inbox
          </Link>
          <Link href="/app" className="text-lg font-semibold text-primary underline">
            🏠 Family dashboard
          </Link>
          {admin && (
            <Link href="/admin" className="text-lg font-semibold text-primary underline">
              🛠️ Admin panel
            </Link>
          )}
        </Card>
        <Card className="flex flex-col gap-3">
          <CardTitle>Engine</CardTitle>
          <p className="text-sm text-muted">
            Last scheduler tick:{" "}
            {lastTick
              ? `${Math.round((now.getTime() - lastTick.startedAt.getTime()) / 1000)}s ago`
              : "never"}
            . In demo mode it runs every 5 seconds inside the app.
          </p>
          <form action={demoTickAction}>
            <Button type="submit" variant="secondary">
              Run the scheduler once
            </Button>
          </form>
          <form action={demoResetAction}>
            <Button type="submit" variant="ghost">
              Reset all demo data (~20 s)
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
