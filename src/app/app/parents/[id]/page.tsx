import type { Metadata } from "next";
import Link from "next/link";
import { assistantNameFor } from "@/config/brand";
import { Badge, Callout, Card, CardTitle } from "@/components/ui/card";
import { Button, LinkButton } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { MoodChart } from "@/components/family/mood-chart";
import { moodWord, summariseMeds, medsLabel, type Tone } from "@/domain/status";
import { formatPhone } from "@/lib/phone";
import {
  convertLocalTime,
  formatClock,
  formatLocalDate,
  localDateOf,
  addDaysToLocalDate,
  zonedToInstant,
} from "@/lib/time";
import {
  getDigest,
  getMedicineAdherence,
  getMoodSeries,
  getOpenAlerts,
  getOpenFollowUps,
  getPendingNotes,
  getSchedule,
  getSubscription,
  getTimeline,
  getTodayStatus,
} from "@/server/dashboard";
import { requireParent } from "@/server/session";
import { CallNowButton } from "@/components/family/call-now";
import {
  addNoteAction,
  deleteNoteAction,
  pauseAction,
  restartAction,
  resumeAction,
  skipTodayAction,
} from "./actions";

export async function generateMetadata({
  params,
}: PageProps<"/app/parents/[id]">): Promise<Metadata> {
  const { id } = await params;
  const { parent } = await requireParent(id);
  return { title: parent.addressAs };
}

const toneClass: Record<Tone, string> = {
  success: "border-success/40 bg-success/8",
  warning: "border-warning/50 bg-warning/10",
  danger: "border-danger/50 bg-danger/8",
  info: "border-info/30 bg-info/5",
  neutral: "border-foreground/15 bg-surface",
};

const DONE_MESSAGES: Record<string, string> = {
  paused: "Calls are paused.",
  resumed: "Calls will resume from the next scheduled time.",
  skipped: "Today's call is skipped.",
  "skip-in-progress": "A call is happening right now, so it can't be skipped.",
  "skip-too-late": "Today's call has already happened.",
  note: "Noted. The assistant will bring it up on the next call.",
  "note-removed": "Note removed.",
  "note-invalid": "Please write a short note (up to 200 characters).",
  restarted: "We'll make a fresh introduction call at the next call time.",
  "call-requested": "Calling now. The result will appear here in a few minutes.",
  "call-blocked-status": "Calls aren't active for this parent right now.",
  "call-blocked-window": "We only call between 8 am and 8 pm in your parent's time.",
  "call-blocked-disabled":
    "Calls are temporarily switched off by our team. Your parent will be called as soon as they're back on.",
  "call-blocked-limit": "That's the maximum of 3 extra calls today.",
  "call-blocked-busy": "A call is already starting or in progress.",
};

