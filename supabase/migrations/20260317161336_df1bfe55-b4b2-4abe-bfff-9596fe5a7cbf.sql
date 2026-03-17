ALTER TABLE public.automatiseringen DROP CONSTRAINT IF EXISTS automatiseringen_naam_unique;

CREATE UNIQUE INDEX IF NOT EXISTS automatiseringen_naam_normalized_unique_idx
ON public.automatiseringen ((lower(regexp_replace(trim(naam), '\s+', ' ', 'g'))));