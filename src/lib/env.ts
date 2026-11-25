/**
 * Environment configuration.
 *
 * Rules (simple version):
 * - Leave every provider key empty and the app runs in DEMO MODE: an
 *   embedded database, mock calls, mock WhatsApp, mock email, mock payments.
 * - A provider switches to "real" only when ALL of its keys are present.
 * - If only SOME of a provider's keys are present, we refuse to start.
 *   A half-configured WhatsApp must never silently fall back to a mock,
 *   because that would drop real alerts.
 * - In production we also refuse to start with demo secrets or mock
 *   providers (unless ALLOW_DEMO_PROVIDERS_IN_PRODUCTION=true).
 * - APP_ENV=demo is the PUBLIC DEMO WEBSITE (e.g. on Netlify): demo logins
 *   and the demo room work, every provider must be the mock (a public demo
 *   must never call or message a real person), and it needs real secrets,
 *   https and a shared database, like production.
 *
 * This module has no Node-only imports so the call engine can use it on
 * Supabase Edge Functions (Deno) too: pass `Deno.env.toObject()` to parseEnv.
 */
import { z } from "zod";

/** Clearly fake key used only in demo/test. Production refuses to boot with it. */
export const DEMO_ENCRYPTION_KEY = "ZGVtby1rZXktZGVtby1rZXktZGVtby1rZXktZGVtbyE="; // base64 of a 32-byte demo string
export const DEMO_AUTH_SECRET = "demo-auth-secret-do-not-use-in-production-0000";
export const DEMO_CRON_SECRET = "demo-cron-secret";

const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const booleanFlag = z
  .string()
  .trim()
  .optional()
  .transform((v) => v === "true" || v === "1");

