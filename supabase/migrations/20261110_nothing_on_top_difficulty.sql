-- Keep this puzzle in test status with no publication date.
UPDATE public.puzzle_catalog
SET difficulty = 3
WHERE season_id = '2026-2' AND puzzle_id = '261110_01'
  AND status = 'test' AND published_at IS NULL;
