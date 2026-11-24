/**
 * Demo email: nothing leaves the machine. Messages are stored in
 * mock_messages and shown at /demo/inbox.
 */
import { mockMessages } from "@/db/schema/app";
import type { DbOrTx } from "@/db/types";
import type { Clock } from "@/engine/clock";
import type { EmailMessage, EmailProvider, SendResult } from "./types";

export interface MockFailureSwitch {
  /** Return an error message to make the next send fail (tests, simulation). */
  shouldFail?: (to: string) => string | null;
}

export function createMockEmailProvider(
  db: DbOrTx,
  clock: Clock,
  failures: MockFailureSwitch = {},
): EmailProvider {
  return {
    name: "mock",
    async send(message: EmailMessage): Promise<SendResult> {
      const failure = failures.shouldFail?.(message.to);
      if (failure) return { ok: false, error: failure, retryable: true };
      const [row] = await db
        .insert(mockMessages)
        .values({
          channel: "email",
          toAddress: message.to.toLowerCase(),
          subject: message.subject,
          body: message.text,
          createdAt: clock.now(),
        })
        .returning({ id: mockMessages.id });
      return { ok: true, providerMessageId: `mock-email-${row!.id}` };
    },
  };
}
