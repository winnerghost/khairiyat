/**
 * npm run call:test -- +91XXXXXXXXXX [female|male] [daily|consent] ["How to address you"]
 *
 * Places ONE real call through ElevenLabs to the number you give (your own
 * phone!), with sample memory, so you can hear the assistant. Needs
 * ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, ELEVENLABS_PHONE_NUMBER_ID and
 * ELEVENLABS_WEBHOOK_SECRET in .env.local. Costs a few minutes of credits.
 */
import { renderFirstMessage } from "../agent/first-messages";
import { assistantNameFor } from "@/config/brand";
import { normalizePhone } from "@/lib/phone";
import { createElevenLabsProvider } from "@/providers/voice/elevenlabs";

async function main() {
  const [numberArg, voiceArg, consentArg, nameArg] = process.argv.slice(2);
  const addressAs = nameArg?.trim() || "ji";
  const phone = normalizePhone(numberArg ?? "");
  if (!phone.ok)
    throw new Error(
      'Usage: npm run call:test -- +91XXXXXXXXXX [female|male] [daily|consent] ["Name"]',
    );
  const voice = voiceArg === "male" ? "male" : "female";
  const isConsent = consentArg === "consent";
  for (const k of ["ELEVENLABS_API_KEY", "ELEVENLABS_AGENT_ID", "ELEVENLABS_PHONE_NUMBER_ID"]) {
    if (!process.env[k]) throw new Error(`Set ${k} in .env.local first (see docs/GO_LIVE.md).`);
  }
  const provider = createElevenLabsProvider({
    apiKey: process.env.ELEVENLABS_API_KEY!,
    agentId: process.env.ELEVENLABS_AGENT_ID!,
    phoneNumberId: process.env.ELEVENLABS_PHONE_NUMBER_ID!,
    webhookSecret: process.env.ELEVENLABS_WEBHOOK_SECRET ?? "",
    telephony: process.env.ELEVENLABS_TELEPHONY === "sip_trunk" ? "sip_trunk" : "twilio",
    apiBase: process.env.ELEVENLABS_API_BASE || "https://api.elevenlabs.io",
    voiceIdFemale: process.env.ELEVENLABS_VOICE_ID_FEMALE || undefined,
    voiceIdMale: process.env.ELEVENLABS_VOICE_ID_MALE || undefined,
  });
  const assistant = assistantNameFor(voice);
  const vars = {
    first_message: renderFirstMessage({
      addressAs,
      assistantName: assistant,
      familyMemberName: "Khairiyat team",
      language: "hinglish",
      gender: voice,
      isConsentCall: isConsent,
    }),
    parent_name: "Test parent",
    address_as: addressAs,
    assistant_name: assistant,
    assistant_gender: voice,
    family_member_name: "Khairiyat team",
    language: "Hinglish",
    hearing_difficulty: "no",
    medicines_due_now: "BP ki goli",
    family_note_for_today: "This is a test call",
    last_calls_summary: "This is the first call.",
    follow_ups: "none",
    topics_enjoyed: "cricket, old songs",
    topics_to_avoid: "none",
    be_gentle_about: "none",
    is_consent_call: isConsent ? "yes" : "no",
    call_time: "9:30 am",
    max_minutes: 3,
  };
  console.log(
    `Calling ${phone.e164} as ${assistant} (${isConsent ? "introduction" : "daily"} call)…`,
  );
  const r = await provider.startCall({
    toNumber: phone.e164,
    dynamicVariables: vars,
    maxDurationSecs: 180,
    voice,
    language: "hinglish",
    meta: { parentId: "test", checkInId: "test", attemptId: "test" },
  });
  if (!r.ok) throw new Error(`Call failed to start: ${r.error}`);
  console.log(
    `✅ Ringing! conversation_id=${r.conversationId}. After the call, open it in ElevenLabs → Agents → Conversations, or run the app with the webhook set up to see the summary.`,
  );
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
