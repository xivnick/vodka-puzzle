-- Initial difficulty only; keep the new puzzle in test status with no release date.
UPDATE public.puzzle_catalog SET difficulty=3
WHERE season_id='2026-2' AND puzzle_id='261108_01' AND status='test' AND difficulty=0;
