import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { brand } from "@/config/brand";
import { AutoRefresh } from "@/components/auto-refresh";
import { emergencyContacts, mockMessages, parents } from "@/db/schema/app";
import { formatPhone } from "@/lib/phone";
import { listMembers } from "@/server/families";
import { requireMember } from "@/server/session";

export const metadata: Metadata = { title: "Phone preview" };

/** Linkify URLs inside message text. */
function Linked({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a
            key={i}
            href={p.replace(/^https?:\/\/[^/]+/, "")}
            className="break-all text-[#027eb5] underline"
          >
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export default async function PhonePreview({ searchParams }: PageProps<"/demo/phone">) {
  const sp = await searchParams;
  const { db, family, member } = await requireMember();
  const members = await listMembers(db, family.id);
  const familyParents = await db
    .select({ id: parents.id })
    .from(parents)
    .where(eq(parents.familyId, family.id));
  const contacts = familyParents.length
    ? await db
        .select()
        .from(emergencyContacts)
        .where(
          inArray(
            emergencyContacts.parentId,
            familyParents.map((p) => p.id),
          ),
        )
        .orderBy(asc(emergencyContacts.createdAt))
    : [];
  const people = [
    ...members
      .filter((m) => m.whatsappE164)
      .map((m) => ({
        label: `${m.displayName}${m.id === member.id ? " (you)" : ""}`,
        number: m.whatsappE164!,
      })),
    ...contacts.map((c) => ({ label: `${c.name} (alert contact)`, number: c.whatsappE164 })),
  ].filter((p, i, arr) => arr.findIndex((x) => x.number === p.number) === i);
  const selected =
    typeof sp.to === "string" && people.some((p) => p.number === sp.to)
      ? sp.to
      : (people[0]?.number ?? "");
  const messages = selected
    ? await db
        .select()
        .from(mockMessages)
        .where(and(eq(mockMessages.channel, "whatsapp"), eq(mockMessages.toAddress, selected)))
        .orderBy(desc(mockMessages.createdAt))
        .limit(40)
    : [];
  messages.reverse();

  return (
    <>
      <AutoRefresh seconds={6} maxTimes={50} />
      <div>
        <h1 className="font-heading text-3xl">WhatsApp phone preview</h1>
        <p className="text-base text-muted">
          What arrives on each person&apos;s WhatsApp (simulated in demo mode).
        </p>
      </div>
      {people.length === 0 ? (
        <p className="text-base">
          Nobody has a WhatsApp number yet. Add yours in{" "}
          <Link href="/app/settings" className="underline">
            Settings
          </Link>
          .
        </p>
      ) : (
        <nav className="flex flex-wrap gap-2" aria-label="Whose phone">
          {people.map((p) => (
            <Link
              key={p.number}
              href={`/demo/phone?to=${encodeURIComponent(p.number)}`}
              aria-current={p.number === selected ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-sm ${p.number === selected ? "border-primary bg-primary text-primary-foreground" : "border-foreground/20 bg-surface"}`}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      )}
      {selected && (
        <div className="mx-auto w-full max-w-sm overflow-hidden rounded-[2rem] border-8 border-foreground/85 bg-[#efe7dd] shadow-xl">
          <div className="flex items-center gap-3 bg-[#075e54] px-4 py-3 text-white">
            <span className="flex size-9 items-center justify-center rounded-full bg-white/20 font-heading text-lg">
              {brand.name[0]}
            </span>
            <div>
              <p className="font-semibold leading-tight">{brand.name}</p>
              <p className="text-xs opacity-80">to {formatPhone(selected)}</p>
            </div>
          </div>
          <ol className="flex max-h-[34rem] min-h-80 flex-col gap-2 overflow-y-auto p-3">
            {messages.length === 0 && (
              <li className="mx-auto mt-10 rounded-lg bg-white/80 px-3 py-2 text-sm">
                No messages yet.
              </li>
            )}
            {messages.map((m) => (
              <li
                key={m.id}
                className="max-w-[88%] self-start whitespace-pre-line rounded-lg rounded-tl-none bg-white px-3 py-2 text-[15px] leading-snug text-[#111] shadow-sm"
              >
                <Linked text={m.body} />
                <span className="mt-1 block text-right text-[11px] text-[#667781]">
                  {m.createdAt.toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}
