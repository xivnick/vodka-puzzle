-- Multi-ticket balances per event, with an immutable credit/debit history.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
CREATE TABLE private.kuji_ticket_wallets (
 event_id text NOT NULL REFERENCES private.kuji_events(id),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 balance integer NOT NULL DEFAULT 0 CHECK(balance>=0),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(event_id,user_id)
);
CREATE TABLE private.kuji_ticket_ledger (
 event_id text NOT NULL,
 user_id uuid NOT NULL,
 source text NOT NULL CHECK(source IN ('completion','reward','purchase','admin','refund','draw')),
 reference text NOT NULL CHECK(length(reference)>0),
 delta integer NOT NULL CHECK(delta<>0),
 balance_after integer NOT NULL CHECK(balance_after>=0),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(event_id,source,reference),
 FOREIGN KEY(event_id,user_id) REFERENCES private.kuji_ticket_wallets(event_id,user_id) ON DELETE CASCADE,
 CHECK((source='draw' AND delta=-1) OR (source<>'draw' AND delta>0))
);
CREATE INDEX kuji_ticket_ledger_account ON private.kuji_ticket_ledger(event_id,user_id,created_at);
ALTER TABLE private.kuji_ticket_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.kuji_ticket_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.kuji_ticket_wallets,private.kuji_ticket_ledger FROM PUBLIC,anon,authenticated;
ALTER TABLE private.kuji_tickets DROP CONSTRAINT kuji_tickets_event_id_claimed_by_key;
CREATE INDEX kuji_tickets_account ON private.kuji_tickets(event_id,claimed_by);

-- Trusted database/server use only. Payment verification belongs to the payment service.
-- A source/reference is unique across the event, including across different accounts.
CREATE FUNCTION private.credit_kuji_tickets(
 requested_event text, target_user uuid, amount integer, credit_source text, credit_reference text,
 credit_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous private.kuji_ticket_ledger; result integer;
BEGIN
 IF amount IS NULL OR amount<=0 OR credit_source IS NULL OR credit_source NOT IN ('completion','reward','purchase','admin','refund')
  OR credit_reference IS NULL OR length(credit_reference)=0 THEN RAISE EXCEPTION 'INVALID_CREDIT'; END IF;
 PERFORM 1 FROM private.kuji_events WHERE id=requested_event FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'UNAVAILABLE'; END IF;
 SELECT * INTO previous FROM private.kuji_ticket_ledger
  WHERE event_id=requested_event AND source=credit_source AND reference=credit_reference;
 IF FOUND THEN
  IF previous.user_id IS DISTINCT FROM target_user OR previous.delta<>amount OR previous.metadata IS DISTINCT FROM coalesce(credit_metadata,'{}'::jsonb) THEN
   RAISE EXCEPTION 'CREDIT_REFERENCE_MISMATCH';
  END IF;
  SELECT balance INTO result FROM private.kuji_ticket_wallets WHERE event_id=requested_event AND user_id=target_user;
  RETURN result;
 END IF;
 INSERT INTO private.kuji_ticket_wallets(event_id,user_id) VALUES(requested_event,target_user) ON CONFLICT DO NOTHING;
 UPDATE private.kuji_ticket_wallets SET balance=balance+amount,updated_at=clock_timestamp()
  WHERE event_id=requested_event AND user_id=target_user RETURNING balance INTO result;
 INSERT INTO private.kuji_ticket_ledger(event_id,user_id,source,reference,delta,balance_after,metadata)
  VALUES(requested_event,target_user,credit_source,credit_reference,amount,result,coalesce(credit_metadata,'{}'::jsonb));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION private.credit_kuji_tickets(text,uuid,integer,text,text,jsonb) FROM PUBLIC,anon,authenticated;

-- Preserve each existing grant, plus any already completed draw, without issuing extra tickets.
DO $$ DECLARE g record; t record; result integer; BEGIN
 FOR g IN SELECT * FROM private.kuji_ticket_grants ORDER BY event_id,user_id LOOP
  PERFORM private.credit_kuji_tickets(g.event_id,g.user_id,1,'completion','legacy:'||g.user_id::text,
   jsonb_build_object('qualifying_completed_at',g.qualifying_completed_at,'granted_at',g.granted_at));
 END LOOP;
 FOR t IN SELECT * FROM private.kuji_tickets WHERE claimed_by IS NOT NULL ORDER BY event_id,claimed_at,number LOOP
  UPDATE private.kuji_ticket_wallets SET balance=balance-1,updated_at=clock_timestamp()
   WHERE event_id=t.event_id AND user_id=t.claimed_by RETURNING balance INTO result;
  IF NOT FOUND THEN RAISE EXCEPTION 'Historical draw without entitlement'; END IF;
  INSERT INTO private.kuji_ticket_ledger(event_id,user_id,source,reference,delta,balance_after,metadata,created_at)
   VALUES(t.event_id,t.claimed_by,'draw',t.number::text,-1,result,jsonb_build_object('ticket_number',t.number),t.claimed_at);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.kuji_context(requested_event text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE event_row private.kuji_events; eligible boolean; ticket_balance integer:=0;
BEGIN
 SELECT * INTO event_row FROM private.kuji_events WHERE id=requested_event AND status IN ('active','closed');
 IF NOT FOUND THEN RAISE EXCEPTION 'UNAVAILABLE'; END IF;
 eligible:=auth.uid() IS NOT NULL AND coalesce(auth.jwt()->'app_metadata'->>'provider','')='google'
  AND (event_row.eligibility_cutoff IS NULL OR EXISTS(
   SELECT 1 FROM public.semester_completions c WHERE c.season_id=event_row.season_id AND c.puzzle_id=event_row.puzzle_id
   AND c.user_id=auth.uid() AND NOT c.excluded AND c.completed_at<=event_row.eligibility_cutoff));
 IF auth.uid() IS NOT NULL AND coalesce(auth.jwt()->'app_metadata'->>'provider','')='google' THEN
  SELECT coalesce((SELECT w.balance FROM private.kuji_ticket_wallets w WHERE w.event_id=requested_event AND w.user_id=auth.uid()),0) INTO ticket_balance;
 END IF;
 RETURN jsonb_build_object('id',event_row.id,'title',event_row.title,'status',event_row.status,
  'remaining_tickets',ticket_balance,
  'can_draw',eligible AND ticket_balance>0 AND event_row.status='active'
   AND EXISTS(SELECT 1 FROM private.kuji_tickets t WHERE t.event_id=requested_event AND t.claimed_at IS NULL),
  'prizes',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'grade',p.grade,
   'total',(SELECT count(*) FROM private.kuji_tickets t WHERE t.event_id=p.event_id AND t.prize_id=p.id),
   'remaining',(SELECT count(*) FROM private.kuji_tickets t WHERE t.event_id=p.event_id AND t.prize_id=p.id AND t.claimed_at IS NULL)
  ) ORDER BY p.sort_order) FROM private.kuji_prizes p WHERE p.event_id=requested_event),'[]'::jsonb),
  'tickets',coalesce((SELECT jsonb_agg(jsonb_build_object('number',t.number,'claimed_at',t.claimed_at,
   'is_me',coalesce(t.claimed_by=auth.uid(),false),'nickname',t.claimed_nickname,
   'prize_id',CASE WHEN t.claimed_at IS NOT NULL THEN p.id END,
   'prize_name',CASE WHEN t.claimed_at IS NOT NULL THEN p.name END,
   'grade',CASE WHEN t.claimed_at IS NOT NULL THEN p.grade END
  ) ORDER BY t.number) FROM private.kuji_tickets t JOIN private.kuji_prizes p
   ON p.event_id=t.event_id AND p.id=t.prize_id WHERE t.event_id=requested_event),'[]'::jsonb));
