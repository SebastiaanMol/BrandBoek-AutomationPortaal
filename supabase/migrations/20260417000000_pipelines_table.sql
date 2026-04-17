-- Pipelines tabel voor HubSpot deal pipelines
CREATE TABLE IF NOT EXISTS pipelines (
  pipeline_id  TEXT PRIMARY KEY,
  naam         TEXT NOT NULL,
  stages       JSONB NOT NULL DEFAULT '[]',
  synced_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pipeline + stage koppeling op automatiseringen
ALTER TABLE automatiseringen
  ADD COLUMN IF NOT EXISTS pipeline_id TEXT,
  ADD COLUMN IF NOT EXISTS stage_id    TEXT;

-- Row Level Security
ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read pipelines"
  ON pipelines FOR SELECT TO authenticated USING (true);

CREATE POLICY "service role can manage pipelines"
  ON pipelines FOR ALL TO service_role USING (true) WITH CHECK (true);
