import type { Metadata } from "next";
import { assistantNameFor, brand } from "@/config/brand";
import { Callout, Card, CardTitle } from "@/components/ui/card";
import { getEnv } from "@/lib/env";
import { FAQ_EN } from "@/content/faq";

export const metadata: Metadata = { title: "Help" };

export default function HelpPage() {
  const env = getEnv();
  const wa = env.SUPPORT_WHATSAPP_NUMBER?.replace(/\D/g, "");
  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-heading text-3xl">Help</h1>
      <Callout tone="danger" title="In an emergency, call 112">
        {brand.name} is not an emergency or medical service. {assistantNameFor("female")} can&apos;t
        send help.
      </Callout>
      <Card className="flex flex-col gap-2">
        <CardTitle>Talk to us</CardTitle>
        {wa ? (
          <a
            href={`https://wa.me/${wa}`}
            className="text-lg font-semibold text-primary underline"
            rel="noopener noreferrer"
            target="_blank"
          >
            Message us on WhatsApp
          </a>
        ) : (
          <p className="text-base text-muted">
            WhatsApp support number not set yet (SUPPORT_WHATSAPP_NUMBER).
          </p>
        )}
        <p className="text-base text-muted">
          To report a problem with a specific call, open the call and use &ldquo;Report a
          problem&rdquo;.
        </p>
      </Card>
      <Card className="flex flex-col gap-3">
        <CardTitle>Questions</CardTitle>
        {FAQ_EN.map((f) => (
          <details key={f.q} className="rounded-xl border border-foreground/10 p-3">
            <summary className="cursor-pointer text-base font-semibold">{f.q}</summary>
            <p className="mt-2 text-base">{f.a}</p>
          </details>
        ))}
      </Card>
    </div>
  );
}
