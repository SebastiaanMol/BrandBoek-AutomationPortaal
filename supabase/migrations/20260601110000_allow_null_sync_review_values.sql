ALTER TABLE public.source_sync_change_items
  ALTER COLUMN old_value_sanitized DROP NOT NULL,
  ALTER COLUMN new_value_sanitized DROP NOT NULL;
