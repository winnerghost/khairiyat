/**
 * Real voice provider: ElevenLabs Agents.
 *
 * Endpoints (checked 2026-11-24):
 * - Outbound call (Twilio number):  POST /v1/convai/twilio/outbound-call
 *   https://elevenlabs.io/docs/eleven-agents/api-reference/integrations/twilio/outbound-call
 * - Outbound call (SIP trunk):      POST /v1/convai/sip-trunk/outbound-call
 *   https://elevenlabs.io/docs/eleven-agents/api-reference/sip-trunk/outbound-call
 *   Body: agent_id, agent_phone_number_id, to_number, conversation_initiation_client_data
 *   Response: success, message, conversation_id, sip_call_id (SIP) / callSid (Twilio)
 * - Conversation status:            GET /v1/convai/conversations/{conversation_id}
 *   https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/get
 *   status: initiated | in-progress | processing | done | failed
 * - Audio:                          GET /v1/convai/conversations/{conversation_id}/audio
 * - Post-call webhooks + HMAC:      https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks
 * Auth header: xi-api-key.
 */
import { parseElevenLabsEnvelope, toTranscriptionEvent } from "./elevenlabs-payload";
import { SIGNATURE_HEADER, verifyElevenLabsSignature } from "./signature";
import type {
  ConversationStatus,
  ParsedWebhook,
  StartCallInput,
  StartCallResult,
  VoiceProvider,
} from "./types";

export interface ElevenLabsConfig {
  apiKey: string;
  agentId: string;
  phoneNumberId: string;
  webhookSecret: string;
  telephony: "twilio" | "sip_trunk";
  apiBase: string;
  voiceIdFemale?: string;
  voiceIdMale?: string;
  fetchImpl?: typeof fetch;
  /** Request timeout (ms). */
  timeoutMs?: number;
}

/** Our parent language → agent ASR/TTS language code. Urdu is spoken Hindustani: recognised as "hi". */
export function agentLanguage(lang: StartCallInput["language"]): string {
  return lang === "en" ? "en" : "hi";
}

export function buildOutboundBody(cfg: ElevenLabsConfig, input: StartCallInput) {
  const voiceId = input.voice === "male" ? cfg.voiceIdMale : cfg.voiceIdFemale;
  return {
    agent_id: cfg.agentId,
    agent_phone_number_id: cfg.phoneNumberId,
    to_number: input.toNumber,
    conversation_initiation_client_data: {
      dynamic_variables: input.dynamicVariables,
      // Allowed by the agent's platform_settings.overrides (see agent/agent.config.ts).
      conversation_config_override: {
        agent: { language: agentLanguage(input.language) },
        conversation: { max_duration_seconds: input.maxDurationSecs },
        ...(voiceId ? { tts: { voice_id: voiceId } } : {}),
      },
    },
  };
}

export function createElevenLabsProvider(cfg: ElevenLabsConfig): VoiceProvider {
  const f = cfg.fetchImpl ?? fetch;
  const base = cfg.apiBase.replace(/\/$/, "");
  const timeoutMs = cfg.timeoutMs ?? 20_000;

  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    return f(`${base}${path}`, {
      ...init,
      headers: {
        "xi-api-key": cfg.apiKey,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  return {
    name: "elevenlabs",

    async startCall(input: StartCallInput): Promise<StartCallResult> {
      const path =
        cfg.telephony === "twilio"
          ? "/v1/convai/twilio/outbound-call"
          : "/v1/convai/sip-trunk/outbound-call";
      let res: Response;
      try {
        res = await request(path, {
          method: "POST",
          body: JSON.stringify(buildOutboundBody(cfg, input)),
        });
      } catch (error) {
        return {
          ok: false,
          error: `network: ${error instanceof Error ? error.message : String(error)}`,
          retryable: true,
        };
      }
      const text = await res.text();
      let json: Record<string, unknown> = {};
      try {
        json = JSON.parse(text) as Record<string, unknown>;
      } catch {
        // keep text for the error message
      }
      if (!res.ok) {
        const retryable = res.status >= 500 || res.status === 429 || res.status === 408;
        return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 300)}`, retryable };
      }
      const conversationId = typeof json.conversation_id === "string" ? json.conversation_id : null;
      if (json.success !== true || !conversationId) {
        return {
          ok: false,
          error: `call not started: ${String(json.message ?? text).slice(0, 300)}`,
          retryable: true,
        };
      }
      const callId = (json.callSid ?? json.sip_call_id ?? null) as string | null;
      return { ok: true, conversationId, providerCallId: callId };
    },

    async getStatus(conversationId: string): Promise<ConversationStatus> {
      const res = await request(`/v1/convai/conversations/${encodeURIComponent(conversationId)}`);
      if (res.status === 404) return { state: "not_found" };
      if (!res.ok) throw new Error(`ElevenLabs status HTTP ${res.status}`);
      const json = (await res.json()) as Record<string, unknown>;
      const status = String(json.status ?? "");
      if (status === "initiated" || status === "in-progress" || status === "processing")
        return { state: "in_progress" };
      const event = toTranscriptionEvent(json);
      return status === "failed" ? { state: "failed", event } : { state: "done", event };
    },

    async parseWebhook(rawBody: string, headers: Headers, now: Date): Promise<ParsedWebhook> {
      const sig = await verifyElevenLabsSignature(
        rawBody,
        headers.get(SIGNATURE_HEADER),
        cfg.webhookSecret,
        now,
      );
      if (!sig.ok) return { ok: false, status: 401, error: sig.error };
      const parsed = parseElevenLabsEnvelope(rawBody);
      return parsed.ok ? parsed : { ok: false, status: 400, error: parsed.error };
    },
  };
}

/** Stream a conversation's recording (used by the authenticated /api/audio proxy). */
export async function fetchConversationAudio(
  cfg: Pick<ElevenLabsConfig, "apiKey" | "apiBase">,
  conversationId: string,
): Promise<Response> {
  return fetch(
    `${cfg.apiBase.replace(/\/$/, "")}/v1/convai/conversations/${encodeURIComponent(conversationId)}/audio`,
    {
      headers: { "xi-api-key": cfg.apiKey },
      signal: AbortSignal.timeout(30_000),
    },
  );
}

/** Signed URL for a browser conversation (the API key never reaches the browser). */
export async function getSignedUrl(
  cfg: Pick<ElevenLabsConfig, "apiKey" | "apiBase" | "agentId">,
): Promise<string> {
  // https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/get-signed-url
  const res = await fetch(
    `${cfg.apiBase.replace(/\/$/, "")}/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(cfg.agentId)}`,
    { headers: { "xi-api-key": cfg.apiKey }, signal: AbortSignal.timeout(15_000) },
  );
  if (!res.ok) throw new Error(`signed url HTTP ${res.status}`);
  const json = (await res.json()) as { signed_url?: string };
  if (!json.signed_url) throw new Error("no signed_url in response");
  return json.signed_url;
}