END $$;
CREATE OR REPLACE FUNCTION public.open_kuji_ticket(requested_event text,requested_number integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE event_row private.kuji_events; ticket_row private.kuji_tickets; nick text; result integer;
BEGIN
 IF auth.uid() IS NULL OR coalesce(auth.jwt()->'app_metadata'->>'provider','')<>'google' THEN RAISE EXCEPTION 'LOGIN_REQUIRED'; END IF;
 SELECT * INTO event_row FROM private.kuji_events WHERE id=requested_event AND status IN ('active','closed') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'UNAVAILABLE'; END IF;
 SELECT * INTO ticket_row FROM private.kuji_tickets WHERE event_id=requested_event AND number=requested_number;
 IF NOT FOUND THEN RAISE EXCEPTION 'TICKET_UNAVAILABLE'; END IF;
 -- The same coupon is the retry key; a different coupon is another paid draw.
 IF ticket_row.claimed_by=auth.uid() THEN RETURN public.kuji_context(requested_event); END IF;
 IF event_row.status<>'active' THEN RAISE EXCEPTION 'UNAVAILABLE'; END IF;
 IF ticket_row.claimed_at IS NOT NULL THEN RAISE EXCEPTION 'TICKET_UNAVAILABLE'; END IF;
 IF event_row.eligibility_cutoff IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.semester_completions c WHERE c.season_id=event_row.season_id AND c.puzzle_id=event_row.puzzle_id
  AND c.user_id=auth.uid() AND NOT c.excluded AND c.completed_at<=event_row.eligibility_cutoff) THEN RAISE EXCEPTION 'COMPLETION_REQUIRED'; END IF;
 SELECT n.nickname INTO nick FROM public.semester_nicknames n WHERE n.season_id=event_row.season_id AND n.user_id=auth.uid();
 IF nick IS NULL THEN RAISE EXCEPTION 'PROFILE_REQUIRED'; END IF;
 UPDATE private.kuji_ticket_wallets SET balance=balance-1,updated_at=clock_timestamp()
  WHERE event_id=requested_event AND user_id=auth.uid() AND balance>0 RETURNING balance INTO result;
 IF NOT FOUND THEN RAISE EXCEPTION 'NO_TICKETS'; END IF;
 UPDATE private.kuji_tickets SET claimed_by=auth.uid(),claimed_nickname=nick,claimed_at=clock_timestamp()
  WHERE event_id=requested_event AND number=requested_number;
 INSERT INTO private.kuji_ticket_ledger(event_id,user_id,source,reference,delta,balance_after,metadata)
  VALUES(requested_event,auth.uid(),'draw',requested_number::text,-1,result,jsonb_build_object('ticket_number',requested_number));
 RETURN public.kuji_context(requested_event);
END $$;
REVOKE ALL ON FUNCTION public.kuji_context(text),public.open_kuji_ticket(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.kuji_context(text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.open_kuji_ticket(text,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
