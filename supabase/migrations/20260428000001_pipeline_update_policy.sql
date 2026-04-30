-- Allow authenticated users to update pipelines (e.g. toggling is_active)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pipelines' AND policyname = 'Authenticated users can update pipelines') THEN
    CREATE POLICY "Authenticated users can update pipelines" ON pipelines FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
