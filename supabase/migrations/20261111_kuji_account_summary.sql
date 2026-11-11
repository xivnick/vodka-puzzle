BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
-- Account-owned entry points only; no unopened prizes, other users, or test events.
CREATE FUNCTION public.kuji_account_summary() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('events',coalesce(jsonb_agg(jsonb_build_object(
  'id',q.id,'title',q.title,'status',q.status,'remaining_tickets',q.balance,'participated',q.participated
 ) ORDER BY q.created_at,q.id),'[]'::jsonb)) FROM (
  SELECT e.id,e.title,e.status,e.created_at,coalesce(w.balance,0) AS balance,
   EXISTS(SELECT 1 FROM private.kuji_tickets t WHERE t.event_id=e.id AND t.claimed_by=auth.uid()) AS participated
  FROM private.kuji_events e LEFT JOIN private.kuji_ticket_wallets w ON w.event_id=e.id AND w.user_id=auth.uid()
  WHERE e.status IN ('active','closed') AND auth.uid() IS NOT NULL
   AND coalesce(auth.jwt()->'app_metadata'->>'provider','')='google'
 ) q WHERE q.balance>0 OR q.participated;
$$;
REVOKE ALL ON FUNCTION public.kuji_account_summary() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.kuji_account_summary() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
