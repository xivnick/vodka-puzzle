"""Check streak arithmetic and account isolation in a rolled-back DB transaction.
--rehearse also applies the pending streak migration inside that transaction.
"""
import json
import sys
import uuid
from pathlib import Path
from urllib.error import HTTPError
from database import query

cases = [
    ([], '2026-09-19', 0, 'none'),
    (['2026-09-18'], '2026-09-19', 0, 'none'),
    (['2026-09-18', '2026-09-19'], '2026-09-19', 1, 'completed'),
    (['2026-09-19'], '2026-09-19', 1, 'completed'),
    (['2026-09-19'], '2026-09-20', 1, 'pending'),
    (['2026-09-19'], '2026-09-21', 1, 'rest'),
    (['2026-09-19'], '2026-09-22', 0, 'none'),
    (['2026-09-19', '2026-09-21'], '2026-09-21', 2, 'completed'),
    (['2026-09-19', '2026-09-20', '2026-09-21'], '2026-09-21', 3, 'completed'),
    (['2026-09-19', '2026-09-21', '2026-09-23'], '2026-09-23', 3, 'completed'),
    (['2026-09-19', '2026-09-22'], '2026-09-22', 1, 'completed'),
    (['2026-09-19', '2026-09-20', '2026-09-23', '2026-09-24'], '2026-09-25', 2, 'pending'),
    (['2026-09-21', '2026-09-19', '2026-09-21', '2026-09-25'], '2026-09-21', 2, 'completed'),
    (['2026-12-30', '2027-01-01'], '2027-01-01', 2, 'completed'),
]
checks = []
for days, today, count, status in cases:
    dates = 'ARRAY[' + ','.join("date '" + d + "'" for d in days) + ']::date[]'
    expected = json.dumps({'count': count, 'status': status})
    checks.append(f"IF private.calculate_daily_streak({dates},date '{today}')<>'{expected}'::jsonb THEN RAISE EXCEPTION 'Streak case {len(checks)+1} failed'; END IF;")
u1, u2 = str(uuid.uuid4()), str(uuid.uuid4())
def claims(uid):
    return json.dumps({'sub': uid, 'role': 'authenticated', 'app_metadata': {'provider': 'google'}})
sql = "BEGIN;\n"
if '--rehearse' in sys.argv:
    migration = (Path(__file__).resolve().parent.parent/'supabase/migrations/20260919_daily_streak.sql').read_text()
    sql += migration.removeprefix('BEGIN;').rsplit('COMMIT;', 1)[0]
sql += 'DO $$ BEGIN\n' + '\n'.join(checks) + '\nEND $$;\n'
sql += f"""
DO $$ BEGIN
 IF private.calculate_daily_streak(NULL,date '2026-09-19')<>'{{"count":0,"status":"none"}}'::jsonb THEN RAISE EXCEPTION 'Null days'; END IF;
 IF has_function_privilege('authenticated','private.calculate_daily_streak(date[],date)','EXECUTE') OR has_function_privilege('anon','private.calculate_daily_streak(date[],date)','EXECUTE') THEN RAISE EXCEPTION 'Private helper exposed'; END IF;
END $$;
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data) VALUES
 ('{u1}','authenticated','authenticated','streak-{u1}@example.invalid','{{"provider":"google"}}'),
 ('{u2}','authenticated','authenticated','streak-{u2}@example.invalid','{{"provider":"google"}}');
INSERT INTO public.semester_nicknames(season_id,user_id,nickname)
 SELECT active_season,'{u1}','__streak_a_{u1[:8]}' FROM public.semester_settings WHERE id;
INSERT INTO public.semester_nicknames(season_id,user_id,nickname)
 SELECT active_season,'{u2}','__streak_b_{u2[:8]}' FROM public.semester_settings WHERE id;
INSERT INTO public.daily_sudoku(day,opens_at,givens)
 SELECT d,(d+time '00:00') AT TIME ZONE 'Asia/Seoul',repeat('0',81)
 FROM (VALUES(date '2026-09-18'),((clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date)) days(d)
 ON CONFLICT DO NOTHING;
INSERT INTO public.daily_sudoku_completions(day,user_id,season_id,nickname,rank,completed_at)
 SELECT date '2026-09-18','{u1}',active_season,'__streak_a_{u1[:8]}',
 (SELECT coalesce(max(rank),0)+1 FROM public.daily_sudoku_completions WHERE day=date '2026-09-18'),clock_timestamp()
 FROM public.semester_settings WHERE id;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{claims(u1)}',true);
DO $$ DECLARE first jsonb; again jsonb; d date:=(clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date; BEGIN
 IF public.daily_sudoku_context(NULL)->'streak'<>'{{"count":0,"status":"none"}}'::jsonb THEN RAISE EXCEPTION 'Before-start record counted'; END IF;
 first:=public.submit_completion('daily-sudoku:' || d::text,'{{"values":[1]}}',1);
 again:=public.submit_completion('daily-sudoku:' || d::text,'{{"values":[2]}}',1);
 IF first<>again THEN RAISE EXCEPTION 'Duplicate changed completion'; END IF;
 IF public.daily_sudoku_context(NULL)->'streak'<>'{{"count":1,"status":"completed"}}'::jsonb THEN RAISE EXCEPTION 'First completion not counted once'; END IF;
 IF public.daily_sudoku_context(date '2026-09-18')->'streak'<>'{{"count":1,"status":"completed"}}'::jsonb THEN RAISE EXCEPTION 'Practice date changed personal streak'; END IF;
 BEGIN PERFORM * FROM public.daily_sudoku_completions; RAISE EXCEPTION 'Completion table exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claims','{claims(u2)}',true);
DO $$ BEGIN
 IF public.daily_sudoku_context(NULL)->'streak'<>'{{"count":0,"status":"none"}}'::jsonb THEN RAISE EXCEPTION 'Other account streak leaked'; END IF;
END $$;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{{"role":"anon"}}',true);
DO $$ BEGIN
 IF public.daily_sudoku_context(NULL)->'streak'<>'{{"count":0,"status":"none"}}'::jsonb THEN RAISE EXCEPTION 'Anonymous streak leaked'; END IF;
END $$;
RESET ROLE;
UPDATE public.daily_sudoku_completions SET excluded=true WHERE user_id='{u1}' AND day>=date '2026-09-19';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{claims(u1)}',true);
DO $$ BEGIN
 IF public.daily_sudoku_context(NULL)->'streak'<>'{{"count":0,"status":"none"}}'::jsonb THEN RAISE EXCEPTION 'Excluded completion counted'; END IF;
END $$;
RESET ROLE;
DELETE FROM auth.users WHERE id IN ('{u1}','{u2}');
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.daily_sudoku_completions WHERE user_id IN ('{u1}','{u2}')) THEN RAISE EXCEPTION 'Account deletion retained streak records'; END IF;
END $$;
SELECT 'streak arithmetic, start date, rest/recovery/reset, duplicates, account isolation, permissions and exclusions: passed' AS result;
ROLLBACK;
"""
try:
    print(query(sql))
except HTTPError as error:
    print(error.read().decode())
    raise SystemExit(1)
