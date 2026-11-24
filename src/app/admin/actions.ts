"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { alerts, checkIns, plans, problemReports, webhookEvents } from "@/db/schema/app";
import { requestManualCall } from "@/engine/manual";
import { retryNotification } from "@/engine/notify";
import { getSettings, setSetting, type Settings } from "@/engine/settings";
import { processWebhookEvent } from "@/engine/webhooks";
import { audit } from "@/server/admin";
import { buildEngineDeps, kickEngine } from "@/server/engine-runner";
import { getParent, pauseParent, resumeParent } from "@/server/parents";
import { requireAdmin } from "@/server/session";

function back(path: string, flag: string): never {
  revalidatePath(path);
  redirect(`${path}${path.includes("?") ? "&" : "?"}done=${flag}`);
}

export async function adminCallNowAction(parentId: string) {
  const { db, user } = await requireAdmin();
  const r = await requestManualCall(db, parentId, new Date(), await getSettings(db));
  await audit(
    db,
    user,
    "parent.call_now",
    { type: "parent", id: parentId },
    { result: r.ok ? "queued" : r.reason },
  );
  if (r.ok) await kickEngine();
  back(`/admin/parents/${parentId}`, r.ok ? "calling" : r.reason);
}

export async function adminPauseAction(parentId: string) {
  const { db, user } = await requireAdmin();
  const p = await getParent(db, parentId);
  if (p?.status === "paused") await resumeParent(db, parentId, new Date());
  else
    await pauseParent(db, parentId, {
      until: null,
      reason: "Paused by Khairiyat team",
      now: new Date(),
    });
  await audit(db, user, p?.status === "paused" ? "parent.resume" : "parent.pause", {
    type: "parent",
    id: parentId,
  });
  back(`/admin/parents/${parentId}`, "updated");
}

export async function retryNotificationAction(id: string) {
  const { db, user } = await requireAdmin();
  await retryNotification(db, id, new Date());
  await audit(db, user, "notification.retry", { type: "notification", id });
  await kickEngine();
  back("/admin/failures", "retried");
}

export async function reprocessWebhookAction(id: string) {
  const { db, user } = await requireAdmin();
  await db
    .update(webhookEvents)
    .set({ status: "pending", attempts: 0 })
    .where(eq(webhookEvents.id, id));
  await processWebhookEvent(await buildEngineDeps(db), id);
  await audit(db, user, "webhook.reprocess", { type: "webhook_event", id });
  back("/admin/failures", "reprocessed");
}

export async function markReviewedAction(checkInId: string) {
  const { db, user } = await requireAdmin();
  await db
    .update(alerts)
    .set({ status: "resolved", acknowledgedAt: new Date(), acknowledgedByUserId: user.id })
    .where(eq(alerts.checkInId, checkInId));
  await db
    .update(checkIns)
    .set({ status: "failed", updatedAt: new Date() })
    .where(and(eq(checkIns.id, checkInId), inArray(checkIns.status, ["needs_review"])));
  await audit(db, user, "checkin.reviewed", { type: "check_in", id: checkInId });
  back("/admin/failures", "reviewed");
}

export async function resolveReportAction(id: string) {
  const { db, user } = await requireAdmin();
  await db.update(problemReports).set({ status: "resolved" }).where(eq(problemReports.id, id));
  await audit(db, user, "problem_report.resolve", { type: "problem_report", id });
  back("/admin/failures", "resolved");
}

export async function resolveAlertAction(id: string) {
  const { db, user } = await requireAdmin();
  await db
    .update(alerts)
    .set({ status: "resolved", acknowledgedAt: new Date(), acknowledgedByUserId: user.id })
    .where(eq(alerts.id, id));
  await audit(db, user, "alert.resolve", { type: "alert", id });
  back("/admin", "resolved");
}

const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").trim());

/** Save operational settings. Each key is validated; the calling window can only be narrowed. */
export async function saveSettingsAction(formData: FormData) {
  const { db, user } = await requireAdmin();
  const actor = { userId: user.id, label: user.email };
  const current = await getSettings(db);
  const next: Partial<Settings> = {
    calls_enabled: formData.get("calls_enabled") === "on",
    concurrency_limit: num(formData.get("concurrency_limit")),
    retry_policy: {
      delayMinutes: num(formData.get("retry_delay")),
      maxRetries: num(formData.get("retry_max")),
    },
    call_window: {
      start: String(formData.get("window_start") ?? "08:00"),
      end: String(formData.get("window_end") ?? "20:00"),
    },
    reconcile_after_minutes: num(formData.get("reconcile_after_minutes")),
    trial_days: num(formData.get("trial_days")),
    grace_days: num(formData.get("grace_days")),
    cost_rates: {
      aiPerMinInr: num(formData.get("ai_rate")),
      platformPerMinInr: num(formData.get("platform_rate")),
      telephonyPerMinInr: num(formData.get("telephony_rate")),
      whatsappPerMessageInr: num(formData.get("whatsapp_rate")),
    },
    feature_flags: {
      weeklyDigest: formData.get("ff_weekly") === "on",
      browserVoiceDemo: formData.get("ff_browser_voice") === "on",
      emailFallback: formData.get("ff_email_fallback") === "on",
    },
    gst: {
      enabled: formData.get("gst_enabled") === "on",
      gstin: String(formData.get("gstin") ?? "").trim(),
      ratePercent: num(formData.get("gst_rate")),
      legalName: String(formData.get("gst_name") ?? "").trim(),
      address: String(formData.get("gst_address") ?? "").trim(),
    },
  };
  try {
    for (const [key, value] of Object.entries(next) as [
      keyof Settings,
      Settings[keyof Settings],
    ][]) {
      if (JSON.stringify(current[key]) !== JSON.stringify(value))
        await setSetting(db, key, value as never, actor);
    }
  } catch {
    back("/admin/settings", "invalid");
  }
  back("/admin/settings", "saved");
}

export async function savePlanAction(planId: string, formData: FormData) {
  const { db, user } = await requireAdmin();
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(60),
      priceInr: z.coerce.number().int().min(0).max(100000),
      maxCallMinutes: z.coerce.number().int().min(1).max(15),
      seatLimit: z.union([z.literal(""), z.coerce.number().int().min(0)]),
      active: z.boolean(),
    })
    .safeParse({
      name: formData.get("name"),
      priceInr: formData.get("priceInr"),
      maxCallMinutes: formData.get("maxCallMinutes"),
      seatLimit: formData.get("seatLimit") ?? "",
      active: formData.get("active") === "on",
    });
  if (!parsed.success) back("/admin/settings", "invalid");
  const d = parsed.data;
  await db
    .update(plans)
    .set({
      name: d.name,
      priceInr: d.priceInr,
      maxCallMinutes: d.maxCallMinutes,
      seatLimit: d.seatLimit === "" ? null : d.seatLimit,
      active: d.active,
      updatedAt: new Date(),
    })
    .where(eq(plans.id, planId));
  await audit(db, user, "plan.update", { type: "plan", id: planId }, d);
  back("/admin/settings", "saved");
}
