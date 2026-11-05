BEGIN;
SET LOCAL lock_timeout='3s';
UPDATE private.achievement_rules SET name='행운을 빌어요',version=version+1 WHERE id='feature-draw' AND name IS DISTINCT FROM '행운을 빌어요';
COMMIT;
