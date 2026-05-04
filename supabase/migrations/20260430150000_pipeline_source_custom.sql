ALTER TABLE pipelines
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'hubspot',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE pipelines
SET source = 'hubspot'
WHERE source IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pipelines_source_check'
  ) THEN
    ALTER TABLE pipelines
      ADD CONSTRAINT pipelines_source_check CHECK (source IN ('hubspot', 'custom'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pipelines' AND policyname = 'Authenticated users can insert custom pipelines') THEN
    CREATE POLICY "Authenticated users can insert custom pipelines"
      ON pipelines FOR INSERT TO authenticated
      WITH CHECK (source = 'custom');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pipelines' AND policyname = 'Authenticated users can delete custom pipelines') THEN
    CREATE POLICY "Authenticated users can delete custom pipelines"
      ON pipelines FOR DELETE TO authenticated
      USING (source = 'custom');
  END IF;
END $$;
