# Khairiyat

**Har subah, Maa ki khairiyat.** A warm AI voice assistant (Roshni, or Aman for a male voice) calls an elderly parent every day on their normal phone, in Hindi, Hinglish, Urdu or English. It asks how they are, about medicines, food and sleep, and remembers earlier calls. The family gets a short, gentle WhatsApp summary. If the parent can't be reached after retries, or mentions something worrying (a fall, chest pain, breathlessness), the family is alerted straight away.

It is **not** a medical service, **not** an emergency service, and does not replace family calls.

> **Status: working demo / MVP.** Everything runs on your laptop with no accounts. Calls, WhatsApp, email and payments are realistic simulations. The real ElevenLabs voice is built in and switches on when you add your key. Real WhatsApp, email and Razorpay are the next step before launch (see [docs/GO_LIVE.md](docs/GO_LIVE.md)).

---

## Run the demo (5 minutes, no accounts)

You need **Node.js 22** (check with `node -v`). Nothing else: no Docker, no database, no keys.

```bash
npm install
npm run demo
```

Open **http://localhost:3000**. The first start takes about 20 seconds: it creates demo families and three weeks of call history (made by the real call engine, not hand-typed).

### What to click

| Where                                      | What you'll see                                                                                                                              |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **http://localhost:3000**                  | The landing page (English, with a **हिंदी** switch)                                                                                           |
| **Log in → "Open the Sharma family demo"** | Riya's family app: Maa and Papa ji, today's status, mood trend, medicines (self-reported), weekly digest, every call with transcript         |
| **Demo room** (yellow bar at the top)      | Make a pretend call happen _now_: pick "Mentions a fall", "Doesn't pick up", "Asks to stop the calls"… and watch it arrive ~12 seconds later |
| **Demo room → Phone**                      | A WhatsApp-style phone showing exactly the messages each family member and alert contact received                                            |
| **Demo room → Inbox**                      | Emails (password reset, fallback alerts)                                                                                                     |
| **Log in → "Open the admin panel"**        | Your view: today's calls, open alerts, capacity, costs and margins, failures with retry buttons, audit log, settings (prices, kill switch…)  |
| **Sign up**                                | Go through the real 7-step onboarding as a new family, then use the Demo room to call your pretend parent                                    |

Calls only happen between **8 am and 8 pm in the parent's time zone**, even in the demo (it's a hard rule). At night, set your demo parent's time zone to one where it's daytime (e.g. America/New_York) in the onboarding "Call time" step.

**Demo logins** (demo mode only, never in production): `riya@demo.khairiyat.app` / `khairiyat-demo`, admin `admin@demo.khairiyat.app` / `khairiyat-admin-demo`.

**Start fresh:** Demo room → "Reset all demo data", or `npm run seed`. Demo data lives in `~/.khairiyat/demo-data` (outside the project).

### Hear the real voice (optional, uses your ElevenLabs credits)

1. Create `.env.local` with your ElevenLabs key: `ELEVENLABS_API_KEY=...`
2. `npm run agent:sync`: creates the "Khairiyat daily check-in" agent from `agent/` and prints its id. Add it: `ELEVENLABS_AGENT_ID=...`
3. Restart `npm run demo` → Demo room → **Talk to Roshni** in your browser, with the same memory a real call would have.
4. A real phone call to your own number: see [docs/GO_LIVE.md §B2](docs/GO_LIVE.md).

---

## Everyday commands

| Command                              | What it does                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| `npm run demo`                       | Start the app in demo mode                                                                 |
| `npm run seed`                       | Rebuild demo data (`npm run seed -- 7` for 7 days)                                         |
| `npm test`                           | 127 unit + integration tests (about a minute)                                              |
| `npm run test:pg`                    | The integration tests on a real Postgres (set `TEST_DATABASE_URL`)                         |
| `npm run e2e`                        | Browser tests on a 390px phone and on desktop (full family journey)                        |
| `npm run simulate:week`              | 50 pretend parents × 7 pretend days with outages and lost messages; checks every hard rule |
| `npm run loadtest:tick`              | 1,000 parents at 9:30 am; checks the scheduler stays fast                                  |
| `npm run agent:sync`                 | Create/update the ElevenLabs agent from `agent/` (`-- --dry-run` to preview)               |
| `npm run call:test -- +91XXXXXXXXXX` | One real test call to your phone (needs ElevenLabs keys)                                   |
| `npm run check`                      | Lint + typecheck + formatting + tests                                                      |

## Configuration

Copy `.env.example` to `.env.local` and fill in only what you have.

- Empty = demo mock. All keys of a provider filled = real provider.
- **Some** keys of a provider filled = the app refuses to start (a half-set-up WhatsApp must never silently drop real alerts).
- In production the app refuses to start with demo secrets or mock providers.
- **Never commit secrets.** `.env*` files are git-ignored (except `.env.example`).

## What's real and what's simulated

| Part                                                                                  | Status                                                                      |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Family app, onboarding, dashboard, settings, export/delete                            | ✅ Real                                                                     |
| Call engine: scheduler, retries, voicemail, reconciliation, red flags, memory, outbox | ✅ Real (tested with a 50-parent virtual week)                              |
| Admin panel, costs and margins, audit log                                             | ✅ Real                                                                     |
| Billing logic: trial, grace period, cancel, invoices                                  | ✅ Real logic, **simulated payments**                                       |
| Voice calls                                                                           | ✅ ElevenLabs provider built; **simulated** until you add keys              |
| WhatsApp, email                                                                       | **Simulated** (messages appear in the Demo room). Real providers: next step |
| Razorpay                                                                              | **Simulated checkout**. Real integration: next step                         |
| Landing page, legal pages                                                             | ✅ Built; legal texts are **DRAFTs** for a lawyer                           |

## Where things live

```
agent/          The voice agent "as code": prompt, greetings, data fields, evaluation, test scenarios
docs/           ARCHITECTURE, GO_LIVE checklist, RUNBOOK, WhatsApp templates
drizzle/        Database migrations (incl. the guard-rail trigger)
scripts/        seed, simulate-week, loadtest-tick, agent-sync, test-call
src/app/        Pages: landing (/ and /hi), family app (/app), admin (/admin), demo room (/demo), API routes
src/config/     brand.ts (name, colours, assistant names: rename everything here), defaults.ts
src/content/    Landing copy (EN + HI), FAQ, legal drafts
src/engine/     The call engine (runtime-agnostic): tick, scheduler, dialer, post-call, outbox, billing
src/providers/  Voice (ElevenLabs + mock), WhatsApp (mock), email (mock)
src/sim/        Demo data, virtual-time runner, week simulation
tests/          Integration (PGlite + Postgres) and e2e (Playwright)
```

## Read next

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how it works and why
- [docs/GO_LIVE.md](docs/GO_LIVE.md): what's needed before real families (accounts, keys, approvals)
- [docs/RUNBOOK.md](docs/RUNBOOK.md): what to do when calls or alerts fail
- [docs/whatsapp-templates.md](docs/whatsapp-templates.md): the message templates to submit to Meta
