/**
 * Picks real or mock providers from configuration (see src/lib/env.ts).
 * Server-only.
 */
import type { Db } from "@/db/types";
import { systemClock, type Clock } from "@/engine/clock";
import { getEnv } from "@/lib/env";
import { createMockEmailProvider } from "@/providers/email/mock";
import { createMockVoiceProvider } from "@/providers/voice/mock";
import type { VoiceProvider } from "@/providers/voice/types";
import type { EmailProvider } from "@/providers/email/types";
import { createMockWhatsAppProvider } from "@/providers/whatsapp/mock";
import type { WhatsAppProvider } from "@/providers/whatsapp/types";

export class ProviderNotBuiltError extends Error {}

export function getEmailProvider(db: Db, clock: Clock = systemClock): EmailProvider {
  const env = getEnv();
  if (env.modes.email === "mock") return createMockEmailProvider(db, clock);
  // Demo-first build: the real Resend provider is added when going live.
  throw new ProviderNotBuiltError(
    "Real email (Resend) is not built yet in this demo version. Remove RESEND_* keys to use the demo inbox.",
  );
}

export function getWhatsAppProvider(db: Db, clock: Clock = systemClock): WhatsAppProvider {
  const env = getEnv();
  if (env.modes.whatsapp === "mock") return createMockWhatsAppProvider(db, clock);
  throw new ProviderNotBuiltError(
    "Real WhatsApp (Meta Cloud API) is not built yet in this demo version. Remove WHATSAPP_* keys to use the demo phone preview.",
  );
}

const DEMO_RESULT_DELAY_SECS = 12;

export function getVoiceProvider(db: Db, clock: Clock = systemClock): VoiceProvider {
  const env = getEnv();
  if (env.modes.voice === "mock") {
    // Demo: the "call" finishes ~12 seconds after dialing so you can watch the whole flow.
    return createMockVoiceProvider(db, clock, {
      resultDelaySecs: () => DEMO_RESULT_DELAY_SECS,
      seed: Date.now() % 100000,
    });
  }
  throw new ProviderNotBuiltError("ElevenLabs provider not wired yet.");
}
