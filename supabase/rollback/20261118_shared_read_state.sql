-- Restore prior function behavior; retain derived tables for inspection.
BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s';

DROP TRIGGER IF EXISTS invalidate_metrics ON public.semester_completions;

DROP TRIGGER IF EXISTS invalidate_metrics ON public.daily_sudoku_completions;

DROP TRIGGER IF EXISTS invalidate_metrics ON private.cosmetic_equipment;

DROP TRIGGER IF EXISTS invalidate_metrics ON private.cosmetic_inventory;

DROP TRIGGER IF EXISTS invalidate_metrics ON private.account_operations;

DROP TRIGGER IF EXISTS invalidate_metrics ON private.cosmetic_results;

DROP TRIGGER IF EXISTS invalidate_metrics ON private.time_machine_openings;

DROP TRIGGER IF EXISTS invalidate_metrics ON private.puzzle_first_finishers;

DROP TRIGGER IF EXISTS invalidate_metrics ON public.puzzle_catalog;

DROP TRIGGER IF EXISTS invalidate_metrics ON private.achievement_rules;

DROP TRIGGER IF EXISTS invalidate_metrics ON private.achievement_puzzle_bindings;

DROP TRIGGER IF EXISTS invalidate_metrics ON private.cosmetic_settings;

DROP TRIGGER IF EXISTS invalidate_shared_queries ON public.semester_completions;

DROP TRIGGER IF EXISTS invalidate_shared_queries ON public.daily_sudoku_completions;

DROP TRIGGER IF EXISTS invalidate_shared_queries ON public.semester_nicknames;

DROP TRIGGER IF EXISTS invalidate_shared_queries ON public.semester_settings;

DROP TRIGGER IF EXISTS invalidate_shared_queries ON public.puzzle_catalog;

