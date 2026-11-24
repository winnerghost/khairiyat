import { describe, expect, it } from "vitest";
import {
  DEMO_AUTH_SECRET,
  DEMO_CRON_SECRET,
  DEMO_ENCRYPTION_KEY,
  EnvConfigError,
  parseEnv,
} from "./env";

const REAL_KEY = Buffer.alloc(32, 7).toString("base64");

const allProviders = {
  ELEVENLABS_API_KEY: "el-key",
  ELEVENLABS_AGENT_ID: "agent_1",
  ELEVENLABS_PHONE_NUMBER_ID: "phnum_1",
  ELEVENLABS_WEBHOOK_SECRET: "wsec",
  WHATSAPP_ACCESS_TOKEN: "wa-token",
  WHATSAPP_PHONE_NUMBER_ID: "123",
  WHATSAPP_APP_SECRET: "wa-secret",
  WHATSAPP_VERIFY_TOKEN: "verify",
  RESEND_API_KEY: "re_123",
  EMAIL_FROM: "Khairiyat <hello@example.com>",
  RAZORPAY_KEY_ID: "rzp_test_1",
  RAZORPAY_KEY_SECRET: "rzp-secret",
  RAZORPAY_WEBHOOK_SECRET: "rzp-wh",
};

const productionBasics = {
  APP_ENV: "production",
  APP_URL: "https://khairiyat.example",
  DATABASE_URL: "postgres://user:pass@db.example:6543/postgres",
  DATA_ENCRYPTION_KEY: REAL_KEY,
  BETTER_AUTH_SECRET: "a-real-long-random-secret-value-1234567890",
  CRON_SECRET: "a-real-cron-secret",
};

function problemsOf(fn: () => unknown): string[] {
  try {
    fn();
  } catch (e) {
    if (e instanceof EnvConfigError) return e.problems;
    throw e;
  }
  return [];
}

describe("parseEnv: demo mode", () => {
  it("runs fully in demo mode with an empty environment", () => {
    const env = parseEnv({});
    expect(env.APP_ENV).toBe("development");
    expect(env.isDemo).toBe(true);
    expect(env.modes).toEqual({
      database: "embedded",
      voice: "mock",
      whatsapp: "mock",
      email: "mock",
      payments: "mock",
      googleAuth: "disabled",
      browserVoice: "disabled",
    });
    expect(env.DATA_ENCRYPTION_KEY).toBe(DEMO_ENCRYPTION_KEY);
    expect(env.BETTER_AUTH_SECRET).toBe(DEMO_AUTH_SECRET);
    expect(env.CRON_SECRET).toBe(DEMO_CRON_SECRET);
  });

  it("treats empty strings like missing keys", () => {
    const env = parseEnv({
      ELEVENLABS_API_KEY: "",
      DATABASE_URL: "  ",
      ELEVENLABS_API_BASE: "",
      APP_URL: "",
    });
    expect(env.ELEVENLABS_API_BASE).toBe("https://api.elevenlabs.io");
    expect(env.modes.voice).toBe("mock");
    expect(env.modes.database).toBe("embedded");
  });
});

describe("parseEnv: provider switching", () => {
  it("switches every provider to real when all keys are present", () => {
    const env = parseEnv({ ...allProviders, DATABASE_URL: "postgres://x" });
    expect(env.modes).toMatchObject({
      database: "postgres",
      voice: "elevenlabs",
      whatsapp: "meta",
      email: "resend",
      payments: "razorpay",
    });
    expect(env.isDemo).toBe(false);
  });

  it("refuses a half-configured provider instead of silently using the mock", () => {
    const problems = problemsOf(() =>
      parseEnv({ WHATSAPP_ACCESS_TOKEN: "wa-token", WHATSAPP_PHONE_NUMBER_ID: "123" }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("whatsapp is only partly configured");
    expect(problems[0]).toContain("WHATSAPP_APP_SECRET");
    expect(problems[0]).toContain("WHATSAPP_VERIFY_TOKEN");
  });

  it("allows the browser voice demo with only an API key and agent id", () => {
    const env = parseEnv({ ELEVENLABS_API_KEY: "k", ELEVENLABS_AGENT_ID: "a" });
    expect(env.modes.voice).toBe("mock");
    expect(env.modes.browserVoice).toBe("enabled");
    expect(() =>
      parseEnv({
        ELEVENLABS_API_KEY: "k",
        ELEVENLABS_AGENT_ID: "a",
        ELEVENLABS_PHONE_NUMBER_ID: "p",
      }),
    ).toThrow(EnvConfigError);
  });

  it("parses the admin email list", () => {
    const env = parseEnv({ ADMIN_EMAILS: " Owner@Example.com, ops@example.com ,," });
    expect(env.adminEmails).toEqual(["owner@example.com", "ops@example.com"]);
  });

  it("rejects an encryption key that is not 32 bytes", () => {
    const problems = problemsOf(() => parseEnv({ DATA_ENCRYPTION_KEY: "dG9vLXNob3J0" }));
    expect(problems.join(" ")).toContain("32 bytes");
  });
});

describe("parseEnv: production guard", () => {
  it("accepts a complete production configuration", () => {
    const env = parseEnv({ ...productionBasics, ...allProviders });
    expect(env.isDemo).toBe(false);
  });

  it("refuses to start production with mock providers", () => {
    const problems = problemsOf(() => parseEnv({ ...productionBasics }));
    expect(problems.join(" ")).toContain("mock providers (voice, whatsapp, email, payments)");
  });

  it("allows mock providers in production only for an explicit demo site", () => {
    const env = parseEnv({ ...productionBasics, ALLOW_DEMO_PROVIDERS_IN_PRODUCTION: "true" });
    expect(env.isDemo).toBe(true);
  });

  it("refuses public demo secrets in production", () => {
    const problems = problemsOf(() =>
      parseEnv({
        ...productionBasics,
        ...allProviders,
        DATA_ENCRYPTION_KEY: DEMO_ENCRYPTION_KEY,
        BETTER_AUTH_SECRET: DEMO_AUTH_SECRET,
        CRON_SECRET: DEMO_CRON_SECRET,
      }),
    );
    expect(problems).toHaveLength(3);
  });

  it("requires the database, secrets and https in production", () => {
    const problems = problemsOf(() =>
      parseEnv({ APP_ENV: "production", APP_URL: "http://insecure.example", ...allProviders }),
    );
    const text = problems.join(" | ");
    expect(text).toContain("DATABASE_URL is required");
    expect(text).toContain("DATA_ENCRYPTION_KEY is required");
    expect(text).toContain("BETTER_AUTH_SECRET is required");
    expect(text).toContain("CRON_SECRET is required");
    expect(text).toContain("https://");
  });

  it("rejects unknown APP_ENV values", () => {
    expect(() => parseEnv({ APP_ENV: "staging" })).toThrow(EnvConfigError);
  });
});
