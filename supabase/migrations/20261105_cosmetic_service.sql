BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';

ALTER TABLE private.cosmetic_settings
 ADD COLUMN champion_tickets integer CHECK(champion_tickets>0),
 ADD COLUMN history_policy text CHECK(history_policy IN ('all_records','since_launch')),
 ADD COLUMN launched_at timestamptz,
 ADD CHECK(history_policy IS DISTINCT FROM 'since_launch' OR launched_at IS NOT NULL);

-- Once published, a draw version can only change its availability. A price,
-- probability or pool edit requires a new version, matching the client guard.
ALTER TABLE private.cosmetic_draw_configs ADD COLUMN sealed boolean NOT NULL DEFAULT false;
UPDATE private.cosmetic_draw_configs SET sealed=status IN ('active','retired');
CREATE FUNCTION private.freeze_cosmetic_draw_config() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.sealed THEN
  IF (NEW.version,NEW.price_per_draw,NEW.common_weight,NEW.rare_weight,NEW.epic_weight,NEW.definition)
   IS DISTINCT FROM (OLD.version,OLD.price_per_draw,OLD.common_weight,OLD.rare_weight,OLD.epic_weight,OLD.definition)
   OR NEW.status='draft' THEN RAISE EXCEPTION 'DRAW_CONFIG_IMMUTABLE'; END IF;
  NEW.sealed:=true;
 ELSE
  NEW.sealed:=NEW.status IN ('active','retired');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cosmetic_draw_config_immutable BEFORE INSERT OR UPDATE ON private.cosmetic_draw_configs
 FOR EACH ROW EXECUTE FUNCTION private.freeze_cosmetic_draw_config();

