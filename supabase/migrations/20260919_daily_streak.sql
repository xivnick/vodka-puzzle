BEGIN;
-- Completed days count; a one-day gap preserves the run but never adds a day.
-- Kept private so callers cannot request another account or supply a fake clock.
CREATE OR REPLACE FUNCTION private.calculate_daily_streak(completed_days date[], current_day date)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE completed_day date; latest date; previous_day date; total integer:=0;
BEGIN
 FOR completed_day IN
  SELECT DISTINCT d FROM unnest(completed_days) AS dates(d)
  WHERE d>=date '2026-09-19' AND d<=current_day ORDER BY d DESC
 LOOP
  IF latest IS NULL THEN
   latest:=completed_day;
   IF current_day-latest>2 THEN EXIT; END IF;
  ELSIF previous_day-completed_day>2 THEN EXIT;
  END IF;
  total:=total+1;
  previous_day:=completed_day;
 END LOOP;
 RETURN jsonb_build_object('count',total,'status',CASE
  WHEN total=0 THEN 'none'
  WHEN latest=current_day THEN 'completed'
  WHEN latest=current_day-1 THEN 'pending'
  ELSE 'rest' END);
END $$;
REVOKE ALL ON FUNCTION private.calculate_daily_streak(date[],date) FROM PUBLIC,anon,authenticated;

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
  'rankings',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'rank',c.rank,'nickname',c.nickname,'completed_at',c.completed_at,'is_me',c.user_id=auth.uid()) ORDER BY c.rank)
   FROM public.daily_sudoku_completions c WHERE c.day=p.day AND NOT c.excluded),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.daily_sudoku_context(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.daily_sudoku_context(date) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
