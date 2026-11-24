import { connection } from "next/server";
import { brand } from "@/config/brand";
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
    return Response.json(
      {
        status: "ok",
        app: brand.name,
        environment: env.APP_ENV,
        demo: env.isDemo,
        modes: env.modes,
        time: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
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
