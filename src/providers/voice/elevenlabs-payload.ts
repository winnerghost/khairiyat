/**
 * Turn ElevenLabs JSON into our CallEvent types. Shared by the real
 * provider and the mock (which produces the same JSON), so demo mode
 * exercises the exact same mapping code.
 *
 * Field reference (read 2026-11-24):
 * - Post-call webhooks: https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks
 * - Get conversation:   https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/get
 */
import { z } from "zod";
import type { TranscriptTurn } from "@/db/schema/app";
import type {
  CallEvent,
  InitiationFailureEvent,
  PhoneCallResult,
  TranscriptionEvent,
} from "./types";

const turnSchema = z.object({
  role: z.string(),
  message: z.string().nullable().optional(),
  time_in_call_secs: z.number().nullable().optional(),
});

const conversationSchema = z.object({
  conversation_id: z.string().min(1),
  status: z.string().optional(),
  transcript: z.array(turnSchema).nullable().optional(),
  metadata: z
    .object({
      start_time_unix_secs: z.number().nullable().optional(),
      call_duration_secs: z.number().nullable().optional(),
      cost: z.number().nullable().optional(),
      termination_reason: z.string().nullable().optional(),
      phone_call: z
        .object({ call_result: z.string().nullable().optional() })
        .passthrough()
        .nullable()
        .optional(),
    })
    .passthrough()
    .nullable()
    .optional(),
  analysis: z
    .object({
      call_successful: z.string().nullable().optional(),
      transcript_summary: z.string().nullable().optional(),
      data_collection_results: z
        .record(z.string(), z.object({ value: z.unknown().optional() }).passthrough())
        .nullable()
        .optional(),
    })
    .passthrough()
    .nullable()
    .optional(),
  conversation_initiation_client_data: z
    .object({ dynamic_variables: z.record(z.string(), z.unknown()).nullable().optional() })
    .passthrough()
    .nullable()
    .optional(),
  has_audio: z.boolean().nullable().optional(),
});

const PHONE_RESULTS = new Set<PhoneCallResult>([
  "answered",
  "voicemail",
  "busy",
  "no_answer",
  "failed",
]);

/** A conversation object (webhook `data` or GET /conversations/{id}) → TranscriptionEvent. */
export function toTranscriptionEvent(data: unknown): TranscriptionEvent {
  const c = conversationSchema.parse(data);
  const transcript: TranscriptTurn[] = (c.transcript ?? [])
    .filter(
      (t) =>
        (t.role === "agent" || t.role === "user") &&
        typeof t.message === "string" &&
        t.message.trim(),
    )
    .map((t) => ({
      role: t.role as "agent" | "user",
      message: (t.message ?? "").trim(),
      timeInCallSecs: Math.max(0, Math.round(t.time_in_call_secs ?? 0)),
    }));
  const dc: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c.analysis?.data_collection_results ?? {}))
    dc[k] = v.value ?? null;
  const callResultRaw = c.metadata?.phone_call?.call_result ?? null;
  const callSuccessful = c.analysis?.call_successful;
  return {
    type: "transcription",
    conversationId: c.conversation_id,
    status: c.status ?? "done",
    transcript,
    durationSecs: Math.max(0, Math.round(c.metadata?.call_duration_secs ?? 0)),
    startedAt: c.metadata?.start_time_unix_secs
      ? new Date(c.metadata.start_time_unix_secs * 1000)
      : null,
    providerCost: c.metadata?.cost ?? null,
    callResult:
      callResultRaw && PHONE_RESULTS.has(callResultRaw as PhoneCallResult)
        ? (callResultRaw as PhoneCallResult)
        : null,
    terminationReason: c.metadata?.termination_reason ?? null,
    callSuccessful:
      callSuccessful === "success" || callSuccessful === "failure" || callSuccessful === "unknown"
        ? callSuccessful
        : null,
    providerSummary: c.analysis?.transcript_summary ?? null,
    dataCollection: dc,
    dynamicVariables: c.conversation_initiation_client_data?.dynamic_variables ?? {},
    hasAudio: c.has_audio ?? false,
  };
}

const envelopeSchema = z.object({
  type: z.string(),
  event_timestamp: z.number().optional(),
  data: z.record(z.string(), z.unknown()),
});

export type ParsedEnvelope =
  | {
      ok: true;
      event: CallEvent;
      eventType: string;
      eventKey: string;
      payload: Record<string, unknown>;
    }
  | { ok: false; error: string };

/** Parse a verified webhook body. Never keeps base64 audio. */
export function parseElevenLabsEnvelope(rawBody: string): ParsedEnvelope {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { ok: false, error: "body is not JSON" };
  }
  const env = envelopeSchema.safeParse(json);
  if (!env.success) return { ok: false, error: "unexpected webhook envelope" };
  const { type, data } = env.data;
  const conversationId = typeof data.conversation_id === "string" ? data.conversation_id : "";
  if (!conversationId) return { ok: false, error: "missing conversation_id" };

  if (type === "post_call_transcription") {
    try {
      const event = toTranscriptionEvent(data);
      return {
        ok: true,
        event,
        eventType: type,
        eventKey: `${conversationId}:${type}`,
        payload: env.data,
      };
    } catch {
      return { ok: false, error: "invalid post_call_transcription data" };
    }
  }
  if (type === "post_call_audio") {
    // Drop the (large, sensitive) base64 audio: we stream audio from the provider on demand.
    const { full_audio: _dropped, ...rest } = data;
    void _dropped;
    return {
      ok: true,
      event: { type: "audio", conversationId },
      eventType: type,
      eventKey: `${conversationId}:${type}`,
      payload: { type, data: rest },
    };
  }
  if (type === "call_initiation_failure") {
    const r = data.failure_reason;
    const reason: InitiationFailureEvent["reason"] =
      r === "busy" ? "busy" : r === "no-answer" ? "no_answer" : "unknown";
    return {
      ok: true,
      event: { type: "initiation_failure", conversationId, reason },
      eventType: type,
      eventKey: `${conversationId}:${type}`,
      payload: env.data,
    };
  }
  return { ok: false, error: `unsupported webhook type ${type}` };
}
