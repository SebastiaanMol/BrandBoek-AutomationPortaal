CREATE TABLE IF NOT EXISTS flows (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  naam           TEXT NOT NULL,
  beschrijving   TEXT,
  systemen       TEXT[]   DEFAULT '{}',
  automation_ids TEXT[]   DEFAULT '{}',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read flows"
  ON flows FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert flows"
  ON flows FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update flows"
  ON flows FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete flows"
  ON flows FOR DELETE TO authenticated USING (true);

CREATE POLICY "Service role has full access to flows"
  ON flows FOR ALL TO service_role USING (true);
