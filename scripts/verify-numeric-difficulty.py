"""Verify numeric difficulty conversion, admin RPCs and public JSON in a rollback."""
import json
import sys
import uuid
from pathlib import Path
from urllib.error import HTTPError
from database import query

user = str(uuid.uuid4())
claims = json.dumps({'sub': user, 'role': 'authenticated', 'app_metadata': {'provider': 'google'}})
sql = 'BEGIN;\n'
if '--rehearse' in sys.argv:
    sql += """
    CREATE TEMP TABLE difficulty_before AS SELECT season_id,puzzle_id,to_jsonb(p)-'difficulty' AS unchanged,
     CASE lower(btrim(difficulty)) WHEN '하' THEN 1 WHEN '쉬움' THEN 1 WHEN 'easy' THEN 1 WHEN '1' THEN 1
      WHEN '중' THEN 2 WHEN '중간' THEN 2 WHEN '보통' THEN 2 WHEN 'medium' THEN 2 WHEN '2' THEN 2
      WHEN '상' THEN 3 WHEN '어려움' THEN 3 WHEN 'hard' THEN 3 WHEN '3' THEN 3 ELSE 0 END AS expected FROM public.puzzle_catalog p;
    """
    migration = (Path(__file__).resolve().parent.parent / 'supabase/migrations/20261105_numeric_difficulty.sql').read_text()
    sql += migration.removeprefix('BEGIN;').rsplit('COMMIT;', 1)[0]
    sql += """
    DO $$ BEGIN
     IF EXISTS(SELECT 1 FROM difficulty_before b FULL JOIN public.puzzle_catalog p USING(season_id,puzzle_id)
      WHERE p.puzzle_id IS NULL OR b.puzzle_id IS NULL OR b.unchanged IS DISTINCT FROM to_jsonb(p)-'difficulty' OR p.difficulty IS DISTINCT FROM b.expected)
      THEN RAISE EXCEPTION 'Conversion changed unrelated metadata or difficulty mapping'; END IF;
    END $$;
    """
sql += r"""
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data) VALUES('__USER__','authenticated','authenticated','difficulty-__USER__@example.invalid','{"provider":"google"}');
INSERT INTO private.puzzle_admins(user_id) VALUES('__USER__');
INSERT INTO public.puzzle_catalog(season_id,puzzle_id,title,summary,puzzle_type,status)
 VALUES('2026-2','__numeric_difficulty','test','summary','test','test');
SELECT set_config('request.jwt.claims','__CLAIMS__',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE p public.puzzle_catalog; old_time timestamptz; i integer; BEGIN
 SELECT * INTO p FROM public.admin_list_puzzles('2026-2') WHERE puzzle_id='__numeric_difficulty';
 IF p.difficulty<>0 THEN RAISE EXCEPTION 'Default is not zero'; END IF;
 FOR i IN 0..3 LOOP
  old_time:=p.updated_at;
  p:=public.admin_update_puzzle(p.season_id,p.puzzle_id,p.title,p.summary,p.puzzle_type,p.status,p.published_at,p.sort_order,p.updated_at,i);
  IF p.difficulty<>i THEN RAISE EXCEPTION 'Admin did not save numeric %',i; END IF;
 END LOOP;
 BEGIN
  PERFORM public.admin_update_puzzle(p.season_id,p.puzzle_id,p.title,p.summary,p.puzzle_type,p.status,p.published_at,p.sort_order,p.updated_at,4);
  RAISE EXCEPTION 'Admin accepted 4';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_METADATA' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.admin_update_puzzle(p.season_id,p.puzzle_id,p.title,p.summary,p.puzzle_type,p.status,p.published_at,p.sort_order,p.updated_at,NULL::integer);
  RAISE EXCEPTION 'Admin accepted NULL';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_METADATA' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.admin_update_puzzle(p.season_id,p.puzzle_id,p.title,p.summary,p.puzzle_type,p.status,p.published_at,p.sort_order,old_time,1);
  RAISE EXCEPTION 'Stale edit accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'EDIT_CONFLICT' THEN RAISE; END IF; END;
 p:=public.admin_update_puzzle(p.season_id,p.puzzle_id,p.title,p.summary,p.puzzle_type,p.status,p.published_at,p.sort_order,p.updated_at);
 IF p.difficulty<>3 THEN RAISE EXCEPTION 'Legacy metadata RPC changed difficulty'; END IF;
 p:=public.admin_update_puzzle(p.season_id,p.puzzle_id,p.title,p.summary,p.puzzle_type,'published',clock_timestamp()-interval '1 minute',p.sort_order,p.updated_at,3);
END $$;
SELECT set_config('request.jwt.claims','{"role":"authenticated","app_metadata":{"provider":"google"}}',true);
DO $$ BEGIN
 BEGIN
  PERFORM public.admin_update_puzzle('2026-2','__numeric_difficulty','test','summary','test','test',NULL,0,now(),1);
  RAISE EXCEPTION 'Non-admin saved difficulty';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ADMIN_REQUIRED' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
DO $$ DECLARE value jsonb; BEGIN
 SELECT x INTO value FROM jsonb_array_elements(public.list_puzzles('2026-2')) x WHERE x->>'id'='__numeric_difficulty';
 IF value->>'difficulty'<>'3' OR jsonb_typeof(value->'difficulty')<>'number' THEN RAISE EXCEPTION 'Public JSON difficulty is not numeric'; END IF;
 BEGIN
  UPDATE public.puzzle_catalog SET difficulty=4 WHERE puzzle_id='__numeric_difficulty'; RAISE EXCEPTION 'DB accepted 4';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  UPDATE public.puzzle_catalog SET difficulty=NULL WHERE puzzle_id='__numeric_difficulty'; RAISE EXCEPTION 'DB accepted NULL';
 EXCEPTION WHEN not_null_violation THEN NULL; END;
END $$;
SELECT 'numeric conversion, unchanged metadata, defaults, DB constraints, admin permissions, 0-3 saves, conflict protection, legacy RPC and public JSON: passed' AS result;
ROLLBACK;
"""
sql = sql.replace('__USER__', user).replace('__CLAIMS__', claims)
try:
    print(query(sql))
except HTTPError as error:
    print(error.read().decode())
    raise SystemExit(1)
