-- Add parked_steps column to process_state (no migration needed for existing rows — DEFAULT handles them)
ALTER TABLE process_state
  ADD COLUMN IF NOT EXISTS parked_steps JSONB NOT NULL DEFAULT '[]';
