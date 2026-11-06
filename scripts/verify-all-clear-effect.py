"""Verify live eligibility and independent preference persistence in a rollback."""
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
    migration = (Path(__file__).resolve().parent.parent / 'supabase/migrations/20261106_all_clear_effect.sql').read_text()
    sql += migration.removeprefix('BEGIN;').rsplit('COMMIT;', 1)[0]
sql += r"""
UPDATE private.cosmetic_settings SET enabled=false,launched_at=NULL WHERE id;
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data)
 VALUES('__USER__','authenticated','authenticated','all-clear-__USER__@example.invalid','{"provider":"google"}');
INSERT INTO public.semester_nicknames(season_id,user_id,nickname)
 SELECT active_season,'__USER__','__all_clear' FROM public.semester_settings WHERE id;
SELECT set_config('request.jwt.claims','__CLAIMS__',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.set_all_clear_effect(0,true); RAISE EXCEPTION 'Disabled toggle allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'COSMETICS_DISABLED' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
UPDATE private.cosmetic_settings SET enabled=true WHERE id;
SET LOCAL ROLE authenticated;
DO $$ DECLARE ctx jsonb; BEGIN
 ctx:=public.achievement_context();
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(ctx->'achievements') r WHERE r->>'id'='all') THEN RAISE EXCEPTION 'All clear still a mission'; END IF;
 IF (ctx->'state'->'all_clear'->>'eligible')::boolean THEN RAISE EXCEPTION 'Empty account eligible'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.cosmetic_context()->'catalog') r WHERE r->>'id'='effect:sparkle') THEN RAISE EXCEPTION 'Ineligible effect exposed'; END IF;
 BEGIN PERFORM public.set_all_clear_effect(0,true); RAISE EXCEPTION 'Ineligible toggle allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ALL_CLEAR_REQUIRED' THEN RAISE; END IF; END;
 BEGIN PERFORM public.set_cosmetic_equipment(0,'{"effect_id":"effect:sparkle"}'); RAISE EXCEPTION 'Ordinary slot accepted all clear';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'USE_ALL_CLEAR_TOGGLE' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
-- New disposable user's source records only, not existing players' completions.
INSERT INTO public.semester_completions(season_id,puzzle_id,user_id,nickname,completed_at)
 SELECT p.season_id,p.puzzle_id,'__USER__','__all_clear',clock_timestamp()
 FROM public.puzzle_catalog p JOIN public.semester_settings s ON s.id AND s.active_season=p.season_id
 WHERE p.status='published' AND p.published_at<=statement_timestamp();
SET LOCAL ROLE authenticated;
DO $$ DECLARE ctx jsonb; v bigint; BEGIN
 ctx:=public.cosmetic_context();
 IF ctx->'state'->'all_clear'->>'eligible'<>'true' OR ctx->'state'->'all_clear'->>'enabled'<>'false' THEN RAISE EXCEPTION 'All clear unavailable or granted automatically'; END IF;
 ctx:=public.set_all_clear_effect(0,true);
 IF ctx->'state'->'all_clear'->>'active'<>'true' THEN RAISE EXCEPTION 'Basic color cannot use special effect'; END IF;
 v:=(ctx->'state'->'equipment'->>'equipment_version')::bigint;
 ctx:=public.set_cosmetic_equipment(v,'{}');
 IF ctx->'state'->'all_clear'->>'enabled'<>'true' THEN RAISE EXCEPTION 'Regular equipment erased preference'; END IF;
 BEGIN PERFORM public.set_all_clear_effect(0,false); RAISE EXCEPTION 'Stale toggle allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'EQUIPMENT_CHANGED' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
INSERT INTO public.puzzle_catalog(season_id,puzzle_id,title,summary,puzzle_type,status,published_at)
 SELECT active_season,'__all_clear_new','test','summary','test','test',NULL FROM public.semester_settings WHERE id;
DO $$ BEGIN
 IF private.all_clear_status()->>'active'<>'true' THEN RAISE EXCEPTION 'Test puzzle removed eligibility'; END IF;
END $$;
UPDATE public.puzzle_catalog SET status='published',published_at=clock_timestamp()+interval '1 day' WHERE puzzle_id='__all_clear_new';
DO $$ BEGIN
 IF private.all_clear_status()->>'active'<>'true' THEN RAISE EXCEPTION 'Future puzzle removed eligibility'; END IF;
END $$;
UPDATE public.puzzle_catalog SET published_at=clock_timestamp()-interval '1 minute' WHERE puzzle_id='__all_clear_new';
SET LOCAL ROLE authenticated;
DO $$ DECLARE ctx jsonb; BEGIN
 ctx:=public.cosmetic_context();
 IF ctx->'state'->'all_clear'->>'eligible'<>'false' OR ctx->'state'->'all_clear'->>'enabled'<>'true' OR ctx->'state'->'all_clear'->>'active'<>'false' THEN RAISE EXCEPTION 'Published puzzle did not suppress saved effect'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(ctx->'catalog') r WHERE r->>'id'='effect:sparkle') THEN RAISE EXCEPTION 'Lost eligibility still exposes effect'; END IF;
END $$;
RESET ROLE;
INSERT INTO public.semester_completions(season_id,puzzle_id,user_id,nickname,completed_at)
 SELECT active_season,'__all_clear_new','__USER__','__all_clear',clock_timestamp() FROM public.semester_settings WHERE id;
SET LOCAL ROLE authenticated;
DO $$ DECLARE ctx jsonb; v bigint; BEGIN
 ctx:=public.cosmetic_context();
 IF ctx->'state'->'all_clear'->>'active'<>'true' THEN RAISE EXCEPTION 'Regained eligibility did not restore preference'; END IF;
 v:=(ctx->'state'->'equipment'->>'equipment_version')::bigint;
 ctx:=public.set_all_clear_effect(v,false);
 IF ctx->'state'->'all_clear'->>'enabled'<>'false' OR ctx->'state'->'all_clear'->>'active'<>'false' THEN RAISE EXCEPTION 'Disable failed'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM private.mission_claims WHERE user_id='__USER__') OR EXISTS(SELECT 1 FROM private.account_operations WHERE user_id='__USER__')
 OR EXISTS(SELECT 1 FROM private.cosmetic_inventory WHERE user_id='__USER__' AND item_id='effect:sparkle') THEN RAISE EXCEPTION 'Toggle produced reward or equipment history'; END IF;
 IF has_function_privilege('anon','public.set_all_clear_effect(bigint,boolean)','EXECUTE') OR has_function_privilege('authenticated','private.all_clear_status()','EXECUTE') THEN RAISE EXCEPTION 'Unexpected permissions'; END IF;
END $$;
SELECT 'hidden mission, independent saved toggle, default color, live published set, regain eligibility, off preference, no claims/inventory/history: passed' AS result;
ROLLBACK;
"""
sql = sql.replace('__USER__', user).replace('__CLAIMS__', claims)
try:
    print(query(sql))
except HTTPError as error:
    print(error.read().decode())
    raise SystemExit(1)
