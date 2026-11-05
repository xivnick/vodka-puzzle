BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
-- Refuse to silently discard an unknown custom difficulty.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.puzzle_catalog WHERE difficulty IS NOT NULL
  AND lower(btrim(difficulty)) NOT IN ('','0','1','2','3','하','쉬움','easy','중','중간','보통','medium','상','어려움','hard')) THEN
  RAISE EXCEPTION 'UNMAPPED_DIFFICULTY';
 END IF;
END $$;
ALTER TABLE public.puzzle_catalog DROP CONSTRAINT puzzle_catalog_difficulty_check;
ALTER TABLE public.puzzle_catalog ALTER COLUMN difficulty TYPE integer USING
 CASE lower(btrim(difficulty)) WHEN '1' THEN 1 WHEN '하' THEN 1 WHEN '쉬움' THEN 1 WHEN 'easy' THEN 1
  WHEN '2' THEN 2 WHEN '중' THEN 2 WHEN '중간' THEN 2 WHEN '보통' THEN 2 WHEN 'medium' THEN 2
  WHEN '3' THEN 3 WHEN '상' THEN 3 WHEN '어려움' THEN 3 WHEN 'hard' THEN 3 ELSE 0 END;
ALTER TABLE public.puzzle_catalog ALTER COLUMN difficulty SET DEFAULT 0,
 ALTER COLUMN difficulty SET NOT NULL,
 ADD CONSTRAINT puzzle_catalog_difficulty_check CHECK(difficulty BETWEEN 0 AND 3);

-- Keep the older 9-argument RPC (it preserves difficulty). Replace the
-- difficulty-writing signature rather than creating ambiguous PostgREST overloads.
DROP FUNCTION public.admin_update_puzzle(text,text,text,text,text,text,timestamptz,integer,timestamptz,text);
CREATE FUNCTION public.admin_update_puzzle(requested_season text,requested_puzzle text,
 new_title text,new_summary text,new_type text,new_status text,new_published_at timestamptz,
 new_sort_order integer,expected_updated_at timestamptz,new_difficulty integer) RETURNS public.puzzle_catalog
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_record public.puzzle_catalog; result public.puzzle_catalog;
BEGIN
 IF NOT public.is_puzzle_admin() THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
 IF new_title IS NULL OR char_length(btrim(new_title)) NOT BETWEEN 1 AND 120
  OR new_summary IS NULL OR char_length(btrim(new_summary)) NOT BETWEEN 1 AND 500
  OR new_type IS NULL OR char_length(btrim(new_type)) NOT BETWEEN 1 AND 80
  OR new_difficulty IS NULL OR new_difficulty NOT BETWEEN 0 AND 3
  OR new_status IS NULL OR new_status NOT IN ('draft','test','published')
  OR new_sort_order IS NULL OR new_sort_order NOT BETWEEN -100000 AND 100000
  OR (new_status='published' AND new_published_at IS NULL) THEN RAISE EXCEPTION 'INVALID_METADATA'; END IF;
 SELECT * INTO current_record FROM public.puzzle_catalog WHERE season_id=requested_season AND puzzle_id=requested_puzzle FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PUZZLE_NOT_FOUND'; END IF;
 IF expected_updated_at IS DISTINCT FROM current_record.updated_at THEN RAISE EXCEPTION 'EDIT_CONFLICT'; END IF;
 UPDATE public.puzzle_catalog SET title=btrim(new_title),summary=btrim(new_summary),puzzle_type=btrim(new_type),status=new_status,published_at=new_published_at,sort_order=new_sort_order,difficulty=new_difficulty
 WHERE season_id=requested_season AND puzzle_id=requested_puzzle RETURNING * INTO result;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.admin_update_puzzle(text,text,text,text,text,text,timestamptz,integer,timestamptz,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_puzzle(text,text,text,text,text,text,timestamptz,integer,timestamptz,integer) TO authenticated;


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


UPDATE private.achievement_rules SET description=CASE metric
 WHEN 'easy' THEN '난이도 1 일반 문제 풀기' WHEN 'medium' THEN '난이도 2 일반 문제 풀기' ELSE '난이도 3 일반 문제 풀기' END,
 version=version+1 WHERE metric IN ('easy','medium','hard');
NOTIFY pgrst,'reload schema';
COMMIT;
