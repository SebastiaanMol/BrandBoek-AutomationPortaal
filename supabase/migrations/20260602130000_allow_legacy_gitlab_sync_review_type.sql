ALTER TABLE public.source_sync_change_items
  DROP CONSTRAINT IF EXISTS source_sync_change_items_type_check;

ALTER TABLE public.source_sync_change_items
  ADD CONSTRAINT source_sync_change_items_type_check
    CHECK (change_type IN (
      'new_automation',
      'metadata_changed',
      'route_changed',
      'source_data_incomplete',
      'source_missing',
      'legacy_gitlab_record'
    ));
