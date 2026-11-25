import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getEnv } from "@/lib/env";
import { getSessionUser } from "@/server/session";
import { googleAction } from "../actions";
import { SignupForm } from "../forms";

export const metadata: Metadata = { title: "Start your free trial" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const sp = await searchParams;
  const next =
    typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//")
      ? sp.next
      : undefined;
  if (await getSessionUser()) redirect(next ?? "/app");
  const env = getEnv();
  return (
    <>
      <div>
        <h1 className="font-heading text-3xl">Start your 7-day free trial</h1>
        <p className="mt-2 text-lg text-muted">
          Set up daily check-in calls for your parent in about 5 minutes.
        </p>
      </div>
      {env.isHostedDemo && (
        <p className="rounded-xl bg-accent/20 px-3 py-2 text-base">
          This is a public demo. Use a made-up email, names and phone numbers: other visitors can
          see demo data, and it is reset from time to time. No one is really called.
        </p>
      )}
      <SignupForm next={next} />
      {env.modes.googleAuth === "enabled" && (
        <form action={googleAction}>
          <Button type="submit" variant="secondary" className="w-full">
            Continue with Google
          </Button>
        </form>
      )}
      <p className="text-center text-base">
        Already have an account?{" "}
        <Link
          href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
          className="font-semibold text-primary underline"
        >
          Log in
        </Link>
      </p>
    </>
  );
}
