BEGIN;

ALTER TABLE public.puzzle_push_subscriptions
  ADD COLUMN daily_sudoku boolean NOT NULL DEFAULT true,
  ADD COLUMN new_puzzle boolean NOT NULL DEFAULT true,
  ADD COLUMN daily_reminder boolean NOT NULL DEFAULT true;

COMMIT;
