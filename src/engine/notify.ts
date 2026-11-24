/**
 * The notification OUTBOX. Nothing is ever sent directly: every message is
 * first a row in `notifications` (with a unique idempotency key), then sent
 * by `dispatchDue` with retries and backoff. Failed WhatsApp messages fall
 * back to email. Messages that keep failing become "dead" and show up in
 * admin. Nothing is silently dropped.
 */
import { and, asc, eq, inArray, lte, or, sql } from "drizzle-orm";
import { emergencyContacts, familyMembers, notifications } from "@/db/schema/app";
import { user } from "@/db/schema/auth";
import type { DbOrTx } from "@/db/types";
import { render, type Lang, type TemplateName } from "@/domain/templates";
import type { EngineDeps } from "./deps";

/** Retry delays after each failed attempt (minutes). */
export const BACKOFF_MINUTES = [1, 5, 15, 60, 180];

export type Audience =
  | "summary" // members with notify_mode = every_call
  | "alert" // every member + emergency contacts who opted in for this alert type
  | "digest" // members with notify_mode = daily_digest
  | "members"; // every family member (consent / opt-out news), no emergency contacts

export interface FamilyMessage {
  familyId: string;
  parentId: string;
  checkInId?: string | null;
  alertId?: string | null;
  /** Unique per logical message, e.g. "summary:<checkInId>". */
  key: string;
  template: TemplateName;
  /** Parameters per language (same order as the template's {{n}}). */
  params: Record<Lang, string[]>;
  audience: Audience;
  alertKind?: "unreachable" | "red_flag";
  priority: "normal" | "urgent";
}

interface Recipient {
  key: string; // "member:<id>" | "contact:<id>"
  memberId: string | null;
  contactId: string | null;
  name: string;
  language: Lang;
  whatsapp: string | null;
  email: string | null;
}

async function recipientsFor(db: DbOrTx, msg: FamilyMessage): Promise<Recipient[]> {
  const members = await db
    .select({ m: familyMembers, email: user.email })
    .from(familyMembers)
    .innerJoin(user, eq(user.id, familyMembers.userId))
    .where(eq(familyMembers.familyId, msg.familyId));
  const out: Recipient[] = [];
  for (const { m, email } of members) {
    const wants =
      msg.audience === "alert" ||
      msg.audience === "members" ||
      (msg.audience === "summary" && m.notifyMode === "every_call") ||
      (msg.audience === "digest" && m.notifyMode === "daily_digest");
    if (!wants) continue;
    out.push({
      key: `member:${m.id}`,
      memberId: m.id,
      contactId: null,
      name: m.displayName,
      language: m.summaryLanguage,
      whatsapp: m.whatsappEnabled ? m.whatsappE164 : null,
      email: m.emailEnabled || !m.whatsappE164 ? email : null,
    });
  }
  if (msg.audience === "alert") {
    const contacts = await db
      .select()
      .from(emergencyContacts)
      .where(eq(emergencyContacts.parentId, msg.parentId));
    const memberNumbers = new Set(out.map((r) => r.whatsapp).filter(Boolean));
    for (const c of contacts) {
      const wants = msg.alertKind === "unreachable" ? c.alertOnUnreachable : c.alertOnRedFlag;
      if (!wants) continue;
      if (memberNumbers.has(c.whatsappE164)) continue; // same person, don't message twice
      out.push({
        key: `contact:${c.id}`,
        memberId: null,
        contactId: c.id,
        name: c.name,
        language: "en",
        whatsapp: c.whatsappE164,
        email: c.email,
      });
    }
  }
  return out;
}

/**
 * Queue a message for everyone who should get it. Idempotent: calling it
 * twice for the same `key` creates nothing new. Returns the new row ids.
 */
export async function enqueueFamilyMessage(
  db: DbOrTx,
  msg: FamilyMessage,
  now: Date,
): Promise<string[]> {
  const recipients = await recipientsFor(db, msg);
  const rows: (typeof notifications.$inferInsert)[] = [];
  for (const r of recipients) {
    const { params, body, subject } = render(msg.template, r.language, msg.params[r.language]);
    const base = {
      familyId: msg.familyId,
      parentId: msg.parentId,
      checkInId: msg.checkInId ?? null,
      alertId: msg.alertId ?? null,
      recipientMemberId: r.memberId,
      recipientContactId: r.contactId,
      recipientName: r.name,
      template: msg.template,
      language: r.language,
      params,
      subject,
      body,
      priority: msg.priority,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    };
    // WhatsApp is the primary channel. Urgent alerts go to email too, at once.
    if (r.whatsapp)
      rows.push({
        ...base,
        channel: "whatsapp",
        toAddress: r.whatsapp,
        idempotencyKey: `${msg.key}:${r.key}:whatsapp`,
      });
    if (r.email && (!r.whatsapp || msg.priority === "urgent")) {
      rows.push({
        ...base,
        channel: "email",
        toAddress: r.email,
        idempotencyKey: `${msg.key}:${r.key}:email`,
      });
    }
    if (!r.whatsapp && !r.email) {
      rows.push({
        ...base,
        channel: "in_app",
        toAddress: r.key,
        status: "skipped",
        lastError: "No WhatsApp number or email for this person",
        idempotencyKey: `${msg.key}:${r.key}:in_app`,
      });
    }
  }
  if (rows.length === 0) return [];
  const inserted = await db
    .insert(notifications)
    .values(rows)
    .onConflictDoNothing({ target: notifications.idempotencyKey })
    .returning({ id: notifications.id });
  return inserted.map((r) => r.id);
}

