-- Set the supplied difficulty without publishing the test puzzle.
UPDATE public.puzzle_catalog
SET difficulty = '하'
WHERE season_id = '2026-2' AND puzzle_id = '261015_01'
  AND status = 'test' AND difficulty IS NULL;
