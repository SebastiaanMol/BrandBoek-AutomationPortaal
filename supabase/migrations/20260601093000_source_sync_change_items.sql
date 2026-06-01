CREATE TABLE IF NOT EXISTS public.source_sync_change_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_run_id UUID NOT NULL REFERENCES public.source_sync_runs(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  external_id TEXT,
  automation_id TEXT REFERENCES public.automatiseringen(id) ON DELETE SET NULL,
  change_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  impact TEXT NOT NULL DEFAULT '',
  old_value_sanitized JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_value_sanitized JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload_sanitized JSONB NOT NULL DEFAULT '{}'::jsonb,
  selected_by_default BOOLEAN NOT NULL DEFAULT true,
  applied_at TIMESTAMPTZ,
  skipped_at TIMESTAMPTZ,
  error_message_sanitized TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT source_sync_change_items_type_check
    CHECK (change_type IN ('new_automation', 'metadata_changed', 'route_changed', 'source_data_incomplete', 'source_missing')),
  CONSTRAINT source_sync_change_items_status_check
    CHECK (status IN ('pending', 'applied', 'skipped', 'failed'))
);

CREATE INDEX IF NOT EXISTS source_sync_change_items_run_idx
  ON public.source_sync_change_items(sync_run_id, status);

CREATE INDEX IF NOT EXISTS source_sync_change_items_source_idx
  ON public.source_sync_change_items(source, external_id);

ALTER TABLE public.source_sync_change_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read source sync change items"
  ON public.source_sync_change_items FOR SELECT TO authenticated USING (true);
