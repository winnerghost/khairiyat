import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Netlify Database applies netlify/database/migrations on deploy. They must be
// exact copies of drizzle/ (run `npm run db:generate`, which syncs them).
const drizzleDir = path.join(process.cwd(), "drizzle");
const netlifyDir = path.join(process.cwd(), "netlify", "database", "migrations");
const sql = (dir: string) =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

describe("Netlify Database migrations", () => {
  it("has the same files as drizzle/", () => {
    expect(sql(netlifyDir)).toEqual(sql(drizzleDir));
  });

  it("are byte-for-byte copies", () => {
    for (const file of sql(drizzleDir)) {
      expect(readFileSync(path.join(netlifyDir, file), "utf8"), file).toBe(
        readFileSync(path.join(drizzleDir, file), "utf8"),
      );
    }
  });

  it("use names Netlify accepts (<number>_<slug>, slug a-z 0-9 _ -)", () => {
    for (const file of sql(netlifyDir)) {
      expect(file).toMatch(/^\d+_[a-z0-9_-]+\.sql$/);
    }
  });
});
