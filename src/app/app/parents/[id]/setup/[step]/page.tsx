import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, and, isNull } from "drizzle-orm";
import {
  ConsentForm,
  ContactsForm,
  HealthForm,
  MedicinesForm,
  PersonalizeForm,
  ProfileForm,
  ScheduleForm,
} from "@/components/family/onboarding-forms";
import { StepHeader } from "@/components/family/step-header";
import { assistantNameFor } from "@/config/brand";
import { emergencyContacts, familyNotes, medicines, schedules } from "@/db/schema/app";
import { isStepKey, ONBOARDING_STEPS } from "@/domain/onboarding";
import { getSettings } from "@/engine/settings";
import { getEnv } from "@/lib/env";
import { formatPhone } from "@/lib/phone";
import { formatClock, zonedToInstant, localDateOf } from "@/lib/time";
import { capacityWarning, slotLoad } from "@/server/capacity";
import { readHealthNotes } from "@/server/parents";
import { requireParent } from "@/server/session";
import { saveStepAction } from "../../../actions";

export async function generateMetadata({
  params,
}: PageProps<"/app/parents/[id]/setup/[step]">): Promise<Metadata> {
  const { step } = await params;
  const s = ONBOARDING_STEPS.find((x) => x.key === step);
  return { title: s ? s.title : "Setup" };
}

export default async function SetupStepPage({
  params,
  searchParams,
}: PageProps<"/app/parents/[id]/setup/[step]">) {
  const { id, step } = await params;
  const sp = await searchParams;
  if (!isStepKey(step)) notFound();
  const { db, parent, member, family } = await requireParent(id);
  const env = getEnv();
  const onboarded = parent.status !== "onboarding";
  const mode: "setup" | "edit" = onboarded || sp.mode === "edit" ? "edit" : "setup";
  const action = saveStepAction.bind(null, parent.id, step, mode);
  const now = new Date();

  let form: React.ReactNode = null;
  switch (step) {
    case "profile":
      form = (
        <ProfileForm
          action={action}
          mode={mode}
          values={{
            name: parent.name,
            addressAs: parent.addressAs,
            phone: formatPhone(parent.phoneE164),
            language: parent.language,
            voice: parent.voice,
            hearingDifficulty: parent.hearingDifficulty,
            city: parent.city ?? "",
          }}
        />
      );
      break;
    case "schedule": {
      const [s] = await db
        .select()
        .from(schedules)
        .where(eq(schedules.parentId, parent.id))
        .limit(1);
      const callTime = s?.callTime ?? "09:30";
      const settings = await getSettings(db);
      const load = await slotLoad(db, {
        callTime,
        timezone: parent.timezone,
        now,
        excludeParentId: parent.id,
      });
      form = (
        <ScheduleForm
          action={action}
          mode={mode}
          values={{
            callTime,
            days: s?.daysOfWeek ?? [1, 2, 3, 4, 5, 6, 7],
            timezone: parent.timezone,
          }}
          capacityWarning={s ? capacityWarning(load, settings.concurrency_limit) : null}
          viewerTimezone={member.timezone}
        />
      );
      break;
    }
    case "medicines": {
      const rows = await db
        .select()
        .from(medicines)
        .where(eq(medicines.parentId, parent.id))
        .orderBy(asc(medicines.sortOrder));
      form = (
        <MedicinesForm
          action={action}
          mode={mode}
          values={rows.map((m) => ({
            name: m.name,
            timing: m.timing,
            customTime: m.customTime ?? "",
            withFood: m.withFood,
            notes: m.notes ?? "",
          }))}
        />
      );
      break;
    }
    case "personalize": {
      const news = await db
        .select()
        .from(familyNotes)
        .where(
          and(
            eq(familyNotes.parentId, parent.id),
            eq(familyNotes.kind, "news"),
            isNull(familyNotes.usedAt),
          ),
        )
        .orderBy(asc(familyNotes.createdAt));
      form = (
        <PersonalizeForm
          action={action}
          mode={mode}
          values={{
            topicsEnjoyed: parent.topicsEnjoyed,
            topicsToAvoid: parent.topicsToAvoid,
            familyNews: news.map((n) => n.text),
          }}
        />
      );
      break;
    }
    case "health":
      form = (
        <HealthForm
          action={action}
          mode={mode}
          value={await readHealthNotes(db, parent.id, env.DATA_ENCRYPTION_KEY)}
        />
      );
      break;
    case "contacts": {
      const rows = await db
        .select()
        .from(emergencyContacts)
        .where(eq(emergencyContacts.parentId, parent.id))
        .orderBy(asc(emergencyContacts.sortOrder));
      form = (
        <ContactsForm
          action={action}
          mode={mode}
          values={rows.map((c) => ({
            name: c.name,
            relation: c.relation ?? "",
            whatsapp: formatPhone(c.whatsappE164),
            email: c.email ?? "",
            alertOnUnreachable: c.alertOnUnreachable,
            alertOnRedFlag: c.alertOnRedFlag,
          }))}
        />
      );
      break;
    }
    case "consent": {
      if (onboarded) {
        return (
          <>
            <h1 className="font-heading text-3xl">Setup is complete</h1>
            <Link href={`/app/parents/${parent.id}`} className="text-primary underline">
              Back to {parent.addressAs}&apos;s page
            </Link>
          </>
        );
      }
      const [s] = await db
        .select()
        .from(schedules)
        .where(eq(schedules.parentId, parent.id))
        .limit(1);
      const callTimeLabel = s
        ? formatClock(
            zonedToInstant(localDateOf(now, parent.timezone), s.callTime, parent.timezone),
            parent.timezone,
          )
        : "subah";
      form = (
        <ConsentForm
          action={action}
          parentAddressAs={parent.addressAs}
          callTimeLabel={callTimeLabel}
          familyName={member.displayName.split(" ")[0] ?? family.name}
          assistantName={assistantNameFor(parent.voice)}
          voice={parent.voice}
        />
      );
      break;
    }
  }

  return (
    <>
      {mode === "edit" ? (
        <div className="flex flex-col gap-2">
          <Link href={`/app/parents/${parent.id}`} className="text-base text-primary underline">
            ← Back to {parent.addressAs}&apos;s page
          </Link>
          <h1 className="font-heading text-3xl">
            {ONBOARDING_STEPS.find((s) => s.key === step)?.title}
          </h1>
        </div>
      ) : (
        <StepHeader current={step} parentId={parent.id} reached={parent.onboardingStep} />
      )}
      {form}
    </>
  );
}
