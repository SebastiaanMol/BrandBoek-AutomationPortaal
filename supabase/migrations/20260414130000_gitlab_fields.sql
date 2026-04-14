-- Add GitLab sync fields and AI description fields to automatiseringen
alter table automatiseringen
  add column if not exists gitlab_file_path text,
  add column if not exists gitlab_last_commit text,
  add column if not exists ai_description text,
  add column if not exists ai_description_updated_at timestamptz;
