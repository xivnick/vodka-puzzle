BEGIN;
SET LOCAL lock_timeout='3s';

-- Allow the new editor to deploy while both previous RPC signatures still work.
CREATE FUNCTION public.admin_update_puzzle(requested_season text,requested_puzzle text,
 new_title text,new_summary text,new_status text,new_published_at timestamptz,
 new_sort_order integer,expected_updated_at timestamptz,new_difficulty integer) RETURNS public.puzzle_catalog
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_record public.puzzle_catalog; result public.puzzle_catalog;
BEGIN
 IF NOT public.is_puzzle_admin() THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
 IF new_title IS NULL OR char_length(btrim(new_title)) NOT BETWEEN 1 AND 120
  OR new_summary IS NULL OR char_length(btrim(new_summary)) NOT BETWEEN 1 AND 500
  OR new_difficulty IS NULL OR new_difficulty NOT BETWEEN 0 AND 3
  OR new_status IS NULL OR new_status NOT IN ('draft','test','published')
  OR new_sort_order IS NULL OR new_sort_order NOT BETWEEN -100000 AND 100000
  OR (new_status='published' AND new_published_at IS NULL) THEN RAISE EXCEPTION 'INVALID_METADATA'; END IF;
 SELECT * INTO current_record FROM public.puzzle_catalog WHERE season_id=requested_season AND puzzle_id=requested_puzzle FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PUZZLE_NOT_FOUND'; END IF;
 IF expected_updated_at IS DISTINCT FROM current_record.updated_at THEN RAISE EXCEPTION 'EDIT_CONFLICT'; END IF;
 UPDATE public.puzzle_catalog SET title=btrim(new_title),summary=btrim(new_summary),status=new_status,published_at=new_published_at,sort_order=new_sort_order,difficulty=new_difficulty
 WHERE season_id=requested_season AND puzzle_id=requested_puzzle RETURNING * INTO result;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.admin_update_puzzle(text,text,text,text,text,timestamptz,integer,timestamptz,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_puzzle(text,text,text,text,text,timestamptz,integer,timestamptz,integer) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
