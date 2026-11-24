import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { brand } from "@/config/brand";
import { FAQ_EN } from "@/content/faq";
import { FAQ_HI, LANDING, type LandingLang } from "@/content/landing";
import { getDb } from "@/db/client";
import { plans } from "@/db/schema/app";
import { foundingSeatsLeft } from "@/engine/billing";
import { getEnv } from "@/lib/env";

async function loadPlans() {
  try {
    const db = await getDb();
    const list = await db
      .select()
      .from(plans)
      .where(eq(plans.active, true))
      .orderBy(asc(plans.sortOrder));
    const seats = await foundingSeatsLeft(db);
    return list
      .filter((p) => p.id !== "founding" || seats > 0)
      .map((p) => ({ ...p, seats: p.id === "founding" ? seats : null }));
  } catch {
    return [];
  }
}

function PhoneMock({ text, label }: { text: string; label: string }) {
  return (
    <figure className="mx-auto w-full max-w-[19rem]" aria-label={label}>
      <div className="overflow-hidden rounded-[2.2rem] border-[10px] border-foreground/90 bg-[#efe7dd] shadow-2xl">
        <div className="flex items-center gap-2 bg-[#075e54] px-4 py-3 text-white">
          <span className="flex size-8 items-center justify-center rounded-full bg-white/20 font-heading">
            {brand.name[0]}
          </span>
          <span className="font-semibold">{brand.name}</span>
        </div>
        <div className="flex min-h-64 flex-col justify-end p-3">
          <p className="whitespace-pre-line rounded-lg rounded-tl-none bg-white px-3 py-2 text-[14px] leading-snug text-[#111] shadow-sm">
            {text}
            <span className="mt-1 block text-right text-[11px] text-[#667781]">9:36 am</span>
          </p>
        </div>
      </div>
    </figure>
  );
}

