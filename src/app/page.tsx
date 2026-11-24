import { brand } from "@/config/brand";

/**
 * Temporary home page (Phase 0). The real landing page is built in Phase 7.
 */
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      <p className="text-sm font-semibold tracking-wide text-primary uppercase">{brand.name}</p>
      <h1 className="font-heading text-4xl leading-tight text-foreground">{brand.tagline}</h1>
      <p className="text-lg text-muted">{brand.taglineEn}</p>
      <p className="rounded-xl border border-accent/40 bg-surface p-4 text-base">
        We are building this carefully. {brand.assistantNames.female} will call your parent every
        day, ask how they are, and send you a short, gentle note. It is not a medical or emergency
        service.
      </p>
    </main>
  );
}
