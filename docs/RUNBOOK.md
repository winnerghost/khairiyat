# Runbook: what to do when something goes wrong

Written for a stressful moment: short steps, simplest fix first. Parts marked _(Phase N)_ get filled in as those features are built.

**Golden rule:** if in doubt, **tell the affected families honestly** (WhatsApp) before fixing quietly. Families trust us with their parents.

## 0. Where to look

| Question                  | Where                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| Is the website up?        | `https://<your-domain>/api/health`                                                         |
| Is the scheduler ticking? | Admin → Health (last tick time) _(Phase 6)_. Healthchecks.io dashboard                     |
| What failed?              | Admin → Failures (jobs, webhooks, notifications), each with a **Retry** button _(Phase 6)_ |
| Error details             | Sentry                                                                                     |
| Raw logs                  | Supabase → Edge Functions → Logs (engine). Netlify → Functions → Logs (website)            |

## 1. Calls are not happening

1. Check the **last tick time** (Admin → Health). If it's older than 3 minutes:
   - Supabase dashboard: is the project **paused** (free plan)? Click **Restore**, then upgrade to Pro if it happens again.
   - SQL editor: `select * from cron.job;` (is the tick job listed and active?) and `select * from cron.job_run_details order by start_time desc limit 20;` (errors?)
   - Edge Function logs for `tick`: look for config errors (missing env var) or crashes.
2. If ticks run but nothing is dialled: Admin → Today shows why per parent (no consent, paused, billing, outside 08:00–20:00, concurrency full).
3. If dials fail: check ElevenLabs status and the account balance/plan. The provider error is on the call attempt.
4. **Emergency stop** (e.g. the agent is misbehaving): Admin → Settings → turn off `calls_enabled` _(Phase 2)_. Calls stop at the next tick. Then message families.

## 2. Alerts or summaries are not arriving

1. Admin → Failures → Notifications. Each failed message shows the provider's error.
2. WhatsApp failures fall back to **email** automatically. Check email delivered (Resend dashboard).
3. Common WhatsApp causes: template not approved or paused, expired access token, number quality rating, recipient not on WhatsApp.
4. After fixing, press **Retry**. Messages are idempotent, so nobody gets duplicates.
5. If an **urgent alert** failed: call the family member yourself.

## 3. Webhooks failing or lost

- Calls still converge: reconciliation asks the provider about any call with no result after 10 minutes.
- Signature failures in logs usually mean a **wrong or rotated secret**. Compare with the provider dashboard.
- Admin → Failures → Webhooks: reprocess stored events _(Phase 6)_.

## 4. Provider outage

| Provider   | Effect                                      | What to do                                                                                      |
| ---------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| ElevenLabs | Calls fail and retry, then mark failed      | Admin alert fires. Message affected families: "today's call could not be made, it's our fault". |
| WhatsApp   | Email fallback takes over                   | Nothing urgent. Watch the email volume (Resend free limit 100/day).                             |
| Resend     | Email fallback unavailable                  | Ensure WhatsApp works. Auth emails (password reset) delayed.                                    |
| Razorpay   | Payments fail                               | The grace period protects calls. Never stop calls without telling the family first.             |
| Netlify    | Website down; **calls and alerts continue** | Check the credits page (free limit 300 a month). Wait for reset or upgrade.                     |
| Supabase   | Everything stops                            | status.supabase.com. Message families once it's back.                                           |

## 5. A family reports a problem with a call

1. Open the parent in Admin → transcript, summary, flags.
2. If the agent behaved wrongly: add a scenario to `agent/tests/`, fix `agent/system-prompt.md`, run `npm run agent:sync` _(Phase 3)_. Never edit the agent in the ElevenLabs dashboard.
3. Reply to the family with what happened and what changed.

## 6. Data requests

- **Export:** the family uses Settings → Privacy → Download data _(Phase 1)_.
- **Delete:** the family deletes the parent or account in the app. If asked by email, do it from Admin and record it in the audit log.

## 7. Restore from backup _(Phase 8)_

Steps for restoring the nightly encrypted dump into a fresh Supabase project are added with the backup job.
