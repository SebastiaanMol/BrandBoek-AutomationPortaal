-- supabase/migrations/20260416120000_automation_links.sql

-- New columns on automatiseringen
ALTER TABLE automatiseringen
  ADD COLUMN IF NOT EXISTS endpoints     TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS webhook_paths TEXT[] NOT NULL DEFAULT '{}';

-- Join table for matched links
CREATE TABLE IF NOT EXISTS automation_links (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   text        NOT NULL REFERENCES automatiseringen(id) ON DELETE CASCADE,
  target_id   text        NOT NULL REFERENCES automatiseringen(id) ON DELETE CASCADE,
  match_type  text        NOT NULL CHECK (match_type IN ('exact', 'manual')),
  confirmed   boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, target_id)
);

-- RLS: same policy as automatiseringen (authenticated users only)
ALTER TABLE automation_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can read automation_links"
  ON automation_links FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "authenticated users can insert automation_links"
  ON automation_links FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated users can update automation_links"
  ON automation_links FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "authenticated users can delete automation_links"
  ON automation_links FOR DELETE
  TO authenticated USING (true);

-- Service role also needs full access (used by edge functions)
CREATE POLICY "service role can manage automation_links"
  ON automation_links FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_automation_links_source_id ON automation_links(source_id);
CREATE INDEX idx_automation_links_target_id ON automation_links(target_id);
