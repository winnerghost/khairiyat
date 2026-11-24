/**
 * Demo WhatsApp: messages are stored in mock_messages and shown in the
 * "phone preview" at /demo/phone. Nothing is sent.
 */
import { mockMessages } from "@/db/schema/app";
import type { DbOrTx } from "@/db/types";
import type { Clock } from "@/engine/clock";
import type { SendResult, WhatsAppProvider, WhatsAppTemplateMessage } from "./types";

export interface MockWhatsAppOptions {
  shouldFail?: (to: string) => string | null;
}

export function createMockWhatsAppProvider(
  db: DbOrTx,
  clock: Clock,
  options: MockWhatsAppOptions = {},
): WhatsAppProvider {
  return {
    name: "mock",
    async sendTemplate(message: WhatsAppTemplateMessage): Promise<SendResult> {
      const failure = options.shouldFail?.(message.to);
      if (failure) return { ok: false, error: failure, retryable: true };
      const [row] = await db
        .insert(mockMessages)
        .values({
          channel: "whatsapp",
          toAddress: message.to,
          body: message.body,
          template: message.template,
          createdAt: clock.now(),
        })
        .returning({ id: mockMessages.id });
      return { ok: true, providerMessageId: `mock-wa-${row!.id}` };
    },
  };
}
