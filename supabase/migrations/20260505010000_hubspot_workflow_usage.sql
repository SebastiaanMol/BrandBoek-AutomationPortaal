ALTER TABLE automatiseringen
  ADD COLUMN IF NOT EXISTS hubspot_last_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS hubspot_run_count_365d integer;

COMMENT ON COLUMN automatiseringen.hubspot_last_run_at IS
  'Most recent HubSpot workflow performance bucket with enrollments or completions.';

COMMENT ON COLUMN automatiseringen.hubspot_run_count_365d IS
  'Total HubSpot workflow enrollments/completions seen in the last 365 days.';
