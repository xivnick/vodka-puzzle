BEGIN;
SET LOCAL lock_timeout='3s';
UPDATE private.achievement_rules r SET name=v.name,version=r.version+1
FROM (VALUES ('first','반가워요'),('chuseok','달에 사는 토끼')) v(id,name) WHERE r.id=v.id AND r.name IS DISTINCT FROM v.name;
COMMIT;
