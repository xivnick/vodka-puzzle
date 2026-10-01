BEGIN;

ALTER TABLE public.puzzle_catalog ADD COLUMN difficulty text
 CHECK(difficulty IS NULL OR (difficulty=btrim(difficulty) AND char_length(difficulty) BETWEEN 1 AND 40));

-- The original signature remains available and preserves difficulty for older clients.
CREATE FUNCTION public.admin_update_puzzle(requested_season text,requested_puzzle text,
 new_title text,new_summary text,new_type text,new_status text,new_published_at timestamptz,
 new_sort_order integer,expected_updated_at timestamptz,new_difficulty text) RETURNS public.puzzle_catalog
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_record public.puzzle_catalog; result public.puzzle_catalog;
BEGIN
 IF NOT public.is_puzzle_admin() THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
 IF new_title IS NULL OR char_length(btrim(new_title)) NOT BETWEEN 1 AND 120
  OR new_summary IS NULL OR char_length(btrim(new_summary)) NOT BETWEEN 1 AND 500
  OR new_type IS NULL OR char_length(btrim(new_type)) NOT BETWEEN 1 AND 80
  OR (new_difficulty IS NOT NULL AND char_length(btrim(new_difficulty))>40)
  OR new_status IS NULL OR new_status NOT IN ('draft','test','published')
  OR new_sort_order IS NULL OR new_sort_order NOT BETWEEN -100000 AND 100000
  OR (new_status='published' AND new_published_at IS NULL) THEN RAISE EXCEPTION 'INVALID_METADATA'; END IF;
 SELECT * INTO current_record FROM public.puzzle_catalog WHERE season_id=requested_season AND puzzle_id=requested_puzzle FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PUZZLE_NOT_FOUND'; END IF;
 IF expected_updated_at IS DISTINCT FROM current_record.updated_at THEN RAISE EXCEPTION 'EDIT_CONFLICT'; END IF;
 UPDATE public.puzzle_catalog SET title=btrim(new_title),summary=btrim(new_summary),puzzle_type=btrim(new_type),status=new_status,published_at=new_published_at,sort_order=new_sort_order,difficulty=nullif(btrim(new_difficulty),'')
 WHERE season_id=requested_season AND puzzle_id=requested_puzzle RETURNING * INTO result;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.admin_update_puzzle(text,text,text,text,text,text,timestamptz,integer,timestamptz,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_puzzle(text,text,text,text,text,text,timestamptz,integer,timestamptz,text) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