CREATE TABLE private.achievement_rules (
 id text PRIMARY KEY,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 name text NOT NULL,
 description text NOT NULL,
 category text NOT NULL CHECK(category IN ('basic','group','special')),
 metric text NOT NULL CHECK(metric IN ('normal','easy','medium','hard','streak','first_blood','bound','all','equipped','draw','craft')),
 account_scope boolean NOT NULL DEFAULT false,
 first_goal bigint NOT NULL CHECK(first_goal>0),
 reward_item text NOT NULL REFERENCES private.cosmetic_items(id),
 repeat_every bigint CHECK(repeat_every>0),
 repeat_coins bigint CHECK(repeat_coins>0),
 active boolean NOT NULL DEFAULT true,
 sort_order integer NOT NULL,
 CHECK(repeat_every IS NOT NULL OR repeat_coins IS NULL)
);
CREATE TABLE private.achievement_puzzle_bindings (
 achievement_id text NOT NULL REFERENCES private.achievement_rules(id),
 season_id text NOT NULL,
 puzzle_id text NOT NULL,
 PRIMARY KEY(achievement_id,season_id,puzzle_id)
);
CREATE TABLE private.puzzle_first_finishers (
 season_id text NOT NULL,
 puzzle_id text NOT NULL,
 user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 completed_at timestamptz NOT NULL,
 excluded boolean NOT NULL DEFAULT false,
 PRIMARY KEY(season_id,puzzle_id)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['achievement_rules','achievement_puzzle_bindings','puzzle_first_finishers'] LOOP
  EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated',t);
 END LOOP;
END $$;

-- A stable baseline for existing first finishes. Never promote the runner-up on
-- deletion/exclusion. Future capture is provided below, but not attached here.
INSERT INTO private.puzzle_first_finishers(season_id,puzzle_id,user_id,completed_at,excluded)
 SELECT DISTINCT ON(c.season_id,c.puzzle_id) c.season_id,c.puzzle_id,c.user_id,c.completed_at,c.excluded
 FROM public.semester_completions c JOIN public.puzzle_catalog p USING(season_id,puzzle_id)
 WHERE p.status='published' AND p.published_at<=clock_timestamp()
 ORDER BY c.season_id,c.puzzle_id,c.completed_at,c.nickname,c.user_id NULLS FIRST;

CREATE FUNCTION private.assert_cosmetic_access() RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE season text;
BEGIN
 IF auth.uid() IS NULL OR coalesce(auth.jwt()->'app_metadata'->>'provider','')<>'google' THEN RAISE EXCEPTION 'LOGIN_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.cosmetic_settings WHERE id AND enabled) THEN RAISE EXCEPTION 'COSMETICS_DISABLED'; END IF;
 SELECT n.season_id INTO season FROM public.semester_nicknames n JOIN public.semester_settings s ON s.id AND s.active_season=n.season_id WHERE n.user_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_REQUIRED'; END IF;
 RETURN season;
END $$;

-- No modulo bias. pgcrypto is installed in extensions on this project.
CREATE FUNCTION private.cosmetic_random_below(upper_bound integer) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE bytes bytea; value bigint; cutoff bigint;
BEGIN
 IF upper_bound IS NULL OR upper_bound<1 THEN RAISE EXCEPTION 'INVALID_RANDOM_BOUND'; END IF;
 cutoff:=4294967296-mod(4294967296::bigint,upper_bound);
 LOOP
  bytes:=extensions.gen_random_bytes(4);
  value:=get_byte(bytes,0)::bigint*16777216+get_byte(bytes,1)::bigint*65536+get_byte(bytes,2)::bigint*256+get_byte(bytes,3);
  IF value<cutoff THEN RETURN mod(value,upper_bound)::integer; END IF;
 END LOOP;
END $$;

CREATE FUNCTION private.cosmetic_state() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object(
  'coins',coalesce((SELECT balance FROM private.account_coin_wallets WHERE user_id=auth.uid()),0),
  'state_revision',coalesce((SELECT revision FROM private.account_coin_wallets WHERE user_id=auth.uid()),0),
  'inventory',coalesce((SELECT jsonb_agg(jsonb_build_object('item_id',i.item_id,'quantity',i.quantity,'kind',i.item_kind,'name',d.name,'definition',d.definition) ORDER BY i.item_id)
   FROM private.cosmetic_inventory i JOIN private.cosmetic_items d ON d.id=i.item_id WHERE i.user_id=auth.uid()),'[]'::jsonb),
  'equipment',coalesce((SELECT to_jsonb(e)-'user_id' FROM private.cosmetic_equipment e WHERE user_id=auth.uid()),
   '{"equipment_version":0,"icon_id":null,"color_id":null,"effect_id":null,"expression":"gradient","direction":"diagonal"}'::jsonb),
  'tickets',(SELECT balance FROM private.time_machine_wallets WHERE user_id=auth.uid()));
$$;
CREATE FUNCTION private.cosmetic_usage() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('draw_count',(SELECT count(*) FROM private.account_operations o JOIN private.cosmetic_results r ON r.operation_id=o.id WHERE o.user_id=auth.uid() AND o.kind='draw' AND o.status='completed'),
  'craft_count',(SELECT count(*) FROM private.account_operations WHERE user_id=auth.uid() AND kind='craft' AND status='completed'));
$$;
CREATE FUNCTION private.complete_cosmetic_request(target_operation uuid, details jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE op private.account_operations;
BEGIN
 op:=private.finish_cosmetic_operation(target_operation,details);
 UPDATE private.account_operations SET response=op.response || jsonb_build_object('state',private.cosmetic_state(),'progress',private.cosmetic_usage())
 WHERE id=op.id RETURNING * INTO op;
 RETURN op.response;
END $$;

CREATE FUNCTION private.award_cosmetic_item(target_operation uuid, target_item text, result_index integer, allow_refund boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item private.cosmetic_items; owner_id uuid; is_duplicate boolean; refund bigint:=0;
BEGIN
 SELECT user_id INTO owner_id FROM private.account_operations WHERE id=target_operation AND status='pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_OPERATION'; END IF;
 SELECT * INTO item FROM private.cosmetic_items WHERE id=target_item AND active;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ITEM'; END IF;
 is_duplicate:=item.kind<>'common_color' AND EXISTS(SELECT 1 FROM private.cosmetic_inventory WHERE user_id=owner_id AND item_id=target_item);
 IF is_duplicate THEN
  IF allow_refund THEN
   refund:=CASE WHEN item.kind='effect' THEN 500 WHEN item.kind IN ('uncommon_color','rare_color') THEN 100 ELSE 0 END;
   IF refund>0 THEN PERFORM private.change_cosmetic_coins(target_operation,refund,'duplicate'); END IF;
  END IF;
 ELSE
  PERFORM private.change_cosmetic_inventory(target_operation,target_item,1,'award');
 END IF;
 IF result_index IS NOT NULL THEN
  INSERT INTO private.cosmetic_results(operation_id,item_index,item_id,duplicate,refund_coins) VALUES(target_operation,result_index,target_item,is_duplicate,refund);
 END IF;
 RETURN jsonb_build_object('item_id',target_item,'name',item.name,'kind',item.kind,'definition',item.definition,'duplicate',is_duplicate,'refund_coins',refund);
END $$;

CREATE FUNCTION public.cosmetic_context() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.assert_cosmetic_access();
 RETURN jsonb_build_object('state',private.cosmetic_state(),'progress',private.cosmetic_usage(),
  'draw', (SELECT jsonb_build_object('version',version,'status',status,'price_per_draw',price_per_draw,
   'weights',jsonb_build_object('common',common_weight,'rare',rare_weight,'epic',epic_weight),
   'items',definition) FROM private.cosmetic_draw_configs WHERE status='active'),
  'catalog',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'kind',kind,'name',name,'definition',definition) ORDER BY id)
   FROM private.cosmetic_items WHERE active AND kind<>'uncommon_color'),'[]'::jsonb));
