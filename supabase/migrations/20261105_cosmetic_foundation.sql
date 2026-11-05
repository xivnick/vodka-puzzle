BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

-- Additive preparation only: no public RPC, existing-table trigger, backfill or grant.
CREATE TABLE private.cosmetic_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 enabled boolean NOT NULL DEFAULT false
);
INSERT INTO private.cosmetic_settings(id,enabled) VALUES(true,false);

CREATE TABLE private.cosmetic_items (
 id text PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 160),
 kind text NOT NULL CHECK(kind IN ('common_color','uncommon_color','rare_color','icon','effect')),
 name text NOT NULL CHECK(length(name)>0),
 definition jsonb NOT NULL CHECK(jsonb_typeof(definition)='object'),
 color_a text REFERENCES private.cosmetic_items(id),
 color_b text REFERENCES private.cosmetic_items(id),
 active boolean NOT NULL DEFAULT true,
 UNIQUE(id,kind),
 CHECK((kind='uncommon_color' AND color_a IS NOT NULL AND color_b IS NOT NULL AND color_a<=color_b)
    OR (kind<>'uncommon_color' AND color_a IS NULL AND color_b IS NULL))
);
CREATE UNIQUE INDEX cosmetic_uncommon_pair ON private.cosmetic_items(color_a,color_b) WHERE kind='uncommon_color';

CREATE TABLE private.cosmetic_draw_configs (
 version integer PRIMARY KEY CHECK(version>0),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','retired')),
 price_per_draw bigint CHECK(price_per_draw>0),
 common_weight integer NOT NULL DEFAULT 7200 CHECK(common_weight>0),
 rare_weight integer NOT NULL DEFAULT 2400 CHECK(rare_weight>0),
 epic_weight integer NOT NULL DEFAULT 400 CHECK(epic_weight>0),
 definition jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(definition)='object'),
 CHECK(common_weight+rare_weight+epic_weight=10000),
 CHECK(status<>'active' OR price_per_draw IS NOT NULL)
);
CREATE UNIQUE INDEX cosmetic_one_active_draw_config ON private.cosmetic_draw_configs(status) WHERE status='active';

CREATE TABLE private.account_coin_wallets (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 balance bigint NOT NULL DEFAULT 0 CHECK(balance>=0),
 revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0)
);
CREATE TABLE private.cosmetic_inventory (
 user_id uuid NOT NULL REFERENCES private.account_coin_wallets(user_id) ON DELETE CASCADE,
 item_id text NOT NULL,
 item_kind text NOT NULL,
 quantity bigint NOT NULL CHECK(quantity>0 AND (item_kind='common_color' OR quantity=1)),
 PRIMARY KEY(user_id,item_id),
 FOREIGN KEY(item_id,item_kind) REFERENCES private.cosmetic_items(id,kind)
);
CREATE TABLE private.cosmetic_equipment (
 user_id uuid PRIMARY KEY REFERENCES private.account_coin_wallets(user_id) ON DELETE CASCADE,
 equipment_version bigint NOT NULL DEFAULT 0 CHECK(equipment_version>=0),
 icon_id text REFERENCES private.cosmetic_items(id),
 color_id text REFERENCES private.cosmetic_items(id),
 effect_id text REFERENCES private.cosmetic_items(id),
 expression text NOT NULL DEFAULT 'gradient' CHECK(expression IN ('gradient','split')),
 direction text NOT NULL DEFAULT 'diagonal' CHECK(direction IN ('diagonal','horizontal'))
);
-- Equipment is only the current selection. No equip events or achievement counters.

