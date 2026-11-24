/**
 * Khairiyat domain tables.
 *
 * Hard rules that live HERE (in the database), not only in code:
 * - check_ins:  UNIQUE (parent_id, local_date, slot)      → never double-call a slot
 * - call_attempts: UNIQUE (check_in_id, attempt_no) + a trigger that rejects
 *   dials outside 08:00–20:00 parent-local time or to opted-out parents
 *   (see drizzle/*_guards.sql)
 * - notifications: UNIQUE (idempotency_key)               → outbox, never duplicated
 * - webhook_events: UNIQUE (provider, event_key)          → inbox, processed once
 * - alerts: UNIQUE (check_in_id, type)                    → one alert per event
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

const tz = { withTimezone: true, mode: "date" } as const;
const createdAt = () => timestamp("created_at", tz).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", tz).notNull().defaultNow();

// ── Enums ────────────────────────────────────────────────────────────────

export const memberRole = pgEnum("member_role", ["owner", "member"]);
export const notifyMode = pgEnum("notify_mode", ["every_call", "alerts_only", "daily_digest"]);
export const uiLanguage = pgEnum("summary_language", ["en", "hi"]);
export const callLanguage = pgEnum("call_language", ["hi", "hinglish", "ur", "en"]);
export const voiceGender = pgEnum("voice_gender", ["female", "male"]);
export const parentStatus = pgEnum("parent_status", [
  "onboarding", // family still filling the wizard
  "awaiting_consent", // wizard done; first (consent) call pending
  "active", // parent agreed; daily calls running
  "paused", // family paused (travel/hospital) or billing stop
  "opted_out", // parent said stop: never call again until family re-enables
  "consent_refused", // parent said no on the consent call
]);
export const medicineTiming = pgEnum("medicine_timing", [
  "morning",
  "afternoon",
  "night",
  "custom",
]);
export const withFood = pgEnum("with_food", ["with", "without", "either"]);
export const noteKind = pgEnum("note_kind", ["news", "next_call"]);

export const checkInStatus = pgEnum("check_in_status", [
  "scheduled",
  "dialing",
  "in_progress",
  "completed",
  "not_answered",
  "retry_scheduled",
  "unreachable",
  "failed",
  "skipped",
  "paused",
  "cancelled",
  "needs_review",
]);
export const attemptStatus = pgEnum("attempt_status", [
  "dialing",
  "in_progress",
  "completed",
  "no_answer",
  "busy",
  "voicemail",
  "failed",
  "unknown",
]);
export const consentAnswer = pgEnum("consent_answer", ["yes", "no", "unclear"]);
export const alertType = pgEnum("alert_type", [
  "unreachable",
  "red_flag",
  "distress",
  "opted_out",
  "consent_given",
  "consent_refused",
  "system_failure",
  "needs_review",
  "payment_issue",
]);
export const alertSeverity = pgEnum("alert_severity", ["info", "warning", "urgent"]);
export const alertStatus = pgEnum("alert_status", ["open", "acknowledged", "resolved"]);
export const notificationChannel = pgEnum("notification_channel", ["whatsapp", "email", "in_app"]);
export const notificationStatus = pgEnum("notification_status", [
  "pending",
  "sending",
  "sent",
  "delivered",
  "read",
  "failed", // this attempt failed; will retry
  "dead", // gave up after max attempts (visible in admin, fallback sent)
  "skipped", // e.g. member has no WhatsApp number
]);
export const notificationPriority = pgEnum("notification_priority", ["normal", "urgent"]);
export const webhookStatus = pgEnum("webhook_status", [
  "pending",
  "processed",
  "failed",
  "ignored",
]);
export const subscriptionStatus = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due", // payment failed: grace period, calls continue
  "halted", // grace over: calls stop (family told first)
  "cancelled", // cancelled: calls continue until period end
  "expired",
]);

// ── People ───────────────────────────────────────────────────────────────

export const families = pgTable("families", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
  /** How long to keep call transcripts (days). DPDP: purpose-limited retention. */
  transcriptRetentionDays: integer("transcript_retention_days").notNull().default(180),
  createdAt: createdAt(),
});

export const familyMembers = pgTable(
  "family_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("member"),
    displayName: text("display_name").notNull(),
    /** E.164, e.g. +919876543210 */
    whatsappE164: text("whatsapp_e164"),
    notifyMode: notifyMode("notify_mode").notNull().default("every_call"),
    summaryLanguage: uiLanguage("summary_language").notNull().default("en"),
    whatsappEnabled: boolean("whatsapp_enabled").notNull().default(true),
    emailEnabled: boolean("email_enabled").notNull().default(true),
    /** The member's own time zone (families abroad see times in both). */
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("family_members_family_user_uq").on(t.familyId, t.userId),
    index("family_members_user_idx").on(t.userId),
  ],
);

