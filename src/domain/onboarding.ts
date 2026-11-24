/**
 * Onboarding wizard: steps and validation (zod).
 * The same schemas are used when editing later.
 */
import { z } from "zod";
import { normalizePhone } from "@/lib/phone";
import { hhmmToMinutes, isValidTimeZone, LATEST_SCHEDULE_TIME } from "@/lib/time";

export const ONBOARDING_STEPS = [
  { key: "profile", title: "About your parent" },
  { key: "schedule", title: "Call time" },
  { key: "medicines", title: "Medicines" },
  { key: "personalize", title: "Things they love" },
  { key: "health", title: "Health notes" },
  { key: "contacts", title: "Who to alert" },
  { key: "consent", title: "Consent" },
] as const;

export type StepKey = (typeof ONBOARDING_STEPS)[number]["key"];

export function stepIndex(key: StepKey): number {
  return ONBOARDING_STEPS.findIndex((s) => s.key === key);
}

export function isStepKey(value: string): value is StepKey {
  return ONBOARDING_STEPS.some((s) => s.key === value);
}

const name = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `Please enter ${label}.`)
    .max(max, `Please keep ${label} under ${max} characters.`);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Please keep this under ${max} characters.`)
    .optional()
    .transform((v) => (v ? v : null));

const phone = z.string().transform((value, ctx) => {
  const r = normalizePhone(value);
  if (!r.ok) {
    ctx.addIssue({ code: "custom", message: r.error });
    return z.NEVER;
  }
  return r.e164;
});

const checkbox = z
  .union([
    z.literal("on"),
    z.literal("true"),
    z.literal("1"),
    z.literal(""),
    z.undefined(),
    z.null(),
  ])
  .transform((v) => v === "on" || v === "true" || v === "1");

const hhmm = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Please pick a valid time.");

export const profileSchema = z.object({
  name: name(80, "their name"),
  addressAs: name(40, "how the assistant should address them"),
  phone,
  language: z.enum(["hi", "hinglish", "ur", "en"]),
  voice: z.enum(["female", "male"]),
  hearingDifficulty: checkbox,
  city: optionalText(60),
});

export const scheduleSchema = z
  .object({
    callTime: hhmm,
    days: z.array(z.coerce.number().int().min(1).max(7)).min(1, "Pick at least one day."),
    timezone: z.string().refine(isValidTimeZone, "Please pick a valid time zone."),
  })
  .superRefine((v, ctx) => {
    const t = hhmmToMinutes(v.callTime);
    if (t < hhmmToMinutes("08:00") || t > hhmmToMinutes(LATEST_SCHEDULE_TIME)) {
      ctx.addIssue({
        code: "custom",
        path: ["callTime"],
        message:
          "Please pick a time between 8:00 am and 7:30 pm. We never call after 8 pm, and this leaves time for retries.",
      });
    }
  });

export const medicineSchema = z
  .object({
    name: name(80, "the medicine name"),
    timing: z.enum(["morning", "afternoon", "night", "custom"]),
    customTime: z.string().optional().nullable(),
    withFood: z.enum(["with", "without", "either"]),
    notes: optionalText(200),
  })
  .superRefine((m, ctx) => {
    if (
      m.timing === "custom" &&
      !(m.customTime && /^([01]\d|2[0-3]):([0-5]\d)$/.test(m.customTime))
    ) {
      ctx.addIssue({ code: "custom", path: ["customTime"], message: "Please pick a time." });
    }
  });

export const medicinesSchema = z.object({
  medicines: z.array(medicineSchema).max(15, "Up to 15 medicines."),
});

/** "cricket, bhajans\nold songs" → ["cricket", "bhajans", "old songs"] */
export function splitList(raw: string | null | undefined, maxItems = 10, maxLen = 60): string[] {
  return (raw ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map((s) => s.slice(0, maxLen));
}

export const personalizeSchema = z.object({
  topicsEnjoyed: z
    .string()
    .optional()
    .transform((v) => splitList(v)),
  topicsToAvoid: z
    .string()
    .optional()
    .transform((v) => splitList(v)),
  familyNews: z
    .string()
    .optional()
    .transform((v) => splitList(v, 3, 200)),
});

export const healthSchema = z.object({
  healthNotes: z
    .string()
    .trim()
    .max(1000, "Please keep health notes under 1000 characters.")
    .optional()
    .transform((v) => v ?? ""),
});

export const contactSchema = z.object({
  name: name(60, "their name"),
  relation: optionalText(40),
  whatsapp: phone,
  email: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.toLowerCase() : null))
    .refine((v) => v === null || z.email().safeParse(v).success, "Please enter a valid email."),
  alertOnUnreachable: z.boolean().default(true),
  alertOnRedFlag: z.boolean().default(true),
});

export const contactsSchema = z.object({
  contacts: z
    .array(contactSchema)
    .min(1, "Please add at least one person to alert.")
    .max(3, "Up to 3 people."),
});

export const consentSchema = z.object({
  toldParent: checkbox.refine((v) => v, "Please confirm you've told your parent about the calls."),
});

export type FieldErrors = Record<string, string>;

/** zod issues → { "contacts.0.whatsapp": "message" } for showing next to fields. */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    out[key] ??= issue.message;
  }
  return out;
}

export const LANGUAGE_LABELS: Record<"hi" | "hinglish" | "ur" | "en", string> = {
  hi: "Hindi",
  hinglish: "Hinglish",
  ur: "Urdu",
  en: "English",
};

export const WEEKDAYS = [
  { value: 1, short: "Mon" },
  { value: 2, short: "Tue" },
  { value: 3, short: "Wed" },
  { value: 4, short: "Thu" },
  { value: 5, short: "Fri" },
  { value: 6, short: "Sat" },
  { value: 7, short: "Sun" },
] as const;
