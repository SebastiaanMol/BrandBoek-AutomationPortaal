ALTER TABLE public.source_sync_change_items
  ADD COLUMN IF NOT EXISTS review_key TEXT;

UPDATE public.source_sync_change_items
SET review_key = CASE
  WHEN change_type = 'source_data_incomplete'
    THEN COALESCE(new_value_sanitized->>'missing_evidence_key', payload_sanitized->'missingEvidence'->>'key', change_type)
  ELSE change_type
END
WHERE review_key IS NULL;

ALTER TABLE public.source_sync_change_items
  ALTER COLUMN review_key SET DEFAULT 'general';

CREATE INDEX IF NOT EXISTS source_sync_change_items_review_key_idx
  ON public.source_sync_change_items(source, external_id, change_type, review_key, status);

ALTER TABLE public.source_sync_change_items
  DROP CONSTRAINT IF EXISTS source_sync_change_items_status_check;

ALTER TABLE public.source_sync_change_items
  ADD CONSTRAINT source_sync_change_items_status_check
    CHECK (status IN ('pending', 'applied', 'skipped', 'failed', 'superseded'));
