import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { brand } from "@/config/brand";
import { Callout } from "@/components/ui/card";
import { acceptInvitation } from "@/server/families";
import { getSessionUser, requireMember } from "@/server/session";

export const metadata: Metadata = { title: "Join your family" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/signup?next=${encodeURIComponent(`/invite/${token}`)}`);
  const { db } = await requireMember();
  const result = await acceptInvitation(db, {
    token,
    userId: user.id,
    displayName: user.name,
    now: new Date(),
  });
  if (result.ok) redirect("/app");
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-10">
      <h1 className="font-heading text-3xl">{brand.name}</h1>
      <Callout tone="danger">
        {result.reason === "has_parents"
          ? "You already set up a parent in your own account, so we can't move you. Ask your sibling to add you differently, or contact support."
          : "This invite link is invalid or has expired. Ask for a new one."}
      </Callout>
      <Link href="/app" className="text-primary underline">
        Go to my account
      </Link>
    </main>
  );
}
