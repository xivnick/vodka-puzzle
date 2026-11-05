BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
-- The preference is permanent; eligibility is always derived from the current
-- public ordinary-puzzle set and valid completions, independent of history policy.
ALTER TABLE private.cosmetic_equipment ADD COLUMN all_clear_enabled boolean NOT NULL DEFAULT false;
UPDATE private.cosmetic_equipment SET all_clear_enabled=true,effect_id=NULL,equipment_version=equipment_version+1
 WHERE effect_id='effect:sparkle';
-- Keep old claims/definitions for audit only. All-clear is no longer a mission.
UPDATE private.achievement_rules SET active=false,version=version+1 WHERE metric='all';

CREATE FUNCTION private.all_clear_status() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH season AS (SELECT active_season AS id FROM public.semester_settings WHERE id),
 puzzles AS (SELECT p.puzzle_id FROM public.puzzle_catalog p,season s WHERE p.season_id=s.id AND p.status='published' AND p.published_at<=statement_timestamp()),
 counts AS (SELECT count(*) AS total,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM public.semester_completions c,season s
  WHERE c.season_id=s.id AND c.puzzle_id=p.puzzle_id AND c.user_id=auth.uid() AND NOT c.excluded)) AS completed FROM puzzles p),
 preference AS (SELECT coalesce((SELECT all_clear_enabled FROM private.cosmetic_equipment WHERE user_id=auth.uid()),false) AS enabled)
 SELECT jsonb_build_object('season',(SELECT id FROM season),'total',total,'completed',completed,
  'eligible',total>0 AND completed=total,'enabled',enabled,'active',total>0 AND completed=total AND enabled)
 FROM counts CROSS JOIN preference;
$$;
CREATE OR REPLACE FUNCTION private.cosmetic_state() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object(
  'coins',coalesce((SELECT balance FROM private.account_coin_wallets WHERE user_id=auth.uid()),0),
  'state_revision',coalesce((SELECT revision FROM private.account_coin_wallets WHERE user_id=auth.uid()),0),
  'inventory',coalesce((SELECT jsonb_agg(jsonb_build_object('item_id',i.item_id,'quantity',i.quantity,'kind',i.item_kind,'name',d.name,'definition',d.definition) ORDER BY i.item_id)
   FROM private.cosmetic_inventory i JOIN private.cosmetic_items d ON d.id=i.item_id WHERE i.user_id=auth.uid() AND i.item_id<>'effect:sparkle'),'[]'::jsonb),
  'equipment',coalesce((SELECT to_jsonb(e)-'user_id' FROM private.cosmetic_equipment e WHERE user_id=auth.uid()),
   '{"equipment_version":0,"all_clear_enabled":false,"icon_id":null,"color_id":null,"effect_id":null,"expression":"gradient","direction":"diagonal"}'::jsonb),
  'all_clear',private.all_clear_status(),
  'tickets',(SELECT balance FROM private.time_machine_wallets WHERE user_id=auth.uid()));
$$;
CREATE OR REPLACE FUNCTION public.cosmetic_context() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.assert_cosmetic_access();
 RETURN jsonb_build_object('state',private.cosmetic_state(),'progress',private.cosmetic_usage(),
  'draw', (SELECT jsonb_build_object('version',version,'status',status,'price_per_draw',price_per_draw,
   'weights',jsonb_build_object('common',common_weight,'rare',rare_weight,'epic',epic_weight),
   'items',definition) FROM private.cosmetic_draw_configs WHERE status='active'),
  'catalog',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'kind',kind,'name',name,'definition',definition) ORDER BY id)
   FROM private.cosmetic_items WHERE active AND kind<>'uncommon_color' AND (id<>'effect:sparkle' OR (private.all_clear_status()->>'eligible')::boolean)),'[]'::jsonb));
