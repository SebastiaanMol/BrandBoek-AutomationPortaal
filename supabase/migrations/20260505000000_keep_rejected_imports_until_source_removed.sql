-- Rejected imports should remain reviewable until the source sync confirms
-- that the source record was deleted.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('cleanup-rejected-automations');
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END
$$;
