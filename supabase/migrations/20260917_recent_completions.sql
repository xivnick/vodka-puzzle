BEGIN;
-- Expose only the public completion fields, never puzzle answers or account IDs.
CREATE OR REPLACE FUNCTION public.recent_completions()
RETURNS TABLE(nickname text, puzzle_id text, completed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT latest.nickname, latest.puzzle_id, latest.completed_at
 FROM (
  SELECT c.nickname, c.puzzle_id, c.completed_at
  FROM public.semester_completions c
  JOIN public.semester_settings s ON s.id AND s.active_season=c.season_id
  UNION ALL
  SELECT c.nickname, 'daily-sudoku:' || c.day::text, c.completed_at
  FROM private.daily_sudoku_completions c
  JOIN public.semester_settings s ON s.id AND s.active_season=c.season_id
  JOIN private.daily_sudoku p ON p.day=c.day
  WHERE p.opens_at<=now()
 ) latest
 ORDER BY latest.completed_at DESC, latest.puzzle_id, latest.nickname
 LIMIT 3;
$$;
REVOKE ALL ON FUNCTION public.recent_completions() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recent_completions() TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
