"""Verify ticket authorization and streak repair with disposable, rolled-back accounts.
--rehearse includes the pending time-machine migration in the same transaction.
No puzzle solving or solution uniqueness checks are performed.
"""
import json
import sys
import uuid
from pathlib import Path
from urllib.error import HTTPError
from database import query

u1, u2 = str(uuid.uuid4()), str(uuid.uuid4())
def claims(uid):
    return json.dumps({'sub': uid, 'role': 'authenticated', 'app_metadata': {'provider': 'google'}})
sql = 'BEGIN;\n'
if '--rehearse' in sys.argv:
    migration = (Path(__file__).resolve().parent.parent/'supabase/migrations/20261011_time_machine.sql').read_text()
    sql += migration.removeprefix('BEGIN;').rsplit('COMMIT;', 1)[0]
sql += f"""
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data) VALUES
 ('{u1}','authenticated','authenticated','time-machine-{u1}@example.invalid','{{"provider":"google"}}'),
 ('{u2}','authenticated','authenticated','time-machine-{u2}@example.invalid','{{"provider":"google"}}');
INSERT INTO public.semester_nicknames(season_id,user_id,nickname)
 SELECT active_season,u,n FROM public.semester_settings CROSS JOIN
 (VALUES('{u1}'::uuid,'__tm_a_{u1[:8]}'),('{u2}'::uuid,'__tm_b_{u2[:8]}')) users(u,n) WHERE id;
INSERT INTO public.daily_sudoku(day,opens_at,givens)
 SELECT d,(d+time '00:00') AT TIME ZONE 'Asia/Seoul',repeat('0',81)
 FROM (SELECT (clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date-day_offset AS d FROM generate_series(0,4) day_offset) days
 ON CONFLICT DO NOTHING;
INSERT INTO public.daily_sudoku_completions(day,user_id,season_id,nickname,rank,completed_at)
 SELECT (clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date-3,'{u1}',active_season,'__tm_a_{u1[:8]}',
 (SELECT coalesce(max(rank),0)+1 FROM public.daily_sudoku_completions WHERE day=(clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date-3),clock_timestamp()-interval '3 days'
 FROM public.semester_settings WHERE id;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{claims(u1)}',true);
DO $$ DECLARE d date:=(clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date; before_count integer; after_count integer; first jsonb; again jsonb; BEGIN
 IF public.time_machine_context()->>'tickets'<>'1' THEN RAISE EXCEPTION 'Initial ticket missing'; END IF;
 IF public.time_machine_context()->>'tickets'<>'1' THEN RAISE EXCEPTION 'Initial grant repeated'; END IF;
 BEGIN PERFORM public.open_time_machine(d); RAISE EXCEPTION 'Today charged'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'UNAVAILABLE' THEN RAISE; END IF; END;
 BEGIN PERFORM public.open_time_machine(d+1); RAISE EXCEPTION 'Future opened'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'UNAVAILABLE' THEN RAISE; END IF; END;
 BEGIN PERFORM public.open_time_machine(date '2000-01-01'); RAISE EXCEPTION 'Before-start opened'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'UNAVAILABLE' THEN RAISE; END IF; END;
 BEGIN PERFORM public.submit_completion('daily-sudoku:' || (d-1)::text,'{{"values":[1]}}',1); RAISE EXCEPTION 'Locked past accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CLOSED' THEN RAISE; END IF; END;
 PERFORM public.submit_completion('daily-sudoku:' || d::text,'{{"values":[1]}}',1);
 before_count:=(public.daily_sudoku_context(NULL)->'streak'->>'count')::integer;
 first:=public.open_time_machine(d-1);
 IF first->>'tickets'<>'0' OR first->>'charged'<>'true' THEN RAISE EXCEPTION 'Ticket not charged'; END IF;
 again:=public.open_time_machine(d-1);
 IF again->>'tickets'<>'0' OR again->>'charged'<>'false' THEN RAISE EXCEPTION 'Reentry charged'; END IF;
 IF public.daily_sudoku_context(d-1)->>'can_submit'<>'true' OR public.daily_sudoku_context(d-1)->>'ticket_opened'<>'true' THEN RAISE EXCEPTION 'Opened past not authorized'; END IF;
 PERFORM public.save_daily_sudoku_progress(d-1,'{{"values":[1]}}');
 first:=public.submit_completion('daily-sudoku:' || (d-1)::text,'{{"values":[1]}}',1);
 again:=public.submit_completion('daily-sudoku:' || (d-1)::text,'{{"values":[2]}}',1);
 IF first<>again THEN RAISE EXCEPTION 'Past duplicate changed completion'; END IF;
 after_count:=(public.daily_sudoku_context(NULL)->'streak'->>'count')::integer;
 IF before_count<>1 OR after_count<>3 THEN RAISE EXCEPTION 'Past completion did not restore streak: % -> %',before_count,after_count; END IF;
 IF public.daily_sudoku_context(d-1)->>'my_completed'<>'true' OR public.daily_sudoku_context(d-1)->'completion_state'->'values'<>'[1]'::jsonb THEN RAISE EXCEPTION 'Completed state unavailable'; END IF;
 BEGIN PERFORM public.open_time_machine(d-2); RAISE EXCEPTION 'Empty wallet accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NO_TICKETS' THEN RAISE; END IF; END;
 IF public.open_time_machine(d-3)->>'charged'<>'false' THEN RAISE EXCEPTION 'Completed date charged'; END IF;
 BEGIN SELECT balance FROM private.time_machine_wallets; RAISE EXCEPTION 'Wallet exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO private.time_machine_openings(user_id,day) VALUES(auth.uid(),d-2); RAISE EXCEPTION 'Forged opening allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claims','{claims(u2)}',true);
DO $$ DECLARE d date:=(clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date; BEGIN
 IF public.time_machine_context()->>'tickets'<>'1' THEN RAISE EXCEPTION 'Another wallet affected'; END IF;
 IF public.daily_sudoku_context(d-1)->>'ticket_opened'<>'false' OR public.daily_sudoku_context(d-1)->>'can_submit'<>'false' OR public.daily_sudoku_context(d-1)->'completion_state'<>'null'::jsonb THEN RAISE EXCEPTION 'Another account authorization/state leaked'; END IF;
 BEGIN PERFORM public.submit_completion('daily-sudoku:' || (d-1)::text,'{{}}',1); RAISE EXCEPTION 'Other user opening accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CLOSED' THEN RAISE; END IF; END;
END $$;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{{"role":"anon"}}',true);
DO $$ BEGIN
 IF public.time_machine_context()->'tickets'<>'null'::jsonb THEN RAISE EXCEPTION 'Guest wallet exposed'; END IF;
 BEGIN PERFORM public.open_time_machine((clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date-1); RAISE EXCEPTION 'Guest opening allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM private.time_machine_ticket_events WHERE user_id='{u1}' AND delta=1)<>1 OR (SELECT count(*) FROM private.time_machine_ticket_events WHERE user_id='{u1}' AND delta=-1)<>1 THEN RAISE EXCEPTION 'Duplicate ticket events'; END IF;
END $$;
DELETE FROM auth.users WHERE id IN ('{u1}','{u2}');
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM private.time_machine_wallets WHERE user_id IN ('{u1}','{u2}')) OR EXISTS(SELECT 1 FROM private.time_machine_openings WHERE user_id IN ('{u1}','{u2}')) OR EXISTS(SELECT 1 FROM private.time_machine_ticket_events WHERE user_id IN ('{u1}','{u2}')) THEN RAISE EXCEPTION 'Account deletion retained ticket data'; END IF;
END $$;
SELECT 'initial grant, one-time use, reentry, past completion, streak repair, account isolation and deletion: passed' AS result;
ROLLBACK;
"""
try:
    print(query(sql))
except HTTPError as error:
    print(error.read().decode())
    raise SystemExit(1)
