import type { Metadata } from "next";
import { Markdown } from "@/components/markdown";
import { NOT_EMERGENCY_MD } from "@/content/legal/not-emergency";

export const metadata: Metadata = { title: "Not an emergency service" };

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <Markdown source={NOT_EMERGENCY_MD} />
    </div>
  );
}
