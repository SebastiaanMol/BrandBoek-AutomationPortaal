
-- Automatiseringen table (shared between all authenticated users)
CREATE TABLE public.automatiseringen (
  id TEXT PRIMARY KEY,
  naam TEXT NOT NULL,
  categorie TEXT NOT NULL DEFAULT 'Anders',
  doel TEXT NOT NULL DEFAULT '',
  trigger_beschrijving TEXT NOT NULL DEFAULT '',
  systemen TEXT[] NOT NULL DEFAULT '{}',
  stappen TEXT[] NOT NULL DEFAULT '{}',
  afhankelijkheden TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Actief',
  verbeterideeen TEXT NOT NULL DEFAULT '',
  mermaid_diagram TEXT NOT NULL DEFAULT '',
  fasen TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Koppelingen table (directe koppelingen between automatiseringen)
CREATE TABLE public.koppelingen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bron_id TEXT NOT NULL REFERENCES public.automatiseringen(id) ON DELETE CASCADE,
  doel_id TEXT NOT NULL REFERENCES public.automatiseringen(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(bron_id, doel_id)
);

-- Enable RLS
ALTER TABLE public.automatiseringen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.koppelingen ENABLE ROW LEVEL SECURITY;

-- Policies: all authenticated users can read
CREATE POLICY "Authenticated users can read automatiseringen"
  ON public.automatiseringen FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert automatiseringen"
  ON public.automatiseringen FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update automatiseringen"
  ON public.automatiseringen FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete automatiseringen"
  ON public.automatiseringen FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read koppelingen"
  ON public.koppelingen FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert koppelingen"
  ON public.koppelingen FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update koppelingen"
  ON public.koppelingen FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete koppelingen"
  ON public.koppelingen FOR DELETE TO authenticated USING (true);

-- Sequence for auto-incrementing AUTO-### IDs
CREATE SEQUENCE public.auto_id_seq START WITH 1;

-- Function to generate next AUTO-### ID
CREATE OR REPLACE FUNCTION public.generate_auto_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'AUTO-' || LPAD((COALESCE(
    (SELECT MAX(CAST(REPLACE(id, 'AUTO-', '') AS INTEGER)) FROM public.automatiseringen WHERE id ~ '^AUTO-[0-9]+$'),
    0
  ) + 1)::TEXT, 3, '0');
$$;
