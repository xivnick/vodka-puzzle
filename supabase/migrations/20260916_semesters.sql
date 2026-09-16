BEGIN;
CREATE TABLE IF NOT EXISTS public.semester_settings (id boolean PRIMARY KEY DEFAULT true CHECK (id), active_season text NOT NULL);
INSERT INTO public.semester_settings VALUES (true,'2026-2') ON CONFLICT DO NOTHING;
ALTER TABLE public.semester_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_settings ON public.semester_settings FOR SELECT TO anon USING (true);
GRANT SELECT ON public.semester_settings TO anon;
CREATE TABLE public.semester_nicknames (season_id text NOT NULL, nickname text NOT NULL, first_used_at timestamptz DEFAULT now(), PRIMARY KEY(season_id,nickname));
CREATE TABLE public.semester_completions (season_id text NOT NULL, nickname text NOT NULL, puzzle_id text NOT NULL, completed_at timestamptz DEFAULT now(), PRIMARY KEY(season_id,nickname,puzzle_id));
CREATE TABLE public.semester_progress (season_id text NOT NULL, nickname text NOT NULL, puzzle_id text NOT NULL, state jsonb NOT NULL, saved_at timestamptz DEFAULT now(), PRIMARY KEY(season_id,nickname,puzzle_id));
INSERT INTO public.semester_nicknames SELECT '2026-1',nickname,first_used_at FROM public.nicknames;
INSERT INTO public.semester_completions SELECT '2026-1',nickname,puzzle_id,completed_at FROM public.completions;
INSERT INTO public.semester_progress SELECT '2026-1',nickname,puzzle_id,state,saved_at FROM public.progress;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['semester_nicknames','semester_completions','semester_progress'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO anon',t);
    EXECUTE format('CREATE POLICY read_records ON public.%I FOR SELECT TO anon USING (true)',t);
    EXECUTE format('CREATE POLICY insert_active ON public.%I FOR INSERT TO anon WITH CHECK (season_id = (SELECT active_season FROM public.semester_settings WHERE id))',t);
    IF t = 'semester_progress' THEN
      EXECUTE format('CREATE POLICY update_active ON public.%I FOR UPDATE TO anon USING (season_id = (SELECT active_season FROM public.semester_settings WHERE id)) WITH CHECK (season_id = (SELECT active_season FROM public.semester_settings WHERE id))',t);
    END IF;
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
