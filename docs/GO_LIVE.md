# Go-live checklist

**Nothing in this file is needed for the demo.** The demo runs on your laptop with no accounts, and online at https://khairiyat-demo.netlify.app (see the README). Use this list only when you decide to serve real families.

Items are in the order to start them, **slow ones first** (approvals can take weeks). Facts marked **(verify)** come from research on 24 Nov 2026; re-check them with the provider.

## A. Start early (long lead time)

### A1. Register the business

Telephony KYC, WhatsApp Business verification and Razorpay all ask for business documents.

- [ ] Sole proprietorship via **Udyam** (free, online, Aadhaar + PAN), or LLP / Pvt Ltd
- [ ] Current account in the business name
- [ ] Decide on GST (Admin → Settings → GST invoices, switch on only once registered)

### A2. Telephony for Indian calls (biggest open decision)

Findings **(verify)**:

- ElevenLabs' Plivo guide: calls to/from India over a SIP trunk need the ElevenLabs deployment **in India ("India residency")**, set up via **ElevenLabs sales**; otherwise "Domestic Anchored Terms not met". Indian Plivo numbers need KYC.
- ElevenLabs' **Ozonetel** page: needs an IN-residency account "per TRAI regulations".
- ElevenLabs' **Exotel** page: WebSocket bridge, IN residency "not required", calls started via Exotel's own API, and you host a small always-on bridge server (not free).
- TRAI's **1601 series** for non-banking service calls is rolling out by sector (from Aug 2026). Not yet shown to apply to us; re-check. Calls must stay **service calls with consent**, never promotional.

To do:

- [ ] Ask ElevenLabs sales about India residency (price, plan). If you use it, set `ELEVENLABS_API_BASE=https://api.in.residency.elevenlabs.io` (verify host)
- [ ] Quotes and KYC lists from Exotel, Plivo, Ozonetel, Tata Tele
- [ ] For testing now: your existing ElevenLabs number **+91 91199 92192** (Twilio) works with `ELEVENLABS_TELEPHONY=twilio`

### A3. Domain

- [ ] Buy a domain (~₹800/year). Needed for email sending and WhatsApp verification.

## B. Real voice (can be done now, uses your ElevenLabs credits)

### B1. Agent

- [ ] ElevenLabs → API keys → create key → `.env.local`: `ELEVENLABS_API_KEY=…`
- [ ] Pick a warm Hindi female voice (and a male one) from your voice library → `ELEVENLABS_VOICE_ID_FEMALE`, `ELEVENLABS_VOICE_ID_MALE`
- [ ] `npm run agent:sync` → copy the printed `ELEVENLABS_AGENT_ID` into `.env.local` (run it again after any change in `agent/`)
- [ ] `npm run demo` → Demo room → **Talk to Roshni** in the browser. Check: Hindi quality, slow pace, disclosure, the consent flow, red-flag handling

### B2. First real test call to your own phone

- [ ] ElevenLabs → Phone numbers → copy the id of +91 91199 92192 → `ELEVENLABS_PHONE_NUMBER_ID=phnum_…`, `ELEVENLABS_TELEPHONY=twilio`
- [ ] `npm run call:test -- +91YOURNUMBER female daily "your name"`. Your phone rings; try "theek hai", "robot ho?", "phone mat karo", "gir gaya tha"
- [ ] Open ElevenLabs → Agents → Conversations to read the transcript and data collection results

### B3. Webhooks (results flowing into the app)

- [ ] The app must be reachable on the internet (deployed, or a tunnel for testing)
- [ ] ElevenLabs → Agents → Settings → Webhooks: add `https://YOUR-DOMAIN/api/webhooks/elevenlabs` with HMAC enabled; copy the secret → `ELEVENLABS_WEBHOOK_SECRET`; events: transcript, audio, call initiation failure
- [ ] Optional: put the webhook id in `ELEVENLABS_POST_CALL_WEBHOOK_ID` and re-run `npm run agent:sync`
- [ ] With all four ElevenLabs keys set, voice is "real": Demo room "Call now" places real calls (only to your own test number!)

## D. Hosting (free tiers)

