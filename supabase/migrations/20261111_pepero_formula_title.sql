-- Add the date prefix requested for the Pepero Day formula puzzle.
UPDATE public.puzzle_catalog
SET title='261111 수식완성(빼빼로데이)'
WHERE season_id='2026-2' AND puzzle_id='261111_02'
  AND title IS DISTINCT FROM '261111 수식완성(빼빼로데이)';
