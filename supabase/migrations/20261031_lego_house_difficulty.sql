-- User-provided difficulty; keep the new puzzle in test status.
UPDATE public.puzzle_catalog SET difficulty='하'
WHERE season_id='2026-2' AND puzzle_id='261031_01' AND status='test' AND difficulty IS NULL;
