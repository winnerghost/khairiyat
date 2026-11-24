import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "@/db/client";
import { callAttempts, checkIns, families, parents } from "@/db/schema";
import { dbErrorMessage, isUniqueViolation } from "@/db/errors";
import { createTestDb } from "../helpers/db";

async function failure(promise: PromiseLike<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  throw new Error("expected the database to refuse this");
}

let h: DbHandle;

beforeAll(async () => {
  h = await createTestDb();
});
afterAll(async () => {
  await h.close();
});

async function makeParent(status: "active" | "opted_out" = "active", timezone = "Asia/Kolkata") {
  const [fam] = await h.db.insert(families).values({ name: "Test" }).returning();
  const [p] = await h.db
    .insert(parents)
    .values({
      familyId: fam!.id,
      name: "Kamla Devi",
      addressAs: "Ammi",
      phoneE164: "+919876543210",
      status,
      timezone,
    })
    .returning();
  const [c] = await h.db
    .insert(checkIns)
    .values({
      parentId: p!.id,
      localDate: "2026-11-24",
      slot: "daily",
      scheduledFor: new Date("2026-11-24T04:00:00Z"),
    })
    .returning();
  return { parent: p!, checkIn: c! };
}

function attempt(parentId: string, checkInId: string, dialedAt: Date, attemptNo = 1) {
  return h.db.insert(callAttempts).values({
    parentId,
    checkInId,
    attemptNo,
    provider: "mock",
    dialedAt,
  });
}

describe("database guard rails", () => {
  it("refuses a second check-in for the same parent, date and slot", async () => {
    const { parent } = await makeParent();
    const error = await failure(
      h.db.insert(checkIns).values({
        parentId: parent.id,
        localDate: "2026-11-24",
        slot: "daily",
        scheduledFor: new Date("2026-11-24T04:00:00Z"),
      }),
    );
    expect(isUniqueViolation(error)).toBe(true);
  });

  it("allows a dial at 09:30 IST", async () => {
    const { parent, checkIn } = await makeParent();
    // 04:00 UTC = 09:30 IST
    await expect(
      attempt(parent.id, checkIn.id, new Date("2026-11-24T04:00:00Z")),
    ).resolves.toBeDefined();
  });

  it("refuses a dial at 07:59 IST and at 20:00 IST", async () => {
    const { parent, checkIn } = await makeParent();
    expect(
      dbErrorMessage(
        await failure(attempt(parent.id, checkIn.id, new Date("2026-11-24T02:29:00Z"))),
      ),
    ).toMatch(/outside 08:00-20:00/);
    expect(
      dbErrorMessage(
        await failure(attempt(parent.id, checkIn.id, new Date("2026-11-24T14:30:00Z"), 2)),
      ),
    ).toMatch(/outside 08:00-20:00/);
  });

  it("uses the parent's own time zone (London, with daylight saving)", async () => {
    const { parent, checkIn } = await makeParent("active", "Europe/London");
    // 07:30 UTC in July = 08:30 BST → allowed
    await expect(
      attempt(parent.id, checkIn.id, new Date("2026-07-15T07:30:00Z")),
    ).resolves.toBeDefined();
    // 07:30 UTC in January = 07:30 GMT → refused
    expect(
      dbErrorMessage(
        await failure(attempt(parent.id, checkIn.id, new Date("2026-01-15T07:30:00Z"), 2)),
      ),
    ).toMatch(/outside/);
  });

  it("refuses to dial a parent who opted out", async () => {
    const { parent, checkIn } = await makeParent("opted_out");
    expect(
      dbErrorMessage(
        await failure(attempt(parent.id, checkIn.id, new Date("2026-11-24T04:00:00Z"))),
      ),
    ).toMatch(/opted out/);
  });

  it("refuses the same attempt number twice", async () => {
    const { parent, checkIn } = await makeParent();
    await attempt(parent.id, checkIn.id, new Date("2026-11-24T04:00:00Z"));
    expect(
      isUniqueViolation(
        await failure(attempt(parent.id, checkIn.id, new Date("2026-11-24T04:01:00Z"))),
      ),
    ).toBe(true);
  });

  it("has row level security enabled on every table", async () => {
    const rows = await h.db.execute<{ tablename: string; rowsecurity: boolean }>(
      sql`select tablename, rowsecurity from pg_tables where schemaname = 'public'`,
    );
    const list = (Array.isArray(rows) ? rows : (rows as { rows: unknown[] }).rows) as {
      tablename: string;
      rowsecurity: boolean;
    }[];
    const app = list.filter((r) => !r.tablename.startsWith("__drizzle"));
    expect(app.length).toBeGreaterThan(20);
    expect(app.filter((r) => !r.rowsecurity).map((r) => r.tablename)).toEqual([]);
  });
});
