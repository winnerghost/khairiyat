/**
 * Everything the engine needs, passed in (so it runs on Node, on Deno and
 * inside the week simulation with a fake clock and fake providers).
 */
import type { Db } from "@/db/types";
import type { Logger } from "@/lib/logger";
import type { EmailProvider } from "@/providers/email/types";
import type { VoiceProvider } from "@/providers/voice/types";
import type { WhatsAppProvider } from "@/providers/whatsapp/types";
import type { Clock } from "./clock";

export interface EngineDeps {
  db: Db;
  clock: Clock;
  voice: VoiceProvider;
  whatsapp: WhatsAppProvider;
  email: EmailProvider;
  logger: Logger;
  /** Public website address, for links in messages. */
  appUrl: string;
  /** For decrypting health notes into the call context. */
  encryptionKey: string;
  /** Optional hook: called after the engine enqueues urgent notifications. */
  onUrgent?: () => void;
}
