"""Rollback-only wallet/claim checks. Rehearse a pending migration before applying it."""
import json
import sys
import uuid
from pathlib import Path
from database import query

root = Path(__file__).resolve().parent.parent
sql = "BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s';\n"
names = []
if '--rehearse' in sys.argv:
    names = ['20261111_pepero_kuji.sql', '20261111_pepero_kuji_cutoff.sql', '20261111_kuji_ticket_wallets.sql']
elif '--rehearse-wallets' in sys.argv:
    names = ['20261111_kuji_ticket_wallets.sql']
for name in names:
    migration = (root / 'supabase/migrations' / name).read_text()
    sql += migration[migration.index('BEGIN;') + len('BEGIN;'):].rsplit('COMMIT;', 1)[0]
uids = [str(uuid.uuid4()) for _ in range(2)]
event = 'verify-kuji-' + str(uuid.uuid4())
other = event + '-other'
for index, uid in enumerate(uids):
    sql += f"""
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data)
 VALUES('{uid}','authenticated','authenticated','kuji-{uid}@example.invalid','{{"provider":"google"}}');
INSERT INTO public.semester_nicknames(season_id,user_id,nickname) VALUES('2026-2','{uid}','__kuji_{index}');
INSERT INTO public.semester_completions(season_id,user_id,nickname,puzzle_id,completed_at)
 VALUES('2026-2','{uid}','__kuji_{index}','261111_01',timestamptz '2026-11-11 11:11:00+09'+interval '1 microsecond');
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
CREATE FUNCTION pg_temp.check_balance(event text,expected integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF (public.kuji_context(event)->>'remaining_tickets')::integer<>expected THEN RAISE EXCEPTION 'Wrong balance, expected %',expected; END IF;
END $$;
DO $$ BEGIN
 IF has_table_privilege('authenticated','private.kuji_ticket_wallets','UPDATE')
  OR has_table_privilege('anon','private.kuji_ticket_ledger','SELECT')
  OR has_table_privilege('authenticated','private.kuji_tickets','SELECT')
  OR has_function_privilege('authenticated','private.credit_kuji_tickets(text,uuid,integer,text,text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Client can access private money or prizes'; END IF;
 IF EXISTS(SELECT 1 FROM private.kuji_ticket_wallets w WHERE w.balance<>(SELECT coalesce(sum(l.delta),0)
   FROM private.kuji_ticket_ledger l WHERE l.event_id=w.event_id AND l.user_id=w.user_id)) THEN RAISE EXCEPTION 'Migration balance mismatch'; END IF;
END $$;
"""
sql += f"""
INSERT INTO private.kuji_events(id,title,season_id,puzzle_id,status,eligibility_cutoff) VALUES
 ('{event}','wallet check','2026-2','261111_01','active',timestamptz '2026-11-11 11:11:00+09'),
 ('{other}','other event','2026-2','261111_01','active',NULL);
INSERT INTO private.kuji_prizes(event_id,id,name,grade,sort_order) VALUES('{event}','test','test prize','B',1);
INSERT INTO private.kuji_tickets(event_id,number,prize_id) SELECT '{event}',n,'test' FROM generate_series(1,5) n;
SELECT set_config('request.jwt.claims','{{"role":"anon"}}',true);
SET LOCAL ROLE anon;
DO $$ DECLARE ctx jsonb:=public.kuji_context('{event}'); BEGIN
 IF (ctx->>'can_draw')::boolean OR (ctx->>'remaining_tickets')::integer<>0
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(ctx->'tickets') t WHERE t->>'prize_id' IS NOT NULL) THEN RAISE EXCEPTION 'Anonymous or hidden prize leak'; END IF;
END $$;
RESET ROLE;
SELECT pg_temp.expect_error($q$SELECT public.open_kuji_ticket('{event}',1)$q$,'LOGIN_REQUIRED');
"""

def login(index):
    return "SELECT set_config('request.jwt.claims','" + json.dumps({'sub': uids[index], 'role': 'authenticated', 'app_metadata': {'provider': 'google'}}) + "',true);\n"

def expect(command, error):
    return f"SELECT pg_temp.expect_error($q${command}$q$,'{error}');\n"

