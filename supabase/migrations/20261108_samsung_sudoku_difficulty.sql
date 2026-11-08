-- Apply the user-requested easy difficulty; preserve release status and schedule.
UPDATE public.puzzle_catalog SET difficulty=1
WHERE season_id='2026-2' AND puzzle_id='261108_02';
