import type { Metadata } from "next";
import { Callout } from "@/components/ui/card";
import { Markdown } from "@/components/markdown";
import { TERMS_MD } from "@/content/legal/terms";

export const metadata: Metadata = { title: "Terms of Service (draft)" };

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <Callout tone="warning" title="Draft">
        This document is a draft awaiting legal review.
      </Callout>
      <Markdown source={TERMS_MD} />
    </div>
  );
}
