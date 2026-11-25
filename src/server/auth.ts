/**
 * Login (Better Auth): email + password, optional Google, password reset,
 * sessions stored in our database.
 * Docs: https://www.better-auth.com/docs/installation
 */
import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "@/db/client";
import { account, rateLimit, session, user, verification } from "@/db/schema/auth";
import type { Db } from "@/db/types";
import { brand } from "@/config/brand";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { ensureFamilyForUser } from "./families";
import { getEmailProvider } from "./providers";

function buildAuth(db: Db) {
  const env = getEnv();
  // Production and the public demo website: secure cookies, rate limits, no localhost.
  const isProd = env.isPublicSite;
  const devOrigins = isProd
    ? []
    : [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3100",
        "http://localhost:3200",
      ];

  return betterAuth({
    appName: brand.name,
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_URL, ...devOrigins],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user, session, account, verification, rateLimit },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60, // 1 hour
      sendResetPassword: async ({ user: u, url }) => {
        const email = getEmailProvider(db);
        const result = await email.send({
          to: u.email,
          subject: `Reset your ${brand.name} password`,
          text:
            `Namaste ${u.name},\n\nSomeone (hopefully you) asked to reset your ${brand.name} password.\n` +
            `Open this link within 1 hour to choose a new one:\n${url}\n\n` +
            `If this wasn't you, you can ignore this email.\n— ${brand.name}`,
        });
        if (!result.ok) logger.error("auth: reset email failed", { error: result.error });
      },
    },
    socialProviders:
      env.modes.googleAuth === "enabled"
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID!,
              clientSecret: env.GOOGLE_CLIENT_SECRET!,
            },
          }
        : undefined,
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // refresh daily
    },
    rateLimit: {
      enabled: isProd,
      storage: "database",
    },
    advanced: {
      useSecureCookies: isProd,
    },
    databaseHooks: {
      user: {
        create: {
          after: async (created) => {
            await ensureFamilyForUser(db, { id: created.id, name: created.name });
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof buildAuth>;

const globalForAuth = globalThis as unknown as { __khairiyatAuth?: Promise<Auth> };

export function getAuth(): Promise<Auth> {
  globalForAuth.__khairiyatAuth ??= getDb().then(buildAuth);
  return globalForAuth.__khairiyatAuth;
}
