"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Friendly error page. Details go to the server logs, never to the screen. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("page error", error.digest ?? "");
  }, [error]);
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-16 text-center">
      <h1 className="font-heading text-3xl">Something went wrong</h1>
      <p className="text-lg text-muted">
        Sorry about that. Your parent&apos;s calls and alerts are not affected. Please try again.
      </p>
      {error.digest && <p className="text-sm text-muted">Reference: {error.digest}</p>}
      <div className="flex justify-center gap-3">
        <button
          onClick={reset}
          className="rounded-xl bg-primary px-4 py-2.5 font-semibold text-primary-foreground"
        >
          Try again
        </button>
        <Link
          href="/app"
          className="rounded-xl border border-foreground/15 px-4 py-2.5 font-semibold"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
