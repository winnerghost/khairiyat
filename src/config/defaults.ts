/**
 * Starting values for plans and operational settings.
 *
 * These are only SEED values: they are copied into the database on first
 * run and from then on edited in Admin → Settings. Nothing in the app reads
 * prices from this file directly.
 */
import type { PlanFeatures } from "@/db/schema/app";

export interface PlanSeed {
  id: string;
  name: string;
  priceInr: number;
  priceUsdLabel: string | null;
  maxCallMinutes: number;
  description: string;
  features: PlanFeatures;
  seatLimit: number | null;
  sortOrder: number;
}

export const DEFAULT_PLANS: PlanSeed[] = [
  {
    id: "founding",
    name: "Founding family",
    priceInr: 999,
    priceUsdLabel: null,
    maxCallMinutes: 4,
    description: "For our first 50 families. Daily calls up to 4 minutes.",
    features: { familyTimezone: false, weeklyDigest: true },
    seatLimit: 50,
    sortOrder: 1,
  },
  {
    id: "standard",
    name: "Standard",
    priceInr: 1499,
    priceUsdLabel: null,
    maxCallMinutes: 4,
    description: "Daily calls up to 4 minutes, summaries and alerts for the whole family.",
    features: { familyTimezone: false, weeklyDigest: true },
    seatLimit: null,
    sortOrder: 2,
  },
  {
    id: "abroad",
    name: "Abroad",
    priceInr: 2299,
    priceUsdLabel: "about $25",
    maxCallMinutes: 5,
    description:
      "For children living abroad. Daily calls up to 5 minutes, times shown in your time zone.",
    features: { familyTimezone: true, weeklyDigest: true },
    seatLimit: null,
    sortOrder: 3,
  },
];

export const DEFAULT_ADD_ONS = [
  {
    id: "lucknow_visit",
    name: "Lucknow local check-in",
    description: "A real person visits if 2 calls in a row are missed. (Coming later.)",
    priceInr: 499,
    active: false,
  },
];

/** The plan used during the free trial (before the family picks one). */
export const TRIAL_PLAN_ID = "standard";
