/**
 * Database connection (Node only: website, scripts, tests).
 *
 * - DATABASE_URL set   → real Postgres (Supabase in production)
 * - DATABASE_URL empty → PGlite: real Postgres running inside Node, stored in
 *                        .demo-data/pglite (or in memory with PGLITE_DATA_DIR=memory://)
 *
 * Migrations in drizzle/ run automatically on first use. The call engine
 * never imports this file: it receives a `Db` so it can also run on Deno.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { logger } from "@/lib/logger";
import { ensureReferenceData } from "./bootstrap";
import * as schema from "./schema";
import type { Db } from "./types";

export interface DbHandle {
  db: Db;
  kind: "pglite" | "postgres";
  close: () => Promise<void>;
}

export interface OpenDbOptions {
  databaseUrl?: string;
  /** PGlite directory, or "memory://" for a throwaway in-memory database. */
  pgliteDataDir?: string;
  migrate?: boolean;
}

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

export async function openDb(options: OpenDbOptions = {}): Promise<DbHandle> {
  const shouldMigrate = options.migrate ?? true;

  if (options.databaseUrl) {
    const client = postgres(options.databaseUrl, {
      // Supabase's pooler (transaction mode) does not support prepared statements.
      prepare: false,
      max: 5,
      onnotice: () => {},
    });
    const db = drizzlePostgres(client, { schema });
    if (shouldMigrate) {
      await migratePostgres(db, { migrationsFolder: MIGRATIONS_FOLDER });
      await ensureReferenceData(db as unknown as Db);
    }
    return { db: db as unknown as Db, kind: "postgres", close: () => client.end() };
  }

  const dataDir = options.pgliteDataDir ?? path.join(process.cwd(), ".demo-data", "pglite");
  if (!dataDir.startsWith("memory://")) mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzlePglite(client, { schema });
  if (shouldMigrate) {
    await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER });
    await ensureReferenceData(db as unknown as Db);
  }
  return { db: db as unknown as Db, kind: "pglite", close: () => client.close() };
}

// One shared connection per server process (survives dev hot-reloads).
const globalForDb = globalThis as unknown as { __khairiyatDb?: Promise<DbHandle> };

export function getDbHandle(): Promise<DbHandle> {
  if (!globalForDb.__khairiyatDb) {
    const databaseUrl = process.env.DATABASE_URL?.trim() || undefined;
    const pgliteDataDir = process.env.PGLITE_DATA_DIR?.trim() || undefined;
    globalForDb.__khairiyatDb = openDb({ databaseUrl, pgliteDataDir }).catch((error: unknown) => {
      globalForDb.__khairiyatDb = undefined; // allow a retry on the next request
      logger.error("database: failed to open", { error });
      throw error;
    });
  }
  return globalForDb.__khairiyatDb;
}

export async function getDb(): Promise<Db> {
  return (await getDbHandle()).db;
}
