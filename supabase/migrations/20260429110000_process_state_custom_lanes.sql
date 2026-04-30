ALTER TABLE process_state
  ADD COLUMN IF NOT EXISTS custom_lanes JSONB;
