/**
 * Copy new migrations from drizzle/ to netlify/database/migrations/.
 *
 * Netlify Database applies migrations from that folder on every deploy and
 * tracks their checksums, so an applied migration must never change
 * (https://docs.netlify.com/build/data-and-storage/netlify-database/).
 * Drizzle stays the source of truth; this only adds missing copies and
 * fails loudly if an existing copy differs. Runs after `npm run db:generate`.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const from = path.join(process.cwd(), "drizzle");
const to = path.join(process.cwd(), "netlify", "database", "migrations");
mkdirSync(to, { recursive: true });

let added = 0;
for (const file of readdirSync(from)
  .filter((f) => f.endsWith(".sql"))
  .sort()) {
  const source = path.join(from, file);
  const target = path.join(to, file);
  if (!existsSync(target)) {
    copyFileSync(source, target);
    added++;
    console.log(`netlify migrations: added ${file}`);
  } else if (readFileSync(source, "utf8") !== readFileSync(target, "utf8")) {
    console.error(
      `netlify migrations: ${file} differs from drizzle/${file}. Applied migrations must ` +
        `never change: write a new migration instead.`,
    );
    process.exit(1);
  }
}
console.log(`netlify migrations: in sync (${added} added)`);
