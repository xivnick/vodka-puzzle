BEGIN;

CREATE OR REPLACE FUNCTION private.wake_puzzle_notifications() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE endpoint text; token text; issued text; signature text;
BEGIN
  SELECT decrypted_secret INTO endpoint FROM vault.decrypted_secrets WHERE name = 'puzzle_notification_endpoint';
  SELECT decrypted_secret INTO token FROM vault.decrypted_secrets WHERE name = 'puzzle_notification_dispatch_token';
  IF endpoint IS NULL OR token IS NULL THEN RETURN; END IF;
  issued := floor(extract(epoch FROM clock_timestamp()))::bigint::text;
  signature := encode(extensions.hmac(issued, token, 'sha256'), 'hex');
  PERFORM net.http_post(url := endpoint, headers := jsonb_build_object(
    'Content-Type', 'application/json', 'Authorization', 'Bearer ' || issued || '.' || signature
  ), body := '{"action":"dispatch"}'::jsonb, timeout_milliseconds := 55000);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not wake puzzle notification dispatcher (%)', SQLSTATE;
END
$$;

COMMIT;
