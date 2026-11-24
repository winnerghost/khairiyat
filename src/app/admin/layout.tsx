import Link from "next/link";
import { brand } from "@/config/brand";
import { getEnv } from "@/lib/env";
import { requireAdmin } from "@/server/session";

export const metadata = { title: { default: "Admin", template: `%s · Admin · ${brand.name}` } };

const NAV = [
  ["/admin", "Today"],
  ["/admin/families", "Families"],
  ["/admin/costs", "Costs"],
  ["/admin/failures", "Failures"],
  ["/admin/audit", "Audit"],
  ["/admin/settings", "Settings"],
] as const;

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  const env = getEnv();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      {env.isDemo && (
        <div className="bg-accent/25 px-4 py-2 text-center text-sm">
          Demo data.{" "}
          <Link href="/demo" className="font-semibold underline">
            Demo room
          </Link>{" "}
          ·{" "}
          <Link href="/app" className="underline">
            Family app
          </Link>
        </div>
      )}
      <header className="border-b border-foreground/10 bg-foreground text-background">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <Link href="/admin" className="font-heading text-xl">
            {brand.name} admin
          </Link>
          <nav aria-label="Admin" className="flex flex-wrap gap-1 text-sm">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className="rounded-lg px-2 py-1 hover:bg-background/15">
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
