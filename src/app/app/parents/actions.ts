"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import {
  consentSchema,
  contactsSchema,
  healthSchema,
  isStepKey,
  medicinesSchema,
  personalizeSchema,
  profileSchema,
  scheduleSchema,
  toFieldErrors,
  type FieldErrors,
  type StepKey,
} from "@/domain/onboarding";
import { getSettings } from "@/engine/settings";
import { getEnv } from "@/lib/env";
import {
  completeOnboarding,
  createParent,
  missingSetup,
  nextStepAfter,
  saveContacts,
  saveHealthNotes,
  saveMedicines,
  savePersonalize,
  saveProfile,
  saveSchedule,
} from "@/server/parents";
import { requireMember, requireParent } from "@/server/session";

export interface StepState {
  fieldErrors?: FieldErrors;
  error?: string;
}

function parseJsonField(formData: FormData, name: string): unknown {
  try {
    return JSON.parse(String(formData.get(name) ?? "[]"));
  } catch {
    return [];
  }
}

function parse<T extends z.ZodType>(
  schema: T,
  input: unknown,
): { data?: z.infer<T>; errors?: FieldErrors } {
  const r = schema.safeParse(input);
  return r.success ? { data: r.data } : { errors: toFieldErrors(r.error) };
}

function profileInput(formData: FormData) {
  return {
    name: formData.get("name") ?? "",
    addressAs: formData.get("addressAs") ?? "",
    phone: formData.get("phone") ?? "",
    language: formData.get("language") ?? "hi",
    voice: formData.get("voice") ?? "female",
    hearingDifficulty: formData.get("hearingDifficulty") ?? undefined,
    city: formData.get("city") ?? "",
  };
}

/** Step 1 for a new parent: creates them, then continues the wizard. */
export async function createParentAction(_prev: StepState, formData: FormData): Promise<StepState> {
  const { db, family } = await requireMember();
  const { data, errors } = parse(profileSchema, profileInput(formData));
  if (!data) return { fieldErrors: errors };
  const parent = await createParent(db, family.id, data);
  redirect(`/app/parents/${parent.id}/setup/schedule`);
}

/** Save one wizard step. In "edit" mode, go back to the dashboard afterwards. */
export async function saveStepAction(
  parentId: string,
  step: string,
  mode: "setup" | "edit",
  _prev: StepState,
  formData: FormData,
): Promise<StepState> {
  if (!isStepKey(step)) return { error: "Unknown step." };
  const { db, parent, member } = await requireParent(parentId);
  const env = getEnv();
  const now = new Date();

  switch (step as StepKey) {
    case "profile": {
      const { data, errors } = parse(profileSchema, profileInput(formData));
      if (!data) return { fieldErrors: errors };
      await saveProfile(db, parent.id, data);
      break;
    }
    case "schedule": {
      const { data, errors } = parse(scheduleSchema, {
        callTime: formData.get("callTime") ?? "",
        days: formData.getAll("days"),
        timezone: formData.get("timezone") ?? "",
      });
      if (!data) return { fieldErrors: errors };
      await saveSchedule(db, parent.id, data);
      break;
    }
    case "medicines": {
      const { data, errors } = parse(medicinesSchema, {
        medicines: parseJsonField(formData, "medicines"),
      });
      if (!data) return { fieldErrors: errors };
      await saveMedicines(db, parent.id, data);
      break;
    }
    case "personalize": {
      const { data, errors } = parse(personalizeSchema, {
        topicsEnjoyed: formData.get("topicsEnjoyed") ?? "",
        topicsToAvoid: formData.get("topicsToAvoid") ?? "",
        familyNews: formData.get("familyNews") ?? "",
      });
      if (!data) return { fieldErrors: errors };
      await savePersonalize(db, parent.id, data, now, member.id);
      break;
    }
    case "health": {
      const { data, errors } = parse(healthSchema, {
        healthNotes: formData.get("healthNotes") ?? "",
      });
      if (!data) return { fieldErrors: errors };
      await saveHealthNotes(db, parent.id, data.healthNotes, env.DATA_ENCRYPTION_KEY);
      break;
    }
    case "contacts": {
      const { data, errors } = parse(contactsSchema, {
        contacts: parseJsonField(formData, "contacts"),
      });
      if (!data) return { fieldErrors: errors };
      await saveContacts(db, parent.id, data);
      break;
    }
    case "consent": {
      const { errors } = parse(consentSchema, {
        toldParent: formData.get("toldParent") ?? undefined,
      });
      if (errors) return { fieldErrors: errors };
      const missing = await missingSetup(db, parent.id);
      if (missing.length > 0) {
        return { error: `Please finish these steps first: ${missing.join(", ")}.` };
      }
      await completeOnboarding(db, parent.id, now, await getSettings(db));
      revalidatePath("/app");
      redirect(`/app/parents/${parent.id}?welcome=1`);
    }
  }

  revalidatePath(`/app/parents/${parent.id}`);
  if (mode === "edit") redirect(`/app/parents/${parent.id}?saved=1`);
  const next = nextStepAfter(step as StepKey);
  redirect(next ? `/app/parents/${parent.id}/setup/${next}` : `/app/parents/${parent.id}`);
}
