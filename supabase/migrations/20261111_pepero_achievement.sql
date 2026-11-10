-- User-approved special achievement: complete Pepero Sudoku once for the number 11 icon.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF NOT public.is_puzzle_published('2026-2','261111_01') THEN
  RAISE EXCEPTION 'Pepero Sudoku must be published before enabling its achievement';
 END IF;
END $$;
INSERT INTO private.cosmetic_items(id,kind,name,definition)
 VALUES('icon:pepero','icon','숫자 11','{"src":"/icons/achievement-preview/number-11.svg"}');
INSERT INTO private.achievement_rules(id,name,description,category,metric,account_scope,first_goal,reward_item,sort_order)
 VALUES('pepero','빼빼로데이','『빼빼로 스도쿠』 풀기','special','bound',false,1,'icon:pepero',22);
INSERT INTO private.achievement_stage_rewards(achievement_id,threshold,item_id)
 VALUES('pepero',1,'icon:pepero');
INSERT INTO private.achievement_puzzle_bindings(achievement_id,season_id,puzzle_id)
 VALUES('pepero','2026-2','261111_01');
NOTIFY pgrst,'reload schema';
COMMIT;
