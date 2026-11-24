# Go-live checklist

Everything needed before **real families** use Khairiyat. Items are in the order to start them, with the **slow ones first** (approvals can take weeks). Tick each box only when it's done and tested.

> Facts marked **(verify)** come from research on 24 Nov 2026 and must be re-checked with the provider before relying on them.

## A. Start now (long lead time, not needed for Phases 0–2)

### A1. Register the business

Every provider below (telephony KYC, WhatsApp Business verification, Razorpay) asks for business documents.

- [ ] Register as a **sole proprietorship** via **Udyam** (free, online, uses Aadhaar + PAN). An LLP or Pvt Ltd also works but costs more.
- [ ] Open a **current account** in the business name.
- [ ] Decide on GST registration (not mandatory below the turnover threshold. Some providers ask for it, so confirm each one's document list).
- [ ] Keep scanned copies ready: PAN, Aadhaar, Udyam certificate, bank proof, address proof.

### A2. Telephony for Indian calls (the biggest open decision)

Findings **(verify)**:

- ElevenLabs' Plivo guide says calls to/from India over a SIP trunk need the ElevenLabs deployment **in India ("India residency")**, set up by contacting **ElevenLabs sales**. Otherwise calls fail with "Domestic Anchored Terms not met". India SIP URI: `sip.rtc.in.residency.elevenlabs.io`. Plivo Indian numbers need KYC.
- ElevenLabs' **Ozonetel** page also requires an IN-residency account "per TRAI regulations" (SIP trunk, Ozonetel KYC).
- ElevenLabs' **Exotel** page uses a **WebSocket bridge** (no SIP, IN residency "not required"). Calls are started via **Exotel's own "Make a Call" API**, and you must host a small always-on bridge server (not free: about $5–10 a month, or Google Cloud Run's free tier).
- TRAI rolled out the **1601-series** for non-banking service/transactional calls in phases from Aug 2026, starting with utilities, courier and logistics. It does **not** yet clearly apply to us. Re-check before launch. Our calls must stay **service calls with consent**, never promotional.

To do:

- [ ] Email **ElevenLabs sales**: India residency price, minimum plan, and whether the existing workspace can move.
- [ ] Ask **Exotel**, **Plivo**, **Ozonetel** (and Tata Tele Business Services) for per-minute prices, KYC document lists and setup time.
- [ ] Pick a route (decided in Phase 3, then documented here with exact setup steps).
- [ ] Testing only: the existing ElevenLabs number **+91 91199 92192** (Twilio) is used for the first test call to the founder's phone.

### A3. Domain

- [ ] Buy a domain (~₹800 a year). Needed to send email (Resend requires a verified domain) and to look trustworthy for WhatsApp verification.

## B. Accounts (all free tiers)

- [ ] **Supabase**: create a project in **Mumbai (ap-south-1)** (the region can't be changed later). Enable `pg_cron` and `pg_net`.
- [ ] **Netlify**: create a site from the GitHub repo. First, re-read Netlify's Self-Serve Subscription Agreement to confirm the free plan allows commercial use.
- [ ] **Sentry**: free Developer plan → `SENTRY_DSN`.
- [ ] **Healthchecks.io**: one check with period 1 min, grace 3 min → `HEALTHCHECKS_PING_URL`. Alerts go to your phone and email.
- [ ] **Resend**: verify the domain (SPF/DKIM DNS records) → `RESEND_API_KEY`, `EMAIL_FROM`.
- [ ] **Google sign-in** (optional): OAuth client in Google Cloud Console → `GOOGLE_CLIENT_ID/SECRET`.

## C. Providers (each phase adds exact steps here)

- [ ] **ElevenLabs** _(Phase 3)_: API key, agent created by `npm run agent:sync`, phone number ID, post-call webhook URL + secret. Set conversation retention to match ours.
- [ ] **WhatsApp Cloud API** _(Phase 4)_: Meta Business account, business verification, phone number, the 6 utility templates submitted (texts in `docs/whatsapp-templates.md`), webhook URL + verify token, current per-message price checked.
- [ ] **Razorpay** _(Phase 5)_: KYC, Subscriptions enabled, **international cards** enabled, plans created, webhook URL + secret.

## D. Production configuration

- [ ] Generate secrets: `DATA_ENCRYPTION_KEY` (`openssl rand -base64 32`), `BETTER_AUTH_SECRET`, `CRON_SECRET`. Store a copy of the encryption key **offline**: losing it means losing encrypted data.
- [ ] Set all env vars in Netlify and Supabase (Edge Function secrets). `APP_ENV=production`, `APP_URL=https://…`
- [ ] Apply database migrations, RLS and guard SQL. Schedule the pg_cron tick.
- [ ] Set `ADMIN_EMAILS`.

## E. Safety nets

- [ ] Nightly encrypted backup job running (GitHub Actions) **and a restore tested** once.
- [ ] Healthchecks.io alert tested (pause the tick and confirm you get a message).
- [ ] Sentry receives a test error.
- [ ] RUNBOOK read once end to end.

## F. Legal and trust

- [ ] Privacy Policy, Terms, and the "Not an emergency service" notice reviewed by a lawyer (drafts in `docs/legal/`, marked DRAFT).
- [ ] Privacy policy states where data is processed (Supabase Mumbai; ElevenLabs outside India unless India residency is used).

## G. Final rehearsal

- [ ] Full flow on a real phone: sign up → onboarding → consent call → daily call → WhatsApp summary → not-reached alert → red-flag alert → billing → export → delete.
- [ ] `npm run simulate:week` and `npm run loadtest:tick` pass on the production database settings.

## Upgrade triggers (when free stops being enough)

| When                                            | Upgrade                                                       |
| ----------------------------------------------- | ------------------------------------------------------------- |
| ~10 paying families                             | Supabase Pro ($25 a month): managed daily backups, no pausing |
| Netlify credits >70% in a month                 | Netlify Pro, or move the website                              |
| More than ~45 parents want the same 9–10am hour | Higher ElevenLabs plan (more concurrent calls)                |

## Sources (research, 24 Nov 2026)

- Plivo × ElevenLabs India: https://www.plivo.com/docs/voice-agents/sip-trunking/integration-guides/elevenlabs.md
- ElevenLabs × Exotel: https://elevenlabs.io/agents/integrations/exotel
- ElevenLabs × Ozonetel: https://elevenlabs.io/agents/integrations/ozonetel
- TRAI 1601 series (Aug 2026): https://trai.gov.in/sites/default/files/2026-08/PR_No113of2026_1.pdf
- Vercel Hobby (non-commercial): https://vercel.com/docs/accounts/plans/hobby-plan
- Netlify credits: https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/
- Supabase limits: https://supabase.com/docs/guides/functions/limits · pausing: https://supabase.com/docs/guides/platform/project-pausing · regions: https://supabase.com/docs/guides/platform/regions