export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id")
    .notNull()
    .references(() => families.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  invitedByUserId: text("invited_by_user_id").references(() => user.id, { onDelete: "set null" }),
  acceptedAt: timestamp("accepted_at", tz),
  expiresAt: timestamp("expires_at", tz).notNull(),
  createdAt: createdAt(),
});

// ── Parent setup ─────────────────────────────────────────────────────────

export const parents = pgTable(
  "parents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** How the assistant addresses them: "Ammi", "Papa ji", "Sharma ji". */
    addressAs: text("address_as").notNull(),
    phoneE164: text("phone_e164").notNull(),
    language: callLanguage("language").notNull().default("hi"),
    voice: voiceGender("voice").notNull().default("female"),
    hearingDifficulty: boolean("hearing_difficulty").notNull().default(false),
    city: text("city"),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    status: parentStatus("status").notNull().default("onboarding"),
    pausedUntil: timestamp("paused_until", tz),
    pauseReason: text("pause_reason"),
    onboardingStep: integer("onboarding_step").notNull().default(1),
    onboardingCompletedAt: timestamp("onboarding_completed_at", tz),
    familyConfirmedToldParentAt: timestamp("family_confirmed_told_parent_at", tz),
    consentGivenAt: timestamp("consent_given_at", tz),
    consentRefusedAt: timestamp("consent_refused_at", tz),
    optedOutAt: timestamp("opted_out_at", tz),
    topicsEnjoyed: jsonb("topics_enjoyed").$type<string[]>().notNull().default([]),
    topicsToAvoid: jsonb("topics_to_avoid").$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("parents_family_idx").on(t.familyId), index("parents_status_idx").on(t.status)],
);

/** Sensitive: stored encrypted (AES-256-GCM, see src/lib/crypto.ts). */
export const parentHealthNotes = pgTable("parent_health_notes", {
  parentId: uuid("parent_id")
    .primaryKey()
    .references(() => parents.id, { onDelete: "cascade" }),
  ciphertext: text("ciphertext").notNull(),
  updatedAt: updatedAt(),
});

export const schedules = pgTable(
  "schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentId: uuid("parent_id")
      .notNull()
      .references(() => parents.id, { onDelete: "cascade" }),
    slot: text("slot").notNull().default("daily"),
    /** Parent-local time "HH:MM" (24h). Must be inside 08:00–19:30. */
    callTime: text("call_time").notNull(),
    /** ISO weekdays: 1 = Monday … 7 = Sunday. */
    daysOfWeek: jsonb("days_of_week").$type<number[]>().notNull(),
    active: boolean("active").notNull().default(true),
    updatedAt: updatedAt(),
  },
  (t) => [unique("schedules_parent_slot_uq").on(t.parentId, t.slot)],
);

export const medicines = pgTable(
  "medicines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentId: uuid("parent_id")
      .notNull()
      .references(() => parents.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    timing: medicineTiming("timing").notNull(),
    customTime: text("custom_time"),
    withFood: withFood("with_food").notNull().default("either"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("medicines_parent_idx").on(t.parentId)],
);

/** Family news the assistant may mention, and one-off notes for the next call. */
export const familyNotes = pgTable(
  "family_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentId: uuid("parent_id")
      .notNull()
      .references(() => parents.id, { onDelete: "cascade" }),
    kind: noteKind("kind").notNull(),
    text: text("text").notNull(),
    createdByMemberId: uuid("created_by_member_id").references(() => familyMembers.id, {
      onDelete: "set null",
    }),
    /** For next_call notes: which check-in used it (then it's done). */
    usedInCheckInId: uuid("used_in_check_in_id"),
    usedAt: timestamp("used_at", tz),
    expiresAt: timestamp("expires_at", tz),
    createdAt: createdAt(),
  },
  (t) => [index("family_notes_parent_idx").on(t.parentId, t.kind)],
);

export const emergencyContacts = pgTable(
  "emergency_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentId: uuid("parent_id")
      .notNull()
      .references(() => parents.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    relation: text("relation"),
    whatsappE164: text("whatsapp_e164").notNull(),
    email: text("email"),
    alertOnUnreachable: boolean("alert_on_unreachable").notNull().default(true),
    alertOnRedFlag: boolean("alert_on_red_flag").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("emergency_contacts_parent_idx").on(t.parentId)],
);

// ── Calls ────────────────────────────────────────────────────────────────

