"""Rehearse gated cosmetic RPCs, real record-derived missions and atomic rewards.
All settings, fixtures, payouts and function changes are rolled back. Existing
puzzles are neither solved nor validated and existing completions are untouched.
"""
import json
import re
import sys
import uuid
from pathlib import Path
from urllib.error import HTTPError
from database import query

user, other = str(uuid.uuid4()), str(uuid.uuid4())
def claims(uid):
    return json.dumps({'sub': uid, 'role': 'authenticated', 'app_metadata': {'provider': 'google'}})
sql = 'BEGIN;\nSET LOCAL statement_timeout=\'30s\';\n'
if '--rehearse' in sys.argv:
    for name in ['20261105_cosmetic_service.sql', '20261105_numeric_difficulty.sql', '20261106_all_clear_effect.sql','20261106_achievement_repeat_rewards.sql','20261106_time_traveler_mission.sql','20261106_time_traveler_clock_bolt.sql','20261106_achievement_history_champion.sql','20261106_cosmetic_test_accounts.sql','20261106_cosmetic_test_transactions.sql','20261106_cosmetic_color_orientation.sql','20261106_cosmetic_release.sql','20261106_cosmetic_attendance_notice.sql','20261106_cosmetic_notification_claim_filter.sql','20261107_achievement_current_streak.sql']:
        migration = (Path(__file__).resolve().parent.parent / 'supabase/migrations' / name).read_text()
        sql += migration.removeprefix('BEGIN;').rsplit('COMMIT;', 1)[0]
if '--reward-rehearsal' in sys.argv:
    migration = (Path(__file__).resolve().parent.parent / 'supabase/migrations/20261106_achievement_repeat_rewards.sql').read_text()
    sql += migration.removeprefix('BEGIN;').rsplit('COMMIT;', 1)[0]
if '--traveler-rehearsal' in sys.argv:
    migration = (Path(__file__).resolve().parent.parent / 'supabase/migrations/20261106_time_traveler_mission.sql').read_text()
    sql += migration.removeprefix('BEGIN;').rsplit('COMMIT;', 1)[0]
if '--icon-rehearsal' in sys.argv:
    migration = (Path(__file__).resolve().parent.parent / 'supabase/migrations/20261106_time_traveler_clock_bolt.sql').read_text()
    sql += migration.removeprefix('BEGIN;').rsplit('COMMIT;', 1)[0]
if '--policy-rehearsal' in sys.argv:
    migration = (Path(__file__).resolve().parent.parent / 'supabase/migrations/20261106_achievement_history_champion.sql').read_text()
    sql += migration.removeprefix('BEGIN;').rsplit('COMMIT;', 1)[0]
if '--test-access-rehearsal' in sys.argv:
    migration = (Path(__file__).resolve().parent.parent / 'supabase/migrations/20261106_cosmetic_test_accounts.sql').read_text()
    sql += migration.removeprefix('BEGIN;').rsplit('COMMIT;', 1)[0]
if '--test-transactions-rehearsal' in sys.argv:
    migration = (Path(__file__).resolve().parent.parent / 'supabase/migrations/20261106_cosmetic_test_transactions.sql').read_text()
    sql += migration.removeprefix('BEGIN;').rsplit('COMMIT;', 1)[0]
if '--orientation-rehearsal' in sys.argv:
    migration = (Path(__file__).resolve().parent.parent / 'supabase/migrations/20261106_cosmetic_color_orientation.sql').read_text()
    sql += migration.removeprefix('BEGIN;').rsplit('COMMIT;', 1)[0]
if '--release-rehearsal' in sys.argv:
    migration = (Path(__file__).resolve().parent.parent / 'supabase/migrations/20261106_cosmetic_release.sql').read_text()
    sql += migration.removeprefix('BEGIN;').rsplit('COMMIT;', 1)[0]
if '--current-streak-rehearsal' in sys.argv:
    migration = (Path(__file__).resolve().parent.parent / 'supabase/migrations/20261107_achievement_current_streak.sql').read_text()
    sql += migration.removeprefix('BEGIN;').rsplit('COMMIT;', 1)[0]
