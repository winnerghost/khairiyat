/**
 * One tick at a time. A lease row with an expiry: whoever holds an
 * unexpired lease runs; a crashed holder's lease expires on its own.
 */
import { and, eq, lt, sql } from "drizzle-orm";
import { engineLeases } from "@/db/schema/app";
import type { DbOrTx } from "@/db/types";

export async function acquireLease(
  db: DbOrTx,
  name: string,
  holder: string,
  now: Date,
  ttlSecs: number,
): Promise<boolean> {
  const expiresAt = new Date(now.getTime() + ttlSecs * 1000);
  const rows = await db
    .insert(engineLeases)
    .values({ name, holder, expiresAt })
    .onConflictDoUpdate({
      target: engineLeases.name,
      set: { holder, expiresAt },
      setWhere: lt(engineLeases.expiresAt, now),
    })
    .returning({ holder: engineLeases.holder });
  return rows[0]?.holder === holder;
}

export async function releaseLease(db: DbOrTx, name: string, holder: string): Promise<void> {
  await db
    .update(engineLeases)
    .set({ expiresAt: sql`to_timestamp(0)` })
    .where(and(eq(engineLeases.name, name), eq(engineLeases.holder, holder)));
}
