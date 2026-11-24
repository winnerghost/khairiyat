import { Button } from "@/components/ui/button";
import { Callout, CardTitle } from "@/components/ui/card";
import { Table } from "@/components/admin/stat";
import { formatDayTime } from "@/lib/time";
import { getFailures } from "@/server/admin";
import { requireAdmin } from "@/server/session";
import {
  markReviewedAction,
  reprocessWebhookAction,
  resolveReportAction,
  retryNotificationAction,
} from "../actions";

export const metadata = { title: "Failures" };

const t = (d: Date) => formatDayTime(d, "Asia/Kolkata");

export default async function AdminFailures({ searchParams }: PageProps<"/admin/failures">) {
  const sp = await searchParams;
  const { db } = await requireAdmin();
  const f = await getFailures(db);
  return (
    <>
      <h1 className="font-heading text-3xl">Failures</h1>
      {typeof sp.done === "string" && <Callout tone="success">Done: {sp.done}</Callout>}
      <p className="text-base text-muted">
        Nothing is dropped silently: everything that failed is here, with a retry button.
      </p>

      <CardTitle>Messages ({f.msgs.length})</CardTitle>
      <Table>
        <thead>
          <tr>
            <th>When</th>
            <th>To</th>
            <th>Template</th>
            <th>Channel</th>
            <th>Status</th>
            <th>Error</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {f.msgs.map((n) => (
            <tr key={n.id}>
              <td>{t(n.updatedAt)}</td>
              <td>{n.recipientName}</td>
              <td>{n.template}</td>
              <td>{n.channel}</td>
              <td className={n.status === "dead" ? "font-semibold text-danger" : "text-warning"}>
                {n.status} ({n.attempts})
              </td>
              <td className="max-w-xs">{n.lastError}</td>
              <td>
                <form action={retryNotificationAction.bind(null, n.id)}>
                  <Button type="submit" size="sm" variant="secondary">
                    Retry
                  </Button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>

      <CardTitle>Webhooks ({f.hooks.length})</CardTitle>
      <Table>
        <thead>
          <tr>
            <th>Received</th>
            <th>Provider</th>
            <th>Type</th>
            <th>Status</th>
            <th>Error</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {f.hooks.map((h) => (
            <tr key={h.id}>
              <td>{t(h.receivedAt)}</td>
              <td>{h.provider}</td>
              <td>{h.eventType}</td>
              <td>{h.status}</td>
              <td className="max-w-xs">{h.lastError}</td>
              <td>
                <form action={reprocessWebhookAction.bind(null, h.id)}>
                  <Button type="submit" size="sm" variant="secondary">
                    Reprocess
                  </Button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>

      <CardTitle>Calls that failed or need review ({f.calls.length})</CardTitle>
      <Table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Parent</th>
            <th>Status</th>
            <th>Reason</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {f.calls.map(({ c, name }) => (
            <tr key={c.id}>
              <td>{c.localDate}</td>
              <td>{name}</td>
              <td>{c.status.replace("_", " ")}</td>
              <td className="max-w-xs">{c.lastFailureReason}</td>
              <td>
                <form action={markReviewedAction.bind(null, c.id)}>
                  <Button type="submit" size="sm" variant="secondary">
                    Mark reviewed
                  </Button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>

      <CardTitle>Problem reports from families ({f.reports.length})</CardTitle>
      <Table>
        <thead>
          <tr>
            <th>When</th>
            <th>Parent</th>
            <th>Message</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {f.reports.map(({ r, name }) => (
            <tr key={r.id}>
              <td>{t(r.createdAt)}</td>
              <td>{name}</td>
              <td className="max-w-md">{r.message}</td>
              <td>
                <form action={resolveReportAction.bind(null, r.id)}>
                  <Button type="submit" size="sm" variant="secondary">
                    Resolve
                  </Button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>

      <CardTitle>Failed scheduler ticks ({f.ticks.length})</CardTitle>
      <Table>
        <thead>
          <tr>
            <th>Started</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {f.ticks.map((j) => (
            <tr key={j.id}>
              <td>{t(j.startedAt)}</td>
              <td>{j.error}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
