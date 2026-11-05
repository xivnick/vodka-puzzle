"""Check the inactive economy foundation with disposable, rolled-back records.
--rehearse applies the pending additive migration inside the same rollback.
No puzzle submission, completion modification or actual reward payout is performed.
"""
import json
import sys
import uuid
from pathlib import Path
from urllib.error import HTTPError
from database import query

user = str(uuid.uuid4())
request = str(uuid.uuid4())
claims = json.dumps({'sub': user, 'role': 'authenticated', 'app_metadata': {'provider': 'google'}})
sql = 'BEGIN;\n'
if '--rehearse' in sys.argv:
    migration = (Path(__file__).resolve().parent.parent / 'supabase/migrations/20261105_cosmetic_foundation.sql').read_text()
    sql += migration.removeprefix('BEGIN;').rsplit('COMMIT;', 1)[0]
sql += f"""
DO $$ BEGIN
 IF (SELECT enabled FROM private.cosmetic_settings WHERE id) IS DISTINCT FROM false THEN RAISE EXCEPTION 'Foundation is enabled'; END IF;
END $$;
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data)
 VALUES('{user}','authenticated','authenticated','cosmetic-{user}@example.invalid','{{"provider":"google"}}');
INSERT INTO public.semester_nicknames(season_id,user_id,nickname)
 SELECT active_season,'{user}','__cosmetic_{user[:8]}' FROM public.semester_settings WHERE id;
SELECT set_config('request.jwt.claims','{claims}',true);
DO $$ BEGIN
 BEGIN
  PERFORM private.begin_cosmetic_operation('{request}','draw','{{"count":1}}');
  RAISE EXCEPTION 'Disabled operation accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'COSMETICS_DISABLED' THEN RAISE; END IF; END;
 IF EXISTS(SELECT 1 FROM private.account_coin_wallets WHERE user_id='{user}') THEN RAISE EXCEPTION 'Disabled request created wallet'; END IF;
END $$;
UPDATE private.cosmetic_settings SET enabled=true WHERE id;
INSERT INTO private.cosmetic_items(id,kind,name,definition) VALUES
 ('__test_common','common_color','test','{{}}'),('__test_icon','icon','test','{{}}');
DO $$ DECLARE op private.account_operations; again private.account_operations; BEGIN
 op:=private.begin_cosmetic_operation('{request}','adjustment','{{"reason":"test"}}');
 IF private.change_cosmetic_coins(op.id,100,'test')<>100 THEN RAISE EXCEPTION 'Grant failed'; END IF;
 IF private.change_cosmetic_coins(op.id,-60,'test')<>40 THEN RAISE EXCEPTION 'Charge failed'; END IF;
 BEGIN
  PERFORM private.change_cosmetic_coins(op.id,-41,'test'); RAISE EXCEPTION 'Negative wallet allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INSUFFICIENT_COINS' THEN RAISE; END IF; END;
 PERFORM private.change_cosmetic_inventory(op.id,'__test_common',3,'test');
 BEGIN
  PERFORM private.change_cosmetic_inventory(op.id,'__test_common',-4,'test'); RAISE EXCEPTION 'Insufficient materials allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INSUFFICIENT_ITEMS' THEN RAISE; END IF; END;
 PERFORM private.change_cosmetic_inventory(op.id,'__test_common',-3,'test');
 IF EXISTS(SELECT 1 FROM private.cosmetic_inventory WHERE user_id='{user}' AND item_id='__test_common') THEN RAISE EXCEPTION 'Empty stack retained'; END IF;
 PERFORM private.change_cosmetic_inventory(op.id,'__test_icon',1,'test');
 BEGIN
  PERFORM private.change_cosmetic_inventory(op.id,'__test_icon',1,'test'); RAISE EXCEPTION 'Permanent item stacked';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PERMANENT_ITEM' THEN RAISE; END IF; END;
 BEGIN
  PERFORM private.change_cosmetic_inventory(op.id,'__test_icon',-1,'test'); RAISE EXCEPTION 'Permanent item consumed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PERMANENT_ITEM' THEN RAISE; END IF; END;
 INSERT INTO private.mission_claims(user_id,scope_key,mission_id,threshold,operation_id,rule_version,reward)
 VALUES('{user}','account','test',1,op.id,1,'{{"coins":40}}');
 BEGIN
  INSERT INTO private.mission_claims(user_id,scope_key,mission_id,threshold,operation_id,rule_version,reward)
  VALUES('{user}','account','test',1,op.id,2,'{{"coins":99}}');
  RAISE EXCEPTION 'Duplicate mission claim accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 op:=private.finish_cosmetic_operation(op.id,'{{"ok":true}}');
 again:=private.begin_cosmetic_operation('{request}','adjustment','{{"reason":"test"}}');
 IF op<>again OR op.state_revision<>1 THEN RAISE EXCEPTION 'Retry did not replay completed operation'; END IF;
 BEGIN
  PERFORM private.begin_cosmetic_operation('{request}','draw','{{"count":1}}'); RAISE EXCEPTION 'Reused request ID accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'REQUEST_ID_REUSED' THEN RAISE; END IF; END;
 BEGIN
  PERFORM private.change_cosmetic_coins(op.id,1,'test'); RAISE EXCEPTION 'Completed operation modified';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_OPERATION' THEN RAISE; END IF; END;
 BEGIN
  PERFORM private.change_cosmetic_inventory(op.id,'__test_common',1,'test'); RAISE EXCEPTION 'Completed inventory modified';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_OPERATION' THEN RAISE; END IF; END;
 IF (SELECT sum(delta) FROM private.coin_ledger WHERE user_id='{user}')<>40
 OR (SELECT balance FROM private.account_coin_wallets WHERE user_id='{user}')<>40
 OR (SELECT sum(delta) FROM private.inventory_ledger WHERE user_id='{user}' AND item_id='__test_common')<>0
 OR (SELECT sum(delta) FROM private.inventory_ledger WHERE user_id='{user}' AND item_id='__test_icon')<>1
 THEN RAISE EXCEPTION 'Ledger and snapshot diverged'; END IF;
END $$;
DO $$ DECLARE t text; f regprocedure; BEGIN
 FOREACH t IN ARRAY ARRAY['cosmetic_settings','cosmetic_items','cosmetic_draw_configs','account_coin_wallets',
  'cosmetic_inventory','cosmetic_equipment','account_operations','coin_ledger','inventory_ledger',
  'cosmetic_results','mission_claims','site_visits'] LOOP
  IF has_table_privilege('authenticated','private.'||t,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('anon','private.'||t,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'Table exposed: %',t; END IF;
 END LOOP;
 FOREACH f IN ARRAY ARRAY['private.begin_cosmetic_operation(uuid,text,jsonb)'::regprocedure,
  'private.change_cosmetic_coins(uuid,bigint,text)'::regprocedure,
  'private.change_cosmetic_inventory(uuid,text,bigint,text)'::regprocedure,
  'private.finish_cosmetic_operation(uuid,jsonb)'::regprocedure] LOOP
  IF has_function_privilege('authenticated',f,'EXECUTE') OR has_function_privilege('anon',f,'EXECUTE') THEN RAISE EXCEPTION 'Function exposed: %',f; END IF;
 END LOOP;
END $$;
SET CONSTRAINTS ALL IMMEDIATE;
DO $$ BEGIN
 BEGIN
  INSERT INTO private.account_operations(user_id,request_id,kind,payload)
  VALUES('{user}',gen_random_uuid(),'adjustment','{{}}');
  RAISE EXCEPTION 'Partial operation committed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'OPERATION_INCOMPLETE' THEN RAISE; END IF; END;
END $$;
DELETE FROM auth.users WHERE id='{user}';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM private.account_coin_wallets WHERE user_id='{user}')
 OR EXISTS(SELECT 1 FROM private.account_operations WHERE user_id='{user}')
 OR EXISTS(SELECT 1 FROM private.coin_ledger WHERE user_id='{user}')
 OR EXISTS(SELECT 1 FROM private.inventory_ledger WHERE user_id='{user}')
 OR EXISTS(SELECT 1 FROM private.mission_claims WHERE user_id='{user}') THEN RAISE EXCEPTION 'Account deletion retained data'; END IF;
END $$;
SELECT 'inactive gate, idempotency, ledger consistency, insufficient funds/materials, permanent inventory, unique claims, permissions and deletion: passed' AS result;
ROLLBACK;
"""
try:
    print(query(sql))
except HTTPError as error:
    print(error.read().decode())
    raise SystemExit(1)
