/**
 * Runtime-agnostic database type. Both PGlite (demo) and postgres-js
 * (production) connections satisfy it, and so does a transaction.
 */
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

export type Schema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
/** Anything you can run queries on. */
export type DbOrTx = Db | Tx;
