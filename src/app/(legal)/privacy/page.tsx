import type { Metadata } from "next";
import { Callout } from "@/components/ui/card";
import { Markdown } from "@/components/markdown";
import { PRIVACY_MD } from "@/content/legal/privacy";

export const metadata: Metadata = { title: "Privacy Policy (draft)" };

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <Callout tone="warning" title="Draft">
        This document is a draft awaiting legal review.
      </Callout>
      <Markdown source={PRIVACY_MD} />
    </div>
  );
}
