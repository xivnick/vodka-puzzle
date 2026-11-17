BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s';

CREATE TABLE private.read_cache_versions (scope text PRIMARY KEY, revision bigint NOT NULL DEFAULT 0);
INSERT INTO private.read_cache_versions(scope) VALUES('achievements'),('shared');
ALTER TABLE private.read_cache_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.read_cache_versions FROM PUBLIC,anon,authenticated;
CREATE TABLE private.achievement_metric_cache (
 user_id uuid REFERENCES auth.users ON DELETE CASCADE, season text, rule_id text,
 value jsonb NOT NULL, valid_until timestamptz NOT NULL, definition_version bigint NOT NULL,
 PRIMARY KEY(user_id,season,rule_id));
ALTER TABLE private.achievement_metric_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.achievement_metric_cache FROM PUBLIC,anon,authenticated;


CREATE OR REPLACE FUNCTION private.calculate_achievement_metric(rule private.achievement_rules, season text)
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

CREATE OR REPLACE FUNCTION private.achievement_metric(rule private.achievement_rules, season text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; expires timestamptz; version bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('achievement-cache:'||auth.uid()::text,0));
 SELECT revision INTO version FROM private.read_cache_versions WHERE scope='achievements';
 SELECT c.value INTO result FROM private.achievement_metric_cache c
 WHERE c.user_id=auth.uid() AND c.season=achievement_metric.season AND c.rule_id=rule.id AND c.valid_until>statement_timestamp() AND c.definition_version=version;
 IF FOUND THEN RETURN result; END IF;
 result:=private.calculate_achievement_metric(rule,season);
 SELECT least(((statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date+1)::timestamp AT TIME ZONE 'Asia/Seoul',
 coalesce(min(published_at),'infinity'::timestamptz)) INTO expires FROM public.puzzle_catalog WHERE published_at>statement_timestamp();
 INSERT INTO private.achievement_metric_cache VALUES(auth.uid(),season,rule.id,result,expires,version)
 ON CONFLICT ON CONSTRAINT achievement_metric_cache_pkey DO UPDATE SET value=excluded.value,valid_until=excluded.valid_until,definition_version=excluded.definition_version;
 RETURN result;
END $$;
CREATE FUNCTION private.invalidate_achievement_metrics() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid; metrics text[];
BEGIN
 IF TG_OP='UPDATE' AND TG_TABLE_NAME='account_operations' AND to_jsonb(OLD)->'status'=to_jsonb(NEW)->'status' AND to_jsonb(OLD)->'kind'=to_jsonb(NEW)->'kind' THEN RETURN NULL; END IF;
 IF TG_OP='UPDATE' AND TG_TABLE_NAME='cosmetic_equipment' AND to_jsonb(OLD)->'icon_id' IS NOT DISTINCT FROM to_jsonb(NEW)->'icon_id' THEN RETURN NULL; END IF;
 metrics:=string_to_array(TG_ARGV[0],',');
 IF TG_NARGS=1 THEN
  UPDATE private.read_cache_versions SET revision=revision+1 WHERE scope='achievements';
 ELSE
  IF TG_OP<>'INSERT' THEN
   owner:=(to_jsonb(OLD)->>'user_id')::uuid;
   IF TG_TABLE_NAME='cosmetic_results' THEN SELECT user_id INTO owner FROM private.account_operations WHERE id=(to_jsonb(OLD)->>'operation_id')::uuid; END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended('achievement-cache:'||owner::text,0));
   DELETE FROM private.achievement_metric_cache c USING private.achievement_rules r WHERE c.rule_id=r.id AND c.user_id=owner AND r.metric=ANY(metrics);
  END IF;
  IF TG_OP<>'DELETE' THEN
   owner:=(to_jsonb(NEW)->>'user_id')::uuid;
   IF TG_TABLE_NAME='cosmetic_results' THEN SELECT user_id INTO owner FROM private.account_operations WHERE id=(to_jsonb(NEW)->>'operation_id')::uuid; END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended('achievement-cache:'||owner::text,0));
   DELETE FROM private.achievement_metric_cache c USING private.achievement_rules r WHERE c.rule_id=r.id AND c.user_id=owner AND r.metric=ANY(metrics);
  END IF;
 END IF;
 RETURN NULL;
