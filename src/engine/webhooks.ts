/**
 * The webhook INBOX. A webhook is: verify signature on the raw body →
 * store it (deduplicated by provider + conversation_id + event type) →
 * answer 200 quickly → process. If processing dies halfway, the tick picks
 * up anything still "pending". Duplicates and out-of-order events are
 * harmless (see post-call.ts).
 */
import { and, asc, eq, inArray, lt } from "drizzle-orm";
import { webhookEvents } from "@/db/schema/app";
import type { CallEvent } from "@/providers/voice/types";
import { toTranscriptionEvent } from "@/providers/voice/elevenlabs-payload";
import type { EngineDeps } from "./deps";
import { handleCallEvent } from "./post-call";
import { getSettings } from "./settings";

export type IngestResult =
  | { status: 200; eventId: string | null; duplicate: boolean }
  | { status: 400 | 401; error: string };

export async function ingestVoiceWebhook(
  deps: EngineDeps,
  rawBody: string,
  headers: Headers,
): Promise<IngestResult> {
  const now = deps.clock.now();
  const parsed = await deps.voice.parseWebhook(rawBody, headers, now);
  if (!parsed.ok) {
    deps.logger.warn("webhook rejected", { provider: deps.voice.name, error: parsed.error });
    return { status: parsed.status, error: parsed.error };
  }
  const inserted = await deps.db
    .insert(webhookEvents)
    .values({
      provider: deps.voice.name,
      eventType: parsed.eventType,
      eventKey: parsed.eventKey,
      payload: parsed.payload,
      receivedAt: now,
    })
    .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.eventKey] })
    .returning({ id: webhookEvents.id });
  return { status: 200, eventId: inserted[0]?.id ?? null, duplicate: inserted.length === 0 };
}

function eventFromRow(row: typeof webhookEvents.$inferSelect): CallEvent | null {
  const p = row.payload as { type?: string; data?: Record<string, unknown> };
  const data = p.data ?? {};
  const conversationId = typeof data.conversation_id === "string" ? data.conversation_id : "";
  switch (row.eventType) {
    case "post_call_transcription":
      return toTranscriptionEvent(data);
    case "post_call_audio":
      return { type: "audio", conversationId };
    case "call_initiation_failure": {
      const r = data.failure_reason;
      return {
        type: "initiation_failure",
        conversationId,
        reason: r === "busy" ? "busy" : r === "no-answer" ? "no_answer" : "unknown",
      };
    }
    default:
      return null;
  }
}

/** Process one stored event. Safe to call more than once. */
export async function processWebhookEvent(deps: EngineDeps, eventId: string): Promise<void> {
  const now = deps.clock.now();
  const claimed = await deps.db
    .update(webhookEvents)
    .set({ status: "processed", processedAt: now })
    .where(and(eq(webhookEvents.id, eventId), inArray(webhookEvents.status, ["pending", "failed"])))
    .returning();
  const row = claimed[0];
  if (!row) return; // someone else processed it
  try {
    const event = eventFromRow(row);
    if (!event) {
      await deps.db
        .update(webhookEvents)
        .set({ status: "ignored", lastError: "unknown event type" })
        .where(eq(webhookEvents.id, row.id));
      return;
    }
    const settings = await getSettings(deps.db);
    const result = await handleCallEvent(deps, event, settings);
    if (result.status === "ignored") {
      await deps.db
        .update(webhookEvents)
        .set({ status: "ignored", lastError: result.reason })
        .where(eq(webhookEvents.id, row.id));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deps.logger.error("webhook processing failed", { eventId: row.id, error: message });
    await deps.db
      .update(webhookEvents)
      .set({
        status: "failed",
        attempts: row.attempts + 1,
        lastError: message.slice(0, 500),
        processedAt: null,
      })
      .where(eq(webhookEvents.id, row.id));
  }
}

/** Tick step: anything received but not processed (crash, timeout) gets processed now. */
export async function processPendingWebhooks(deps: EngineDeps, limit = 50): Promise<number> {
  const rows = await deps.db
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(and(inArray(webhookEvents.status, ["pending", "failed"]), lt(webhookEvents.attempts, 5)))
    .orderBy(asc(webhookEvents.receivedAt))
    .limit(limit);
  for (const r of rows) await processWebhookEvent(deps, r.id);
  return rows.length;
}
