"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { checkIns, problemReports } from "@/db/schema/app";
import { zonedToInstant } from "@/lib/time";
import {
  addNextCallNote,
  deleteNote,
  deleteParent,
  pauseParent,
  restartWithConsentCall,
  resumeParent,
  skipToday,
} from "@/server/parents";
import { rateLimit } from "@/server/rate-limit";
import { requireParent } from "@/server/session";

function back(parentId: string, flag: string): never {
  revalidatePath(`/app/parents/${parentId}`);
  redirect(`/app/parents/${parentId}?done=${flag}`);
}

export async function pauseAction(parentId: string, formData: FormData) {
  const { db, parent } = await requireParent(parentId);
  const untilRaw = String(formData.get("until") ?? "").trim();
  const reason =
    String(formData.get("reason") ?? "")
      .trim()
      .slice(0, 100) || null;
  let until: Date | null = null;
  if (untilRaw && /^\d{4}-\d{2}-\d{2}$/.test(untilRaw)) {
    // Resume at the start of that day in the parent's time zone.
    until = zonedToInstant(untilRaw, "00:00", parent.timezone);
    if (until.getTime() <= Date.now()) until = null;
  }
  await pauseParent(db, parent.id, { until, reason, now: new Date() });
  back(parent.id, "paused");
}

export async function resumeAction(parentId: string) {
  const { db, parent } = await requireParent(parentId);
  await resumeParent(db, parent.id, new Date());
  back(parent.id, "resumed");
}

export async function skipTodayAction(parentId: string) {
  const { db, parent } = await requireParent(parentId);
  const r = await skipToday(db, parent, new Date());
  back(
    parent.id,
    r.ok ? "skipped" : r.reason === "in_progress" ? "skip-in-progress" : "skip-too-late",
  );
}

export async function addNoteAction(parentId: string, formData: FormData) {
  const { db, parent, member } = await requireParent(parentId);
  const text = z.string().trim().min(1).max(200).safeParse(formData.get("note"));
  if (!text.success) back(parent.id, "note-invalid");
  await addNextCallNote(db, parent.id, text.data, member.id);
  back(parent.id, "note");
}

export async function deleteNoteAction(parentId: string, noteId: string) {
  const { db, parent } = await requireParent(parentId);
  await deleteNote(db, parent.id, noteId);
  back(parent.id, "note-removed");
}

export async function restartAction(parentId: string) {
  const { db, parent } = await requireParent(parentId);
  await restartWithConsentCall(db, parent.id, new Date());
  back(parent.id, "restarted");
}

export async function deleteParentAction(parentId: string, formData: FormData) {
  const { db, parent } = await requireParent(parentId);
  if (
    String(formData.get("confirm") ?? "")
      .trim()
      .toLowerCase() !== parent.addressAs.trim().toLowerCase()
  ) {
    redirect(`/app/parents/${parent.id}/delete?error=1`);
  }
  await deleteParent(db, parent.id);
  revalidatePath("/app");
  redirect("/app?deleted=1");
}

export async function reportProblemAction(parentId: string, checkInId: string, formData: FormData) {
  const { db, parent, family, user } = await requireParent(parentId);
  if (!rateLimit(`report:${user.id}`, 10, 3600_000))
    redirect(`/app/parents/${parent.id}/calls/${checkInId}?report=invalid`);
  const message = z.string().trim().min(3).max(1000).safeParse(formData.get("message"));
  if (!message.success) redirect(`/app/parents/${parent.id}/calls/${checkInId}?report=invalid`);
  // The call must belong to this parent (no cross-family ids).
  const [owned] = await db
    .select({ id: checkIns.id })
    .from(checkIns)
    .where(and(eq(checkIns.id, checkInId), eq(checkIns.parentId, parent.id)))
    .limit(1);
  if (!owned) redirect(`/app/parents/${parent.id}`);
  await db.insert(problemReports).values({
    familyId: family.id,
    parentId: parent.id,
    checkInId,
    reporterUserId: user.id,
    message: message.data,
  });
  redirect(`/app/parents/${parent.id}/calls/${checkInId}?report=sent`);
}
