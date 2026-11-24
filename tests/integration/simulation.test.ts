import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "@/db/client";
import { runSimulation } from "@/sim/simulate";
import { createTestDb } from "../helpers/db";

let h: DbHandle;
beforeAll(async () => {
  h = await createTestDb();
});
afterAll(async () => {
  await h.close();
});

describe("virtual days (small version of npm run simulate:week)", () => {
  it("keeps every hard rule with 12 parents over 2 days of chaos", async () => {
    const report = await runSimulation(h.db, { parents: 12, days: 2, seed: 7 });
    expect(report.violations).toEqual([]);
    expect(report.completed).toBeGreaterThan(10);
    expect(report.maxConcurrentCalls).toBeLessThanOrEqual(4);
  }, 180_000);
});
