/**
 * Operational settings (stored in app_settings, edited in Admin → Settings).
 * Every value is validated; anything missing falls back to a safe default.
 * Runtime-agnostic (used by the engine on Node and Deno).
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { appSettings, auditLogs } from "@/db/schema/app";
import type { DbOrTx } from "@/db/types";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/);

export const settingsSchema = z.object({
  /** Kill switch: when false, no new calls are dialled (alerts still go out). */
  calls_enabled: z.boolean().default(true),
  /** Max simultaneous calls. Match the voice plan's concurrent-call limit. */
  concurrency_limit: z.number().int().min(1).max(100).default(4),
  retry_policy: z
    .object({
      delayMinutes: z.number().int().min(5).max(120),
      maxRetries: z.number().int().min(0).max(5),
    })
    .default({ delayMinutes: 15, maxRetries: 2 }),
  /** May only NARROW 08:00–20:00 (enforced in code and by the database). */
  call_window: z.object({ start: hhmm, end: hhmm }).default({ start: "08:00", end: "20:00" }),
  /** A dialled call with no result after this long is reconciled with the provider. */
  reconcile_after_minutes: z.number().int().min(2).max(60).default(10),
  /** If the scheduler was down, a missed call is still made up to this late. */
  late_call_limit_minutes: z.number().int().min(0).max(600).default(180),
  /** A call shorter than this with no words from the parent counts as voicemail / not reached. */
  voicemail_min_secs: z.number().int().min(5).max(120).default(20),
  trial_days: z.number().int().min(0).max(60).default(7),
  grace_days: z.number().int().min(0).max(30).default(3),
  cost_rates: z
    .object({
      aiPerMinInr: z.number().min(0),
      platformPerMinInr: z.number().min(0),
      telephonyPerMinInr: z.number().min(0),
      whatsappPerMessageInr: z.number().min(0),
    })
    .default({
      aiPerMinInr: 5.5,
      platformPerMinInr: 1.84,
      telephonyPerMinInr: 1.0,
      whatsappPerMessageInr: 0.145,
    }),
  /** GST-ready invoices: off until the business is GST-registered. */
  gst: z
    .object({
      enabled: z.boolean(),
      gstin: z.string().max(20),
      ratePercent: z.number().min(0).max(28),
      legalName: z.string().max(120),
      address: z.string().max(300),
    })
    .default({ enabled: false, gstin: "", ratePercent: 18, legalName: "", address: "" }),
  feature_flags: z
    .object({
      weeklyDigest: z.boolean(),
      browserVoiceDemo: z.boolean(),
      emailFallback: z.boolean(),
    })
    .default({ weeklyDigest: true, browserVoiceDemo: true, emailFallback: true }),
});

export type Settings = z.infer<typeof settingsSchema>;
export type SettingKey = keyof Settings;

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});

/** Read all settings, validated, with defaults for anything missing or invalid. */
export async function getSettings(db: DbOrTx): Promise<Settings> {
  const rows = await db.select().from(appSettings);
  const merged: Record<string, unknown> = {};
  for (const row of rows) merged[row.key] = row.value;
  const result: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(settingsSchema.shape) as SettingKey[]) {
    const parsed = settingsSchema.shape[key].safeParse(merged[key]);
    if (merged[key] !== undefined && parsed.success) result[key] = parsed.data;
  }
  return result as Settings;
}

export async function setSetting<K extends SettingKey>(
  db: DbOrTx,
  key: K,
  value: Settings[K],
  actor: { userId: string | null; label: string },
): Promise<void> {
  const parsed = settingsSchema.shape[key].parse(value);
  await db
    .insert(appSettings)
    .values({ key, value: parsed, updatedByUserId: actor.userId })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: parsed, updatedAt: new Date(), updatedByUserId: actor.userId },
    });
  await db.insert(auditLogs).values({
    actorUserId: actor.userId,
    actorLabel: actor.label,
    action: "settings.update",
    targetType: "setting",
    targetId: key,
    details: { value: parsed },
  });
}

export async function deleteSetting(db: DbOrTx, key: SettingKey): Promise<void> {
  await db.delete(appSettings).where(eq(appSettings.key, key));
}
