"""Exercise submission RPCs, RLS and publication in a rolled-back transaction.
--rehearse includes the pending schema migration and rolls it back too.
"""
import json,uuid,sys
from pathlib import Path
from database import query
u1,u2=str(uuid.uuid4()),str(uuid.uuid4())
def claims(uid): return json.dumps({'sub':uid,'role':'authenticated','app_metadata':{'provider':'google'}})
sql=f"""
BEGIN;
INSERT INTO public.daily_sudoku(day,opens_at,givens)
VALUES((clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date,((clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date+time '00:00') AT TIME ZONE 'Asia/Seoul',repeat('0',81)) ON CONFLICT DO NOTHING;
INSERT INTO private.daily_sudoku(day,opens_at,givens,techniques)
VALUES(date '2000-01-01',timestamptz '2000-01-01T00:00:00+09:00',repeat('0',81),'{{}}') ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data) VALUES
('{u1}','authenticated','authenticated','completion-a-{u1}@example.invalid','{{"provider":"google"}}'),
('{u2}','authenticated','authenticated','completion-b-{u2}@example.invalid','{{"provider":"google"}}');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{claims(u1)}',true);
INSERT INTO public.semester_nicknames(season_id,user_id,nickname) SELECT active_season,'{u1}','__completion_a' FROM public.semester_settings WHERE id;
DO $$ DECLARE first jsonb; again jsonb; day date:=(clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date; BEGIN
 first:=public.submit_completion('260916_01','{{"version":1,"rects":[]}}',1);
 again:=public.submit_completion('260916_01','{{"version":1,"rects":[{{"r0":0}}]}}',1);
 IF first<>again THEN RAISE EXCEPTION 'Duplicate changed completion'; END IF;
 first:=public.submit_completion('daily-sudoku:' || day::text,'{{"values":[1]}}',1);
 again:=public.submit_completion('daily-sudoku:' || day::text,'{{"values":[2]}}',1);
 IF first<>again THEN RAISE EXCEPTION 'Daily duplicate changed completion'; END IF;
 BEGIN PERFORM public.submit_completion('__preview','{{}}',1); RAISE EXCEPTION 'Unlisted puzzle accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'UNAVAILABLE' THEN RAISE; END IF; END;
 BEGIN PERFORM public.submit_completion('daily-sudoku:' || (day-1)::text,'{{}}',1); RAISE EXCEPTION 'Closed day accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CLOSED' THEN RAISE; END IF; END;
 BEGIN PERFORM public.submit_completion('daily-sudoku:' || (day+1)::text,'{{}}',1); RAISE EXCEPTION 'Future day accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CLOSED' THEN RAISE; END IF; END;
 BEGIN PERFORM public.submit_completion('260917_01','[]',1); RAISE EXCEPTION 'Invalid state accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_STATE' THEN RAISE; END IF; END;
 BEGIN INSERT INTO public.semester_completions(season_id,user_id,nickname,puzzle_id) VALUES('2026-2','{u1}','__completion_a','__direct'); RAISE EXCEPTION 'Direct completion accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM public.completion_submissions; RAISE EXCEPTION 'Snapshot exposed to player'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM public.save_daily_sudoku_progress(day,'{{"values":[1]}}');
 END $$;
INSERT INTO public.semester_progress(season_id,user_id,nickname,puzzle_id,state) SELECT active_season,'{u1}','__completion_a','260916_01','{{"n":1}}' FROM public.semester_settings WHERE id;
UPDATE public.semester_nicknames SET nickname='__completion_renamed' WHERE user_id='{u1}';
SELECT set_config('request.jwt.claims','{claims(u2)}',true);
INSERT INTO public.semester_nicknames(season_id,user_id,nickname) SELECT active_season,'{u2}','__completion_b' FROM public.semester_settings WHERE id;
DO $$ DECLARE d date:=(clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date; ctx jsonb; mine jsonb; old_rank bigint; BEGIN
 IF EXISTS(SELECT 1 FROM public.semester_progress WHERE user_id='{u1}') OR EXISTS(SELECT 1 FROM public.daily_sudoku_progress WHERE user_id='{u1}') THEN RAISE EXCEPTION 'Other progress exposed'; END IF;
 BEGIN INSERT INTO public.completion_submissions VALUES('2026-2','{u1}','__forged',1,'{{}}',now()); RAISE EXCEPTION 'Forged snapshot accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 mine:=public.submit_daily_sudoku(d,repeat('1',81));ctx:=public.daily_sudoku_context(d);
 SELECT (r->>'rank')::bigint INTO old_rank FROM jsonb_array_elements(ctx->'rankings') r WHERE r->>'nickname'='__completion_renamed';
 IF (mine->>'rank')::bigint<>old_rank+1 OR old_rank IS NULL THEN RAISE EXCEPTION 'Daily rank/rename failed'; END IF;
 END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT state FROM public.completion_submissions WHERE user_id='{u1}' AND puzzle_id='260916_01')<>'{{"version":1,"rects":[]}}'::jsonb THEN RAISE EXCEPTION 'First snapshot changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.daily_sudoku WHERE day=date '2000-01-01') OR EXISTS(SELECT 1 FROM private.daily_sudoku WHERE opens_at<=now()) THEN RAISE EXCEPTION 'Opened puzzle not moved'; END IF;
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='daily_sudoku' AND column_name='solution') THEN RAISE EXCEPTION 'Solution exposed'; END IF;
 END $$;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{{"role":"anon"}}',true);
DO $$ DECLARE ctx jsonb; BEGIN
 ctx:=public.daily_sudoku_context((clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date+1);
 IF (ctx->>'available')::boolean OR ctx->>'givens' IS NOT NULL OR jsonb_array_length(ctx->'rankings')<>0 THEN RAISE EXCEPTION 'Future exposed'; END IF;
 IF (SELECT count(*) FROM public.recent_completions())<>3 THEN RAISE EXCEPTION 'Banner limit'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.recent_completions() WHERE nickname='__completion_renamed') THEN RAISE EXCEPTION 'Renamed banner missing'; END IF;
 BEGIN PERFORM * FROM public.completion_submissions; RAISE EXCEPTION 'Anonymous snapshot exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM public.daily_sudoku_completions; RAISE EXCEPTION 'Daily account IDs exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM private.daily_sudoku; RAISE EXCEPTION 'Queue exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.submit_completion('260916_01','{{}}',1); RAISE EXCEPTION 'Guest submission accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END $$;
RESET ROLE;
UPDATE public.daily_sudoku_completions SET excluded=true WHERE user_id='{u2}';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.daily_sudoku_context(NULL)->'rankings') r WHERE r->>'nickname'='__completion_b') OR EXISTS(SELECT 1 FROM public.recent_completions() WHERE nickname='__completion_b') THEN RAISE EXCEPTION 'Excluded completion visible'; END IF;
 END $$;
DELETE FROM auth.users WHERE id='{u1}';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.completion_submissions WHERE user_id='{u1}') OR EXISTS(SELECT 1 FROM public.daily_sudoku_completions WHERE user_id='{u1}') OR EXISTS(SELECT 1 FROM public.semester_completions WHERE user_id='{u1}') OR EXISTS(SELECT 1 FROM public.daily_sudoku_progress WHERE user_id='{u1}') THEN RAISE EXCEPTION 'Delete cascade failed'; END IF;
 END $$;
SELECT 'completion snapshots, duplicates, ranks, publication, RLS, moderation, deletion: passed' AS result;
ROLLBACK;
"""
if '--rehearse' in sys.argv:
 migration=(Path(__file__).resolve().parent.parent/'supabase/migrations/20260917_completion_states.sql').read_text()
 sql=migration.rsplit('COMMIT;',1)[0]+sql.removeprefix('\nBEGIN;')
try:
 print(query(sql))
except __import__('urllib.error',fromlist=['HTTPError']).HTTPError as error:
 print(error.read().decode());raise SystemExit(1)
