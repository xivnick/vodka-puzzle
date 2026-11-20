UPDATE public.puzzle_catalog
SET difficulty = CASE puzzle_id WHEN '261120_01' THEN 1 ELSE 2 END
WHERE season_id = '2026-2' AND puzzle_id IN ('261120_01', '261120_02')
  AND status = 'test' AND difficulty = 0;
