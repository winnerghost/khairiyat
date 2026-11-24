/**
 * The ElevenLabs agent, as code. `npm run agent:sync` creates or updates
 * the real agent from this file: never edit the agent in the dashboard
 * (changes there are overwritten on the next sync).
 *
 * Field reference (checked 2026-11-24):
 * - Create/update agent: https://elevenlabs.io/docs/eleven-agents/api-reference/agents/create
 * - Overrides:           https://elevenlabs.io/docs/eleven-agents/customization/personalization/overrides
 * - Data collection:     https://elevenlabs.io/docs/eleven-agents/customization/agent-analysis/data-collection
 * - Evaluation:          https://elevenlabs.io/docs/eleven-agents/customization/agent-analysis/success-evaluation
 * - Privacy/retention:   https://elevenlabs.io/docs/eleven-agents/customization/privacy/retention
 * - System tools:        https://elevenlabs.io/docs/eleven-agents/customization/tools/system-tools/end-call
 *                        https://elevenlabs.io/docs/eleven-agents/customization/tools/system-tools/voicemail-detection
 * - Post-call webhooks:  https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks
 * Hindi = "hi" (seen in an existing agent's language_presets in the same workspace).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { brand } from "../src/config/brand";
import { DATA_COLLECTION } from "./data-collection";
import { EVALUATION_CRITERIA } from "./evaluation-criteria";

export const AGENT_NAME = `${brand.name} daily check-in`;

/** The longest plan (Abroad) allows 5 minutes; each call overrides this with its plan's limit. */
export const DEFAULT_MAX_DURATION_SECS = 300;

/** Placeholder values so the agent can be tried from the ElevenLabs dashboard. */
export const DYNAMIC_VARIABLE_PLACEHOLDERS: Record<string, string | number> = {
  first_message: `Namaste Maa! Main ${brand.assistantNames.female} bol rahi hoon, Riya ki taraf se aapki AI assistant. Aaj aapki tabiyat kaisi hai?`,
  parent_name: "Kamla Sharma",
  address_as: "Maa",
  assistant_name: brand.assistantNames.female,
  assistant_gender: "female",
  family_member_name: "Riya",
  language: "Hindi",
  hearing_difficulty: "no",
  medicines_due_now: "Metformin 500 (khaane ke saath)",
  family_note_for_today: "Riya's son Kabir won the drawing competition",
  last_calls_summary: "Mon 23 Nov: mood good, mentioned knee pain",
  follow_ups: "ask about knee pain",
  topics_enjoyed: "bhajans, grandkids Kabir and Myra",
  topics_to_avoid: "property matters",
  be_gentle_about: "knee pain",
  is_consent_call: "no",
  call_time: "9:30 am",
  max_minutes: 4,
};

export interface AgentBuildOptions {
  /** ElevenLabs voice for the female persona (Roshni). From your ElevenLabs voice library. */
  voiceIdFemale?: string;
  /** Workspace webhook id to send post-call results to (Agents settings → Webhooks). */
  postCallWebhookId?: string;
  llm?: string;
  ttsModelId?: string;
}

export function readSystemPrompt(): string {
  return readFileSync(path.join(process.cwd(), "agent", "system-prompt.md"), "utf8");
}

export function buildAgentPayload(opts: AgentBuildOptions = {}) {
  return {
    name: AGENT_NAME,
    tags: ["khairiyat"],
    conversation_config: {
      agent: {
        // The greeting (with the AI disclosure) is rendered per call by our server.
        first_message: "{{first_message}}",
        language: "hi",
        hinglish_mode: true,
        dynamic_variables: { dynamic_variable_placeholders: DYNAMIC_VARIABLE_PLACEHOLDERS },
        prompt: {
          prompt: readSystemPrompt(),
          llm: opts.llm ?? "gemini-2.5-flash",
          built_in_tools: {
            end_call: {
              type: "system",
              name: "end_call",
              description: "",
              params: { system_tool_type: "end_call" },
            },
            // We never leave a voicemail; the call just ends and counts as "not reached".
            voicemail_detection: {
              type: "system",
              name: "voicemail_detection",
              description: "",
              params: { system_tool_type: "voicemail_detection" },
            },
          },
        },
      },
      tts: {
        model_id: opts.ttsModelId ?? "eleven_v3_conversational",
        ...(opts.voiceIdFemale ? { voice_id: opts.voiceIdFemale } : {}),
        // Calm, slightly slower speech for elders.
        speed: 0.9,
        stability: 0.6,
      },
      turn: {
        // Patient turn-taking: elders pause to think.
        turn_eagerness: "patient",
        turn_timeout: 10,
        silence_end_call_timeout: 30,
      },
      conversation: { max_duration_seconds: DEFAULT_MAX_DURATION_SECS },
    },
    platform_settings: {
      data_collection: DATA_COLLECTION,
      evaluation: { criteria: EVALUATION_CRITERIA },
      // Per-call settings our server is allowed to change.
      overrides: {
        conversation_config_override: {
          agent: { language: true },
          tts: { voice_id: true },
          conversation: { max_duration_seconds: true },
        },
      },
      // Keep provider-side conversations no longer than our own transcript retention.
      privacy: { retention_days: 180, record_voice: true },
      ...(opts.postCallWebhookId
        ? {
            workspace_overrides: {
              webhooks: {
                post_call_webhook_id: opts.postCallWebhookId,
                events: ["transcript", "audio", "call_initiation_failure"],
              },
            },
          }
        : {}),
    },
  };
}
