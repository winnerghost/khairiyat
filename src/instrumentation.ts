/**
 * Runs once when the Next.js server starts.
 *
 * Demo mode only:
 * 1. First run (empty database): create the demo families and their history.
 * 2. Later runs: replay the time the demo wasn't running, so it looks alive.
 * 3. Start the in-process scheduler (every 5 s), so pretend calls happen.
 * Production uses Supabase pg_cron instead and never runs any of this.
 * The public demo website (APP_ENV=demo, serverless) doesn't either: there
 * the demo moves forward when someone visits (src/server/demo-world.ts).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { getEnv } = await import("@/lib/env");
  const env = getEnv();
  if (!env.isDemo || env.APP_ENV === "production" || env.isHostedDemo) return;

  const { logger } = await import("@/lib/logger");
  try {
    const { getDb } = await import("@/db/client");
    const { continueDemoWorld, hasAnyUsers, seedDemo } = await import("@/sim/demo-data");
    const db = await getDb();
    if (process.env.DEMO_AUTO_SEED !== "0" && !(await hasAnyUsers(db))) {
      logger.info("demo: first run, creating demo families (about 20 seconds)…");
      const days = Number(process.env.DEMO_SEED_DAYS ?? 21);
      const r = await seedDemo(db, {
        now: new Date(),
        days,
        encryptionKey: env.DATA_ENCRYPTION_KEY,
        appUrl: env.APP_URL,
      });
      logger.info("demo: ready", { ...r });
    } else {
      // Replays missed time (or finishes a history build that was interrupted).
      const r = await continueDemoWorld(db, {
        now: new Date(),
        encryptionKey: env.DATA_ENCRYPTION_KEY,
        appUrl: env.APP_URL,
      });
      if (r.kind !== "none") logger.info("demo: caught up on missed time", { ...r });
    }
  } catch (error) {
    logger.error("demo: preparing demo data failed", { error });
  }

  if (process.env.DISABLE_LOCAL_TICKER !== "1") {
    const { startLocalTicker } = await import("@/server/engine-runner");
    startLocalTicker(Number(process.env.LOCAL_TICK_MS ?? 5000));
  }
}