END $$;
CREATE OR REPLACE FUNCTION public.set_cosmetic_equipment(expected_equipment_version bigint, equipment jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_equipment private.cosmetic_equipment; picked text; field text;
 icon_value text; color_value text; effect_value text; expression_value text; direction_value text;
BEGIN
 PERFORM private.assert_cosmetic_access();
 IF equipment IS NULL OR jsonb_typeof(equipment)<>'object' OR expected_equipment_version IS NULL OR expected_equipment_version<0
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(equipment) k WHERE k NOT IN ('icon_id','color_id','effect_id','expression','direction')) THEN RAISE EXCEPTION 'INVALID_EQUIPMENT'; END IF;
 icon_value:=equipment->>'icon_id'; color_value:=equipment->>'color_id'; effect_value:=equipment->>'effect_id';
 IF effect_value='effect:sparkle' THEN RAISE EXCEPTION 'USE_ALL_CLEAR_TOGGLE'; END IF;
 expression_value:=coalesce(equipment->>'expression','gradient'); direction_value:=coalesce(equipment->>'direction','diagonal');
 IF expression_value NOT IN ('gradient','split') OR direction_value NOT IN ('diagonal','horizontal') THEN RAISE EXCEPTION 'INVALID_EQUIPMENT'; END IF;
 INSERT INTO private.account_coin_wallets(user_id) VALUES(auth.uid()) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM private.account_coin_wallets WHERE user_id=auth.uid() FOR UPDATE;
 FOREACH field IN ARRAY ARRAY['icon_id','color_id','effect_id'] LOOP
  picked:=equipment->>field;
  IF picked IS NOT NULL AND NOT EXISTS(SELECT 1 FROM private.cosmetic_inventory i JOIN private.cosmetic_items d ON d.id=i.item_id
   WHERE i.user_id=auth.uid() AND i.item_id=picked AND d.active AND CASE field
    WHEN 'icon_id' THEN d.kind='icon' WHEN 'color_id' THEN d.kind IN ('common_color','uncommon_color','rare_color') ELSE d.kind='effect' END)
   THEN RAISE EXCEPTION 'ITEM_NOT_OWNED'; END IF;
 END LOOP;
 IF effect_value IS NOT NULL AND NOT EXISTS(SELECT 1 FROM private.cosmetic_items WHERE id=color_value AND kind IN ('uncommon_color','rare_color')) THEN RAISE EXCEPTION 'EFFECT_REQUIRES_UNCOMMON'; END IF;
 INSERT INTO private.cosmetic_equipment(user_id) VALUES(auth.uid()) ON CONFLICT DO NOTHING;
 SELECT * INTO current_equipment FROM private.cosmetic_equipment WHERE user_id=auth.uid();
 IF current_equipment.icon_id IS NOT DISTINCT FROM icon_value AND current_equipment.color_id IS NOT DISTINCT FROM color_value
  AND current_equipment.effect_id IS NOT DISTINCT FROM effect_value AND current_equipment.expression=expression_value AND current_equipment.direction=direction_value THEN
  RETURN jsonb_build_object('state',private.cosmetic_state(),'unchanged',true);
 END IF;
 IF current_equipment.equipment_version<>expected_equipment_version THEN RAISE EXCEPTION 'EQUIPMENT_CHANGED'; END IF;
 UPDATE private.cosmetic_equipment SET icon_id=icon_value,color_id=color_value,effect_id=effect_value,
  expression=expression_value,direction=direction_value,equipment_version=equipment_version+1 WHERE user_id=auth.uid();
 RETURN jsonb_build_object('state',private.cosmetic_state(),'unchanged',false);
END $$;

CREATE OR REPLACE FUNCTION private.award_cosmetic_item(target_operation uuid, target_item text, result_index integer, allow_refund boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item private.cosmetic_items; owner_id uuid; is_duplicate boolean; refund bigint:=0;
BEGIN
 SELECT user_id INTO owner_id FROM private.account_operations WHERE id=target_operation AND status='pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_OPERATION'; END IF;
 IF target_item='effect:sparkle' THEN RAISE EXCEPTION 'SPECIAL_EFFECT_NOT_OWNABLE'; END IF;
 SELECT * INTO item FROM private.cosmetic_items WHERE id=target_item AND active;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ITEM'; END IF;
 is_duplicate:=item.kind<>'common_color' AND EXISTS(SELECT 1 FROM private.cosmetic_inventory WHERE user_id=owner_id AND item_id=target_item);
 IF is_duplicate THEN
  IF allow_refund THEN
   refund:=CASE WHEN item.kind='effect' THEN 500 WHEN item.kind IN ('uncommon_color','rare_color') THEN 100 ELSE 0 END;
   IF refund>0 THEN PERFORM private.change_cosmetic_coins(target_operation,refund,'duplicate'); END IF;
  END IF;
 ELSE
  PERFORM private.change_cosmetic_inventory(target_operation,target_item,1,'award');
 END IF;
 IF result_index IS NOT NULL THEN
  INSERT INTO private.cosmetic_results(operation_id,item_index,item_id,duplicate,refund_coins) VALUES(target_operation,result_index,target_item,is_duplicate,refund);
 END IF;
 RETURN jsonb_build_object('item_id',target_item,'name',item.name,'kind',item.kind,'definition',item.definition,'duplicate',is_duplicate,'refund_coins',refund);
END $$;


CREATE FUNCTION public.set_all_clear_effect(expected_equipment_version bigint, enabled boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_equipment private.cosmetic_equipment;
BEGIN
 PERFORM private.assert_cosmetic_access();
 IF enabled IS NULL OR expected_equipment_version IS NULL OR expected_equipment_version<0 THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
 INSERT INTO private.account_coin_wallets(user_id) VALUES(auth.uid()) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM private.account_coin_wallets WHERE user_id=auth.uid() FOR UPDATE;
 IF NOT (private.all_clear_status()->>'eligible')::boolean THEN RAISE EXCEPTION 'ALL_CLEAR_REQUIRED'; END IF;
 INSERT INTO private.cosmetic_equipment(user_id) VALUES(auth.uid()) ON CONFLICT DO NOTHING;
 SELECT * INTO current_equipment FROM private.cosmetic_equipment WHERE user_id=auth.uid();
 IF current_equipment.all_clear_enabled=enabled THEN RETURN jsonb_build_object('state',private.cosmetic_state(),'unchanged',true); END IF;
 IF current_equipment.equipment_version<>expected_equipment_version THEN RAISE EXCEPTION 'EQUIPMENT_CHANGED'; END IF;
 UPDATE private.cosmetic_equipment SET all_clear_enabled=enabled,equipment_version=equipment_version+1 WHERE user_id=auth.uid();
 RETURN jsonb_build_object('state',private.cosmetic_state(),'unchanged',false);
END $$;
REVOKE ALL ON FUNCTION private.all_clear_status(),public.set_all_clear_effect(bigint,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_all_clear_effect(bigint,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
