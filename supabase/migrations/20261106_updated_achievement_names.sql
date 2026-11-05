BEGIN;
SET LOCAL lock_timeout='3s';
UPDATE private.achievement_rules r SET name=v.name,version=r.version+1
FROM (VALUES ('first','뉴비'),('feature-draw','행운이 깃들길'),('stars','별 따다 줄게'),('math','인간 계산기'),('flower','누가 꽃이게'),('tomato','토마토 축제'),('marble','흑기사')) v(id,name) WHERE r.id=v.id AND r.name IS DISTINCT FROM v.name;
COMMIT;
