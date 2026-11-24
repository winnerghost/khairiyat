/**
 * WhatsApp provider. Real messages to families must use pre-approved
 * UTILITY templates (see docs/whatsapp-templates.md); `body` is the fully
 * rendered text we keep for the in-app history and the demo phone preview.
 */
export interface WhatsAppTemplateMessage {
  to: string; // E.164
  template: string; // e.g. "daily_summary"
  language: "en" | "hi";
  params: string[];
  body: string;
}

export type SendResult =
  { ok: true; providerMessageId: string } | { ok: false; error: string; retryable: boolean };

export interface WhatsAppProvider {
  readonly name: "mock" | "meta";
  sendTemplate(message: WhatsAppTemplateMessage): Promise<SendResult>;
}

/**
 * Template parameters can't contain newlines, tabs or 4+ consecutive spaces.
 * Also trims to a safe length.
 */
export function sanitizeTemplateParam(value: string, maxLength = 900): string {
  const cleaned = value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {4,}/g, "   ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
}
