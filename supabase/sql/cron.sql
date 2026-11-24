-- Khairiyat scheduler: Supabase pg_cron calls the protected tick endpoint
-- every minute. Run this ONCE in the Supabase SQL editor after the website
-- is deployed (replace YOUR-DOMAIN). Pattern from
-- https://supabase.com/docs/guides/functions/schedule-functions
--
-- 1) Keep the secret out of the SQL text: store CRON_SECRET in Vault.
--    select vault.create_secret('PASTE-YOUR-CRON_SECRET', 'khairiyat_cron_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'khairiyat-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-DOMAIN/api/cron/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'khairiyat_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- Check it runs:   select * from cron.job_run_details order by start_time desc limit 10;
-- Stop it:         select cron.unschedule('khairiyat-tick');
