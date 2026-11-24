import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Callout, Card } from "@/components/ui/card";
import { getEnv } from "@/lib/env";
import { DEMO_LOGIN } from "@/server/demo-accounts";
import { getSessionUser } from "@/server/session";
import { demoLoginAction, googleAction } from "../actions";
import { LoginForm } from "../forms";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  if (await getSessionUser()) redirect("/app");
  const env = getEnv();
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const showDemo = env.isDemo && env.APP_ENV !== "production";
  return (
    <>
      <h1 className="font-heading text-3xl">Welcome back</h1>
      {sp.reset === "1" && (
        <Callout tone="success">Your password was changed. Please log in.</Callout>
      )}
      {sp.demo === "missing" && (
        <Callout tone="warning">
          Demo accounts not found. Run <code>npm run seed</code> and try again.
        </Callout>
      )}
      {showDemo && (
        <Card className="flex flex-col gap-3 border-accent/50 bg-accent/10">
          <p className="font-semibold">Demo mode: explore without signing up</p>
          <form action={demoLoginAction} className="flex flex-col gap-2">
            <Button type="submit" name="who" value="family" size="lg">
              Open the Sharma family demo
            </Button>
            <Button type="submit" name="who" value="admin" variant="secondary">
              Open the admin panel
            </Button>
          </form>
          <p className="text-sm text-muted">
            Or log in as {DEMO_LOGIN.family.email} / {DEMO_LOGIN.family.password}
          </p>
        </Card>
      )}
      <LoginForm next={next} />
      {env.modes.googleAuth === "enabled" && (
        <form action={googleAction}>
          <Button type="submit" variant="secondary" className="w-full">
            Continue with Google
          </Button>
        </form>
      )}
      <p className="text-center text-base">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-primary underline">
          Start your free trial
        </Link>
      </p>
    </>
  );
}
