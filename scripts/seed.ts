/**
 * npm run seed: wipe the local demo database and create realistic demo
 * families with a few weeks of call history (made by the real engine).
 *
 *   npm run seed            # 21 days of history
 *   npm run seed -- 7       # 7 days (faster)
 */
import { openDb } from "@/db/client";
import { getEnv } from "@/lib/env";
import { seedDemo } from "@/sim/demo-data";

async function main() {
  const env = getEnv();
  if (env.APP_ENV === "production") throw new Error("Refusing to seed demo data in production.");
  const days = Number(process.argv[2] ?? process.env.DEMO_SEED_DAYS ?? 21);
  const handle = await openDb({
    databaseUrl: process.env.DATABASE_URL || undefined,
    pgliteDataDir: process.env.PGLITE_DATA_DIR || undefined,
  });
  const started = Date.now();
  console.log(`Seeding demo data (${days} days of history). This takes about a minute…`);
  const res = await seedDemo(handle.db, {
    now: new Date(),
    days,
    encryptionKey: env.DATA_ENCRYPTION_KEY,
    appUrl: env.APP_URL,
  });
  console.log(
    `Done in ${Math.round((Date.now() - started) / 1000)}s: ${res.families} families, ${res.parents} parents, ${res.ticks} engine ticks.`,
  );
  console.log(
    "Log in at http://localhost:3000/login with the 'Open the Sharma family demo' button.",
  );
  await handle.close();
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