CREATE TABLE private.account_operations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES private.account_coin_wallets(user_id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('draw','craft','achievement_claim','daily_claim','adjustment')),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 config_version integer REFERENCES private.cosmetic_draw_configs(version),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed')),
 response jsonb,
 state_revision bigint CHECK(state_revision>0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(user_id,request_id),
 UNIQUE(id,user_id),
 CHECK((status='pending' AND response IS NULL AND state_revision IS NULL)
    OR (status='completed' AND jsonb_typeof(response)='object' AND response IS NOT NULL AND state_revision IS NOT NULL))
);
CREATE INDEX cosmetic_operations_by_user_kind ON private.account_operations(user_id,kind,created_at) WHERE status='completed';
CREATE UNIQUE INDEX cosmetic_operations_revision ON private.account_operations(user_id,state_revision) WHERE status='completed';

CREATE TABLE private.coin_ledger (
 operation_id uuid NOT NULL,
 user_id uuid NOT NULL,
 line_no integer NOT NULL CHECK(line_no>0),
 reason text NOT NULL CHECK(length(reason)>0),
 delta bigint NOT NULL CHECK(delta<>0),
 balance_after bigint NOT NULL CHECK(balance_after>=0),
 PRIMARY KEY(operation_id,line_no),
 FOREIGN KEY(operation_id,user_id) REFERENCES private.account_operations(id,user_id) ON DELETE CASCADE
);
CREATE INDEX cosmetic_coin_ledger_user ON private.coin_ledger(user_id);
CREATE TABLE private.inventory_ledger (
 operation_id uuid NOT NULL,
 user_id uuid NOT NULL,
 line_no integer NOT NULL CHECK(line_no>0),
 item_id text NOT NULL REFERENCES private.cosmetic_items(id),
 reason text NOT NULL CHECK(length(reason)>0),
 delta bigint NOT NULL CHECK(delta<>0),
 quantity_after bigint NOT NULL CHECK(quantity_after>=0),
 PRIMARY KEY(operation_id,line_no),
 FOREIGN KEY(operation_id,user_id) REFERENCES private.account_operations(id,user_id) ON DELETE CASCADE
);
CREATE INDEX cosmetic_inventory_ledger_user ON private.inventory_ledger(user_id,item_id);
CREATE TABLE private.cosmetic_results (
 operation_id uuid NOT NULL REFERENCES private.account_operations(id) ON DELETE CASCADE,
 item_index integer NOT NULL CHECK(item_index>0),
 item_id text NOT NULL REFERENCES private.cosmetic_items(id),
 duplicate boolean NOT NULL,
 refund_coins bigint NOT NULL DEFAULT 0 CHECK(refund_coins>=0),
 PRIMARY KEY(operation_id,item_index),
 CHECK(duplicate OR refund_coins=0)
);
CREATE TABLE private.mission_claims (
 user_id uuid NOT NULL,
 scope_key text NOT NULL CHECK(scope_key='account' OR scope_key ~ '^season:[0-9]{4}-[12]$' OR scope_key ~ '^day:[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
 mission_id text NOT NULL CHECK(length(mission_id)>0),
 threshold bigint NOT NULL CHECK(threshold>0),
 operation_id uuid NOT NULL,
 rule_version integer NOT NULL CHECK(rule_version>0),
 reward jsonb NOT NULL CHECK(jsonb_typeof(reward)='object'),
 claimed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,scope_key,mission_id,threshold),
 FOREIGN KEY(operation_id,user_id) REFERENCES private.account_operations(id,user_id) ON DELETE CASCADE
);
CREATE TABLE private.site_visits (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 day date NOT NULL,
 visited_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,day)
);

-- No policies: neither browser roles nor PUBLIC can access these tables.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['cosmetic_settings','cosmetic_items','cosmetic_draw_configs',
  'account_coin_wallets','cosmetic_inventory','cosmetic_equipment','account_operations',
  'coin_ledger','inventory_ledger','cosmetic_results','mission_claims','site_visits'] LOOP
  EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated',t);
 END LOOP;
END $$;