- [ ] **Supabase**: project in **Mumbai (ap-south-1)** (region can't change later). Copy the pooler connection string (transaction mode, port 6543) → `DATABASE_URL`. Migrations run automatically on first start.
- [ ] **Netlify**: a **new** site from the GitHub repo (keep `khairiyat-demo` as the demo); set all env vars; `APP_ENV=production`, `APP_URL=https://YOUR-DOMAIN`. Re-read Netlify's agreement to confirm the free plan allows commercial use.
- [ ] The repo includes `@netlify/database`, so a Netlify site also gets a Netlify Database. With Supabase, set `DATABASE_URL` (it takes priority) and the Netlify one stays unused. Netlify's free plan is **300 credits a month shared by all sites on the team**, and running out pauses all of them: keep production on its own team or a paid plan.
- [ ] Secrets: `DATA_ENCRYPTION_KEY` (`openssl rand -base64 32`, keep an offline copy: losing it loses health notes), `BETTER_AUTH_SECRET`, `CRON_SECRET`, `ADMIN_EMAILS`
- [ ] Scheduler: run `supabase/sql/cron.sql` in the Supabase SQL editor (pg_cron → `/api/cron/tick` every minute)
- [ ] Monitoring: Healthchecks.io check (period 1 min, grace 3 min) → `HEALTHCHECKS_PING_URL`; an uptime monitor on `/api/health` (returns 503 if the scheduler stalls)
- [ ] Backups: Supabase free has none. Nightly `pg_dump` (e.g. a GitHub Action) encrypted, and **test a restore once**. Upgrade to Supabase Pro (~$25/month) at ~10 paying families.

## E. Still to build before real families (next development step)

- [ ] **WhatsApp Cloud API provider** (Meta): business verification, phone number, submit the templates in [whatsapp-templates.md](whatsapp-templates.md), delivery/read status webhook, verify per-message price
- [ ] **Email provider** (Resend or similar): verify domain (SPF/DKIM); also used for password-reset emails
- [ ] **Razorpay Subscriptions**: KYC, Subscriptions + international cards enabled, plans created, checkout + payment signature verification + webhooks (`X-Razorpay-Signature`)
- [ ] **Error monitoring**: add Sentry (free Developer plan) with `SENTRY_DSN`
- [ ] Each must be built from the provider's current official docs, with the doc URL in a code comment (AGENTS.md rule)

## F. Legal and trust

- [ ] Lawyer review of `/privacy`, `/terms`, `/not-an-emergency-service` (texts in `src/content/legal/`, marked DRAFT; fill the [placeholders])
- [ ] Rewrite the founder note in your own words (`src/content/landing.ts`)
- [ ] Privacy policy lists exact providers and where they process data (ElevenLabs outside India unless India residency)

## G. Final rehearsal

- [ ] Real phone, real family member: sign up → onboarding → consent call → daily call → WhatsApp summary → not-reached alert → red-flag alert → payment → export → delete
- [ ] `npm run simulate:week` and `npm run loadtest:tick` pass; CI green
- [ ] Read [RUNBOOK.md](RUNBOOK.md) once end to end

## Sources (research, 24 Nov 2026)

- Plivo × ElevenLabs India: https://www.plivo.com/docs/voice-agents/sip-trunking/integration-guides/elevenlabs.md
- ElevenLabs × Exotel: https://elevenlabs.io/agents/integrations/exotel
- ElevenLabs × Ozonetel: https://elevenlabs.io/agents/integrations/ozonetel
- ElevenLabs outbound calls, webhooks, agents API: https://elevenlabs.io/docs/eleven-agents/
- TRAI 1601 series (Aug 2026): https://trai.gov.in/sites/default/files/2026-08/PR_No113of2026_1.pdf
- Vercel Hobby (non-commercial): https://vercel.com/docs/accounts/plans/hobby-plan
- Netlify credits: https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/
- Supabase limits / pausing / regions / cron: https://supabase.com/docs/guides/functions/limits · https://supabase.com/docs/guides/platform/project-pausing · https://supabase.com/docs/guides/platform/regions · https://supabase.com/docs/guides/functions/schedule-functions
