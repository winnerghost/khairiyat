# Khairiyat

**Har subah, Maa ki khairiyat.** A warm AI voice assistant (Roshni, or Aman for a male voice) calls an elderly parent every day on their normal phone, in Hindi, Hinglish, Urdu or English. It asks how they are, about medicines, food and sleep, and remembers earlier calls. The family gets a short, gentle WhatsApp summary. If the parent can't be reached after retries, or mentions something worrying (a fall, chest pain, breathlessness), the family is alerted straight away.

It is **not** a medical service, **not** an emergency service, and does not replace family calls.

> Status: **Phase 0** (foundation). See [Build phases](#build-phases).

---

## Run it on your laptop (demo mode, no accounts)

You need **Node.js 22** (check with `node -v`). Nothing else: no Docker, no database install, no API keys.

```bash
npm install
npm run demo        # open http://localhost:3000
```

In demo mode, calls, WhatsApp, email and payments are realistic **mocks**. Real providers switch on only when their keys are set (see `.env.example`).

Check the app is alive: http://localhost:3000/api/health

## Everyday commands

| Command                      | What it does                                                        |
| ---------------------------- | ------------------------------------------------------------------- |
| `npm run demo`               | Start the app in demo mode                                          |
| `npm test`                   | Unit + integration tests (fast)                                     |
| `npm run e2e`                | Browser tests on a 390px phone and a desktop (builds the app first) |
| `npm run lint` / `typecheck` | Code quality checks                                                 |
| `npm run format`             | Auto-format the code                                                |
| `npm run check`              | Lint + typecheck + format check + tests, all at once                |

Coming in later phases: `npm run seed` (demo families), `npm run simulate:week` (a fake week of 50 parents), `npm run loadtest:tick` (1,000 parents), `npm run agent:sync` (push the voice agent to ElevenLabs).

## Configuration

Copy `.env.example` to `.env.local` and fill in only what you have. Rules:

- Empty = demo mock. All keys of a provider filled = real provider.
- **Some** keys of a provider filled = the app refuses to start. This is deliberate: a half-set-up WhatsApp must never silently drop real alerts.
- In production the app refuses to start with demo secrets or mock providers.
- **Never commit secrets.** `.env*` files are git-ignored (except `.env.example`).

## Where things live

```
agent/        Voice agent "as code" (prompt, fields, tests) → synced to ElevenLabs
docs/         ARCHITECTURE, GO_LIVE checklist, RUNBOOK, WhatsApp templates, legal drafts
src/app/      Website: landing, family app, admin panel, API routes
src/config/   brand.ts: name, colours, assistant names (rename everything here)
src/engine/   The call engine: scheduler, retries, red flags, alerts (runs on Supabase)
src/providers/ Swappable providers (voice, WhatsApp, email, payments), each with a mock
src/lib/      Shared helpers: env config, logging, time zones, phone numbers, encryption
supabase/     Edge Function wrappers, pg_cron schedule, database guard rules
tests/        unit, integration, e2e, simulation
```

## Build phases

0. ✅ Plan, repo, CI, env setup, docs
1. Data model, login, onboarding wizard and dashboard (demo mode)
2. Call engine with mock voice: scheduler, retries, reconciliation, red flags, alerts outbox, week simulation
3. ElevenLabs agent as code, real calls, webhook verification, first test call
4. WhatsApp + email with approved templates
5. Razorpay billing, trial and grace period
6. Admin panel with cost and margin tracking
7. Landing page, legal drafts, SEO
8. Hardening: security review, load test, go-live checklist

## Read next

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how it works and why
- [docs/GO_LIVE.md](docs/GO_LIVE.md): accounts, keys and approvals needed before real families
- [docs/RUNBOOK.md](docs/RUNBOOK.md): what to do when calls or alerts fail
