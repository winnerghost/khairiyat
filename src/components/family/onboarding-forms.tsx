"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/card";
import { Checkbox, errorProps, Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { StepState } from "@/app/app/parents/actions";
import { brand } from "@/config/brand";
import { LANGUAGE_LABELS, WEEKDAYS } from "@/domain/onboarding";
import { COMMON_TIMEZONES } from "@/lib/time";

type Action = (prev: StepState, formData: FormData) => Promise<StepState>;

const initial: StepState = {};

function FormError({ state }: { state: StepState }) {
  if (!state.error && !state.fieldErrors?._form) return null;
  return (
    <Callout tone="danger" role="alert">
      {state.error ?? state.fieldErrors?._form}
    </Callout>
  );
}

function Actions({ label, mode }: { label?: string; mode: "setup" | "edit" }) {
  return (
    <div className="sticky bottom-0 -mx-4 mt-2 border-t border-foreground/10 bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0">
      <SubmitButton className="w-full sm:w-auto">
        {label ?? (mode === "edit" ? "Save changes" : "Save and continue")}
      </SubmitButton>
    </div>
  );
}

// ── Step 1: profile ──────────────────────────────────────────────────────

export interface ProfileValues {
  name: string;
  addressAs: string;
  phone: string;
  language: "hi" | "hinglish" | "ur" | "en";
  voice: "female" | "male";
  hearingDifficulty: boolean;
  city: string;
}

export function ProfileForm({
  action,
  values,
  mode,
}: {
  action: Action;
  values?: Partial<ProfileValues>;
  mode: "setup" | "edit";
}) {
  const [state, formAction] = useActionState(action, initial);
  const e = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormError state={state} />
      <Field label="Parent's name" htmlFor="name" error={e.name}>
        <Input
          name="name"
          defaultValue={values?.name}
          placeholder="Kamla Sharma"
          required
          {...errorProps("name", e.name)}
        />
      </Field>
      <Field
        label="How should the assistant address them?"
        htmlFor="addressAs"
        hint='For example "Ammi", "Papa ji", "Sharma ji", "Maa".'
        error={e.addressAs}
      >
        <Input
          name="addressAs"
          defaultValue={values?.addressAs}
          placeholder="Maa"
          required
          {...errorProps("addressAs", e.addressAs, true)}
        />
      </Field>
      <Field
        label="Their phone number"
        htmlFor="phone"
        hint="A normal phone is fine; no smartphone or app needed."
        error={e.phone}
      >
        <Input
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          defaultValue={values?.phone}
          placeholder="98765 43210"
          required
          {...errorProps("phone", e.phone, true)}
        />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Language for calls" htmlFor="language" error={e.language}>
          <Select
            name="language"
            defaultValue={values?.language ?? "hi"}
            {...errorProps("language", e.language)}
          >
            {(Object.keys(LANGUAGE_LABELS) as (keyof typeof LANGUAGE_LABELS)[]).map((k) => (
              <option key={k} value={k}>
                {LANGUAGE_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Voice" htmlFor="voice" error={e.voice}>
          <Select
            name="voice"
            defaultValue={values?.voice ?? "female"}
            {...errorProps("voice", e.voice)}
          >
            <option value="female">Female ({brand.assistantNames.female})</option>
            <option value="male">Male ({brand.assistantNames.male})</option>
          </Select>
        </Field>
      </div>
      <Checkbox
        name="hearingDifficulty"
        defaultChecked={values?.hearingDifficulty}
        label="They have some difficulty hearing"
        hint="The assistant will speak slower, clearer and use simpler sentences."
      />
      <Field label="City" htmlFor="city" optional error={e.city}>
        <Input
          name="city"
          defaultValue={values?.city}
          placeholder="Lucknow"
          {...errorProps("city", e.city)}
        />
      </Field>
      <Actions mode={mode} />
    </form>
  );
}

// ── Step 2: schedule ─────────────────────────────────────────────────────

export function ScheduleForm({
  action,
  values,
  mode,
  capacityWarning,
  viewerTimezone,
}: {
  action: Action;
  values: { callTime: string; days: number[]; timezone: string };
  mode: "setup" | "edit";
  capacityWarning?: string | null;
  viewerTimezone: string;
}) {
  const [state, formAction] = useActionState(action, initial);
  const e = state.fieldErrors ?? {};
  const zones = Array.from(new Set([values.timezone, ...COMMON_TIMEZONES]));
  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormError state={state} />
      {capacityWarning && <Callout tone="warning">{capacityWarning}</Callout>}
      <Field
        label="What time should we call?"
        htmlFor="callTime"
        hint="Between 8:00 am and 7:30 pm in your parent's time. We never call after 8 pm."
        error={e.callTime}
      >
        <Input
          type="time"
          name="callTime"
          min="08:00"
          max="19:30"
          step={300}
          defaultValue={values.callTime}
          required
          {...errorProps("callTime", e.callTime, true)}
        />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-base font-semibold">Which days?</legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((d) => (
            <label
              key={d.value}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-foreground/20 bg-surface px-3 has-[:checked]:border-primary has-[:checked]:bg-primary/10"
            >
              <input
                type="checkbox"
                name="days"
                value={d.value}
                defaultChecked={values.days.includes(d.value)}
                className="size-4 accent-[var(--brand-primary)]"
              />
              {d.short}
            </label>
          ))}
        </div>
        {e.days && (
          <p className="text-sm font-semibold text-danger" role="alert">
            {e.days}
          </p>
        )}
      </fieldset>
      <Field label="Your parent's time zone" htmlFor="timezone" error={e.timezone}>
        <Select
          name="timezone"
          defaultValue={values.timezone}
          {...errorProps("timezone", e.timezone)}
        >
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replace("_", " ")}
            </option>
          ))}
        </Select>
      </Field>
      {viewerTimezone !== values.timezone && (
        <p className="text-sm text-muted">
          You&apos;re in {viewerTimezone.replace("_", " ")}. Your dashboard shows call times in both
          time zones.
        </p>
      )}
      <Actions mode={mode} />
    </form>
  );
}

