/**
 * Voice provider interface. ElevenLabs Agents today; Bolna or others can be
 * added later by implementing this interface.
 */
import type { TranscriptTurn } from "@/db/schema/app";

/** Values sent to the agent before the call (memory, names, medicines…). */
export type DynamicVariables = Record<string, string | number | boolean>;

export interface StartCallInput {
  toNumber: string; // E.164
  dynamicVariables: DynamicVariables;
  /** Hard limit for the conversation length (plan-dependent). */
  maxDurationSecs: number;
  voice: "female" | "male";
  language: "hi" | "hinglish" | "ur" | "en";
  /** Our ids, used by the mock and for correlation. */
  meta: { parentId: string; checkInId: string; attemptId: string };
}

export type StartCallResult =
  | { ok: true; conversationId: string; providerCallId: string | null }
  | { ok: false; error: string; retryable: boolean };

export type PhoneCallResult = "answered" | "voicemail" | "busy" | "no_answer" | "failed";

/** A finished conversation (from a webhook or fetched during reconciliation). */
export interface TranscriptionEvent {
  type: "transcription";
  conversationId: string;
  status: string; // provider status, e.g. "done" | "failed"
  transcript: TranscriptTurn[];
  durationSecs: number;
  startedAt: Date | null;
  /** Provider-reported cost (provider units), if any. */
  providerCost: number | null;
  callResult: PhoneCallResult | null;
  terminationReason: string | null;
  callSuccessful: "success" | "failure" | "unknown" | null;
  providerSummary: string | null;
  /** data_collection_results flattened to { id: value }. */
  dataCollection: Record<string, unknown>;
  dynamicVariables: Record<string, unknown>;
  hasAudio: boolean;
}

export interface AudioEvent {
  type: "audio";
  conversationId: string;
}

export interface InitiationFailureEvent {
  type: "initiation_failure";
  conversationId: string;
  reason: "busy" | "no_answer" | "unknown";
}

export type CallEvent = TranscriptionEvent | AudioEvent | InitiationFailureEvent;

export type ParsedWebhook =
  | {
      ok: true;
      event: CallEvent;
      eventType: string;
      eventKey: string;
      payload: Record<string, unknown>;
    }
  | { ok: false; status: 400 | 401; error: string };

export type ConversationStatus =
  | { state: "in_progress" }
  | { state: "done"; event: TranscriptionEvent }
  | { state: "failed"; event: TranscriptionEvent | InitiationFailureEvent }
  | { state: "not_found" };

export interface VoiceProvider {
  readonly name: string;
  startCall(input: StartCallInput): Promise<StartCallResult>;
  getStatus(conversationId: string): Promise<ConversationStatus>;
  /** Verify the signature on the RAW body, then parse. */
  parseWebhook(rawBody: string, headers: Headers, now: Date): Promise<ParsedWebhook>;
  /**
   * Mock only: deliver fake webhooks that are due, by calling `deliver` with
   * a signed raw body, exactly like the real provider would POST them.
   */
  pump?(deliver: (rawBody: string, headers: Headers) => Promise<void>, now: Date): Promise<number>;
}
