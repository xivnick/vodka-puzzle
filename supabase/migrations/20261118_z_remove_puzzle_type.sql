BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='45s';

DO $$ BEGIN
 IF to_regprocedure('public.admin_update_puzzle(text,text,text,text,text,timestamptz,integer,timestamptz,integer)') IS NULL THEN
  RAISE EXCEPTION 'Install the replacement admin update RPC before dropping puzzle types';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.list_puzzles(requested_season text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',puzzle_id,'title',title,'summary',summary,
  'season',season_id,'href','/' || puzzle_id || '/',
  'publishedAt',published_at,'sortOrder',sort_order,'difficulty',difficulty
 ) ORDER BY sort_order DESC,published_at DESC,puzzle_id ASC),'[]'::jsonb)
 FROM public.puzzle_catalog WHERE season_id=requested_season AND status='published' AND published_at<=now();
$$;

DROP FUNCTION IF EXISTS public.admin_update_puzzle(text,text,text,text,text,text,timestamptz,integer,timestamptz,integer);
DROP FUNCTION IF EXISTS public.admin_update_puzzle(text,text,text,text,text,text,timestamptz,integer,timestamptz);

ALTER TABLE public.puzzle_catalog DROP COLUMN puzzle_type;

-- Strip only the obsolete field from the catalog audit history.
UPDATE private.puzzle_catalog_audit
SET before_record=before_record-'puzzle_type', after_record=after_record-'puzzle_type'
WHERE before_record ? 'puzzle_type' OR after_record ? 'puzzle_type';

NOTIFY pgrst,'reload schema';
COMMIT;
