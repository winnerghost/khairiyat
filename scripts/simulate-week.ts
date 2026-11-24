/**
 * npm run simulate:week
 *
 * 50 pretend parents, 7 pretend days, in a throwaway in-memory database.
 * Prints a report and exits with an error if any hard rule was broken:
 * no double calls, no calls outside 08:00–20:00, every unreachable parent
 * produced an alert, every red flag alerted within 1 minute, and more.
 *
 *   npm run simulate:week -- 50 7      # parents days
 */
import { openDb } from "@/db/client";
import { runSimulation } from "@/sim/simulate";

async function main() {
  const parents = Number(process.argv[2] ?? 50);
  const days = Number(process.argv[3] ?? 7);
  const handle = await openDb({
    pgliteDataDir: "memory://",
    databaseUrl: process.env.SIM_DATABASE_URL || undefined,
  });
  console.log(`Simulating ${parents} parents for ${days} days…`);
  const report = await runSimulation(handle.db, {
    parents,
    days,
    log: (m) => process.env.SIM_VERBOSE && console.log(m),
  });
  await handle.close();
  const { violations, ...stats } = report;
  console.table(stats);
  if (violations.length) {
    console.error(`\n❌ ${violations.length} rule violations:`);
    for (const v of violations.slice(0, 50)) console.error(" - " + v);
    process.exit(1);
  }
  console.log(
    "\n✅ All hard rules held: no double calls, no quiet-hour calls, every unreachable parent alerted, every red flag alerted within 1 minute, nothing stuck, nothing lost.",
  );
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
