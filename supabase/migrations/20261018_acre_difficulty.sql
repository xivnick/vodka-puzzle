-- User-provided difficulty: 하 (쉬움). Keep the puzzle in test status.
BEGIN;
UPDATE public.puzzle_catalog SET difficulty='쉬움'
WHERE season_id='2026-2' AND puzzle_id='261018_01'
  AND status='test' AND difficulty IS NULL;
COMMIT;
