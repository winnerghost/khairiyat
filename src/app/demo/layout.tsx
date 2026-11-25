import { DemoWorldGate } from "@/components/demo-world-gate";
import Link from "next/link";
import { notFound } from "next/navigation";
import { brand } from "@/config/brand";
import { getEnv } from "@/lib/env";

export default function DemoLayout({ children }: LayoutProps<"/demo">) {
  const env = getEnv();
  if (!env.isDemo || env.APP_ENV === "production") notFound();
  return (
    <DemoWorldGate>
      <div className="flex min-h-full flex-1 flex-col">
        <header className="border-b border-foreground/10 bg-accent/20">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-3">
            <Link href="/demo" className="font-heading text-xl text-primary">
              {brand.name} demo room
            </Link>
            <nav className="flex gap-1 text-base" aria-label="Demo">
              <Link href="/demo" className="rounded-lg px-2 py-1 hover:bg-foreground/5">
                Controls
              </Link>
              <Link href="/demo/phone" className="rounded-lg px-2 py-1 hover:bg-foreground/5">
                Phone
              </Link>
              <Link href="/demo/inbox" className="rounded-lg px-2 py-1 hover:bg-foreground/5">
                Inbox
              </Link>
              <Link href="/app" className="rounded-lg px-2 py-1 hover:bg-foreground/5">
                Family app
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 py-6">
          {children}
        </main>
      </div>
    </DemoWorldGate>
  );
}
