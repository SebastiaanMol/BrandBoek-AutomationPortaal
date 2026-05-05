ALTER TABLE automatisering_ai_flows
  ADD COLUMN IF NOT EXISTS flow_id uuid REFERENCES flows(id) ON DELETE SET NULL;
