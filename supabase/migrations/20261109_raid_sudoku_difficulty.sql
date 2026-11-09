-- Set the supplied difficulties while keeping all ten puzzles in test status.
UPDATE public.puzzle_catalog AS catalog
SET difficulty = raid.difficulty
FROM (VALUES
  ('261109_01',1), ('261109_02',1), ('261109_03',2),
  ('261109_04',2), ('261109_05',2), ('261109_06',2),
  ('261109_07',2), ('261109_08',3), ('261109_09',3), ('261109_10',3)
) AS raid(puzzle_id,difficulty)
WHERE catalog.season_id='2026-2' AND catalog.puzzle_id=raid.puzzle_id
  AND catalog.status='test' AND catalog.published_at IS NULL;
