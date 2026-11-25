/**
 * Database connection (Node only: website, scripts, tests).
 *
 * - DATABASE_URL set   → real Postgres (Supabase in production)
 * - NETLIFY_DB_URL set → the site's Netlify Database (public demo website).
 *                        Netlify applies the migrations on deploy from
 *                        netlify/database/migrations (copies of drizzle/,
 *                        kept identical by `npm run db:generate` and a test),
 *                        so the app must not run its own migrator there:
 *                        https://docs.netlify.com/build/data-and-storage/netlify-database/
 * - both empty         → PGlite: real Postgres running inside Node, stored in
 *                        ~/.khairiyat/demo-data (or in memory with PGLITE_DATA_DIR=memory://).
 *                        It lives outside the project folder on purpose: the dev
 *                        server watches the project and would reload on every write.
 *
 * Migrations in drizzle/ run automatically on first use. The call engine
 * never imports this file: it receives a `Db` so it can also run on Deno.
 */
import { mkdirSync } from "node:fs";
import os from "node:os";
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
  /** Run drizzle/ migrations and insert reference data (default true). */
  migrate?: boolean;
  /** Insert reference data without migrating (the host applies migrations). */
  referenceDataOnly?: boolean;
}

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");
export const DEFAULT_PGLITE_DIR = path.join(os.homedir(), ".khairiyat", "demo-data");

export async function openDb(options: OpenDbOptions = {}): Promise<DbHandle> {
  const shouldMigrate = options.migrate ?? true;

  if (options.databaseUrl) {
    const client = postgres(options.databaseUrl, {
      // Supabase's pooler (transaction mode) does not support prepared statements.
      prepare: false,
      max: 5,
      // Serverless instances sleep: drop idle connections instead of keeping them.
      idle_timeout: 20,
      connect_timeout: 15,
      onnotice: () => {},
    });
    const db = drizzlePostgres(client, { schema });
    if (options.referenceDataOnly) {
      await ensureReferenceData(db as unknown as Db);
    } else if (shouldMigrate) {
      await migratePostgres(db, { migrationsFolder: MIGRATIONS_FOLDER });
      await ensureReferenceData(db as unknown as Db);
    }
    return { db: db as unknown as Db, kind: "postgres", close: () => client.end() };
  }

  const dataDir = options.pgliteDataDir ?? DEFAULT_PGLITE_DIR;
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
    const ownUrl = process.env.DATABASE_URL?.trim() || undefined;
    const netlifyUrl = process.env.NETLIFY_DB_URL?.trim() || undefined;
    const pgliteDataDir = process.env.PGLITE_DATA_DIR?.trim() || undefined;
    globalForDb.__khairiyatDb = openDb({
      databaseUrl: ownUrl ?? netlifyUrl,
      pgliteDataDir,
      referenceDataOnly: !ownUrl && !!netlifyUrl,
    }).catch((error: unknown) => {
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
