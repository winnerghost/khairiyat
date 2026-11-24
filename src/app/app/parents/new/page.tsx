import type { Metadata } from "next";
import { ProfileForm } from "@/components/family/onboarding-forms";
import { StepHeader } from "@/components/family/step-header";
import { requireMember } from "@/server/session";
import { createParentAction } from "../actions";

export const metadata: Metadata = { title: "Add a parent" };

export default async function NewParentPage() {
  await requireMember();
  return (
    <>
      <StepHeader current="profile" />
      <ProfileForm action={createParentAction} mode="setup" />
    </>
  );
}
