import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { assistantNameFor } from "@/config/brand";
import { Badge, Callout, Card, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { medsLabel, moodWord, summariseMeds } from "@/domain/status";
import { formatDayTime, formatLocalDate } from "@/lib/time";
import { getCallDetail } from "@/server/dashboard";
import { getEnv } from "@/lib/env";
import { requireParent } from "@/server/session";
import { reportProblemAction } from "../../actions";

export const metadata: Metadata = { title: "Call details" };

const ATTEMPT_LABEL: Record<string, string> = {
  dialing: "Ringing",
  in_progress: "In progress",
  completed: "Answered",
  no_answer: "No answer",
  busy: "Busy",
  voicemail: "Voicemail / switched off",
  failed: "Could not connect",
  unknown: "Unknown",
};

export default async function CallDetailPage({
  params,
  searchParams,
}: PageProps<"/app/parents/[id]/calls/[checkInId]">) {
  const { id, checkInId } = await params;
  const sp = await searchParams;
  const { db, parent } = await requireParent(id);
  if (!/^[0-9a-f-]{36}$/i.test(checkInId)) notFound();
  const detail = await getCallDetail(db, parent.id, checkInId);
  if (!detail) notFound();
  const { checkIn, result, attempts } = detail;
  const assistant = assistantNameFor(parent.voice);
  const meds = result ? summariseMeds(result.medicinesTaken) : null;
  const audioAvailable = getEnv().modes.voice !== "mock";

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/app/parents/${parent.id}`} className="text-base text-primary underline">
        ← Back to {parent.addressAs}
      </Link>
      <h1 className="font-heading text-3xl">
        {formatLocalDate(checkIn.localDate)}
        {checkIn.isConsentCall && " · introduction call"}
      </h1>

      {result?.redFlag && (
        <Callout tone="danger" title="Something worrying was mentioned">
          {result.redFlagDetail ?? "Please check on them."} Please call {parent.addressAs} or
          someone nearby. In an emergency, call 112.
        </Callout>
      )}
      {result?.distress && (
        <Callout tone="danger" title="They sounded very low">
          Please call {parent.addressAs} soon. {assistant} shared Tele-MANAS (14416), a free
          national mental-health helpline.
        </Callout>
      )}

      {result ? (
        <Card className="flex flex-col gap-3">
          <CardTitle>Summary</CardTitle>
          <p className="text-lg">{result.summaryEn}</p>
          {result.summaryHi && (
            <p className="text-lg text-muted" lang="hi">
              {result.summaryHi}
            </p>
          )}
          <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-base sm:grid-cols-2">
            {[
              [
                "Mood",
                result.mood
                  ? `${moodWord(result.mood)}${result.moodWords ? ` (“${result.moodWords}”)` : ""}`
                  : null,
              ],
              ["Food", result.ateMeals],
              ["Medicines", meds ? `${medsLabel(meds)} (self-reported)` : null],
              ["Sleep", result.sleep],
              ["Pain or symptoms", result.painOrSymptoms],
              ["To follow up", result.followUp],
              ["Nice moment", result.notableMoments],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k as string}>
                  <dt className="text-sm font-semibold text-muted">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
          </dl>
          {result.medicinesTaken.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {result.medicinesTaken.map((m) => (
                <li key={m.name}>
                  <Badge
                    tone={m.taken === "yes" ? "success" : m.taken === "no" ? "warning" : "neutral"}
                  >
                    {m.name}:{" "}
                    {m.taken === "yes" ? "said yes" : m.taken === "no" ? "not yet" : "unclear"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : (
        <Callout tone="warning">No conversation for this check-in.</Callout>
      )}

      <Card className="flex flex-col gap-2">
        <CardTitle>Call attempts</CardTitle>
        <ol className="flex flex-col gap-1 text-base">
          {attempts.map((a) => (
            <li key={a.id}>
              Attempt {a.attemptNo}: {formatDayTime(a.dialedAt, parent.timezone)} ·{" "}
              {ATTEMPT_LABEL[a.status] ?? a.status}
              {a.durationSecs ? ` · ${Math.round(a.durationSecs / 6) / 10} min` : ""}
            </li>
          ))}
          {attempts.length === 0 && (
            <li className="text-muted">No call was made ({checkIn.status.replace("_", " ")}).</li>
          )}
        </ol>
        {result?.hasAudio && audioAvailable && (
          <audio controls preload="none" className="mt-2 w-full" src={`/api/audio/${checkIn.id}`}>
            Your browser can&apos;t play this recording.
          </audio>
        )}
        {result?.hasAudio && !audioAvailable && (
          <p className="text-sm text-muted">
            Demo call: no recording. With real calls, the recording plays here.
          </p>
        )}
      </Card>

      {result && result.transcript.length > 0 && (
        <Card className="flex flex-col gap-3">
          <CardTitle>Full conversation</CardTitle>
          <ol className="flex flex-col gap-2">
            {result.transcript.map((t, i) => (
              <li
                key={i}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-base ${t.role === "agent" ? "self-start bg-foreground/5" : "self-end bg-primary/10"}`}
              >
                <span className="block text-xs font-semibold text-muted">
                  {t.role === "agent" ? assistant : parent.addressAs}
                </span>
                {t.message}
              </li>
            ))}
          </ol>
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <CardTitle>Report a problem with this call</CardTitle>
        {sp.report === "sent" ? (
          <Callout tone="success">
            Thank you. We&apos;ll look into it and reply on WhatsApp or email.
          </Callout>
        ) : (
          <form
            action={reportProblemAction.bind(null, parent.id, checkIn.id)}
            className="flex flex-col gap-2"
          >
            <label htmlFor="message" className="text-base">
              What went wrong? (for example: {assistant} misheard, was too fast, the summary is
              wrong)
            </label>
            <Textarea id="message" name="message" required minLength={3} maxLength={1000} />
            {sp.report === "invalid" && (
              <p className="text-sm text-danger">Please write a few words.</p>
            )}
            <SubmitButton variant="secondary" size="md" pendingText="Sending…">
              Send report
            </SubmitButton>
          </form>
        )}
      </Card>
    </div>
  );
}
