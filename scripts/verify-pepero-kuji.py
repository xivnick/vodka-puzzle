"""Verify kuji permissions and cutoff grants with rollback; --rehearse includes migrations."""
import json
import uuid
import sys
from pathlib import Path
from database import query

root = Path(__file__).resolve().parent.parent
sql = "BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s';\n"
if '--rehearse' in sys.argv:
    for name in ['20261111_pepero_kuji.sql', '20261111_pepero_kuji_cutoff.sql']:
        migration = (root / 'supabase/migrations' / name).read_text()
        sql += migration[migration.index('BEGIN;') + len('BEGIN;'):].rsplit('COMMIT;', 1)[0]
uids = [str(uuid.uuid4()) for _ in range(2)]
for index, uid in enumerate(uids):
    sql += f"""
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data)
 VALUES('{uid}','authenticated','authenticated','kuji-{uid}@example.invalid','{{"provider":"google"}}');
INSERT INTO public.semester_nicknames(season_id,user_id,nickname) VALUES('2026-2','{uid}','__kuji_{index}');
"""
sql += """
CREATE FUNCTION pg_temp.expect_error(command text, expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN
  IF SQLERRM=expected THEN RETURN; END IF;
  RAISE EXCEPTION 'Expected %, got %',expected,SQLERRM;
 END;
 RAISE EXCEPTION 'Expected error %',expected;
END $$;
SELECT pg_temp.expect_error($q$SELECT public.kuji_context('pepero-2026')$q$,'UNAVAILABLE');
DO $$ BEGIN
 IF (SELECT count(*) FROM private.kuji_tickets WHERE event_id='pepero-2026')<>12 THEN RAISE EXCEPTION 'Wrong total'; END IF;
 IF EXISTS(SELECT 1 FROM private.kuji_prizes p WHERE p.event_id='pepero-2026' AND
   (SELECT count(*) FROM private.kuji_tickets t WHERE t.event_id=p.event_id AND t.prize_id=p.id) <> CASE WHEN p.grade='A' THEN 1 ELSE 2 END) THEN RAISE EXCEPTION 'Wrong per-prize stock'; END IF;
 IF has_table_privilege('anon','private.kuji_tickets','SELECT') OR has_table_privilege('authenticated','private.kuji_tickets','SELECT')
  OR has_table_privilege('authenticated','private.kuji_tickets','UPDATE') THEN RAISE EXCEPTION 'Direct access leaked'; END IF;
END $$;
UPDATE private.kuji_events SET status='active' WHERE id='pepero-2026';
SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
SET LOCAL ROLE anon;
DO $$ DECLARE ctx jsonb:=public.kuji_context('pepero-2026'); BEGIN
 IF (ctx->>'can_draw')::boolean OR EXISTS(SELECT 1 FROM jsonb_array_elements(ctx->'tickets') t
  WHERE t->>'prize_id' IS NOT NULL OR t->>'prize_name' IS NOT NULL OR t->>'grade' IS NOT NULL) THEN RAISE EXCEPTION 'Hidden prizes leaked'; END IF;
END $$;
RESET ROLE;
SELECT pg_temp.expect_error($q$SELECT public.open_kuji_ticket('pepero-2026',1)$q$,'LOGIN_REQUIRED');
"""
for index, uid in enumerate(uids):
    claims = json.dumps({'sub': uid, 'role': 'authenticated', 'app_metadata': {'provider': 'google'}})
    sql += f"SELECT set_config('request.jwt.claims','{claims}',true);\n"
    sql += "SELECT pg_temp.expect_error($q$SELECT public.open_kuji_ticket('pepero-2026',1)$q$,'COMPLETION_REQUIRED');\n"
    sql += f"INSERT INTO public.semester_completions(season_id,user_id,nickname,puzzle_id,completed_at,excluded) VALUES('2026-2','{uid}','__kuji_{index}','261111_01',timestamptz '2026-11-11 11:11:00+09'+interval '1 microsecond',true);\n"
    sql += "SELECT pg_temp.expect_error($q$SELECT public.open_kuji_ticket('pepero-2026',1)$q$,'COMPLETION_REQUIRED');\n"
    sql += f"UPDATE public.semester_completions SET excluded=false WHERE user_id='{uid}' AND puzzle_id='261111_01';\n"
    # Excluded records and even one microsecond after the cutoff cannot qualify.
    sql += "SELECT pg_temp.expect_error($q$SELECT public.open_kuji_ticket('pepero-2026',1)$q$,'COMPLETION_REQUIRED');\n"
    claims_check = "(public.kuji_context('pepero-2026')->>'remaining_tickets')::integer"
    sql += f"DO $$ BEGIN IF {claims_check}<>0 THEN RAISE EXCEPTION 'Late completion got ticket'; END IF; END $$;\n"
    completed = "timestamptz '2026-11-11 11:11:00+09'" if index == 0 else "timestamptz '2026-11-11 11:10:59+09'"
    sql += f"UPDATE public.semester_completions SET completed_at={completed} WHERE user_id='{uid}' AND puzzle_id='261111_01';\n"
    sql += "SELECT pg_temp.expect_error($q$SELECT public.open_kuji_ticket('pepero-2026',1)$q$,'NO_TICKETS');\n"
    sql += f"INSERT INTO private.kuji_ticket_grants(event_id,user_id,qualifying_completed_at) VALUES('pepero-2026','{uid}',{completed}) ON CONFLICT DO NOTHING;\n"
    sql += f"INSERT INTO private.kuji_ticket_grants(event_id,user_id,qualifying_completed_at) VALUES('pepero-2026','{uid}',{completed}) ON CONFLICT DO NOTHING;\n"
    sql += f"DO $$ BEGIN IF {claims_check}<>1 THEN RAISE EXCEPTION 'Missing entitlement'; END IF; END $$;\n"
    if index:
        sql += "SELECT pg_temp.expect_error($q$SELECT public.open_kuji_ticket('pepero-2026',1)$q$,'TICKET_UNAVAILABLE');\n"
    sql += f"SET LOCAL ROLE authenticated; SELECT public.open_kuji_ticket('pepero-2026',{index+1}); SELECT public.open_kuji_ticket('pepero-2026',12); RESET ROLE;\n"
    sql += f"DO $$ BEGIN IF (SELECT count(*) FROM private.kuji_tickets WHERE claimed_by='{uid}')<>1 THEN RAISE EXCEPTION 'Repeated claim'; END IF; END $$;\n"
sql += """
DO $$ DECLARE ctx jsonb:=public.kuji_context('pepero-2026'); BEGIN
 IF (SELECT count(*) FROM jsonb_array_elements(ctx->'tickets') t WHERE t->>'prize_id' IS NOT NULL)<>2
  OR (SELECT sum((p->>'remaining')::integer) FROM jsonb_array_elements(ctx->'prizes') p)<>10
  OR (ctx->>'can_draw')::boolean OR (ctx->>'remaining_tickets')::integer<>0 THEN RAISE EXCEPTION 'Wrong final stock or eligibility'; END IF;
END $$;
UPDATE private.kuji_events SET status='closed' WHERE id='pepero-2026';
SELECT public.open_kuji_ticket('pepero-2026',12);
ROLLBACK;
"""
query(sql)
print('PASS: cutoff before/at/after boundary, explicit grants, remaining balance, rollback-only schema, stock, hidden prizes, roles, completion eligibility, ticket collision, idempotency, closed recovery')
