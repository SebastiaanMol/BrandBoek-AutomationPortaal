-- supabase/migrations/20260416130000_enrichment_columns.sql

ALTER TABLE automatiseringen
  ADD COLUMN IF NOT EXISTS ai_enrichment      JSONB,
  ADD COLUMN IF NOT EXISTS reviewer_overrides JSONB,
  ADD COLUMN IF NOT EXISTS rejected_at        TIMESTAMPTZ;

ALTER TABLE automatiseringen
  ADD COLUMN IF NOT EXISTS approved_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by  TEXT;

ALTER TABLE automation_links
  ADD COLUMN IF NOT EXISTS sync_run_id TEXT;

-- Cron job: ruim rejected automations op na 30 dagen (vereist pg_cron extensie)
-- Als pg_cron niet beschikbaar is op dit plan, sla dit blok over
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'cleanup-rejected-automations',
      '0 2 * * *',
      $cron$DELETE FROM automatiseringen
        WHERE import_status = 'rejected'
        AND rejected_at < now() - interval '30 days'$cron$
    );
  END IF;
END
$$;
