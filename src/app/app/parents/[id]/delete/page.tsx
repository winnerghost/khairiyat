import type { Metadata } from "next";
import Link from "next/link";
import { Callout, Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireParent } from "@/server/session";
import { deleteParentAction } from "../actions";

export const metadata: Metadata = { title: "Delete parent" };

export default async function DeleteParentPage({
  params,
  searchParams,
}: PageProps<"/app/parents/[id]/delete">) {
  const { id } = await params;
  const sp = await searchParams;
  const { parent } = await requireParent(id);
  return (
    <Card className="flex flex-col gap-4">
      <h1 className="font-heading text-3xl">Delete {parent.addressAs}?</h1>
      <p className="text-lg">
        This stops all calls and permanently deletes {parent.name}&apos;s profile, schedule,
        medicines, notes, call history, transcripts and alerts. This cannot be undone.
      </p>
      <p className="text-base text-muted">
        Want a copy first?{" "}
        <a href="/api/export" className="underline">
          Download all your data
        </a>
        .
      </p>
      {sp.error === "1" && (
        <Callout tone="danger">The name didn&apos;t match. Nothing was deleted.</Callout>
      )}
      <form action={deleteParentAction.bind(null, parent.id)} className="flex flex-col gap-3">
        <label htmlFor="confirm" className="text-base font-semibold">
          Type <span className="font-mono">{parent.addressAs}</span> to confirm
        </label>
        <Input id="confirm" name="confirm" autoComplete="off" required />
        <SubmitButton variant="danger" pendingText="Deleting…">
          Delete permanently
        </SubmitButton>
      </form>
      <Link href={`/app/parents/${parent.id}`} className="text-center text-primary underline">
        Cancel
      </Link>
    </Card>
  );
}
