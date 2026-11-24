import { describe, expect, it } from "vitest";
import { buildOutboundBody, createElevenLabsProvider, type ElevenLabsConfig } from "./elevenlabs";
import { signElevenLabsPayload } from "./signature";
import type { StartCallInput } from "./types";

const input: StartCallInput = {
  toNumber: "+919876543210",
  dynamicVariables: { address_as: "Maa", secret__attempt_id: "a1" },
  maxDurationSecs: 240,
  voice: "male",
  language: "ur",
  meta: { parentId: "p", checkInId: "c", attemptId: "a1" },
};

function cfg(
  fetchImpl: typeof fetch,
  telephony: "twilio" | "sip_trunk" = "sip_trunk",
): ElevenLabsConfig {
  return {
    apiKey: "xi-test",
    agentId: "agent_1",
    phoneNumberId: "phnum_1",
    webhookSecret: "whsec_test_secret",
    telephony,
    apiBase: "https://api.elevenlabs.io",
    voiceIdFemale: "voice_f",
    voiceIdMale: "voice_m",
    fetchImpl,
  };
}

describe("ElevenLabs provider", () => {
  it("builds the documented outbound-call body with per-call overrides", () => {
    const body = buildOutboundBody(cfg(fetch), input);
    expect(body).toEqual({
      agent_id: "agent_1",
      agent_phone_number_id: "phnum_1",
      to_number: "+919876543210",
      conversation_initiation_client_data: {
        dynamic_variables: { address_as: "Maa", secret__attempt_id: "a1" },
        conversation_config_override: {
          agent: { language: "hi" },
          conversation: { max_duration_seconds: 240 },
          tts: { voice_id: "voice_m" },
        },
      },
    });
  });

  it("calls the SIP endpoint with the API key and reads the conversation id", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify({
          success: true,
          message: "ok",
          conversation_id: "conv_9",
          sip_call_id: "sip_1",
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const r = await createElevenLabsProvider(cfg(fake)).startCall(input);
    expect(r).toEqual({ ok: true, conversationId: "conv_9", providerCallId: "sip_1" });
    expect(calls[0]!.url).toBe("https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call");
    expect((calls[0]!.init.headers as Record<string, string>)["xi-api-key"]).toBe("xi-test");
  });

  it("uses the Twilio endpoint and callSid for Twilio numbers", async () => {
    const fake = (async (url: string) => {
      expect(url).toContain("/v1/convai/twilio/outbound-call");
      return new Response(
        JSON.stringify({ success: true, message: "ok", conversation_id: "conv_1", callSid: "CA1" }),
      );
    }) as unknown as typeof fetch;
    expect(await createElevenLabsProvider(cfg(fake, "twilio")).startCall(input)).toEqual({
      ok: true,
      conversationId: "conv_1",
      providerCallId: "CA1",
    });
  });

  it("marks 5xx/429 as retryable and 4xx as not", async () => {
    const make = (status: number) =>
      (async () => new Response("nope", { status })) as unknown as typeof fetch;
    expect(await createElevenLabsProvider(cfg(make(503))).startCall(input)).toMatchObject({
      ok: false,
      retryable: true,
    });
    expect(await createElevenLabsProvider(cfg(make(429))).startCall(input)).toMatchObject({
      ok: false,
      retryable: true,
    });
    expect(await createElevenLabsProvider(cfg(make(422))).startCall(input)).toMatchObject({
      ok: false,
      retryable: false,
    });
  });

  it("maps conversation status for reconciliation", async () => {
    const fake = (async () =>
      new Response(
        JSON.stringify({
          conversation_id: "conv_1",
          status: "done",
          transcript: [{ role: "user", message: "Haan beta theek hoon", time_in_call_secs: 3 }],
          metadata: { call_duration_secs: 95, phone_call: { call_result: "answered" } },
          analysis: { data_collection_results: { mood: { data_collection_id: "mood", value: 4 } } },
          has_audio: true,
        }),
      )) as unknown as typeof fetch;
    const s = await createElevenLabsProvider(cfg(fake)).getStatus("conv_1");
    expect(s.state).toBe("done");
    if (s.state === "done") {
      expect(s.event.durationSecs).toBe(95);
      expect(s.event.dataCollection.mood).toBe(4);
      expect(s.event.callResult).toBe("answered");
    }
  });

  it("verifies webhook signatures on the raw body (valid, invalid, expired)", async () => {
    const p = createElevenLabsProvider(cfg(fetch));
    const now = new Date("2026-11-24T04:00:00Z");
    const raw = JSON.stringify({
      type: "call_initiation_failure",
      event_timestamp: 1,
      data: { conversation_id: "conv_2", failure_reason: "no-answer" },
    });
    const good = await signElevenLabsPayload(raw, "whsec_test_secret", now);
    const ok = await p.parseWebhook(raw, new Headers({ "elevenlabs-signature": good }), now);
    expect(ok).toMatchObject({
      ok: true,
      eventKey: "conv_2:call_initiation_failure",
      event: { type: "initiation_failure", reason: "no_answer" },
    });

    const tampered = await p.parseWebhook(
      raw.replace("no-answer", "busy"),
      new Headers({ "elevenlabs-signature": good }),
      now,
    );
    expect(tampered).toMatchObject({ ok: false, status: 401 });

    const wrongSecret = await signElevenLabsPayload(raw, "other", now);
    expect(
      await p.parseWebhook(raw, new Headers({ "elevenlabs-signature": wrongSecret }), now),
    ).toMatchObject({ ok: false });

    const old = await signElevenLabsPayload(
      raw,
      "whsec_test_secret",
      new Date(now.getTime() - 31 * 60_000),
    );
    expect(
      await p.parseWebhook(raw, new Headers({ "elevenlabs-signature": old }), now),
    ).toMatchObject({ ok: false, error: "signature timestamp too old" });

    expect(await p.parseWebhook(raw, new Headers(), now)).toMatchObject({
      ok: false,
      error: "missing signature header",
    });
  });

  it("never keeps base64 audio from post_call_audio webhooks", async () => {
    const p = createElevenLabsProvider(cfg(fetch));
    const now = new Date();
    const raw = JSON.stringify({
      type: "post_call_audio",
      event_timestamp: 1,
      data: { conversation_id: "conv_3", full_audio: "AAAA".repeat(1000) },
    });
    const r = await p.parseWebhook(
      raw,
      new Headers({
        "elevenlabs-signature": await signElevenLabsPayload(raw, "whsec_test_secret", now),
      }),
      now,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(JSON.stringify(r.payload)).not.toContain("AAAA");
  });
});