-- Internal transaction primitives, intentionally unreachable from existing APIs.
-- The caller must finish or roll back the operation in the SAME transaction.
CREATE FUNCTION private.begin_cosmetic_operation(requested_id uuid, requested_kind text, requested_payload jsonb)
RETURNS private.account_operations LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result private.account_operations;
BEGIN
 IF auth.uid() IS NULL OR coalesce(auth.jwt()->'app_metadata'->>'provider','')<>'google' THEN RAISE EXCEPTION 'LOGIN_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.cosmetic_settings WHERE id AND enabled) THEN RAISE EXCEPTION 'COSMETICS_DISABLED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.semester_nicknames n JOIN public.semester_settings s ON s.id AND s.active_season=n.season_id WHERE n.user_id=auth.uid()) THEN RAISE EXCEPTION 'PROFILE_REQUIRED'; END IF;
 IF requested_id IS NULL OR requested_kind IS NULL OR requested_kind NOT IN ('draw','craft','achievement_claim','daily_claim','adjustment')
  OR requested_payload IS NULL OR jsonb_typeof(requested_payload)<>'object' OR octet_length(requested_payload::text)>30000 THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
 INSERT INTO private.account_coin_wallets(user_id) VALUES(auth.uid()) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM private.account_coin_wallets WHERE user_id=auth.uid() FOR UPDATE;
 SELECT * INTO result FROM private.account_operations WHERE user_id=auth.uid() AND request_id=requested_id;
 IF FOUND THEN
  IF result.kind<>requested_kind OR result.payload<>requested_payload THEN RAISE EXCEPTION 'REQUEST_ID_REUSED'; END IF;
  IF result.status<>'completed' THEN RAISE EXCEPTION 'OPERATION_INCOMPLETE'; END IF;
  RETURN result;
 END IF;
 INSERT INTO private.account_operations(user_id,request_id,kind,payload)
 VALUES(auth.uid(),requested_id,requested_kind,requested_payload) RETURNING * INTO result;
 RETURN result;
END $$;

