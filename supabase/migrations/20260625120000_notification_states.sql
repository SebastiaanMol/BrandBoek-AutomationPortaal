CREATE TABLE IF NOT EXISTS public.notification_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_key TEXT NOT NULL,
  seen_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notification_states_user_key_unique UNIQUE (user_id, notification_key)
);

CREATE INDEX IF NOT EXISTS notification_states_user_updated_idx
  ON public.notification_states(user_id, updated_at DESC);

ALTER TABLE public.notification_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own notification states"
  ON public.notification_states FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own notification states"
  ON public.notification_states FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notification states"
  ON public.notification_states FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
