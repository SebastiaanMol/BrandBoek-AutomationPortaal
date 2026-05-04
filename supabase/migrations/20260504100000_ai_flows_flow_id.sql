ALTER TABLE automatisering_ai_flows
  ADD COLUMN IF NOT EXISTS flow_id text REFERENCES flows(id) ON DELETE SET NULL;
