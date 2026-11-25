# Runbook: what to do when something goes wrong

Written for a stressful moment: short steps, simplest fix first.

**Golden rule:** if in doubt, **tell the affected families honestly** before fixing quietly. Families trust us with their parents.

## 0. Where to look

| Question                                                | Where                                                                   |
| ------------------------------------------------------- | ----------------------------------------------------------------------- |
| Is the site up? Is the scheduler ticking?               | `https://YOUR-DOMAIN/api/health` (503 = scheduler stale for 3+ minutes) |
| Today's calls, open alerts, capacity                    | **Admin → Today**                                                       |
| What failed (messages, webhooks, calls, reports, ticks) | **Admin → Failures**, each with Retry / Reprocess / Mark reviewed       |
| Who changed what                                        | **Admin → Audit**                                                       |
| Raw logs                                                | Hosting logs (JSON lines; phones, emails and transcripts are redacted)  |

## 1. Calls are not happening

1. **Admin → Today**: is there a red "Calls are switched OFF" banner? Turn them on in Admin → Settings.
2. "Scheduler looks stopped"? (last tick > 3 min)
   - Supabase: is the project **paused** (free plan)? Restore it.
   - SQL editor: `select * from cron.job;` and `select * from cron.job_run_details order by start_time desc limit 20;`
   - Test the endpoint: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://YOUR-DOMAIN/api/cron/tick` (should return JSON with `"ran":true`)
3. Ticks run but no calls: Admin → parent page explains (no consent, paused, trial ended, outside 8 am–8 pm, all lines busy).
4. Dials fail: check ElevenLabs status and credits. The error is shown on the call attempt (Admin → parent → Calls).
5. **Emergency stop** (the agent is misbehaving): Admin → Settings → untick **Calls are ON**. New calls stop at the next tick; alerts keep flowing. Then message families.

## 2. Alerts or summaries are not arriving

1. Admin → Failures → Messages shows each failed message and the provider's error.
2. WhatsApp failures fall back to **email** automatically (urgent ones immediately).
3. After fixing the cause, press **Retry**. Messages are idempotent, so nobody gets duplicates.
4. If an **urgent alert** failed: call the family member yourself.

## 3. Webhooks failing or lost

- Calls still converge: reconciliation asks ElevenLabs about any call with no result after 10 minutes.
- Signature errors (401) usually mean a wrong or rotated `ELEVENLABS_WEBHOOK_SECRET`.
- Admin → Failures → Webhooks → **Reprocess**.
- "Needs review" calls: open the conversation in ElevenLabs, then **Mark reviewed**.

## 4. Provider outage

| Provider     | Effect                                                              | What to do                                                 |
| ------------ | ------------------------------------------------------------------- | ---------------------------------------------------------- |
| ElevenLabs   | Dials fail → retried 15 min later → family alerted if still failing | Tell affected families honestly                            |
| WhatsApp     | Email fallback takes over                                           | Watch email volume limits                                  |
| Email        | No fallback for failed WhatsApp                                     | Make sure WhatsApp works; call families with urgent alerts |
| Payments     | Renewals fail                                                       | Grace period keeps calls going; families are told          |
| Website host | Site down                                                           | Check the host's dashboard; restore or redeploy            |
| Supabase     | Everything stops                                                    | status.supabase.com; message families when back            |

## 5. A family reports a problem with a call

1. Admin → Failures → Problem reports → open the parent → read the transcript.
2. If the agent behaved wrongly: fix `agent/system-prompt.md` (and add a scenario in `agent/tests/scenarios.ts`), then `npm run agent:sync`. Never edit the agent in the ElevenLabs dashboard.
3. Reply to the family with what happened and what changed. Then **Resolve**.

## 6. Data requests

- **Export:** Settings → Privacy → Download all data (JSON).
- **Delete:** the family deletes the parent or their account in the app.

## 7. Local demo troubleshooting

- **Page keeps reloading in dev:** stop the server, delete the `.next` folder, run `npm run demo` again (it clears the dev cache on start).
- **"Demo accounts not found":** `npm run seed`.
- **Start the demo from scratch:** Demo room → Reset all demo data, or delete `~/.khairiyat/demo-data`.
- **No pretend calls happen:** it must be 8 am–8 pm in the parent's time zone (hard rule). Change the parent's time zone in Call time settings.

## 8. The public demo website (Netlify)

**https://khairiyat-demo.netlify.app** runs with `APP_ENV=demo` on Netlify's free plan, with a Netlify Database. Every provider is the mock: nobody is ever called or messaged. See [ARCHITECTURE.md §8](ARCHITECTURE.md).

- **"Getting the demo ready" for a long time:** each page load builds about 8 seconds of the demo. The page refreshes itself; if it stopped, reload. A replay after weeks without visitors covers at most the last 14 days.
- **Start the demo from scratch:** log in with a demo account → Demo room → **Reset all demo data**. The next page loads rebuild it.
- **Site shows "Site not available":** the Netlify team ran out of its **300 free credits** for the month. This pauses **every** site on the team until the next cycle. Costs: a production deploy 15 credits; database and function time 10 credits per hour of compute; the database sleeps after 5 minutes without visitors. Check usage on the team's billing page. Deploy rarely, and prefer deploy previews (free) for testing.
- **Redeploy after a code change:** in Netlify, the site `khairiyat-demo` → Deploys. Build settings are in `netlify.toml` (`npm run build`, publish `.next`); without them Netlify publishes the folder as plain files and every page is "Page not found". Migrations in `netlify/database/migrations/` are applied on deploy; a failed migration blocks the deploy (read its log).
- **Site settings (Netlify → khairiyat-demo → Environment variables):** `APP_ENV=demo`, `APP_URL=https://khairiyat-demo.netlify.app`, `DATA_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, `CRON_SECRET` (random, secret). Never add provider keys: the app refuses to start with them in demo mode.
- **Take it offline:** Netlify → khairiyat-demo → Project configuration → Delete project (this also deletes its database).
