import type { Metadata } from "next";
import Link from "next/link";
import { getEnv } from "@/lib/env";
import { ForgotForm } from "../forms";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPage() {
  const env = getEnv();
  return (
    <>
      <h1 className="font-heading text-3xl">Reset your password</h1>
      <p className="text-lg text-muted">
        Enter your email and we&apos;ll send you a link to choose a new password.
      </p>
      <ForgotForm demo={env.modes.email === "mock"} />
      <Link href="/login" className="text-center text-primary underline">
        Back to log in
      </Link>
    </>
  );
}
