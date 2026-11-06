BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM private.cosmetic_settings WHERE id AND enabled) THEN RAISE EXCEPTION 'COSMETICS_MUST_BE_DISABLED'; END IF;
END $$;
ALTER TABLE private.achievement_rules
 ADD COLUMN repeat_start bigint CHECK(repeat_start>first_goal),
 ADD COLUMN repeat_tickets integer CHECK(repeat_tickets>0),
 ADD COLUMN repeat_coin_options bigint[],
 ADD CHECK(num_nonnulls(repeat_coins,repeat_tickets,repeat_coin_options)<=1),
 ADD CHECK(repeat_every IS NOT NULL OR (repeat_start IS NULL AND repeat_tickets IS NULL AND repeat_coin_options IS NULL)),
 ADD CHECK(repeat_coin_options IS NULL OR (cardinality(repeat_coin_options)>0 AND array_ndims(repeat_coin_options)=1 AND array_lower(repeat_coin_options,1)=1 AND array_position(repeat_coin_options,NULL) IS NULL AND 0<ALL(repeat_coin_options)));
UPDATE private.achievement_rules SET
 repeat_coins=CASE id WHEN 'regular' THEN 100 WHEN 'easy' THEN 30 WHEN 'medium' THEN 60 WHEN 'hard' THEN 90 WHEN 'feature-craft' THEN 100 END,
 repeat_every=CASE WHEN id='daily' THEN 30 ELSE repeat_every END,
 repeat_start=CASE WHEN id='daily' THEN 30 END,
 repeat_tickets=CASE WHEN id='daily' THEN 1 END,
 repeat_coin_options=CASE WHEN id='feature-draw' THEN ARRAY[10,20,30,40,50,60,70,80,90,100]::bigint[] END,
 version=version+1
WHERE id IN ('regular','easy','medium','hard','daily','feature-draw','feature-craft');
-- Confirmed price, still a draft and still gated. Do not publish this config.
UPDATE private.cosmetic_draw_configs SET price_per_draw=100 WHERE version=1 AND status='draft' AND NOT sealed;

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
  policy_ready:=rule.metric IN ('equipped','draw','craft') OR EXISTS(SELECT 1 FROM private.cosmetic_settings WHERE id AND history_policy IS NOT NULL);
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

CREATE OR REPLACE FUNCTION public.claim_achievement(request_id uuid, achievement_id text, scope_key text, threshold bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE season text; op private.account_operations; rule private.achievement_rules; row_data jsonb; reward jsonb; award jsonb; amount bigint;
BEGIN
 season:=private.assert_cosmetic_access();
 IF achievement_id IS NULL OR scope_key IS NULL OR threshold IS NULL OR threshold<1 THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
 op:=private.begin_cosmetic_operation(request_id,'achievement_claim',jsonb_build_object('achievement_id',achievement_id,'scope_key',scope_key,'threshold',threshold));
 IF op.status='completed' THEN RETURN op.response; END IF;
 -- A different request UUID for a previously claimed stage never pays again.
 IF EXISTS(SELECT 1 FROM private.mission_claims c WHERE c.user_id=auth.uid() AND c.scope_key=claim_achievement.scope_key AND c.mission_id=achievement_id AND c.threshold=claim_achievement.threshold) THEN
  RETURN private.complete_cosmetic_request(op.id,jsonb_build_object('ok',true,'already_claimed',true));
 END IF;
 SELECT * INTO rule FROM private.achievement_rules WHERE id=achievement_id AND active FOR SHARE;
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
 ELSIF reward ? 'tickets' THEN
  PERFORM private.award_cosmetic_tickets(op.id,(reward->>'tickets')::integer);
 ELSE
  IF reward ? 'coin_options' THEN
   amount:=rule.repeat_coin_options[private.cosmetic_random_below(cardinality(rule.repeat_coin_options))+1];
   reward:=jsonb_build_object('coins',amount);
  END IF;
  PERFORM private.change_cosmetic_coins(op.id,(reward->>'coins')::bigint,'achievement');
 END IF;
 IF rule.metric='all' THEN
  reward:=reward || jsonb_build_object('puzzle_ids',(SELECT jsonb_agg(puzzle_id ORDER BY puzzle_id) FROM public.puzzle_catalog WHERE season_id=season AND status='published' AND published_at<=statement_timestamp()));
 END IF;
 INSERT INTO private.mission_claims(user_id,scope_key,mission_id,threshold,operation_id,rule_version,reward)
 VALUES(auth.uid(),scope_key,achievement_id,threshold,op.id,rule.version,reward);
 RETURN private.complete_cosmetic_request(op.id,jsonb_build_object('ok',true,'already_claimed',false,'reward',reward,'award',award,'achievements',private.achievement_rows(season)));
END $$;

CREATE OR REPLACE FUNCTION private.achievement_milestone_diff(before_state jsonb, after_state jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r private.achievement_rules; prior bigint; current_value bigint; crossed bigint; notifications jsonb:='[]'; step record; repeat_goal bigint;
BEGIN
 FOR r IN SELECT * FROM private.achievement_rules WHERE active ORDER BY sort_order,id LOOP
  prior:=coalesce((before_state->>r.id)::bigint,0); current_value:=coalesce((after_state->>r.id)::bigint,0);
  IF current_value<=prior THEN CONTINUE; END IF;
  FOR step IN SELECT threshold FROM private.achievement_stage_rewards WHERE achievement_id=r.id AND threshold>prior AND threshold<=current_value ORDER BY threshold LOOP
   notifications:=notifications || jsonb_build_array(jsonb_build_object('id',r.id,'name',r.name,'threshold',step.threshold));
  END LOOP;
  repeat_goal:=coalesce(r.repeat_start,r.first_goal+r.repeat_every);
  IF r.repeat_every IS NOT NULL AND current_value>=repeat_goal THEN
   crossed:=CASE WHEN prior<repeat_goal THEN repeat_goal ELSE repeat_goal+((prior-repeat_goal)/r.repeat_every+1)*r.repeat_every END;
   WHILE crossed<=current_value LOOP
    notifications:=notifications || jsonb_build_array(jsonb_build_object('id',r.id,'name',r.name,'threshold',crossed));
    crossed:=crossed+r.repeat_every;
   END LOOP;
  END IF;
 END LOOP;
 RETURN notifications;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