CREATE OR REPLACE FUNCTION private.achievement_metric(rule private.achievement_rules, season text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE value bigint:=0; eligible bigint:=0; total bigint; dates date[]; policy private.cosmetic_settings; cutoff timestamptz;
BEGIN
 SELECT * INTO policy FROM private.cosmetic_settings WHERE id;
 cutoff:=CASE WHEN policy.history_policy='since_launch' THEN policy.launched_at ELSE '-infinity'::timestamptz END;
 CASE rule.metric
 WHEN 'normal','easy','medium','hard','bound','all' THEN
  SELECT count(*) INTO value FROM public.semester_completions c JOIN public.puzzle_catalog p USING(season_id,puzzle_id)
  WHERE c.user_id=auth.uid() AND c.season_id=season AND NOT c.excluded AND c.completed_at>=cutoff
   AND p.status='published' AND p.published_at<=statement_timestamp()
   AND CASE rule.metric
    WHEN 'easy' THEN p.difficulty=1 WHEN 'medium' THEN p.difficulty=2 WHEN 'hard' THEN p.difficulty=3
    WHEN 'bound' THEN EXISTS(SELECT 1 FROM private.achievement_puzzle_bindings b WHERE b.achievement_id=rule.id AND b.season_id=c.season_id AND b.puzzle_id=c.puzzle_id)
    ELSE true END;
  eligible:=value;
  IF rule.metric='all' THEN
   SELECT count(*) INTO total FROM public.puzzle_catalog WHERE season_id=season AND status='published' AND published_at<=statement_timestamp();
   eligible:=CASE WHEN total>0 AND value=total THEN 1 ELSE 0 END;
  ELSIF rule.metric='bound' AND rule.category='group' THEN
   SELECT count(*) INTO total FROM private.achievement_puzzle_bindings b JOIN public.puzzle_catalog p USING(season_id,puzzle_id)
    WHERE b.achievement_id=rule.id AND b.season_id=season AND p.status='published' AND p.published_at<=statement_timestamp();
  END IF;
 WHEN 'streak' THEN
  SELECT array_agg(day) INTO dates FROM public.daily_sudoku_completions WHERE user_id=auth.uid() AND NOT excluded AND day<=(statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date AND completed_at>=cutoff;
  value:=(private.calculate_daily_streak(dates,(statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date)->>'count')::bigint;
  eligible:=value;
 WHEN 'equipped' THEN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM private.cosmetic_equipment e JOIN private.cosmetic_inventory i ON i.user_id=e.user_id AND i.item_id=e.icon_id WHERE e.user_id=auth.uid()) THEN 1 ELSE 0 END INTO value;
  eligible:=value;
 WHEN 'draw' THEN value:=(private.cosmetic_usage()->>'draw_count')::bigint; eligible:=value;
 WHEN 'craft' THEN value:=(private.cosmetic_usage()->>'craft_count')::bigint; eligible:=value;
 WHEN 'time_machine' THEN SELECT count(*) INTO value FROM private.time_machine_openings WHERE user_id=auth.uid(); eligible:=value;
 WHEN 'first_blood' THEN
  WITH firsts AS (
   SELECT season_id,puzzle_id,user_id,completed_at,excluded FROM private.puzzle_first_finishers
   UNION ALL
   (SELECT DISTINCT ON(c.season_id,c.puzzle_id) c.season_id,c.puzzle_id,c.user_id,c.completed_at,c.excluded
    FROM public.semester_completions c WHERE c.season_id=season
     AND NOT EXISTS(SELECT 1 FROM private.puzzle_first_finishers f WHERE f.season_id=c.season_id AND f.puzzle_id=c.puzzle_id)
    ORDER BY c.season_id,c.puzzle_id,c.completed_at,c.nickname,c.user_id NULLS FIRST)
  )
  SELECT count(*) INTO value FROM firsts f JOIN public.puzzle_catalog p USING(season_id,puzzle_id)
  WHERE f.user_id=auth.uid() AND f.season_id=season AND NOT f.excluded AND f.completed_at>=cutoff
   AND p.status='published' AND p.published_at<=statement_timestamp()
   AND EXISTS(SELECT 1 FROM public.semester_completions c WHERE c.season_id=f.season_id AND c.puzzle_id=f.puzzle_id AND c.user_id=f.user_id AND NOT c.excluded);
  eligible:=value;
 END CASE;
 RETURN jsonb_build_object('current',value,'eligible',eligible,'total',total);
END $function$;

CREATE OR REPLACE FUNCTION public.recent_completions()
 RETURNS TABLE(nickname text, puzzle_id text, completed_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 WITH completions AS (
  SELECT coalesce(c.user_id::text, 'nickname:' || c.nickname) AS account_key,
   c.nickname, c.puzzle_id, c.completed_at
  FROM public.semester_completions c
  JOIN public.semester_settings s ON s.id AND s.active_season=c.season_id
  WHERE NOT c.excluded AND EXISTS(SELECT 1 FROM public.puzzle_catalog p WHERE p.season_id=c.season_id AND p.puzzle_id=c.puzzle_id AND p.status='published' AND p.published_at<=now())
  UNION ALL
  SELECT coalesce(c.user_id::text, 'nickname:' || c.nickname) AS account_key,
   c.nickname, 'daily-sudoku:' || c.day::text, c.completed_at
  FROM public.daily_sudoku_completions c
  JOIN public.semester_settings s ON s.id AND s.active_season=c.season_id
  WHERE NOT c.excluded
 ), latest_per_account AS (
  SELECT DISTINCT ON (account_key) nickname,puzzle_id,completed_at
  FROM completions
  ORDER BY account_key,completed_at DESC,puzzle_id,nickname
 )
 SELECT latest.nickname,latest.puzzle_id,latest.completed_at
 FROM latest_per_account latest
 ORDER BY latest.completed_at DESC,latest.puzzle_id,latest.nickname
 LIMIT 3;
$function$;

CREATE OR REPLACE FUNCTION private.daily_streak_rankings_at(current_day date)
 RETURNS TABLE(rank bigint, nickname text, count integer, status text, is_me boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 WITH history AS (
  SELECT c.user_id,array_agg(c.day) AS days,
   (array_agg(c.completed_at ORDER BY c.day DESC))[1] AS achieved_at,
   (array_agg(c.nickname ORDER BY c.day DESC))[1] AS last_nickname
  FROM public.daily_sudoku_completions c
  WHERE NOT c.excluded AND c.day>=date '2026-09-19' AND c.day<=current_day
  GROUP BY c.user_id HAVING max(c.day)>=current_day-2
 ), active AS (
  SELECT h.user_id,h.achieved_at,coalesce(n.nickname,h.last_nickname) AS nickname,
   (s.streak->>'count')::integer AS count,s.streak->>'status' AS status
  FROM history h
  CROSS JOIN LATERAL (SELECT private.calculate_daily_streak(h.days,current_day) AS streak) s
  LEFT JOIN public.semester_settings settings ON settings.id
  LEFT JOIN public.semester_nicknames n ON n.user_id=h.user_id AND n.season_id=settings.active_season
  WHERE (s.streak->>'count')::integer>0
 )
 SELECT row_number() OVER (ORDER BY a.count DESC,
   CASE a.status WHEN 'completed' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
   a.achieved_at,a.user_id),
  a.nickname,a.count,a.status,coalesce(a.user_id=auth.uid(),false)
 FROM active a
 ORDER BY a.count DESC,
  CASE a.status WHEN 'completed' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
  a.achieved_at,a.user_id;
$function$;

CREATE OR REPLACE FUNCTION public.claim_daily_task(request_id uuid, task_key text, target_day date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE op private.account_operations; task jsonb; reward jsonb; amount integer;
BEGIN
 PERFORM private.assert_cosmetic_access();
 IF target_day IS NULL OR task_key IS NULL OR task_key NOT IN ('attendance','daily-complete','daily-champion') THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
 -- Same day -> economic wallet -> ticket wallet, matching existing ticket APIs.
 PERFORM pg_advisory_xact_lock(78124,target_day-date '2000-01-01');
 op:=private.begin_cosmetic_operation(request_id,'daily_claim',jsonb_build_object('task_key',task_key,'day',target_day));
 IF op.status='completed' THEN RETURN op.response; END IF;
 IF EXISTS(SELECT 1 FROM private.mission_claims c WHERE c.user_id=auth.uid() AND c.scope_key='day:'||target_day::text AND c.mission_id=task_key AND c.threshold=1) THEN
  RETURN private.complete_cosmetic_request(op.id,jsonb_build_object('ok',true,'already_claimed',true));
 END IF;
 IF target_day<>(clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date OR target_day<>(statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date THEN RAISE EXCEPTION 'DAILY_TASK_EXPIRED'; END IF;
 SELECT value INTO task FROM jsonb_array_elements(private.daily_task_rows()) WHERE value->>'id'=task_key;
 IF NOT (task->>'configured')::boolean THEN RAISE EXCEPTION 'REWARD_NOT_CONFIGURED'; END IF;
 IF task->>'state'<>'claimable' THEN RAISE EXCEPTION 'DAILY_TASK_NOT_READY'; END IF;
 reward:=task->'reward';
 IF reward ? 'coins' THEN
  PERFORM private.change_cosmetic_coins(op.id,(reward->>'coins')::bigint,'daily');
 ELSE
  amount:=(reward->>'tickets')::integer;
  PERFORM private.award_cosmetic_tickets(op.id,amount);
 END IF;
 INSERT INTO private.mission_claims(user_id,scope_key,mission_id,threshold,operation_id,rule_version,reward)
 VALUES(auth.uid(),'day:'||target_day::text,task_key,1,op.id,1,reward);
 RETURN private.complete_cosmetic_request(op.id,jsonb_build_object('ok',true,'already_claimed',false,'reward',reward,'daily_tasks',private.daily_task_rows()));
END $function$;

CREATE OR REPLACE FUNCTION private.complete_cosmetic_request(target_operation uuid, details jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
END $function$;

CREATE OR REPLACE FUNCTION public.set_cosmetic_equipment(expected_equipment_version bigint, equipment jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
END $function$;

CREATE OR REPLACE FUNCTION public.set_all_clear_effect(expected_equipment_version bigint, enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE current_equipment private.cosmetic_equipment;
BEGIN
 PERFORM private.assert_cosmetic_access();
 IF enabled IS NULL OR expected_equipment_version IS NULL OR expected_equipment_version<0 THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
 INSERT INTO private.account_coin_wallets(user_id) VALUES(auth.uid()) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM private.account_coin_wallets WHERE user_id=auth.uid() FOR UPDATE;
 IF NOT (private.all_clear_status()->>'eligible')::boolean THEN RAISE EXCEPTION 'ALL_CLEAR_REQUIRED'; END IF;
 INSERT INTO private.cosmetic_equipment(user_id) VALUES(auth.uid()) ON CONFLICT DO NOTHING;
 SELECT * INTO current_equipment FROM private.cosmetic_equipment WHERE user_id=auth.uid();
 IF current_equipment.all_clear_enabled=enabled THEN RETURN jsonb_build_object('state',private.cosmetic_state(),'unchanged',true); END IF;
 IF current_equipment.equipment_version<>expected_equipment_version THEN RAISE EXCEPTION 'EQUIPMENT_CHANGED'; END IF;
 UPDATE private.cosmetic_equipment SET all_clear_enabled=enabled,equipment_version=equipment_version+1 WHERE user_id=auth.uid();
 RETURN jsonb_build_object('state',private.cosmetic_state(),'unchanged',false);
END $function$;

NOTIFY pgrst,'reload schema'; COMMIT;