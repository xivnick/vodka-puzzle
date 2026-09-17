BEGIN;
-- Published daily puzzles contain givens only. private is an unpublished queue.
CREATE TABLE public.daily_sudoku (
 day date PRIMARY KEY, opens_at timestamptz NOT NULL UNIQUE,
 givens text NOT NULL CHECK(givens ~ '^[0-9]{81}$')
);
INSERT INTO public.daily_sudoku SELECT day,opens_at,givens FROM private.daily_sudoku WHERE opens_at<=now();
ALTER TABLE public.daily_sudoku ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_sudoku FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.daily_sudoku TO anon,authenticated;
CREATE POLICY published_read ON public.daily_sudoku FOR SELECT TO anon,authenticated USING(opens_at<=now());
ALTER TABLE private.daily_sudoku_completions SET SCHEMA public;
ALTER TABLE public.daily_sudoku_completions DROP CONSTRAINT daily_sudoku_completions_day_fkey;
ALTER TABLE public.daily_sudoku_completions ADD FOREIGN KEY(day) REFERENCES public.daily_sudoku(day);
ALTER TABLE public.daily_sudoku_progress DROP CONSTRAINT daily_sudoku_progress_day_fkey;
ALTER TABLE public.daily_sudoku_progress ADD FOREIGN KEY(day) REFERENCES public.daily_sudoku(day);
ALTER TABLE public.daily_sudoku_completions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_sudoku_completions FROM PUBLIC,anon,authenticated;
-- Rankings are exposed by context(), so account IDs remain inaccessible.
ALTER TABLE public.semester_completions ADD COLUMN excluded boolean NOT NULL DEFAULT false;
ALTER TABLE public.daily_sudoku_completions ADD COLUMN excluded boolean NOT NULL DEFAULT false;
REVOKE INSERT,UPDATE,DELETE ON public.semester_completions FROM anon,authenticated;
DROP POLICY insert_owned ON public.semester_completions;

CREATE TABLE public.completion_submissions (
 season_id text NOT NULL, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 puzzle_id text NOT NULL, state_version integer NOT NULL CHECK(state_version>0),
 state jsonb NOT NULL CHECK(jsonb_typeof(state)='object' AND octet_length(state::text)<30000),
 submitted_at timestamptz NOT NULL,
 PRIMARY KEY(season_id,user_id,puzzle_id),
 FOREIGN KEY(season_id,user_id) REFERENCES public.semester_nicknames(season_id,user_id) ON DELETE CASCADE
);
ALTER TABLE public.completion_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.completion_submissions FROM PUBLIC,anon,authenticated;
-- No player read/write policy: snapshots are available only to administration.
CREATE TABLE public.puzzle_catalog (
 season_id text NOT NULL, puzzle_id text NOT NULL, published_at timestamptz NOT NULL,
 PRIMARY KEY(season_id,puzzle_id)
);
ALTER TABLE public.puzzle_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.puzzle_catalog FROM PUBLIC,anon,authenticated;
INSERT INTO public.puzzle_catalog VALUES
 ('2026-2','260916_01','2026-09-16T00:00:00+09:00'),
 ('2026-2','260917_01','2026-09-17T00:00:00+09:00'),
 ('2026-2','260917_02','2026-09-17T00:00:00+09:00'),
 ('2026-2','260917_03','2026-09-17T00:00:00+09:00');

