-- Prepared schema. Seed remains in test status; activating the event is separate.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
CREATE TABLE private.kuji_events (
 id text PRIMARY KEY,
 title text NOT NULL,
 season_id text NOT NULL,
 puzzle_id text NOT NULL,
 status text NOT NULL DEFAULT 'test' CHECK(status IN ('test','active','closed')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE private.kuji_prizes (
 event_id text NOT NULL REFERENCES private.kuji_events(id),
 id text NOT NULL,
 name text NOT NULL,
 grade text NOT NULL,
 sort_order integer NOT NULL,
 PRIMARY KEY(event_id,id)
);
-- One row is one physical prize allocation; stock is derived from tickets.
CREATE TABLE private.kuji_tickets (
 event_id text NOT NULL REFERENCES private.kuji_events(id),
 number integer NOT NULL CHECK(number>0),
 prize_id text NOT NULL,
 claimed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 claimed_nickname text,
 claimed_at timestamptz,
 PRIMARY KEY(event_id,number),
 FOREIGN KEY(event_id,prize_id) REFERENCES private.kuji_prizes(event_id,id),
 UNIQUE(event_id,claimed_by),
 CHECK((claimed_at IS NULL AND claimed_by IS NULL AND claimed_nickname IS NULL)
    OR (claimed_at IS NOT NULL AND claimed_nickname IS NOT NULL))
);
-- A deleted account leaves the awarded ticket closed and its nickname snapshot intact.
ALTER TABLE private.kuji_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.kuji_prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.kuji_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.kuji_events,private.kuji_prizes,private.kuji_tickets FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.kuji_context(requested_event text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE event_row private.kuji_events; eligible boolean;
BEGIN
 SELECT * INTO event_row FROM private.kuji_events WHERE id=requested_event AND status IN ('active','closed');
 IF NOT FOUND THEN RAISE EXCEPTION 'UNAVAILABLE'; END IF;
 eligible:=auth.uid() IS NOT NULL AND coalesce(auth.jwt()->'app_metadata'->>'provider','')='google'
   AND EXISTS(SELECT 1 FROM public.semester_completions c WHERE c.season_id=event_row.season_id
     AND c.puzzle_id=event_row.puzzle_id AND c.user_id=auth.uid() AND NOT c.excluded);
 RETURN jsonb_build_object('id',event_row.id,'title',event_row.title,'status',event_row.status,
   'can_draw',eligible AND event_row.status='active' AND NOT EXISTS(
     SELECT 1 FROM private.kuji_tickets t WHERE t.event_id=requested_event AND t.claimed_by=auth.uid())
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
REVOKE ALL ON FUNCTION public.kuji_context(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.kuji_context(text) TO anon,authenticated;

CREATE FUNCTION public.open_kuji_ticket(requested_event text,requested_number integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE event_row private.kuji_events; nick text;
BEGIN
 IF auth.uid() IS NULL OR coalesce(auth.jwt()->'app_metadata'->>'provider','')<>'google' THEN RAISE EXCEPTION 'LOGIN_REQUIRED'; END IF;
 -- Serialize claims per event. A selected ticket and the account limit commit together.
 SELECT * INTO event_row FROM private.kuji_events WHERE id=requested_event AND status IN ('active','closed') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'UNAVAILABLE'; END IF;
 -- Retries always return the existing result, even when a different number was sent.
 IF EXISTS(SELECT 1 FROM private.kuji_tickets t WHERE t.event_id=requested_event AND t.claimed_by=auth.uid()) THEN
   RETURN public.kuji_context(requested_event);
 END IF;
 IF event_row.status<>'active' THEN RAISE EXCEPTION 'UNAVAILABLE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.semester_completions c WHERE c.season_id=event_row.season_id
   AND c.puzzle_id=event_row.puzzle_id AND c.user_id=auth.uid() AND NOT c.excluded) THEN RAISE EXCEPTION 'COMPLETION_REQUIRED'; END IF;
 SELECT n.nickname INTO nick FROM public.semester_nicknames n WHERE n.season_id=event_row.season_id AND n.user_id=auth.uid();
 IF nick IS NULL THEN RAISE EXCEPTION 'PROFILE_REQUIRED'; END IF;
 UPDATE private.kuji_tickets SET claimed_by=auth.uid(),claimed_nickname=nick,claimed_at=clock_timestamp()
   WHERE event_id=requested_event AND number=requested_number AND claimed_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'TICKET_UNAVAILABLE'; END IF;
 RETURN public.kuji_context(requested_event);
END $$;
REVOKE ALL ON FUNCTION public.open_kuji_ticket(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.open_kuji_ticket(text,integer) TO authenticated;

INSERT INTO private.kuji_events(id,title,season_id,puzzle_id)
 VALUES('pepero-2026','빼빼로 쿠지','2026-2','261111_01');
INSERT INTO private.kuji_prizes(event_id,id,name,grade,sort_order) VALUES
 ('pepero-2026','chocofilled-choco','초코필드+초코','A',1),
 ('pepero-2026','white-choco','화이트+초코','A',2),
 ('pepero-2026','choco','빼빼로초코','B',3),
 ('pepero-2026','almond','빼빼로아몬드','B',4),
 ('pepero-2026','chocofilled','빼빼로초코필드','B',5),
 ('pepero-2026','white','빼빼로화이트','B',6),
 ('pepero-2026','crunky','빼빼로크런키','B',7);
-- Shuffle the 12 allocations once, never reveal an unopened ticket's prize via RPC.
INSERT INTO private.kuji_tickets(event_id,number,prize_id)
 SELECT p.event_id,row_number() OVER(ORDER BY random())::integer,p.id
 FROM private.kuji_prizes p CROSS JOIN LATERAL generate_series(1,CASE WHEN p.grade='A' THEN 1 ELSE 2 END) copy
 WHERE p.event_id='pepero-2026';
NOTIFY pgrst,'reload schema';
COMMIT;
