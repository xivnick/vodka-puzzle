BEGIN;

ALTER TABLE public.puzzle_catalog
 ADD COLUMN title text NOT NULL DEFAULT '',
 ADD COLUMN summary text NOT NULL DEFAULT '',
 ADD COLUMN puzzle_type text NOT NULL DEFAULT '',
 ADD COLUMN status text NOT NULL DEFAULT 'published' CHECK(status IN ('draft','test','published')),
 ADD COLUMN sort_order integer NOT NULL DEFAULT 0,
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT clock_timestamp();
ALTER TABLE public.puzzle_catalog ALTER COLUMN published_at DROP NOT NULL;
ALTER TABLE public.puzzle_catalog ALTER COLUMN status SET DEFAULT 'test';
ALTER TABLE public.puzzle_catalog ADD CONSTRAINT published_requires_date CHECK(status<>'published' OR published_at IS NOT NULL);

CREATE TABLE private.puzzle_admins (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.puzzle_catalog_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id uuid,
 changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 before_record jsonb, after_record jsonb
);
REVOKE ALL ON private.puzzle_admins,private.puzzle_catalog_audit FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.is_puzzle_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(auth.jwt()->'app_metadata'->>'provider','')='google'
  AND EXISTS(SELECT 1 FROM private.puzzle_admins WHERE user_id=auth.uid());
$$;
CREATE FUNCTION public.is_puzzle_published(requested_season text,requested_puzzle text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.puzzle_catalog WHERE season_id=requested_season AND puzzle_id=requested_puzzle AND status='published' AND published_at<=now());
$$;

CREATE FUNCTION public.puzzle_catalog_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' THEN NEW.updated_at:=clock_timestamp(); END IF;
 INSERT INTO private.puzzle_catalog_audit(actor_id,before_record,after_record)
 VALUES(auth.uid(),CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW));
 RETURN NEW;
END $$;

CREATE FUNCTION public.list_puzzles(requested_season text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',puzzle_id,'title',title,'summary',summary,'type',puzzle_type,
  'season',season_id,'href','/' || puzzle_id || '/',
  'publishedAt',published_at,'sortOrder',sort_order
 ) ORDER BY sort_order DESC,published_at DESC,puzzle_id ASC),'[]'::jsonb)
 FROM public.puzzle_catalog WHERE season_id=requested_season AND status='published' AND published_at<=now();
$$;

