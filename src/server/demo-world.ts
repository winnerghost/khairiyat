/**
 * The public demo website (APP_ENV=demo) runs on serverless hosting
 * (Netlify): there is no server process to run the scheduler every few
 * seconds, and a scheduled function every minute would keep the database
 * awake (and use credits) all day. So the demo world moves forward when
 * someone looks at it:
 *
 * - First visit: create the demo families, then build their three weeks of
 *   history in short steps (a few seconds per page load, with a progress
 *   screen), so no request comes near the 60-second function limit.
 * - After a quiet period (15+ minutes): replay the missed time the same way.
 * - Otherwise: one normal engine tick after the page is sent (next/server
 *   `after`), at most every few seconds. Demo-room pages refresh themselves
 *   while a pretend call runs, so calls still finish in about 12 seconds.
 *
 * One "demo-world" lease (with an expiry) makes sure only one request moves
 * the world at a time. The hard rules (no double calls, 8 am–8 pm) are
 * still enforced by the database itself.
 *
 * Netlify limits: https://docs.netlify.com/build/functions/overview/
 */
import "server-only";
import { after, connection } from "next/server";
import { getDb } from "@/db/client";
import { acquireLease, releaseLease } from "@/engine/lease";
import { randomToken } from "@/lib/crypto";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  continueDemoWorld,
  demoWorldNeed,
  startDemoWorld,
  type DemoWorldNeed,
} from "@/sim/demo-data";
import { tickOnce } from "./engine-runner";

export type DemoWorldStatus =
  | { state: "ready" }
  | { state: "preparing"; kind: "seed" | "catch_up"; progress: number; minutesLeft: number };

const LEASE = "demo-world";
const LEASE_SECS = 45;
/** Engine time per request while preparing. Netlify functions stop at 60 s. */
const STEP_BUDGET_MS = 8_000;
/** Same pace as the local ticker. */
const TICK_EVERY_MS = 4_000;
const READY: DemoWorldStatus = { state: "ready" };

/**
 * Call from the layouts of the demo's pages. Returns "preparing" while the
 * history is being built (the layout then shows a progress screen).
 */
export async function moveDemoWorld(): Promise<DemoWorldStatus> {
  if (!getEnv().isHostedDemo) return READY;
  await connection(); // never at build time
  return step({ background: false });
}

/** For pages outside the demo (the landing page): start preparing without making anyone wait. */
export async function warmDemoWorld(): Promise<void> {
  if (!getEnv().isHostedDemo) return;
  await connection();
  after(() => step({ background: true }));
}

async function step({ background }: { background: boolean }): Promise<DemoWorldStatus> {
  const env = getEnv();
  try {
    const db = await getDb();
    const need = await demoWorldNeed(db, new Date(), TICK_EVERY_MS);
    if (need.need === "nothing") return READY;
    if (need.need === "tick") {
      if (background) await tickInBackground();
      else after(tickInBackground);
      return READY;
    }
    const holder = randomToken(9);
    if (!(await acquireLease(db, LEASE, holder, new Date(), LEASE_SECS))) {
      // Another request is building it right now: just show the progress.
      return need.need === "start"
        ? { state: "preparing", kind: "seed", progress: 0, minutesLeft: 0 }
        : { state: "preparing", ...withoutNeed(need) };
    }
    try {
      const opts = { encryptionKey: env.DATA_ENCRYPTION_KEY, appUrl: env.APP_URL };
      if (need.need === "start") {
        const days = Number(process.env.DEMO_SEED_DAYS ?? 21);
        await startDemoWorld(db, { ...opts, now: new Date(), days });
        logger.info("demo world: created the demo families", { days });
      }
      const p = await continueDemoWorld(db, {
        ...opts,
        now: new Date(),
        budgetMs: STEP_BUDGET_MS,
      });
      if (p.done || p.kind === "none") return READY;
      return {
        state: "preparing",
        kind: p.kind,
        progress: p.progress,
        minutesLeft: p.minutesLeft,
      };
    } finally {
      await releaseLease(db, LEASE, holder);
    }
  } catch (error) {
    logger.error("demo world: could not move forward", { error });
    return READY; // show the page anyway; the next visit tries again
  }
}

function withoutNeed(n: Extract<DemoWorldNeed, { need: "continue" }>) {
  return { kind: n.kind, progress: n.progress, minutesLeft: n.minutesLeft };
}

async function tickInBackground(): Promise<void> {
  const db = await getDb();
  const holder = randomToken(9);
  if (!(await acquireLease(db, LEASE, holder, new Date(), LEASE_SECS))) return;
  try {
    await tickOnce();
  } catch (error) {
    logger.error("demo world: tick failed", { error });
  } finally {
    await releaseLease(db, LEASE, holder);
  }
}