sql += r"""
UPDATE private.cosmetic_settings SET enabled=false,launched_at=NULL WHERE id;
CREATE FUNCTION pg_temp.expect_error(command text, expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN
  IF SQLERRM=expected THEN RETURN; END IF;
  RAISE EXCEPTION 'Expected %, got % for %',expected,SQLERRM,command;
 END;
 RAISE EXCEPTION 'Expected % but command succeeded: %',expected,command;
END $$;
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data) VALUES
 ('__USER__','authenticated','authenticated','cosmetic-__USER__@example.invalid','{"provider":"google"}'),
 ('__OTHER__','authenticated','authenticated','cosmetic-__OTHER__@example.invalid','{"provider":"google"}');
INSERT INTO public.semester_nicknames(season_id,user_id,nickname)
 SELECT active_season,u,n FROM public.semester_settings CROSS JOIN
 (VALUES('__USER__'::uuid,'__cosmetic_a'),('__OTHER__'::uuid,'__cosmetic_b')) v(u,n) WHERE id;
SELECT set_config('request.jwt.claims','__CLAIMS__',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error('SELECT public.cosmetic_context()','COSMETICS_DISABLED');
SELECT pg_temp.expect_error('SELECT public.achievement_context()','COSMETICS_DISABLED');
SELECT pg_temp.expect_error('SELECT public.record_site_visit(gen_random_uuid())','COSMETICS_DISABLED');
SELECT pg_temp.expect_error('SELECT public.draw_cosmetics(gen_random_uuid(),1,1)','COSMETICS_DISABLED');
SELECT pg_temp.expect_error($q$SELECT public.craft_cosmetic(gen_random_uuid(),ARRAY['common:c0','common:c0','common:c0'])$q$,'COSMETICS_DISABLED');
SELECT pg_temp.expect_error($q$SELECT public.set_cosmetic_equipment(0,'{}')$q$,'COSMETICS_DISABLED');
SELECT pg_temp.expect_error($q$SELECT public.claim_achievement(gen_random_uuid(),'first','season:2026-2',1)$q$,'COSMETICS_DISABLED');
SELECT pg_temp.expect_error($q$SELECT public.claim_daily_task(gen_random_uuid(),'attendance',current_date)$q$,'COSMETICS_DISABLED');
SELECT pg_temp.expect_error('SELECT public.cosmetic_operation(gen_random_uuid())','COSMETICS_DISABLED');
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM private.account_coin_wallets WHERE user_id='__USER__') THEN RAISE EXCEPTION 'Disabled APIs wrote data'; END IF;
END $$;
-- Explicitly exercise missing-policy validation inside this rollback fixture.
INSERT INTO private.cosmetic_test_accounts(user_id) VALUES('__USER__');
SET LOCAL ROLE authenticated;
SELECT public.cosmetic_context();
RESET ROLE;
SAVEPOINT allowlisted_transactions;
UPDATE private.cosmetic_draw_configs SET status='active' WHERE version=1;
SET LOCAL ROLE authenticated;
SELECT public.record_site_visit(gen_random_uuid());
DO $$ DECLARE result jsonb; BEGIN
 result:=public.claim_daily_task(gen_random_uuid(),'attendance',(statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date);
 IF result->'state'->>'coins'<>'20' THEN RAISE EXCEPTION 'Allowlisted reward claim failed'; END IF;
END $$;
SELECT pg_temp.expect_error('SELECT public.draw_cosmetics(gen_random_uuid(),1,1)','INSUFFICIENT_COINS');
SELECT pg_temp.expect_error($q$SELECT public.craft_cosmetic(gen_random_uuid(),ARRAY['common:c0','common:c0','common:c0'])$q$,'INSUFFICIENT_MATERIALS');
SELECT pg_temp.expect_error($q$SELECT public.claim_achievement(gen_random_uuid(),'feature-equip-icon','account',1)$q$,'ACHIEVEMENT_NOT_READY');
RESET ROLE;
ROLLBACK TO SAVEPOINT allowlisted_transactions;
RELEASE SAVEPOINT allowlisted_transactions;
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error('SELECT * FROM private.cosmetic_test_accounts','permission denied for schema private');
RESET ROLE;
SELECT set_config('request.jwt.claims','__OTHER_CLAIMS__',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error('SELECT public.cosmetic_context()','COSMETICS_DISABLED');
SELECT pg_temp.expect_error('SELECT public.draw_cosmetics(gen_random_uuid(),1,1)','COSMETICS_DISABLED');
SELECT pg_temp.expect_error($q$SELECT public.claim_daily_task(gen_random_uuid(),'attendance',current_date)$q$,'COSMETICS_DISABLED');
RESET ROLE;
SELECT set_config('request.jwt.claims','__CLAIMS__',true);
DELETE FROM private.cosmetic_test_accounts WHERE user_id='__USER__';
UPDATE private.cosmetic_settings SET enabled=true,history_policy=NULL WHERE id;
SET LOCAL ROLE authenticated;
DO $$ DECLARE context jsonb; BEGIN
 context:=public.cosmetic_context();
 IF context->'state'->>'coins'<>'0' OR jsonb_array_length(context->'state'->'inventory')<>0 THEN RAISE EXCEPTION 'New account received demo data'; END IF;
 IF jsonb_array_length(public.achievement_context()->'achievements')<>20 THEN RAISE EXCEPTION 'Mission count'; END IF;
END $$;
SELECT pg_temp.expect_error('SELECT public.draw_cosmetics(gen_random_uuid(),1,1)','DRAW_NOT_CONFIGURED');
SELECT pg_temp.expect_error($q$SELECT public.claim_achievement(gen_random_uuid(),'feature-equip-icon','account',1)$q$,'ACHIEVEMENT_NOT_READY');
RESET ROLE;
DO $$ DECLARE op private.account_operations; BEGIN
 op:=private.begin_cosmetic_operation(gen_random_uuid(),'adjustment','{}');
 PERFORM private.change_cosmetic_coins(op.id,10000,'test');
 PERFORM private.change_cosmetic_inventory(op.id,'common:c0',60,'test');
 PERFORM private.change_cosmetic_inventory(op.id,'common:c1',60,'test');
 PERFORM private.change_cosmetic_inventory(op.id,'common:c2',60,'test');
 PERFORM private.change_cosmetic_inventory(op.id,'icon:leaf',1,'test');
 PERFORM private.change_cosmetic_inventory(op.id,'effect:ribbon',1,'test');
 PERFORM private.finish_cosmetic_operation(op.id,'{}');
END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE first jsonb; again jsonb; req uuid:=gen_random_uuid(); coins bigint; result_id text; idx integer; v bigint; BEGIN
 SELECT (public.cosmetic_context()->'state'->>'coins')::bigint INTO coins;
 first:=public.craft_cosmetic(req,ARRAY['common:c0','common:c0','common:c0']);
 result_id:=first->'results'->0->>'item_id';
 IF result_id<>'uncommon:common:c0:common:c0' OR first->'results'->0->>'duplicate'<>'false' THEN RAISE EXCEPTION 'AAA result incorrect'; END IF;
 again:=public.craft_cosmetic(req,ARRAY['common:c0','common:c0','common:c0']);
 IF first<>again THEN RAISE EXCEPTION 'Craft retry changed response'; END IF;
 first:=public.craft_cosmetic(gen_random_uuid(),ARRAY['common:c0','common:c0','common:c0']);
 IF (first->'state'->>'coins')::bigint<>coins+100 OR first->'results'->0->>'duplicate'<>'true' THEN RAISE EXCEPTION 'Craft duplicate refund'; END IF;
 first:=public.craft_cosmetic(gen_random_uuid(),ARRAY['common:c1','common:c0','common:c0']);
 IF first->'results'->0->>'item_id'<>'uncommon:common:c0:common:c1' THEN RAISE EXCEPTION 'AAB result incorrect'; END IF;
 first:=public.craft_cosmetic(gen_random_uuid(),ARRAY['common:c1','common:c1','common:c0']);
 IF first->'results'->0->>'item_id'<>'uncommon:common:c0:common:c1' THEN RAISE EXCEPTION 'ABB result incorrect'; END IF;
 FOR idx IN 1..8 LOOP
  first:=public.craft_cosmetic(gen_random_uuid(),ARRAY['common:c2','common:c1','common:c0']);
  IF first->'results'->0->>'item_id' NOT IN ('uncommon:common:c0:common:c1','uncommon:common:c0:common:c2','uncommon:common:c1:common:c2') THEN RAISE EXCEPTION 'ABC selected nonmaterial color'; END IF;
 END LOOP;
 IF first->'progress'->>'craft_count'<>'12' OR first->'state'->>'state_revision'<>first->>'state_revision' THEN RAISE EXCEPTION 'Craft progress or response snapshot stale'; END IF;
 v:=(first->'state'->'equipment'->>'equipment_version')::bigint;
 PERFORM public.set_cosmetic_equipment(v,jsonb_build_object('icon_id','icon:leaf','color_id',result_id,'effect_id','effect:ribbon'));
 PERFORM public.claim_achievement(gen_random_uuid(),'feature-equip-icon','account',1);
 first:=public.cosmetic_context(); v:=(first->'state'->'equipment'->>'equipment_version')::bigint;
 first:=public.set_cosmetic_equipment(v,jsonb_build_object('icon_id','icon:leaf','color_id',result_id,'direction','vertical','reversed',true));
 IF first->'state'->'equipment'->>'direction'<>'vertical' OR first->'state'->'equipment'->>'reversed'<>'true' THEN RAISE EXCEPTION 'Color orientation not saved'; END IF;
 first:=public.cosmetic_context(); v:=(first->'state'->'equipment'->>'equipment_version')::bigint;
 PERFORM public.set_cosmetic_equipment(v,jsonb_build_object('icon_id',NULL,'color_id',result_id));
 IF public.cosmetic_context()->'state'->'equipment'->>'icon_id' IS NOT NULL THEN RAISE EXCEPTION 'Unequip failed'; END IF;
 first:=public.claim_achievement(gen_random_uuid(),'feature-equip-icon','account',1);
 IF first->>'already_claimed'<>'true' THEN RAISE EXCEPTION 'Claim repeated after unequip'; END IF;
 PERFORM public.claim_achievement(gen_random_uuid(),'feature-craft','account',5);
 first:=public.claim_achievement(gen_random_uuid(),'feature-craft','account',10);
 IF first->'reward'->>'coins'<>'100' THEN RAISE EXCEPTION 'Craft repeat amount'; END IF;
END $$;
SELECT pg_temp.expect_error($q$SELECT public.set_cosmetic_equipment(0,'{"icon_id":"icon:crown"}')$q$,'ITEM_NOT_OWNED');
SELECT pg_temp.expect_error($q$SELECT public.set_cosmetic_equipment(0,'{"color_id":"common:c0","effect_id":"effect:ribbon"}')$q$,'EFFECT_REQUIRES_UNCOMMON');
SELECT pg_temp.expect_error($q$SELECT public.set_cosmetic_equipment(0,'{"icon_id":"icon:leaf"}')$q$,'EQUIPMENT_CHANGED');
SELECT pg_temp.expect_error($q$SELECT public.craft_cosmetic(gen_random_uuid(),ARRAY['common:c35','common:c35','common:c35'])$q$,'INSUFFICIENT_MATERIALS');
RESET ROLE;
UPDATE private.cosmetic_draw_configs SET status='active',price_per_draw=100,
 definition=jsonb_set(definition,'{rare}','["rare:r-berry"]') WHERE version=1;
SELECT pg_temp.expect_error('UPDATE private.cosmetic_draw_configs SET price_per_draw=101 WHERE version=1','DRAW_CONFIG_IMMUTABLE');
SET LOCAL ROLE authenticated;
DO $$ DECLARE req uuid:=gen_random_uuid(); reward_req uuid:=gen_random_uuid(); first jsonb; again jsonb; BEGIN
 first:=public.draw_cosmetics(req,1,10); again:=public.draw_cosmetics(req,1,10);
 IF first<>again OR jsonb_array_length(first->'results')<>10 OR first->'progress'->>'draw_count'<>'10' THEN RAISE EXCEPTION 'Draw idempotency or count'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(first->'achievement_notifications') n WHERE n->>'id'='feature-draw' AND n->>'threshold'='5') THEN RAISE EXCEPTION 'Draw mission toast missing'; END IF;
 IF public.cosmetic_operation(req)<>first THEN RAISE EXCEPTION 'Operation lookup changed result'; END IF;
 PERFORM pg_temp.expect_error(format('SELECT public.draw_cosmetics(%L,1,1)',req),'REQUEST_ID_REUSED');
 PERFORM public.claim_achievement(gen_random_uuid(),'feature-draw','account',5);
 first:=public.claim_achievement(reward_req,'feature-draw','account',10);
 IF (first->'reward'->>'coins')::integer NOT IN (10,20,30,40,50,60,70,80,90,100) THEN RAISE EXCEPTION 'Random reward outside choices'; END IF;
 IF first<>public.claim_achievement(reward_req,'feature-draw','account',10) THEN RAISE EXCEPTION 'Random reward replay changed'; END IF;

 PERFORM pg_temp.expect_error('SELECT public.draw_cosmetics(gen_random_uuid(),999,1)','CONFIG_CHANGED');
END $$;
RESET ROLE;
-- Award helper duplicate and existing ticket-wallet checks.
DO $$ DECLARE op private.account_operations; before_count bigint; i integer; r jsonb; BEGIN
 op:=private.begin_cosmetic_operation(gen_random_uuid(),'adjustment','{}');
 r:=private.award_cosmetic_item(op.id,'rare:r-berry',1,true);
 IF private.award_cosmetic_item(op.id,'rare:r-berry',2,true)->>'refund_coins'<>'100' THEN RAISE EXCEPTION 'Rare refund'; END IF;
 IF private.award_cosmetic_item(op.id,'effect:ribbon',3,true)->>'refund_coins'<>'500' THEN RAISE EXCEPTION 'Epic refund'; END IF;
 PERFORM private.award_cosmetic_tickets(op.id,2);
 PERFORM private.finish_cosmetic_operation(op.id,'{}');
 IF (SELECT balance FROM private.time_machine_wallets WHERE user_id='__USER__')<>3 THEN RAISE EXCEPTION 'Existing initial ticket plus reward wrong'; END IF;
 IF private.cosmetic_streak_peak(ARRAY[date '2026-10-01',date '2026-10-03',date '2026-10-05',date '2026-10-08'])<>3 THEN RAISE EXCEPTION 'Streak gap rule'; END IF;
 IF jsonb_array_length(private.achievement_milestone_diff('{"regular":9,"feature-draw":4}','{"regular":20,"feature-draw":10}'))<>2 THEN RAISE EXCEPTION 'Milestone notifications or claimed-stage filtering'; END IF;
END $$;
-- Force RNG only inside this rolled-back test, to cover batch refund paths
-- deterministically. The actual RNG was exercised by the earlier draw/recipe calls.
CREATE OR REPLACE FUNCTION private.cosmetic_random_below(upper_bound integer) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$ BEGIN RETURN CASE WHEN upper_bound=10000 THEN 7200 ELSE 0 END; END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE before_coins bigint; result jsonb; BEGIN
 before_coins:=(public.cosmetic_context()->'state'->>'coins')::bigint;
 result:=public.draw_cosmetics(gen_random_uuid(),1,10);
 IF (result->'state'->>'coins')::bigint<>before_coins OR EXISTS(SELECT 1 FROM jsonb_array_elements(result->'results') x WHERE x->>'refund_coins'<>'100') THEN RAISE EXCEPTION 'Within-batch duplicate refund'; END IF;
END $$;
RESET ROLE;
CREATE OR REPLACE FUNCTION private.cosmetic_random_below(upper_bound integer) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$ BEGIN RETURN CASE WHEN upper_bound=10000 THEN 9999 ELSE 0 END; END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE before_coins bigint; result jsonb; BEGIN
 before_coins:=(public.cosmetic_context()->'state'->>'coins')::bigint;
 result:=public.draw_cosmetics(gen_random_uuid(),1,1);
 IF (result->'state'->>'coins')::bigint<>before_coins+400 OR result->'results'->0->>'refund_coins'<>'500' THEN RAISE EXCEPTION 'Epic draw refund'; END IF;
END $$;
RESET ROLE;
-- Record-derived missions: no solve API calls or existing puzzle records changed.
INSERT INTO public.puzzle_catalog(season_id,puzzle_id,title,summary,puzzle_type,status,published_at,difficulty)
 SELECT active_season,'__cosmetic_'||i,'test','summary','test','published',clock_timestamp()-interval '1 day',
 CASE WHEN i<=10 THEN 1 WHEN i=11 THEN 2 ELSE 3 END
 FROM public.semester_settings CROSS JOIN generate_series(1,12) i WHERE id;
INSERT INTO public.semester_completions(season_id,user_id,nickname,puzzle_id,completed_at)
 SELECT active_season,'__USER__','__cosmetic_a','__cosmetic_'||i,clock_timestamp() FROM public.semester_settings CROSS JOIN generate_series(1,12) i WHERE id;
INSERT INTO private.achievement_puzzle_bindings(achievement_id,season_id,puzzle_id)
 SELECT 'stars',active_season,'__cosmetic_'||i FROM public.semester_settings CROSS JOIN generate_series(1,3) i WHERE id;
SET LOCAL ROLE authenticated;
DO $$ DECLARE row jsonb; ctx jsonb; season text; req uuid:=gen_random_uuid(); today date:=(clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date; BEGIN
 ctx:=public.achievement_context(); season:=ctx->>'season';
 SELECT value INTO row FROM jsonb_array_elements(ctx->'achievements') WHERE value->>'id'='easy';
 IF row->>'current'<>'10' OR row->>'configured'<>'false' THEN RAISE EXCEPTION 'Numeric difficulty or unsettled policy'; END IF;
 PERFORM pg_temp.expect_error(format('SELECT public.claim_achievement(gen_random_uuid(),%L,%L,1)','first','season:'||season),'REWARD_NOT_CONFIGURED');
 PERFORM public.record_site_visit(gen_random_uuid()); PERFORM public.record_site_visit(gen_random_uuid());
 ctx:=public.claim_daily_task(req,'attendance',today);
 IF ctx->'reward'->>'coins'<>'20' OR public.claim_daily_task(req,'attendance',today)<>ctx THEN RAISE EXCEPTION 'Attendance payout/replay'; END IF;
 ctx:=public.claim_daily_task(gen_random_uuid(),'attendance',today);
 IF ctx->>'already_claimed'<>'true' THEN RAISE EXCEPTION 'Attendance paid twice'; END IF;
 ctx:=public.claim_daily_task(gen_random_uuid(),'daily-complete',today);
 IF ctx->'reward'->>'coins'<>'100' THEN RAISE EXCEPTION 'Normal completion daily reward'; END IF;
 PERFORM pg_temp.expect_error(format('SELECT public.claim_daily_task(gen_random_uuid(),%L,%L)','attendance',today-1),'DAILY_TASK_EXPIRED');
END $$;
RESET ROLE;
UPDATE private.cosmetic_settings SET history_policy='all_records',champion_tickets=1 WHERE id;
SET LOCAL ROLE authenticated;
DO $$ DECLARE season text:=public.achievement_context()->>'season'; r jsonb; BEGIN
 PERFORM public.claim_achievement(gen_random_uuid(),'first','season:'||season,1);
 r:=public.claim_achievement(gen_random_uuid(),'easy','season:'||season,10);
 IF r->'reward'->>'item_id'<>'icon:cherry' OR r->'reward' ? 'coins' THEN RAISE EXCEPTION 'Icon stage coin payout'; END IF;
 PERFORM public.claim_achievement(gen_random_uuid(),'regular','season:'||season,10);
 PERFORM public.claim_achievement(gen_random_uuid(),'stars','season:'||season,3);
 PERFORM public.claim_achievement(gen_random_uuid(),'first-blood','season:'||season,1);
 PERFORM public.claim_achievement(gen_random_uuid(),'first-blood','season:'||season,3);
 PERFORM public.claim_achievement(gen_random_uuid(),'first-blood','season:'||season,10);
END $$;
RESET ROLE;
-- An ended historical streak cannot unlock a current-streak reward.
INSERT INTO public.daily_sudoku(day,opens_at,givens)
 SELECT (clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date-i,
  (((clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date-i)::timestamp AT TIME ZONE 'Asia/Seoul'),repeat('0',81)
 FROM generate_series(24,30) i ON CONFLICT DO NOTHING;
INSERT INTO public.daily_sudoku_completions(day,user_id,season_id,nickname,rank,completed_at)
 SELECT d.day,'__USER__',s.active_season,'__cosmetic_a',
  (SELECT coalesce(max(rank),0)+1 FROM public.daily_sudoku_completions c WHERE c.day=d.day),d.opens_at+interval '12 hours'
 FROM public.daily_sudoku d CROSS JOIN public.semester_settings s
 WHERE s.id AND d.day BETWEEN (clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date-30 AND (clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date-24;
SET LOCAL ROLE authenticated;
DO $$ DECLARE row jsonb; BEGIN
 SELECT value INTO row FROM jsonb_array_elements(public.achievement_context()->'achievements') WHERE value->>'id'='daily';
 IF row->>'current'<>'0' OR row->>'state'<>'in_progress' THEN RAISE EXCEPTION 'Historical streak wrongly eligible'; END IF;
 PERFORM pg_temp.expect_error($q$SELECT public.claim_achievement(gen_random_uuid(),'daily','account',7)$q$,'ACHIEVEMENT_NOT_READY');
END $$;
RESET ROLE;
-- Ticket repeats start at 30, not first_goal + interval (37).
INSERT INTO public.daily_sudoku(day,opens_at,givens)
 SELECT (clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date-i,
 (((clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date-i)::timestamp AT TIME ZONE 'Asia/Seoul'),repeat('0',81)
 FROM generate_series(0,29) i ON CONFLICT DO NOTHING;
INSERT INTO public.daily_sudoku_completions(day,user_id,season_id,nickname,rank,completed_at)
 SELECT d.day,'__USER__',s.active_season,'__cosmetic_a',
 (SELECT coalesce(max(rank),0)+1 FROM public.daily_sudoku_completions c WHERE c.day=d.day),clock_timestamp()
 FROM public.daily_sudoku d CROSS JOIN public.semester_settings s WHERE s.id
 AND d.day BETWEEN (clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date-29 AND (clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date
 AND NOT EXISTS(SELECT 1 FROM public.daily_sudoku_completions c WHERE c.day=d.day AND c.user_id='__USER__');
SET LOCAL ROLE authenticated;
DO $$ DECLARE row jsonb; req uuid:=gen_random_uuid(); result jsonb; BEGIN
 PERFORM public.claim_achievement(gen_random_uuid(),'daily','account',7);
 SELECT value INTO row FROM jsonb_array_elements(public.achievement_context()->'achievements') WHERE value->>'id'='daily';
 IF row->>'threshold'<>'30' OR row->'reward'<>'{"tickets":1}'::jsonb THEN RAISE EXCEPTION 'Streak ticket configuration'; END IF;
 PERFORM pg_temp.expect_error($q$SELECT public.claim_achievement(gen_random_uuid(),'daily','account',14)$q$,'INVALID_STAGE');
 result:=public.claim_achievement(req,'daily','account',30);
 IF result->'reward'<>'{"tickets":1}'::jsonb OR public.claim_achievement(req,'daily','account',30)<>result THEN RAISE EXCEPTION 'Streak ticket or replay'; END IF;
 SELECT value INTO row FROM jsonb_array_elements(public.achievement_context()->'achievements') WHERE value->>'id'='daily';
 IF row->>'threshold'<>'60' THEN RAISE EXCEPTION 'Streak next threshold'; END IF;
END $$;
RESET ROLE;
-- Selected icon is active in the catalog; the whole cosmetic service remains gated.
DO $$ BEGIN
 IF NOT (SELECT active FROM private.achievement_rules WHERE id='time-traveler') OR NOT (SELECT active FROM private.cosmetic_items WHERE id='icon:time-traveler') OR (SELECT definition->>'src' FROM private.cosmetic_items WHERE id='icon:time-traveler')<>'/icons/achievement-preview/clock-bolt.svg' THEN RAISE EXCEPTION 'Selected time traveler icon missing'; END IF;
END $$;
UPDATE private.achievement_rules SET active=true WHERE id='time-traveler';
UPDATE private.cosmetic_items SET active=true WHERE id='icon:time-traveler';
INSERT INTO private.time_machine_openings(user_id,day)
 SELECT '__USER__',(clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date-i FROM generate_series(1,2) i;
SET LOCAL ROLE authenticated;
DO $$ DECLARE row jsonb; BEGIN
 SELECT value INTO row FROM jsonb_array_elements(public.achievement_context()->'achievements') WHERE value->>'id'='time-traveler';
 IF row->>'current'<>'2' OR row->>'threshold'<>'3' OR row->>'state'<>'in_progress' OR row->>'scope_key'<>'account' THEN RAISE EXCEPTION 'Time machine source records'; END IF;
END $$;
RESET ROLE;
INSERT INTO private.time_machine_openings(user_id,day) VALUES('__USER__',(clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date-1) ON CONFLICT DO NOTHING;
INSERT INTO private.time_machine_openings(user_id,day) VALUES('__USER__',(clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date-3);
SET LOCAL ROLE authenticated;
DO $$ DECLARE req uuid:=gen_random_uuid(); result jsonb; row jsonb; BEGIN
 IF public.cosmetic_context()->'progress'->>'time_machine_count'<>'3' THEN RAISE EXCEPTION 'Time machine unique records'; END IF;
 result:=public.claim_achievement(req,'time-traveler','account',3);
 IF result->'reward'->>'item_id'<>'icon:time-traveler' OR result->'reward' ? 'coins' THEN RAISE EXCEPTION 'Time traveler reward'; END IF;
 IF result<>public.claim_achievement(req,'time-traveler','account',3) THEN RAISE EXCEPTION 'Time traveler replay'; END IF;
 SELECT value INTO row FROM jsonb_array_elements(public.achievement_context()->'achievements') WHERE value->>'id'='time-traveler';
 IF row->>'state'<>'completed' THEN RAISE EXCEPTION 'Time traveler unexpectedly repeats'; END IF;
END $$;
RESET ROLE;
-- Frozen first place survives account deletion, no runner-up promotion.
INSERT INTO public.semester_completions(season_id,user_id,nickname,puzzle_id,completed_at)
 SELECT active_season,'__OTHER__','__cosmetic_b','__cosmetic_1',clock_timestamp()+interval '1 second' FROM public.semester_settings WHERE id;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM private.account_coin_wallets w WHERE w.user_id='__USER__' AND w.balance<>(SELECT sum(delta) FROM private.coin_ledger WHERE user_id=w.user_id)) THEN RAISE EXCEPTION 'Coin audit failed'; END IF;
 IF EXISTS(SELECT item_id FROM private.inventory_ledger WHERE user_id='__USER__' GROUP BY item_id HAVING sum(delta)<>coalesce((SELECT quantity FROM private.cosmetic_inventory i WHERE i.user_id='__USER__' AND i.item_id=inventory_ledger.item_id),0)) THEN RAISE EXCEPTION 'Inventory audit failed'; END IF;
END $$;
SELECT set_config('request.jwt.claims','__OTHER_CLAIMS__',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF public.cosmetic_context()->'state'->>'coins'<>'0' OR jsonb_array_length(public.cosmetic_context()->'state'->'inventory')<>0 THEN RAISE EXCEPTION 'Other account data leaked'; END IF;
END $$;
RESET ROLE;
-- Version changes never reprice an old completed request.
UPDATE private.cosmetic_draw_configs SET status='retired' WHERE version=1;
INSERT INTO private.cosmetic_draw_configs(version,status,price_per_draw,definition)
 SELECT 2,'active',120,definition FROM private.cosmetic_draw_configs WHERE version=1;
SELECT set_config('request.jwt.claims','__CLAIMS__',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error('SELECT public.draw_cosmetics(gen_random_uuid(),1,1)','CONFIG_CHANGED');
RESET ROLE;
DO $$ DECLARE req uuid; old_response jsonb; BEGIN
 SELECT request_id,response INTO req,old_response FROM private.account_operations WHERE user_id='__USER__' AND kind='draw' AND (payload->>'count')::integer=10 LIMIT 1;
 IF public.draw_cosmetics(req,1,10)<>old_response THEN RAISE EXCEPTION 'Old version request not replayed'; END IF;
END $$;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname IN
 ('assert_cosmetic_access','cosmetic_random_below','cosmetic_state','cosmetic_usage','complete_cosmetic_request','award_cosmetic_item','award_cosmetic_tickets',
 'capture_puzzle_first_finisher','cosmetic_streak_peak','achievement_metric','achievement_rows','daily_task_rows','achievement_milestone_snapshot','achievement_milestone_diff','freeze_cosmetic_draw_config') LOOP
 IF has_function_privilege('authenticated',f.oid,'EXECUTE') OR has_function_privilege('anon',f.oid,'EXECUTE') THEN RAISE EXCEPTION 'Helper exposed'; END IF;
 END LOOP;
END $$;
SET CONSTRAINTS ALL IMMEDIATE;
DELETE FROM auth.users WHERE id='__USER__';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM private.puzzle_first_finishers WHERE puzzle_id='__cosmetic_1' AND user_id IS NOT NULL) THEN RAISE EXCEPTION 'Deleted first finisher not anonymized'; END IF;
END $$;
SET LOCAL ROLE anon;
SELECT pg_temp.expect_error('SELECT public.cosmetic_context()','permission denied for function cosmetic_context');
RESET ROLE;
SELECT 'gating, missions, recipes, duplicate refunds, replay, equipment, tickets, daily tasks, first blood, ledger audit and isolation: passed' AS result;
ROLLBACK;
"""
# Retire the real active config only within the rollback; never edit its definition.
sql = sql.replace('CREATE FUNCTION pg_temp.expect_error', "UPDATE private.cosmetic_draw_configs SET status='retired' WHERE status='active';\nINSERT INTO private.cosmetic_draw_configs(version,status,price_per_draw,definition) SELECT 2000000000,'draft',100,definition FROM private.cosmetic_draw_configs WHERE version=1;\nCREATE FUNCTION pg_temp.expect_error",1)
# Rewrite the test body's config references, preserving the seed SELECT version=1.
seed, body = sql.split('CREATE FUNCTION pg_temp.expect_error',1)
body = re.sub(r'(draw_cosmetics\([^,\n]+,)1,',r'\g<1>2000000000,',body)
body = re.sub(r'(draw_cosmetics\([^,\n]+,)2,',r'\g<1>2000000001,',body)
body = body.replace('version=1','version=2000000000').replace('version=2;','version=2000000001;').replace("SELECT 2,'active',120", "SELECT 2000000001,'active',120")
sql = seed+'CREATE FUNCTION pg_temp.expect_error'+body
sql = sql.replace('__USER__', user).replace('__OTHER__', other).replace('__CLAIMS__', claims(user)).replace('__OTHER_CLAIMS__', claims(other))
try:
    print(query(sql))
except HTTPError as error:
    print(error.read().decode())
    raise SystemExit(1)
