BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
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
 RETURN (SELECT coalesce(jsonb_agg(n.value ORDER BY n.position),'[]'::jsonb)
  FROM jsonb_array_elements(notifications) WITH ORDINALITY n(value,position)
  WHERE NOT EXISTS(SELECT 1 FROM private.mission_claims c JOIN private.achievement_rules rule ON rule.id=c.mission_id
   WHERE c.user_id=auth.uid() AND c.mission_id=n.value->>'id' AND c.threshold=(n.value->>'threshold')::bigint
    AND c.scope_key=CASE WHEN rule.account_scope THEN 'account' ELSE 'season:'||(SELECT active_season FROM public.semester_settings WHERE id) END));
END $$;
COMMIT;
