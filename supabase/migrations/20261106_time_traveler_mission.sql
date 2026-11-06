BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM private.cosmetic_settings WHERE id AND enabled) THEN RAISE EXCEPTION 'COSMETICS_MUST_BE_DISABLED'; END IF;
END $$;
ALTER TABLE private.achievement_rules DROP CONSTRAINT achievement_rules_metric_check;
ALTER TABLE private.achievement_rules ADD CHECK(metric IN ('normal','easy','medium','hard','streak','first_blood','bound','all','equipped','draw','craft','time_machine'));
-- Stable reward ID, inactive until the user selects one of the icon candidates.
INSERT INTO private.cosmetic_items(id,kind,name,definition,active) VALUES
 ('icon:time-traveler','icon','시간 여행','{"src":"/icons/achievement-preview/history.svg","pending_icon":true}',false);
INSERT INTO private.achievement_rules(id,name,description,category,metric,account_scope,first_goal,reward_item,repeat_every,active,sort_order)
 VALUES('time-traveler','시간 여행자','타임머신 이용하기','basic','time_machine',true,3,'icon:time-traveler',NULL,false,20);
INSERT INTO private.achievement_stage_rewards(achievement_id,threshold,item_id)
 VALUES('time-traveler',3,'icon:time-traveler');
CREATE OR REPLACE FUNCTION private.cosmetic_usage() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object(
  'draw_count',(SELECT count(*) FROM private.account_operations o JOIN private.cosmetic_results r ON r.operation_id=o.id WHERE o.user_id=auth.uid() AND o.kind='draw' AND o.status='completed'),
  'craft_count',(SELECT count(*) FROM private.account_operations WHERE user_id=auth.uid() AND kind='craft' AND status='completed'),
  'time_machine_count',(SELECT count(*) FROM private.time_machine_openings WHERE user_id=auth.uid()));
$$;

CREATE OR REPLACE FUNCTION private.achievement_metric(rule private.achievement_rules, season text) RETURNS jsonb
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
  eligible:=private.cosmetic_streak_peak(dates);
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
END $$;

CREATE OR REPLACE FUNCTION private.achievement_rows(season text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE rule private.achievement_rules; scope text; metric jsonb; goal bigint; item text; coins bigint; repeat_goal bigint; last_goal bigint; reward jsonb;
 rows jsonb:='[]'; row_status text; policy_ready boolean;
BEGIN
 FOR rule IN SELECT * FROM private.achievement_rules WHERE active ORDER BY sort_order,id LOOP
  scope:=CASE WHEN rule.account_scope THEN 'account' ELSE 'season:'||season END;
  metric:=private.achievement_metric(rule,season);
  SELECT r.threshold,r.item_id INTO goal,item FROM private.achievement_stage_rewards r
   WHERE r.achievement_id=rule.id AND NOT EXISTS(SELECT 1 FROM private.mission_claims c WHERE c.user_id=auth.uid() AND c.scope_key=scope AND c.mission_id=rule.id AND c.threshold=r.threshold)
   ORDER BY r.threshold LIMIT 1;
  coins:=NULL; reward:=NULL;
  IF goal IS NULL AND rule.repeat_every IS NOT NULL THEN
   repeat_goal:=coalesce(rule.repeat_start,rule.first_goal+rule.repeat_every);
   SELECT max(c.threshold) INTO last_goal FROM private.mission_claims c WHERE c.user_id=auth.uid() AND c.scope_key=scope AND c.mission_id=rule.id AND c.threshold>=repeat_goal AND (c.threshold-repeat_goal)%rule.repeat_every=0;
   goal:=coalesce(last_goal+rule.repeat_every,repeat_goal);
   item:=NULL; coins:=rule.repeat_coins;
   reward:=CASE WHEN rule.repeat_tickets IS NOT NULL THEN jsonb_build_object('tickets',rule.repeat_tickets)
    WHEN rule.repeat_coin_options IS NOT NULL THEN jsonb_build_object('coin_options',to_jsonb(rule.repeat_coin_options))
    WHEN coins IS NOT NULL THEN jsonb_build_object('coins',coins) END;
  END IF;
  policy_ready:=rule.metric IN ('equipped','draw','craft','time_machine') OR EXISTS(SELECT 1 FROM private.cosmetic_settings WHERE id AND history_policy IS NOT NULL);
  row_status:=CASE WHEN goal IS NULL THEN 'completed' WHEN (metric->>'eligible')::bigint>=goal THEN 'claimable' ELSE 'in_progress' END;
  rows:=rows || jsonb_build_array(jsonb_build_object('id',rule.id,'name',rule.name,'description',rule.description,'category',rule.category,
   'rule_version',rule.version,'display_item_id',coalesce(item,rule.reward_item),'scope_key',scope,'current',metric->'current','threshold',goal,
   'goal',CASE WHEN rule.metric='all' THEN metric->'total' ELSE to_jsonb(goal) END,
   'state',row_status,'active',CASE WHEN rule.metric='all' THEN (metric->>'total')::bigint>0 WHEN rule.metric='bound' AND rule.category='group' THEN (metric->>'total')::bigint>=3 ELSE true END,
   'reward',CASE WHEN goal IS NULL THEN NULL WHEN item IS NOT NULL THEN jsonb_build_object('item_id',item) ELSE reward END,
   'configured',policy_ready AND (item IS NOT NULL OR reward IS NOT NULL OR goal IS NULL)));
 END LOOP;
 RETURN rows;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