// ── Step 3: medicines ────────────────────────────────────────────────────

export interface MedicineRow {
  name: string;
  timing: "morning" | "afternoon" | "night" | "custom";
  customTime: string;
  withFood: "with" | "without" | "either";
  notes: string;
}

const emptyMedicine: MedicineRow = {
  name: "",
  timing: "morning",
  customTime: "",
  withFood: "either",
  notes: "",
};

export function MedicinesForm({
  action,
  values,
  mode,
}: {
  action: Action;
  values: MedicineRow[];
  mode: "setup" | "edit";
}) {
  const [state, formAction] = useActionState(action, initial);
  const [rows, setRows] = useState<MedicineRow[]>(values);
  const e = state.fieldErrors ?? {};
  const update = (i: number, patch: Partial<MedicineRow>) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormError state={state} />
      <input type="hidden" name="medicines" value={JSON.stringify(rows)} />
      <p className="text-base text-muted">
        The assistant gently asks about the medicines due around call time. What your parent says is
        self-reported: we can&apos;t confirm they took them.
      </p>
      {rows.length === 0 && (
        <p className="rounded-xl bg-foreground/5 p-4 text-base">
          No medicines added. That&apos;s fine too.
        </p>
      )}
      {rows.map((row, i) => (
        <fieldset
          key={i}
          className="flex flex-col gap-3 rounded-2xl border border-foreground/10 bg-surface p-4"
        >
          <legend className="px-1 text-sm font-semibold text-muted">Medicine {i + 1}</legend>
          <Field label="Name" htmlFor={`med-${i}-name`} error={e[`medicines.${i}.name`]}>
            <Input
              value={row.name}
              onChange={(ev) => update(i, { name: ev.target.value })}
              placeholder="Metformin 500 (sugar ki goli)"
              {...errorProps(`med-${i}-name`, e[`medicines.${i}.name`])}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="When" htmlFor={`med-${i}-timing`}>
              <Select
                id={`med-${i}-timing`}
                value={row.timing}
                onChange={(ev) => update(i, { timing: ev.target.value as MedicineRow["timing"] })}
              >
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="night">Night</option>
                <option value="custom">Exact time</option>
              </Select>
            </Field>
            {row.timing === "custom" && (
              <Field label="Time" htmlFor={`med-${i}-time`} error={e[`medicines.${i}.customTime`]}>
                <Input
                  type="time"
                  value={row.customTime}
                  onChange={(ev) => update(i, { customTime: ev.target.value })}
                  {...errorProps(`med-${i}-time`, e[`medicines.${i}.customTime`])}
                />
              </Field>
            )}
            <Field label="With food?" htmlFor={`med-${i}-food`}>
              <Select
                id={`med-${i}-food`}
                value={row.withFood}
                onChange={(ev) =>
                  update(i, { withFood: ev.target.value as MedicineRow["withFood"] })
                }
              >
                <option value="either">Doesn&apos;t matter</option>
                <option value="with">With food</option>
                <option value="without">Empty stomach</option>
              </Select>
            </Field>
          </div>
          <Field label="Notes" htmlFor={`med-${i}-notes`} optional>
            <Input
              id={`med-${i}-notes`}
              value={row.notes}
              onChange={(ev) => update(i, { notes: ev.target.value })}
              placeholder="Half tablet"
            />
          </Field>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
          >
            Remove this medicine
          </Button>
        </fieldset>
      ))}
      {rows.length < 15 && (
        <Button
          type="button"
          variant="secondary"
          onClick={() => setRows((r) => [...r, { ...emptyMedicine }])}
        >
          + Add a medicine
        </Button>
      )}
      <Actions mode={mode} />
    </form>
  );
}

