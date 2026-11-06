BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
CREATE TABLE private.cosmetic_test_accounts (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE private.cosmetic_test_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.cosmetic_test_accounts FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.assert_cosmetic_access() RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE season text;
BEGIN
 IF auth.uid() IS NULL OR coalesce(auth.jwt()->'app_metadata'->>'provider','')<>'google' THEN RAISE EXCEPTION 'LOGIN_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.cosmetic_settings WHERE id AND enabled)
  AND NOT EXISTS(SELECT 1 FROM private.cosmetic_test_accounts WHERE user_id=auth.uid() AND active)
  THEN RAISE EXCEPTION 'COSMETICS_DISABLED'; END IF;
 SELECT n.season_id INTO season FROM public.semester_nicknames n JOIN public.semester_settings s ON s.id AND s.active_season=n.season_id WHERE n.user_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_REQUIRED'; END IF;
 RETURN season;
END $$;
COMMIT;
