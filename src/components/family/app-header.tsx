import Link from "next/link";
import { logoutAction } from "@/app/(auth)/actions";
import { brand } from "@/config/brand";

export function AppHeader({
  isAdmin,
  demo,
  publicDemo = false,
}: {
  isAdmin: boolean;
  demo: boolean;
  /** The public demo website: anyone can see demo data. */
  publicDemo?: boolean;
}) {
  return (
    <>
      {demo && (
        <div className="bg-accent/25 px-4 py-2 text-center text-sm">
          Demo mode: calls, WhatsApp and payments are simulated.{" "}
          {publicDemo && "Public demo: please don't enter real names or numbers. "}
          <Link href="/demo" className="font-semibold underline">
            Open the demo control room
          </Link>
        </div>
      )}
      <header className="border-b border-foreground/10 bg-surface/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/app" className="font-heading text-2xl text-primary">
            {brand.name}
          </Link>
          <nav aria-label="Main" className="flex items-center gap-0.5 text-base sm:gap-1">
            <Link href="/app" className="rounded-lg px-2 py-2 hover:bg-foreground/5">
              Home
            </Link>
            <Link href="/app/billing" className="rounded-lg px-2 py-2 hover:bg-foreground/5">
              Billing
            </Link>
            <Link href="/app/settings" className="rounded-lg px-2 py-2 hover:bg-foreground/5">
              Settings
            </Link>
            <Link
              href="/app/help"
              className="hidden rounded-lg px-2 py-2 hover:bg-foreground/5 sm:inline"
            >
              Help
            </Link>
            {isAdmin && (
              <Link
                href="/admin"
                className="rounded-lg px-2 py-2 font-semibold text-primary hover:bg-foreground/5"
              >
                Admin
              </Link>
            )}
            <form action={logoutAction} className="hidden sm:block">
              <button
                type="submit"
                className="rounded-lg px-2 py-2 text-muted hover:bg-foreground/5"
              >
                Log out
              </button>
            </form>
          </nav>
        </div>
      </header>
    </>
  );
}
