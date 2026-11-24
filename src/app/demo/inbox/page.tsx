import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { mockMessages } from "@/db/schema/app";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Demo inbox" };

/**
 * Demo-only email inbox: every email the app "sent" (password resets,
 * fallback alerts). Visible without logging in so password-reset can be
 * demonstrated. The demo layout makes this page 404 outside demo mode.
 */
export default async function DemoInbox() {
  const db = await getDb();
  const emails = await db
    .select()
    .from(mockMessages)
    .where(eq(mockMessages.channel, "email"))
    .orderBy(desc(mockMessages.createdAt))
    .limit(30);
  return (
    <>
      <div>
        <h1 className="font-heading text-3xl">Demo email inbox</h1>
        <p className="text-base text-muted">
          Emails are not really sent in demo mode. They appear here instead.
        </p>
      </div>
      {emails.length === 0 && <p className="text-base">No emails yet.</p>}
      <ol className="flex flex-col gap-3">
        {emails.map((e) => (
          <li key={e.id}>
            <Card className="flex flex-col gap-1">
              <p className="text-sm text-muted">
                To {e.toAddress} · {e.createdAt.toLocaleString("en-IN")}
              </p>
              <p className="font-semibold">{e.subject}</p>
              <p className="whitespace-pre-line break-words text-base">
                {e.body.split(/(https?:\/\/\S+)/g).map((part, i) =>
                  /^https?:\/\//.test(part) ? (
                    <a key={i} href={part} className="break-all text-primary underline">
                      {part}
                    </a>
                  ) : (
                    <span key={i}>{part}</span>
                  ),
                )}
              </p>
            </Card>
          </li>
        ))}
      </ol>
    </>
  );
}
