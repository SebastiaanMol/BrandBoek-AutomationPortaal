ALTER TABLE process_state
  ADD COLUMN IF NOT EXISTS active_lanes JSONB;
