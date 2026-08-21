ALTER TABLE public.automatiseringen
  ADD COLUMN IF NOT EXISTS api_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.automatiseringen
    WHERE source IS NOT NULL AND external_id IS NOT NULL
    GROUP BY source, external_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate automatiseringen source/external_id pairs must be resolved before enabling portal API upserts';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS automatiseringen_source_external_unique_idx
  ON public.automatiseringen(source, external_id)
  WHERE source IS NOT NULL AND external_id IS NOT NULL;

ALTER TABLE public.process_state
  ADD COLUMN IF NOT EXISTS api_version integer NOT NULL DEFAULT 1;

ALTER TABLE public.flows
  ADD COLUMN IF NOT EXISTS api_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS api_chain JSONB NOT NULL DEFAULT '[]';

ALTER TABLE public.source_sync_change_items
  ADD COLUMN IF NOT EXISTS api_version integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.automation_placements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id TEXT NOT NULL REFERENCES public.automatiseringen(id) ON DELETE CASCADE,
  pipeline_id TEXT NOT NULL,
  target JSONB NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  placed_by text NOT NULL DEFAULT 'api',
  api_version integer NOT NULL DEFAULT 1,
  CONSTRAINT automation_placements_target_object_check CHECK (jsonb_typeof(target) = 'object'),
  CONSTRAINT automation_placements_target_type_check CHECK (target->>'type' IN ('step', 'arrow', 'syncBlock')),
  CONSTRAINT automation_placements_step_target_check CHECK (target->>'type' != 'step' OR target ? 'stepId'),
  CONSTRAINT automation_placements_arrow_target_check CHECK (target->>'type' != 'arrow' OR target ? 'arrowId')
);

CREATE INDEX IF NOT EXISTS automation_placements_automation_idx
  ON public.automation_placements(automation_id);

CREATE INDEX IF NOT EXISTS automation_placements_pipeline_idx
  ON public.automation_placements(pipeline_id);

CREATE UNIQUE INDEX IF NOT EXISTS automation_placements_unique_target_idx
  ON public.automation_placements(
    automation_id,
    pipeline_id,
    (target->>'type'),
    (COALESCE(target->>'stepId', '__portal_api_null__')),
    (COALESCE(target->>'arrowId', '__portal_api_null__'))
  );

CREATE TABLE IF NOT EXISTS public.portal_api_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource text NOT NULL,
  resource_id text NOT NULL,
  action text NOT NULL,
  actor text NOT NULL DEFAULT 'api',
  diff JSONB NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_api_audit_log_resource_idx
  ON public.portal_api_audit_log(resource, resource_id, created_at DESC);

ALTER TABLE public.automation_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_api_audit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'automation_placements'
      AND policyname = 'Service role can manage automation placements'
  ) THEN
    CREATE POLICY "Service role can manage automation placements"
      ON public.automation_placements FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'portal_api_audit_log'
      AND policyname = 'Service role can manage portal api audit log'
  ) THEN
    CREATE POLICY "Service role can manage portal api audit log"
      ON public.portal_api_audit_log FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;
