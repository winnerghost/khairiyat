import { and, eq } from "drizzle-orm";
import { callAttempts, callResults, checkIns, parents } from "@/db/schema/app";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { fetchConversationAudio } from "@/providers/voice/elevenlabs";
import { elevenLabsConfig } from "@/server/providers";
import { requireMember } from "@/server/session";

/**
 * Plays a call recording. We never store audio ourselves: it streams from
 * ElevenLabs through here, and only to members of the parent's family.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/audio/[checkInId]">) {
  const { checkInId } = await ctx.params;
  const { db, family } = await requireMember();
  if (getEnv().modes.voice !== "elevenlabs")
    return new Response("No recordings in demo mode", { status: 404 });
  if (!/^[0-9a-f-]{36}$/i.test(checkInId)) return new Response("Not found", { status: 404 });
  const [row] = await db
    .select({ conv: callAttempts.providerConversationId, hasAudio: callResults.hasAudio })
    .from(callResults)
    .innerJoin(checkIns, eq(checkIns.id, callResults.checkInId))
    .innerJoin(parents, eq(parents.id, checkIns.parentId))
    .innerJoin(callAttempts, eq(callAttempts.id, callResults.attemptId))
    .where(and(eq(callResults.checkInId, checkInId), eq(parents.familyId, family.id)))
    .limit(1);
  if (!row?.conv || !row.hasAudio) return new Response("Not found", { status: 404 });
  const upstream = await fetchConversationAudio(elevenLabsConfig(), row.conv);
  if (!upstream.ok || !upstream.body) {
    logger.warn("audio: provider returned an error", { status: upstream.status });
    return new Response("Recording not available", { status: 502 });
  }
  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
      "Cache-Control": "private, no-store",
    },
  });
}
