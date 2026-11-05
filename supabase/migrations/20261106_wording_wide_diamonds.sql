BEGIN;
SET LOCAL lock_timeout='3s';
UPDATE private.achievement_rules r SET description=v.description,version=r.version+1
FROM (VALUES ('easy','⬥ 퍼즐 풀기'),('medium','⬥⬥ 퍼즐 풀기'),('hard','⬥⬥⬥ 퍼즐 풀기')) v(id,description) WHERE r.id=v.id AND r.description IS DISTINCT FROM v.description;
COMMIT;