type Row = typeof notifications.$inferSelect;

async function sendOne(deps: EngineDeps, n: Row) {
  if (n.channel === "whatsapp") {
    return deps.whatsapp.sendTemplate({
      to: n.toAddress,
      template: n.template,
      language: n.language,
      params: n.params,
      body: n.body,
    });
  }
  if (n.channel === "email") {
    return deps.email.send({ to: n.toAddress, subject: n.subject ?? "", text: n.body });
  }
  return { ok: false as const, error: "in-app only", retryable: false };
}

/**
 * Send due messages. Safe to run concurrently (rows are claimed with
 * FOR UPDATE SKIP LOCKED and moved to "sending" before any network call).
 */
export async function dispatchDue(
  deps: EngineDeps,
  opts: { limit?: number; ids?: string[] } = {},
): Promise<{ sent: number; failed: number; dead: number }> {
  const now = deps.clock.now();
  const limit = opts.limit ?? 50;
  const claimed = await deps.db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(notifications)
      .where(
        and(
          inArray(notifications.status, ["pending", "failed"]),
          lte(notifications.nextAttemptAt, now),
          opts.ids && opts.ids.length ? inArray(notifications.id, opts.ids) : undefined,
        ),
      )
      .orderBy(
        sql`CASE WHEN ${notifications.priority} = 'urgent' THEN 0 ELSE 1 END`,
        asc(notifications.nextAttemptAt),
      )
      .limit(limit)
      .for("update", { skipLocked: true });
    if (due.length === 0) return [];
    await tx
      .update(notifications)
      .set({ status: "sending", updatedAt: now })
      .where(
        inArray(
          notifications.id,
          due.map((d) => d.id),
        ),
      );
    return due;
  });

  let sent = 0;
  let failed = 0;
  let dead = 0;
  for (const n of claimed) {
    let result: Awaited<ReturnType<typeof sendOne>>;
    try {
      result = await sendOne(deps, n);
    } catch (error) {
      result = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        retryable: true,
      };
    }
    const attempts = n.attempts + 1;
    if (result.ok) {
      sent++;
      await deps.db
        .update(notifications)
        .set({
          status: "sent",
          attempts,
          sentAt: now,
          providerMessageId: result.providerMessageId,
          lastError: null,
          updatedAt: now,
        })
        .where(eq(notifications.id, n.id));
      continue;
    }
    const giveUp = !result.retryable || attempts >= n.maxAttempts;
    if (giveUp) {
      dead++;
      await deps.db
        .update(notifications)
        .set({ status: "dead", attempts, lastError: result.error, updatedAt: now })
        .where(eq(notifications.id, n.id));
      deps.logger.error("notification dead", {
        notificationId: n.id,
        channel: n.channel,
        template: n.template,
        error: result.error,
      });
      await enqueueEmailFallback(deps, n, now);
    } else {
      failed++;
      const delay = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)]!;
      await deps.db
        .update(notifications)
        .set({
          status: "failed",
          attempts,
          lastError: result.error,
          nextAttemptAt: new Date(now.getTime() + delay * 60_000),
          updatedAt: now,
        })
        .where(eq(notifications.id, n.id));
      // Urgent WhatsApp alerts don't wait for retries to run out: email now too.
      if (n.priority === "urgent" && n.channel === "whatsapp")
        await enqueueEmailFallback(deps, n, now);
    }
  }
  return { sent, failed, dead };
}

/** When WhatsApp gives up (or is struggling with an urgent alert), send the same words by email. */
async function enqueueEmailFallback(deps: EngineDeps, n: Row, now: Date): Promise<void> {
  if (n.channel !== "whatsapp") return;
  // Admins may switch off fallback for ordinary messages; urgent alerts always fall back.
  if (n.priority !== "urgent") {
    const { getSettings } = await import("./settings");
    if (!(await getSettings(deps.db)).feature_flags.emailFallback) return;
  }
  let email: string | null = null;
  if (n.recipientMemberId) {
    const [r] = await deps.db
      .select({ email: user.email })
      .from(familyMembers)
      .innerJoin(user, eq(user.id, familyMembers.userId))
      .where(eq(familyMembers.id, n.recipientMemberId));
    email = r?.email ?? null;
  } else if (n.recipientContactId) {
    const [c] = await deps.db
      .select()
      .from(emergencyContacts)
      .where(eq(emergencyContacts.id, n.recipientContactId));
    email = c?.email ?? null;
  }
  if (!email) return;
  const key = n.idempotencyKey.replace(/:whatsapp$/, ":email");
  await deps.db
    .insert(notifications)
    .values({
      idempotencyKey: key,
      familyId: n.familyId,
      parentId: n.parentId,
      checkInId: n.checkInId,
      alertId: n.alertId,
      recipientMemberId: n.recipientMemberId,
      recipientContactId: n.recipientContactId,
      recipientName: n.recipientName,
      channel: "email",
      toAddress: email,
      template: n.template,
      language: n.language,
      params: n.params,
      subject: n.subject,
      body: n.body,
      priority: n.priority,
      fallbackOfId: n.id,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: notifications.idempotencyKey });
}

/** Admin "retry" button: put a dead/failed message back in the queue. */
export async function retryNotification(db: DbOrTx, id: string, now: Date): Promise<void> {
  await db
    .update(notifications)
    .set({ status: "pending", nextAttemptAt: now, attempts: 0, updatedAt: now })
    .where(
      and(
        eq(notifications.id, id),
        or(eq(notifications.status, "dead"), eq(notifications.status, "failed")),
      ),
    );
}
