BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
-- Reads and economic writes share the same global-or-allowlisted access rule.
CREATE OR REPLACE FUNCTION private.begin_cosmetic_operation(requested_id uuid, requested_kind text, requested_payload jsonb)
RETURNS private.account_operations LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result private.account_operations;
BEGIN
 PERFORM private.assert_cosmetic_access();
 IF requested_id IS NULL OR requested_kind IS NULL OR requested_kind NOT IN ('draw','craft','achievement_claim','daily_claim','adjustment')
  OR requested_payload IS NULL OR jsonb_typeof(requested_payload)<>'object' OR octet_length(requested_payload::text)>30000 THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
 INSERT INTO private.account_coin_wallets(user_id) VALUES(auth.uid()) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM private.account_coin_wallets WHERE user_id=auth.uid() FOR UPDATE;
 SELECT * INTO result FROM private.account_operations WHERE user_id=auth.uid() AND request_id=requested_id;
 IF FOUND THEN
  IF result.kind<>requested_kind OR result.payload<>requested_payload THEN RAISE EXCEPTION 'REQUEST_ID_REUSED'; END IF;
  IF result.status<>'completed' THEN RAISE EXCEPTION 'OPERATION_INCOMPLETE'; END IF;
  RETURN result;
 END IF;
 INSERT INTO private.account_operations(user_id,request_id,kind,payload)
 VALUES(auth.uid(),requested_id,requested_kind,requested_payload) RETURNING * INTO result;
 RETURN result;
END $$;
COMMIT;
