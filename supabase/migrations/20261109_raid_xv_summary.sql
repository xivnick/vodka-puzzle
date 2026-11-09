-- Remove the XV spoiler from managed metadata without changing release state.
UPDATE public.puzzle_catalog
SET summary='X·V 단서의 규칙에 맞게 1~9를 채우세요'
WHERE season_id='2026-2' AND puzzle_id='261109_09';
