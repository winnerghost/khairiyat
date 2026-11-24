export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export type SendResult =
  { ok: true; providerMessageId: string } | { ok: false; error: string; retryable: boolean };

export interface EmailProvider {
  readonly name: "mock" | "resend";
  send(message: EmailMessage): Promise<SendResult>;
}
