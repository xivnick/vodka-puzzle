BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
-- The mission uses the same current streak shown in the daily puzzle.
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
END $function$
;
UPDATE private.achievement_rules SET version=version+1 WHERE id='daily';
COMMIT;
