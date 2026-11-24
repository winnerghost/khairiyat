import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { brand } from "@/config/brand";
import { invoices } from "@/db/schema/app";
import { getSettings } from "@/engine/settings";
import { requireMember } from "@/server/session";

export const metadata: Metadata = { title: "Invoice" };

/** Printable invoice. GST lines appear only when GST is enabled in admin settings. */
export default async function InvoicePage({ params }: PageProps<"/app/billing/invoices/[id]">) {
  const { id } = await params;
  const { db, family, user } = await requireMember();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [inv] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.familyId, family.id)))
    .limit(1);
  if (!inv) notFound();
  const { gst } = await getSettings(db);
  const fmt = (d: Date | null) =>
    d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "-";
  const base = gst.enabled
    ? Math.round((inv.amountInr * 100) / (100 + gst.ratePercent))
    : inv.amountInr;
  const tax = inv.amountInr - base;
  return (
    <article className="mx-auto flex w-full max-w-xl flex-col gap-4 rounded-2xl border border-foreground/10 bg-surface p-6 print:border-0">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="font-heading text-2xl text-primary">{brand.name}</p>
          {gst.enabled && (
            <p className="text-sm text-muted">
              {gst.legalName}
              <br />
              {gst.address}
              <br />
              GSTIN {gst.gstin}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="font-semibold">{gst.enabled ? "Tax invoice" : "Invoice / receipt"}</p>
          <p className="text-sm">{inv.number}</p>
          <p className="text-sm text-muted">{fmt(inv.createdAt)}</p>
        </div>
      </header>
      <p className="text-base">
        Billed to: {family.name} ({user.email})
      </p>
      <table className="w-full text-base">
        <tbody>
          <tr className="border-b border-foreground/10">
            <td className="py-2">
              {inv.description}
              <br />
              <span className="text-sm text-muted">
                {fmt(inv.periodStart)} – {fmt(inv.periodEnd)}
              </span>
            </td>
            <td className="py-2 text-right">₹{base.toLocaleString("en-IN")}</td>
          </tr>
          {gst.enabled && (
            <tr className="border-b border-foreground/10">
              <td className="py-2">GST @ {gst.ratePercent}%</td>
              <td className="py-2 text-right">₹{tax.toLocaleString("en-IN")}</td>
            </tr>
          )}
          <tr>
            <td className="py-2 font-semibold">Total paid</td>
            <td className="py-2 text-right font-semibold">
              ₹{inv.amountInr.toLocaleString("en-IN")}
            </td>
          </tr>
        </tbody>
      </table>
      {!gst.enabled && (
        <p className="text-sm text-muted">Not registered under GST; no GST charged.</p>
      )}
      <Link href="/app/billing" className="text-primary underline print:hidden">
        ← Back to billing
      </Link>
    </article>
  );
}
