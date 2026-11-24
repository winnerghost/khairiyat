import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Badge, Callout, Card, CardTitle } from "@/components/ui/card";
import { Table } from "@/components/admin/stat";
import {
  alerts,
  emergencyContacts,
  familyNotes,
  families,
  medicines,
  notifications,
} from "@/db/schema/app";
import { formatPhone } from "@/lib/phone";
import { formatDayTime } from "@/lib/time";
import { getSchedule, getSubscription, getTimeline, getTodayStatus } from "@/server/dashboard";
import { getParent } from "@/server/parents";
import { requireAdmin } from "@/server/session";
import { adminCallNowAction, adminPauseAction } from "../../actions";

export const metadata = { title: "Parent" };

export default async function AdminParent({
  params,
  searchParams,
}: PageProps<"/admin/parents/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const { db } = await requireAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const p = await getParent(db, id);
  if (!p) notFound();
  const now = new Date();
  const [fam] = await db.select().from(families).where(eq(families.id, p.familyId));
  const [today, schedule, sub, timeline, meds, contacts, notes, al, msgs] = await Promise.all([
    getTodayStatus(db, p, now),
    getSchedule(db, p.id),
    getSubscription(db, p.id),
    getTimeline(db, p.id, 20),
    db
      .select()
      .from(medicines)
      .where(eq(medicines.parentId, p.id))
      .orderBy(asc(medicines.sortOrder)),
    db.select().from(emergencyContacts).where(eq(emergencyContacts.parentId, p.id)),
    db
      .select()
      .from(familyNotes)
      .where(eq(familyNotes.parentId, p.id))
      .orderBy(desc(familyNotes.createdAt))
      .limit(10),
    db
      .select()
      .from(alerts)
      .where(eq(alerts.parentId, p.id))
      .orderBy(desc(alerts.createdAt))
      .limit(10),
    db
      .select()
      .from(notifications)
      .where(eq(notifications.parentId, p.id))
      .orderBy(desc(notifications.createdAt))
      .limit(15),
  ]);
  return (
    <>
      <p className="text-sm text-muted">
        <Link href="/admin/families" className="underline">
          Families
        </Link>{" "}
        / {fam?.name}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-heading text-3xl">
          {p.addressAs} · {p.name}
        </h1>
        <div className="flex gap-2">
          <form action={adminCallNowAction.bind(null, p.id)}>
            <Button type="submit" size="sm">
              Call now
            </Button>
          </form>
          <form action={adminPauseAction.bind(null, p.id)}>
            <Button type="submit" size="sm" variant="secondary">
              {p.status === "paused" ? "Resume" : "Pause"}
            </Button>
          </form>
        </div>
      </div>
      {typeof sp.done === "string" && (
        <Callout tone="info">Done: {sp.done.replace(/_/g, " ")}</Callout>
      )}
      <Callout
        tone={today.tone === "danger" ? "danger" : today.tone === "warning" ? "warning" : "info"}
        title={today.headline}
      >
        {today.detail}
      </Callout>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col gap-1 text-base">
          <CardTitle>Setup</CardTitle>
          <p>
            Status: <Badge>{p.status.replace("_", " ")}</Badge>
          </p>
          <p>
            Phone: {formatPhone(p.phoneE164)} · {p.language} · {p.voice} voice
            {p.hearingDifficulty ? " · hard of hearing" : ""}
          </p>
          <p>
            Calls:{" "}
            {schedule
              ? `${schedule.callTime} (${p.timezone}) · days ${schedule.daysOfWeek.join(",")}`
              : "no schedule"}
          </p>
          <p>Plan: {sub ? `${sub.plan.name} · ${sub.sub.status}` : "-"}</p>
          <p>Medicines: {meds.map((m) => `${m.name} (${m.timing})`).join(", ") || "none"}</p>
          <p>
            Enjoys: {p.topicsEnjoyed.join(", ") || "-"} · Avoid: {p.topicsToAvoid.join(", ") || "-"}
          </p>
          <p>
            Alert contacts:{" "}
            {contacts.map((c) => `${c.name} ${formatPhone(c.whatsappE164)}`).join(", ")}
          </p>
          <p className="text-sm text-muted">Health notes are encrypted and not shown here.</p>
        </Card>
        <Card className="flex flex-col gap-2">
          <CardTitle>Notes & alerts</CardTitle>
          <ul className="flex flex-col gap-1 text-sm">
            {notes.map((n) => (
              <li key={n.id}>
                {n.kind === "news" ? "News" : "Next call"}: {n.text}{" "}
                {n.usedAt ? <span className="text-muted">(used)</span> : null}
              </li>
            ))}
            {al.map((a) => (
              <li key={a.id} className={a.severity === "urgent" ? "text-danger" : ""}>
                {a.createdAt.toLocaleDateString("en-IN")} · {a.title} · {a.status}
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <h2 className="font-heading text-xl">Calls</h2>
      <Table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Slot</th>
            <th>Status</th>
            <th>Tries</th>
            <th>Summary</th>
          </tr>
        </thead>
        <tbody>
          {timeline.map(({ checkIn, result }) => (
            <tr key={checkIn.id}>
              <td>{checkIn.localDate}</td>
              <td>{checkIn.slot}</td>
              <td>
                {checkIn.status.replace("_", " ")}
                {result?.redFlag ? " · 🚨" : ""}
              </td>
              <td>{checkIn.attemptsCount}</td>
              <td className="max-w-md">{result?.summaryEn ?? checkIn.lastFailureReason ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      <h2 className="font-heading text-xl">Messages</h2>
      <Table>
        <thead>
          <tr>
            <th>When</th>
            <th>To</th>
            <th>Template</th>
            <th>Channel</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {msgs.map((n) => (
            <tr key={n.id}>
              <td>{formatDayTime(n.createdAt, "Asia/Kolkata")}</td>
              <td>{n.recipientName}</td>
              <td>{n.template}</td>
              <td>{n.channel}</td>
              <td className={n.status === "dead" ? "font-semibold text-danger" : ""}>
                {n.status}
                {n.lastError ? ` · ${n.lastError}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
