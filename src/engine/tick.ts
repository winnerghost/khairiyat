/**
 * The scheduler tick. Runs every minute (Supabase pg_cron → Edge Function
 * in production; an in-process timer in demo mode; a fake clock in the
 * simulation). Every step is idempotent and catches up on missed work, so
 * a skipped or doubled tick is harmless.
 */
import { jobRuns } from "@/db/schema/app";
import { eq } from "drizzle-orm";
import type { EngineDeps } from "./deps";
import { dialDue } from "./dialer";
import { purgeOldTranscripts, sendDigests } from "./digests";
import { acquireLease, releaseLease } from "./lease";
import { dispatchDue } from "./notify";
import { reconcileStuckCalls } from "./reconcile";
import { autoResumePaused, materializeDueCheckIns } from "./scheduler";
import { getSettings } from "./settings";
import { ingestVoiceWebhook, processPendingWebhooks, processWebhookEvent } from "./webhooks";

export interface TickStats {
  ran: boolean;
  mockWebhooks?: number;
  resumed?: number;
  created?: number;
  missed?: number;
  webhooks?: number;
  reconciled?: { checked: number; resolved: number; review: number };
  dial?: { dialed: number; startFailed: number; cancelled: number; capacityLeft: number };
  notifications?: { sent: number; failed: number; dead: number };
  digests?: { daily: number; weekly: number };
  purged?: number;
  durationMs?: number;
  error?: string;
}

/** Ingest + process a webhook in one go (used by the mock pump and the demo routes). */
export async function receiveVoiceWebhook(deps: EngineDeps, rawBody: string, headers: Headers) {
  const res = await ingestVoiceWebhook(deps, rawBody, headers);
  if (res.status === 200 && res.eventId) await processWebhookEvent(deps, res.eventId);
  return res;
}

export async function runTick(
  deps: EngineDeps,
  opts: { holder?: string } = {},
): Promise<TickStats> {
  const started = deps.clock.now();
  const holder = opts.holder ?? `tick-${crypto.randomUUID()}`;
  if (!(await acquireLease(deps.db, "tick", holder, started, 120))) return { ran: false };

  const [run] = await deps.db
    .insert(jobRuns)
    .values({ job: "tick", startedAt: started })
    .returning({ id: jobRuns.id });
  const stats: TickStats = { ran: true };
  try {
    const settings = await getSettings(deps.db);
    if (deps.voice.pump) {
      stats.mockWebhooks = await deps.voice.pump(async (raw, headers) => {
        await receiveVoiceWebhook(deps, raw, headers);
      }, deps.clock.now());
    }
    stats.resumed = await autoResumePaused(deps);
    const m = await materializeDueCheckIns(deps, settings);
    stats.created = m.created;
    stats.missed = m.missed;
    stats.webhooks = await processPendingWebhooks(deps);
    stats.reconciled = await reconcileStuckCalls(deps, settings);
    stats.dial = await dialDue(deps, settings);
    stats.notifications = await dispatchDue(deps, { limit: 100 });
    const now = deps.clock.now();
    if (now.getUTCMinutes() % 15 === 0) stats.digests = await sendDigests(deps, settings);
    if (now.getUTCHours() === 21 && now.getUTCMinutes() === 7)
      stats.purged = await purgeOldTranscripts(deps);
  } catch (error) {
    stats.error = error instanceof Error ? error.message : String(error);
    deps.logger.error("tick failed", { error: stats.error });
  } finally {
    const finished = deps.clock.now();
    stats.durationMs = finished.getTime() - started.getTime();
    if (run) {
      await deps.db
        .update(jobRuns)
        .set({
          finishedAt: finished,
          ok: !stats.error,
          stats: { ...stats },
          error: stats.error ?? null,
        })
        .where(eq(jobRuns.id, run.id));
    }
    await releaseLease(deps.db, "tick", holder);
  }
  return stats;
}
