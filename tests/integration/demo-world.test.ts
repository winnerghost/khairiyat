/**
 * The public demo website builds its demo history in short steps (one per
 * page load) and replays quiet periods the same way. The result must be a
 * complete, consistent demo, and every hard rule must still hold.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { count, sql } from "drizzle-orm";
import { checkIns, families, parents } from "@/db/schema/app";
import { user } from "@/db/schema/auth";
import type { DbHandle } from "@/db/client";
import { continueDemoWorld, demoWorldNeed, startDemoWorld } from "@/sim/demo-data";
import { createTestDb } from "../helpers/db";
import { TEST_KEY } from "../helpers/engine";

const opts = { encryptionKey: TEST_KEY, appUrl: "https://demo.example" };
// A fixed Tuesday morning in India, so calls fall inside 8 am–8 pm.
const NOW = new Date("2026-11-24T05:00:00Z");

describe("hosted demo: the demo world in steps", () => {
  let handle: DbHandle;
  beforeAll(async () => {
    handle = await createTestDb();
  });
  afterAll(async () => {
    await handle.close();
  });

  it("starts empty and asks to be created", async () => {
    expect(await demoWorldNeed(handle.db, NOW, 4000)).toEqual({ need: "start" });
  });

  it("creates the families quickly, then builds the history over several short steps", async () => {
    await startDemoWorld(handle.db, { ...opts, now: NOW, days: 4 });
    const [fams] = await handle.db.select({ n: count() }).from(families);
    expect(fams!.n).toBe(6);

    const first = await demoWorldNeed(handle.db, NOW, 4000);
    expect(first).toMatchObject({ need: "continue", kind: "seed", progress: 0 });

    let steps = 0;
    let lastProgress = -1;
    for (;;) {
      const p = await continueDemoWorld(handle.db, { ...opts, now: NOW, budgetMs: 150 });
      steps++;
      expect(p.kind).toBe("seed");
      if (p.done) break;
      expect(p.progress).toBeGreaterThanOrEqual(lastProgress);
      lastProgress = p.progress;
      expect(steps).toBeLessThan(500);
    }
    expect(steps).toBeGreaterThan(1);
    expect(await demoWorldNeed(handle.db, NOW, 4000)).toEqual({ need: "nothing" });

    const [calls] = await handle.db.select({ n: count() }).from(checkIns);
    expect(calls!.n).toBeGreaterThan(10);
  });

  it("keeps demo logins and every parent after the steps", async () => {
    const emails = (await handle.db.select({ e: user.email }).from(user)).map((r) => r.e);
    expect(emails).toContain("riya@demo.khairiyat.app");
    expect(emails).toContain("admin@demo.khairiyat.app");
    const [ps] = await handle.db.select({ n: count() }).from(parents);
    expect(ps!.n).toBe(7);
  });

  it("asks for one normal tick after a few seconds, and a replay after a quiet hour", async () => {
    const soon = new Date(NOW.getTime() + 10_000);
    expect(await demoWorldNeed(handle.db, soon, 4000)).toEqual({ need: "tick" });
    const later = new Date(NOW.getTime() + 26 * 3600_000);
    const need = await demoWorldNeed(handle.db, later, 4000);
    expect(need).toMatchObject({ need: "continue", kind: "catch_up" });

    let p;
    let steps = 0;
    do {
      p = await continueDemoWorld(handle.db, { ...opts, now: later, budgetMs: 150 });
      steps++;
      expect(steps).toBeLessThan(500);
    } while (!p.done);
    expect(p.kind).toBe("catch_up");
    expect(await demoWorldNeed(handle.db, later, 4000)).toEqual({ need: "nothing" });
  });

  it("never made two calls for the same parent, day and slot, or a call outside 8 am–8 pm", async () => {
    const dupes = await handle.db.execute(sql`
      SELECT parent_id, local_date, slot FROM check_ins
      GROUP BY 1, 2, 3 HAVING count(*) > 1`);
    expect(Array.from(dupes as unknown as unknown[]).length ?? 0).toBe(0);
    const late = await handle.db.execute(sql`
      SELECT a.id FROM call_attempts a
      JOIN check_ins c ON c.id = a.check_in_id
      JOIN parents p ON p.id = c.parent_id
      WHERE extract(hour FROM a.dialed_at AT TIME ZONE p.timezone) NOT BETWEEN 8 AND 19`);
    expect(Array.from(late as unknown as unknown[]).length).toBe(0);
  });
});
