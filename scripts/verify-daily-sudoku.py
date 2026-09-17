"""Check the live functions and access controls; all fixtures are rolled back."""
import json,uuid
from database import query
u1,u2=str(uuid.uuid4()),str(uuid.uuid4())
def claims(uid):return json.dumps({'sub':uid,'role':'authenticated','app_metadata':{'provider':'google'}})
sql=f"""
BEGIN;
INSERT INTO private.daily_sudoku(day,opens_at,givens,solution,techniques)
SELECT (clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date,
(((clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date)+time '00:00') AT TIME ZONE 'Asia/Seoul',givens,solution,techniques
FROM private.daily_sudoku ORDER BY day LIMIT 1 ON CONFLICT(day) DO NOTHING;
CREATE TEMP TABLE daily_fixture AS SELECT day,solution FROM private.daily_sudoku WHERE day=(clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date;
GRANT SELECT ON daily_fixture TO authenticated,anon;
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data) VALUES
('{u1}','authenticated','authenticated','daily-a-{u1}@example.invalid','{{"provider":"google"}}'),
('{u2}','authenticated','authenticated','daily-b-{u2}@example.invalid','{{"provider":"google"}}');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{claims(u1)}',true);
INSERT INTO public.semester_nicknames(season_id,user_id,nickname) SELECT active_season,'{u1}','__daily_a' FROM public.semester_settings WHERE id;
DO $$ DECLARE d date; a text; first jsonb; again jsonb; BEGIN
 SELECT day,solution INTO STRICT d,a FROM daily_fixture;
 BEGIN PERFORM public.submit_daily_sudoku(d,repeat('1',81)); RAISE EXCEPTION 'Wrong answer accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'WRONG_ANSWER' THEN RAISE; END IF; END;
 BEGIN PERFORM public.submit_daily_sudoku(d-1,a); RAISE EXCEPTION 'Closed round accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'CLOSED' THEN RAISE; END IF; END;
 first:=public.submit_daily_sudoku(d,a);again:=public.submit_daily_sudoku(d,a);
 IF first<>again THEN RAISE EXCEPTION 'Duplicate changed result'; END IF;
 PERFORM public.save_daily_sudoku_progress(d,'{{"values":[1]}}');
 BEGIN PERFORM public.save_daily_sudoku_progress(d+1,'{{}}'); RAISE EXCEPTION 'Future progress accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'UNAVAILABLE' THEN RAISE; END IF; END;
 BEGIN INSERT INTO public.daily_sudoku_progress(day,user_id,state) VALUES(d,'{u1}','{{}}'); RAISE EXCEPTION 'Direct write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM private.daily_sudoku; RAISE EXCEPTION 'Answer exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END $$;
UPDATE public.semester_nicknames SET nickname='__daily_renamed' WHERE user_id='{u1}';
SELECT set_config('request.jwt.claims','{claims(u2)}',true);
INSERT INTO public.semester_nicknames(season_id,user_id,nickname) SELECT active_season,'{u2}','__daily_b' FROM public.semester_settings WHERE id;
DO $$ DECLARE d date; a text; second jsonb; ctx jsonb; first_rank bigint; BEGIN
 SELECT day,solution INTO d,a FROM daily_fixture;
 IF EXISTS(SELECT 1 FROM public.daily_sudoku_progress WHERE user_id='{u1}') THEN RAISE EXCEPTION 'Other progress exposed'; END IF;
 second:=public.submit_daily_sudoku(d,a);ctx:=public.daily_sudoku_context(d);
 SELECT (r->>'rank')::bigint INTO first_rank FROM jsonb_array_elements(ctx->'rankings') r WHERE r->>'nickname'='__daily_renamed';
 IF first_rank IS NULL OR (second->>'rank')::bigint<>first_rank+1 THEN RAISE EXCEPTION 'Rank order/rename failed'; END IF;
 END $$;
INSERT INTO public.semester_completions(season_id,user_id,nickname,puzzle_id) SELECT active_season,'{u2}','__daily_b','__banner_fixture' FROM public.semester_settings WHERE id;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{{"role":"anon"}}',true);
DO $$ DECLARE ctx jsonb; BEGIN
 ctx:=public.daily_sudoku_context((SELECT day+1 FROM daily_fixture));
 IF (ctx->>'available')::boolean OR ctx->>'givens' IS NOT NULL OR jsonb_array_length(ctx->'rankings')<>0 THEN RAISE EXCEPTION 'Future puzzle exposed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.recent_completions() WHERE nickname='__daily_renamed' AND puzzle_id='daily-sudoku:' || (SELECT day::text FROM daily_fixture)) OR NOT EXISTS(SELECT 1 FROM public.recent_completions() WHERE puzzle_id='__banner_fixture') THEN RAISE EXCEPTION 'Mixed banner records/rename failed'; END IF;
 IF (SELECT count(*) FROM public.recent_completions())<>3 THEN RAISE EXCEPTION 'Banner limit failed'; END IF;
 ctx:=public.daily_sudoku_context(date '2000-01-01');IF (ctx->>'available')::boolean THEN RAISE EXCEPTION 'Missing puzzle not handled'; END IF;
 BEGIN PERFORM public.submit_daily_sudoku((SELECT day FROM daily_fixture),repeat('1',81)); RAISE EXCEPTION 'Guest submit accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; WHEN raise_exception THEN IF SQLERRM <> 'LOGIN_REQUIRED' THEN RAISE; END IF; END;
 END $$;
RESET ROLE;
DELETE FROM auth.users WHERE id='{u1}';
DO $$ BEGIN IF EXISTS(SELECT 1 FROM private.daily_sudoku_completions WHERE user_id='{u1}') OR EXISTS(SELECT 1 FROM public.daily_sudoku_progress WHERE user_id='{u1}') THEN RAISE EXCEPTION 'Deletion cascade failed'; END IF; END $$;
SELECT 'wrong answer, duplicate, rank order, rename, future privacy, missing puzzle, account isolation, deletion cascade: passed' AS result;
ROLLBACK;
"""
try:
 print(query(sql))
except __import__('urllib.error',fromlist=['HTTPError']).HTTPError as error:
 print(error.read().decode())
 raise SystemExit(1)