END $$;

CREATE TRIGGER invalidate_metrics AFTER INSERT OR UPDATE OR DELETE ON public.semester_completions FOR EACH ROW EXECUTE FUNCTION private.invalidate_achievement_metrics('normal,easy,medium,hard,bound,all,first_blood','user');

CREATE TRIGGER invalidate_metrics AFTER INSERT OR UPDATE OR DELETE ON public.daily_sudoku_completions FOR EACH ROW EXECUTE FUNCTION private.invalidate_achievement_metrics('streak','user');

CREATE TRIGGER invalidate_metrics AFTER INSERT OR UPDATE OR DELETE ON private.cosmetic_equipment FOR EACH ROW EXECUTE FUNCTION private.invalidate_achievement_metrics('equipped','user');

CREATE TRIGGER invalidate_metrics AFTER INSERT OR UPDATE OR DELETE ON private.cosmetic_inventory FOR EACH ROW EXECUTE FUNCTION private.invalidate_achievement_metrics('equipped','user');

CREATE TRIGGER invalidate_metrics AFTER INSERT OR UPDATE OR DELETE ON private.account_operations FOR EACH ROW EXECUTE FUNCTION private.invalidate_achievement_metrics('draw,craft','user');

CREATE TRIGGER invalidate_metrics AFTER INSERT OR UPDATE OR DELETE ON private.cosmetic_results FOR EACH ROW EXECUTE FUNCTION private.invalidate_achievement_metrics('draw','user');

CREATE TRIGGER invalidate_metrics AFTER INSERT OR UPDATE OR DELETE ON private.time_machine_openings FOR EACH ROW EXECUTE FUNCTION private.invalidate_achievement_metrics('time_machine','user');

CREATE TRIGGER invalidate_metrics AFTER INSERT OR UPDATE OR DELETE ON private.puzzle_first_finishers FOR EACH STATEMENT EXECUTE FUNCTION private.invalidate_achievement_metrics('first_blood');

CREATE TRIGGER invalidate_metrics AFTER INSERT OR UPDATE OR DELETE ON public.puzzle_catalog FOR EACH STATEMENT EXECUTE FUNCTION private.invalidate_achievement_metrics('normal,easy,medium,hard,bound,all,streak,equipped,draw,craft,time_machine,first_blood');

CREATE TRIGGER invalidate_metrics AFTER INSERT OR UPDATE OR DELETE ON private.achievement_rules FOR EACH STATEMENT EXECUTE FUNCTION private.invalidate_achievement_metrics('normal,easy,medium,hard,bound,all,streak,equipped,draw,craft,time_machine,first_blood');

CREATE TRIGGER invalidate_metrics AFTER INSERT OR UPDATE OR DELETE ON private.achievement_puzzle_bindings FOR EACH STATEMENT EXECUTE FUNCTION private.invalidate_achievement_metrics('bound');

CREATE TRIGGER invalidate_metrics AFTER INSERT OR UPDATE OR DELETE ON private.cosmetic_settings FOR EACH STATEMENT EXECUTE FUNCTION private.invalidate_achievement_metrics('normal,easy,medium,hard,bound,all,streak,equipped,draw,craft,time_machine,first_blood');

CREATE TABLE private.shared_query_cache (key text PRIMARY KEY, value jsonb NOT NULL, expires_at timestamptz NOT NULL, revision bigint NOT NULL);
ALTER TABLE private.shared_query_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.shared_query_cache FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.invalidate_shared_queries() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN UPDATE private.read_cache_versions SET revision=revision+1 WHERE scope='shared'; RETURN NULL; END $$;

