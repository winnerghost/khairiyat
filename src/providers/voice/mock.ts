/**
 * Mock voice provider (demo mode + simulation). Behaves like ElevenLabs:
 * dialing returns a conversation id, and a few seconds later (demo) or a
 * few minutes later (simulation) a signed webhook arrives, in the real
 * ElevenLabs JSON format. It can also simulate outages, lost webhooks,
 * duplicates and out-of-order delivery.
 */
import { and, asc, eq, lte } from "drizzle-orm";
import { demoScenarios, mockCalls } from "@/db/schema/app";
import type { DbOrTx } from "@/db/types";
import type { Clock } from "@/engine/clock";
import { parseElevenLabsEnvelope, toTranscriptionEvent } from "./elevenlabs-payload";
import { buildScenario, type Scenario, scenarioDuration, SCENARIOS } from "./mock-scripts";
import { SIGNATURE_HEADER, signElevenLabsPayload, verifyElevenLabsSignature } from "./signature";
import type {
  ConversationStatus,
  ParsedWebhook,
  StartCallInput,
  StartCallResult,
  VoiceProvider,
} from "./types";

export const DEMO_WEBHOOK_SECRET = "demo-elevenlabs-webhook-secret";

export interface MockVoiceOptions {
  webhookSecret?: string;
  /** Seconds from dial until the result webhook (demo: short so people see it). */
  resultDelaySecs?: (scenario: Scenario, talkSecs: number) => number;
  /** Pick a scenario when none was forced from the demo control room. */
  chooseScenario?: (input: StartCallInput, rand: () => number) => Scenario;
  /** Return an error to simulate a provider outage at dial time. */
  failStart?: (input: StartCallInput) => string | null;
  /** Lose the webhook for this call (only reconciliation will find it). */
  dropWebhook?: (scenario: Scenario, input: StartCallInput) => boolean;
  /** Deliver each webhook twice (tests idempotency). */
  duplicateWebhooks?: boolean;
  /** Send the audio webhook BEFORE the transcription one. */
  audioFirst?: boolean;
  seed?: number;
}

/** Small deterministic PRNG (mulberry32) so runs are repeatable. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Demo default: mostly warm, ordinary calls. Red flags only when you ask for them. */
export function demoScenarioChooser(input: StartCallInput, rand: () => number): Scenario {
  if (input.dynamicVariables["is_consent_call"] === "yes") return "consent_yes";
  const r = rand();
  if (r < 0.08) return "no_answer";
  if (r < 0.12) return "voicemail";
  const happy: Scenario[] = [
    "happy",
    "happy",
    "happy",
    "meds_missed",
    "lonely",
    "robot_question",
    "talks_forever",
  ];
  if (input.language === "ur") return "urdu";
  return happy[Math.floor(rand() * happy.length)]!;
}

