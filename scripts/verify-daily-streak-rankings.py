"""Verify public streak rankings with disposable fixtures; always roll back.
--rehearse also applies the pending ranking migration and rolls it back.
"""
import json
import sys
import uuid
from pathlib import Path
from urllib.error import HTTPError
from database import query

prefix='__sr_'+uuid.uuid4().hex[:7]
fixtures=[
 ('high',list(range(20,27)),'00:10'),
 ('complete_early',list(range(21,27)),'00:01'),
 ('complete_late',list(range(21,27)),'00:02'),
 ('recovered',[19,20,21,23,25,26],'00:03'),
 ('pending_early',list(range(20,26)),'00:01'),
 ('pending_late',list(range(20,26)),'00:02'),
 ('rest_early',list(range(19,25)),'00:01'),
 ('rest_late',list(range(19,25)),'00:02'),
 ('expired',list(range(19,24)),'00:01'),
 ('before_start',[18],'00:01'),
]
users={label:str(uuid.uuid4()) for label,_,_ in fixtures}
names={label:prefix+'_'+str(i) for i,(label,_,_) in enumerate(fixtures)}
sql='BEGIN;\n'
if '--rehearse' in sys.argv:
    migration=(Path(__file__).resolve().parent.parent/'supabase/migrations/20260919_daily_streak_rankings.sql').read_text()
    sql+=migration.removeprefix('BEGIN;').rsplit('COMMIT;',1)[0]
sql+="""
INSERT INTO public.daily_sudoku(day,opens_at,givens)
SELECT d,(d+time '00:00') AT TIME ZONE 'Asia/Seoul',repeat('0',81)
FROM generate_series(date '2026-09-18',date '2026-09-26',interval '1 day') dates(d)
ON CONFLICT DO NOTHING;
"""
for label,days,time in fixtures:
    uid=users[label];name=names[label]
    sql+=f"""
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data)
VALUES('{uid}','authenticated','authenticated','{uid}@example.invalid','{{"provider":"google"}}');
INSERT INTO public.semester_nicknames(season_id,user_id,nickname)
SELECT active_season,'{uid}','{name}' FROM public.semester_settings WHERE id;
"""
    for day in days:
        date=f'2026-09-{day:02}'
        sql+=f"""
INSERT INTO public.daily_sudoku_completions(day,user_id,season_id,nickname,rank,completed_at)
SELECT date '{date}','{uid}',active_season,'{name}',
(SELECT coalesce(max(rank),0)+1 FROM public.daily_sudoku_completions WHERE day=date '{date}'),timestamptz '{date}T{time}:00+09:00'
FROM public.semester_settings WHERE id;
"""
expected=[names[label] for label,_,_ in fixtures[:8]]
expected_sql='ARRAY['+','.join("'"+x+"'" for x in expected)+']::text[]'
sql+=f"""
DO $$ DECLARE actual text[]; BEGIN
 SELECT array_agg(r.nickname ORDER BY r.rank) INTO actual FROM private.daily_streak_rankings_at(date '2026-09-26') r WHERE r.nickname LIKE '{prefix}%';
 IF actual IS DISTINCT FROM {expected_sql} THEN RAISE EXCEPTION 'Count/status/achievement ordering failed: %',actual; END IF;
 IF EXISTS(SELECT 1 FROM private.daily_streak_rankings_at(date '2026-09-26') r WHERE r.nickname LIKE '{prefix}%' AND r.count<>CASE WHEN r.nickname='{names['high']}' THEN 7 ELSE 6 END) THEN RAISE EXCEPTION 'Rest day counted or recovery reset'; END IF;
 IF EXISTS(SELECT 1 FROM private.daily_streak_rankings_at(date '2026-09-26') r WHERE r.nickname IN ('{names['expired']}','{names['before_start']}')) THEN RAISE EXCEPTION 'Expired/start-day filter failed'; END IF;
 IF has_function_privilege('authenticated','private.daily_streak_rankings_at(date)','EXECUTE') OR has_function_privilege('anon','private.daily_streak_rankings_at(date)','EXECUTE') THEN RAISE EXCEPTION 'Private ranking helper exposed'; END IF;
END $$;
UPDATE public.semester_nicknames SET nickname='{prefix}_renamed' WHERE user_id='{users['complete_early']}';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.daily_streak_rankings_at(date '2026-09-26') r WHERE r.nickname='{prefix}_renamed' AND r.count=6) THEN RAISE EXCEPTION 'Nickname update lost streak'; END IF;
END $$;
UPDATE public.daily_sudoku_completions SET excluded=true WHERE user_id='{users['high']}' AND day=date '2026-09-26';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.daily_streak_rankings_at(date '2026-09-26') r WHERE r.nickname='{names['high']}' AND r.count=6 AND r.status='pending') THEN RAISE EXCEPTION 'Excluded completion counted'; END IF;
END $$;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{{"role":"anon"}}',true);
DO $$ DECLARE ctx jsonb; row jsonb; keys text[]; BEGIN
 ctx:=public.daily_sudoku_context(NULL);
 FOR row IN SELECT * FROM jsonb_array_elements(ctx->'streak_rankings') LOOP
  SELECT array_agg(k ORDER BY k) INTO keys FROM jsonb_object_keys(row) k;
  IF keys<>ARRAY['count','is_me','nickname','rank','status'] THEN RAISE EXCEPTION 'Private data in ranking: %',keys; END IF;
  IF (row->>'is_me')::boolean THEN RAISE EXCEPTION 'Anonymous row marked as owner'; END IF;
 END LOOP;
 IF ctx->'streak_rankings' IS DISTINCT FROM public.daily_sudoku_context(date '2099-01-01')->'streak_rankings' THEN RAISE EXCEPTION 'Requested future day changed rankings'; END IF;
 BEGIN PERFORM * FROM public.daily_sudoku_completions; RAISE EXCEPTION 'Raw completions exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{json.dumps({'sub': users['rest_early'], 'role': 'authenticated', 'app_metadata': {'provider': 'google'}})}',true);
DO $$ DECLARE ctx jsonb; row jsonb; BEGIN
 ctx:=public.daily_sudoku_context(NULL);
 IF (ctx->'streak'->>'count')::int>0 THEN
  SELECT r INTO row FROM jsonb_array_elements(ctx->'streak_rankings') r WHERE (r->>'is_me')::boolean;
  IF row IS NULL OR row->>'nickname'<>'{names['rest_early']}' OR row->>'count'<>ctx->'streak'->>'count' THEN RAISE EXCEPTION 'Personal ranking disagrees with streak'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(ctx->'streak_rankings') r WHERE (r->>'is_me')::boolean AND r->>'nickname'<>'{names['rest_early']}') THEN RAISE EXCEPTION 'Another user marked as owner'; END IF;
END $$;
RESET ROLE;
SELECT 'ranking count, state precedence, achievement time, rest recovery, exclusions, names, privacy and current-day scope: passed' AS result;
ROLLBACK;
"""
try:
    print(query(sql))
except HTTPError as error:
    print(error.read().decode())
    raise SystemExit(1)