export const checkIns = pgTable(
  "check_ins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentId: uuid("parent_id")
      .notNull()
      .references(() => parents.id, { onDelete: "cascade" }),
    /** Parent-local calendar date, "YYYY-MM-DD". */
    localDate: date("local_date", { mode: "string" }).notNull(),
    /** "daily" | "consent" | "manual-1" … */
    slot: text("slot").notNull(),
    status: checkInStatus("status").notNull().default("scheduled"),
    isConsentCall: boolean("is_consent_call").notNull().default(false),
    /** When the call should start (UTC instant). */
    scheduledFor: timestamp("scheduled_for", tz).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", tz),
    attemptsCount: integer("attempts_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    lastFailureReason: text("last_failure_reason"),
    /** Set when completed/unreachable/failed: used for "alerted within 1 min" checks. */
    finishedAt: timestamp("finished_at", tz),
    /** Bumped on every state change (optimistic concurrency). */
    version: integer("version").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("check_ins_parent_date_slot_uq").on(t.parentId, t.localDate, t.slot),
    index("check_ins_due_idx").on(t.status, t.nextAttemptAt),
    index("check_ins_parent_date_idx").on(t.parentId, t.localDate),
  ],
);

export const callAttempts = pgTable(
  "call_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    checkInId: uuid("check_in_id")
      .notNull()
      .references(() => checkIns.id, { onDelete: "cascade" }),
    /** Denormalised so the DB guard trigger can check quiet hours and opt-out. */
    parentId: uuid("parent_id")
      .notNull()
      .references(() => parents.id, { onDelete: "cascade" }),
    attemptNo: integer("attempt_no").notNull(),
    provider: text("provider").notNull(),
    providerConversationId: text("provider_conversation_id").unique(),
    providerCallId: text("provider_call_id"),
    status: attemptStatus("status").notNull().default("dialing"),
    failureReason: text("failure_reason"),
    /** When we asked the provider to dial (from the engine clock). */
    dialedAt: timestamp("dialed_at", tz).notNull(),
    answeredAt: timestamp("answered_at", tz),
    endedAt: timestamp("ended_at", tz),
    durationSecs: integer("duration_secs"),
    /** Estimated cost in paise (1 ₹ = 100 paise). */
    costPaise: integer("cost_paise"),
    webhookReceivedAt: timestamp("webhook_received_at", tz),
    reconciledAt: timestamp("reconciled_at", tz),
    createdAt: createdAt(),
  },
  (t) => [
    unique("call_attempts_check_in_attempt_uq").on(t.checkInId, t.attemptNo),
    index("call_attempts_status_idx").on(t.status, t.dialedAt),
  ],
);

export interface TranscriptTurn {
  role: "agent" | "user";
  message: string;
  timeInCallSecs: number;
}

export type MedicineAnswer = { name: string; taken: "yes" | "no" | "unclear" };

export const callResults = pgTable("call_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  checkInId: uuid("check_in_id")
    .notNull()
    .unique()
    .references(() => checkIns.id, { onDelete: "cascade" }),
  attemptId: uuid("attempt_id").references(() => callAttempts.id, { onDelete: "set null" }),
  transcript: jsonb("transcript").$type<TranscriptTurn[]>().notNull().default([]),
  /** Raw structured analysis as returned by the voice provider. */
  analysis: jsonb("analysis").$type<Record<string, unknown>>().notNull().default({}),
  consentGiven: consentAnswer("consent_given"),
  mood: integer("mood"),
  moodWords: text("mood_words"),
  ateMeals: text("ate_meals"),
  medicinesTaken: jsonb("medicines_taken").$type<MedicineAnswer[]>().notNull().default([]),
  sleep: text("sleep"),
  painOrSymptoms: text("pain_or_symptoms"),
  redFlag: boolean("red_flag").notNull().default(false),
  redFlagDetail: text("red_flag_detail"),
  /** Where the flag came from: "agent", "keyword:seene mein dard", … */
  redFlagSources: jsonb("red_flag_sources").$type<string[]>().notNull().default([]),
  distress: boolean("distress").notNull().default(false),
  wantsToStop: boolean("wants_to_stop").notNull().default(false),
  followUp: text("follow_up"),
  notableMoments: text("notable_moments"),
  summaryEn: text("summary_en"),
  summaryHi: text("summary_hi"),
  hasAudio: boolean("has_audio").notNull().default(false),
  createdAt: createdAt(),
});