CREATE FUNCTION public.publish_daily_sudoku() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 -- Atomic move; concurrent readers never see a partially published puzzle.
 WITH opened AS (DELETE FROM private.daily_sudoku WHERE opens_at<=clock_timestamp() RETURNING day,opens_at,givens)
 INSERT INTO public.daily_sudoku SELECT * FROM opened ON CONFLICT(day) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.publish_daily_sudoku() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.submit_completion(requested_puzzle text, submitted_state jsonb, state_version integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE profile public.semester_nicknames; moment timestamptz; target date; result jsonb; position bigint;
BEGIN
 IF auth.uid() IS NULL OR coalesce(auth.jwt()->'app_metadata'->>'provider','')<>'google' THEN RAISE EXCEPTION 'LOGIN_REQUIRED'; END IF;
 SELECT n.* INTO profile FROM public.semester_nicknames n JOIN public.semester_settings s ON s.id AND s.active_season=n.season_id WHERE n.user_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_REQUIRED'; END IF;
 IF submitted_state IS NULL OR jsonb_typeof(submitted_state)<>'object' OR octet_length(submitted_state::text)>=30000 OR state_version IS NULL OR state_version<>1 THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
 IF requested_puzzle ~ '^daily-sudoku:[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
  target:=substring(requested_puzzle FROM 14)::date;
  PERFORM pg_advisory_xact_lock(78124,target-date '2000-01-01');
  SELECT jsonb_build_object('rank',c.rank,'completed_at',c.completed_at) INTO result FROM public.daily_sudoku_completions c WHERE c.day=target AND c.user_id=auth.uid();
  IF FOUND THEN RETURN result; END IF;
  PERFORM public.publish_daily_sudoku();
  moment:=clock_timestamp();
  IF NOT EXISTS(SELECT 1 FROM public.daily_sudoku WHERE day=target AND opens_at<=moment AND moment<opens_at+interval '24 hours') THEN RAISE EXCEPTION 'CLOSED'; END IF;
  SELECT coalesce(max(rank),0)+1 INTO position FROM public.daily_sudoku_completions WHERE day=target;
  INSERT INTO public.daily_sudoku_completions(day,user_id,season_id,nickname,rank,completed_at) VALUES(target,auth.uid(),profile.season_id,profile.nickname,position,moment);
  result:=jsonb_build_object('rank',position,'completed_at',moment);
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.puzzle_catalog WHERE season_id=profile.season_id AND puzzle_id=requested_puzzle AND published_at<=clock_timestamp()) THEN RAISE EXCEPTION 'UNAVAILABLE'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(profile.season_id || ':' || auth.uid()::text || ':' || requested_puzzle,0));
  SELECT jsonb_build_object('completed_at',c.completed_at) INTO result FROM public.semester_completions c WHERE c.season_id=profile.season_id AND c.user_id=auth.uid() AND c.puzzle_id=requested_puzzle;
  IF FOUND THEN RETURN result; END IF;
  moment:=clock_timestamp();
  INSERT INTO public.semester_completions(season_id,user_id,nickname,puzzle_id,completed_at) VALUES(profile.season_id,auth.uid(),profile.nickname,requested_puzzle,moment);
  result:=jsonb_build_object('completed_at',moment);
 END IF;
 INSERT INTO public.completion_submissions(season_id,user_id,puzzle_id,state_version,state,submitted_at) VALUES(profile.season_id,auth.uid(),requested_puzzle,state_version,submitted_state,moment);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.submit_completion(text,jsonb,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_completion(text,jsonb,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.daily_sudoku_context(requested_day date DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_day date := (clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date; target date; p public.daily_sudoku;
BEGIN
 PERFORM public.publish_daily_sudoku();
 target:=coalesce(requested_day,current_day);
 SELECT * INTO p FROM public.daily_sudoku WHERE day=target AND opens_at<=clock_timestamp();
 RETURN jsonb_build_object('day',target,'current_day',current_day,'server_now',clock_timestamp(),'next_opens_at',(current_day+1+time '00:00') AT TIME ZONE 'Asia/Seoul','available',p.day IS NOT NULL,'givens',p.givens,'rankings',coalesce((SELECT jsonb_agg(jsonb_build_object('rank',c.rank,'nickname',c.nickname,'completed_at',c.completed_at,'is_me',c.user_id=auth.uid()) ORDER BY c.rank) FROM public.daily_sudoku_completions c WHERE c.day=p.day AND NOT c.excluded),'[]'::jsonb));
END $$;
-- Old daily clients submit their final board as an answer string. Preserve compatibility.
CREATE OR REPLACE FUNCTION public.submit_daily_sudoku(requested_day date, answer text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF answer IS NULL OR answer !~ '^[1-9]{81}$' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
 RETURN public.submit_completion('daily-sudoku:' || requested_day::text,jsonb_build_object('values',(SELECT jsonb_agg(substring(answer FROM i FOR 1)::int ORDER BY i) FROM generate_series(1,81) i)),1);
END $$;
CREATE OR REPLACE FUNCTION public.save_daily_sudoku_progress(requested_day date, saved_state jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR coalesce(auth.jwt()->'app_metadata'->>'provider','')<>'google' THEN RAISE EXCEPTION 'LOGIN_REQUIRED'; END IF;
 PERFORM public.publish_daily_sudoku();
 IF NOT EXISTS(SELECT 1 FROM public.daily_sudoku WHERE day=requested_day AND opens_at<=clock_timestamp()) THEN RAISE EXCEPTION 'UNAVAILABLE'; END IF;
 INSERT INTO public.daily_sudoku_progress(day,user_id,state,saved_at) VALUES(requested_day,auth.uid(),saved_state,clock_timestamp()) ON CONFLICT(day,user_id) DO UPDATE SET state=excluded.state,saved_at=excluded.saved_at;
END $$;
CREATE OR REPLACE FUNCTION public.recent_completions()
RETURNS TABLE(nickname text,puzzle_id text,completed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT latest.nickname,latest.puzzle_id,latest.completed_at FROM (
 SELECT c.nickname,c.puzzle_id,c.completed_at FROM public.semester_completions c JOIN public.semester_settings s ON s.id AND s.active_season=c.season_id WHERE NOT c.excluded
 UNION ALL
 SELECT c.nickname,'daily-sudoku:' || c.day::text,c.completed_at FROM public.daily_sudoku_completions c JOIN public.semester_settings s ON s.id AND s.active_season=c.season_id WHERE NOT c.excluded
 ) latest ORDER BY latest.completed_at DESC,latest.puzzle_id,latest.nickname LIMIT 3;
$$;
DELETE FROM private.daily_sudoku WHERE opens_at<=now();
ALTER TABLE private.daily_sudoku DROP COLUMN solution;
NOTIFY pgrst,'reload schema';
COMMIT;
