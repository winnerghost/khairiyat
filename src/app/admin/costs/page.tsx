import { Callout } from "@/components/ui/card";
import { Stat, Table } from "@/components/admin/stat";
import { getSettings } from "@/engine/settings";
import { getCosts } from "@/server/admin";
import { requireAdmin } from "@/server/session";

export const metadata = { title: "Costs" };

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export default async function AdminCosts() {
  const { db } = await requireAdmin();
  const settings = await getSettings(db);
  const c = await getCosts(db, new Date(), settings);
  const r = settings.cost_rates;
  const margin = c.totals.mrr - c.totals.cost;
  const over = c.rows.filter((x) => x.overBudget.length);
  return (
    <>
      <h1 className="font-heading text-3xl">Costs and margins (this month)</h1>
      <p className="text-base text-muted">
        Rates (edit in Settings): AI ₹{r.aiPerMinInr}/min + platform ₹{r.platformPerMinInr}/min +
        telephony ₹{r.telephonyPerMinInr}/min = ₹{c.perMin.toFixed(2)}/min · WhatsApp ₹
        {r.whatsappPerMessageInr}/message. Costs are estimates from call minutes and messages sent.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Monthly revenue (MRR)" value={inr(c.totals.mrr)} />
        <Stat label="Cost so far" value={inr(c.totals.cost)} />
        <Stat
          label="Margin (MRR − cost)"
          value={inr(margin)}
          tone={margin < 0 ? "danger" : "success"}
        />
        <Stat label="Call minutes" value={Math.round(c.totals.minutes)} />
      </div>
      <p className="text-sm text-muted">
        Collected this month: {inr(c.collectedThisMonth)} · WhatsApp messages: {c.totals.whatsapp}
      </p>
      {over.length > 0 && (
        <Callout tone="warning" title="Over minute budget">
          {over.map((x) => `${x.familyName}: ${x.overBudget.join("; ")}`).join(" · ")}
        </Callout>
      )}
      <Table>
        <thead>
          <tr>
            <th>Family</th>
            <th>Call attempts</th>
            <th>Minutes</th>
            <th>Avg min/attempt</th>
            <th>WhatsApp</th>
            <th>Cost</th>
            <th>MRR</th>
            <th>Margin</th>
          </tr>
        </thead>
        <tbody>
          {c.rows.map((x) => (
            <tr key={x.familyId}>
              <td>{x.familyName}</td>
              <td>{x.calls}</td>
              <td>{x.minutes}</td>
              <td>{x.calls ? (x.minutes / x.calls).toFixed(1) : "-"}</td>
              <td>{x.whatsapp}</td>
              <td>{inr(x.costInr)}</td>
              <td>{inr(x.mrrInr)}</td>
              <td className={x.marginInr < 0 ? "font-semibold text-danger" : "text-success"}>
                {inr(x.marginInr)}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
