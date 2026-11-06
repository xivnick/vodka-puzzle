"""Roll back launch gates, real completion notifications and public equipped displays."""
import json,sys,uuid
from pathlib import Path
from urllib.error import HTTPError
from database import query
u1,u2=str(uuid.uuid4()),str(uuid.uuid4())
def jwt(uid):return json.dumps({'sub':uid,'role':'authenticated','app_metadata':{'provider':'google'}})
sql="BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='45s';\n"
if '--rehearse' in sys.argv:
 m=(Path(__file__).resolve().parent.parent/'supabase/migrations/20261106_cosmetic_release.sql').read_text()
 sql+=m.removeprefix('BEGIN;').rsplit('COMMIT;',1)[0]
sql+=r"""
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data) VALUES
 ('__U1__','authenticated','authenticated','release-__U1__@example.invalid','{"provider":"google"}'),
 ('__U2__','authenticated','authenticated','release-__U2__@example.invalid','{"provider":"google"}');
INSERT INTO public.semester_nicknames(season_id,user_id,nickname) SELECT active_season,v.u,v.n FROM public.semester_settings CROSS JOIN(VALUES('__U1__'::uuid,'__release_a'),('__U2__'::uuid,'__release_b'))v(u,n) WHERE id;
INSERT INTO public.puzzle_catalog(season_id,puzzle_id,title,summary,puzzle_type,status,published_at,difficulty) SELECT active_season,'__release_puzzle','fixture','fixture','test','published',clock_timestamp()-interval '1 day',1 FROM public.semester_settings WHERE id;
UPDATE private.cosmetic_settings SET enabled=true,history_policy='all_records',launched_at=clock_timestamp()+interval '1 day' WHERE id;
SET LOCAL ROLE anon;
DO $$ BEGIN
 IF public.cosmetic_release_context()->>'active'<>'false' THEN RAISE EXCEPTION 'Future launch active'; END IF;
 IF public.cosmetic_rank_displays('2026-2',ARRAY['__release_a'])<>'{}'::jsonb THEN RAISE EXCEPTION 'Future ranking exposed'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','__JWT1__',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.cosmetic_context();RAISE EXCEPTION 'Future access allowed';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'COSMETICS_DISABLED' THEN RAISE;END IF;END;
END $$;
-- Existing completion behavior remains available before launch, with no new toast.
DO $$ DECLARE a jsonb;b jsonb;BEGIN
 a:=public.submit_completion('__release_puzzle','{"version":1}',1);b:=public.submit_completion('__release_puzzle','{"version":1}',1);
 IF a<>b OR a ? 'achievement_notifications' THEN RAISE EXCEPTION 'Prelaunch completion changed';END IF;
END $$;
RESET ROLE;
INSERT INTO private.cosmetic_test_accounts(user_id) VALUES('__U2__');
SELECT set_config('request.jwt.claims','__JWT2__',true);
SET LOCAL ROLE authenticated;
SELECT public.cosmetic_context();
RESET ROLE;
DELETE FROM private.cosmetic_test_accounts WHERE user_id='__U2__';
-- The same wall-clock predicate becomes true without a worker or cron job.
UPDATE private.cosmetic_settings SET launched_at=clock_timestamp()-interval '1 minute' WHERE id;
SET LOCAL ROLE anon;
DO $$ BEGIN IF public.cosmetic_release_context()->>'active'<>'true' THEN RAISE EXCEPTION 'Due launch inactive'; END IF; END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','__JWT2__',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE a jsonb;b jsonb;BEGIN
 a:=public.submit_completion('__release_puzzle','{"version":1}',1);b:=public.submit_completion('__release_puzzle','{"version":1}',1);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(a->'achievement_notifications')n WHERE n->>'id'='first') THEN RAISE EXCEPTION 'Normal mission toast missing';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(a->'achievement_notifications')n WHERE n->>'id'='first-blood') THEN RAISE EXCEPTION 'Second solver got first blood';END IF;
 IF a->>'completed_at' IS DISTINCT FROM b->>'completed_at' OR b ? 'achievement_notifications' THEN RAISE EXCEPTION 'Duplicate notified or changed record';END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','__JWT1__',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE a jsonb;b jsonb;BEGIN
 a:=public.record_site_visit(gen_random_uuid());b:=public.record_site_visit(gen_random_uuid());
 IF jsonb_array_length(a->'daily_task_notifications')<>1 OR jsonb_array_length(b->'daily_task_notifications')<>0 THEN RAISE EXCEPTION 'Attendance notice missing or duplicated';END IF;
END $$;
RESET ROLE;
-- New puzzle, same original completion API and first-place guarantee.
INSERT INTO public.puzzle_catalog(season_id,puzzle_id,title,summary,puzzle_type,status,published_at,difficulty) SELECT active_season,'__release_second','fixture','fixture','test','published',clock_timestamp()-interval '1 day',1 FROM public.semester_settings WHERE id;
SELECT set_config('request.jwt.claims','__JWT2__',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE a jsonb;BEGIN
 a:=public.submit_completion('__release_second','{"version":1}',1);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(a->'achievement_notifications')n WHERE n->>'id'='first-blood' AND n->>'threshold'='1') THEN RAISE EXCEPTION 'First blood toast missing';END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','__JWT1__',true);
SET LOCAL ROLE authenticated;
SELECT public.claim_achievement(gen_random_uuid(),'first','season:2026-2',1);
RESET ROLE;
INSERT INTO private.cosmetic_inventory(user_id,item_id,item_kind,quantity) VALUES('__U1__','rare:r-berry','rare_color',1),('__U1__','effect:ribbon','effect',1);
SET LOCAL ROLE authenticated;
DO $$ DECLARE a jsonb;v bigint;BEGIN
 v:=(public.cosmetic_context()->'state'->'equipment'->>'equipment_version')::bigint;
 a:=public.set_cosmetic_equipment(v,'{"icon_id":"icon:leaf","color_id":"rare:r-berry","effect_id":"effect:ribbon","expression":"split","direction":"vertical","reversed":true}');
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(a->'achievement_notifications')n WHERE n->>'id'='feature-equip-icon') THEN RAISE EXCEPTION 'Equip toast missing'; END IF;
 PERFORM public.claim_achievement(gen_random_uuid(),'feature-equip-icon','account',1);
 v:=(a->'state'->'equipment'->>'equipment_version')::bigint;
 PERFORM public.set_cosmetic_equipment(v,'{}');
 v:=(public.cosmetic_context()->'state'->'equipment'->>'equipment_version')::bigint;
 a:=public.set_cosmetic_equipment(v,'{"icon_id":"icon:leaf","color_id":"rare:r-berry","effect_id":"effect:ribbon","expression":"split","direction":"vertical","reversed":true}');
 IF jsonb_array_length(a->'achievement_notifications')<>0 THEN RAISE EXCEPTION 'Claimed equip milestone notified again';END IF;

END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ DECLARE d jsonb;BEGIN
 d:=public.cosmetic_rank_displays('2026-2',ARRAY['__release_a','__release_b']);
 IF d->'__release_a'->>'mission'<>'반가워요' OR d->'__release_a'->>'effect'<>'ribbon' OR d->'__release_a'->>'direction'<>'vertical' OR d->'__release_a'->>'reversed'<>'true' THEN RAISE EXCEPTION 'Equipped display mismatch';END IF;
 IF d ? '__release_b' OR d::text LIKE '%__U1__%' OR d::text LIKE '%balance%' THEN RAISE EXCEPTION 'Private account data exposed';END IF;
 IF public.cosmetic_rank_displays('2026-1',ARRAY['__release_a'])<>'{}'::jsonb THEN RAISE EXCEPTION 'Other season exposed'; END IF;
END $$;
RESET ROLE;
-- Current all-clear eligibility is computed for each equipped account, not caller.
INSERT INTO public.semester_completions(season_id,puzzle_id,user_id,nickname,completed_at) SELECT p.season_id,p.puzzle_id,'__U1__','__release_a',clock_timestamp() FROM public.puzzle_catalog p JOIN public.semester_settings s ON s.id AND s.active_season=p.season_id WHERE p.status='published' AND p.published_at<=statement_timestamp() ON CONFLICT DO NOTHING;
SET LOCAL ROLE authenticated;
SELECT public.set_all_clear_effect((public.cosmetic_context()->'state'->'equipment'->>'equipment_version')::bigint,true);
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN IF public.cosmetic_rank_displays('2026-2',ARRAY['__release_a'])->'__release_a'->>'sparkle'<>'true' THEN RAISE EXCEPTION 'Public all-clear missing'; END IF;END $$;
RESET ROLE;
INSERT INTO public.puzzle_catalog(season_id,puzzle_id,title,summary,puzzle_type,status,published_at,difficulty) SELECT active_season,'__release_new','fixture','fixture','test','published',clock_timestamp()-interval '1 day',0 FROM public.semester_settings WHERE id;
SET LOCAL ROLE anon;
DO $$ BEGIN IF public.cosmetic_rank_displays('2026-2',ARRAY['__release_a'])->'__release_a'->>'sparkle'<>'false' THEN RAISE EXCEPTION 'New puzzle did not hide public all-clear'; END IF;END $$;
RESET ROLE;
-- Daily streak notification uses the existing six days, not a launch reset.
INSERT INTO public.daily_sudoku_completions(day,user_id,season_id,nickname,rank,completed_at)
 SELECT d::date,'__U2__','2026-2','__release_b',coalesce((SELECT max(rank)+1 FROM public.daily_sudoku_completions x WHERE x.day=d::date),1),d
 FROM generate_series(((statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date-6)::timestamp,((statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date-1)::timestamp,interval '1 day')d;
SELECT set_config('request.jwt.claims','__JWT2__',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE a jsonb;BEGIN
 a:=public.submit_completion('daily-sudoku:'||(statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date::text,'{"version":1}',1);
 IF NOT (a ? 'rank') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(a->'achievement_notifications')n WHERE n->>'id'='daily' AND n->>'threshold'='7') THEN RAISE EXCEPTION 'Daily streak notification missing';END IF;
END $$;
RESET ROLE;
-- Opening a third distinct past day notifies once and preserves ticket semantics.
SELECT set_config('request.jwt.claims','__JWT1__',true);
SELECT private.ensure_time_machine_wallet();
INSERT INTO private.time_machine_openings(user_id,day) SELECT '__U1__',day FROM public.daily_sudoku WHERE day>='2026-09-19' AND day<(statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date ORDER BY day LIMIT 2;
SET LOCAL ROLE authenticated;
DO $$ DECLARE a jsonb;b jsonb;d date;BEGIN
 SELECT day INTO d FROM public.daily_sudoku WHERE day>='2026-09-19' AND day<(statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date ORDER BY day OFFSET 2 LIMIT 1;
 a:=public.open_time_machine(d);b:=public.open_time_machine(d);
 IF a->>'charged'<>'true' OR b->>'charged'<>'false' OR a->>'tickets' IS DISTINCT FROM b->>'tickets' THEN RAISE EXCEPTION 'Opening ticket behavior changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(a->'achievement_notifications')n WHERE n->>'id'='time-traveler' AND n->>'threshold'='3') OR b ? 'achievement_notifications' THEN RAISE EXCEPTION 'Time traveler notification missing or duplicated'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.puzzle_first_finishers WHERE season_id='2026-2' AND puzzle_id='__release_puzzle' AND user_id='__U1__') THEN RAISE EXCEPTION 'Original first finisher not preserved';END IF;
 IF has_function_privilege('anon','private.cosmetics_public_enabled()','EXECUTE') THEN RAISE EXCEPTION 'Private helper exposed';END IF;
END $$;
SELECT 'future/due launch, allowlist, unchanged prelaunch completions, normal/daily/first/equip notifications, duplicate silence, public selected-only display, orientation, live all-clear and permissions: passed' AS result;
ROLLBACK;
"""
sql=sql.replace('__U1__',u1).replace('__U2__',u2).replace('__JWT1__',jwt(u1)).replace('__JWT2__',jwt(u2))
try:print(query(sql))
except HTTPError as error:print(error.read().decode());raise SystemExit(1)