const rawSchema = z.object({
  /** development / test: your laptop and CI. demo: the public demo website. production: real families. */
  APP_ENV: z.enum(["development", "test", "demo", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3000"),
  ALLOW_DEMO_PROVIDERS_IN_PRODUCTION: booleanFlag,

  // Database (empty = embedded demo database)
  DATABASE_URL: optionalString,
  /**
   * Set by Netlify itself when the site has a Netlify Database
   * (https://docs.netlify.com/build/data-and-storage/netlify-database/).
   * Used when DATABASE_URL is empty. Its migrations are applied by Netlify
   * on deploy from netlify/database/migrations, not by the app.
   */
  NETLIFY_DB_URL: optionalString,

  // Secrets for our own app
  DATA_ENCRYPTION_KEY: optionalString,
  BETTER_AUTH_SECRET: optionalString,
  CRON_SECRET: optionalString,
  ADMIN_EMAILS: optionalString,

  // Google sign-in (optional even in production)
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,

  // Voice: ElevenLabs Agents
  ELEVENLABS_API_KEY: optionalString,
  ELEVENLABS_AGENT_ID: optionalString,
  ELEVENLABS_PHONE_NUMBER_ID: optionalString,
  ELEVENLABS_WEBHOOK_SECRET: optionalString,
  ELEVENLABS_TELEPHONY: z.enum(["twilio", "sip_trunk"]).default("twilio"),
  /** Optional: a regional API host, e.g. https://api.in.residency.elevenlabs.io */
  ELEVENLABS_API_BASE: z.url().default("https://api.elevenlabs.io"),
  ELEVENLABS_VOICE_ID_FEMALE: optionalString,
  ELEVENLABS_VOICE_ID_MALE: optionalString,
  /** Optional: workspace webhook id that agent:sync attaches to the agent. */
  ELEVENLABS_POST_CALL_WEBHOOK_ID: optionalString,

  // WhatsApp Cloud API (Meta)
  WHATSAPP_ACCESS_TOKEN: optionalString,
  WHATSAPP_PHONE_NUMBER_ID: optionalString,
  WHATSAPP_APP_SECRET: optionalString,
  WHATSAPP_VERIFY_TOKEN: optionalString,

  // Email
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: optionalString,

  // Payments: Razorpay
  RAZORPAY_KEY_ID: optionalString,
  RAZORPAY_KEY_SECRET: optionalString,
  RAZORPAY_WEBHOOK_SECRET: optionalString,

  // Monitoring (optional)
  SENTRY_DSN: optionalString,
  HEALTHCHECKS_PING_URL: optionalString,

  // Public support contact (optional)
  SUPPORT_WHATSAPP_NUMBER: optionalString,
});

export type RawEnv = z.infer<typeof rawSchema>;

/** Which keys each real provider needs. All or nothing. */
export const PROVIDER_KEYS = {
  voice: [
    "ELEVENLABS_API_KEY",
    "ELEVENLABS_AGENT_ID",
    "ELEVENLABS_PHONE_NUMBER_ID",
    "ELEVENLABS_WEBHOOK_SECRET",
  ],
  whatsapp: [
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_APP_SECRET",
    "WHATSAPP_VERIFY_TOKEN",
  ],
  email: ["RESEND_API_KEY", "EMAIL_FROM"],
  payments: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"],
  googleAuth: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
} as const satisfies Record<string, readonly (keyof RawEnv)[]>;

export type ProviderName = keyof typeof PROVIDER_KEYS;

export interface ProviderModes {
  database: "postgres" | "embedded";
  voice: "elevenlabs" | "mock";
  whatsapp: "meta" | "mock";
  email: "resend" | "mock";
  payments: "razorpay" | "mock";
  googleAuth: "enabled" | "disabled";
  /** "Talk to the assistant in your browser": needs only the API key and agent id. */
  browserVoice: "enabled" | "disabled";
}

export interface AppEnv extends RawEnv {
  /** Secrets with demo fallbacks resolved (demo values only on a laptop / in CI). */
  DATA_ENCRYPTION_KEY: string;
  BETTER_AUTH_SECRET: string;
  CRON_SECRET: string;
  modes: ProviderModes;
  /** True when any provider (or the database) is running as a demo/mock. */
  isDemo: boolean;
  /** The public demo website (APP_ENV=demo): no background scheduler, the demo moves on visits. */
  isHostedDemo: boolean;
  /** Reachable by the public (demo or production): secure cookies, rate limits, no localhost origins. */
  isPublicSite: boolean;
  adminEmails: string[];
}

export class EnvConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid configuration:\n- ${problems.join("\n- ")}`);
    this.name = "EnvConfigError";
  }
}

function providerState(raw: RawEnv, name: ProviderName): "real" | "mock" | string[] {
  const keys = PROVIDER_KEYS[name];
  const missing = keys.filter((k) => raw[k] === undefined);
  if (missing.length === 0) return "real";
  if (missing.length === keys.length) return "mock";
  return missing;
}

/**
 * Parse and validate configuration from any key/value source.
 * Pure function: safe to call in tests with a hand-made object.
 */
export function parseEnv(source: Record<string, string | undefined>): AppEnv {
  // An empty line in .env ("KEY=") means "not set".
  const cleaned = Object.fromEntries(
    Object.entries(source).map(([k, v]) => [
      k,
      typeof v === "string" && v.trim() === "" ? undefined : v,
    ]),
  );
  const parsed = rawSchema.safeParse(cleaned);
  if (!parsed.success) {
    throw new EnvConfigError(
      parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    );
  }
  const raw = parsed.data;
  const problems: string[] = [];
  const isProd = raw.APP_ENV === "production";
  const isHostedDemo = raw.APP_ENV === "demo";

  const states = Object.fromEntries(
    (Object.keys(PROVIDER_KEYS) as ProviderName[]).map((name) => [name, providerState(raw, name)]),
  ) as Record<ProviderName, "real" | "mock" | string[]>;
  // Only the API key + agent id: phone calls stay simulated, but the
  // browser "talk to the assistant" demo works.
  const browserOnly =
    !!raw.ELEVENLABS_API_KEY &&
    !!raw.ELEVENLABS_AGENT_ID &&
    !raw.ELEVENLABS_PHONE_NUMBER_ID &&
    !raw.ELEVENLABS_WEBHOOK_SECRET;
  if (browserOnly) states.voice = "mock";

  for (const [name, state] of Object.entries(states)) {
    if (Array.isArray(state)) {
      problems.push(
        `${name} is only partly configured. Missing: ${state.join(", ")}. ` +
          `Set all of them, or none (to use the demo mock).`,
      );
    }
  }

  const modes: ProviderModes = {
    database: raw.DATABASE_URL || raw.NETLIFY_DB_URL ? "postgres" : "embedded",
    voice: states.voice === "real" ? "elevenlabs" : "mock",
    whatsapp: states.whatsapp === "real" ? "meta" : "mock",
    email: states.email === "real" ? "resend" : "mock",
    payments: states.payments === "real" ? "razorpay" : "mock",
    googleAuth: states.googleAuth === "real" ? "enabled" : "disabled",
    browserVoice: raw.ELEVENLABS_API_KEY && raw.ELEVENLABS_AGENT_ID ? "enabled" : "disabled",
  };

  const isDemo =
    modes.database === "embedded" ||
    modes.voice === "mock" ||
    modes.whatsapp === "mock" ||
    modes.email === "mock" ||
    modes.payments === "mock";

  if (isProd || isHostedDemo) {
    const where = isProd ? "production" : "the public demo (APP_ENV=demo)";
    if (!raw.DATABASE_URL && !raw.NETLIFY_DB_URL) {
      problems.push(
        `DATABASE_URL (or a Netlify Database) is required in ${where}: ` +
          `the embedded database can't be shared between server instances.`,
      );
    }
    for (const key of ["DATA_ENCRYPTION_KEY", "BETTER_AUTH_SECRET", "CRON_SECRET"] as const) {
      if (!raw[key]) problems.push(`${key} is required in ${where}.`);
    }
    if (raw.DATA_ENCRYPTION_KEY === DEMO_ENCRYPTION_KEY) {
      problems.push("DATA_ENCRYPTION_KEY is the public demo key. Generate a real one.");
    }
    if (raw.BETTER_AUTH_SECRET === DEMO_AUTH_SECRET) {
      problems.push("BETTER_AUTH_SECRET is the public demo secret. Generate a real one.");
    }
    if (raw.CRON_SECRET === DEMO_CRON_SECRET) {
      problems.push("CRON_SECRET is the public demo secret. Generate a real one.");
    }
    if (!raw.APP_URL.startsWith("https://")) {
      problems.push(`APP_URL must use https:// in ${where}.`);
    }
  }

  if (isHostedDemo) {
    // Demo parents have made-up phone numbers that may belong to real people.
    const real = (["voice", "whatsapp", "email", "payments"] as const).filter(
      (n) => states[n] === "real",
    );
    if (real.length > 0 || modes.browserVoice === "enabled") {
      problems.push(
        `The public demo (APP_ENV=demo) must use the demo mock for every provider, ` +
          `so it never calls, messages or charges a real person` +
          (real.length > 0 ? ` (remove the keys for: ${real.join(", ")})` : "") +
          (modes.browserVoice === "enabled"
            ? `. Remove ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID: anyone could spend your credits`
            : "") +
          `.`,
      );
    }
  }

  if (isProd) {
    const mocks = (["voice", "whatsapp", "email", "payments"] as const).filter(
      (n) => states[n] === "mock",
    );
    if (mocks.length > 0 && !raw.ALLOW_DEMO_PROVIDERS_IN_PRODUCTION) {
      problems.push(
        `Production is using mock providers (${mocks.join(", ")}). Real families would not ` +
          `get calls or alerts. Configure them. (For a public demo website use APP_ENV=demo.)`,
      );
    }
  }

  if (raw.DATA_ENCRYPTION_KEY) {
    const bytes = base64ByteLength(raw.DATA_ENCRYPTION_KEY);
    if (bytes !== 32) {
      problems.push(
        "DATA_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32).",
      );
    }
  }

  if (problems.length > 0) throw new EnvConfigError(problems);

  return {
    ...raw,
    DATA_ENCRYPTION_KEY: raw.DATA_ENCRYPTION_KEY ?? DEMO_ENCRYPTION_KEY,
    BETTER_AUTH_SECRET: raw.BETTER_AUTH_SECRET ?? DEMO_AUTH_SECRET,
    CRON_SECRET: raw.CRON_SECRET ?? DEMO_CRON_SECRET,
    modes,
    isDemo,
    isHostedDemo,
    isPublicSite: isProd || isHostedDemo,
    adminEmails: (raw.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  };
}

function base64ByteLength(value: string): number {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return -1;
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return (value.length * 3) / 4 - padding;
}

let cached: AppEnv | undefined;

/** Read configuration from process.env once (server-side only). */
export function getEnv(): AppEnv {
  cached ??= parseEnv(process.env);
  return cached;
}

/** For tests only. */
export function resetEnvCache(): void {
  cached = undefined;
}
