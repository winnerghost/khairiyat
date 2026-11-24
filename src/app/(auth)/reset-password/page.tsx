import type { Metadata } from "next";
import Link from "next/link";
import { Callout } from "@/components/ui/card";
import { ResetForm } from "../forms";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPage({ searchParams }: PageProps<"/reset-password">) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  const error = typeof sp.error === "string" ? sp.error : "";
  return (
    <>
      <h1 className="font-heading text-3xl">Choose a new password</h1>
      {!token || error ? (
        <Callout tone="danger">
          This reset link is invalid or has expired.{" "}
          <Link href="/forgot-password" className="underline">
            Ask for a new one
          </Link>
          .
        </Callout>
      ) : (
        <ResetForm token={token} />
      )}
    </>
  );
}