export default async function ParentDashboard({
  params,
  searchParams,
}: PageProps<"/app/parents/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const range = sp.range === "30" ? 30 : 7;
  const { db, parent, member } = await requireParent(id);
  const now = new Date();

  if (parent.status === "onboarding") {
    const steps = [
      "profile",
      "schedule",
      "medicines",
      "personalize",
      "health",
      "contacts",
      "consent",
    ];
    const next = steps[Math.min(parent.onboardingStep, steps.length) - 1] ?? "profile";
    return (
      <Card className="flex flex-col gap-3">
        <CardTitle>Finish setting up {parent.addressAs}</CardTitle>
        <p className="text-base text-muted">Your progress is saved. Pick up where you left off.</p>
        <LinkButton href={`/app/parents/${parent.id}/setup/${next}`} size="lg">
          Continue setup
        </LinkButton>
      </Card>
    );
  }

  const [today, schedule, timeline, mood, meds, digest, openAlerts, followUps, notes, sub] =
    await Promise.all([
      getTodayStatus(db, parent, now),
      getSchedule(db, parent.id),
      getTimeline(db, parent.id, 10),
      getMoodSeries(db, parent, now, range),
      getMedicineAdherence(db, parent, now, 7),
      getDigest(db, parent, now),
      getOpenAlerts(db, parent.id),
      getOpenFollowUps(db, parent.id),
      getPendingNotes(db, parent.id),
      getSubscription(db, parent.id),
    ]);

  const assistant = assistantNameFor(parent.voice);
  const localToday = localDateOf(now, parent.timezone);
  const callTime = schedule
    ? formatClock(zonedToInstant(localToday, schedule.callTime, parent.timezone), parent.timezone)
    : null;
  const viewerTime =
    schedule && member.timezone !== parent.timezone
      ? convertLocalTime(schedule.callTime, parent.timezone, member.timezone, now)
      : null;
  const done = typeof sp.done === "string" ? DONE_MESSAGES[sp.done] : undefined;
  const canAct = parent.status === "active" || parent.status === "awaiting_consent";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-muted">
            <Link href="/app" className="underline">
              Home
            </Link>{" "}
            / {parent.name}
          </p>
          <h1 className="font-heading text-3xl">{parent.addressAs}</h1>
          <p className="text-base text-muted">
            {assistant} calls {formatPhone(parent.phoneE164)}
            {callTime && ` around ${callTime}`}
            {viewerTime &&
              ` (${viewerTime.time} your time${viewerTime.dayShift ? `, ${viewerTime.dayShift < 0 ? "previous" : "next"} day` : ""})`}
          </p>
        </div>
        {sub && (
          <Link href="/app/billing">
            <Badge
              tone={
                sub.sub.status === "past_due"
                  ? "warning"
                  : sub.sub.status === "trialing"
                    ? "info"
                    : "neutral"
              }
            >
              {sub.sub.status === "trialing" ? "Free trial" : sub.plan.name}
              {sub.sub.status === "past_due" ? " · payment due" : ""}
            </Badge>
          </Link>
        )}
      </div>

      {sp.welcome === "1" && (
        <Callout tone="success" title="All set!">
          {assistant} will make the introduction call at the next call time. You&apos;ll get a
          WhatsApp message after the call.
        </Callout>
      )}
      {sp.saved === "1" && <Callout tone="success">Saved.</Callout>}
      {done && (
        <Callout tone="info" role="status">
          {done}
        </Callout>
      )}

      <section
        aria-labelledby="today-title"
        className={`rounded-2xl border-2 p-5 ${toneClass[today.tone]}`}
      >
        <p id="today-title" className="text-sm font-semibold tracking-wide text-muted uppercase">
          Today
        </p>
        <p className="mt-1 font-heading text-2xl leading-snug" data-testid="today-status">
          {today.headline}
        </p>
        {today.detail && <p className="mt-1 text-base">{today.detail}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {canAct && <CallNowButton parentId={parent.id} />}
          {canAct && (
            <form action={skipTodayAction.bind(null, parent.id)}>
              <Button type="submit" variant="secondary">
                Skip today
              </Button>
            </form>
          )}
          {parent.status === "paused" && (
            <form action={resumeAction.bind(null, parent.id)}>
              <Button type="submit">Resume calls</Button>
            </form>
          )}
          {(parent.status === "opted_out" || parent.status === "consent_refused") && (
            <form action={restartAction.bind(null, parent.id)}>
              <Button type="submit" variant="secondary">
                I talked to them: try the introduction call again
              </Button>
            </form>
          )}
        </div>
      </section>

      {openAlerts.length > 0 && (
        <section aria-labelledby="alerts-title" className="flex flex-col gap-2">
          <h2 id="alerts-title" className="font-heading text-xl">
            Needs your attention
          </h2>
          {openAlerts.map((a) => (
            <Callout
              key={a.id}
              tone={a.severity === "urgent" ? "danger" : "warning"}
              title={a.title}
            >
              {a.detail}
              {a.checkInId && (
                <>
                  {" "}
                  <Link
                    href={`/app/parents/${parent.id}/calls/${a.checkInId}`}
                    className="font-semibold underline"
                  >
                    See the call
                  </Link>
                </>
              )}
            </Callout>
          ))}
        </section>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <CardTitle>Mood</CardTitle>
            <div className="flex gap-1 text-sm" role="group" aria-label="Range">
              <Link
                href={`/app/parents/${parent.id}?range=7`}
                aria-current={range === 7 ? "page" : undefined}
                className={`rounded-lg px-2 py-1 ${range === 7 ? "bg-primary text-primary-foreground" : "hover:bg-foreground/5"}`}
              >
                7 days
              </Link>
              <Link
                href={`/app/parents/${parent.id}?range=30`}
                aria-current={range === 30 ? "page" : undefined}
                className={`rounded-lg px-2 py-1 ${range === 30 ? "bg-primary text-primary-foreground" : "hover:bg-foreground/5"}`}
              >
                30 days
              </Link>
            </div>
          </div>
          <MoodChart points={mood} />
        </Card>

        <Card className="flex flex-col gap-3">
          <CardTitle>Medicines (last 7 days)</CardTitle>
          {meds.length === 0 ? (
            <p className="text-base text-muted">No medicines added.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {meds.map((m) => (
                <li key={m.name} className="flex items-center justify-between gap-2 text-base">
                  <span>{m.name}</span>
                  <span className="text-sm text-muted">
                    {m.yes + m.no + m.unclear === 0
                      ? "not asked (due after call time)"
                      : `said yes ${m.yes} · not yet ${m.no}${m.unclear ? ` · unclear ${m.unclear}` : ""}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-sm text-muted">What your parent told us. We can&apos;t verify it.</p>
        </Card>
      </div>

      <Card className="flex flex-col gap-2">
        <CardTitle>This week</CardTitle>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-base">
          {digest.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </Card>

      {followUps.length > 0 && (
        <Card className="flex flex-col gap-2">
          <CardTitle>{assistant} will follow up on</CardTitle>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-base">
            {followUps.map((f) => (
              <li key={f.id}>{f.text}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <CardTitle>Note for the next call</CardTitle>
        <p className="text-base text-muted">
          Something {assistant} should ask or mention, for example &ldquo;ask if the plumber
          came&rdquo;.
        </p>
        {notes.length > 0 && (
          <ul className="flex flex-col gap-2">
            {notes.map((n) => (
              <li
                key={n.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-foreground/5 px-3 py-2"
              >
                <span>{n.text}</span>
                <form action={deleteNoteAction.bind(null, parent.id, n.id)}>
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove note: ${n.text}`}
                  >
                    Remove
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form
          action={addNoteAction.bind(null, parent.id)}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <label htmlFor="note" className="sr-only">
            Note for the next call
          </label>
          <Input
            id="note"
            name="note"
            maxLength={200}
            placeholder="Ask if the plumber came"
            required
          />
          <Button type="submit" variant="secondary" className="shrink-0">
            Add note
          </Button>
        </form>
      </Card>

      <section aria-labelledby="calls-title" className="flex flex-col gap-3">
        <h2 id="calls-title" className="font-heading text-xl">
          Recent calls
        </h2>
        {timeline.length === 0 && <p className="text-base text-muted">No calls yet.</p>}
        <ol className="flex flex-col gap-3">
          {timeline.map(({ checkIn, result }) => {
            const meds = result ? summariseMeds(result.medicinesTaken) : null;
            return (
              <li key={checkIn.id}>
                <Link
                  href={`/app/parents/${parent.id}/calls/${checkIn.id}`}
                  className="block rounded-2xl border border-foreground/10 bg-surface p-4 hover:border-primary/40"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">
                      {formatLocalDate(checkIn.localDate)}
                      {checkIn.isConsentCall && " · introduction call"}
                      {checkIn.slot.startsWith("manual") && " · extra call"}
                    </span>
                    <StatusBadge status={checkIn.status} redFlag={result?.redFlag ?? false} />
                  </div>
                  {result?.summaryEn && <p className="mt-2 text-base">{result.summaryEn}</p>}
                  {result && (
                    <p className="mt-2 text-sm text-muted">
                      {[
                        moodWord(result.mood) && `Mood: ${moodWord(result.mood)}`,
                        meds && `Meds: ${medsLabel(meds)}`,
                        result.sleep && `Sleep: ${result.sleep}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      <Card className="flex flex-col gap-3">
        <CardTitle>Pause calls</CardTitle>
        <p className="text-base text-muted">
          Travelling or in hospital? Pause and we&apos;ll resume on the date you pick.
        </p>
        {parent.status === "paused" ? (
          <form action={resumeAction.bind(null, parent.id)}>
            <Button type="submit">Resume calls now</Button>
          </form>
        ) : (
          <form
            action={pauseAction.bind(null, parent.id)}
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
          >
            <div className="flex flex-col gap-1">
              <label htmlFor="until" className="text-sm font-semibold">
                Resume on (optional)
              </label>
              <Input id="until" name="until" type="date" min={addDaysToLocalDate(localToday, 1)} />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="reason" className="text-sm font-semibold">
                Reason (optional)
              </label>
              <Input id="reason" name="reason" maxLength={100} placeholder="Travelling" />
            </div>
            <Button type="submit" variant="secondary">
              Pause calls
            </Button>
          </form>
        )}
      </Card>

      <Card className="flex flex-col gap-2">
        <CardTitle>Settings for {parent.addressAs}</CardTitle>
        <nav className="grid grid-cols-2 gap-2 text-base sm:grid-cols-3">
          {[
            ["profile", "Profile & voice"],
            ["schedule", "Call time"],
            ["medicines", "Medicines"],
            ["personalize", "Topics & news"],
            ["health", "Health notes"],
            ["contacts", "Alert contacts"],
          ].map(([k, label]) => (
            <Link
              key={k}
              href={`/app/parents/${parent.id}/setup/${k}`}
              className="rounded-xl border border-foreground/10 px-3 py-2 hover:bg-foreground/5"
            >
              {label}
            </Link>
          ))}
          <Link
            href={`/app/parents/${parent.id}/delete`}
            className="rounded-xl border border-danger/30 px-3 py-2 text-danger hover:bg-danger/5"
          >
            Delete {parent.addressAs}
          </Link>
        </nav>
      </Card>
    </div>
  );
}

function StatusBadge({ status, redFlag }: { status: string; redFlag: boolean }) {
  if (redFlag) return <Badge tone="danger">Worrying</Badge>;
  switch (status) {
    case "completed":
      return <Badge tone="success">Spoke</Badge>;
    case "unreachable":
      return <Badge tone="danger">Not reached</Badge>;
    case "retry_scheduled":
      return <Badge tone="warning">Retrying</Badge>;
    case "skipped":
      return <Badge>Skipped</Badge>;
    case "dialing":
    case "in_progress":
      return <Badge tone="info">On call</Badge>;
    default:
      return <Badge tone="warning">Problem</Badge>;
  }
}
