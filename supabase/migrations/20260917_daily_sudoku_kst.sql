BEGIN;
UPDATE private.daily_sudoku SET opens_at=(day+time '00:00') AT TIME ZONE 'Asia/Seoul';
CREATE OR REPLACE FUNCTION public.daily_sudoku_context(requested_day date DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_day date := (clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date; target date; p private.daily_sudoku; result jsonb;
BEGIN
 target:=coalesce(requested_day,current_day);
 SELECT * INTO p FROM private.daily_sudoku WHERE day=target AND opens_at<=clock_timestamp();
 SELECT jsonb_build_object('day',target,'current_day',current_day,'server_now',clock_timestamp(),'next_opens_at',(current_day+1+time '00:00') AT TIME ZONE 'Asia/Seoul','available',p.day IS NOT NULL,'givens',p.givens,'rankings',coalesce((SELECT jsonb_agg(jsonb_build_object('rank',c.rank,'nickname',c.nickname,'completed_at',c.completed_at,'is_me',c.user_id=auth.uid()) ORDER BY c.rank) FROM private.daily_sudoku_completions c WHERE c.day=p.day),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
