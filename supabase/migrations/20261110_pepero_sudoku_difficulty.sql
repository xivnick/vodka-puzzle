-- Set the first playtest's target difficulty without enabling publication.
UPDATE public.puzzle_catalog SET difficulty=2
WHERE season_id='2026-2' AND puzzle_id='261111_01'
  AND status='test' AND published_at IS NULL;
