BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
-- Fixed coin stages allow a final reward without creating a repeating mission.
ALTER TABLE private.achievement_stage_rewards
 ALTER COLUMN item_id DROP NOT NULL,
 ADD COLUMN coins bigint CHECK(coins>0),
 ADD CONSTRAINT achievement_stage_reward_exactly_one CHECK(num_nonnulls(item_id,coins)=1);

CREATE OR REPLACE FUNCTION private.achievement_rows(season text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE rule private.achievement_rules; scope text; metric jsonb; goal bigint; item text; coins bigint; repeat_goal bigint; last_goal bigint; reward jsonb;
 rows jsonb:='[]'; row_status text; policy_ready boolean;
BEGIN
 FOR rule IN SELECT * FROM private.achievement_rules WHERE active ORDER BY sort_order,id LOOP
  scope:=CASE WHEN rule.account_scope THEN 'account' ELSE 'season:'||season END;
  metric:=private.achievement_metric(rule,season);
  SELECT r.threshold,r.item_id,r.coins INTO goal,item,coins FROM private.achievement_stage_rewards r
   WHERE r.achievement_id=rule.id AND NOT EXISTS(SELECT 1 FROM private.mission_claims c WHERE c.user_id=auth.uid() AND c.scope_key=scope AND c.mission_id=rule.id AND c.threshold=r.threshold)
   ORDER BY r.threshold LIMIT 1;
  reward:=CASE WHEN coins IS NOT NULL THEN jsonb_build_object('coins',coins) END;
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

INSERT INTO private.cosmetic_items(id,kind,name,definition)
 VALUES('icon:raid','icon','3×3 격자','{"src":"/icons/achievement-preview/grid-3x3.svg"}');
INSERT INTO private.achievement_rules(id,name,description,category,metric,account_scope,first_goal,reward_item,sort_order)
 VALUES('raid','스도쿠 원정대','스도쿠 레이드 문제를 완료하세요.','group','bound',false,3,'icon:raid',21);
INSERT INTO private.achievement_stage_rewards(achievement_id,threshold,item_id,coins) VALUES
 ('raid',3,'icon:raid',NULL),
 ('raid',10,NULL,1000);
-- Only these ten published Raid puzzles count; unrelated Sudoku puzzles do not.
INSERT INTO private.achievement_puzzle_bindings(achievement_id,season_id,puzzle_id)
 SELECT 'raid','2026-2','261109_'||lpad(i::text,2,'0') FROM generate_series(1,10) i;
NOTIFY pgrst,'reload schema';
COMMIT;
