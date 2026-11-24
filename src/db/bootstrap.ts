/**
 * Reference data every database needs (plans, add-ons). Idempotent:
 * existing rows (possibly edited in admin) are never overwritten.
 */
import { DEFAULT_ADD_ONS, DEFAULT_PLANS } from "@/config/defaults";
import { addOns, plans } from "./schema/app";
import type { DbOrTx } from "./types";

export async function ensureReferenceData(db: DbOrTx): Promise<void> {
  await db
    .insert(plans)
    .values(DEFAULT_PLANS.map((p) => ({ ...p })))
    .onConflictDoNothing({ target: plans.id });
  await db.insert(addOns).values(DEFAULT_ADD_ONS).onConflictDoNothing({ target: addOns.id });
}
