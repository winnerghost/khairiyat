"use client";

/** Last-resort error page (when even the root layout fails). */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          padding: 32,
          background: "#FBF6EE",
          color: "#2B2118",
        }}
      >
        <h1>Something went wrong</h1>
        <p>Your parent&apos;s calls and alerts are not affected. Please try again.</p>
        <button onClick={reset}>Try again</button>
      </body>
    </html>
  );
}
