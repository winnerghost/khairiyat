import { asc, eq } from "drizzle-orm";
import { assistantNameFor } from "@/config/brand";
import { parents } from "@/db/schema/app";
import { getSettings } from "@/engine/settings";
import { buildCallContext } from "@/engine/memory";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getSignedUrl } from "@/providers/voice/elevenlabs";
import { elevenLabsConfig } from "@/server/providers";
import { rateLimit } from "@/server/rate-limit";
import { requireMember } from "@/server/session";
import { renderFirstMessage } from "../../../../../agent/first-messages";

/**
 * "Talk to the assistant in your browser": returns a short-lived signed
 * URL (the API key stays on the server) plus the same call memory a real
 * call to your parent would get, so you hear exactly what they would.
 */
export async function POST() {
  const env = getEnv();
  if (env.modes.browserVoice !== "enabled")
    return Response.json({ error: "not configured" }, { status: 404 });
  const { db, family, member, user } = await requireMember();
  if (!rateLimit(`voice:${user.id}`, 10, 3600_000))
    return Response.json({ error: "too many sessions" }, { status: 429 });
  const settings = await getSettings(db);
  if (!settings.feature_flags.browserVoiceDemo)
    return Response.json({ error: "disabled" }, { status: 404 });

  const [parent] = await db
    .select()
    .from(parents)
    .where(eq(parents.familyId, family.id))
    .orderBy(asc(parents.createdAt))
    .limit(1);
  let dynamicVariables: Record<string, string | number | boolean>;
  if (parent) {
    const ctx = await buildCallContext(db, {
      parent,
      checkIn: { id: crypto.randomUUID(), isConsentCall: false },
      attemptId: crypto.randomUUID(),
      now: new Date(),
      encryptionKey: env.DATA_ENCRYPTION_KEY,
    });
    dynamicVariables = Object.fromEntries(
      Object.entries(ctx.dynamicVariables).filter(([k]) => !k.startsWith("secret__")),
    );
  } else {
    const name = assistantNameFor("female");
    const first = member.displayName.split(" ")[0] ?? "ji";
    dynamicVariables = {
      first_message: renderFirstMessage({
        addressAs: first,
        assistantName: name,
        familyMemberName: "aapke ghar wale",
        language: "hinglish",
        gender: "female",
        isConsentCall: false,
      }),
      parent_name: first,
      address_as: first,
      assistant_name: name,
      assistant_gender: "female",
      family_member_name: "aapke ghar wale",
      language: "Hinglish",
      hearing_difficulty: "no",
      medicines_due_now: "none",
      family_note_for_today: "none",
      last_calls_summary: "This is the first call.",
      follow_ups: "none",
      topics_enjoyed: "none",
      topics_to_avoid: "none",
      be_gentle_about: "none",
      is_consent_call: "no",
      call_time: "9:30 am",
      max_minutes: 3,
    };
  }
  try {
    const signedUrl = await getSignedUrl(elevenLabsConfig());
    return Response.json(
      { signedUrl, dynamicVariables },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logger.error("voice session: could not get signed url", { error });
    return Response.json({ error: "voice service unavailable" }, { status: 502 });
  }
}
