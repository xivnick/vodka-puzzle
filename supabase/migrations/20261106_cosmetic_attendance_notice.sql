BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
CREATE OR REPLACE FUNCTION private.cosmetics_public_enabled() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT enabled AND (launched_at IS NULL OR launched_at<=statement_timestamp()) FROM private.cosmetic_settings WHERE id),false);
$$;
CREATE OR REPLACE FUNCTION public.record_site_visit(request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE today date:=(statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date; inserted integer;
BEGIN
 PERFORM private.assert_cosmetic_access();
 IF request_id IS NULL THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
 INSERT INTO private.site_visits(user_id,day) VALUES(auth.uid(),today) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 RETURN jsonb_build_object('day',today,'daily_tasks',private.daily_task_rows(),'daily_task_notifications',
  CASE WHEN inserted=1 THEN jsonb_build_array(jsonb_build_object('id','attendance','name','출석 체크')) ELSE '[]'::jsonb END);
END $$;
COMMIT;