sql += login(0)
sql += expect(f"SELECT public.open_kuji_ticket('{event}',1)", 'COMPLETION_REQUIRED')
sql += f"UPDATE public.semester_completions SET completed_at=timestamptz '2026-11-11 11:11:00+09' WHERE user_id='{uids[0]}' AND puzzle_id='261111_01';\n"
sql += expect(f"SELECT public.open_kuji_ticket('{event}',1)", 'NO_TICKETS')
sql += f"SELECT private.credit_kuji_tickets('{event}','{uids[0]}',1,'completion','cutoff');\n" * 2
sql += f"SELECT pg_temp.check_balance('{event}',1);\n"
sql += f"SELECT private.credit_kuji_tickets('{event}','{uids[0]}',2,'reward','reward-1');\n" * 2
sql += f"SELECT pg_temp.check_balance('{event}',3);\n"
sql += expect(f"SELECT private.credit_kuji_tickets('{event}','{uids[0]}',3,'reward','reward-1')", 'CREDIT_REFERENCE_MISMATCH')
sql += f"SELECT private.credit_kuji_tickets('{other}','{uids[0]}',4,'admin','other'); SELECT pg_temp.check_balance('{other}',4); SELECT pg_temp.check_balance('{event}',3);\n"
for number in [1, 2, 3]:
    sql += f"SET LOCAL ROLE authenticated; SELECT public.open_kuji_ticket('{event}',{number}); SELECT public.open_kuji_ticket('{event}',{number}); RESET ROLE; SELECT pg_temp.check_balance('{event}',{3-number});\n"
sql += expect(f"SELECT public.open_kuji_ticket('{event}',4)", 'NO_TICKETS')
sql += expect(f"SELECT public.open_kuji_ticket('{event}',99)", 'TICKET_UNAVAILABLE')
sql += f"SELECT private.credit_kuji_tickets('{event}','{uids[0]}',2,'purchase','order-1','{{\"provider\":\"fixture\"}}');\n" * 2
sql += f"SELECT pg_temp.check_balance('{event}',2); SELECT public.open_kuji_ticket('{event}',4); SELECT public.open_kuji_ticket('{event}',4); SELECT pg_temp.check_balance('{event}',1);\n"
sql += login(1)
sql += f"SELECT private.credit_kuji_tickets('{event}','{uids[1]}',1,'admin','second');\n"
sql += expect(f"SELECT public.open_kuji_ticket('{event}',5)", 'COMPLETION_REQUIRED')
sql += f"UPDATE public.semester_completions SET completed_at=timestamptz '2026-11-11 11:10:59+09',excluded=true WHERE user_id='{uids[1]}' AND puzzle_id='261111_01';\n"
sql += expect(f"SELECT public.open_kuji_ticket('{event}',5)", 'COMPLETION_REQUIRED')
sql += f"UPDATE public.semester_completions SET excluded=false WHERE user_id='{uids[1]}' AND puzzle_id='261111_01';\n"
sql += expect(f"SELECT public.open_kuji_ticket('{event}',1)", 'TICKET_UNAVAILABLE')
sql += expect(f"SELECT private.credit_kuji_tickets('{event}','{uids[1]}',2,'purchase','order-1','{{\"provider\":\"fixture\"}}')", 'CREDIT_REFERENCE_MISMATCH')
sql += f"SELECT pg_temp.check_balance('{event}',1); SELECT public.open_kuji_ticket('{event}',5); SELECT pg_temp.check_balance('{event}',0);\n"
sql += login(0)
sql += f"""
SELECT pg_temp.check_balance('{event}',1);
DO $$ DECLARE ctx jsonb:=public.kuji_context('{event}'); BEGIN
 IF (ctx->>'can_draw')::boolean THEN RAISE EXCEPTION 'Sold out can draw'; END IF;
 IF (SELECT count(*) FROM private.kuji_tickets WHERE event_id='{event}' AND claimed_by='{uids[0]}')<>4 THEN RAISE EXCEPTION 'Multiple draws lost'; END IF;
 IF (SELECT count(*) FROM private.kuji_ticket_ledger WHERE event_id='{event}' AND source='draw')<>5 THEN RAISE EXCEPTION 'Draw charged twice'; END IF;
 IF EXISTS(SELECT 1 FROM private.kuji_ticket_wallets w WHERE w.balance<>(SELECT coalesce(sum(l.delta),0)
  FROM private.kuji_ticket_ledger l WHERE l.event_id=w.event_id AND l.user_id=w.user_id)) THEN RAISE EXCEPTION 'Ledger mismatch'; END IF;
END $$;
UPDATE private.kuji_events SET status='closed' WHERE id='{event}';
SELECT public.open_kuji_ticket('{event}',4);
SELECT pg_temp.check_balance('{event}',1);
ROLLBACK;
"""
query(sql)
print('PASS: grant migration, multiple credits/draws, balance ledger, cutoff, zero balance, coupon collision, same-coupon retry, duplicate order/account protection, event separation, sold-out balance, private permissions')
