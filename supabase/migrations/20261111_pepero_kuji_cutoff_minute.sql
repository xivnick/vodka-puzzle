-- Include the entire 11:11 minute: 11:11:52 is an eligible completion.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
UPDATE private.kuji_events SET eligibility_cutoff=timestamptz '2026-11-11 11:12:00+09'-interval '1 microsecond'
 WHERE id='pepero-2026';
DO $$ DECLARE g record; BEGIN
 FOR g IN
  INSERT INTO private.kuji_ticket_grants(event_id,user_id,qualifying_completed_at)
   SELECT e.id,c.user_id,min(c.completed_at) FROM private.kuji_events e
   JOIN public.semester_completions c ON c.season_id=e.season_id AND c.puzzle_id=e.puzzle_id
   JOIN auth.users u ON u.id=c.user_id
   WHERE e.id='pepero-2026' AND NOT c.excluded AND c.completed_at<=e.eligibility_cutoff
    AND u.raw_app_meta_data->>'provider'='google'
   GROUP BY e.id,c.user_id
   ON CONFLICT(event_id,user_id) DO NOTHING
   RETURNING *
 LOOP
  PERFORM private.credit_kuji_tickets(g.event_id,g.user_id,1,'completion','cutoff-minute:'||g.user_id::text,
    jsonb_build_object('qualifying_completed_at',g.qualifying_completed_at,'granted_at',g.granted_at));
 END LOOP;
END $$;
COMMIT;