export async function Landing({ lang }: { lang: LandingLang }) {
  const t = LANDING[lang];
  const faq = lang === "hi" ? FAQ_HI : FAQ_EN;
  const list = await loadPlans();
  const env = getEnv();
  const wa = env.SUPPORT_WHATSAPP_NUMBER?.replace(/\D/g, "");
  const otherHref = lang === "hi" ? "/" : "/hi";

  return (
    <div lang={lang} className="flex flex-col">
      <header className="sticky top-0 z-10 border-b border-foreground/10 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3">
          <Link href={lang === "hi" ? "/hi" : "/"} className="font-heading text-2xl text-primary">
            {lang === "hi" ? brand.nameHi : brand.name}
          </Link>
          <nav className="flex items-center gap-1 text-base" aria-label="Main">
            <Link
              href={otherHref}
              className="rounded-lg px-2 py-2 hover:bg-foreground/5"
              hrefLang={lang === "hi" ? "en" : "hi"}
            >
              {t.nav.switchTo}
            </Link>
            <Link href="/login" className="rounded-lg px-2 py-2 hover:bg-foreground/5">
              {t.nav.login}
            </Link>
            <Link
              href="/signup"
              className="hidden rounded-xl bg-primary px-3 py-2 font-semibold text-primary-foreground sm:inline"
            >
              {t.nav.trial}
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-5xl items-center gap-10 px-4 py-12 md:grid-cols-[1.2fr_1fr] md:py-20">
          <div className="flex flex-col gap-5">
            <p className="text-sm font-semibold tracking-wide text-primary uppercase">
              {t.hero.eyebrow}
            </p>
            <h1 className="font-heading text-5xl leading-[1.05] text-foreground md:text-6xl">
              {t.hero.title}
            </h1>
            <p className="text-xl leading-relaxed text-foreground/80">{t.hero.sub}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="rounded-xl bg-primary px-6 py-3.5 text-center text-lg font-semibold text-primary-foreground shadow-md hover:brightness-110"
              >
                {t.hero.cta}
              </Link>
              <a
                href="#sample"
                className="rounded-xl border border-foreground/15 bg-surface px-6 py-3.5 text-center text-lg font-semibold hover:bg-foreground/5"
              >
                {t.hero.secondary}
              </a>
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
              {t.hero.trust.map((x) => (
                <li key={x} className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="text-accent">
                    ✦
                  </span>{" "}
                  {x}
                </li>
              ))}
            </ul>
          </div>
          <PhoneMock text={t.sample.message} label={t.sample.title} />
        </section>

        <section className="bg-surface py-14">
          <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4">
            <h2 className="font-heading text-3xl md:text-4xl">{t.how.title}</h2>
            <ol className="grid gap-5 md:grid-cols-3">
              {t.how.steps.map((s, i) => (
                <li
                  key={s.t}
                  className="flex flex-col gap-2 rounded-2xl border border-foreground/10 bg-background p-5"
                >
                  <span className="flex size-10 items-center justify-center rounded-full bg-accent/25 font-heading text-xl text-primary">
                    {i + 1}
                  </span>
                  <h3 className="font-heading text-xl">{s.t}</h3>
                  <p className="text-base text-foreground/80">{s.d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="sample" className="mx-auto grid max-w-5xl gap-8 px-4 py-14 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            <h2 className="font-heading text-3xl">{t.sample.callTitle}</h2>
            <ol className="flex flex-col gap-2">
              {t.sample.call.map((l, i) => (
                <li
                  key={i}
                  className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-base ${l.who === brand.assistantNames.female ? "self-start bg-surface" : "self-end bg-primary/10"}`}
                >
                  <span className="block text-xs font-semibold text-muted">{l.who}</span>
                  {l.text}
                </li>
              ))}
            </ol>
          </div>
          <div className="flex flex-col gap-3">
            <h2 className="font-heading text-3xl">{t.sample.title}</h2>
            <p className="text-sm text-muted">{t.sample.note}</p>
            <p className="whitespace-pre-line rounded-2xl border border-[#d1e7dd] bg-[#f3fbf6] p-4 text-base">
              {t.sample.message}
            </p>
          </div>
        </section>

        <section className="bg-surface py-14">
          <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4">
            <h2 className="font-heading text-3xl md:text-4xl">{t.who.title}</h2>
            <div className="grid gap-5 md:grid-cols-3">
              {t.who.items.map((w) => (
                <div key={w.t} className="flex flex-col gap-2 rounded-2xl bg-background p-5">
                  <h3 className="font-heading text-xl">{w.t}</h3>
                  <p className="text-base text-foreground/80">{w.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-14">
          <h2 className="font-heading text-3xl md:text-4xl">{t.honest.title}</h2>
          <div className="grid gap-5 md:grid-cols-2">
            <ul className="flex flex-col gap-2 rounded-2xl border border-success/30 bg-success/5 p-5">
              {t.honest.is.map((x) => (
                <li key={x} className="flex gap-2 text-base">
                  <span aria-hidden="true" className="text-success">
                    ✓
                  </span>
                  {x}
                </li>
              ))}
            </ul>
            <ul className="flex flex-col gap-2 rounded-2xl border border-danger/25 bg-danger/5 p-5">
              {t.honest.isnt.map((x) => (
                <li key={x} className="flex gap-2 text-base">
                  <span aria-hidden="true" className="text-danger">
                    ✕
                  </span>
                  {x}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="pricing" className="bg-surface py-14">
          <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4">
            <div>
              <h2 className="font-heading text-3xl md:text-4xl">{t.pricing.title}</h2>
              <p className="mt-2 text-lg text-foreground/80">{t.pricing.trial}</p>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {list.map((p) => (
                <div
                  key={p.id}
                  className={`flex flex-col gap-3 rounded-2xl border p-5 ${p.id === "standard" ? "border-primary/50 bg-background shadow-md" : "border-foreground/10 bg-background"}`}
                >
                  <h3 className="font-heading text-xl">{p.name}</h3>
                  <p className="font-heading text-4xl">
                    ₹{p.priceInr.toLocaleString("en-IN")}
                    <span className="text-base font-normal text-muted">{t.pricing.perMonth}</span>
                  </p>
                  {p.priceUsdLabel && <p className="text-sm text-muted">{p.priceUsdLabel}</p>}
                  <p className="text-base text-foreground/80">{p.description}</p>
                  {p.seats !== null && (
                    <p className="text-sm font-semibold text-primary">
                      {p.seats} / {p.seatLimit} left
                    </p>
                  )}
                  <Link
                    href="/signup"
                    className="mt-auto rounded-xl bg-primary px-4 py-2.5 text-center font-semibold text-primary-foreground"
                  >
                    {t.pricing.cta}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-14">
          <h2 className="font-heading text-3xl md:text-4xl">{t.trust.title}</h2>
          <div className="grid gap-5 md:grid-cols-2">
            {t.trust.items.map((x) => (
              <div
                key={x.t}
                className="flex flex-col gap-2 rounded-2xl border border-foreground/10 bg-surface p-5"
              >
                <h3 className="font-heading text-xl">{x.t}</h3>
                <p className="text-base text-foreground/80">{x.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="faq" className="bg-surface py-14">
          <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4">
            <h2 className="font-heading text-3xl md:text-4xl">{t.faqTitle}</h2>
            {faq.map((f) => (
              <details
                key={f.q}
                className="rounded-xl border border-foreground/10 bg-background p-4"
              >
                <summary className="cursor-pointer text-lg font-semibold">{f.q}</summary>
                <p className="mt-2 text-base text-foreground/85">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-14">
          <h2 className="font-heading text-3xl">{t.founder.title}</h2>
          <p className="text-lg leading-relaxed text-foreground/85">{t.founder.body}</p>
          <p className="font-heading text-lg text-primary">{t.founder.sign}</p>
        </section>

        <section className="bg-primary py-14 text-primary-foreground">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 px-4 text-center">
            <h2 className="font-heading text-3xl md:text-4xl">{t.final.title}</h2>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="rounded-xl bg-background px-6 py-3.5 text-lg font-semibold text-primary"
              >
                {t.final.cta}
              </Link>
              {wa && (
                <a
                  href={`https://wa.me/${wa}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl border border-primary-foreground/50 px-6 py-3.5 text-lg font-semibold"
                >
                  {t.final.whatsapp}
                </a>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-foreground/10 bg-background">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-8 text-sm text-muted">
          <p className="font-semibold text-foreground">{t.footer.emergency}</p>
          <nav className="flex flex-wrap gap-4" aria-label="Legal">
            <Link href="/privacy" className="underline">
              {t.footer.links.privacy}
            </Link>
            <Link href="/terms" className="underline">
              {t.footer.links.terms}
            </Link>
            <Link href="/not-an-emergency-service" className="underline">
              {t.footer.links.emergency}
            </Link>
          </nav>
          <p>
            © {new Date().getFullYear()} {brand.name}
          </p>
        </div>
      </footer>
    </div>
  );
}
