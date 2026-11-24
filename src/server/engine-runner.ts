/**
 * Runs the call engine inside the Node server (demo mode, local dev, and
 * the simple self-hosted setup). In production on Supabase the same engine
 * code runs in Edge Functions instead (see supabase/functions).
 */
import { getDb } from "@/db/client";
import type { Db } from "@/db/types";
import { systemClock } from "@/engine/clock";
import type { EngineDeps } from "@/engine/deps";
import { runTick, type TickStats } from "@/engine/tick";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getEmailProvider, getVoiceProvider, getWhatsAppProvider } from "./providers";

const globalForTicker = globalThis as unknown as {
  __khairiyatTicker?: ReturnType<typeof setInterval>;
  __khairiyatTickerPaused?: boolean;
};

/** Pause the local ticker (e.g. while the demo data is being rebuilt). */
export function pauseLocalTicker(): void {
  globalForTicker.__khairiyatTickerPaused = true;
}

export function resumeLocalTicker(): void {
  globalForTicker.__khairiyatTickerPaused = false;
}

export async function buildEngineDeps(db?: Db): Promise<EngineDeps> {
  const env = getEnv();
  const database = db ?? (await getDb());
  return {
    db: database,
    clock: systemClock,
    voice: getVoiceProvider(database, systemClock),
    whatsapp: getWhatsAppProvider(database, systemClock),
    email: getEmailProvider(database, systemClock),
    logger: logger.child({ component: "engine" }),
    appUrl: env.APP_URL,
    encryptionKey: env.DATA_ENCRYPTION_KEY,
  };
}

export async function tickOnce(): Promise<TickStats> {
  if (globalForTicker.__khairiyatTickerPaused) return { ran: false };
  return runTick(await buildEngineDeps());
}

/** Run a tick soon (after "Call now"), without making the user wait for it. */
export async function kickEngine(): Promise<void> {
  try {
    await tickOnce();
  } catch (error) {
    logger.error("engine: kick failed", { error });
  }
}

/**
 * Demo / local only: tick every few seconds inside the server process so
 * simulated calls finish quickly. Production uses pg_cron instead.
 */
export function startLocalTicker(intervalMs = 5000): void {
  if (globalForTicker.__khairiyatTicker) return;
  let running = false;
  globalForTicker.__khairiyatTicker = setInterval(() => {
    if (running || globalForTicker.__khairiyatTickerPaused) return;
    running = true;
    tickOnce()
      .catch((error: unknown) => logger.error("engine: local tick failed", { error }))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  logger.info("engine: local ticker started", { intervalMs });
}
