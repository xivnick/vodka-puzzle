BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM private.cosmetic_settings WHERE id AND enabled) THEN RAISE EXCEPTION 'COSMETICS_MUST_BE_DISABLED'; END IF;
END $$;
-- Confirmed settings only. Launch date and service activation remain unset.
UPDATE private.cosmetic_settings SET champion_tickets=1,history_policy='all_records' WHERE id;
COMMIT;