export const followUps = pgTable(
  "follow_ups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentId: uuid("parent_id")
      .notNull()
      .references(() => parents.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    sourceCheckInId: uuid("source_check_in_id").references(() => checkIns.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at", tz),
    createdAt: createdAt(),
  },
  (t) => [index("follow_ups_parent_idx").on(t.parentId)],
);

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references(() => parents.id, { onDelete: "cascade" }),
    checkInId: uuid("check_in_id").references(() => checkIns.id, { onDelete: "cascade" }),
    type: alertType("type").notNull(),
    severity: alertSeverity("severity").notNull(),
    title: text("title").notNull(),
    detail: text("detail"),
    status: alertStatus("status").notNull().default("open"),
    acknowledgedAt: timestamp("acknowledged_at", tz),
    acknowledgedByUserId: text("acknowledged_by_user_id"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("alerts_check_in_type_uq")
      .on(t.checkInId, t.type)
      .where(sql`${t.checkInId} IS NOT NULL`),
    index("alerts_family_idx").on(t.familyId, t.status),
  ],
);

// ── Infrastructure: outbox + inbox ───────────────────────────────────────

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** e.g. "alert:unreachable:<checkInId>:member:<memberId>:whatsapp" */
    idempotencyKey: text("idempotency_key").notNull().unique(),
    familyId: uuid("family_id").references(() => families.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references(() => parents.id, { onDelete: "cascade" }),
    checkInId: uuid("check_in_id").references(() => checkIns.id, { onDelete: "set null" }),
    alertId: uuid("alert_id").references(() => alerts.id, { onDelete: "set null" }),
    recipientMemberId: uuid("recipient_member_id").references(() => familyMembers.id, {
      onDelete: "cascade",
    }),
    recipientContactId: uuid("recipient_contact_id").references(() => emergencyContacts.id, {
      onDelete: "cascade",
    }),
    recipientName: text("recipient_name"),
    channel: notificationChannel("channel").notNull(),
    /** E.164 number or email address. */
    toAddress: text("to_address").notNull(),
    template: text("template").notNull(),
    language: uiLanguage("language").notNull().default("en"),
    params: jsonb("params").$type<string[]>().notNull().default([]),
    subject: text("subject"),
    /** The full rendered text (what the person will read). */
    body: text("body").notNull(),
    status: notificationStatus("status").notNull().default("pending"),
    priority: notificationPriority("priority").notNull().default("normal"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    nextAttemptAt: timestamp("next_attempt_at", tz).notNull(),
    lastError: text("last_error"),
    providerMessageId: text("provider_message_id"),
    /** If this is an email sent because WhatsApp failed, the original notification. */
    fallbackOfId: uuid("fallback_of_id"),
    createdAt: createdAt(),
    sentAt: timestamp("sent_at", tz),
    deliveredAt: timestamp("delivered_at", tz),
    readAt: timestamp("read_at", tz),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("notifications_due_idx").on(t.status, t.nextAttemptAt),
    index("notifications_family_idx").on(t.familyId, t.createdAt),
    index("notifications_provider_msg_idx").on(t.providerMessageId),
  ],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    eventType: text("event_type").notNull(),
    /** Dedupe key, e.g. "<conversation_id>:post_call_transcription". */
    eventKey: text("event_key").notNull(),
    /** Parsed payload (audio is never stored here). */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: webhookStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    receivedAt: timestamp("received_at", tz).notNull(),
    processedAt: timestamp("processed_at", tz),
  },
  (t) => [
    unique("webhook_events_provider_key_uq").on(t.provider, t.eventKey),
    index("webhook_events_status_idx").on(t.status, t.receivedAt),
  ],
);

/**
 * Messages "sent" by the mock WhatsApp and email providers in demo mode.
 * The demo phone preview and demo inbox read from here.
 */
export const mockMessages = pgTable(
  "mock_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channel: notificationChannel("channel").notNull(),
    toAddress: text("to_address").notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    template: text("template"),
    createdAt: timestamp("created_at", tz).notNull(),
  },
  (t) => [index("mock_messages_to_idx").on(t.toAddress, t.createdAt)],
);

/**
 * Mock voice provider: calls in flight and the fake webhooks they will
 * produce. Lets demo mode and the simulation behave like the real thing
 * (delays, lost webhooks, out-of-order delivery).
 */
export const mockCalls = pgTable(
  "mock_calls",
  {
    conversationId: text("conversation_id").primaryKey(),
    scenario: text("scenario").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    deliverAt: timestamp("deliver_at", tz).notNull(),
    delivered: boolean("delivered").notNull().default(false),
    /** If true the webhook is "lost": only reconciliation can find the result. */
    dropWebhook: boolean("drop_webhook").notNull().default(false),
    createdAt: timestamp("created_at", tz).notNull(),
  },
  (t) => [index("mock_calls_due_idx").on(t.delivered, t.deliverAt)],
);

