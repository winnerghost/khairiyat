"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAuth } from "@/server/auth";
import { DEMO_LOGIN } from "@/server/demo-accounts";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

export interface AuthFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  message?: string;
}

/** Only allow redirects to our own pages (prevents open redirects). */
function safeNext(value: FormDataEntryValue | null): string {
  const v = typeof value === "string" ? value : "";
  return v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/app";
}

function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof APIError) {
    const msg = (error.body as { message?: string } | undefined)?.message ?? error.message;
    if (/already exists/i.test(msg))
      return "An account with this email already exists. Try logging in.";
    if (/invalid email or password/i.test(msg))
      return "That email and password don't match. Please try again.";
    if (/too many/i.test(msg) || error.status === "TOO_MANY_REQUESTS")
      return "Too many attempts. Please wait a minute and try again.";
    if (/password.*(short|long)/i.test(msg)) return msg;
    if (/invalid token/i.test(msg))
      return "This reset link is invalid or has expired. Please ask for a new one.";
    return msg;
  }
  logger.error("auth: unexpected error", { error });
  return fallback;
}

const signupSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name.").max(80),
  email: z.email("Please enter a valid email.").trim().toLowerCase(),
  password: z.string().min(8, "Use at least 8 characters.").max(128),
});

export async function signupAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { fieldErrors };
  }
  try {
    const auth = await getAuth();
    await auth.api.signUpEmail({ body: parsed.data, headers: await headers() });
  } catch (error) {
    return { error: apiErrorMessage(error, "We couldn't create your account. Please try again.") };
  }
  redirect(safeNext(formData.get("next")));
}

const loginSchema = z.object({
  email: z.email("Please enter a valid email.").trim().toLowerCase(),
  password: z.string().min(1, "Please enter your password."),
});

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { fieldErrors };
  }
  try {
    const auth = await getAuth();
    await auth.api.signInEmail({ body: parsed.data, headers: await headers() });
  } catch (error) {
    return { error: apiErrorMessage(error, "We couldn't log you in. Please try again.") };
  }
  redirect(safeNext(formData.get("next")));
}

/** Demo mode only: one tap to explore the seeded demo family (or the admin panel). */
export async function demoLoginAction(formData: FormData): Promise<void> {
  const env = getEnv();
  if (!env.isDemo || env.APP_ENV === "production") redirect("/login");
  const who = formData.get("who") === "admin" ? DEMO_LOGIN.admin : DEMO_LOGIN.family;
  const auth = await getAuth();
  try {
    await auth.api.signInEmail({
      body: { email: who.email, password: who.password },
      headers: await headers(),
    });
  } catch (error) {
    logger.error("auth: demo login failed (run npm run seed?)", { error });
    redirect("/login?demo=missing");
  }
  redirect(who === DEMO_LOGIN.admin ? "/admin" : "/app");
}

export async function googleAction(): Promise<void> {
  const auth = await getAuth();
  const res = await auth.api.signInSocial({ body: { provider: "google", callbackURL: "/app" } });
  if (res && "url" in res && typeof res.url === "string") redirect(res.url);
  redirect("/login");
}

export async function forgotAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = z.email().safeParse(
    String(formData.get("email") ?? "")
      .trim()
      .toLowerCase(),
  );
  if (!email.success) return { fieldErrors: { email: "Please enter a valid email." } };
  try {
    const auth = await getAuth();
    await auth.api.requestPasswordReset({
      body: { email: email.data, redirectTo: "/reset-password" },
    });
  } catch (error) {
    logger.warn("auth: reset request failed", { error });
  }
  // Same answer whether or not the account exists (no account probing).
  return {
    message: "If an account exists for this email, we've sent a reset link. It works for 1 hour.",
  };
}

const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Use at least 8 characters.").max(128),
});

export async function resetAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { fieldErrors };
  }
  try {
    const auth = await getAuth();
    await auth.api.resetPassword({
      body: { newPassword: parsed.data.password, token: parsed.data.token },
    });
  } catch (error) {
    return {
      error: apiErrorMessage(error, "We couldn't reset your password. Please ask for a new link."),
    };
  }
  redirect("/login?reset=1");
}

export async function logoutAction(): Promise<void> {
  const auth = await getAuth();
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch (error) {
    logger.warn("auth: sign-out failed", { error });
  }
  redirect("/");
}
