"""Exercise real RLS as two Google accounts and a guest; roll back all fixtures."""
import json,uuid
from database import query
u1,u2=str(uuid.uuid4()),str(uuid.uuid4())
def claims(uid): return json.dumps({'sub':uid,'role':'authenticated','app_metadata':{'provider':'google'}})
sql=f"""
BEGIN;
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data) VALUES
('{u1}','authenticated','authenticated','policy-a-{u1}@example.invalid','{{"provider":"google"}}'),
('{u2}','authenticated','authenticated','policy-b-{u2}@example.invalid','{{"provider":"google"}}');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{claims(u1)}',true);
INSERT INTO semester_nicknames(season_id,user_id,nickname) VALUES('2026-2','{u1}','__policy_a');
INSERT INTO semester_completions(season_id,user_id,nickname,puzzle_id) VALUES('2026-2','{u1}','__policy_a','__policy_puzzle');
INSERT INTO semester_progress(season_id,user_id,nickname,puzzle_id,state) VALUES('2026-2','{u1}','__policy_a','__policy_puzzle','{{"n":1}}');
INSERT INTO semester_progress(season_id,user_id,nickname,puzzle_id,state) VALUES('2026-2','{u1}','__policy_a','__policy_puzzle','{{"n":2}}') ON CONFLICT(season_id,user_id,puzzle_id) DO UPDATE SET state=excluded.state;
UPDATE semester_nicknames SET nickname='__policy_renamed' WHERE user_id='{u1}';
DO $$ BEGIN
 IF (SELECT count(*) FROM semester_completions WHERE user_id='{u1}' AND nickname='__policy_renamed')<>1 THEN RAISE EXCEPTION 'Completion rename failed'; END IF;
 IF (SELECT state->>'n' FROM semester_progress WHERE user_id='{u1}' AND nickname='__policy_renamed')<>'2' THEN RAISE EXCEPTION 'Progress rename/upsert failed'; END IF;
 BEGIN
  INSERT INTO semester_nicknames(season_id,user_id,nickname) VALUES('2026-1','{u1}','__policy_old');
  RAISE EXCEPTION 'Closed season allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claims','{claims(u2)}',true);
INSERT INTO semester_nicknames(season_id,user_id,nickname) VALUES('2026-2','{u2}','__policy_b');
DO $$ DECLARE affected int; BEGIN
 IF EXISTS(SELECT 1 FROM semester_progress WHERE user_id='{u1}') THEN RAISE EXCEPTION 'Other progress exposed'; END IF;
 UPDATE semester_progress SET state='{{}}' WHERE user_id='{u1}'; GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>0 THEN RAISE EXCEPTION 'Other progress changed'; END IF;
 BEGIN
  INSERT INTO semester_progress(season_id,user_id,nickname,puzzle_id,state) VALUES('2026-2','{u1}','__policy_renamed','__forged','{{}}');
  RAISE EXCEPTION 'Forged owner accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO semester_completions(season_id,user_id,nickname,puzzle_id) VALUES('2026-2','{u2}','__policy_renamed','__forged');
  RAISE EXCEPTION 'Forged nickname accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN
  UPDATE semester_nicknames SET nickname='__policy_renamed' WHERE user_id='{u2}';
  RAISE EXCEPTION 'Duplicate nickname accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{{"role":"anon"}}',true);
DO $$ BEGIN
 BEGIN
  INSERT INTO semester_completions(season_id,nickname,puzzle_id) VALUES('2026-2','__policy_b','__guest');
  RAISE EXCEPTION 'Guest write allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM * FROM semester_progress;
  RAISE EXCEPTION 'Guest progress read allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT 'owner writes, rename, isolation, nickname uniqueness, guest rejection: passed' AS result;
ROLLBACK;
"""
print(query(sql))
print(query(f"select count(*) as fixture_accounts_remaining from auth.users where id in ('{u1}','{u2}')"))
