import type { Metadata } from "next";
import Link from "next/link";
import { assistantNameFor, brand } from "@/config/brand";
import { Callout, Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { getTodayStatus } from "@/server/dashboard";
import { listParents } from "@/server/parents";
import { requireMember } from "@/server/session";

export const metadata: Metadata = { title: "Home" };

const dot: Record<string, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-foreground/30",
};

export default async function FamilyHome({ searchParams }: PageProps<"/app">) {
  const sp = await searchParams;
  const { db, family, member } = await requireMember();
  const list = await listParents(db, family.id);
  const now = new Date();
  const statuses = await Promise.all(list.map((p) => getTodayStatus(db, p, now)));

  return (
    <>
      <div>
        <p className="text-base text-muted">Namaste {member.displayName.split(" ")[0]},</p>
        <h1 className="font-heading text-3xl">{family.name}</h1>
      </div>
      {sp.deleted === "1" && (
        <Callout tone="success">Deleted. All of their data has been removed.</Callout>
      )}

      {list.length === 0 ? (
        <Card className="flex flex-col gap-4">
          <h2 className="font-heading text-2xl">Let&apos;s set up the first call</h2>
          <p className="text-lg">
            Tell us about your parent: how {brand.assistantNames.female} should greet them, what
            time to call, and who to alert. It takes about 5 minutes and you can change everything
            later.
          </p>
          <LinkButton href="/app/parents/new" size="lg">
            Add your parent
          </LinkButton>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((p, i) => {
            const s = statuses[i]!;
            return (
              <li key={p.id}>
                <Link
                  href={`/app/parents/${p.id}`}
                  className="flex flex-col gap-1 rounded-2xl border border-foreground/10 bg-surface p-4 shadow-sm hover:border-primary/40"
                >
                  <span className="flex items-center gap-2">
                    <span className={`size-3 rounded-full ${dot[s.tone]}`} aria-hidden="true" />
                    <span className="font-heading text-xl">{p.addressAs}</span>
                    <span className="text-sm text-muted">· {p.name}</span>
                  </span>
                  <span className="text-base" data-testid="home-status">
                    {s.headline}
                  </span>
                  <span className="text-sm text-muted">Called by {assistantNameFor(p.voice)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {list.length > 0 && (
        <LinkButton href="/app/parents/new" variant="secondary">
          + Add another parent
        </LinkButton>
      )}
    </>
  );
}
