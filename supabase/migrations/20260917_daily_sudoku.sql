BEGIN;
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;
CREATE TABLE private.daily_sudoku (
 day date PRIMARY KEY, opens_at timestamptz NOT NULL UNIQUE,
 givens text NOT NULL CHECK(givens ~ '^[0-9]{81}$'), solution text NOT NULL CHECK(solution ~ '^[1-9]{81}$'), techniques jsonb NOT NULL
);
CREATE TABLE private.daily_sudoku_completions (
 day date NOT NULL REFERENCES private.daily_sudoku(day), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 season_id text NOT NULL, nickname text NOT NULL, rank bigint NOT NULL, completed_at timestamptz NOT NULL,
 PRIMARY KEY(day,user_id), UNIQUE(day,rank),
 FOREIGN KEY(season_id,user_id,nickname) REFERENCES public.semester_nicknames(season_id,user_id,nickname) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE TABLE public.daily_sudoku_progress (
 day date NOT NULL REFERENCES private.daily_sudoku(day), user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 state jsonb NOT NULL CHECK (octet_length(state::text)<30000), saved_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(day,user_id)
);
ALTER TABLE public.daily_sudoku_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_sudoku_progress FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.daily_sudoku_progress TO authenticated;
CREATE POLICY own_read ON public.daily_sudoku_progress FOR SELECT TO authenticated USING(user_id=auth.uid());
-- All cloud writes pass through a function so future days cannot be probed.
REVOKE INSERT,UPDATE ON public.daily_sudoku_progress FROM authenticated;
CREATE FUNCTION public.daily_sudoku_context(requested_day date DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_day date := (clock_timestamp() AT TIME ZONE 'Asia/Seoul' - interval '12 hours')::date; target date; p private.daily_sudoku; result jsonb;
BEGIN
 target:=coalesce(requested_day,current_day);
 SELECT * INTO p FROM private.daily_sudoku WHERE day=target AND opens_at<=clock_timestamp();
 SELECT jsonb_build_object('day',target,'current_day',current_day,'server_now',clock_timestamp(),'next_opens_at',(current_day+1+time '12:00') AT TIME ZONE 'Asia/Seoul','available',p.day IS NOT NULL,'givens',p.givens,'rankings',coalesce((SELECT jsonb_agg(jsonb_build_object('rank',c.rank,'nickname',c.nickname,'completed_at',c.completed_at,'is_me',c.user_id=auth.uid()) ORDER BY c.rank) FROM private.daily_sudoku_completions c WHERE c.day=p.day),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.submit_daily_sudoku(requested_day date, answer text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p private.daily_sudoku; c private.daily_sudoku_completions; profile public.semester_nicknames; moment timestamptz;
BEGIN
 IF auth.uid() IS NULL OR coalesce(auth.jwt()->'app_metadata'->>'provider','')<>'google' THEN RAISE EXCEPTION 'LOGIN_REQUIRED'; END IF;
 -- Serialize successful submissions for each day, including duplicate requests.
 PERFORM pg_advisory_xact_lock(78124,requested_day-date '2000-01-01');
 SELECT * INTO c FROM private.daily_sudoku_completions WHERE day=requested_day AND user_id=auth.uid();
 IF FOUND THEN RETURN jsonb_build_object('rank',c.rank,'completed_at',c.completed_at); END IF;
 moment:=clock_timestamp();
 SELECT * INTO p FROM private.daily_sudoku WHERE day=requested_day AND opens_at<=moment AND moment<opens_at+interval '24 hours';
 IF NOT FOUND THEN RAISE EXCEPTION 'CLOSED'; END IF;
 IF answer IS DISTINCT FROM p.solution THEN RAISE EXCEPTION 'WRONG_ANSWER'; END IF;
 SELECT n.* INTO profile FROM public.semester_nicknames n JOIN public.semester_settings s ON s.active_season=n.season_id WHERE s.id AND n.user_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_REQUIRED'; END IF;
 INSERT INTO private.daily_sudoku_completions(day,user_id,season_id,nickname,rank,completed_at)
 VALUES(requested_day,auth.uid(),profile.season_id,profile.nickname,(SELECT coalesce(max(rank),0)+1 FROM private.daily_sudoku_completions WHERE day=requested_day),moment) RETURNING * INTO c;
 RETURN jsonb_build_object('rank',c.rank,'completed_at',c.completed_at);
END $$;
CREATE FUNCTION public.save_daily_sudoku_progress(requested_day date, saved_state jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR coalesce(auth.jwt()->'app_metadata'->>'provider','')<>'google' THEN RAISE EXCEPTION 'LOGIN_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.daily_sudoku WHERE day=requested_day AND opens_at<=clock_timestamp()) THEN RAISE EXCEPTION 'UNAVAILABLE'; END IF;
 INSERT INTO public.daily_sudoku_progress(day,user_id,state,saved_at) VALUES(requested_day,auth.uid(),saved_state,clock_timestamp()) ON CONFLICT(day,user_id) DO UPDATE SET state=excluded.state,saved_at=excluded.saved_at;
END $$;
REVOKE ALL ON FUNCTION public.daily_sudoku_context(date),public.submit_daily_sudoku(date,text),public.save_daily_sudoku_progress(date,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.daily_sudoku_context(date) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_daily_sudoku(date,text),public.save_daily_sudoku_progress(date,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
