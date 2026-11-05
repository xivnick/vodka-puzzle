BEGIN;
SET LOCAL lock_timeout='3s';
UPDATE private.achievement_rules r SET name=v.name,version=r.version+1
FROM (VALUES ('chuseok','달토끼'),('flower','꽃길만 걷자'),('bomb','폭탄 해체반'),('tomato','토마토 수확자'),('marble','한 잔의 여유')) v(id,name) WHERE r.id=v.id AND r.name IS DISTINCT FROM v.name;
COMMIT;
