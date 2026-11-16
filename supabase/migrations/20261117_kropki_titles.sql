-- Remove difficulty labels from the titles; preserve difficulty and publication.
UPDATE public.puzzle_catalog AS p
SET title = k.title
FROM (VALUES
  ('261117_01', '261117 크롶키 1'),
  ('261117_02', '261117 크롶키 2'),
  ('261117_03', '261117 크롶키 3')
) AS k(puzzle_id, title)
WHERE p.season_id='2026-2' AND p.puzzle_id=k.puzzle_id
  AND p.title IS DISTINCT FROM k.title;