CREATE FUNCTION public.puzzle_details(requested_season text,requested_puzzle text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('id',puzzle_id,'title',title,'summary',summary,
  'status',status,'publishedAt',published_at,
  'published',status='published' AND published_at<=now())
 FROM public.puzzle_catalog WHERE season_id=requested_season AND puzzle_id=requested_puzzle;
$$;

CREATE FUNCTION public.admin_list_puzzles(requested_season text) RETURNS SETOF public.puzzle_catalog
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.is_puzzle_admin() THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
 RETURN QUERY SELECT * FROM public.puzzle_catalog WHERE season_id=requested_season ORDER BY sort_order DESC,published_at DESC NULLS FIRST,puzzle_id ASC;
END $$;

CREATE FUNCTION public.admin_update_puzzle(requested_season text,requested_puzzle text,
 new_title text,new_summary text,new_type text,new_status text,new_published_at timestamptz,
 new_sort_order integer,expected_updated_at timestamptz) RETURNS public.puzzle_catalog
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_record public.puzzle_catalog; result public.puzzle_catalog;
BEGIN
 IF NOT public.is_puzzle_admin() THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
 IF new_title IS NULL OR char_length(btrim(new_title)) NOT BETWEEN 1 AND 120
  OR new_summary IS NULL OR char_length(btrim(new_summary)) NOT BETWEEN 1 AND 500
  OR new_type IS NULL OR char_length(btrim(new_type)) NOT BETWEEN 1 AND 80
  OR new_status IS NULL OR new_status NOT IN ('draft','test','published')
  OR new_sort_order IS NULL OR new_sort_order NOT BETWEEN -100000 AND 100000
  OR (new_status='published' AND new_published_at IS NULL) THEN RAISE EXCEPTION 'INVALID_METADATA'; END IF;
 SELECT * INTO current_record FROM public.puzzle_catalog WHERE season_id=requested_season AND puzzle_id=requested_puzzle FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PUZZLE_NOT_FOUND'; END IF;
 IF expected_updated_at IS DISTINCT FROM current_record.updated_at THEN RAISE EXCEPTION 'EDIT_CONFLICT'; END IF;
 UPDATE public.puzzle_catalog SET title=btrim(new_title),summary=btrim(new_summary),puzzle_type=btrim(new_type),status=new_status,published_at=new_published_at,sort_order=new_sort_order
 WHERE season_id=requested_season AND puzzle_id=requested_puzzle RETURNING * INTO result;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.is_puzzle_admin(),public.is_puzzle_published(text,text),public.puzzle_catalog_changed(),public.list_puzzles(text),public.puzzle_details(text,text),public.admin_list_puzzles(text),public.admin_update_puzzle(text,text,text,text,text,text,timestamptz,integer,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.is_puzzle_published(text,text),public.list_puzzles(text),public.puzzle_details(text,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.is_puzzle_admin(),public.admin_list_puzzles(text),public.admin_update_puzzle(text,text,text,text,text,text,timestamptz,integer,timestamptz) TO authenticated;

-- Catalog rows stay behind the read/management functions; no client can write directly.
REVOKE ALL ON public.puzzle_catalog FROM PUBLIC,anon,authenticated;
ALTER POLICY read_public ON public.semester_completions USING(public.is_puzzle_published(season_id,puzzle_id));
ALTER POLICY read_owned ON public.semester_progress USING(user_id=(SELECT auth.uid()) AND public.is_puzzle_published(season_id,puzzle_id));
ALTER POLICY insert_owned ON public.semester_progress WITH CHECK(
 user_id=(SELECT auth.uid()) AND (SELECT auth.jwt()->'app_metadata'->>'provider')='google'
 AND season_id=(SELECT active_season FROM public.semester_settings WHERE id)
 AND public.is_puzzle_published(season_id,puzzle_id));
ALTER POLICY update_owned ON public.semester_progress USING(
 user_id=(SELECT auth.uid()) AND season_id=(SELECT active_season FROM public.semester_settings WHERE id)
 AND public.is_puzzle_published(season_id,puzzle_id)) WITH CHECK(
 user_id=(SELECT auth.uid()) AND (SELECT auth.jwt()->'app_metadata'->>'provider')='google'
 AND season_id=(SELECT active_season FROM public.semester_settings WHERE id)
 AND public.is_puzzle_published(season_id,puzzle_id));

INSERT INTO public.puzzle_catalog(season_id,puzzle_id,title,summary,puzzle_type,status,published_at) VALUES
('2026-2','260916_01','260916 Mini Rectangles','정사각형을 최소로 하여 흰색 영역을 직사각형으로 나누세요','Mini Rectangles','published','2026-09-16T00:00:00+09:00'),
('2026-2','260917_01','260917 온도계 스도쿠 - 하','온도계의 큰 원에서 끝으로 갈수록 숫자가 커져야 합니다','온도계 스도쿠','published','2026-09-17T00:00:00+09:00'),
('2026-2','260917_02','260917 온도계 스도쿠 - 중','온도계의 큰 원에서 끝으로 갈수록 숫자가 커져야 합니다','온도계 스도쿠','published','2026-09-17T00:00:00+09:00'),
('2026-2','260917_03','260917 온도계 스도쿠 - 상','온도계의 큰 원에서 끝으로 갈수록 숫자가 커져야 합니다','온도계 스도쿠','published','2026-09-17T00:00:00+09:00'),
('2026-2','260918_01','260918 온도계 스도쿠 - A','온도계의 큰 원에서 끝으로 갈수록 숫자가 커져야 합니다','온도계 스도쿠','published','2026-09-18T00:00:00+09:00'),
('2026-2','260918_02','260918 온도계 스도쿠 - B','온도계의 큰 원에서 끝으로 갈수록 숫자가 커져야 합니다','온도계 스도쿠','published','2026-09-18T00:00:00+09:00'),
('2026-2','260919_01','260919 사풍(四風) - 1','숫자 칸에서 화살표를 뻗어 모든 빈 칸을 채우세요','사풍(四風)','published','2026-09-19T00:00:00+09:00'),
('2026-2','260919_02','260919 사풍(四風) - 2','숫자 칸에서 화살표를 뻗어 모든 빈 칸을 채우세요','사풍(四風)','published','2026-09-19T00:00:00+09:00'),
('2026-2','260920_01','260920 스카이스크레이퍼','6×6 · 바깥 단서만큼 보이도록 건물 높이를 채우세요','스카이스크레이퍼','published','2026-09-20T15:25:00+09:00'),
('2026-2','260921_01','260921 같은 합 스도쿠','모든 회색 영역의 숫자 합이 같아야 합니다','같은 합 스도쿠','published','2026-09-21T02:00:00+09:00'),
('2026-2','260922_01','260922 수식완성 1','주어진 숫자를 모두 사용해 타겟 숫자를 만드는 수식을 완성하세요','수식완성','published','2026-09-22T10:19:36+09:00'),
('2026-2','260922_02','260922 수식완성 2','주어진 숫자를 모두 사용해 타겟 숫자를 만드는 수식을 완성하세요','수식완성','published','2026-09-22T10:19:36+09:00'),
('2026-2','260922_03','260922 수식완성 3','주어진 숫자를 모두 사용해 타겟 숫자를 만드는 수식을 완성하세요','수식완성','published','2026-09-22T10:19:36+09:00'),
('2026-2','260923_01','260923 밸런스 루프 1','숫자와 모양에 맞게 두 팔의 길이를 조절해 하나의 루프를 그리세요','밸런스 루프','published','2026-09-23T13:09:55+09:00'),
('2026-2','260923_02','260923 밸런스 루프 2','숫자와 모양에 맞게 두 팔의 길이를 조절해 하나의 루프를 그리세요','밸런스 루프','published','2026-09-23T13:09:55+09:00'),
('2026-2','260925_01','260925 한가위 스도쿠','한가위 맞이 스도쿠를 풀어보세요','스도쿠','published','2026-09-25T15:03:12+09:00'),
('2026-2','260928_01','260928 콰트로 스도쿠','모든 2×2 공간에 홀수와 짝수가 함께 있어야 합니다','콰트로 스도쿠','published','2026-09-28T00:26:12+09:00'),
('2026-2','260928_02','260928 산수 스도쿠','스도쿠를 완성하고 가로 수식을 성립시키세요','산수 스도쿠','published','2026-09-28T16:29:03+09:00'),
('2026-2','260928_03','260928 란영 스도쿠','꽃 칸은 주변 8칸과 숫자가 다릅니다','스도쿠','published','2026-09-28T17:33:23+09:00'),
('2026-2','260929_01','260929 펜토미너스','격자를 펜토미노 영역으로 나누세요','펜토미너스','published','2026-09-29T13:32:59+09:00'),
('2026-2','261001_01','261001 빙판길 1','얼음 위에서는 직진하며 하나의 루프를 그리세요','빙판길','published','2026-10-01T01:01:35+09:00'),
('2026-2','261001_02','261001 침수된 길 1','물 구간의 길이와 숫자에 맞게 하나의 루프를 그리세요','침수된 길','published','2026-10-01T01:13:44+09:00'),
('2026-2','261001_03','261001 펜토미너스(침수)','격자를 펜토미노 영역으로 나누세요','펜토미너스','published','2026-10-01T12:12:55+09:00'),
('2026-2','261001_04','261001 폭탄 스도쿠','폭탄의 바로 왼쪽은 더 작게, 바로 오른쪽은 더 크게','폭탄 스도쿠','test',NULL)
ON CONFLICT(season_id,puzzle_id) DO UPDATE SET title=excluded.title,summary=excluded.summary,puzzle_type=excluded.puzzle_type,status=excluded.status,published_at=excluded.published_at;


CREATE TRIGGER puzzle_catalog_audit BEFORE INSERT OR UPDATE ON public.puzzle_catalog
FOR EACH ROW EXECUTE FUNCTION public.puzzle_catalog_changed();

CREATE OR REPLACE FUNCTION public.submit_completion(requested_puzzle text, submitted_state jsonb, state_version integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE profile public.semester_nicknames; moment timestamptz; target date; result jsonb; position bigint;
BEGIN
 IF auth.uid() IS NULL OR coalesce(auth.jwt()->'app_metadata'->>'provider','')<>'google' THEN RAISE EXCEPTION 'LOGIN_REQUIRED'; END IF;
 SELECT n.* INTO profile FROM public.semester_nicknames n JOIN public.semester_settings s ON s.id AND s.active_season=n.season_id WHERE n.user_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_REQUIRED'; END IF;
 IF submitted_state IS NULL OR jsonb_typeof(submitted_state)<>'object' OR octet_length(submitted_state::text)>=30000 OR state_version IS NULL OR state_version<>1 THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
 IF requested_puzzle ~ '^daily-sudoku:[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
  target:=substring(requested_puzzle FROM 14)::date;
  PERFORM pg_advisory_xact_lock(78124,target-date '2000-01-01');
  SELECT jsonb_build_object('rank',c.rank,'completed_at',c.completed_at) INTO result FROM public.daily_sudoku_completions c WHERE c.day=target AND c.user_id=auth.uid();
  IF FOUND THEN RETURN result; END IF;
  PERFORM public.publish_daily_sudoku();
  moment:=clock_timestamp();
  IF NOT EXISTS(SELECT 1 FROM public.daily_sudoku WHERE day=target AND opens_at<=moment AND moment<opens_at+interval '24 hours') THEN RAISE EXCEPTION 'CLOSED'; END IF;
  SELECT coalesce(max(rank),0)+1 INTO position FROM public.daily_sudoku_completions WHERE day=target;
  INSERT INTO public.daily_sudoku_completions(day,user_id,season_id,nickname,rank,completed_at) VALUES(target,auth.uid(),profile.season_id,profile.nickname,position,moment);
  result:=jsonb_build_object('rank',position,'completed_at',moment);
 ELSE
  IF NOT public.is_puzzle_published(profile.season_id,requested_puzzle) THEN RAISE EXCEPTION 'UNAVAILABLE'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(profile.season_id || ':' || auth.uid()::text || ':' || requested_puzzle,0));
  SELECT jsonb_build_object('completed_at',c.completed_at) INTO result FROM public.semester_completions c WHERE c.season_id=profile.season_id AND c.user_id=auth.uid() AND c.puzzle_id=requested_puzzle;
  IF FOUND THEN RETURN result; END IF;
  moment:=clock_timestamp();
  INSERT INTO public.semester_completions(season_id,user_id,nickname,puzzle_id,completed_at) VALUES(profile.season_id,auth.uid(),profile.nickname,requested_puzzle,moment);
  result:=jsonb_build_object('completed_at',moment);
 END IF;
 INSERT INTO public.completion_submissions(season_id,user_id,puzzle_id,state_version,state,submitted_at) VALUES(profile.season_id,auth.uid(),requested_puzzle,state_version,submitted_state,moment);
 RETURN result;
END $function$
;



-- Keep only each account's latest completion before selecting the banner rows.
-- The account identity is used for grouping but is never returned to clients.
CREATE OR REPLACE FUNCTION public.recent_completions()
RETURNS TABLE(nickname text, puzzle_id text, completed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH completions AS (
  SELECT coalesce(c.user_id::text, 'nickname:' || c.nickname) AS account_key,
   c.nickname, c.puzzle_id, c.completed_at
  FROM public.semester_completions c
  JOIN public.semester_settings s ON s.id AND s.active_season=c.season_id
  WHERE NOT c.excluded AND public.is_puzzle_published(c.season_id,c.puzzle_id)
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
$$;



NOTIFY pgrst,'reload schema';
COMMIT;
