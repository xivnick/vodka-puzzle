BEGIN;

CREATE TABLE public.puzzle_push_subscriptions (
  endpoint text PRIMARY KEY,
  id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX puzzle_push_subscriptions_account_id_idx ON public.puzzle_push_subscriptions (account_id);

ALTER TABLE public.puzzle_push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.puzzle_push_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.puzzle_push_subscriptions TO service_role;

COMMIT;