/** Demo control room: force the outcome of a parent's next call. */
export const demoScenarios = pgTable("demo_scenarios", {
  parentId: uuid("parent_id")
    .primaryKey()
    .references(() => parents.id, { onDelete: "cascade" }),
  scenario: text("scenario").notNull(),
  createdAt: timestamp("created_at", tz).notNull(),
});

// ── Billing ──────────────────────────────────────────────────────────────

export interface PlanFeatures {
  familyTimezone: boolean;
  weeklyDigest: boolean;
}

export const plans = pgTable("plans", {
  id: text("id").primaryKey(), // "founding" | "standard" | "abroad" | …
  name: text("name").notNull(),
  priceInr: integer("price_inr").notNull(),
  priceUsdLabel: text("price_usd_label"),
  maxCallMinutes: integer("max_call_minutes").notNull(),
  description: text("description").notNull().default(""),
  features: jsonb("features").$type<PlanFeatures>().notNull(),
  /** Founding plan: only for the first N families. */
  seatLimit: integer("seat_limit"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  providerPlanId: text("provider_plan_id"),
  updatedAt: updatedAt(),
});

export const addOns = pgTable("add_ons", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  priceInr: integer("price_inr").notNull(),
  active: boolean("active").notNull().default(false),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Pricing is per parent. */
    parentId: uuid("parent_id")
      .notNull()
      .unique()
      .references(() => parents.id, { onDelete: "cascade" }),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id),
    status: subscriptionStatus("status").notNull(),
    trialEndsAt: timestamp("trial_ends_at", tz),
    currentPeriodStart: timestamp("current_period_start", tz),
    currentPeriodEnd: timestamp("current_period_end", tz),
    graceUntil: timestamp("grace_until", tz),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    provider: text("provider").notNull().default("mock"),
    providerSubscriptionId: text("provider_subscription_id").unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("subscriptions_family_idx").on(t.familyId)],
);

export const subscriptionAddOns = pgTable(
  "subscription_add_ons",
  {
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    addOnId: text("add_on_id")
      .notNull()
      .references(() => addOns.id),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.subscriptionId, t.addOnId] })],
);

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
    onDelete: "set null",
  }),
  familyId: uuid("family_id")
    .notNull()
    .references(() => families.id, { onDelete: "cascade" }),
  amountInr: integer("amount_inr").notNull(),
  status: text("status").$type<"captured" | "failed" | "refunded">().notNull(),
  providerPaymentId: text("provider_payment_id").unique(),
  method: text("method"),
  createdAt: createdAt(),
});

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id")
    .notNull()
    .references(() => families.id, { onDelete: "cascade" }),
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
    onDelete: "set null",
  }),
  paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
  number: text("number").notNull().unique(),
  description: text("description").notNull(),
  amountInr: integer("amount_inr").notNull(),
  gstInr: integer("gst_inr").notNull().default(0),
  periodStart: timestamp("period_start", tz),
  periodEnd: timestamp("period_end", tz),
  createdAt: createdAt(),
});

// ── Operations ───────────────────────────────────────────────────────────

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: updatedAt(),
  updatedByUserId: text("updated_by_user_id"),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: text("actor_user_id"),
    actorLabel: text("actor_label").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_created_idx").on(t.createdAt)],
);

export const jobRuns = pgTable(
  "job_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    job: text("job").notNull(),
    startedAt: timestamp("started_at", tz).notNull(),
    finishedAt: timestamp("finished_at", tz),
    ok: boolean("ok"),
    stats: jsonb("stats").$type<Record<string, unknown>>().notNull().default({}),
    error: text("error"),
  },
  (t) => [index("job_runs_job_started_idx").on(t.job, t.startedAt)],
);

export const problemReports = pgTable("problem_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id")
    .notNull()
    .references(() => families.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id").references(() => parents.id, { onDelete: "cascade" }),
  checkInId: uuid("check_in_id").references(() => checkIns.id, { onDelete: "set null" }),
  reporterUserId: text("reporter_user_id"),
  message: text("message").notNull(),
  status: text("status").$type<"open" | "resolved">().notNull().default("open"),
  createdAt: createdAt(),
});

/**
 * A short lease so only one scheduler tick runs at a time (even if two
 * triggers fire together). Works without session state, so it's safe
 * behind connection poolers. A crashed tick's lease simply expires.
 */
export const engineLeases = pgTable("engine_leases", {
  name: text("name").primaryKey(),
  holder: text("holder").notNull(),
  expiresAt: timestamp("expires_at", tz).notNull(),
});