CREATE FUNCTION private.change_cosmetic_coins(target_operation uuid, change bigint, requested_reason text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE op private.account_operations; result bigint; next_line integer;
BEGIN
 SELECT * INTO op FROM private.account_operations WHERE id=target_operation;
 IF NOT FOUND OR op.status<>'pending' THEN RAISE EXCEPTION 'INVALID_OPERATION'; END IF;
 IF change IS NULL OR change=0 OR requested_reason IS NULL OR length(requested_reason)=0 THEN RAISE EXCEPTION 'INVALID_DELTA'; END IF;
 SELECT balance INTO result FROM private.account_coin_wallets WHERE user_id=op.user_id FOR UPDATE;
 -- Recheck after locking, so a completed operation can never gain new lines.
 IF NOT EXISTS(SELECT 1 FROM private.account_operations WHERE id=target_operation AND status='pending') THEN RAISE EXCEPTION 'INVALID_OPERATION'; END IF;
 IF result+change<0 THEN RAISE EXCEPTION 'INSUFFICIENT_COINS'; END IF;
 result:=result+change;
 UPDATE private.account_coin_wallets SET balance=result WHERE user_id=op.user_id;
 SELECT coalesce(max(line_no),0)+1 INTO next_line FROM private.coin_ledger WHERE operation_id=target_operation;
 INSERT INTO private.coin_ledger(operation_id,user_id,line_no,reason,delta,balance_after)
 VALUES(target_operation,op.user_id,next_line,requested_reason,change,result);
 RETURN result;
END $$;

CREATE FUNCTION private.change_cosmetic_inventory(target_operation uuid, target_item text, change bigint, requested_reason text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE op private.account_operations; item private.cosmetic_items; result bigint; next_line integer;
BEGIN
 SELECT * INTO op FROM private.account_operations WHERE id=target_operation;
 IF NOT FOUND OR op.status<>'pending' THEN RAISE EXCEPTION 'INVALID_OPERATION'; END IF;
 IF change IS NULL OR change=0 OR requested_reason IS NULL OR length(requested_reason)=0 THEN RAISE EXCEPTION 'INVALID_DELTA'; END IF;
 PERFORM 1 FROM private.account_coin_wallets WHERE user_id=op.user_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM private.account_operations WHERE id=target_operation AND status='pending') THEN RAISE EXCEPTION 'INVALID_OPERATION'; END IF;
 SELECT * INTO item FROM private.cosmetic_items WHERE id=target_item;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ITEM'; END IF;
 SELECT coalesce((SELECT quantity FROM private.cosmetic_inventory WHERE user_id=op.user_id AND item_id=target_item),0) INTO result;
 result:=result+change;
 IF result<0 THEN RAISE EXCEPTION 'INSUFFICIENT_ITEMS'; END IF;
 IF item.kind<>'common_color' AND (change<0 OR result>1) THEN RAISE EXCEPTION 'PERMANENT_ITEM'; END IF;
 IF result=0 THEN
  DELETE FROM private.cosmetic_inventory WHERE user_id=op.user_id AND item_id=target_item;
 ELSE
  INSERT INTO private.cosmetic_inventory(user_id,item_id,item_kind,quantity) VALUES(op.user_id,target_item,item.kind,result)
  ON CONFLICT(user_id,item_id) DO UPDATE SET quantity=excluded.quantity;
 END IF;
 SELECT coalesce(max(line_no),0)+1 INTO next_line FROM private.inventory_ledger WHERE operation_id=target_operation;
 INSERT INTO private.inventory_ledger(operation_id,user_id,line_no,item_id,reason,delta,quantity_after)
 VALUES(target_operation,op.user_id,next_line,target_item,requested_reason,change,result);
 RETURN result;
END $$;

CREATE FUNCTION private.finish_cosmetic_operation(target_operation uuid, requested_response jsonb)
RETURNS private.account_operations LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE op private.account_operations; next_revision bigint;
BEGIN
 IF requested_response IS NULL OR jsonb_typeof(requested_response)<>'object' THEN RAISE EXCEPTION 'INVALID_RESPONSE'; END IF;
 SELECT * INTO op FROM private.account_operations WHERE id=target_operation;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_OPERATION'; END IF;
 PERFORM 1 FROM private.account_coin_wallets WHERE user_id=op.user_id FOR UPDATE;
 SELECT * INTO op FROM private.account_operations WHERE id=target_operation;
 IF op.status<>'pending' THEN RAISE EXCEPTION 'INVALID_OPERATION'; END IF;
 UPDATE private.account_coin_wallets SET revision=revision+1 WHERE user_id=op.user_id RETURNING revision INTO next_revision;
 UPDATE private.account_operations SET status='completed',state_revision=next_revision,
  response=requested_response || jsonb_build_object('operation_id',id,'state_revision',next_revision)
 WHERE id=target_operation RETURNING * INTO op;
 RETURN op;
END $$;
-- A caller that forgets to finish cannot commit a partial economic operation.
CREATE FUNCTION private.require_finished_cosmetic_operation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM private.account_operations WHERE id=NEW.id AND status<>'completed') THEN
  RAISE EXCEPTION 'OPERATION_INCOMPLETE';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER cosmetic_operation_finished
 AFTER INSERT OR UPDATE ON private.account_operations DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION private.require_finished_cosmetic_operation();
REVOKE ALL ON FUNCTION private.require_finished_cosmetic_operation() FROM PUBLIC,anon,authenticated;

REVOKE ALL ON FUNCTION private.begin_cosmetic_operation(uuid,text,jsonb),
 private.change_cosmetic_coins(uuid,bigint,text),private.change_cosmetic_inventory(uuid,text,bigint,text),
 private.finish_cosmetic_operation(uuid,jsonb) FROM PUBLIC,anon,authenticated;

