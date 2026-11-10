"""Verify the one-time Pepero reward with rollback-only account records."""
import json
import sys
import uuid
from pathlib import Path
from database import query

uid = str(uuid.uuid4())
claims = json.dumps({'sub': uid, 'role': 'authenticated', 'app_metadata': {'provider': 'google'}})
sql = f"""BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s';
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data)
 VALUES('{uid}','authenticated','authenticated','pepero-{uid}@example.invalid','{{"provider":"google"}}');
INSERT INTO public.semester_nicknames(season_id,user_id,nickname) VALUES('2026-2','{uid}','__pepero_check');
SELECT set_config('request.jwt.claims','{claims}',true);
-- These precede the new rule to check retroactive eligibility, including an unrelated puzzle.
INSERT INTO public.semester_completions(season_id,user_id,nickname,puzzle_id,completed_at) VALUES
 ('2026-2','{uid}','__pepero_check','261111_01',clock_timestamp()-interval '1 minute'),
 ('2026-2','{uid}','__pepero_check','261109_01',clock_timestamp()-interval '1 minute');
CREATE TEMP TABLE previous_achievements AS SELECT private.achievement_rows('2026-2') AS rows;
"""
if '--rehearse' in sys.argv:
    migration = (Path(__file__).resolve().parent.parent / 'supabase/migrations/20261111_pepero_achievement.sql').read_text()
    start = migration.index('BEGIN;') + len('BEGIN;')
    sql += migration[start:].rsplit('COMMIT;', 1)[0]
sql += r"""
CREATE FUNCTION pg_temp.expect_error(command text, expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN
  IF SQLERRM=expected THEN RETURN; END IF;
  RAISE EXCEPTION 'Expected %, got %',expected,SQLERRM;
 END;
 RAISE EXCEPTION 'Expected error %',expected;
END $$;
CREATE FUNCTION pg_temp.check_pepero(current_value bigint, ready text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE row_data jsonb;
BEGIN
 SELECT value INTO row_data FROM jsonb_array_elements(public.achievement_context()->'achievements') WHERE value->>'id'='pepero';
 IF row_data IS NULL OR row_data->>'name'<>'빼빼로데이' OR row_data->>'category'<>'special'
  OR (row_data->>'current')::bigint IS DISTINCT FROM current_value OR row_data->>'state' IS DISTINCT FROM ready
  OR row_data->>'active'<>'true' OR row_data->>'configured'<>'true'
  OR (ready<>'completed' AND ((row_data->>'threshold')::bigint IS DISTINCT FROM 1 OR row_data->'reward'<>'{"item_id":"icon:pepero"}'::jsonb))
  OR (ready='completed' AND row_data->>'threshold' IS NOT NULL) THEN RAISE EXCEPTION 'Unexpected Pepero state: %',row_data; END IF;
END $$;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM (SELECT value FROM jsonb_array_elements((SELECT rows FROM previous_achievements)) WHERE value->>'id'<>'pepero') old
  FULL JOIN (SELECT value FROM jsonb_array_elements(private.achievement_rows('2026-2')) WHERE value->>'id'<>'pepero') new USING(value)
  WHERE old.value IS NULL OR new.value IS NULL) THEN RAISE EXCEPTION 'Existing achievements changed'; END IF;
 IF (SELECT count(*) FROM private.achievement_puzzle_bindings WHERE achievement_id='pepero')<>1 OR
  NOT EXISTS(SELECT 1 FROM private.achievement_puzzle_bindings WHERE achievement_id='pepero' AND season_id='2026-2' AND puzzle_id='261111_01') THEN RAISE EXCEPTION 'Wrong binding'; END IF;
 IF (SELECT count(*) FROM private.achievement_stage_rewards WHERE achievement_id='pepero')<>1 OR
  EXISTS(SELECT 1 FROM private.achievement_rules WHERE id='pepero' AND (repeat_every IS NOT NULL OR account_scope OR first_goal<>1)) THEN RAISE EXCEPTION 'Unexpected extra/repeat rewards'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.cosmetic_items WHERE id='icon:pepero' AND active AND kind='icon' AND definition->>'src'='/icons/achievement-preview/number-11.svg') THEN RAISE EXCEPTION 'Wrong icon'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.check_pepero(1,'claimable');
RESET ROLE;
UPDATE public.semester_completions SET excluded=true WHERE user_id='__UID__' AND puzzle_id='261111_01';
SET LOCAL ROLE authenticated;
SELECT pg_temp.check_pepero(0,'in_progress');
SELECT pg_temp.expect_error($q$SELECT public.claim_achievement(gen_random_uuid(),'pepero','season:2026-2',1)$q$,'ACHIEVEMENT_NOT_READY');
RESET ROLE;
UPDATE public.semester_completions SET excluded=false WHERE user_id='__UID__' AND puzzle_id='261111_01';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(private.achievement_milestone_diff('{"pepero":0}','{"pepero":1}')) n WHERE n->>'id'='pepero' AND n->>'threshold'='1') THEN RAISE EXCEPTION 'Missing completion notification'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.check_pepero(1,'claimable');
SELECT pg_temp.expect_error($q$SELECT public.claim_achievement(gen_random_uuid(),'pepero','season:2026-1',1)$q$,'INVALID_STAGE');
DO $$ DECLARE req uuid:=gen_random_uuid(); result jsonb; before_coins bigint; BEGIN
 before_coins:=(public.cosmetic_context()->'state'->>'coins')::bigint;
 result:=public.claim_achievement(req,'pepero','season:2026-2',1);
 IF result->'reward'<>'{"item_id":"icon:pepero"}'::jsonb OR result->'award'->'definition'->>'src'<>'/icons/achievement-preview/number-11.svg' THEN RAISE EXCEPTION 'Icon reward mismatch'; END IF;
 IF result<>public.claim_achievement(req,'pepero','season:2026-2',1) THEN RAISE EXCEPTION 'Replay mismatch'; END IF;
 IF public.claim_achievement(gen_random_uuid(),'pepero','season:2026-2',1)->>'already_claimed'<>'true' THEN RAISE EXCEPTION 'Duplicate reward'; END IF;
 IF (public.cosmetic_context()->'state'->>'coins')::bigint<>before_coins THEN RAISE EXCEPTION 'Unexpected coin change'; END IF;
END $$;
SELECT pg_temp.check_pepero(1,'completed');
SELECT pg_temp.expect_error($q$SELECT public.claim_achievement(gen_random_uuid(),'pepero','season:2026-2',2)$q$,'INVALID_STAGE');
SELECT public.set_cosmetic_equipment((public.cosmetic_context()->'state'->'equipment'->>'equipment_version')::bigint,
 '{"icon_id":"icon:pepero","color_id":null,"effect_id":null,"expression":"gradient","direction":"diagonal","reversed":false}');
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM private.mission_claims WHERE user_id='__UID__' AND mission_id='pepero')<>1 THEN RAISE EXCEPTION 'Claim count'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.cosmetic_inventory WHERE user_id='__UID__' AND item_id='icon:pepero' AND quantity=1) THEN RAISE EXCEPTION 'Icon inventory'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.cosmetic_equipment WHERE user_id='__UID__' AND icon_id='icon:pepero') THEN RAISE EXCEPTION 'Icon equipment'; END IF;
END $$;
ROLLBACK;
SELECT 'Pepero: retrospective progress, exact binding, exclusions, category, one-time reward, replay, notification and equipment passed; fixtures rolled back' AS result;
""".replace('__UID__', uid)
result = query(sql)
print(json.dumps(result[-1:], ensure_ascii=False))
