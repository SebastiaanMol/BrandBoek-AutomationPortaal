ALTER TABLE process_state
  ADD COLUMN IF NOT EXISTS flow_links JSONB;