-- Approved definitions only. No demo balance, inventory, counters or claims.
INSERT INTO private.cosmetic_items(id,kind,name,definition) VALUES
 ('common:c0','common_color','수박','{"a":"#D9747C","b":"#D9747C"}'::jsonb),
 ('common:c1','common_color','빨강','{"a":"#C4515D","b":"#C4515D"}'::jsonb),
 ('common:c2','common_color','와인','{"a":"#953E4B","b":"#953E4B"}'::jsonb),
 ('common:c3','common_color','살구','{"a":"#D98A62","b":"#D98A62"}'::jsonb),
 ('common:c4','common_color','주황','{"a":"#C57543","b":"#C57543"}'::jsonb),
 ('common:c5','common_color','구리','{"a":"#965329","b":"#965329"}'::jsonb),
 ('common:c6','common_color','모래','{"a":"#C3AA4E","b":"#C3AA4E"}'::jsonb),
 ('common:c7','common_color','노랑','{"a":"#A99231","b":"#A99231"}'::jsonb),
 ('common:c8','common_color','머스터드','{"a":"#827222","b":"#827222"}'::jsonb),
 ('common:c9','common_color','밀크티','{"a":"#AF8A6D","b":"#AF8A6D"}'::jsonb),
 ('common:c10','common_color','갈색','{"a":"#8F6A50","b":"#8F6A50"}'::jsonb),
 ('common:c11','common_color','초콜릿','{"a":"#694D3D","b":"#694D3D"}'::jsonb),
 ('common:c12','common_color','풀잎','{"a":"#7DA06A","b":"#7DA06A"}'::jsonb),
 ('common:c13','common_color','초록','{"a":"#578761","b":"#578761"}'::jsonb),
 ('common:c14','common_color','숲','{"a":"#38664B","b":"#38664B"}'::jsonb),
 ('common:c15','common_color','민트','{"a":"#6FAE95","b":"#6FAE95"}'::jsonb),
 ('common:c16','common_color','비취','{"a":"#42977D","b":"#42977D"}'::jsonb),
 ('common:c17','common_color','청옥','{"a":"#2E7364","b":"#2E7364"}'::jsonb),
 ('common:c18','common_color','물빛','{"a":"#6BA7AA","b":"#6BA7AA"}'::jsonb),
 ('common:c19','common_color','청록','{"a":"#368B91","b":"#368B91"}'::jsonb),
 ('common:c20','common_color','석유색','{"a":"#28676F","b":"#28676F"}'::jsonb),
 ('common:c21','common_color','하늘','{"a":"#79A9C8","b":"#79A9C8"}'::jsonb),
 ('common:c22','common_color','바다','{"a":"#488FAF","b":"#488FAF"}'::jsonb),
 ('common:c23','common_color','잉크블루','{"a":"#366B8C","b":"#366B8C"}'::jsonb),
 ('common:c24','common_color','수국','{"a":"#809ACC","b":"#809ACC"}'::jsonb),
 ('common:c25','common_color','파랑','{"a":"#527BC0","b":"#527BC0"}'::jsonb),
 ('common:c26','common_color','남색','{"a":"#3D5994","b":"#3D5994"}'::jsonb),
 ('common:c27','common_color','라벤더','{"a":"#A78AC9","b":"#A78AC9"}'::jsonb),
 ('common:c28','common_color','보라','{"a":"#8B69B1","b":"#8B69B1"}'::jsonb),
 ('common:c29','common_color','포도','{"a":"#674B8D","b":"#674B8D"}'::jsonb),
 ('common:c30','common_color','벚꽃','{"a":"#CF91B2","b":"#CF91B2"}'::jsonb),
 ('common:c31','common_color','분홍','{"a":"#BB6B98","b":"#BB6B98"}'::jsonb),
 ('common:c32','common_color','자두','{"a":"#914B76","b":"#914B76"}'::jsonb),
 ('common:c33','common_color','은회색','{"a":"#9898A1","b":"#9898A1"}'::jsonb),
 ('common:c34','common_color','회색','{"a":"#727C8B","b":"#727C8B"}'::jsonb),
 ('common:c35','common_color','먹색','{"a":"#485360","b":"#485360"}'::jsonb),
 ('rare:r-berry','rare_color','베리소다','{"a":"#BB6B98","b":"#527BC0"}'::jsonb),
 ('rare:r-sunset','rare_color','선셋','{"a":"#C57543","b":"#8B69B1"}'::jsonb),
 ('rare:r-mint-chocolate','rare_color','민트초코','{"a":"#42977D","b":"#8F6A50"}'::jsonb),
 ('rare:r-sea','rare_color','바다','{"a":"#488FAF","b":"#28676F"}'::jsonb),
 ('rare:r-petal','rare_color','꽃잎','{"a":"#CF91B2","b":"#674B8D"}'::jsonb),
 ('rare:r-autumn','rare_color','가을','{"a":"#A99231","b":"#965329"}'::jsonb),
 ('rare:r-peach','rare_color','복숭아','{"a":"#D98A62","b":"#D9747C"}'::jsonb),
 ('rare:r-lemon-soda','rare_color','레몬소다','{"a":"#C3AA4E","b":"#6FAE95"}'::jsonb),
 ('rare:r-hydrangea','rare_color','수국','{"a":"#809ACC","b":"#A78AC9"}'::jsonb),
 ('rare:r-aurora','rare_color','오로라','{"a":"#368B91","b":"#8B69B1"}'::jsonb),
 ('rare:r-glacier','rare_color','빙하','{"a":"#6BA7AA","b":"#9898A1"}'::jsonb),
 ('rare:r-deep-sea','rare_color','심해','{"a":"#366B8C","b":"#3D5994"}'::jsonb),
 ('rare:r-rose','rare_color','장미','{"a":"#C4515D","b":"#914B76"}'::jsonb),
 ('rare:r-camellia','rare_color','동백','{"a":"#D9747C","b":"#578761"}'::jsonb),
 ('rare:r-black-tea','rare_color','홍차','{"a":"#AF8A6D","b":"#953E4B"}'::jsonb),
 ('rare:r-caramel','rare_color','카라멜','{"a":"#C3AA4E","b":"#694D3D"}'::jsonb),
 ('rare:r-matcha','rare_color','말차','{"a":"#7DA06A","b":"#AF8A6D"}'::jsonb),
 ('rare:r-olive','rare_color','올리브','{"a":"#827222","b":"#38664B"}'::jsonb),
 ('rare:r-twilight','rare_color','황혼','{"a":"#965329","b":"#3D5994"}'::jsonb),
 ('rare:r-fire','rare_color','불꽃','{"a":"#C4515D","b":"#A99231"}'::jsonb),
 ('rare:r-cotton-candy','rare_color','솜사탕','{"a":"#CF91B2","b":"#79A9C8"}'::jsonb),
 ('rare:r-moonlight','rare_color','달빛','{"a":"#A78AC9","b":"#9898A1"}'::jsonb),
 ('rare:r-black-pearl','rare_color','흑진주','{"a":"#727C8B","b":"#2E7364"}'::jsonb),
 ('rare:r-black-rose','rare_color','흑장미','{"a":"#953E4B","b":"#485360"}'::jsonb),
 ('icon:leaf','icon','잎사귀','{"src":"/icons/achievement-preview/leaf.svg"}'::jsonb),
 ('icon:puzzle','icon','퍼즐 조각','{"src":"/icons/achievement-preview/puzzle.svg"}'::jsonb),
 ('icon:flame','icon','불꽃','{"src":"/icons/achievement-preview/flame.svg"}'::jsonb),
 ('icon:cherry','icon','체리','{"src":"/icons/achievement-preview/cherry.svg"}'::jsonb),
 ('icon:brain','icon','두뇌','{"src":"/icons/achievement-preview/brain.svg"}'::jsonb),
 ('icon:skull','icon','해골','{"src":"/icons/achievement-preview/skull.svg"}'::jsonb),
 ('icon:sword','icon','검','{"src":"/icons/achievement-preview/sword.svg"}'::jsonb),
 ('icon:swords','icon','교차한 검','{"src":"/icons/achievement-preview/swords.svg"}'::jsonb),
 ('icon:crown','icon','왕관','{"src":"/icons/achievement-preview/crown.svg"}'::jsonb),
 ('icon:star','icon','별','{"src":"/icons/achievement-preview/star.svg"}'::jsonb),
 ('icon:temperature','icon','온도계','{"src":"/icons/achievement-preview/temperature.svg"}'::jsonb),
 ('icon:number-123','icon','숫자 123','{"src":"/icons/achievement-preview/number-123.svg"}'::jsonb),
 ('icon:galaxy','icon','나선 은하','{"src":"/icons/achievement-preview/galaxy.svg"}'::jsonb),
 ('icon:rabbit','icon','토끼','{"src":"/icons/seasonal/rabbit.svg"}'::jsonb),
 ('icon:flower','icon','꽃','{"src":"/icons/flower/flower.svg"}'::jsonb),
 ('icon:bomb','icon','폭탄','{"src":"/icons/bomb/bomb-red.svg"}'::jsonb),
 ('icon:tomato','icon','토마토','{"src":"/icons/tomato.svg"}'::jsonb),
 ('icon:glass','icon','잔','{"src":"/icons/juru-marble/vodka-shot.png"}'::jsonb),
 ('icon:hanger','icon','옷걸이','{"src":"/icons/achievement-preview/hanger.svg"}'::jsonb),
 ('icon:clover','icon','네잎클로버','{"src":"/icons/achievement-preview/clover.svg"}'::jsonb),
 ('icon:flask','icon','플라스크','{"src":"/icons/achievement-preview/flask.svg"}'::jsonb),
 ('effect:ribbon','effect','빛의 띠','{"effect":"ribbon"}'::jsonb),
 ('effect:foil','effect','포일','{"effect":"foil"}'::jsonb),
 ('effect:interference','effect','간섭광','{"effect":"interference"}'::jsonb),
 ('effect:lenticular','effect','렌티큘러','{"effect":"lenticular"}'::jsonb),
 ('effect:afterglow','effect','잔광','{"effect":"afterglow"}'::jsonb),
 ('effect:sparkle','effect','별빛 반짝임','{"effect":"sparkle","source":"all-clear"}'::jsonb);

