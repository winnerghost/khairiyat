import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/admin/stat";
import { getSettings } from "@/engine/settings";
import { getEnv } from "@/lib/env";
import { getCapacity, getTodayOverview } from "@/server/admin";
import { requireAdmin } from "@/server/session";
import { resolveAlertAction } from "./actions";

export const metadata = { title: "Today" };

export default async function AdminToday() {
  const { db } = await requireAdmin();
  const now = new Date();
  const settings = await getSettings(db);
  const o = await getTodayOverview(db, now, settings);
  const capacity = await getCapacity(db, now, settings);
  const env = getEnv();
  const tickAge = o.lastTick
    ? Math.round((now.getTime() - o.lastTick.startedAt.getTime()) / 1000)
    : null;
  const s = (k: string) => o.byStatus[k] ?? 0;

  return (
    <>
      <h1 className="font-heading text-3xl">Today ({o.date})</h1>
      {!o.callsEnabled && (
        <Callout tone="danger" title="Calls are switched OFF">
          No new calls are being made. Turn them back on in{" "}
          <Link href="/admin/settings" className="underline">
            Settings
          </Link>
          .
        </Callout>
      )}
      {tickAge !== null && tickAge > 180 && !env.isHostedDemo && (
        <Callout tone="danger" title="Scheduler looks stopped">
          Last tick was {Math.round(tickAge / 60)} minutes ago. See docs/RUNBOOK.md §1.
        </Callout>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Scheduled" value={s("scheduled") + s("retry_scheduled")} />
        <Stat label="On a call now" value={s("dialing") + s("in_progress")} />
        <Stat label="Completed" value={s("completed")} tone="success" />
        <Stat
          label="Not reached"
          value={s("unreachable")}
          tone={s("unreachable") ? "warning" : undefined}
        />
        <Stat
          label="Failed / review"
          value={s("failed") + s("needs_review")}
          tone={s("failed") + s("needs_review") ? "danger" : undefined}
        />
        <Stat label="Skipped / paused" value={s("skipped") + s("paused") + s("cancelled")} />
        <Stat
          label="Open alerts"
          value={o.openAlerts.length}
          tone={o.openAlerts.length ? "danger" : undefined}
        />
        <Stat label="Parents being called" value={o.callingParents} />
      </div>

      <Card className="flex flex-col gap-2">
        <CardTitle>System health</CardTitle>
        <ul className="grid gap-1 text-base sm:grid-cols-2">
          <li>
            Scheduler:{" "}
            {tickAge === null ? (
              "never ran"
            ) : env.isHostedDemo ? (
              `last tick ${tickAge}s ago (public demo: it runs when someone opens a page)`
            ) : tickAge > 180 ? (
              <span className="font-semibold text-danger">
                STALE: last tick {Math.round(tickAge / 60)} min ago
              </span>
            ) : (
              `last tick ${tickAge}s ago`
            )}
            {o.failedTicksLastHour
              ? ` · ${o.failedTicksLastHour} failed in the last hour`
              : tickAge !== null && tickAge <= 180
                ? " · healthy"
                : ""}
          </li>
          <li>
            Calls right now: {o.activeCalls} of {o.concurrency} lines
          </li>
          <li>
            Voice: {env.modes.voice === "mock" ? "simulated (demo)" : "ElevenLabs"} · WhatsApp:{" "}
            {env.modes.whatsapp === "mock" ? "simulated" : "Meta"} · Email:{" "}
            {env.modes.email === "mock" ? "simulated" : "Resend"}
          </li>
          <li>
            Messages: {o.retryingMessages} retrying ·{" "}
            <span className={o.deadMessages ? "font-semibold text-danger" : ""}>
              {o.deadMessages} failed
            </span>{" "}
            · {o.failedWebhooks} webhook errors ·{" "}
            <Link href="/admin/failures" className="underline">
              details
            </Link>
          </li>
        </ul>
      </Card>

      <Card className="flex flex-col gap-3">
        <CardTitle>Open alerts</CardTitle>
        {o.openAlerts.length === 0 && <p className="text-base text-muted">None. 🌼</p>}
        <ul className="flex flex-col gap-2">
          {o.openAlerts.map(({ a, addressAs, parentName, familyName }) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-foreground/10 p-3"
            >
              <div>
                <p className={`font-semibold ${a.severity === "urgent" ? "text-danger" : ""}`}>
                  {a.title}
                </p>
                <p className="text-sm text-muted">
                  {familyName} · {addressAs} ({parentName}) · {a.createdAt.toLocaleString("en-IN")}
                </p>
              </div>
              <div className="flex gap-2">
                {a.parentId && (
                  <Link
                    href={`/admin/parents/${a.parentId}`}
                    className="text-sm text-primary underline"
                  >
                    Open
                  </Link>
                )}
                <form action={resolveAlertAction.bind(null, a.id)}>
                  <Button type="submit" size="sm" variant="secondary">
                    Mark handled
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="flex flex-col gap-3">
        <CardTitle>Call-time capacity (IST, per 30 minutes)</CardTitle>
        <p className="text-sm text-muted">
          With {settings.concurrency_limit} simultaneous calls, about{" "}
          {settings.concurrency_limit * 6} parents fit in each half hour.
        </p>
        <ul className="flex flex-col gap-1">
          {capacity.map((c) => (
            <li key={c.window} className="flex items-center gap-3 text-sm">
              <span className="w-12 font-mono">{c.window}</span>
              <span className="h-3 flex-1 overflow-hidden rounded-full bg-foreground/10">
                <span
                  className={`block h-full ${c.over ? "bg-danger" : "bg-success"}`}
                  style={{ width: `${Math.min(100, (c.parents / c.capacity) * 100)}%` }}
                />
              </span>
              <span className={c.over ? "font-semibold text-danger" : ""}>
                {c.parents}/{c.capacity}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