END $$;
CREATE FUNCTION public.cosmetic_operation(request_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.assert_cosmetic_access();
 RETURN (SELECT response FROM private.account_operations WHERE user_id=auth.uid() AND account_operations.request_id=cosmetic_operation.request_id AND status='completed');
END $$;

CREATE FUNCTION public.set_cosmetic_equipment(expected_equipment_version bigint, equipment jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_equipment private.cosmetic_equipment; picked text; field text;
 icon_value text; color_value text; effect_value text; expression_value text; direction_value text;
BEGIN
 PERFORM private.assert_cosmetic_access();
 IF equipment IS NULL OR jsonb_typeof(equipment)<>'object' OR expected_equipment_version IS NULL OR expected_equipment_version<0
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(equipment) k WHERE k NOT IN ('icon_id','color_id','effect_id','expression','direction')) THEN RAISE EXCEPTION 'INVALID_EQUIPMENT'; END IF;
 icon_value:=equipment->>'icon_id'; color_value:=equipment->>'color_id'; effect_value:=equipment->>'effect_id';
 expression_value:=coalesce(equipment->>'expression','gradient'); direction_value:=coalesce(equipment->>'direction','diagonal');
 IF expression_value NOT IN ('gradient','split') OR direction_value NOT IN ('diagonal','horizontal') THEN RAISE EXCEPTION 'INVALID_EQUIPMENT'; END IF;
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
  AND current_equipment.effect_id IS NOT DISTINCT FROM effect_value AND current_equipment.expression=expression_value AND current_equipment.direction=direction_value THEN
  RETURN jsonb_build_object('state',private.cosmetic_state(),'unchanged',true);
 END IF;
 IF current_equipment.equipment_version<>expected_equipment_version THEN RAISE EXCEPTION 'EQUIPMENT_CHANGED'; END IF;
 UPDATE private.cosmetic_equipment SET icon_id=icon_value,color_id=color_value,effect_id=effect_value,
  expression=expression_value,direction=direction_value,equipment_version=equipment_version+1 WHERE user_id=auth.uid();
 RETURN jsonb_build_object('state',private.cosmetic_state(),'unchanged',false);
END $$;

CREATE FUNCTION public.draw_cosmetics(request_id uuid, expected_draw_config_version integer, count integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE op private.account_operations; config private.cosmetic_draw_configs; roll integer; pool text; picked text;
 results jsonb:='[]'; i integer; ids jsonb; required_kind text;
BEGIN
 PERFORM private.assert_cosmetic_access();
 IF count IS NULL OR count NOT IN (1,10) OR expected_draw_config_version IS NULL THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
 op:=private.begin_cosmetic_operation(request_id,'draw',jsonb_build_object('count',count,'config_version',expected_draw_config_version));
 IF op.status='completed' THEN RETURN op.response; END IF;
 SELECT * INTO config FROM private.cosmetic_draw_configs WHERE status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'DRAW_NOT_CONFIGURED'; END IF;
 IF config.version<>expected_draw_config_version THEN RAISE EXCEPTION 'CONFIG_CHANGED'; END IF;
 FOREACH pool IN ARRAY ARRAY['common','rare','effects'] LOOP
  ids:=config.definition->pool;
  required_kind:=CASE pool WHEN 'common' THEN 'common_color' WHEN 'rare' THEN 'rare_color' ELSE 'effect' END;
  IF jsonb_typeof(ids) IS DISTINCT FROM 'array' OR jsonb_array_length(ids)=0 THEN RAISE EXCEPTION 'INVALID_DRAW_CONFIG'; END IF;
  IF (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(ids))<>jsonb_array_length(ids)
   OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(ids) x WHERE NOT EXISTS(SELECT 1 FROM private.cosmetic_items d WHERE d.id=x.value AND d.active AND d.kind=required_kind AND d.id<>'effect:sparkle'))
   THEN RAISE EXCEPTION 'INVALID_DRAW_CONFIG'; END IF;
 END LOOP;
 UPDATE private.account_operations SET config_version=config.version WHERE id=op.id;
 PERFORM private.change_cosmetic_coins(op.id,-config.price_per_draw*count,'draw');
 FOR i IN 1..count LOOP
  roll:=private.cosmetic_random_below(10000);
  pool:=CASE WHEN roll<config.common_weight THEN 'common' WHEN roll<config.common_weight+config.rare_weight THEN 'rare' ELSE 'effects' END;
  ids:=config.definition->pool;
  picked:=ids->>private.cosmetic_random_below(jsonb_array_length(ids));
  results:=results || jsonb_build_array(private.award_cosmetic_item(op.id,picked,i,true));
 END LOOP;
 RETURN private.complete_cosmetic_request(op.id,jsonb_build_object('ok',true,'results',results,'cost',config.price_per_draw*count,'config_version',config.version));
END $$;

CREATE FUNCTION public.craft_cosmetic(request_id uuid, material_ids text[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE op private.account_operations; materials text[]; colors text[]; selected_a text; selected_b text; pair_id text;
 pair_name text; pair_definition jsonb; material record; roll integer; result jsonb;
BEGIN
 PERFORM private.assert_cosmetic_access();
 IF material_ids IS NULL OR cardinality(material_ids)<>3 OR array_ndims(material_ids)<>1 OR array_position(material_ids,NULL) IS NOT NULL THEN RAISE EXCEPTION 'INVALID_MATERIALS'; END IF;
 SELECT array_agg(x ORDER BY x) INTO materials FROM unnest(material_ids) x;
 op:=private.begin_cosmetic_operation(request_id,'craft',jsonb_build_object('materials',materials));
 IF op.status='completed' THEN RETURN op.response; END IF;
 FOR material IN SELECT x AS id,count(*) AS needed FROM unnest(materials) x GROUP BY x LOOP
  IF NOT EXISTS(SELECT 1 FROM private.cosmetic_items d JOIN private.cosmetic_inventory i ON i.item_id=d.id
   WHERE d.id=material.id AND d.kind='common_color' AND d.active AND i.user_id=auth.uid() AND i.quantity>=material.needed) THEN RAISE EXCEPTION 'INSUFFICIENT_MATERIALS'; END IF;
 END LOOP;
 SELECT array_agg(DISTINCT x ORDER BY x) INTO colors FROM unnest(materials) x;
 IF cardinality(colors)=3 THEN
  roll:=private.cosmetic_random_below(3);
  selected_a:=colors[CASE WHEN roll=2 THEN 2 ELSE 1 END]; selected_b:=colors[CASE WHEN roll=0 THEN 2 ELSE 3 END];
 ELSE
  selected_a:=colors[1]; selected_b:=colors[cardinality(colors)];
 END IF;
 pair_id:='uncommon:'||selected_a||':'||selected_b;
 SELECT CASE WHEN a.id=b.id THEN a.name ELSE a.name||' · '||b.name END,
  jsonb_build_object('a',a.definition->>'a','b',b.definition->>'a') INTO pair_name,pair_definition
 FROM private.cosmetic_items a CROSS JOIN private.cosmetic_items b WHERE a.id=selected_a AND b.id=selected_b;
 INSERT INTO private.cosmetic_items(id,kind,name,definition,color_a,color_b) VALUES(pair_id,'uncommon_color',pair_name,pair_definition,selected_a,selected_b) ON CONFLICT DO NOTHING;
 FOR material IN SELECT x AS id,count(*) AS needed FROM unnest(materials) x GROUP BY x LOOP
  PERFORM private.change_cosmetic_inventory(op.id,material.id,-material.needed,'craft');
 END LOOP;
 result:=private.award_cosmetic_item(op.id,pair_id,1,true);
 INSERT INTO private.cosmetic_equipment(user_id,color_id,equipment_version) VALUES(auth.uid(),pair_id,1)
 ON CONFLICT(user_id) DO UPDATE SET color_id=excluded.color_id,equipment_version=private.cosmetic_equipment.equipment_version+1;
 RETURN private.complete_cosmetic_request(op.id,jsonb_build_object('ok',true,'results',jsonb_build_array(result),'materials',materials));
END $$;

CREATE TABLE private.achievement_stage_rewards (
 achievement_id text NOT NULL REFERENCES private.achievement_rules(id),
 threshold bigint NOT NULL CHECK(threshold>0),
 item_id text NOT NULL REFERENCES private.cosmetic_items(id),
 PRIMARY KEY(achievement_id,threshold)
);
ALTER TABLE private.achievement_stage_rewards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.achievement_stage_rewards FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.capture_puzzle_first_finisher(target_season text, target_puzzle text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('cosmetic-first:'||target_season||':'||target_puzzle,0));
 INSERT INTO private.puzzle_first_finishers(season_id,puzzle_id,user_id,completed_at,excluded)
 SELECT c.season_id,c.puzzle_id,c.user_id,c.completed_at,c.excluded FROM public.semester_completions c
 WHERE c.season_id=target_season AND c.puzzle_id=target_puzzle
 ORDER BY c.completed_at,c.nickname,c.user_id NULLS FIRST LIMIT 1 ON CONFLICT DO NOTHING;
END $$;

CREATE FUNCTION private.cosmetic_streak_peak(days date[]) RETURNS bigint
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 WITH ordered AS (SELECT d,lag(d) OVER(ORDER BY d) AS prior FROM (SELECT DISTINCT d FROM unnest(days) d WHERE d>=date '2026-09-19') s),
 runs AS (SELECT sum(CASE WHEN prior IS NULL OR d-prior>2 THEN 1 ELSE 0 END) OVER(ORDER BY d) AS run FROM ordered)
 SELECT coalesce(max(length),0) FROM (SELECT count(*) AS length FROM runs GROUP BY run) lengths;
$$;

CREATE FUNCTION private.achievement_metric(rule private.achievement_rules, season text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
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
    WHEN 'easy' THEN p.difficulty IN ('하','쉬움') WHEN 'medium' THEN p.difficulty IN ('중','중간') WHEN 'hard' THEN p.difficulty IN ('상','어려움')
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
  eligible:=private.cosmetic_streak_peak(dates);
 WHEN 'equipped' THEN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM private.cosmetic_equipment e JOIN private.cosmetic_inventory i ON i.user_id=e.user_id AND i.item_id=e.icon_id WHERE e.user_id=auth.uid()) THEN 1 ELSE 0 END INTO value;
  eligible:=value;
 WHEN 'draw' THEN value:=(private.cosmetic_usage()->>'draw_count')::bigint; eligible:=value;
 WHEN 'craft' THEN value:=(private.cosmetic_usage()->>'craft_count')::bigint; eligible:=value;
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
END $$;

CREATE FUNCTION private.achievement_rows(season text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE rule private.achievement_rules; scope text; metric jsonb; goal bigint; item text; coins bigint;
 rows jsonb:='[]'; row_status text; policy_ready boolean;
BEGIN
 FOR rule IN SELECT * FROM private.achievement_rules WHERE active ORDER BY sort_order,id LOOP
  scope:=CASE WHEN rule.account_scope THEN 'account' ELSE 'season:'||season END;
  metric:=private.achievement_metric(rule,season);
  SELECT r.threshold,r.item_id INTO goal,item FROM private.achievement_stage_rewards r
   WHERE r.achievement_id=rule.id AND NOT EXISTS(SELECT 1 FROM private.mission_claims c WHERE c.user_id=auth.uid() AND c.scope_key=scope AND c.mission_id=rule.id AND c.threshold=r.threshold)
   ORDER BY r.threshold LIMIT 1;
  coins:=NULL;
  IF goal IS NULL AND rule.repeat_every IS NOT NULL THEN
   SELECT coalesce(max(c.threshold),rule.first_goal)+rule.repeat_every INTO goal FROM private.mission_claims c WHERE c.user_id=auth.uid() AND c.scope_key=scope AND c.mission_id=rule.id;
   item:=NULL; coins:=rule.repeat_coins;
  END IF;
  policy_ready:=rule.metric IN ('equipped','draw','craft') OR EXISTS(SELECT 1 FROM private.cosmetic_settings WHERE id AND history_policy IS NOT NULL);
  row_status:=CASE WHEN goal IS NULL THEN 'completed' WHEN (metric->>'eligible')::bigint>=goal THEN 'claimable' ELSE 'in_progress' END;
  rows:=rows || jsonb_build_array(jsonb_build_object('id',rule.id,'name',rule.name,'description',rule.description,'category',rule.category,
   'rule_version',rule.version,'display_item_id',coalesce(item,rule.reward_item),'scope_key',scope,'current',metric->'current','threshold',goal,
   'goal',CASE WHEN rule.metric='all' THEN metric->'total' ELSE to_jsonb(goal) END,
   'state',row_status,'active',CASE WHEN rule.metric='all' THEN (metric->>'total')::bigint>0 WHEN rule.metric='bound' AND rule.category='group' THEN (metric->>'total')::bigint>=3 ELSE true END,
   'reward',CASE WHEN goal IS NULL THEN NULL WHEN item IS NOT NULL THEN jsonb_build_object('item_id',item) ELSE jsonb_build_object('coins',coins) END,
   'configured',policy_ready AND (item IS NOT NULL OR coins IS NOT NULL OR goal IS NULL)));
 END LOOP;
 RETURN rows;
END $$;

CREATE FUNCTION private.daily_task_rows() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH today AS (SELECT (statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date AS day),
 tasks AS (
  SELECT 'attendance' AS id,'출석 체크' AS name,20::bigint AS coins,NULL::integer AS tickets,
   EXISTS(SELECT 1 FROM private.site_visits v,today t WHERE v.user_id=auth.uid() AND v.day=t.day) AS complete,false AS unavailable
  UNION ALL
  SELECT 'daily-complete','하루 한 문제',100,NULL,
   EXISTS(SELECT 1 FROM public.semester_completions c JOIN public.puzzle_catalog p USING(season_id,puzzle_id),today t
    WHERE c.user_id=auth.uid() AND NOT c.excluded AND p.status='published' AND p.published_at<=statement_timestamp()
     AND c.completed_at>=(t.day::timestamp AT TIME ZONE 'Asia/Seoul') AND c.completed_at<((t.day+1)::timestamp AT TIME ZONE 'Asia/Seoul'))
   OR EXISTS(SELECT 1 FROM public.daily_sudoku_completions c,today t WHERE c.user_id=auth.uid() AND NOT c.excluded
    AND c.completed_at>=(t.day::timestamp AT TIME ZONE 'Asia/Seoul') AND c.completed_at<((t.day+1)::timestamp AT TIME ZONE 'Asia/Seoul')),false
  UNION ALL
  SELECT 'daily-champion','데일리 챔피언',NULL,(SELECT champion_tickets FROM private.cosmetic_settings WHERE id),
   EXISTS(SELECT 1 FROM public.daily_sudoku_completions c,today t WHERE c.day=t.day AND c.user_id=auth.uid() AND c.rank=1 AND NOT c.excluded),
   EXISTS(SELECT 1 FROM public.daily_sudoku_completions c,today t WHERE c.day=t.day AND c.rank=1 AND (c.user_id IS DISTINCT FROM auth.uid() OR c.excluded))
 )
 SELECT jsonb_agg(jsonb_build_object('id',q.id,'name',q.name,'day',t.day,'complete',q.complete,
  'state',CASE WHEN c.operation_id IS NOT NULL THEN 'completed' WHEN q.complete THEN 'claimable' WHEN q.unavailable THEN 'unavailable' ELSE 'in_progress' END,
  'reward',CASE WHEN q.coins IS NOT NULL THEN jsonb_build_object('coins',q.coins) ELSE jsonb_build_object('tickets',q.tickets) END,
  'configured',q.coins IS NOT NULL OR q.tickets IS NOT NULL) ORDER BY CASE q.id WHEN 'attendance' THEN 1 WHEN 'daily-complete' THEN 2 ELSE 3 END)
 FROM tasks q CROSS JOIN today t LEFT JOIN private.mission_claims c ON c.user_id=auth.uid() AND c.scope_key='day:'||t.day::text AND c.mission_id=q.id AND c.threshold=1;
$$;

CREATE FUNCTION public.achievement_context() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE season text;
BEGIN
 season:=private.assert_cosmetic_access();
 RETURN jsonb_build_object('season',season,'current_day',(statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date,
  'state',private.cosmetic_state(),'achievements',private.achievement_rows(season),'daily_tasks',private.daily_task_rows());
END $$;

CREATE FUNCTION public.record_site_visit(request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE today date:=(statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date;
BEGIN
 PERFORM private.assert_cosmetic_access();
 IF request_id IS NULL THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
 INSERT INTO private.site_visits(user_id,day) VALUES(auth.uid(),today) ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('day',today,'daily_tasks',private.daily_task_rows());
END $$;

CREATE FUNCTION public.claim_achievement(request_id uuid, achievement_id text, scope_key text, threshold bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE season text; op private.account_operations; rule private.achievement_rules; row_data jsonb; reward jsonb; award jsonb;
BEGIN
 season:=private.assert_cosmetic_access();
 IF achievement_id IS NULL OR scope_key IS NULL OR threshold IS NULL OR threshold<1 THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
 op:=private.begin_cosmetic_operation(request_id,'achievement_claim',jsonb_build_object('achievement_id',achievement_id,'scope_key',scope_key,'threshold',threshold));
 IF op.status='completed' THEN RETURN op.response; END IF;
 -- A different request UUID for a previously claimed stage never pays again.
 IF EXISTS(SELECT 1 FROM private.mission_claims c WHERE c.user_id=auth.uid() AND c.scope_key=claim_achievement.scope_key AND c.mission_id=achievement_id AND c.threshold=claim_achievement.threshold) THEN
  RETURN private.complete_cosmetic_request(op.id,jsonb_build_object('ok',true,'already_claimed',true));
 END IF;
 SELECT * INTO rule FROM private.achievement_rules WHERE id=achievement_id AND active;
 IF NOT FOUND THEN RAISE EXCEPTION 'UNKNOWN_ACHIEVEMENT'; END IF;
 IF rule.metric='first_blood' THEN
  PERFORM private.capture_puzzle_first_finisher(p.season_id,p.puzzle_id) FROM public.puzzle_catalog p WHERE p.season_id=season AND p.status='published' AND p.published_at<=clock_timestamp() ORDER BY p.season_id,p.puzzle_id;
 END IF;
 SELECT value INTO row_data FROM jsonb_array_elements(private.achievement_rows(season)) WHERE value->>'id'=achievement_id;
 IF row_data->>'scope_key'<>scope_key OR (row_data->>'threshold')::bigint IS DISTINCT FROM threshold THEN RAISE EXCEPTION 'INVALID_STAGE'; END IF;
 IF NOT (row_data->>'configured')::boolean THEN RAISE EXCEPTION 'REWARD_NOT_CONFIGURED'; END IF;
 IF NOT (row_data->>'active')::boolean OR row_data->>'state'<>'claimable' THEN RAISE EXCEPTION 'ACHIEVEMENT_NOT_READY'; END IF;
 reward:=row_data->'reward';
 IF reward ? 'item_id' THEN
  award:=private.award_cosmetic_item(op.id,reward->>'item_id',NULL,false);
 ELSE
  PERFORM private.change_cosmetic_coins(op.id,(reward->>'coins')::bigint,'achievement');
 END IF;
 IF rule.metric='all' THEN
  reward:=reward || jsonb_build_object('puzzle_ids',(SELECT jsonb_agg(puzzle_id ORDER BY puzzle_id) FROM public.puzzle_catalog WHERE season_id=season AND status='published' AND published_at<=statement_timestamp()));
 END IF;
 INSERT INTO private.mission_claims(user_id,scope_key,mission_id,threshold,operation_id,rule_version,reward)
 VALUES(auth.uid(),scope_key,achievement_id,threshold,op.id,rule.version,reward);
 RETURN private.complete_cosmetic_request(op.id,jsonb_build_object('ok',true,'already_claimed',false,'reward',reward,'award',award,'achievements',private.achievement_rows(season)));
END $$;

CREATE FUNCTION private.award_cosmetic_tickets(target_operation uuid, amount integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i integer;
BEGIN
 IF amount IS NULL OR amount<1 OR NOT EXISTS(SELECT 1 FROM private.account_operations WHERE id=target_operation AND user_id=auth.uid() AND status='pending') THEN RAISE EXCEPTION 'INVALID_OPERATION'; END IF;
 PERFORM private.ensure_time_machine_wallet();
 PERFORM 1 FROM private.time_machine_wallets WHERE user_id=auth.uid() FOR UPDATE;
 FOR i IN 1..amount LOOP
  UPDATE private.time_machine_wallets SET balance=balance+1,updated_at=clock_timestamp() WHERE user_id=auth.uid();
  INSERT INTO private.time_machine_ticket_events(user_id,event_key,delta,balance_after)
   SELECT auth.uid(),'cosmetic:'||target_operation::text||':'||i::text,1,balance FROM private.time_machine_wallets WHERE user_id=auth.uid();
 END LOOP;
END $$;

CREATE FUNCTION public.claim_daily_task(request_id uuid, task_key text, target_day date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
END $$;

-- Approved mission rules only; repeat coin amounts deliberately remain NULL.
INSERT INTO private.achievement_rules(id,name,description,category,metric,account_scope,first_goal,reward_item,repeat_every,sort_order) VALUES
 ('first','첫걸음','일반 문제 풀기','basic','normal',false,1,'icon:leaf',NULL,0),
 ('regular','퍼즐 수집가','일반 문제 풀기','basic','normal',false,10,'icon:puzzle',10,1),
 ('daily','꺼지지 않는 불','데일리 스도쿠 연속으로 풀기','basic','streak',true,7,'icon:flame',7,2),
 ('easy','체리피커','난이도 하 일반 문제 풀기','basic','easy',false,10,'icon:cherry',10,3),
 ('medium','두뇌 회전','난이도 중 일반 문제 풀기','basic','medium',false,10,'icon:brain',10,4),
 ('hard','하드코어','난이도 상 일반 문제 풀기','basic','hard',false,10,'icon:skull',10,5),
 ('first-blood','퍼스트 블러드','일반 문제를 1등으로 풀기','basic','first_blood',false,1,'icon:sword',NULL,6),
 ('stars','별 수집가','스타배틀 계열 문제 풀기','group','bound',false,3,'icon:star',NULL,7),
 ('thermo','온도 체크','온도계 스도쿠 풀기','group','bound',false,3,'icon:temperature',NULL,8),
 ('math','숫자놀음','수식완성 문제 풀기','group','bound',false,3,'icon:number-123',NULL,9),
 ('galaxies','은하 개척자','Spiral Galaxies 문제 풀기','group','bound',false,3,'icon:galaxy',NULL,10),
 ('chuseok','한가위 스도쿠','『한가위 스도쿠』 풀기','special','bound',false,1,'icon:rabbit',NULL,11),
 ('flower','란영 스도쿠','『란영 스도쿠』 풀기','special','bound',false,1,'icon:flower',NULL,12),
 ('bomb','봄버스터즈 스도쿠','『봄버스터즈 스도쿠』 풀기','special','bound',false,1,'icon:bomb',NULL,13),
 ('tomato','토마토스 스도쿠','『토마토스 스도쿠』 풀기','special','bound',false,1,'icon:tomato',NULL,14),
 ('marble','주루마블 스도쿠','『주루마블 스도쿠』 풀기','special','bound',false,1,'icon:glass',NULL,15),
 ('all','완전 정복','해당 학기 일반 문제 모두 풀기','special','all',false,1,'effect:sparkle',NULL,16),
 ('feature-equip-icon','멋쟁이','아이콘 장착하기','basic','equipped',true,1,'icon:hanger',NULL,17),
 ('feature-draw','행운의 손','색깔·효과 뽑기','basic','draw',true,5,'icon:clover',5,18),
 ('feature-craft','연금술사','색깔 조합하기','basic','craft',true,5,'icon:flask',5,19);
INSERT INTO private.achievement_stage_rewards(achievement_id,threshold,item_id) VALUES
 ('first',1,'icon:leaf'),
 ('regular',10,'icon:puzzle'),
 ('daily',7,'icon:flame'),
 ('easy',10,'icon:cherry'),
 ('medium',10,'icon:brain'),
 ('hard',10,'icon:skull'),
 ('first-blood',1,'icon:sword'),
 ('first-blood',3,'icon:swords'),
 ('first-blood',10,'icon:crown'),
 ('stars',3,'icon:star'),
 ('thermo',3,'icon:temperature'),
 ('math',3,'icon:number-123'),
 ('galaxies',3,'icon:galaxy'),
 ('chuseok',1,'icon:rabbit'),
 ('flower',1,'icon:flower'),
 ('bomb',1,'icon:bomb'),
 ('tomato',1,'icon:tomato'),
 ('marble',1,'icon:glass'),
 ('all',1,'effect:sparkle'),
 ('feature-equip-icon',1,'icon:hanger'),
 ('feature-draw',5,'icon:clover'),
 ('feature-craft',5,'icon:flask');
INSERT INTO private.achievement_puzzle_bindings(achievement_id,season_id,puzzle_id) VALUES
 ('stars','2026-2','261017_01'),
 ('stars','2026-2','261016_01'),
 ('stars','2026-2','261015_01'),
 ('stars','2026-2','261014_01'),
 ('stars','2026-2','261003_02'),
 ('stars','2026-2','261011_01'),
 ('stars','2026-2','261010_01'),
 ('stars','2026-2','261010_02'),
 ('thermo','2026-2','260918_01'),
 ('thermo','2026-2','260918_02'),
 ('thermo','2026-2','260917_01'),
 ('thermo','2026-2','260917_02'),
 ('thermo','2026-2','260917_03'),
 ('math','2026-2','260922_01'),
 ('math','2026-2','260922_02'),
 ('math','2026-2','260922_03'),
 ('galaxies','2026-2','261101_04'),
 ('galaxies','2026-2','261101_05'),
 ('galaxies','2026-2','261101_06'),
 ('chuseok','2026-2','260925_01'),
 ('flower','2026-2','260928_03'),
 ('bomb','2026-2','261003_01'),
 ('tomato','2026-2','261005_01'),
 ('marble','2026-2','261101_03');

-- Future completion integration can compare these without storing achievement
-- progress or a toast log. No existing completion RPC calls these yet.
CREATE FUNCTION private.achievement_milestone_snapshot(season text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_object_agg(r.id,private.achievement_metric(r,season)->'eligible'),'{}'::jsonb)
 FROM private.achievement_rules r WHERE r.active;
$$;
CREATE FUNCTION private.achievement_milestone_diff(before_state jsonb, after_state jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r private.achievement_rules; prior bigint; current_value bigint; crossed bigint; notifications jsonb:='[]'; step record;
BEGIN
 FOR r IN SELECT * FROM private.achievement_rules WHERE active ORDER BY sort_order,id LOOP
  prior:=coalesce((before_state->>r.id)::bigint,0); current_value:=coalesce((after_state->>r.id)::bigint,0);
  IF current_value<=prior THEN CONTINUE; END IF;
  FOR step IN SELECT threshold FROM private.achievement_stage_rewards WHERE achievement_id=r.id AND threshold>prior AND threshold<=current_value ORDER BY threshold LOOP
   notifications:=notifications || jsonb_build_array(jsonb_build_object('id',r.id,'name',r.name,'threshold',step.threshold));
  END LOOP;
  IF r.repeat_every IS NOT NULL AND current_value>=r.first_goal+r.repeat_every THEN
   crossed:=r.first_goal+((greatest(prior,r.first_goal)-r.first_goal)/r.repeat_every+1)*r.repeat_every;
   WHILE crossed<=current_value LOOP
    notifications:=notifications || jsonb_build_array(jsonb_build_object('id',r.id,'name',r.name,'threshold',crossed));
    crossed:=crossed+r.repeat_every;
   END LOOP;
  END IF;
 END LOOP;
 RETURN notifications;
END $$;

-- Keep all helpers private; expose only gated, caller-scoped RPCs.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='private' AND p.proname IN ('freeze_cosmetic_draw_config','assert_cosmetic_access','cosmetic_random_below','cosmetic_state','cosmetic_usage',
   'complete_cosmetic_request','award_cosmetic_tickets','award_cosmetic_item','capture_puzzle_first_finisher','cosmetic_streak_peak',
   'achievement_metric','achievement_rows','daily_task_rows','achievement_milestone_snapshot','achievement_milestone_diff') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
 END LOOP;
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('cosmetic_context','cosmetic_operation','set_cosmetic_equipment','draw_cosmetics',
   'craft_cosmetic','achievement_context','record_site_visit','claim_achievement','claim_daily_task') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