-- Prices are undecided; this version cannot be used for draws.
INSERT INTO private.cosmetic_draw_configs(version,status,price_per_draw,definition) VALUES
 (1,'draft',NULL,'{"common":["common:c0","common:c1","common:c2","common:c3","common:c4","common:c5","common:c6","common:c7","common:c8","common:c9","common:c10","common:c11","common:c12","common:c13","common:c14","common:c15","common:c16","common:c17","common:c18","common:c19","common:c20","common:c21","common:c22","common:c23","common:c24","common:c25","common:c26","common:c27","common:c28","common:c29","common:c30","common:c31","common:c32","common:c33","common:c34","common:c35"],"rare":["rare:r-berry","rare:r-sunset","rare:r-mint-chocolate","rare:r-sea","rare:r-petal","rare:r-autumn","rare:r-peach","rare:r-lemon-soda","rare:r-hydrangea","rare:r-aurora","rare:r-glacier","rare:r-deep-sea","rare:r-rose","rare:r-camellia","rare:r-black-tea","rare:r-caramel","rare:r-matcha","rare:r-olive","rare:r-twilight","rare:r-fire","rare:r-cotton-candy","rare:r-moonlight","rare:r-black-pearl","rare:r-black-rose"],"effects":["effect:ribbon","effect:foil","effect:interference","effect:lenticular","effect:afterglow"]}'::jsonb);
COMMIT;
