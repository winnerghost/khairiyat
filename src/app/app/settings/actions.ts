"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { familyMembers, families } from "@/db/schema/app";
import { normalizePhone } from "@/lib/phone";
import { isValidTimeZone } from "@/lib/time";
import { deleteAccount } from "@/server/account";
import { createInvitation } from "@/server/families";
import { requireMember } from "@/server/session";

export async function savePreferencesAction(formData: FormData) {
  const { db, member } = await requireMember();
  const schema = z.object({
    displayName: z.string().trim().min(1).max(80),
    whatsapp: z.string().trim().max(30),
    notifyMode: z.enum(["every_call", "alerts_only", "daily_digest"]),
    summaryLanguage: z.enum(["en", "hi"]),
    timezone: z.string().refine(isValidTimeZone),
    whatsappEnabled: z.boolean(),
    emailEnabled: z.boolean(),
  });
  const parsed = schema.safeParse({
    displayName: formData.get("displayName"),
    whatsapp: formData.get("whatsapp") ?? "",
    notifyMode: formData.get("notifyMode"),
    summaryLanguage: formData.get("summaryLanguage"),
    timezone: formData.get("timezone"),
    whatsappEnabled: formData.get("whatsappEnabled") === "on",
    emailEnabled: formData.get("emailEnabled") === "on",
  });
  if (!parsed.success) redirect("/app/settings?error=invalid");
  let whatsappE164: string | null = null;
  if (parsed.data.whatsapp) {
    const p = normalizePhone(parsed.data.whatsapp);
    if (!p.ok) redirect("/app/settings?error=phone");
    whatsappE164 = p.e164;
  }
  if (!parsed.data.whatsappEnabled && !parsed.data.emailEnabled)
    redirect("/app/settings?error=channels");
  await db
    .update(familyMembers)
    .set({
      displayName: parsed.data.displayName,
      whatsappE164,
      notifyMode: parsed.data.notifyMode,
      summaryLanguage: parsed.data.summaryLanguage,
      timezone: parsed.data.timezone,
      whatsappEnabled: parsed.data.whatsappEnabled,
      emailEnabled: parsed.data.emailEnabled,
    })
    .where(eq(familyMembers.id, member.id));
  revalidatePath("/app");
  redirect("/app/settings?saved=1");
}

export async function inviteAction(formData: FormData) {
  const { db, family, user } = await requireMember();
  const email = z.email().safeParse(
    String(formData.get("email") ?? "")
      .trim()
      .toLowerCase(),
  );
  if (!email.success) redirect("/app/settings?error=invite");
  const { token } = await createInvitation(db, {
    familyId: family.id,
    email: email.data,
    invitedByUserId: user.id,
    now: new Date(),
  });
  redirect(`/app/settings?invite=${encodeURIComponent(token)}#family`);
}

export async function retentionAction(formData: FormData) {
  const { db, family, member } = await requireMember();
  if (member.role !== "owner") redirect("/app/settings?error=owner");
  const days = z.coerce.number().int().min(30).max(730).safeParse(formData.get("days"));
  if (!days.success) redirect("/app/settings?error=retention");
  await db
    .update(families)
    .set({ transcriptRetentionDays: days.data })
    .where(eq(families.id, family.id));
  redirect("/app/settings?saved=1#privacy");
}

export async function deleteAccountAction(formData: FormData) {
  const { db, user } = await requireMember();
  if (
    String(formData.get("confirm") ?? "")
      .trim()
      .toUpperCase() !== "DELETE"
  ) {
    redirect("/app/settings?error=confirm#privacy");
  }
  // Deleting the user also deletes their sessions, so they are signed out.
  await deleteAccount(db, user.id);
  redirect("/?account=deleted");
}
