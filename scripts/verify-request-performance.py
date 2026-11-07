"""Rehearse request optimizations, preserving existing results and account privacy."""
import pathlib
from database import query

root = pathlib.Path(__file__).resolve().parent.parent
migration = (root / 'supabase/migrations/20261107_request_performance.sql').read_text()
baseline = """
CREATE TEMP TABLE request_baseline(owner_id uuid, requested_day date, context jsonb);
DO $$ DECLARE owner_id uuid; requested_day date; BEGIN
 FOR owner_id IN SELECT NULL::uuid UNION ALL SELECT user_id FROM public.semester_nicknames LIMIT 3 LOOP
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'app_metadata',jsonb_build_object('provider','google'))::text,true);
  FOR requested_day IN SELECT (statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date UNION ALL SELECT (statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date-1 LOOP
   INSERT INTO request_baseline VALUES(owner_id,requested_day,public.daily_sudoku_context(requested_day));
  END LOOP;
 END LOOP;
END $$;
CREATE TEMP TABLE recent_baseline AS SELECT * FROM public.recent_completions();
"""
checks = """
DO $$ DECLARE baseline request_baseline; actual jsonb; full_summary jsonb; field text; BEGIN
 FOR baseline IN SELECT * FROM request_baseline LOOP
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',baseline.owner_id,'app_metadata',jsonb_build_object('provider','google'))::text,true);
  actual:=public.daily_sudoku_summary(baseline.requested_day,false);
  full_summary:=public.daily_sudoku_summary(baseline.requested_day,true);
  FOREACH field IN ARRAY ARRAY['day','current_day','next_opens_at','available','streak','ticket_opened','can_submit','my_completed','rankings'] LOOP
   IF actual->field IS DISTINCT FROM baseline.context->field THEN RAISE EXCEPTION 'Summary changed field: %',field; END IF;
  END LOOP;
  IF full_summary->'streak_rankings' IS DISTINCT FROM baseline.context->'streak_rankings' THEN RAISE EXCEPTION 'Streak rankings changed'; END IF;
  IF actual ?| ARRAY['givens','saved_progress','completion_state','streak_rankings'] THEN RAISE EXCEPTION 'Polling returns unnecessary boards'; END IF;
 END LOOP;
 IF EXISTS((SELECT * FROM recent_baseline EXCEPT ALL SELECT * FROM public.recent_completions()) UNION ALL
           (SELECT * FROM public.recent_completions() EXCEPT ALL SELECT * FROM recent_baseline)) THEN RAISE EXCEPTION 'Recent results changed'; END IF;
 IF has_function_privilege('public','public.daily_sudoku_summary(date,boolean)','execute')
  OR NOT has_function_privilege('anon','public.daily_sudoku_summary(date,boolean)','execute')
  OR NOT has_function_privilege('authenticated','public.daily_sudoku_summary(date,boolean)','execute') THEN RAISE EXCEPTION 'Wrong summary privileges'; END IF;
END $$;
SELECT 'Summary parity for guests and accounts, current/past days, recent ordering, minimal payload and permissions: passed (rolled back)' AS result;
"""
sql = migration.replace('BEGIN;', 'BEGIN ISOLATION LEVEL REPEATABLE READ;\n' + baseline, 1)
sql = sql.rsplit('COMMIT;', 1)[0] + checks + '\nROLLBACK;'
for row in query(sql):
    print(row)
