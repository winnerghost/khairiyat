import type { ReactNode } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { Card, CardTitle } from "@/components/ui/card";
import { brand } from "@/config/brand";
import { moveDemoWorld, type DemoWorldStatus } from "@/server/demo-world";

/**
 * Public demo website only: moves the demo world forward on each visit and,
 * while its history is still being built, shows a progress screen instead
 * of the page. Everywhere else it simply renders the page.
 */
export async function DemoWorldGate({ children }: { children: ReactNode }) {
  const status = await moveDemoWorld();
  if (status.state === "ready") return children;
  return <DemoPreparing status={status} />;
}

function describeTime(minutes: number): string {
  if (minutes < 90) return `${Math.max(1, minutes)} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} hours`;
  return `${Math.round(hours / 24)} days`;
}

function DemoPreparing({ status }: { status: Extract<DemoWorldStatus, { state: "preparing" }> }) {
  const percent = Math.round(status.progress * 100);
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-10">
      <AutoRefresh seconds={2} maxTimes={90} />
      <Card className="flex flex-col gap-3" role="status" aria-live="polite">
        <CardTitle>Getting the demo ready</CardTitle>
        {status.kind === "seed" ? (
          <>
            <p>
              Creating six pretend families and three weeks of their daily calls. The real{" "}
              {brand.name} call engine makes every call, summary and alert, so this takes about a
              minute, only the first time.
            </p>
            <div
              className="h-3 overflow-hidden rounded-full bg-foreground/10"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label="Demo history built"
            >
              <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
            </div>
            <p className="text-sm text-muted">{percent}% done</p>
          </>
        ) : (
          <p>
            Nobody has opened the demo for a while. Replaying the pretend calls of the last{" "}
            {describeTime(status.minutesLeft)}, so today looks real.
          </p>
        )}
        <p className="text-sm text-muted">
          This page updates by itself. If it stops, reload the page.
        </p>
      </Card>
    </div>
  );
}
