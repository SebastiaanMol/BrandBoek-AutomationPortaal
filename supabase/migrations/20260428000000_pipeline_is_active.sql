-- Add is_active flag to pipelines; defaults to true so existing pipelines stay visible
ALTER TABLE pipelines
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
