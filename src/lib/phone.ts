/**
 * Phone numbers are stored in E.164 format (+919876543210).
 * An Indian 10-digit mobile like "98765 43210" becomes +919876543210.
 */
import { parsePhoneNumberFromString } from "libphonenumber-js/max";

export type PhoneResult = { ok: true; e164: string } | { ok: false; error: string };

export function normalizePhone(input: string, defaultCountry: "IN" = "IN"): PhoneResult {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "Please enter a phone number." };
  // "00" international prefix → "+"
  const cleaned = raw.startsWith("00") ? `+${raw.slice(2)}` : raw;
  const parsed = parsePhoneNumberFromString(cleaned, defaultCountry);
  if (!parsed || !parsed.isValid()) {
    return {
      ok: false,
      error:
        "This doesn't look like a valid phone number. Use a 10-digit Indian number or +country code.",
    };
  }
  return { ok: true, e164: parsed.number };
}

/** "+919876543210" → "+91 98765 43210" for display. */
export function formatPhone(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164);
  return parsed ? parsed.formatInternational() : e164;
}

/** Shows only the last 3 digits (admin lists, logs). */
export function maskedPhone(e164: string): string {
  return `•••• ${e164.slice(-3)}`;
}
