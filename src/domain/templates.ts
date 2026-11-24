/**
 * WhatsApp/email message texts (English + Hindi).
 *
 * WhatsApp business-initiated messages must use pre-approved UTILITY
 * templates. The template bodies below are exactly what we submit to Meta
 * (see docs/whatsapp-templates.md); {{n}} are the parameters. `render()`
 * fills them so the in-app history, emails and the demo phone preview show
 * the same words the family receives.
 *
 * Tone rules: warm, factual, gentle. No medical conclusions. Self-reported
 * things are labelled as such. Never alarmist except for real alerts.
 */
import { brand } from "@/config/brand";
import { sanitizeTemplateParam } from "@/providers/whatsapp/types";

export type TemplateName =
  | "daily_summary"
  | "not_reached_alert"
  | "urgent_alert"
  | "consent_status"
  | "payment_issue"
  | "weekly_digest"
  | "daily_digest"
  | "call_problem"
  | "billing_notice";

export type Lang = "en" | "hi";

export const TEMPLATES: Record<TemplateName, Record<Lang, string>> = {
  billing_notice: {
    en: "{{1}}\n{{2}}",
    hi: "{{1}}\n{{2}}",
  },
  daily_summary: {
    en: "🌼 Today's call with {{1}}\nSpoke at {{2}}.\n\n{{3}}\n\nFull call: {{4}}",
    hi: "🌼 आज {{1}} से बात हुई\nसमय: {{2}}\n\n{{3}}\n\nपूरी बातचीत: {{4}}",
  },
  not_reached_alert: {
    en: "⚠️ We couldn't reach {{1}} today.\nWe called at {{2}} and tried {{3}} times, but there was no answer.\nPlease call them yourself or ask someone nearby to check.\n\nDetails: {{4}}",
    hi: "⚠️ आज हम {{1}} से बात नहीं कर पाए।\nहमने {{2}} बजे फ़ोन किया और {{3}} बार कोशिश की, पर किसी ने नहीं उठाया।\nकृपया आप ख़ुद फ़ोन करें या किसी पास वाले से पता करवाएँ।\n\nविवरण: {{4}}",
  },
  urgent_alert: {
    en:
      '🚨 Please call {{1}} now.\nOn today\'s call they mentioned {{2}}: "{{3}}"\nWe asked them to call family or 112 straight away.\n\nDetails: {{4}}\n(' +
      brand.name +
      " is not an emergency service. In an emergency, call 112.)",
    hi:
      '🚨 कृपया {{1}} को अभी फ़ोन करें।\nआज की बातचीत में उन्होंने बताया: {{2}} – "{{3}}"\nहमने उनसे तुरंत घर वालों को या 112 पर फ़ोन करने को कहा।\n\nविवरण: {{4}}\n(' +
      brand.nameHi +
      " आपातकालीन सेवा नहीं है। आपात स्थिति में 112 पर फ़ोन करें।)",
  },
  consent_status: {
    en: "{{1}}\n\n{{2}}",
    hi: "{{1}}\n\n{{2}}",
  },
  payment_issue: {
    en: "Your payment for {{1}}'s daily calls didn't go through.\nDon't worry: calls continue until {{2}}.\nPlease update your payment here: {{3}}",
    hi: "{{1}} की रोज़ की कॉल का भुगतान नहीं हो पाया।\nचिंता न करें: कॉल {{2}} तक चलती रहेंगी।\nकृपया यहाँ भुगतान अपडेट करें: {{3}}",
  },
  weekly_digest: {
    en: "📅 This week with {{1}}\n{{2}}\n\nSee more: {{3}}",
    hi: "📅 इस हफ़्ते {{1}} के साथ\n{{2}}\n\nऔर देखें: {{3}}",
  },
  daily_digest: {
    en: "🌙 Today with {{1}}\n{{2}}\n\nSee more: {{3}}",
    hi: "🌙 आज {{1}} के साथ\n{{2}}\n\nऔर देखें: {{3}}",
  },
  call_problem: {
    en: "Sorry. We couldn't make {{1}}'s call today because of a problem on our side. Our team has been alerted. You may want to call them yourself today.",
    hi: "माफ़ कीजिए। हमारी तरफ़ की एक दिक़्क़त की वजह से आज {{1}} को कॉल नहीं हो पाई। हमारी टीम को सूचना दे दी गई है। आज आप ख़ुद उन्हें फ़ोन कर लें।",
  },
};

export const TEMPLATE_SUBJECTS: Record<TemplateName, Record<Lang, string>> = {
  daily_summary: {
    en: `${brand.name}: today's call with {{1}}`,
    hi: `${brand.nameHi}: आज {{1}} से बात`,
  },
  not_reached_alert: {
    en: `⚠️ ${brand.name}: couldn't reach {{1}} today`,
    hi: `⚠️ ${brand.nameHi}: आज {{1}} से बात नहीं हो पाई`,
  },
  urgent_alert: {
    en: `🚨 ${brand.name}: please call {{1}} now`,
    hi: `🚨 ${brand.nameHi}: कृपया {{1}} को अभी फ़ोन करें`,
  },
  consent_status: {
    en: `${brand.name}: an update about {{1}}`,
    hi: `${brand.nameHi}: {{1}} के बारे में`,
  },
  payment_issue: {
    en: `${brand.name}: payment didn't go through`,
    hi: `${brand.nameHi}: भुगतान नहीं हो पाया`,
  },
  billing_notice: {
    en: `${brand.name}: about your plan`,
    hi: `${brand.nameHi}: आपके प्लान के बारे में`,
  },
  weekly_digest: {
    en: `${brand.name}: this week with {{1}}`,
    hi: `${brand.nameHi}: इस हफ़्ते {{1}} के साथ`,
  },
  daily_digest: { en: `${brand.name}: today with {{1}}`, hi: `${brand.nameHi}: आज {{1}} के साथ` },
  call_problem: {
    en: `${brand.name}: today's call couldn't be made`,
    hi: `${brand.nameHi}: आज कॉल नहीं हो पाई`,
  },
};

function fill(text: string, params: string[]): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_, n: string) => params[Number(n) - 1] ?? "");
}

export interface Rendered {
  params: string[];
  body: string;
  subject: string;
}

/** Sanitise parameters (WhatsApp rules) and render the full text. */
export function render(template: TemplateName, lang: Lang, rawParams: string[]): Rendered {
  const params = rawParams.map((p) => sanitizeTemplateParam(p));
  return {
    params,
    body: fill(TEMPLATES[template][lang], params),
    subject: fill(TEMPLATE_SUBJECTS[template][lang], params),
  };
}