// ── Step 4: personalisation ──────────────────────────────────────────────

export function PersonalizeForm({
  action,
  values,
  mode,
}: {
  action: Action;
  values: { topicsEnjoyed: string[]; topicsToAvoid: string[]; familyNews: string[] };
  mode: "setup" | "edit";
}) {
  const [state, formAction] = useActionState(action, initial);
  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormError state={state} />
      <Field
        label="What do they enjoy talking about?"
        htmlFor="topicsEnjoyed"
        hint="One per line or separated by commas: cricket, bhajans, old Rafi songs, grandkids Riya and Kabir…"
      >
        <Textarea
          id="topicsEnjoyed"
          name="topicsEnjoyed"
          defaultValue={values.topicsEnjoyed.join("\n")}
        />
      </Field>
      <Field
        label="Topics to avoid"
        htmlFor="topicsToAvoid"
        hint="For example: Papa's passing, property matters."
        optional
      >
        <Textarea
          id="topicsToAvoid"
          name="topicsToAvoid"
          defaultValue={values.topicsToAvoid.join("\n")}
        />
      </Field>
      <Field
        label="Family news the assistant can mention"
        htmlFor="familyNews"
        hint='Up to 3, one per line. For example: "Riya ka exam achha gaya". Mentioned in the next couple of weeks.'
        optional
      >
        <Textarea id="familyNews" name="familyNews" defaultValue={values.familyNews.join("\n")} />
      </Field>
      <Actions mode={mode} />
    </form>
  );
}

// ── Step 5: health notes ─────────────────────────────────────────────────

export function HealthForm({
  action,
  value,
  mode,
}: {
  action: Action;
  value: string;
  mode: "setup" | "edit";
}) {
  const [state, formAction] = useActionState(action, initial);
  const e = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormError state={state} />
      <Callout tone="info" title="Private and encrypted">
        Only used so the assistant is gentle about these things. The assistant never gives medical
        advice. Stored encrypted.
      </Callout>
      <Field
        label="Anything the assistant should be gentle about?"
        htmlFor="healthNotes"
        hint="For example: knee pain, recovering from cataract surgery, feels low since winter."
        optional
        error={e.healthNotes}
      >
        <Textarea
          name="healthNotes"
          defaultValue={value}
          maxLength={1000}
          {...errorProps("healthNotes", e.healthNotes, true)}
        />
      </Field>
      <Actions mode={mode} />
    </form>
  );
}

// ── Step 6: emergency contacts ───────────────────────────────────────────

export interface ContactRow {
  name: string;
  relation: string;
  whatsapp: string;
  email: string;
  alertOnUnreachable: boolean;
  alertOnRedFlag: boolean;
}

const emptyContact: ContactRow = {
  name: "",
  relation: "",
  whatsapp: "",
  email: "",
  alertOnUnreachable: true,
  alertOnRedFlag: true,
};

