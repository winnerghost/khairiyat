/**
 * Who is signed in, and what they may see.
 *
 * Every page and server action that touches family data goes through one
 * of these helpers. A parent from another family looks exactly like a
 * parent that doesn't exist (404), so ids can't be probed.
 */
import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db/client";
import type { Db } from "@/db/types";
import { getEnv } from "@/lib/env";
import { getAuth } from "./auth";
import { DEMO_LOGIN } from "./demo-accounts";
import { ensureFamilyForUser, type Family, type Member } from "./families";
import { getParent, type Parent } from "./parents";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

/** Demo-only admin account (never works in production). */
export const DEMO_ADMIN_EMAIL = DEMO_LOGIN.admin.email;

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const auth = await getAuth();
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result) return null;
  return { id: result.user.id, name: result.user.name, email: result.user.email };
});

export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  return u;
}

export interface MemberContext {
  db: Db;
  user: SessionUser;
  family: Family;
  member: Member;
}

export const requireMember = cache(async (): Promise<MemberContext> => {
  const user = await requireUser();
  const db = await getDb();
  const { family, member } = await ensureFamilyForUser(db, user);
  return { db, user, family, member };
});

/** The parent, if (and only if) it belongs to the signed-in user's family. */
export async function requireParent(parentId: string): Promise<MemberContext & { parent: Parent }> {
  const ctx = await requireMember();
  if (!/^[0-9a-f-]{36}$/i.test(parentId)) notFound();
  const parent = await getParent(ctx.db, parentId);
  if (!parent || parent.familyId !== ctx.family.id) notFound();
  return { ...ctx, parent };
}

export function isAdminEmail(email: string): boolean {
  const env = getEnv();
  const e = email.toLowerCase();
  if (env.adminEmails.includes(e)) return true;
  return env.APP_ENV !== "production" && e === DEMO_ADMIN_EMAIL;
}

export async function requireAdmin(): Promise<{ db: Db; user: SessionUser }> {
  const user = await requireUser();
  if (!isAdminEmail(user.email)) notFound();
  return { db: await getDb(), user };
}
