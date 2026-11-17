BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='10s';
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
 IF current_setting('transaction_read_only')='on' THEN RETURN result; END IF;
 SELECT least(((statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date+1)::timestamp AT TIME ZONE 'Asia/Seoul',
 coalesce(min(published_at),'infinity'::timestamptz)) INTO expires FROM public.puzzle_catalog WHERE published_at>statement_timestamp();
 INSERT INTO private.achievement_metric_cache VALUES(auth.uid(),season,rule.id,result,expires,version)
 ON CONFLICT ON CONSTRAINT achievement_metric_cache_pkey DO UPDATE SET value=excluded.value,valid_until=excluded.valid_until,definition_version=excluded.definition_version;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.recent_completions()
RETURNS TABLE(nickname text,puzzle_id text,completed_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; expiry timestamptz; version bigint;
BEGIN
 SELECT revision INTO version FROM private.read_cache_versions WHERE scope='shared';
 SELECT value INTO result FROM private.shared_query_cache WHERE key='recent' AND expires_at>statement_timestamp() AND revision=version;
 IF NOT FOUND THEN
  IF current_setting('transaction_read_only')='on' THEN
   RETURN QUERY SELECT * FROM private.calculate_recent_completions(); RETURN;
  END IF;
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
CREATE OR REPLACE FUNCTION private.daily_streak_rankings_at(current_day date)
RETURNS TABLE(rank bigint,nickname text,count integer,status text,is_me boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; version bigint; cache_key text:='streak:'||current_day::text;
BEGIN
 SELECT revision INTO version FROM private.read_cache_versions WHERE scope='shared';
 SELECT value INTO result FROM private.shared_query_cache WHERE key=cache_key AND expires_at>statement_timestamp() AND revision=version;
 IF NOT FOUND THEN
  IF current_setting('transaction_read_only')='on' THEN
   RETURN QUERY SELECT r.rank,r.nickname,r.count,r.status,coalesce(r.owner_id=auth.uid(),false) FROM private.calculate_streak_rows(current_day) r; RETURN;
  END IF;
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
NOTIFY pgrst,'reload schema'; COMMIT;
