-- Brandy feedback table: stores user feedback on Brandy answers
CREATE TABLE IF NOT EXISTS brandy_feedback (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vraag      TEXT NOT NULL,
  antwoord   TEXT NOT NULL,
  label      TEXT NOT NULL CHECK (label IN ('correct', 'incorrect', 'onvolledig')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE brandy_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow all on brandy_feedback"
  ON brandy_feedback FOR ALL
  USING (true)
  WITH CHECK (true);
