-- supabase/migrations/20260415130000_backfill_source_tags.sql
-- Backfill: voeg source tag toe als eerste item aan bestaande imports
-- Idempotent: records die de tag al hebben worden niet aangeraakt

UPDATE automatiseringen
SET systemen = ARRAY['HubSpot'] || systemen
WHERE source = 'hubspot'
  AND NOT ('HubSpot' = ANY(systemen));

UPDATE automatiseringen
SET systemen = ARRAY['Zapier'] || systemen
WHERE source = 'zapier'
  AND NOT ('Zapier' = ANY(systemen));

UPDATE automatiseringen
SET systemen = ARRAY['GitLab'] || systemen
WHERE source = 'gitlab'
  AND NOT ('GitLab' = ANY(systemen));
