/**
 * What the agent extracts after each call (platform_settings.data_collection).
 * Shape per https://elevenlabs.io/docs/eleven-agents/customization/agent-analysis/data-collection :
 * a map of id → { type: "boolean" | "string" | "integer" | "number", description }.
 * Our post-call code (src/engine/post-call.ts) reads exactly these ids.
 */
type Field = { type: "boolean" | "string" | "integer" | "number"; description: string };

export const DATA_COLLECTION: Record<string, Field> = {
  consent_given: {
    type: "string",
    description:
      "Only for the introduction call (is_consent_call = yes): did the person agree to daily calls? Answer exactly 'yes', 'no' or 'unclear'. For daily calls answer 'yes'.",
  },
  mood: {
    type: "integer",
    description:
      "How the person sounded overall, 1 to 5: 1 very low, 2 a bit low, 3 okay, 4 good, 5 cheerful.",
  },
  mood_words: {
    type: "string",
    description: "A few of the person's own words about how they feel, e.g. 'theek hoon beta'.",
  },
  ate_meals: {
    type: "string",
    description:
      "What they said they ate today, in their words (self-reported). Empty if not discussed.",
  },
  medicines_taken: {
    type: "string",
    description:
      "For each medicine in medicines_due_now: 'Name: yes' if they said they took it, 'Name: no' if not, 'Name: unclear' if unclear. Separate with semicolons. Empty if no medicines were due.",
  },
  sleep: { type: "string", description: "How they said they slept. Empty if not discussed." },
  pain_or_symptoms: {
    type: "string",
    description:
      "Any pain, illness or symptoms they mentioned, in plain words. No diagnosis. Empty if none.",
  },
  red_flag: {
    type: "boolean",
    description:
      "true if they mentioned a fall, chest pain, breathlessness, confusion, bleeding, fainting or anything that sounds like an emergency.",
  },
  red_flag_detail: {
    type: "string",
    description: "If red_flag is true: what they said, in a short sentence. Otherwise empty.",
  },
  distress: {
    type: "boolean",
    description:
      "true if they said they feel hopeless, don't want to live, or talked about ending their life.",
  },
  wants_to_stop_calls: {
    type: "boolean",
    description: "true if they asked not to be called any more.",
  },
  follow_up_for_next_call: {
    type: "string",
    description:
      "One short thing worth asking about next time (e.g. 'ask if knee pain is better'). Empty if nothing.",
  },
  notable_moments: {
    type: "string",
    description: "A warm, nice moment from the chat in one sentence. Empty if none.",
  },
  summary_for_family_en: {
    type: "string",
    description:
      "A warm, factual summary for the family in English, max 600 characters. Mention food/medicines as 'self-reported'. Gentle tone; never scold or blame. No medical conclusions or diagnoses.",
  },
  summary_for_family_hi: {
    type: "string",
    description: "The same summary in simple Hindi (Devanagari), max 600 characters, same rules.",
  },
};
