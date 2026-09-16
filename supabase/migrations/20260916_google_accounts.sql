BEGIN;
ALTER TABLE public.semester_nicknames ADD COLUMN user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.semester_nicknames ADD CONSTRAINT semester_nicknames_owner_key UNIQUE(season_id,user_id);
ALTER TABLE public.semester_nicknames ADD CONSTRAINT semester_nicknames_identity_key UNIQUE(season_id,user_id,nickname);
ALTER TABLE public.semester_nicknames ADD CONSTRAINT valid_owned_nickname CHECK(user_id IS NULL OR (nickname = btrim(nickname) AND char_length(nickname) BETWEEN 1 AND 20 AND nickname <> '게스트'));
ALTER TABLE public.semester_completions ADD COLUMN user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.semester_progress ADD COLUMN user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.semester_completions ADD CONSTRAINT completions_owner_key UNIQUE(season_id,user_id,puzzle_id);
ALTER TABLE public.semester_progress ADD CONSTRAINT progress_owner_key UNIQUE(season_id,user_id,puzzle_id);
ALTER TABLE public.semester_completions ADD CONSTRAINT completion_profile FOREIGN KEY(season_id,user_id,nickname) REFERENCES public.semester_nicknames(season_id,user_id,nickname) ON UPDATE CASCADE;
ALTER TABLE public.semester_progress ADD CONSTRAINT progress_profile FOREIGN KEY(season_id,user_id,nickname) REFERENCES public.semester_nicknames(season_id,user_id,nickname) ON UPDATE CASCADE;
ALTER POLICY read_settings ON public.semester_settings TO anon, authenticated;
GRANT SELECT ON public.semester_settings TO authenticated;
DO $$ DECLARE t text; p record; BEGIN
 FOREACH t IN ARRAY ARRAY['semester_nicknames','semester_completions','semester_progress'] LOOP
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
   EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,t);
  END LOOP;
  EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated',t);
  EXECUTE format('GRANT SELECT, INSERT ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY insert_owned ON public.%I FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT auth.jwt()->''app_metadata''->>''provider'') = ''google'' AND season_id = (SELECT active_season FROM public.semester_settings WHERE id))',t);
  IF t='semester_progress' THEN
   EXECUTE format('CREATE POLICY read_owned ON public.%I FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()))',t);
   EXECUTE format('GRANT UPDATE ON public.%I TO authenticated',t);
  ELSE
   EXECUTE format('GRANT SELECT ON public.%I TO anon',t);
   EXECUTE format('CREATE POLICY read_public ON public.%I FOR SELECT TO anon, authenticated USING (true)',t);
  END IF;
  IF t IN ('semester_nicknames','semester_progress') THEN
   EXECUTE format('CREATE POLICY update_owned ON public.%I FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid()) AND season_id = (SELECT active_season FROM public.semester_settings WHERE id)) WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT auth.jwt()->''app_metadata''->>''provider'') = ''google'' AND season_id = (SELECT active_season FROM public.semester_settings WHERE id))',t);
  END IF;
 END LOOP;
END $$;
GRANT UPDATE(nickname) ON public.semester_nicknames TO authenticated;
-- Archived cloud progress is no longer exposed through the original anonymous API.
REVOKE ALL ON public.progress FROM anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
