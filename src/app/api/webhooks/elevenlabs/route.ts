import { after } from "next/server";
import { ingestVoiceWebhook, processWebhookEvent } from "@/engine/webhooks";
import { logger } from "@/lib/logger";
import { buildEngineDeps } from "@/server/engine-runner";

/**
 * ElevenLabs post-call webhooks (post_call_transcription, post_call_audio,
 * call_initiation_failure). We read the RAW body for signature checking,
 * store the event, answer 200 fast, and process right after the response.
 * If processing dies, the next tick finds the stored event.
 * Docs: https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 25 * 1024 * 1024) return new Response("too large", { status: 413 });
  const deps = await buildEngineDeps();
  const result = await ingestVoiceWebhook(deps, raw, request.headers);
  if (result.status !== 200)
    return Response.json({ error: result.error }, { status: result.status });
  if (result.eventId) {
    const id = result.eventId;
    after(async () => {
      try {
        await processWebhookEvent(deps, id);
      } catch (error) {
        logger.error("webhook: background processing failed (tick will retry)", { error });
      }
    });
  }
  return Response.json({ received: true, duplicate: result.duplicate });
}
