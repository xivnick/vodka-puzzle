BEGIN;

-- Keep only each account's latest completion before selecting the banner rows.
-- The account identity is used for grouping but is never returned to clients.
CREATE OR REPLACE FUNCTION public.recent_completions()
RETURNS TABLE(nickname text, puzzle_id text, completed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH completions AS (
  SELECT coalesce(c.user_id::text, 'nickname:' || c.nickname) AS account_key,
   c.nickname, c.puzzle_id, c.completed_at
  FROM public.semester_completions c
  JOIN public.semester_settings s ON s.id AND s.active_season=c.season_id
  WHERE NOT c.excluded
  UNION ALL
  SELECT coalesce(c.user_id::text, 'nickname:' || c.nickname) AS account_key,
   c.nickname, 'daily-sudoku:' || c.day::text, c.completed_at
  FROM public.daily_sudoku_completions c
  JOIN public.semester_settings s ON s.id AND s.active_season=c.season_id
  WHERE NOT c.excluded
 ), latest_per_account AS (
  SELECT DISTINCT ON (account_key) nickname,puzzle_id,completed_at
  FROM completions
  ORDER BY account_key,completed_at DESC,puzzle_id,nickname
 )
 SELECT latest.nickname,latest.puzzle_id,latest.completed_at
 FROM latest_per_account latest
 ORDER BY latest.completed_at DESC,latest.puzzle_id,latest.nickname
 LIMIT 3;
$$;

REVOKE ALL ON FUNCTION public.recent_completions() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recent_completions() TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
