ALTER TABLE automation_links
  DROP CONSTRAINT IF EXISTS automation_links_match_type_check;

ALTER TABLE automation_links
  ADD CONSTRAINT automation_links_match_type_check
  CHECK (match_type IN ('exact', 'manual', 'webhook'));
