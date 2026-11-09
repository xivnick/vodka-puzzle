"""Verify Raid rewards against rollback-only account records; never solve puzzles."""
import json
import sys
import uuid
from pathlib import Path
from database import query

uid = str(uuid.uuid4())
claims = json.dumps({'sub': uid, 'role': 'authenticated', 'app_metadata': {'provider': 'google'}})
sql = "BEGIN; SET LOCAL statement_timeout='30s';\n"
sql += f"""
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data)
 VALUES('{uid}','authenticated','authenticated','raid-{uid}@example.invalid','{{"provider":"google"}}');
INSERT INTO public.semester_nicknames(season_id,user_id,nickname) VALUES('2026-2','{uid}','__raid_check');
SELECT set_config('request.jwt.claims','{claims}',true);
CREATE TEMP TABLE previous_achievements AS SELECT private.achievement_rows('2026-2') AS rows;
"""
if '--rehearse' in sys.argv:
    migration = (Path(__file__).resolve().parent.parent / 'supabase/migrations/20261109_sudoku_raid_achievement.sql').read_text()
    sql += migration.removeprefix('BEGIN;').rsplit('COMMIT;', 1)[0]
sql += r"""
CREATE FUNCTION pg_temp.expect_error(command text, expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN
  IF SQLERRM=expected THEN RETURN; END IF;
  RAISE EXCEPTION 'Expected %, got %',expected,SQLERRM;
 END;
 RAISE EXCEPTION 'Expected error %',expected;
END $$;
CREATE FUNCTION pg_temp.check_raid(count_value bigint, goal bigint, ready text, reward jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE row_data jsonb;
BEGIN
 SELECT value INTO row_data FROM jsonb_array_elements(public.achievement_context()->'achievements') WHERE value->>'id'='raid';
 IF row_data IS NULL OR (row_data->>'current')::bigint IS DISTINCT FROM count_value
  OR (row_data->>'threshold')::bigint IS DISTINCT FROM goal
  OR row_data->>'state' IS DISTINCT FROM ready OR row_data->'reward' IS DISTINCT FROM reward THEN
  RAISE EXCEPTION 'Unexpected Raid state: %',row_data;
 END IF;
END $$;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM (SELECT value FROM jsonb_array_elements((SELECT rows FROM previous_achievements)) WHERE value->>'id'<>'raid') old
  FULL JOIN (SELECT value FROM jsonb_array_elements(private.achievement_rows('2026-2')) WHERE value->>'id'<>'raid') new USING(value)
  WHERE old.value IS NULL OR new.value IS NULL) THEN RAISE EXCEPTION 'Existing achievements changed'; END IF;
 IF (SELECT count(*) FROM private.achievement_puzzle_bindings WHERE achievement_id='raid')<>10 THEN RAISE EXCEPTION 'Bindings'; END IF;
 IF EXISTS(SELECT 1 FROM private.achievement_rules WHERE id='raid' AND repeat_every IS NOT NULL) THEN RAISE EXCEPTION 'Unexpected repeat'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.check_raid(0,3,'in_progress','{"item_id":"icon:raid"}');
RESET ROLE;
INSERT INTO public.semester_completions(season_id,user_id,nickname,puzzle_id,completed_at)
 SELECT '2026-2','__UID__','__raid_check','261109_'||lpad(i::text,2,'0'),clock_timestamp() FROM generate_series(1,2) i;
SET LOCAL ROLE authenticated;
SELECT pg_temp.check_raid(2,3,'in_progress','{"item_id":"icon:raid"}');
SELECT pg_temp.expect_error($q$SELECT public.claim_achievement(gen_random_uuid(),'raid','season:2026-2',3)$q$,'ACHIEVEMENT_NOT_READY');
RESET ROLE;
INSERT INTO public.semester_completions(season_id,user_id,nickname,puzzle_id,completed_at)
 VALUES('2026-2','__UID__','__raid_check','261109_03',clock_timestamp());
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(private.achievement_milestone_diff('{"raid":2}','{"raid":3}')) n WHERE n->>'id'='raid' AND n->>'threshold'='3') THEN RAISE EXCEPTION 'Icon notification'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.check_raid(3,3,'claimable','{"item_id":"icon:raid"}');
SELECT public.claim_achievement(gen_random_uuid(),'raid','season:2026-2',3);
SELECT pg_temp.check_raid(3,10,'in_progress','{"coins":1000}');
RESET ROLE;
INSERT INTO public.semester_completions(season_id,user_id,nickname,puzzle_id,completed_at)
 SELECT '2026-2','__UID__','__raid_check','261109_'||lpad(i::text,2,'0'),clock_timestamp() FROM generate_series(4,10) i;
UPDATE public.semester_completions SET excluded=true WHERE user_id='__UID__' AND puzzle_id='261109_10';
SET LOCAL ROLE authenticated;
SELECT pg_temp.check_raid(9,10,'in_progress','{"coins":1000}');
SELECT pg_temp.expect_error($q$SELECT public.claim_achievement(gen_random_uuid(),'raid','season:2026-2',10)$q$,'ACHIEVEMENT_NOT_READY');
RESET ROLE;
UPDATE public.semester_completions SET excluded=false WHERE user_id='__UID__' AND puzzle_id='261109_10';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(private.achievement_milestone_diff('{"raid":9}','{"raid":10}')) n WHERE n->>'id'='raid' AND n->>'threshold'='10') THEN RAISE EXCEPTION 'Coin notification'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.check_raid(10,10,'claimable','{"coins":1000}');
DO $$ DECLARE req uuid:=gen_random_uuid(); result jsonb; before_coins bigint; BEGIN
 before_coins:=(public.cosmetic_context()->'state'->>'coins')::bigint;
 result:=public.claim_achievement(req,'raid','season:2026-2',10);
 IF result->'reward'<>'{"coins":1000}'::jsonb THEN RAISE EXCEPTION 'Coin reward'; END IF;
 IF result<>public.claim_achievement(req,'raid','season:2026-2',10) THEN RAISE EXCEPTION 'Replay mismatch'; END IF;
 IF public.claim_achievement(gen_random_uuid(),'raid','season:2026-2',10)->>'already_claimed'<>'true' THEN RAISE EXCEPTION 'Duplicate claim'; END IF;
 IF (public.cosmetic_context()->'state'->>'coins')::bigint<>before_coins+1000 THEN RAISE EXCEPTION 'Duplicate payout'; END IF;
END $$;
SELECT pg_temp.check_raid(10,NULL,'completed','null');
SELECT pg_temp.expect_error($q$SELECT public.claim_achievement(gen_random_uuid(),'raid','season:2026-2',17)$q$,'INVALID_STAGE');
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM private.mission_claims WHERE user_id='__UID__' AND mission_id='raid')<>2 THEN RAISE EXCEPTION 'Claim count'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.cosmetic_inventory WHERE user_id='__UID__' AND item_id='icon:raid' AND quantity=1) THEN RAISE EXCEPTION 'Icon missing'; END IF;
END $$;
ROLLBACK;
SELECT 'Raid: progress, stages, exclusions, notifications, icon, 1000 coins, replay, duplicates and no repeat passed; all fixtures rolled back' AS result;
""".replace('__UID__', uid)
result = query(sql)
print(json.dumps(result[-1:], ensure_ascii=False))
