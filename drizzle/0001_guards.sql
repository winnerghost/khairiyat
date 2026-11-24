-- Database guard rails. These protect parents even if application code has a bug.
--
-- 1. No dial outside 08:00–20:00 in the parent's own time zone.
-- 2. No dial to a parent who opted out or refused consent.
--
-- The time checked is NEW.dialed_at, which the engine sets from its clock
-- (real time in production, virtual time in the week simulation).
CREATE OR REPLACE FUNCTION khairiyat_guard_call_attempt() RETURNS trigger AS $$
DECLARE
  p_timezone text;
  p_status text;
  local_t time;
BEGIN
  SELECT timezone, status::text INTO p_timezone, p_status FROM parents WHERE id = NEW.parent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'guard: parent % not found', NEW.parent_id;
  END IF;
  IF p_status IN ('opted_out', 'consent_refused') THEN
    RAISE EXCEPTION 'guard: parent % has opted out; calls are not allowed', NEW.parent_id;
  END IF;
  local_t := (NEW.dialed_at AT TIME ZONE p_timezone)::time;
  IF local_t < time '08:00' OR local_t >= time '20:00' THEN
    RAISE EXCEPTION 'guard: dial at % local time is outside 08:00-20:00', local_t;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS call_attempts_guard ON call_attempts;
--> statement-breakpoint
CREATE TRIGGER call_attempts_guard
  BEFORE INSERT ON call_attempts
  FOR EACH ROW EXECUTE FUNCTION khairiyat_guard_call_attempt();
--> statement-breakpoint
-- Defence in depth for Supabase: no table is readable through the public
-- API with the anon key. All access goes through our server code.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;
