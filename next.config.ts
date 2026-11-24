import type { NextConfig } from "next";

/**
 * Notes:
 * - Cache Components is intentionally OFF: almost every page here is
 *   per-family and login-protected, so the classic "dynamic when it reads
 *   cookies" model is simpler and safer.
 * - PGlite (the embedded demo database) ships WebAssembly + data files and
 *   must be loaded with Node's own require, not bundled.
 * - Security headers below apply to every page.
 */
const isDev = process.env.NODE_ENV !== "production";
// Only force HTTPS when the site is really served over HTTPS (not local `next start`).
const isHttps = (process.env.APP_URL ?? "").startsWith("https://");

// Content Security Policy. Next.js needs inline scripts for hydration
// (no nonce middleware yet); everything else is locked to our own origin,
// plus ElevenLabs for the in-browser voice demo and Google sign-in.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' blob:${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  `connect-src 'self' https://*.elevenlabs.io wss://*.elevenlabs.io${isDev ? " ws: wss:" : ""}`,
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self' https://accounts.google.com",
  ...(isHttps ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Microphone only for our own pages (the "talk to the assistant" demo).
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=()" },
  ...(isHttps
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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
