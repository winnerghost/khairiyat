"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { demoScenarios } from "@/db/schema/app";
import { requestManualCall } from "@/engine/manual";
import { getSettings } from "@/engine/settings";
import { getEnv } from "@/lib/env";
import { SCENARIOS, type Scenario } from "@/providers/voice/mock-scripts";
import { pauseLocalTicker, resumeLocalTicker, tickOnce } from "@/server/engine-runner";
import { getParent } from "@/server/parents";
import { isAdminEmail, requireMember } from "@/server/session";
import { seedDemo, startDemoWorld } from "@/sim/demo-data";

function demoOnly() {
  const env = getEnv();
  if (!env.isDemo || env.APP_ENV === "production") redirect("/");
  return env;
}

/** Force the outcome of the parent's next call and dial now. */
export async function demoCallAction(formData: FormData) {
  demoOnly();
  const { db, family, user } = await requireMember();
  const parentId = String(formData.get("parentId") ?? "");
  const scenario = String(formData.get("scenario") ?? "happy");
  const parent = await getParent(db, parentId);
  if (!parent || (parent.familyId !== family.id && !isAdminEmail(user.email)))
    redirect("/demo?error=parent");
  if (!(SCENARIOS as readonly string[]).includes(scenario)) redirect("/demo?error=scenario");
  await db.delete(demoScenarios).where(eq(demoScenarios.parentId, parent.id));
  await db
    .insert(demoScenarios)
    .values({ parentId: parent.id, scenario: scenario as Scenario, createdAt: new Date() });
  const r = await requestManualCall(db, parent.id, new Date(), await getSettings(db));
  if (!r.ok) redirect(`/demo?error=${r.reason}`);
  await tickOnce();
  revalidatePath("/demo");
  redirect(`/demo?calling=${parent.id}`);
}

export async function demoTickAction() {
  demoOnly();
  await requireMember();
  await tickOnce();
  redirect("/demo?ticked=1");
}

export async function demoResetAction() {
  const env = demoOnly();
  await requireMember();
  pauseLocalTicker();
  try {
    const { getDb } = await import("@/db/client");
    const opts = {
      now: new Date(),
      days: 21,
      encryptionKey: env.DATA_ENCRYPTION_KEY,
      appUrl: env.APP_URL,
    };
    // Public demo website: only recreate the families here; the history is
    // then built in short steps on the next page loads (progress screen).
    if (env.isHostedDemo) await startDemoWorld(await getDb(), opts);
    else await seedDemo(await getDb(), opts);
  } finally {
    resumeLocalTicker();
  }
  // Everyone (including you) was signed out by the reset.
  redirect("/login?demo=reset");
}
