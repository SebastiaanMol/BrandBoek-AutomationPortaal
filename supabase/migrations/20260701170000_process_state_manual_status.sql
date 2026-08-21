ALTER TABLE public.process_state
  ADD COLUMN IF NOT EXISTS manual_status TEXT NOT NULL DEFAULT 'niet_ingericht';

ALTER TABLE public.process_state
  DROP CONSTRAINT IF EXISTS process_state_manual_status_check;

ALTER TABLE public.process_state
  ADD CONSTRAINT process_state_manual_status_check
    CHECK (manual_status IN (
      'niet_ingericht',
      'procesflow_gereed',
      'in_review',
      'in_orde'
    ));

CREATE INDEX IF NOT EXISTS process_state_manual_status_idx
  ON public.process_state(manual_status);
