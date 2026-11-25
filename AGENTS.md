<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Khairiyat: rules for anyone (human or AI) changing this code

Families trust us with their parents' wellbeing. Reliability, privacy and honesty beat speed.

## Never break these

- **No double calls:** `UNIQUE (parent_id, local_date, slot)` on `check_ins`. Every job and webhook handler must be idempotent.
- **No calls outside 08:00–20:00 parent-local time**, whatever the settings say. Enforced in code AND by a DB trigger.
- **No silently dropped alerts:** every notification goes through the `notifications` outbox (retries, backoff, email fallback, visible failures).
- **Never keep calling someone who said stop.** Opt-out pauses at once and notifies the family.
- **Never stop calls for billing without telling the family first.**
- **Never commit secrets.** Read keys from env only (`src/lib/env.ts`). Never log phone numbers, emails, transcripts or health notes (`src/lib/logger.ts` redacts them).
- **Never invent API fields.** Read the provider's current official docs before coding an integration and put the doc URL in a comment.
- **Never over-promise in copy:** not a medical service, not an emergency service, and everything is self-reported.

## Conventions

- TypeScript strict. Validate every external input with zod.
- `src/engine/` must stay runtime-agnostic (Node + Deno): no `node:` imports, no Next.js imports; use Web Crypto and `fetch`. Take time from the injected clock, never `new Date()` directly.
- Brand name, colours and assistant names live only in `src/config/brand.ts`.
- Every external service has an interface in `src/providers/<name>/types.ts` with a mock (demo) and a real implementation.
- Keep README.md, .env.example, docs/ARCHITECTURE.md, docs/GO_LIVE.md and docs/RUNBOOK.md up to date in the same change.
- Database changes: edit `src/db/schema/*.ts`, run `npm run db:generate`, and add `ALTER TABLE … ENABLE ROW LEVEL SECURITY` for new tables in the migration (a test checks every table has RLS). `db:generate` also copies new migrations to `netlify/database/migrations/` (the public demo's Netlify Database). Never edit a migration once it is committed: write a new one.
- The demo database lives in `~/.khairiyat/demo-data` (outside the project, so the dev server doesn't reload on writes).
- Any change in `agent/` must be followed by `npm run agent:sync`; never edit the agent in the ElevenLabs dashboard.
- Before committing: `npm run format`, then `npm run check` (lint, typecheck, format, tests). Before pushing UI changes: `npm run e2e`. Engine changes: also `npm run simulate:week`.
