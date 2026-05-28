ALTER TABLE public.automation_source_findings
  DROP CONSTRAINT IF EXISTS automation_source_findings_type_check;

ALTER TABLE public.automation_source_findings
  ADD CONSTRAINT automation_source_findings_type_check
  CHECK (type IN (
    'source_missing',
    'source_data_incomplete',
    'source_changed',
    'webhook_changed',
    'metadata_changed'
  ));
