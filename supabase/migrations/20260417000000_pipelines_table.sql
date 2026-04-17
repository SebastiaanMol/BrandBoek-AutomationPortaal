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
