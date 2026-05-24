-- Portal-owned automations: external syncs may signal and propose, but not
-- silently mutate automations that already exist in the portal.

CREATE TABLE IF NOT EXISTS public.source_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'started',
  error_message_sanitized TEXT,
  items_seen INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT source_sync_runs_status_check
    CHECK (status IN ('started', 'success', 'failed', 'auth_failed', 'rate_limited'))
);

CREATE TABLE IF NOT EXISTS public.automation_source_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id TEXT NOT NULL REFERENCES public.automatiseringen(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  external_id TEXT,
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  message TEXT NOT NULL,
  details_sanitized JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_reason TEXT,
  sync_run_id UUID REFERENCES public.source_sync_runs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT automation_source_findings_type_check
    CHECK (type IN ('source_missing', 'source_changed', 'webhook_changed', 'metadata_changed')),
  CONSTRAINT automation_source_findings_severity_check
    CHECK (severity IN ('info', 'warning', 'critical'))
);

CREATE UNIQUE INDEX IF NOT EXISTS automation_source_findings_dedupe_key_idx
  ON public.automation_source_findings(dedupe_key);

CREATE INDEX IF NOT EXISTS automation_source_findings_active_idx
  ON public.automation_source_findings(automation_id, type)
  WHERE resolved_at IS NULL;

CREATE TABLE IF NOT EXISTS public.automation_import_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  proposed_name TEXT NOT NULL,
  proposed_description TEXT NOT NULL DEFAULT '',
  proposed_category TEXT NOT NULL DEFAULT 'Anders',
  proposed_systems TEXT[] NOT NULL DEFAULT '{}',
  proposed_endpoints_sanitized TEXT[] NOT NULL DEFAULT '{}',
  details_sanitized JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  CONSTRAINT automation_import_proposals_status_check
    CHECK (status IN ('pending', 'confirmed', 'rejected', 'expired'))
);

CREATE UNIQUE INDEX IF NOT EXISTS automation_import_proposals_pending_source_external_idx
  ON public.automation_import_proposals(source, external_id)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  field_name TEXT,
  old_value_sanitized JSONB,
  new_value_sanitized JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.source_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_source_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_import_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read source sync runs"
  ON public.source_sync_runs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read automation source findings"
  ON public.automation_source_findings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read import proposals"
  ON public.automation_import_proposals FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can update import proposals"
  ON public.automation_import_proposals FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read audit events"
  ON public.audit_events FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert audit events"
  ON public.audit_events FOR INSERT TO authenticated WITH CHECK (true);
