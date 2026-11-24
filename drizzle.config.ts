import { defineConfig } from "drizzle-kit";

/** `npm run db:generate` turns src/db/schema into SQL migrations in drizzle/. */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
});
