ALTER TABLE public.automatiseringen
  ADD COLUMN IF NOT EXISTS cleanup_delete_candidate BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS cleanup_delete_candidate_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS automatiseringen_cleanup_delete_candidate_idx
  ON public.automatiseringen(source, cleanup_delete_candidate)
  WHERE cleanup_delete_candidate = true;
