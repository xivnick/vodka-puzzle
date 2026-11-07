-- Initial difficulty for the unpublished Polygraph; preserve release status and schedule.
UPDATE public.puzzle_catalog SET difficulty=2
WHERE season_id='2026-2' AND puzzle_id='261107_01' AND status='test' AND difficulty=0;
