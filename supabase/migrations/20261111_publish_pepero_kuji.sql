-- User-approved release of the standalone Pepero kuji, without a mypage entry.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $$ DECLARE state text; BEGIN
 SELECT status INTO state FROM private.kuji_events WHERE id='pepero-2026' FOR UPDATE;
 IF state IS NULL OR state NOT IN ('test','active') THEN RAISE EXCEPTION 'Pepero kuji is unavailable'; END IF;
 IF (SELECT count(*) FROM private.kuji_tickets WHERE event_id='pepero-2026')<>12 THEN RAISE EXCEPTION 'Unexpected coupon total'; END IF;
 IF EXISTS(SELECT 1 FROM private.kuji_prizes p WHERE p.event_id='pepero-2026' AND
  (SELECT count(*) FROM private.kuji_tickets t WHERE t.event_id=p.event_id AND t.prize_id=p.id)<>CASE WHEN p.grade='A' THEN 1 ELSE 2 END)
 THEN RAISE EXCEPTION 'Unexpected prize quantities'; END IF;
 IF EXISTS(SELECT 1 FROM private.kuji_ticket_wallets w WHERE w.event_id='pepero-2026' AND w.balance<>
  (SELECT coalesce(sum(l.delta),0) FROM private.kuji_ticket_ledger l WHERE l.event_id=w.event_id AND l.user_id=w.user_id))
 THEN RAISE EXCEPTION 'Ticket ledger mismatch'; END IF;
END $$;
UPDATE private.kuji_events SET status='active' WHERE id='pepero-2026' AND status='test';
COMMIT;
