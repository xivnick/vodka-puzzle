BEGIN;

CREATE OR REPLACE FUNCTION public.list_puzzles(requested_season text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',puzzle_id,'title',title,'summary',summary,'type',puzzle_type,
  'season',season_id,'href','/' || puzzle_id || '/',
  'publishedAt',published_at,'sortOrder',sort_order,'difficulty',difficulty
 ) ORDER BY sort_order DESC,published_at DESC,puzzle_id ASC),'[]'::jsonb)
 FROM public.puzzle_catalog WHERE season_id=requested_season AND status='published' AND published_at<=now();
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
