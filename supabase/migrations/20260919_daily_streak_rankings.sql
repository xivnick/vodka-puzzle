BEGIN;
CREATE INDEX IF NOT EXISTS daily_sudoku_completions_streak_idx
 ON public.daily_sudoku_completions(user_id,day DESC) WHERE NOT excluded;

-- Only context exposes these rows. Account IDs and achievement times stay private.
CREATE OR REPLACE FUNCTION private.daily_streak_rankings_at(current_day date)
RETURNS TABLE(rank bigint,nickname text,count integer,status text,is_me boolean)
LANGUAGE sql STABLE SET search_path='' AS $$
 WITH history AS (
  SELECT c.user_id,array_agg(c.day) AS days,
   (array_agg(c.completed_at ORDER BY c.day DESC))[1] AS achieved_at,
   (array_agg(c.nickname ORDER BY c.day DESC))[1] AS last_nickname
  FROM public.daily_sudoku_completions c
  WHERE NOT c.excluded AND c.day>=date '2026-09-19' AND c.day<=current_day
  GROUP BY c.user_id HAVING max(c.day)>=current_day-2
 ), active AS (
  SELECT h.user_id,h.achieved_at,coalesce(n.nickname,h.last_nickname) AS nickname,
   (s.streak->>'count')::integer AS count,s.streak->>'status' AS status
  FROM history h
  CROSS JOIN LATERAL (SELECT private.calculate_daily_streak(h.days,current_day) AS streak) s
  LEFT JOIN public.semester_settings settings ON settings.id
  LEFT JOIN public.semester_nicknames n ON n.user_id=h.user_id AND n.season_id=settings.active_season
  WHERE (s.streak->>'count')::integer>0
 )
 SELECT row_number() OVER (ORDER BY a.count DESC,
   CASE a.status WHEN 'completed' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
   a.achieved_at,a.user_id),
  a.nickname,a.count,a.status,coalesce(a.user_id=auth.uid(),false)
 FROM active a
 ORDER BY a.count DESC,
  CASE a.status WHEN 'completed' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
  a.achieved_at,a.user_id;
$$;
REVOKE ALL ON FUNCTION private.daily_streak_rankings_at(date) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.daily_sudoku_context(requested_day date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_day date := (clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date;
 target date; p public.daily_sudoku; streak jsonb;
BEGIN
 PERFORM public.publish_daily_sudoku();
 target:=coalesce(requested_day,current_day);
 SELECT * INTO p FROM public.daily_sudoku WHERE day=target AND opens_at<=clock_timestamp();
 SELECT private.calculate_daily_streak(array_agg(c.day),current_day) INTO streak
 FROM public.daily_sudoku_completions c
 WHERE c.user_id=auth.uid() AND NOT c.excluded AND c.day>=date '2026-09-19' AND c.day<=current_day;
 RETURN jsonb_build_object(
  'day',target,'current_day',current_day,'server_now',clock_timestamp(),
  'next_opens_at',(current_day+1+time '00:00') AT TIME ZONE 'Asia/Seoul',
  'available',p.day IS NOT NULL,'givens',p.givens,'streak',streak,
  'streak_rankings',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.rank) FROM private.daily_streak_rankings_at(current_day) r),'[]'::jsonb),
  'rankings',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'rank',c.rank,'nickname',c.nickname,'completed_at',c.completed_at,'is_me',c.user_id=auth.uid()) ORDER BY c.rank)
   FROM public.daily_sudoku_completions c WHERE c.day=p.day AND NOT c.excluded),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.daily_sudoku_context(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.daily_sudoku_context(date) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
