BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM private.cosmetic_settings WHERE id AND enabled) THEN RAISE EXCEPTION 'COSMETICS_MUST_BE_DISABLED'; END IF;
END $$;
UPDATE private.cosmetic_items SET name='시계와 번개',
 definition=jsonb_build_object('src','/icons/achievement-preview/clock-bolt.svg'),active=true
 WHERE id='icon:time-traveler';
UPDATE private.achievement_rules SET active=true,version=version+1 WHERE id='time-traveler';
COMMIT;
