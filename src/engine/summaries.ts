/**
 * Family summaries (≤600 characters): warm, factual, gentle, no medical
 * conclusions, self-reported things labelled as such.
 *
 * We prefer the agent's own summary_for_family_en/hi (it heard the call),
 * cleaned up; if missing or unusable we build one from the structured fields.
 */
import type { MedicineAnswer } from "@/db/schema/app";
import { moodWord } from "@/domain/status";

export const SUMMARY_MAX = 600;

export interface SummaryFacts {
  addressAs: string;
  mood: number | null;
  moodWords: string | null;
  ateMeals: string | null;
  medicines: MedicineAnswer[];
  sleep: string | null;
  painOrSymptoms: string | null;
  notableMoments: string | null;
  redFlagDetail: string | null;
  distress: boolean;
  isConsentCall: boolean;
  consentGiven: "yes" | "no" | "unclear" | null;
}

/** Collapse whitespace, strip control characters, cap the length on a word boundary. */
export function cleanSummary(text: string | null | undefined, max = SUMMARY_MAX): string | null {
  if (!text) return null;
  const s = text
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length < 15) return null;
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > max * 0.7 ? lastSpace : cut.length)}…`;
}

function medsSentenceEn(meds: MedicineAnswer[]): string | null {
  if (meds.length === 0) return null;
  const yes = meds.filter((m) => m.taken === "yes").map((m) => m.name);
  const no = meds.filter((m) => m.taken === "no").map((m) => m.name);
  const parts: string[] = [];
  if (yes.length) parts.push(`said they took ${yes.join(", ")}`);
  if (no.length) parts.push(`hadn't taken ${no.join(", ")} yet (we gently reminded them)`);
  if (!parts.length) return "Medicines: not clear from the conversation.";
  return `Medicines: ${parts.join("; ")} (self-reported).`;
}

function medsSentenceHi(meds: MedicineAnswer[]): string | null {
  if (meds.length === 0) return null;
  const yes = meds.filter((m) => m.taken === "yes").map((m) => m.name);
  const no = meds.filter((m) => m.taken === "no").map((m) => m.name);
  const parts: string[] = [];
  if (yes.length) parts.push(`${yes.join(", ")} ले ली`);
  if (no.length) parts.push(`${no.join(", ")} अभी नहीं ली (हमने प्यार से याद दिलाया)`);
  if (!parts.length) return "दवाइयाँ: बातचीत से साफ़ नहीं हुआ।";
  return `दवाइयाँ: ${parts.join("; ")} (उन्होंने बताया)।`;
}

const MOOD_HI: Record<number, string> = {
  1: "बहुत उदास",
  2: "थोड़े उदास",
  3: "ठीक",
  4: "अच्छे",
  5: "बहुत ख़ुश",
};

export function buildSummaryEn(f: SummaryFacts): string {
  const s: string[] = [];
  if (f.isConsentCall) {
    if (f.consentGiven === "yes") s.push(`${f.addressAs} agreed to daily calls.`);
    else if (f.consentGiven === "no") s.push(`${f.addressAs} said no to daily calls for now.`);
    else
      s.push(
        `We introduced ourselves to ${f.addressAs}, but couldn't clearly confirm if daily calls are okay.`,
      );
  }
  const mood = moodWord(f.mood);
  if (mood) s.push(`${f.addressAs} sounded ${mood}${f.moodWords ? ` ("${f.moodWords}")` : ""}.`);
  if (f.ateMeals) s.push(`Food: ${f.ateMeals}.`);
  const meds = medsSentenceEn(f.medicines);
  if (meds) s.push(meds);
  if (f.sleep) s.push(`Sleep: ${f.sleep}.`);
  if (f.painOrSymptoms) s.push(`Mentioned: ${f.painOrSymptoms}.`);
  if (f.redFlagDetail) s.push(`Please check on them: ${f.redFlagDetail}.`);
  if (f.distress) s.push("They sounded very low today; a call from you would help.");
  if (f.notableMoments)
    s.push(f.notableMoments.endsWith(".") ? f.notableMoments : `${f.notableMoments}.`);
  if (s.length === 0) s.push(`Spoke with ${f.addressAs} today.`);
  return cleanSummary(s.join(" ").replace(/\.\./g, ".")) ?? `Spoke with ${f.addressAs} today.`;
}

export function buildSummaryHi(f: SummaryFacts): string {
  const s: string[] = [];
  if (f.isConsentCall) {
    if (f.consentGiven === "yes") s.push(`${f.addressAs} रोज़ की कॉल के लिए मान गए।`);
    else if (f.consentGiven === "no") s.push(`${f.addressAs} ने अभी रोज़ की कॉल के लिए मना किया है।`);
    else s.push(`हमने ${f.addressAs} से परिचय किया, पर साफ़ नहीं हुआ कि रोज़ की कॉल ठीक है या नहीं।`);
  }
  if (f.mood)
    s.push(
      `${f.addressAs} ${MOOD_HI[Math.max(1, Math.min(5, f.mood))]} लगे${f.moodWords ? ` ("${f.moodWords}")` : ""}।`,
    );
  if (f.ateMeals) s.push(`खाना: ${f.ateMeals}।`);
  const meds = medsSentenceHi(f.medicines);
  if (meds) s.push(meds);
  if (f.sleep) s.push(`नींद: ${f.sleep}।`);
  if (f.painOrSymptoms) s.push(`बताया: ${f.painOrSymptoms}।`);
  if (f.redFlagDetail) s.push(`कृपया उनका हाल पूछ लें: ${f.redFlagDetail}।`);
  if (f.distress) s.push("आज वे बहुत उदास लगे; आपका एक फ़ोन उन्हें अच्छा लगेगा।");
  if (f.notableMoments) s.push(f.notableMoments);
  if (s.length === 0) s.push(`आज ${f.addressAs} से बात हुई।`);
  return cleanSummary(s.join(" ")) ?? `आज ${f.addressAs} से बात हुई।`;
}
