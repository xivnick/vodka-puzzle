-- Apply after registration; keep the puzzle in test status.
UPDATE public.puzzle_catalog SET difficulty='상'
WHERE season_id='2026-2' AND puzzle_id='261030_01' AND status='test' AND difficulty IS NULL;
