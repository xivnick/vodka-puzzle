-- Run only at the production cutover. The current legacy site stops saving.
BEGIN;
LOCK TABLE public.nicknames, public.completions, public.progress IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO public.semester_nicknames SELECT '2026-1',nickname,first_used_at FROM public.nicknames ON CONFLICT(season_id,nickname) DO UPDATE SET first_used_at=excluded.first_used_at;
INSERT INTO public.semester_completions SELECT '2026-1',nickname,puzzle_id,completed_at FROM public.completions ON CONFLICT(season_id,nickname,puzzle_id) DO UPDATE SET completed_at=excluded.completed_at;
INSERT INTO public.semester_progress SELECT '2026-1',nickname,puzzle_id,state,saved_at FROM public.progress ON CONFLICT(season_id,nickname,puzzle_id) DO UPDATE SET state=excluded.state,saved_at=excluded.saved_at;
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public' AND tablename IN ('nicknames','completions','progress') AND cmd <> 'SELECT' LOOP
    EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename);
  END LOOP;
END $$;
COMMIT;
