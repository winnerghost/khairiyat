import Link from "next/link";
import { Badge } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { Table } from "@/components/admin/stat";
import { listFamilies } from "@/server/admin";
import { requireAdmin } from "@/server/session";

export const metadata = { title: "Families" };

export default async function AdminFamilies({ searchParams }: PageProps<"/admin/families">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const { db } = await requireAdmin();
  const fams = await listFamilies(db, q);
  return (
    <>
      <h1 className="font-heading text-3xl">Families and parents</h1>
      <form className="flex gap-2" role="search">
        <label htmlFor="q" className="sr-only">
          Search
        </label>
        <Input id="q" name="q" defaultValue={q} placeholder="Search family, email or parent name" />
      </form>
      <Table>
        <thead>
          <tr>
            <th>Family</th>
            <th>Parent</th>
            <th>Status</th>
            <th>Plan</th>
            <th>Trial ends</th>
            <th>Last call</th>
          </tr>
        </thead>
        <tbody>
          {fams.flatMap(({ f, ownerEmail, parents }) =>
            (parents.length ? parents : [null]).map((x, i) => (
              <tr key={`${f.id}-${x?.p.id ?? "none"}`}>
                <td>
                  {i === 0 ? (
                    <>
                      <span className="font-semibold">{f.name}</span>
                      <br />
                      <span className="text-muted">{ownerEmail}</span>
                    </>
                  ) : null}
                </td>
                <td>
                  {x ? (
                    <Link href={`/admin/parents/${x.p.id}`} className="text-primary underline">
                      {x.p.addressAs} · {x.p.name}
                    </Link>
                  ) : (
                    <span className="text-muted">no parent yet</span>
                  )}
                </td>
                <td>
                  {x && (
                    <Badge
                      tone={
                        x.p.status === "active"
                          ? "success"
                          : x.p.status === "opted_out" || x.p.status === "consent_refused"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {x.p.status.replace("_", " ")}
                    </Badge>
                  )}
                </td>
                <td>{x?.plan ? `${x.plan.name} · ${x.sub?.status}` : "-"}</td>
                <td>
                  {x?.sub?.status === "trialing" && x.sub.trialEndsAt
                    ? x.sub.trialEndsAt.toLocaleDateString("en-IN")
                    : "-"}
                </td>
                <td>
                  {x?.last ? `${x.last.localDate} · ${x.last.status.replace("_", " ")}` : "-"}
                </td>
              </tr>
            )),
          )}
        </tbody>
      </Table>
    </>
  );
}
