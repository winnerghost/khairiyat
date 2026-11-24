import { connection } from "next/server";
import { desc, eq } from "drizzle-orm";
import { brand } from "@/config/brand";
import { getDb } from "@/db/client";
import { jobRuns } from "@/db/schema/app";
import { EnvConfigError, getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Public health check for uptime monitors.
 *
 * Shows only coarse status, never secrets or personal data. Detailed
 * health (scheduler heartbeat, failed jobs, provider status) lives on the
 * admin health page. From Phase 2 this endpoint also reports a stale
 * scheduler heartbeat as unhealthy.
 */
export async function GET() {
  await connection(); // always run at request time, never prerendered

  try {
    const env = getEnv();
    const db = await getDb();
    const [last] = await db
      .select({ startedAt: jobRuns.startedAt, ok: jobRuns.ok })
      .from(jobRuns)
      .where(eq(jobRuns.job, "tick"))
      .orderBy(desc(jobRuns.startedAt))
      .limit(1);
    const ageSecs = last ? Math.round((Date.now() - last.startedAt.getTime()) / 1000) : null;
    // A scheduler that hasn't ticked for 3 minutes is an outage: answer 503 so uptime monitors alert.
    const schedulerOk = ageSecs !== null && ageSecs <= 180;
    return Response.json(
      {
        status: schedulerOk ? "ok" : "scheduler_stale",
        app: brand.name,
        environment: env.APP_ENV,
        demo: env.isDemo,
        modes: env.modes,
        scheduler: { lastTickSecondsAgo: ageSecs, lastTickOk: last?.ok ?? null },
        time: new Date().toISOString(),
      },
      { status: schedulerOk ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof EnvConfigError) {
      logger.error("health: configuration invalid", { problems: error.problems });
    } else {
      logger.error("health: unexpected error", { error });
    }
    return Response.json(
      { status: "config_error", app: brand.name, time: new Date().toISOString() },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
