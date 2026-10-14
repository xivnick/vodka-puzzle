-- Set the supplied difficulty after the new page is registered as a test puzzle.
-- Keep its test status and publication date unchanged.
UPDATE public.puzzle_catalog
SET difficulty = '하'
WHERE season_id = '2026-2' AND puzzle_id = '261014_01'
  AND status = 'test' AND difficulty IS NULL;
