BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';

-- Let Postgres plan publication filtering as a join rather than a function per row.
CREATE OR REPLACE FUNCTION public.recent_completions()
RETURNS TABLE(nickname text, puzzle_id text, completed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH completions AS (
  SELECT coalesce(c.user_id::text, 'nickname:' || c.nickname) AS account_key,
   c.nickname, c.puzzle_id, c.completed_at
  FROM public.semester_completions c
  JOIN public.semester_settings s ON s.id AND s.active_season=c.season_id
  WHERE NOT c.excluded AND EXISTS(SELECT 1 FROM public.puzzle_catalog p WHERE p.season_id=c.season_id AND p.puzzle_id=c.puzzle_id AND p.status='published' AND p.published_at<=now())
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

-- Polling does not need givens, saved boards or every player's streak ranking.
-- Existing full context remains compatible with open tabs and time-machine loading.
CREATE OR REPLACE FUNCTION public.daily_sudoku_summary(requested_day date DEFAULT NULL, include_streak_rankings boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_day date:=(statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date;
 target date:=coalesce(requested_day,current_day); owner_id uuid:=auth.uid();
 opens timestamptz; streak jsonb; ticket_opened boolean; result jsonb;
BEGIN
 -- Publish at midnight when needed; ordinary polling stays read-only.
 IF target=current_day AND NOT EXISTS(SELECT 1 FROM public.daily_sudoku WHERE day=target) THEN
  PERFORM public.publish_daily_sudoku();
 END IF;
 SELECT opens_at INTO opens FROM public.daily_sudoku WHERE day=target AND opens_at<=statement_timestamp();
 SELECT private.calculate_daily_streak(array_agg(c.day),current_day) INTO streak
 FROM public.daily_sudoku_completions c WHERE c.user_id=owner_id AND NOT c.excluded
  AND c.day>=date '2026-09-19' AND c.day<=current_day;
 ticket_opened:=EXISTS(SELECT 1 FROM private.time_machine_openings o WHERE o.user_id=owner_id AND o.day=target);
 result:=jsonb_build_object(
  'day',target,'current_day',current_day,'server_now',clock_timestamp(),
  'next_opens_at',(current_day+1+time '00:00') AT TIME ZONE 'Asia/Seoul',
  'available',opens IS NOT NULL,'streak',streak,'ticket_opened',ticket_opened,
  'can_submit',opens IS NOT NULL AND (clock_timestamp()<opens+interval '24 hours' OR ticket_opened),
  'my_completed',EXISTS(SELECT 1 FROM public.daily_sudoku_completions c WHERE c.user_id=owner_id AND c.day=target AND NOT c.excluded),
  'rankings',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'rank',c.rank,'nickname',c.nickname,'completed_at',c.completed_at,'is_me',c.user_id=owner_id) ORDER BY c.rank)
   FROM public.daily_sudoku_completions c WHERE c.day=target AND opens IS NOT NULL AND NOT c.excluded),'[]'::jsonb));
 IF include_streak_rankings THEN
  result:=result||jsonb_build_object('streak_rankings',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.rank)
   FROM private.daily_streak_rankings_at(current_day) r),'[]'::jsonb));
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.daily_sudoku_summary(date,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.daily_sudoku_summary(date,boolean) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
