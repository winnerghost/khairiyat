"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requestManualCall } from "@/engine/manual";
import { getSettings } from "@/engine/settings";
import { kickEngine } from "@/server/engine-runner";
import { requireParent } from "@/server/session";

const REASONS: Record<string, string> = {
  not_allowed_status: "call-blocked-status",
  outside_window: "call-blocked-window",
  calls_disabled: "call-blocked-disabled",
  limit_reached: "call-blocked-limit",
  call_in_progress: "call-blocked-busy",
};

export async function callNowAction(parentId: string) {
  const { db, parent } = await requireParent(parentId);
  const result = await requestManualCall(db, parent.id, new Date(), await getSettings(db));
  if (result.ok) await kickEngine();
  revalidatePath(`/app/parents/${parent.id}`);
  redirect(
    `/app/parents/${parent.id}?done=${result.ok ? "call-requested" : REASONS[result.reason]}`,
  );
}
