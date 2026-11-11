-- User-approved grant: Pepero Sudoku completed by 2026-11-11 11:11 KST, inclusive.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
ALTER TABLE private.kuji_events ADD COLUMN eligibility_cutoff timestamptz;
UPDATE private.kuji_events SET eligibility_cutoff=timestamptz '2026-11-11 11:11:00+09'
 WHERE id='pepero-2026';
CREATE TABLE private.kuji_ticket_grants (
 event_id text NOT NULL REFERENCES private.kuji_events(id),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 qualifying_completed_at timestamptz NOT NULL,
 granted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(event_id,user_id)
);
ALTER TABLE private.kuji_ticket_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.kuji_ticket_grants FROM PUBLIC,anon,authenticated;

-- Store the one-time entitlement separately from the 12 physical prize tickets.
-- Re-running this INSERT never duplicates a grant or gives another draw.
INSERT INTO private.kuji_ticket_grants(event_id,user_id,qualifying_completed_at)
 SELECT e.id,c.user_id,min(c.completed_at)
 FROM private.kuji_events e JOIN public.semester_completions c
   ON c.season_id=e.season_id AND c.puzzle_id=e.puzzle_id
 JOIN auth.users u ON u.id=c.user_id
 WHERE e.id='pepero-2026' AND NOT c.excluded AND c.completed_at<=e.eligibility_cutoff
   AND coalesce(u.raw_app_meta_data->>'provider','')='google'
 GROUP BY e.id,c.user_id
 ON CONFLICT(event_id,user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.kuji_context(requested_event text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE event_row private.kuji_events; eligible boolean; already_drawn boolean;
BEGIN
 SELECT * INTO event_row FROM private.kuji_events WHERE id=requested_event AND status IN ('active','closed');
 IF NOT FOUND THEN RAISE EXCEPTION 'UNAVAILABLE'; END IF;
 eligible:=auth.uid() IS NOT NULL AND coalesce(auth.jwt()->'app_metadata'->>'provider','')='google'
   AND EXISTS(SELECT 1 FROM private.kuji_ticket_grants g WHERE g.event_id=requested_event AND g.user_id=auth.uid())
   AND EXISTS(SELECT 1 FROM public.semester_completions c WHERE c.season_id=event_row.season_id
     AND c.puzzle_id=event_row.puzzle_id AND c.user_id=auth.uid() AND NOT c.excluded
     AND c.completed_at<=event_row.eligibility_cutoff);
 already_drawn:=EXISTS(SELECT 1 FROM private.kuji_tickets t WHERE t.event_id=requested_event AND t.claimed_by=auth.uid());
 RETURN jsonb_build_object('id',event_row.id,'title',event_row.title,'status',event_row.status,
   'remaining_tickets',CASE WHEN eligible AND NOT already_drawn THEN 1 ELSE 0 END,
   'can_draw',eligible AND NOT already_drawn AND event_row.status='active'
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
DECLARE event_row private.kuji_events; nick text;
BEGIN
 IF auth.uid() IS NULL OR coalesce(auth.jwt()->'app_metadata'->>'provider','')<>'google' THEN RAISE EXCEPTION 'LOGIN_REQUIRED'; END IF;
 SELECT * INTO event_row FROM private.kuji_events WHERE id=requested_event AND status IN ('active','closed') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'UNAVAILABLE'; END IF;
 IF EXISTS(SELECT 1 FROM private.kuji_tickets t WHERE t.event_id=requested_event AND t.claimed_by=auth.uid()) THEN
   RETURN public.kuji_context(requested_event);
 END IF;
 IF event_row.status<>'active' THEN RAISE EXCEPTION 'UNAVAILABLE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.semester_completions c WHERE c.season_id=event_row.season_id
   AND c.puzzle_id=event_row.puzzle_id AND c.user_id=auth.uid() AND NOT c.excluded
   AND c.completed_at<=event_row.eligibility_cutoff) THEN RAISE EXCEPTION 'COMPLETION_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.kuji_ticket_grants g WHERE g.event_id=requested_event AND g.user_id=auth.uid()) THEN
   RAISE EXCEPTION 'NO_TICKETS';
 END IF;
 SELECT n.nickname INTO nick FROM public.semester_nicknames n WHERE n.season_id=event_row.season_id AND n.user_id=auth.uid();
 IF nick IS NULL THEN RAISE EXCEPTION 'PROFILE_REQUIRED'; END IF;
 UPDATE private.kuji_tickets SET claimed_by=auth.uid(),claimed_nickname=nick,claimed_at=clock_timestamp()
   WHERE event_id=requested_event AND number=requested_number AND claimed_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'TICKET_UNAVAILABLE'; END IF;
 RETURN public.kuji_context(requested_event);
END $$;
REVOKE ALL ON FUNCTION public.kuji_context(text),public.open_kuji_ticket(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.kuji_context(text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.open_kuji_ticket(text,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
