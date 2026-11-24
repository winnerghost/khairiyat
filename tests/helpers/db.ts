/**
 * Fresh, migrated database for each test file.
 * - default: in-memory PGlite (fast, no install)
 * - TEST_DATABASE_URL set: a brand-new database on that Postgres server
 *   (used in CI to test real concurrency), dropped afterwards.
 */
import postgres from "postgres";
import { openDb, type DbHandle } from "@/db/client";

export async function createTestDb(): Promise<DbHandle> {
  const serverUrl = process.env.TEST_DATABASE_URL;
  if (!serverUrl) return openDb({ pgliteDataDir: "memory://" });

  const name = `khairiyat_test_${Math.random().toString(36).slice(2, 10)}`;
  const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  const handle = await openDb({ databaseUrl: url.toString() });
  return {
    ...handle,
    close: async () => {
      await handle.close();
      await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.end();
    },
  };
}
