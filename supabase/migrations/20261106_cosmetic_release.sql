BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
CREATE FUNCTION private.cosmetics_public_enabled() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT enabled AND (launched_at IS NULL OR launched_at<=statement_timestamp()) FROM private.cosmetic_settings WHERE id),false);
$$;
REVOKE ALL ON FUNCTION private.cosmetics_public_enabled() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.cosmetic_release_context() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('active',private.cosmetics_public_enabled(),'launch_at',launched_at,'server_now',statement_timestamp()) FROM private.cosmetic_settings WHERE id;
$$;
REVOKE ALL ON FUNCTION public.cosmetic_release_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cosmetic_release_context() TO anon,authenticated;
CREATE OR REPLACE FUNCTION private.assert_cosmetic_access() RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE season text;
BEGIN
 IF auth.uid() IS NULL OR coalesce(auth.jwt()->'app_metadata'->>'provider','')<>'google' THEN RAISE EXCEPTION 'LOGIN_REQUIRED'; END IF;
 IF NOT private.cosmetics_public_enabled()
  AND NOT EXISTS(SELECT 1 FROM private.cosmetic_test_accounts WHERE user_id=auth.uid() AND active)
  THEN RAISE EXCEPTION 'COSMETICS_DISABLED'; END IF;
 SELECT n.season_id INTO season FROM public.semester_nicknames n JOIN public.semester_settings s ON s.id AND s.active_season=n.season_id WHERE n.user_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_REQUIRED'; END IF;
 RETURN season;
END $$;

CREATE OR REPLACE FUNCTION public.submit_completion(requested_puzzle text, submitted_state jsonb, state_version integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE profile public.semester_nicknames; moment timestamptz; target date; result jsonb; position bigint; notify_enabled boolean; before_missions jsonb; before_daily jsonb;
BEGIN
 IF auth.uid() IS NULL OR coalesce(auth.jwt()->'app_metadata'->>'provider','')<>'google' THEN RAISE EXCEPTION 'LOGIN_REQUIRED'; END IF;
 SELECT n.* INTO profile FROM public.semester_nicknames n JOIN public.semester_settings s ON s.id AND s.active_season=n.season_id WHERE n.user_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_REQUIRED'; END IF;
 IF submitted_state IS NULL OR jsonb_typeof(submitted_state)<>'object' OR octet_length(submitted_state::text)>=30000 OR state_version IS NULL OR state_version<>1 THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
 notify_enabled:=private.cosmetics_public_enabled() OR EXISTS(SELECT 1 FROM private.cosmetic_test_accounts WHERE user_id=auth.uid() AND active);
 IF notify_enabled THEN PERFORM pg_advisory_xact_lock(hashtextextended('cosmetic-progress:'||auth.uid()::text,0)); END IF;
 IF requested_puzzle ~ '^daily-sudoku:[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
  target:=substring(requested_puzzle FROM 14)::date;
  PERFORM pg_advisory_xact_lock(78124,target-date '2000-01-01');
  SELECT jsonb_build_object('rank',c.rank,'completed_at',c.completed_at) INTO result FROM public.daily_sudoku_completions c WHERE c.day=target AND c.user_id=auth.uid();
  IF FOUND THEN RETURN result; END IF;
  PERFORM public.publish_daily_sudoku();
  moment:=clock_timestamp();
  IF NOT EXISTS(SELECT 1 FROM public.daily_sudoku p WHERE p.day=target AND p.opens_at<=moment AND (
   moment<p.opens_at+interval '24 hours' OR EXISTS(
    SELECT 1 FROM private.time_machine_openings o WHERE o.user_id=auth.uid() AND o.day=target
   )
  )) THEN RAISE EXCEPTION 'CLOSED'; END IF;
  SELECT coalesce(max(rank),0)+1 INTO position FROM public.daily_sudoku_completions WHERE day=target;
 IF notify_enabled THEN before_missions:=private.achievement_milestone_snapshot(profile.season_id); before_daily:=private.daily_task_rows(); END IF;
  INSERT INTO public.daily_sudoku_completions(day,user_id,season_id,nickname,rank,completed_at) VALUES(target,auth.uid(),profile.season_id,profile.nickname,position,moment);
  result:=jsonb_build_object('rank',position,'completed_at',moment);
 ELSE
  IF NOT public.is_puzzle_published(profile.season_id,requested_puzzle) THEN RAISE EXCEPTION 'UNAVAILABLE'; END IF;
  PERFORM private.capture_puzzle_first_finisher(profile.season_id,requested_puzzle);
  PERFORM pg_advisory_xact_lock(hashtextextended(profile.season_id || ':' || auth.uid()::text || ':' || requested_puzzle,0));
  SELECT jsonb_build_object('completed_at',c.completed_at) INTO result FROM public.semester_completions c WHERE c.season_id=profile.season_id AND c.user_id=auth.uid() AND c.puzzle_id=requested_puzzle;
  IF FOUND THEN RETURN result; END IF;
  moment:=clock_timestamp();
 IF notify_enabled THEN before_missions:=private.achievement_milestone_snapshot(profile.season_id); before_daily:=private.daily_task_rows(); END IF;
  INSERT INTO public.semester_completions(season_id,user_id,nickname,puzzle_id,completed_at) VALUES(profile.season_id,auth.uid(),profile.nickname,requested_puzzle,moment);
  PERFORM private.capture_puzzle_first_finisher(profile.season_id,requested_puzzle);
  result:=jsonb_build_object('completed_at',moment);
 END IF;
 INSERT INTO public.completion_submissions(season_id,user_id,puzzle_id,state_version,state,submitted_at) VALUES(profile.season_id,auth.uid(),requested_puzzle,state_version,submitted_state,moment);
 IF notify_enabled THEN
  result:=result || jsonb_build_object('achievement_notifications',private.achievement_milestone_diff(before_missions,private.achievement_milestone_snapshot(profile.season_id)),
   'daily_task_notifications',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a->>'id','name',a->>'name')) FROM jsonb_array_elements(private.daily_task_rows()) a
    WHERE (a->>'complete')::boolean AND NOT coalesce((SELECT (b->>'complete')::boolean FROM jsonb_array_elements(before_daily) b WHERE b->>'id'=a->>'id'),false)),'[]'::jsonb));
 END IF;
 RETURN result;
