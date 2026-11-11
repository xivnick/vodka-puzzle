"""Undo explicitly selected test draws, retaining the debit and a linked refund audit."""
import argparse
import datetime
import json
import os
from pathlib import Path
import uuid
from database import query

parser = argparse.ArgumentParser()
parser.add_argument('--event', required=True)
parser.add_argument('--nickname', required=True)
parser.add_argument('--numbers', required=True, type=int, nargs='+')
parser.add_argument('--dry-run', action='store_true')
args = parser.parse_args()
if not args.numbers or len(set(args.numbers)) != len(args.numbers) or min(args.numbers) < 1:
    raise SystemExit('Select distinct positive coupon numbers.')
event = args.event.replace("'", "''")
nickname = args.nickname.replace("'", "''")
numbers = ','.join(str(n) for n in args.numbers)
operation = str(uuid.uuid4())
if not args.dry_run:
    snapshot = query(f"""SELECT jsonb_build_object('wallet',to_jsonb(w),'tickets',
      (SELECT jsonb_agg(to_jsonb(t)) FROM private.kuji_tickets t WHERE t.event_id=w.event_id AND t.claimed_by=w.user_id),
      'ledger',(SELECT jsonb_agg(to_jsonb(l) ORDER BY l.created_at) FROM private.kuji_ticket_ledger l WHERE l.event_id=w.event_id AND l.user_id=w.user_id)) AS snapshot
      FROM private.kuji_ticket_wallets w JOIN public.semester_nicknames n ON n.user_id=w.user_id
      JOIN private.kuji_events e ON e.id=w.event_id AND e.season_id=n.season_id
      WHERE w.event_id='{event}' AND n.nickname='{nickname}';""")
    if len(snapshot) != 1:
        raise SystemExit('Exactly one existing wallet/account is required.')
    directory = Path.home() / 'Documents/Backups/vodka-puzzle/kuji-test-resets'
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup = directory / f'{stamp}-{operation}.json'
    with os.fdopen(os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as file:
        json.dump({'operation': operation, 'snapshot': snapshot}, file, ensure_ascii=False, indent=2)
sql = f"""BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s';
DO $$ DECLARE
 owner uuid; matches integer; season text; t private.kuji_tickets; old_debit private.kuji_ticket_ledger;
 untouched_tickets jsonb; untouched_wallets jsonb; remaining integer; total integer:=0;
BEGIN
 SELECT season_id INTO season FROM private.kuji_events WHERE id='{event}' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
 SELECT count(*),(array_agg(user_id))[1] INTO matches,owner FROM public.semester_nicknames WHERE season_id=season AND nickname='{nickname}';
 IF matches<>1 THEN RAISE EXCEPTION 'Exactly one account required'; END IF;
 IF (SELECT count(*) FROM private.kuji_tickets WHERE event_id='{event}' AND number=ANY(ARRAY[{numbers}]) AND claimed_by=owner)<>{len(args.numbers)} THEN
  RAISE EXCEPTION 'Selected coupons are not all claimed by this account';
 END IF;
 SELECT jsonb_agg(to_jsonb(x) ORDER BY x.number) INTO untouched_tickets FROM private.kuji_tickets x WHERE x.event_id='{event}' AND NOT x.number=ANY(ARRAY[{numbers}]);
 SELECT jsonb_agg(to_jsonb(w) ORDER BY w.user_id) INTO untouched_wallets FROM private.kuji_ticket_wallets w WHERE w.event_id='{event}' AND w.user_id<>owner;
 FOR t IN SELECT * FROM private.kuji_tickets WHERE event_id='{event}' AND number=ANY(ARRAY[{numbers}]) ORDER BY number LOOP
  SELECT * INTO old_debit FROM private.kuji_ticket_ledger WHERE event_id='{event}' AND source='draw' AND reference=t.number::text;
  IF NOT FOUND OR old_debit.user_id<>owner OR old_debit.delta<>-1 THEN RAISE EXCEPTION 'Original draw debit mismatch'; END IF;
  -- Preserve the original debit while freeing the coupon's retry key for a new draw.
  UPDATE private.kuji_ticket_ledger SET reference='reset:{operation}:'||t.number::text,
   metadata=metadata||jsonb_build_object('original_reference',old_debit.reference,'test_reset','{operation}')
   WHERE event_id='{event}' AND source='draw' AND reference=t.number::text;
  PERFORM private.credit_kuji_tickets('{event}',owner,1,'refund','test-reset:{operation}:'||t.number::text,
   jsonb_build_object('reason','test_reset','reset_id','{operation}','original_ticket',to_jsonb(t),'original_debit',to_jsonb(old_debit)));
  UPDATE private.kuji_tickets SET claimed_by=NULL,claimed_nickname=NULL,claimed_at=NULL WHERE event_id='{event}' AND number=t.number;
  total:=total+1;
 END LOOP;
 SELECT balance INTO remaining FROM private.kuji_ticket_wallets WHERE event_id='{event}' AND user_id=owner;
 IF remaining IS DISTINCT FROM (SELECT sum(delta) FROM private.kuji_ticket_ledger WHERE event_id='{event}' AND user_id=owner) THEN RAISE EXCEPTION 'Refund ledger mismatch'; END IF;
 IF untouched_tickets IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.number) FROM private.kuji_tickets x WHERE x.event_id='{event}' AND NOT x.number=ANY(ARRAY[{numbers}]))
  OR untouched_wallets IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(w) ORDER BY w.user_id) FROM private.kuji_ticket_wallets w WHERE w.event_id='{event}' AND w.user_id<>owner)
 THEN RAISE EXCEPTION 'Unrelated records changed'; END IF;
 IF EXISTS(SELECT 1 FROM private.kuji_tickets WHERE event_id='{event}' AND number=ANY(ARRAY[{numbers}]) AND claimed_at IS NOT NULL) THEN RAISE EXCEPTION 'Ticket still claimed'; END IF;
END $$;
SELECT n.nickname,w.balance,
 (SELECT count(*) FROM private.kuji_tickets t WHERE t.event_id=w.event_id AND t.claimed_by=w.user_id) AS remaining_claims
 FROM private.kuji_ticket_wallets w JOIN public.semester_nicknames n ON n.user_id=w.user_id
 JOIN private.kuji_events e ON e.id=w.event_id AND e.season_id=n.season_id
 WHERE w.event_id='{event}' AND n.nickname='{nickname}';
{'ROLLBACK' if args.dry_run else 'COMMIT'};
"""
result = query(sql)
print(('Rehearsed with rollback: ' if args.dry_run else 'Reset completed: ') + json.dumps(result, ensure_ascii=False))