export function createMockVoiceProvider(
  db: DbOrTx,
  clock: Clock,
  options: MockVoiceOptions = {},
): VoiceProvider {
  const secret = options.webhookSecret ?? DEMO_WEBHOOK_SECRET;
  const rand = prng(options.seed ?? 42);
  const chooser = options.chooseScenario ?? demoScenarioChooser;
  const delay = options.resultDelaySecs ?? ((_s, talk) => talk + 5);

  return {
    name: "mock",

    async startCall(input: StartCallInput): Promise<StartCallResult> {
      const outage = options.failStart?.(input);
      if (outage) return { ok: false, error: outage, retryable: true };
      const now = clock.now();

      // The demo control room can force the next call's outcome.
      const [forced] = await db
        .select()
        .from(demoScenarios)
        .where(eq(demoScenarios.parentId, input.meta.parentId))
        .limit(1);
      if (forced)
        await db.delete(demoScenarios).where(eq(demoScenarios.parentId, input.meta.parentId));
      const scenario: Scenario =
        forced && (SCENARIOS as readonly string[]).includes(forced.scenario)
          ? (forced.scenario as Scenario)
          : chooser(input, rand);

      const conversationId = `mock_conv_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
      const built = buildScenario(scenario, input.dynamicVariables);
      const talk = built.initiationFailure ? 0 : scenarioDuration(scenario, input.maxDurationSecs);
      const events: Record<string, unknown>[] = [];
      const ts = Math.floor(now.getTime() / 1000);

      if (built.initiationFailure) {
        events.push({
          type: "call_initiation_failure",
          event_timestamp: ts + 30,
          data: {
            agent_id: "mock_agent",
            conversation_id: conversationId,
            failure_reason: built.initiationFailure,
            metadata: {
              type: "sip",
              body: { sip_status_code: built.initiationFailure === "busy" ? 486 : 480 },
            },
          },
        });
      } else {
        let t = 0;
        const transcript = built.turns.map((turn) => {
          const row = {
            role: turn.role,
            message: turn.message,
            time_in_call_secs: t,
            tool_calls: null,
            tool_results: null,
            feedback: null,
          };
          t += Math.max(3, Math.round((talk / Math.max(1, built.turns.length)) * 0.9));
          return row;
        });
        const data = {
          agent_id: "mock_agent",
          conversation_id: conversationId,
          status: "done",
          transcript,
          metadata: {
            start_time_unix_secs: ts + 8,
            call_duration_secs: talk,
            cost: Math.round(talk * 10),
            termination_reason:
              scenario === "talks_forever" ? "max_duration_reached" : "end_call tool was called",
            phone_call: {
              type: "sip_trunking",
              direction: "outbound",
              call_result: built.callResult,
            },
          },
          analysis: {
            call_successful: built.callResult === "answered" ? "success" : "failure",
            transcript_summary: "Mock conversation.",
            data_collection_results: Object.fromEntries(
              Object.entries(built.data).map(([k, val]) => [
                k,
                { data_collection_id: k, value: val, rationale: "mock" },
              ]),
            ),
            evaluation_criteria_results: {},
          },
          conversation_initiation_client_data: { dynamic_variables: input.dynamicVariables },
          has_audio: built.callResult === "answered",
        };
        const transcription = {
          type: "post_call_transcription",
          event_timestamp: ts + talk + 10,
          data,
        };
        const audio = {
          type: "post_call_audio",
          event_timestamp: ts + talk + 12,
          data: {
            agent_id: "mock_agent",
            conversation_id: conversationId,
            full_audio: "SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4",
          },
        };
        if (built.callResult === "answered") {
          if (options.audioFirst) events.push(audio, transcription);
          else events.push(transcription, audio);
        } else {
          events.push(transcription);
        }
      }

      const drop = scenario === "lost_webhook" || (options.dropWebhook?.(scenario, input) ?? false);
      await db.insert(mockCalls).values({
        conversationId,
        scenario,
        payload: { events, talkSecs: talk, dialedAt: now.toISOString() },
        deliverAt: new Date(now.getTime() + delay(scenario, talk) * 1000),
        dropWebhook: drop,
        createdAt: now,
      });
      return { ok: true, conversationId, providerCallId: `mock_sip_${conversationId.slice(-8)}` };
    },

    async getStatus(conversationId: string): Promise<ConversationStatus> {
      const [row] = await db
        .select()
        .from(mockCalls)
        .where(eq(mockCalls.conversationId, conversationId))
        .limit(1);
      if (!row) return { state: "not_found" };
      const payload = row.payload as {
        events: { type: string; data: Record<string, unknown> }[];
        talkSecs: number;
        dialedAt: string;
      };
      const endsAt = new Date(payload.dialedAt).getTime() + (payload.talkSecs + 10) * 1000;
      if (clock.now().getTime() < endsAt) return { state: "in_progress" };
      const failure = payload.events.find((e) => e.type === "call_initiation_failure");
      if (failure) {
        const r = failure.data.failure_reason;
        return {
          state: "failed",
          event: {
            type: "initiation_failure",
            conversationId,
            reason: r === "busy" ? "busy" : r === "no-answer" ? "no_answer" : "unknown",
          },
        };
      }
      const tr = payload.events.find((e) => e.type === "post_call_transcription");
      if (!tr) return { state: "not_found" };
      return { state: "done", event: toTranscriptionEvent(tr.data) };
    },

    async parseWebhook(rawBody: string, headers: Headers, now: Date): Promise<ParsedWebhook> {
      const sig = await verifyElevenLabsSignature(
        rawBody,
        headers.get(SIGNATURE_HEADER),
        secret,
        now,
      );
      if (!sig.ok) return { ok: false, status: 401, error: sig.error };
      const parsed = parseElevenLabsEnvelope(rawBody);
      return parsed.ok ? parsed : { ok: false, status: 400, error: parsed.error };
    },

    async pump(deliver, now): Promise<number> {
      const due = await db
        .select()
        .from(mockCalls)
        .where(
          and(
            eq(mockCalls.delivered, false),
            eq(mockCalls.dropWebhook, false),
            lte(mockCalls.deliverAt, now),
          ),
        )
        .orderBy(asc(mockCalls.deliverAt))
        .limit(50);
      let n = 0;
      for (const row of due) {
        // Mark first: a crash mid-delivery must not cause an endless loop (the inbox dedupes anyway).
        await db
          .update(mockCalls)
          .set({ delivered: true })
          .where(eq(mockCalls.conversationId, row.conversationId));
        const payload = row.payload as { events: Record<string, unknown>[] };
        for (const ev of payload.events) {
          const raw = JSON.stringify(ev);
          const headers = new Headers({
            [SIGNATURE_HEADER]: await signElevenLabsPayload(raw, secret, now),
            "content-type": "application/json",
          });
          await deliver(raw, headers);
          if (options.duplicateWebhooks) await deliver(raw, headers);
          n++;
        }
      }
      return n;
    },
  };
}
