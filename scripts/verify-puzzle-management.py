"""Verify catalog management and publication permissions in a rolled-back transaction."""
import json, sys, uuid
from pathlib import Path
from database import query

admin, player = str(uuid.uuid4()), str(uuid.uuid4())
def claims(user):
    return json.dumps({'sub':user,'role':'authenticated','app_metadata':{'provider':'google'}})

sql=f"""
BEGIN;
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data) VALUES
 ('{admin}','authenticated','authenticated','admin-{admin}@example.invalid','{{"provider":"google"}}'),
 ('{player}','authenticated','authenticated','player-{player}@example.invalid','{{"provider":"google"}}');
INSERT INTO private.puzzle_admins(user_id) VALUES('{admin}');
INSERT INTO public.puzzle_catalog(season_id,puzzle_id,title,summary,puzzle_type,status,published_at) VALUES
 ('2026-2','__catalog_test','test','summary','test','test',NULL),
 ('2026-2','__catalog_future','future','summary','test','published',now()+interval '1 day'),
 ('2026-2','__catalog_draft','draft','summary','test','draft',NULL);
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{{"role":"anon"}}',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.list_puzzles('2026-2')) p WHERE p->>'id' LIKE '__catalog_%') THEN RAISE EXCEPTION 'Unpublished puzzle listed'; END IF;
 IF (public.puzzle_details('2026-2','__catalog_test')->>'published')::boolean THEN RAISE EXCEPTION 'Test unexpectedly published'; END IF;
 IF (public.puzzle_details('2026-2','__catalog_future')->>'published')::boolean THEN RAISE EXCEPTION 'Scheduled puzzle prematurely available'; END IF;
 BEGIN PERFORM * FROM public.admin_list_puzzles('2026-2'); RAISE EXCEPTION 'Anonymous admin access'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM public.puzzle_catalog; RAISE EXCEPTION 'Catalog directly exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{claims(player)}',true);
INSERT INTO public.semester_nicknames(season_id,user_id,nickname) VALUES('2026-2','{player}','__catalog_player');
DO $$ BEGIN
 IF public.is_puzzle_admin() THEN RAISE EXCEPTION 'Player is admin'; END IF;
 BEGIN PERFORM * FROM public.admin_list_puzzles('2026-2'); RAISE EXCEPTION 'Player listed admin catalog'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ADMIN_REQUIRED' THEN RAISE; END IF; END;
 BEGIN PERFORM public.admin_update_puzzle('2026-2','__catalog_test','test','summary','test','published',now(),0,now()); RAISE EXCEPTION 'Player modified catalog'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ADMIN_REQUIRED' THEN RAISE; END IF; END;
 BEGIN PERFORM public.submit_completion('__catalog_test','{{"version":1}}',1); RAISE EXCEPTION 'Test submission accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'UNAVAILABLE' THEN RAISE; END IF; END;
 BEGIN PERFORM public.submit_completion('__catalog_future','{{"version":1}}',1); RAISE EXCEPTION 'Future submission accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'UNAVAILABLE' THEN RAISE; END IF; END;
 BEGIN INSERT INTO public.semester_progress(season_id,user_id,nickname,puzzle_id,state) VALUES('2026-2','{player}','__catalog_player','__catalog_test','{{}}'); RAISE EXCEPTION 'Test cloud save accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.puzzle_catalog SET status='published' WHERE puzzle_id='__catalog_test'; RAISE EXCEPTION 'Direct catalog update accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM private.puzzle_admins; RAISE EXCEPTION 'Player read admin list'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claims','{claims(admin)}',true);
DO $$ DECLARE p public.puzzle_catalog; changed public.puzzle_catalog; BEGIN
 IF NOT public.is_puzzle_admin() THEN RAISE EXCEPTION 'Admin authorization failed'; END IF;
 SELECT * INTO p FROM public.admin_list_puzzles('2026-2') WHERE puzzle_id='__catalog_test';
 changed:=public.admin_update_puzzle('2026-2','__catalog_test','renamed','new summary','test','published',now()-interval '1 minute',4,p.updated_at);
 IF changed.title<>'renamed' OR changed.updated_at=p.updated_at OR NOT public.is_puzzle_published('2026-2','__catalog_test') THEN RAISE EXCEPTION 'Publication/update failed'; END IF;
 BEGIN PERFORM public.admin_update_puzzle('2026-2','__catalog_test','stale','summary','test','test',NULL,0,p.updated_at); RAISE EXCEPTION 'Stale edit accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'EDIT_CONFLICT' THEN RAISE; END IF; END;
 BEGIN PERFORM public.admin_update_puzzle('2026-2','__catalog_test','renamed','','test','published',now(),0,changed.updated_at); RAISE EXCEPTION 'Empty summary accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_METADATA' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claims','{claims(player)}',true);
SELECT public.submit_completion('__catalog_test','{{"version":1}}',1);
INSERT INTO public.semester_progress(season_id,user_id,nickname,puzzle_id,state) VALUES('2026-2','{player}','__catalog_player','__catalog_test','{{"version":1}}');
SELECT set_config('request.jwt.claims','{claims(admin)}',true);
DO $$ DECLARE p public.puzzle_catalog; BEGIN
 SELECT * INTO p FROM public.admin_list_puzzles('2026-2') WHERE puzzle_id='__catalog_test';
 PERFORM public.admin_update_puzzle('2026-2','__catalog_test',p.title,p.summary,p.puzzle_type,'test',p.published_at,p.sort_order,p.updated_at);
END $$;
SELECT set_config('request.jwt.claims','{claims(player)}',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.semester_completions WHERE puzzle_id='__catalog_test') THEN RAISE EXCEPTION 'Hidden completion readable'; END IF;
 IF EXISTS(SELECT 1 FROM public.semester_progress WHERE puzzle_id='__catalog_test') THEN RAISE EXCEPTION 'Hidden progress readable'; END IF;
 IF EXISTS(SELECT 1 FROM public.recent_completions() WHERE puzzle_id='__catalog_test') THEN RAISE EXCEPTION 'Hidden completion in banner'; END IF;
 BEGIN UPDATE public.semester_progress SET state='{{"updated":true}}' WHERE puzzle_id='__catalog_test'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.semester_completions WHERE puzzle_id='__catalog_test' AND user_id='{player}') THEN RAISE EXCEPTION 'Hidden completion deleted'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.puzzle_catalog_audit WHERE actor_id='{admin}' AND after_record->>'puzzle_id'='__catalog_test' AND after_record->>'status'='published') THEN RAISE EXCEPTION 'Admin audit missing'; END IF;
 IF EXISTS(SELECT 1 FROM public.semester_progress WHERE puzzle_id='__catalog_test' AND state ? 'updated') THEN RAISE EXCEPTION 'Hidden progress modified'; END IF;
END $$;
SELECT 'catalog permissions, scheduled release, completion/cloud gates, stale edits, retained records, audit: passed' AS result;
ROLLBACK;
"""
if '--rehearse' in sys.argv:
    migration=(Path(__file__).resolve().parent.parent/'supabase/migrations/20261001_puzzle_management.sql').read_text()
    sql=migration.rsplit('COMMIT;',1)[0]+sql.removeprefix('\nBEGIN;')
try:
    print(query(sql))
except __import__('urllib.error',fromlist=['HTTPError']).HTTPError as error:
    print(error.read().decode());raise SystemExit(1)