CREATE TRIGGER invalidate_shared_queries AFTER INSERT OR UPDATE OR DELETE ON public.semester_completions FOR EACH STATEMENT EXECUTE FUNCTION private.invalidate_shared_queries();

CREATE TRIGGER invalidate_shared_queries AFTER INSERT OR UPDATE OR DELETE ON public.daily_sudoku_completions FOR EACH STATEMENT EXECUTE FUNCTION private.invalidate_shared_queries();

CREATE TRIGGER invalidate_shared_queries AFTER INSERT OR UPDATE OR DELETE ON public.semester_nicknames FOR EACH STATEMENT EXECUTE FUNCTION private.invalidate_shared_queries();

CREATE TRIGGER invalidate_shared_queries AFTER INSERT OR UPDATE OR DELETE ON public.semester_settings FOR EACH STATEMENT EXECUTE FUNCTION private.invalidate_shared_queries();

CREATE TRIGGER invalidate_shared_queries AFTER INSERT OR UPDATE OR DELETE ON public.puzzle_catalog FOR EACH STATEMENT EXECUTE FUNCTION private.invalidate_shared_queries();

CREATE OR REPLACE FUNCTION private.calculate_recent_completions()
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

CREATE OR REPLACE FUNCTION public.recent_completions()
RETURNS TABLE(nickname text,puzzle_id text,completed_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; expiry timestamptz; version bigint;
BEGIN
 SELECT revision INTO version FROM private.read_cache_versions WHERE scope='shared';
 SELECT value INTO result FROM private.shared_query_cache WHERE key='recent' AND expires_at>statement_timestamp() AND revision=version;
 IF NOT FOUND THEN
  PERFORM pg_advisory_xact_lock(723184,1);
  SELECT value INTO result FROM private.shared_query_cache WHERE key='recent' AND expires_at>statement_timestamp() AND revision=version;
  IF NOT FOUND THEN
   SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') INTO result FROM private.calculate_recent_completions() r;
   SELECT least(statement_timestamp()+interval '30 seconds',coalesce(min(published_at),'infinity'::timestamptz)) INTO expiry FROM public.puzzle_catalog WHERE published_at>statement_timestamp();
   INSERT INTO private.shared_query_cache VALUES('recent',result,expiry,version) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires_at=excluded.expires_at,revision=excluded.revision;
  END IF;
 END IF;
 RETURN QUERY SELECT r.nickname,r.puzzle_id,r.completed_at FROM jsonb_to_recordset(result) r(nickname text,puzzle_id text,completed_at timestamptz);
END $$;

CREATE OR REPLACE FUNCTION private.calculate_streak_rows(current_day date)
 RETURNS TABLE(rank bigint, nickname text, count integer, status text, owner_id uuid)
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
  a.nickname,a.count,a.status,a.user_id
 FROM active a
 ORDER BY a.count DESC,
  CASE a.status WHEN 'completed' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
  a.achieved_at,a.user_id;
$function$;

CREATE OR REPLACE FUNCTION private.daily_streak_rankings_at(current_day date)
RETURNS TABLE(rank bigint,nickname text,count integer,status text,is_me boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; version bigint; cache_key text:='streak:'||current_day::text;
BEGIN
 SELECT revision INTO version FROM private.read_cache_versions WHERE scope='shared';
 SELECT value INTO result FROM private.shared_query_cache WHERE key=cache_key AND expires_at>statement_timestamp() AND revision=version;
 IF NOT FOUND THEN
  PERFORM pg_advisory_xact_lock(723184,2);
  SELECT value INTO result FROM private.shared_query_cache WHERE key=cache_key AND expires_at>statement_timestamp() AND revision=version;
  IF NOT FOUND THEN
   SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') INTO result FROM private.calculate_streak_rows(current_day) r;
   DELETE FROM private.shared_query_cache WHERE key LIKE 'streak:%' AND expires_at<=statement_timestamp();
   INSERT INTO private.shared_query_cache VALUES(cache_key,result,statement_timestamp()+interval '30 seconds',version) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires_at=excluded.expires_at,revision=excluded.revision;
  END IF;
 END IF;
 RETURN QUERY SELECT r.rank,r.nickname,r.count,r.status,coalesce(r.owner_id=auth.uid(),false)
 FROM jsonb_to_recordset(result) r(rank bigint,nickname text,count integer,status text,owner_id uuid);
END $$;

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
 IF task_key='daily-champion' THEN PERFORM pg_advisory_xact_lock(78124,target_day-date '2000-01-01'); END IF;
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

CREATE FUNCTION public.reward_summary() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE season text; rows jsonb;
BEGIN
 season:=private.assert_cosmetic_access();
 rows:=private.achievement_rows(season)||private.daily_task_rows();
 RETURN jsonb_build_object('ready',EXISTS(SELECT 1 FROM jsonb_array_elements(rows) r WHERE r->>'state'='claimable' AND (r->>'configured')::boolean AND coalesce((r->>'active')::boolean,true)));
END $$;
REVOKE ALL ON FUNCTION public.reward_summary() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reward_summary() TO authenticated;

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
 UPDATE private.account_operations SET response=op.response || jsonb_build_object('state',private.cosmetic_state(),'progress',private.cosmetic_usage(),'achievement_notifications',alerts,'achievements',private.achievement_rows(private.assert_cosmetic_access()),'daily_tasks',private.daily_task_rows(),'current_day',(statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date)
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
  RETURN (jsonb_build_object('state',private.cosmetic_state(),'unchanged',true)) || jsonb_build_object('achievements',private.achievement_rows(private.assert_cosmetic_access()),'daily_tasks',private.daily_task_rows(),'current_day',(statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date);
 END IF;
 IF current_equipment.equipment_version<>expected_equipment_version THEN RAISE EXCEPTION 'EQUIPMENT_CHANGED'; END IF;
 before_missions:=private.achievement_milestone_snapshot(season);
 UPDATE private.cosmetic_equipment SET icon_id=icon_value,color_id=color_value,effect_id=effect_value,
  expression=expression_value,direction=direction_value,reversed=reversed_value,equipment_version=equipment_version+1 WHERE user_id=auth.uid();
 RETURN (jsonb_build_object('state',private.cosmetic_state(),'unchanged',false,'achievement_notifications',private.achievement_milestone_diff(before_missions,private.achievement_milestone_snapshot(season)))) || jsonb_build_object('achievements',private.achievement_rows(private.assert_cosmetic_access()),'daily_tasks',private.daily_task_rows(),'current_day',(statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date);
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
 IF current_equipment.all_clear_enabled=enabled THEN RETURN (jsonb_build_object('state',private.cosmetic_state(),'unchanged',true)) || jsonb_build_object('achievements',private.achievement_rows(private.assert_cosmetic_access()),'daily_tasks',private.daily_task_rows(),'current_day',(statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date); END IF;
 IF current_equipment.equipment_version<>expected_equipment_version THEN RAISE EXCEPTION 'EQUIPMENT_CHANGED'; END IF;
 UPDATE private.cosmetic_equipment SET all_clear_enabled=enabled,equipment_version=equipment_version+1 WHERE user_id=auth.uid();
 RETURN (jsonb_build_object('state',private.cosmetic_state(),'unchanged',false)) || jsonb_build_object('achievements',private.achievement_rows(private.assert_cosmetic_access()),'daily_tasks',private.daily_task_rows(),'current_day',(statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date);
END $function$;

DO $$ DECLARE f record; BEGIN FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname IN ('calculate_achievement_metric','achievement_metric','invalidate_achievement_metrics','invalidate_shared_queries','calculate_recent_completions','calculate_streak_rows','daily_streak_rankings_at') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig); END LOOP; END $$;
NOTIFY pgrst,'reload schema'; COMMIT;