BEGIN;
-- Account-wide tickets. Only the RPCs expose the caller's balance and openings.
CREATE TABLE private.time_machine_wallets (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 balance integer NOT NULL CHECK(balance BETWEEN 0 AND 2),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE private.time_machine_openings (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 day date NOT NULL REFERENCES public.daily_sudoku(day),
 opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,day)
);
CREATE TABLE private.time_machine_ticket_events (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 event_key text NOT NULL,
 delta integer NOT NULL CHECK(delta IN (-1,1)),
 balance_after integer NOT NULL CHECK(balance_after BETWEEN 0 AND 2),
 day date REFERENCES public.daily_sudoku(day),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,event_key),
 CHECK((delta=1 AND day IS NULL) OR (delta=-1 AND day IS NOT NULL))
);
ALTER TABLE private.time_machine_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.time_machine_openings ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.time_machine_ticket_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.time_machine_wallets,private.time_machine_openings,private.time_machine_ticket_events FROM PUBLIC,anon,authenticated;

-- One initial ticket for every existing account; a unique event records the grant.
INSERT INTO private.time_machine_wallets(user_id,balance) SELECT id,1 FROM auth.users;
INSERT INTO private.time_machine_ticket_events(user_id,event_key,delta,balance_after)
 SELECT user_id,'initial-ticket',1,1 FROM private.time_machine_wallets;

-- New accounts receive the same one-time grant on their first authenticated visit.
CREATE FUNCTION private.ensure_time_machine_wallet() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR coalesce(auth.jwt()->'app_metadata'->>'provider','')<>'google' THEN RAISE EXCEPTION 'LOGIN_REQUIRED'; END IF;
 WITH created AS (
  INSERT INTO private.time_machine_wallets(user_id,balance) VALUES(auth.uid(),1)
  ON CONFLICT(user_id) DO NOTHING RETURNING user_id
 )
 INSERT INTO private.time_machine_ticket_events(user_id,event_key,delta,balance_after)
 SELECT user_id,'initial-ticket',1,1 FROM created;
END $$;
REVOKE ALL ON FUNCTION private.ensure_time_machine_wallet() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.time_machine_context() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_day date:=(clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date;
 balance integer; signed_in boolean:=auth.uid() IS NOT NULL AND coalesce(auth.jwt()->'app_metadata'->>'provider','')='google';
BEGIN
 PERFORM public.publish_daily_sudoku();
 IF signed_in THEN
  PERFORM private.ensure_time_machine_wallet();
  SELECT w.balance INTO balance FROM private.time_machine_wallets w WHERE w.user_id=auth.uid();
 END IF;
 RETURN jsonb_build_object('current_day',current_day,'tickets',balance,'signed_in',signed_in,
  'days',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'day',p.day,
   'completed',EXISTS(SELECT 1 FROM public.daily_sudoku_completions c WHERE c.day=p.day AND c.user_id=auth.uid() AND NOT c.excluded),
   'ticket_used',EXISTS(SELECT 1 FROM private.time_machine_openings o WHERE o.day=p.day AND o.user_id=auth.uid())
  ) ORDER BY p.day) FROM public.daily_sudoku p WHERE p.day>=date '2026-09-19' AND p.day<=current_day AND p.opens_at<=clock_timestamp()),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.time_machine_context() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.time_machine_context() TO anon,authenticated;

