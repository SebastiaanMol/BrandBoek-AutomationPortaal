-- Process canvas state: steps, connections, and automation links
CREATE TABLE IF NOT EXISTS process_state (
  id          TEXT PRIMARY KEY DEFAULT 'main',
  steps       JSONB NOT NULL DEFAULT '[]',
  connections JSONB NOT NULL DEFAULT '[]',
  auto_links  JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE process_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow all on process_state"
  ON process_state FOR ALL
  USING (true)
  WITH CHECK (true);
