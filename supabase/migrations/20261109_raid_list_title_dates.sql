-- Add the approved date prefix to Sudoku Raid titles in the puzzle catalog.
UPDATE public.puzzle_catalog
SET title = '261109 ' || title
WHERE season_id = '2026-2'
  AND puzzle_id BETWEEN '261109_01' AND '261109_10'
  AND title NOT LIKE '261109 %';