CREATE FUNCTION public.open_time_machine(requested_day date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_day date:=(clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date; ticket_balance integer;
BEGIN
 PERFORM private.ensure_time_machine_wallet();
 IF NOT EXISTS(SELECT 1 FROM public.semester_nicknames n JOIN public.semester_settings s ON s.id AND s.active_season=n.season_id WHERE n.user_id=auth.uid()) THEN RAISE EXCEPTION 'PROFILE_REQUIRED'; END IF;
 IF requested_day IS NULL OR requested_day>=current_day OR requested_day<date '2026-09-19' THEN RAISE EXCEPTION 'UNAVAILABLE'; END IF;
 PERFORM public.publish_daily_sudoku();
 IF NOT EXISTS(SELECT 1 FROM public.daily_sudoku p WHERE p.day=requested_day AND p.opens_at<=clock_timestamp()) THEN RAISE EXCEPTION 'UNAVAILABLE'; END IF;
 -- Match completion's day lock, then serialize balance changes across all dates.
 PERFORM pg_advisory_xact_lock(78124,requested_day-date '2000-01-01');
 SELECT w.balance INTO ticket_balance FROM private.time_machine_wallets w WHERE w.user_id=auth.uid() FOR UPDATE;
 IF EXISTS(SELECT 1 FROM private.time_machine_openings o WHERE o.user_id=auth.uid() AND o.day=requested_day)
  OR EXISTS(SELECT 1 FROM public.daily_sudoku_completions c WHERE c.user_id=auth.uid() AND c.day=requested_day AND NOT c.excluded) THEN
  RETURN jsonb_build_object('day',requested_day,'tickets',ticket_balance,'charged',false);
 END IF;
 IF ticket_balance<1 THEN RAISE EXCEPTION 'NO_TICKETS'; END IF;
 ticket_balance:=ticket_balance-1;
 UPDATE private.time_machine_wallets w SET balance=ticket_balance,updated_at=clock_timestamp() WHERE w.user_id=auth.uid();
 INSERT INTO private.time_machine_openings(user_id,day) VALUES(auth.uid(),requested_day);
 INSERT INTO private.time_machine_ticket_events(user_id,event_key,delta,balance_after,day)
 VALUES(auth.uid(),'open:' || requested_day::text,-1,ticket_balance,requested_day);
 RETURN jsonb_build_object('day',requested_day,'tickets',ticket_balance,'charged',true);
END $$;
REVOKE ALL ON FUNCTION public.open_time_machine(date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.open_time_machine(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_completion(requested_puzzle text, submitted_state jsonb, state_version integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  IF NOT EXISTS(SELECT 1 FROM public.daily_sudoku p WHERE p.day=target AND p.opens_at<=moment AND (
   moment<p.opens_at+interval '24 hours' OR EXISTS(
    SELECT 1 FROM private.time_machine_openings o WHERE o.user_id=auth.uid() AND o.day=target
   )
  )) THEN RAISE EXCEPTION 'CLOSED'; END IF;
  SELECT coalesce(max(rank),0)+1 INTO position FROM public.daily_sudoku_completions WHERE day=target;
  INSERT INTO public.daily_sudoku_completions(day,user_id,season_id,nickname,rank,completed_at) VALUES(target,auth.uid(),profile.season_id,profile.nickname,position,moment);
  result:=jsonb_build_object('rank',position,'completed_at',moment);
 ELSE
  IF NOT public.is_puzzle_published(profile.season_id,requested_puzzle) THEN RAISE EXCEPTION 'UNAVAILABLE'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(profile.season_id || ':' || auth.uid()::text || ':' || requested_puzzle,0));
  SELECT jsonb_build_object('completed_at',c.completed_at) INTO result FROM public.semester_completions c WHERE c.season_id=profile.season_id AND c.user_id=auth.uid() AND c.puzzle_id=requested_puzzle;
  IF FOUND THEN RETURN result; END IF;
  moment:=clock_timestamp();
  INSERT INTO public.semester_completions(season_id,user_id,nickname,puzzle_id,completed_at) VALUES(profile.season_id,auth.uid(),profile.nickname,requested_puzzle,moment);
  result:=jsonb_build_object('completed_at',moment);
 END IF;
 INSERT INTO public.completion_submissions(season_id,user_id,puzzle_id,state_version,state,submitted_at) VALUES(profile.season_id,auth.uid(),requested_puzzle,state_version,submitted_state,moment);
 RETURN result;
END $function$
;

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
  'ticket_opened',EXISTS(SELECT 1 FROM private.time_machine_openings o WHERE o.user_id=auth.uid() AND o.day=target),
  'can_submit',p.day IS NOT NULL AND (clock_timestamp()<p.opens_at+interval '24 hours' OR EXISTS(
   SELECT 1 FROM private.time_machine_openings o WHERE o.user_id=auth.uid() AND o.day=target)),
  'my_completed',EXISTS(SELECT 1 FROM public.daily_sudoku_completions c WHERE c.user_id=auth.uid() AND c.day=target AND NOT c.excluded),
  'completion_state',(SELECT cs.state FROM public.completion_submissions cs
   JOIN public.daily_sudoku_completions c ON c.season_id=cs.season_id AND c.user_id=cs.user_id
    AND cs.puzzle_id='daily-sudoku:' || c.day::text
   WHERE c.user_id=auth.uid() AND c.day=target AND NOT c.excluded),
  'saved_progress',(SELECT pr.state FROM public.daily_sudoku_progress pr WHERE pr.user_id=auth.uid() AND pr.day=target),
  'streak_rankings',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.rank) FROM private.daily_streak_rankings_at(current_day) r),'[]'::jsonb),
  'rankings',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'rank',c.rank,'nickname',c.nickname,'completed_at',c.completed_at,'is_me',c.user_id=auth.uid()) ORDER BY c.rank)
   FROM public.daily_sudoku_completions c WHERE c.day=p.day AND NOT c.excluded),'[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.daily_sudoku_context(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.daily_sudoku_context(date) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