END $function$
;
CREATE OR REPLACE FUNCTION private.complete_cosmetic_request(target_operation uuid, details jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE op private.account_operations; before_missions jsonb; season text; alerts jsonb:='[]';
BEGIN
 SELECT * INTO op FROM private.account_operations WHERE id=target_operation;
 IF op.kind IN ('draw','craft') THEN
  season:=private.assert_cosmetic_access();before_missions:=private.achievement_milestone_snapshot(season);
 END IF;
 op:=private.finish_cosmetic_operation(target_operation,details);
 IF before_missions IS NOT NULL THEN alerts:=private.achievement_milestone_diff(before_missions,private.achievement_milestone_snapshot(season)); END IF;
 UPDATE private.account_operations SET response=op.response || jsonb_build_object('state',private.cosmetic_state(),'progress',private.cosmetic_usage(),'achievement_notifications',alerts)
 WHERE id=op.id RETURNING * INTO op;
 RETURN op.response;
END $$;
CREATE OR REPLACE FUNCTION public.set_cosmetic_equipment(expected_equipment_version bigint, equipment jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_equipment private.cosmetic_equipment; picked text; field text;
 icon_value text; color_value text; effect_value text; expression_value text; direction_value text; reversed_value boolean; before_missions jsonb; season text;
BEGIN
 season:=private.assert_cosmetic_access();
 IF equipment IS NULL OR jsonb_typeof(equipment)<>'object' OR expected_equipment_version IS NULL OR expected_equipment_version<0
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(equipment) k WHERE k NOT IN ('icon_id','color_id','effect_id','expression','direction','reversed')) THEN RAISE EXCEPTION 'INVALID_EQUIPMENT'; END IF;
 icon_value:=equipment->>'icon_id'; color_value:=equipment->>'color_id'; effect_value:=equipment->>'effect_id';
 IF effect_value='effect:sparkle' THEN RAISE EXCEPTION 'USE_ALL_CLEAR_TOGGLE'; END IF;
 expression_value:=coalesce(equipment->>'expression','gradient'); direction_value:=coalesce(equipment->>'direction','diagonal');
 IF equipment ? 'reversed' AND jsonb_typeof(equipment->'reversed')<>'boolean' THEN RAISE EXCEPTION 'INVALID_EQUIPMENT'; END IF;
 reversed_value:=coalesce((equipment->>'reversed')::boolean,false);
 IF expression_value NOT IN ('gradient','split') OR direction_value NOT IN ('diagonal','horizontal','vertical') THEN RAISE EXCEPTION 'INVALID_EQUIPMENT'; END IF;
 INSERT INTO private.account_coin_wallets(user_id) VALUES(auth.uid()) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM private.account_coin_wallets WHERE user_id=auth.uid() FOR UPDATE;
 FOREACH field IN ARRAY ARRAY['icon_id','color_id','effect_id'] LOOP
  picked:=equipment->>field;
  IF picked IS NOT NULL AND NOT EXISTS(SELECT 1 FROM private.cosmetic_inventory i JOIN private.cosmetic_items d ON d.id=i.item_id
   WHERE i.user_id=auth.uid() AND i.item_id=picked AND d.active AND CASE field
    WHEN 'icon_id' THEN d.kind='icon' WHEN 'color_id' THEN d.kind IN ('common_color','uncommon_color','rare_color') ELSE d.kind='effect' END)
   THEN RAISE EXCEPTION 'ITEM_NOT_OWNED'; END IF;
 END LOOP;
 IF effect_value IS NOT NULL AND NOT EXISTS(SELECT 1 FROM private.cosmetic_items WHERE id=color_value AND kind IN ('uncommon_color','rare_color')) THEN RAISE EXCEPTION 'EFFECT_REQUIRES_UNCOMMON'; END IF;
 INSERT INTO private.cosmetic_equipment(user_id) VALUES(auth.uid()) ON CONFLICT DO NOTHING;
 SELECT * INTO current_equipment FROM private.cosmetic_equipment WHERE user_id=auth.uid();
 IF current_equipment.icon_id IS NOT DISTINCT FROM icon_value AND current_equipment.color_id IS NOT DISTINCT FROM color_value
  AND current_equipment.effect_id IS NOT DISTINCT FROM effect_value AND current_equipment.expression=expression_value AND current_equipment.direction=direction_value AND current_equipment.reversed=reversed_value THEN
  RETURN jsonb_build_object('state',private.cosmetic_state(),'unchanged',true);
 END IF;
 IF current_equipment.equipment_version<>expected_equipment_version THEN RAISE EXCEPTION 'EQUIPMENT_CHANGED'; END IF;
 before_missions:=private.achievement_milestone_snapshot(season);
 UPDATE private.cosmetic_equipment SET icon_id=icon_value,color_id=color_value,effect_id=effect_value,
  expression=expression_value,direction=direction_value,reversed=reversed_value,equipment_version=equipment_version+1 WHERE user_id=auth.uid();
 RETURN jsonb_build_object('state',private.cosmetic_state(),'unchanged',false,'achievement_notifications',private.achievement_milestone_diff(before_missions,private.achievement_milestone_snapshot(season)));
END $$;

CREATE OR REPLACE FUNCTION public.open_time_machine(requested_day date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE current_day date:=(clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date; ticket_balance integer; before_missions jsonb; season text; notify_enabled boolean;
BEGIN
 PERFORM private.ensure_time_machine_wallet();
 IF NOT EXISTS(SELECT 1 FROM public.semester_nicknames n JOIN public.semester_settings s ON s.id AND s.active_season=n.season_id WHERE n.user_id=auth.uid()) THEN RAISE EXCEPTION 'PROFILE_REQUIRED'; END IF;
 IF requested_day IS NULL OR requested_day>=current_day OR requested_day<date '2026-09-19' THEN RAISE EXCEPTION 'UNAVAILABLE'; END IF;
 PERFORM public.publish_daily_sudoku();
 IF NOT EXISTS(SELECT 1 FROM public.daily_sudoku p WHERE p.day=requested_day AND p.opens_at<=clock_timestamp()) THEN RAISE EXCEPTION 'UNAVAILABLE'; END IF;
 -- Match completion's day lock, then serialize balance changes across all dates.
 PERFORM pg_advisory_xact_lock(78124,requested_day-date '2000-01-01');
 SELECT w.balance INTO ticket_balance FROM private.time_machine_wallets w WHERE w.user_id=auth.uid() FOR UPDATE;
 IF EXISTS(SELECT 1 FROM private.time_machine_openings o WHERE o.user_id=auth.uid() AND o.day=requested_day)
  OR EXISTS(SELECT 1 FROM public.daily_sudoku_completions c WHERE c.user_id=auth.uid() AND c.day=requested_day AND NOT c.excluded) THEN
  RETURN jsonb_build_object('day',requested_day,'tickets',ticket_balance,'charged',false);
 END IF;
 IF ticket_balance<1 THEN RAISE EXCEPTION 'NO_TICKETS'; END IF;
 notify_enabled:=private.cosmetics_public_enabled() OR EXISTS(SELECT 1 FROM private.cosmetic_test_accounts WHERE user_id=auth.uid() AND active);
 IF notify_enabled THEN SELECT active_season INTO season FROM public.semester_settings WHERE id; before_missions:=private.achievement_milestone_snapshot(season); END IF;
 ticket_balance:=ticket_balance-1;
 UPDATE private.time_machine_wallets w SET balance=ticket_balance,updated_at=clock_timestamp() WHERE w.user_id=auth.uid();
 INSERT INTO private.time_machine_openings(user_id,day) VALUES(auth.uid(),requested_day);
 INSERT INTO private.time_machine_ticket_events(user_id,event_key,delta,balance_after,day)
 VALUES(auth.uid(),'open:' || requested_day::text,-1,ticket_balance,requested_day);
 RETURN jsonb_build_object('day',requested_day,'tickets',ticket_balance,'charged',true,'achievement_notifications',CASE WHEN notify_enabled THEN private.achievement_milestone_diff(before_missions,private.achievement_milestone_snapshot(season)) ELSE '[]'::jsonb END);
END $function$
;

CREATE FUNCTION public.cosmetic_rank_displays(requested_season text, nicknames text[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT private.cosmetics_public_enabled() THEN RETURN '{}'::jsonb; END IF;
 IF requested_season IS DISTINCT FROM (SELECT active_season FROM public.semester_settings WHERE id) OR cardinality(nicknames)>200 OR octet_length(nicknames::text)>30000 THEN RETURN '{}'::jsonb; END IF;
 RETURN (WITH puzzles AS (SELECT puzzle_id FROM public.puzzle_catalog WHERE season_id=requested_season AND status='published' AND published_at<=statement_timestamp()),
 displays AS (SELECT n.nickname,jsonb_build_object('icon',i.definition,'mission',
  (SELECT r.name FROM private.achievement_rules r WHERE r.active AND (r.reward_item=i.id OR EXISTS(SELECT 1 FROM private.achievement_stage_rewards st WHERE st.achievement_id=r.id AND st.item_id=i.id)) ORDER BY r.sort_order LIMIT 1),
  'color',c.definition,'expression',e.expression,'direction',e.direction,'reversed',e.reversed,
  'effect',CASE WHEN c.kind IN ('uncommon_color','rare_color') THEN replace(f.id,'effect:','') END,
  'sparkle',e.all_clear_enabled AND EXISTS(SELECT 1 FROM puzzles) AND NOT EXISTS(SELECT 1 FROM puzzles p WHERE NOT EXISTS(SELECT 1 FROM public.semester_completions x WHERE x.user_id=n.user_id AND x.season_id=requested_season AND x.puzzle_id=p.puzzle_id AND NOT x.excluded))) AS display
 FROM public.semester_nicknames n JOIN private.cosmetic_equipment e ON e.user_id=n.user_id
 JOIN private.cosmetic_items i ON i.id=e.icon_id AND i.active
 LEFT JOIN private.cosmetic_items c ON c.id=e.color_id AND c.active
 LEFT JOIN private.cosmetic_items f ON f.id=e.effect_id AND f.active
 WHERE n.season_id=requested_season AND n.nickname=ANY(nicknames))
 SELECT coalesce(jsonb_object_agg(nickname,display),'{}'::jsonb) FROM displays);
END $$;
REVOKE ALL ON FUNCTION public.cosmetic_rank_displays(text,text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cosmetic_rank_displays(text,text[]) TO anon,authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
