/**
 * Webhooks can get lost. Every attempt still "dialing / in progress" after
 * N minutes is checked with the provider's API, and its result goes
 * through the same inbox as a webhook would. If the provider can't tell us
 * anything after a long time, a person (admin) is asked to look.
 */
import { and, eq, inArray, lt } from "drizzle-orm";
import { alerts, callAttempts, checkIns, parents, webhookEvents } from "@/db/schema/app";
import type { EngineDeps } from "./deps";
import { processWebhookEvent } from "./webhooks";
import { recordNotReached } from "./post-call";
import type { Settings } from "./settings";

const GIVE_UP_AFTER_MINUTES = 45;

export async function reconcileStuckCalls(
  deps: EngineDeps,
  settings: Settings,
): Promise<{ checked: number; resolved: number; review: number }> {
  const now = deps.clock.now();
  const cutoff = new Date(now.getTime() - settings.reconcile_after_minutes * 60_000);
  const stuck = await deps.db
    .select()
    .from(callAttempts)
    .where(
      and(
        inArray(callAttempts.status, ["dialing", "in_progress"]),
        lt(callAttempts.dialedAt, cutoff),
      ),
    )
    .limit(50);
  let resolved = 0;
  let review = 0;

  for (const a of stuck) {
    await deps.db.update(callAttempts).set({ reconciledAt: now }).where(eq(callAttempts.id, a.id));
    const ageMin = (now.getTime() - a.dialedAt.getTime()) / 60_000;

    if (!a.providerConversationId) {
      // We never learned the conversation id (crash during dial). Treat as not reached → normal retry rules.
      await recordNotReached(deps, a, "unknown", settings, now);
      resolved++;
      continue;
    }

    let status;
    try {
      status = await deps.voice.getStatus(a.providerConversationId);
    } catch (error) {
      deps.logger.warn("reconcile: provider status check failed", { attemptId: a.id, error });
      status = null;
    }

    if (status && (status.state === "done" || status.state === "failed")) {
      const event = status.event;
      const eventType =
        event.type === "transcription" ? "post_call_transcription" : "call_initiation_failure";
      const data =
        event.type === "transcription"
          ? { conversation_id: event.conversationId, ...(await rawFromEvent(event)) }
          : {
              conversation_id: event.conversationId,
              failure_reason: event.reason === "no_answer" ? "no-answer" : event.reason,
            };
      const inserted = await deps.db
        .insert(webhookEvents)
        .values({
          provider: deps.voice.name,
          eventType,
          eventKey: `${a.providerConversationId}:${eventType}`,
          payload: { type: eventType, source: "reconciliation", data },
          receivedAt: now,
        })
        .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.eventKey] })
        .returning({ id: webhookEvents.id });
      const id = inserted[0]?.id;
      if (id) await processWebhookEvent(deps, id);
      else {
        // The webhook did arrive at some point; make sure it's processed.
        const [existing] = await deps.db
          .select({ id: webhookEvents.id })
          .from(webhookEvents)
          .where(
            and(
              eq(webhookEvents.provider, deps.voice.name),
              eq(webhookEvents.eventKey, `${a.providerConversationId}:${eventType}`),
            ),
          );
        if (existing) await processWebhookEvent(deps, existing.id);
      }
      resolved++;
      continue;
    }

    if (status?.state === "not_found" || ageMin >= GIVE_UP_AFTER_MINUTES) {
      // Can't tell what happened. Don't guess: flag for a human, and treat as not reached so the family isn't left in the dark.
      await deps.db
        .update(callAttempts)
        .set({ status: "unknown", failureReason: "no result from provider" })
        .where(eq(callAttempts.id, a.id));
      const [c] = await deps.db.select().from(checkIns).where(eq(checkIns.id, a.checkInId));
      const [p] = await deps.db.select().from(parents).where(eq(parents.id, a.parentId));
      if (c && p && (c.status === "dialing" || c.status === "in_progress")) {
        await deps.db
          .update(checkIns)
          .set({ status: "needs_review", finishedAt: now, updatedAt: now, version: c.version + 1 })
          .where(eq(checkIns.id, c.id));
        await deps.db
          .insert(alerts)
          .values({
            familyId: p.familyId,
            parentId: p.id,
            checkInId: c.id,
            type: "needs_review",
            severity: "warning",
            title: "Call result unknown: needs review",
            detail: `Provider had no result for conversation ${a.providerConversationId} after ${Math.round(ageMin)} minutes.`,
            createdAt: now,
          })
          .onConflictDoNothing();
      }
      review++;
    }
  }
  return { checked: stuck.length, resolved, review };
}

/** Re-create ElevenLabs-shaped data from a parsed event (so the inbox row can be re-parsed). */
async function rawFromEvent(e: import("@/providers/voice/types").TranscriptionEvent) {
  return {
    status: e.status,
    transcript: e.transcript.map((t) => ({
      role: t.role,
      message: t.message,
      time_in_call_secs: t.timeInCallSecs,
    })),
    metadata: {
      start_time_unix_secs: e.startedAt ? Math.floor(e.startedAt.getTime() / 1000) : null,
      call_duration_secs: e.durationSecs,
      cost: e.providerCost,
      termination_reason: e.terminationReason,
      phone_call: { call_result: e.callResult },
    },
    analysis: {
      call_successful: e.callSuccessful,
      transcript_summary: e.providerSummary,
      data_collection_results: Object.fromEntries(
        Object.entries(e.dataCollection).map(([k, v]) => [k, { data_collection_id: k, value: v }]),
      ),
    },
    conversation_initiation_client_data: { dynamic_variables: e.dynamicVariables },
    has_audio: e.hasAudio,
  };
}
