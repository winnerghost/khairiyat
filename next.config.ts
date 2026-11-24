import type { NextConfig } from "next";

/**
 * Notes:
 * - Cache Components is intentionally OFF: almost every page here is
 *   per-family and login-protected, so the classic "dynamic when it reads
 *   cookies" model is simpler and safer. The landing page stays static.
 * - PGlite (the embedded demo database) ships WebAssembly + data files and
 *   must be loaded with Node's own require, not bundled.
 */
const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