export function ContactsForm({
  action,
  values,
  mode,
}: {
  action: Action;
  values: ContactRow[];
  mode: "setup" | "edit";
}) {
  const [state, formAction] = useActionState(action, initial);
  const [rows, setRows] = useState<ContactRow[]>(values.length ? values : [{ ...emptyContact }]);
  const e = state.fieldErrors ?? {};
  const update = (i: number, patch: Partial<ContactRow>) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormError state={state} />
      {e.contacts && <Callout tone="danger">{e.contacts}</Callout>}
      <input type="hidden" name="contacts" value={JSON.stringify(rows)} />
      <p className="text-base text-muted">
        1 to 3 people who get a WhatsApp alert if your parent can&apos;t be reached or mentions
        something worrying. This is in addition to family members on your account.
      </p>
      {rows.map((row, i) => (
        <fieldset
          key={i}
          className="flex flex-col gap-3 rounded-2xl border border-foreground/10 bg-surface p-4"
        >
          <legend className="px-1 text-sm font-semibold text-muted">Person {i + 1}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor={`c-${i}-name`} error={e[`contacts.${i}.name`]}>
              <Input
                value={row.name}
                onChange={(ev) => update(i, { name: ev.target.value })}
                {...errorProps(`c-${i}-name`, e[`contacts.${i}.name`])}
              />
            </Field>
            <Field label="Relation" htmlFor={`c-${i}-rel`} optional>
              <Input
                id={`c-${i}-rel`}
                value={row.relation}
                onChange={(ev) => update(i, { relation: ev.target.value })}
                placeholder="Son, neighbour…"
              />
            </Field>
          </div>
          <Field label="WhatsApp number" htmlFor={`c-${i}-wa`} error={e[`contacts.${i}.whatsapp`]}>
            <Input
              type="tel"
              inputMode="tel"
              value={row.whatsapp}
              onChange={(ev) => update(i, { whatsapp: ev.target.value })}
              placeholder="+91 98765 43210"
              {...errorProps(`c-${i}-wa`, e[`contacts.${i}.whatsapp`])}
            />
          </Field>
          <Field
            label="Email (backup if WhatsApp fails)"
            htmlFor={`c-${i}-email`}
            optional
            error={e[`contacts.${i}.email`]}
          >
            <Input
              type="email"
              value={row.email}
              onChange={(ev) => update(i, { email: ev.target.value })}
              {...errorProps(`c-${i}-email`, e[`contacts.${i}.email`])}
            />
          </Field>
          <Checkbox
            checked={row.alertOnUnreachable}
            onChange={(ev) => update(i, { alertOnUnreachable: ev.target.checked })}
            label="Alert if the call isn't answered after retries"
          />
          <Checkbox
            checked={row.alertOnRedFlag}
            onChange={(ev) => update(i, { alertOnRedFlag: ev.target.checked })}
            label="Alert if they mention something worrying (fall, chest pain…)"
          />
          {rows.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
            >
              Remove this person
            </Button>
          )}
        </fieldset>
      ))}
      {rows.length < 3 && (
        <Button
          type="button"
          variant="secondary"
          onClick={() => setRows((r) => [...r, { ...emptyContact }])}
        >
          + Add another person
        </Button>
      )}
      <Actions mode={mode} />
    </form>
  );
}

// ── Step 7: consent ──────────────────────────────────────────────────────

export function ConsentForm({
  action,
  parentAddressAs,
  callTimeLabel,
  familyName,
  assistantName,
  voice,
}: {
  action: Action;
  parentAddressAs: string;
  callTimeLabel: string;
  familyName: string;
  assistantName: string;
  voice: "female" | "male";
}) {
  const [state, formAction] = useActionState(action, initial);
  const e = state.fieldErrors ?? {};
  // Hindi verbs follow the assistant's gender.
  const v =
    voice === "female"
      ? { call: "karegi", ask: "maangegi", who: "ek AI assistant" }
      : { call: "karega", ask: "maangega", who: "ek AI assistant" };
  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormError state={state} />
      <div className="flex flex-col gap-3 text-lg">
        <p>
          Before we call, please tell {parentAddressAs} about it yourself. A simple message works:
        </p>
        <blockquote className="rounded-xl border-l-4 border-accent bg-surface p-4 italic">
          &ldquo;{parentAddressAs}, roz {callTimeLabel} ke aas-paas {assistantName} naam ka {v.who}{" "}
          aapko phone {v.call}, aapka haal-chaal poochhne. Maine set kiya hai. Woh kabhi paise ya
          OTP nahi {v.ask}.&rdquo;
        </blockquote>
        <p>
          The <strong>first call is an introduction</strong>. {assistantName} says clearly that it
          is an AI assistant set up by {familyName}, and asks {parentAddressAs} if daily calls are
          okay. Daily calls start only if they say yes. If they say no, we pause and tell you.
        </p>
      </div>
      <Checkbox
        name="toldParent"
        label={`I have told ${parentAddressAs} about these calls.`}
        aria-invalid={e.toldParent ? true : undefined}
      />
      {e.toldParent && (
        <p className="text-sm font-semibold text-danger" role="alert">
          {e.toldParent}
        </p>
      )}
      <Callout tone="warning" title="Not an emergency service">
        {assistantName} is not a doctor and not an emergency service. In an emergency, call 112.
      </Callout>
      <Actions mode="setup" label="Finish setup and start free trial" />
    </form>
  );
}
