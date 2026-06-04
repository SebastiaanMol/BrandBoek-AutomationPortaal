CREATE TABLE IF NOT EXISTS public.process_journey_review_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_journey_id TEXT NOT NULL,
  flow_id UUID REFERENCES public.flows(id) ON DELETE CASCADE,
  automation_id TEXT REFERENCES public.automatiseringen(id) ON DELETE SET NULL,
  from_automation_id TEXT REFERENCES public.automatiseringen(id) ON DELETE SET NULL,
  to_automation_id TEXT REFERENCES public.automatiseringen(id) ON DELETE SET NULL,
  normalized_path TEXT,
  item_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  note TEXT NOT NULL DEFAULT '',
  proposed_action TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  CONSTRAINT process_journey_review_items_type_check
    CHECK (item_type IN (
      'missing_automation',
      'wrong_edge',
      'missing_source_data',
      'duplicate_or_legacy_node',
      'endpoint_mismatch',
      'description_fix',
      'stop_point_unclear',
      'other'
    )),
  CONSTRAINT process_journey_review_items_status_check
    CHECK (status IN ('open', 'resolved'))
);

CREATE INDEX IF NOT EXISTS process_journey_review_items_concept_idx
  ON public.process_journey_review_items(concept_journey_id);

CREATE INDEX IF NOT EXISTS process_journey_review_items_flow_idx
  ON public.process_journey_review_items(flow_id);

CREATE INDEX IF NOT EXISTS process_journey_review_items_status_idx
  ON public.process_journey_review_items(status);

ALTER TABLE public.process_journey_review_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'process_journey_review_items'
      AND policyname = 'Authenticated users can read process journey review items'
  ) THEN
    CREATE POLICY "Authenticated users can read process journey review items"
      ON public.process_journey_review_items FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'process_journey_review_items'
      AND policyname = 'Authenticated users can insert process journey review items'
  ) THEN
    CREATE POLICY "Authenticated users can insert process journey review items"
      ON public.process_journey_review_items FOR INSERT TO authenticated WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'process_journey_review_items'
      AND policyname = 'Authenticated users can update process journey review items'
  ) THEN
    CREATE POLICY "Authenticated users can update process journey review items"
      ON public.process_journey_review_items FOR UPDATE TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'process_journey_review_items'
      AND policyname = 'Service role can manage process journey review items'
  ) THEN
    CREATE POLICY "Service role can manage process journey review items"
      ON public.process_journey_review_items FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
