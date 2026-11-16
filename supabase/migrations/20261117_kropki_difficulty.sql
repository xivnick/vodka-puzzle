-- Supplied difficulty only; leave release status and date unchanged.
UPDATE public.puzzle_catalog AS p
SET difficulty = k.difficulty
FROM (VALUES ('261117_01', 1), ('261117_02', 2), ('261117_03', 3)) AS k(puzzle_id, difficulty)
WHERE p.season_id = '2026-2' AND p.puzzle_id = k.puzzle_id
  AND p.status = 'test' AND p.difficulty = 0;
