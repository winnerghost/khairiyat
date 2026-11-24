import { desc } from "drizzle-orm";
import { Table } from "@/components/admin/stat";
import { auditLogs } from "@/db/schema/app";
import { formatDayTime } from "@/lib/time";
import { requireAdmin } from "@/server/session";

export const metadata = { title: "Audit log" };

export default async function AdminAudit() {
  const { db } = await requireAdmin();
  const rows = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(200);
  return (
    <>
      <h1 className="font-heading text-3xl">Audit log</h1>
      <p className="text-base text-muted">Every admin action and settings change.</p>
      <Table>
        <thead>
          <tr>
            <th>When</th>
            <th>Who</th>
            <th>Action</th>
            <th>Target</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{formatDayTime(r.createdAt, "Asia/Kolkata")}</td>
              <td>{r.actorLabel}</td>
              <td>{r.action}</td>
              <td>
                {r.targetType} {r.targetId?.slice(0, 8)}
              </td>
              <td className="max-w-sm font-mono text-xs">
                {JSON.stringify(r.details).slice(0, 200)}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="text-muted">
                No admin actions yet.
              </td>
            </tr>
          )}
        </tbody>
      </Table>
    </>
  );
}
