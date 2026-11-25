import type { Metadata } from "next";
import { Landing } from "@/components/marketing/landing";
import { brand } from "@/config/brand";
import { warmDemoWorld } from "@/server/demo-world";

// Prices come from the database (editable in admin), so render per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: `${brand.name}: daily check-in calls for your parents` },
  description:
    "A warm AI assistant calls your parent every day in Hindi, Urdu, Hinglish or English, and sends you a gentle WhatsApp note. Alerts if they can't be reached. Not an emergency service.",
  alternates: { canonical: "/", languages: { "en-IN": "/", "hi-IN": "/hi" } },
};

export default async function Home() {
  // Public demo website: start building the demo in the background.
  await warmDemoWorld();
  return <Landing lang="en" />;
}
