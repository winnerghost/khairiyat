/**
 * Brand settings in ONE place.
 *
 * To rename the product, change the colours or rename the assistant,
 * edit this file only. Every page, email, WhatsApp template preview and
 * the voice agent's dynamic variables read from here.
 *
 * Keep this file free of secrets and server-only imports: it is used by
 * both the website and the call engine.
 */

export type VoiceGender = "female" | "male";

export const brand = {
  /** Product name shown everywhere. */
  name: "Khairiyat",
  /** Name in Devanagari and Urdu script, for Hindi/Urdu copy. */
  nameHi: "ख़ैरियत",
  nameUr: "خیریت",
  /** One-line promise used in page titles and OpenGraph cards. */
  tagline: "Har subah, Maa ki khairiyat.",
  taglineEn: "A warm daily check-in call for your parents, and peace of mind for you.",

  /**
   * What the AI calls itself on the phone. It always says it is an AI
   * assistant set up by the family, and never pretends to be a person.
   */
  assistantNames: {
    female: "Roshni",
    male: "Aman",
  } satisfies Record<VoiceGender, string>,

  /**
   * Colours. These become CSS variables (see src/app/layout.tsx), so
   * changing a value here re-themes the whole app.
   */
  colors: {
    primary: "#A8462A", // terracotta: buttons, links
    primaryForeground: "#FFFFFF",
    accent: "#E3A23B", // marigold: highlights
    background: "#FBF6EE", // warm cream
    surface: "#FFFFFF",
    foreground: "#2B2118", // deep brown ink
    muted: "#6F6257",
    success: "#2F7A52", // "Spoke at 9:12"
    info: "#2F6690", // calm blue: "call planned", "on a call"
    warning: "#B7791F", // "Not reached, retrying"
    danger: "#B3261E", // urgent alerts
  },

  /** Public contact details. Real values come from env at runtime. */
  support: {
    /** Shown on the Help page; the actual number is set via SUPPORT_WHATSAPP_NUMBER. */
    whatsappLabel: "WhatsApp support",
  },
} as const;

/** The assistant's name for the voice the family picked. */
export function assistantNameFor(voice: VoiceGender): string {
  return brand.assistantNames[voice];
}
