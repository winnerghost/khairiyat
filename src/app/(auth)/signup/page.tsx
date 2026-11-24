import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getEnv } from "@/lib/env";
import { getSessionUser } from "@/server/session";
import { googleAction } from "../actions";
import { SignupForm } from "../forms";

export const metadata: Metadata = { title: "Start your free trial" };

export default async function SignupPage() {
  if (await getSessionUser()) redirect("/app");
  const env = getEnv();
  return (
    <>
      <div>
        <h1 className="font-heading text-3xl">Start your 7-day free trial</h1>
        <p className="mt-2 text-lg text-muted">
          Set up daily check-in calls for your parent in about 5 minutes.
        </p>
      </div>
      <SignupForm />
      {env.modes.googleAuth === "enabled" && (
        <form action={googleAction}>
          <Button type="submit" variant="secondary" className="w-full">
            Continue with Google
          </Button>
        </form>
      )}
      <p className="text-center text-base">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-primary underline">
          Log in
        </Link>
      </p>
    </>
  );
}
