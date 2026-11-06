BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
ALTER TABLE private.cosmetic_equipment ADD COLUMN reversed boolean NOT NULL DEFAULT false;
ALTER TABLE private.cosmetic_equipment DROP CONSTRAINT cosmetic_equipment_direction_check;
ALTER TABLE private.cosmetic_equipment ADD CONSTRAINT cosmetic_equipment_direction_check CHECK(direction IN ('diagonal','horizontal','vertical'));
CREATE OR REPLACE FUNCTION public.set_cosmetic_equipment(expected_equipment_version bigint, equipment jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_equipment private.cosmetic_equipment; picked text; field text;
 icon_value text; color_value text; effect_value text; expression_value text; direction_value text; reversed_value boolean;
BEGIN
 PERFORM private.assert_cosmetic_access();
 IF equipment IS NULL OR jsonb_typeof(equipment)<>'object' OR expected_equipment_version IS NULL OR expected_equipment_version<0
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(equipment) k WHERE k NOT IN ('icon_id','color_id','effect_id','expression','direction','reversed')) THEN RAISE EXCEPTION 'INVALID_EQUIPMENT'; END IF;
 icon_value:=equipment->>'icon_id'; color_value:=equipment->>'color_id'; effect_value:=equipment->>'effect_id';
 IF effect_value='effect:sparkle' THEN RAISE EXCEPTION 'USE_ALL_CLEAR_TOGGLE'; END IF;
 expression_value:=coalesce(equipment->>'expression','gradient'); direction_value:=coalesce(equipment->>'direction','diagonal');
 IF equipment ? 'reversed' AND jsonb_typeof(equipment->'reversed')<>'boolean' THEN RAISE EXCEPTION 'INVALID_EQUIPMENT'; END IF;
 reversed_value:=coalesce((equipment->>'reversed')::boolean,false);
 IF expression_value NOT IN ('gradient','split') OR direction_value NOT IN ('diagonal','horizontal','vertical') THEN RAISE EXCEPTION 'INVALID_EQUIPMENT'; END IF;
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
  AND current_equipment.effect_id IS NOT DISTINCT FROM effect_value AND current_equipment.expression=expression_value AND current_equipment.direction=direction_value AND current_equipment.reversed=reversed_value THEN
  RETURN jsonb_build_object('state',private.cosmetic_state(),'unchanged',true);
 END IF;
 IF current_equipment.equipment_version<>expected_equipment_version THEN RAISE EXCEPTION 'EQUIPMENT_CHANGED'; END IF;
 UPDATE private.cosmetic_equipment SET icon_id=icon_value,color_id=color_value,effect_id=effect_value,
  expression=expression_value,direction=direction_value,reversed=reversed_value,equipment_version=equipment_version+1 WHERE user_id=auth.uid();
 RETURN jsonb_build_object('state',private.cosmetic_state(),'unchanged',false);
END $$;
COMMIT;
