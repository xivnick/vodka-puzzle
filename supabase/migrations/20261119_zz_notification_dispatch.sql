BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

REVOKE ALL ON net.http_request_queue, net._http_response FROM PUBLIC, anon, authenticated;

CREATE TABLE private.puzzle_notification_jobs (
  job_key text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('release', 'daily', 'reminder')),
  season_id text,
  puzzle_id text,
  day date,
  title text NOT NULL,
  body text NOT NULL,
  path text NOT NULL,
  due_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  expanded_at timestamptz
);

CREATE TABLE private.puzzle_notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_key text NOT NULL REFERENCES private.puzzle_notification_jobs ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.puzzle_push_subscriptions(id) ON DELETE CASCADE,
  account_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','sending','sent','failed','expired','uncertain')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  UNIQUE (job_key, subscription_id)
);

CREATE INDEX puzzle_notification_jobs_due_idx ON private.puzzle_notification_jobs (due_at) WHERE expanded_at IS NULL;
CREATE INDEX puzzle_notification_delivery_ready_idx ON private.puzzle_notification_deliveries (next_attempt_at) WHERE status = 'ready';
CREATE INDEX puzzle_notification_delivery_subscription_idx ON private.puzzle_notification_deliveries (subscription_id);

CREATE FUNCTION private.wake_puzzle_notifications() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE endpoint text; token text;
BEGIN
  SELECT decrypted_secret INTO endpoint FROM vault.decrypted_secrets WHERE name = 'puzzle_notification_endpoint';
  SELECT decrypted_secret INTO token FROM vault.decrypted_secrets WHERE name = 'puzzle_notification_dispatch_token';
  IF endpoint IS NULL OR token IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(url := endpoint, headers := jsonb_build_object(
    'Content-Type', 'application/json', 'Authorization', 'Bearer ' || token
  ), body := '{"action":"dispatch"}'::jsonb, timeout_milliseconds := 55000);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not wake puzzle notification dispatcher (%)', SQLSTATE;
END
$$;

CREATE FUNCTION private.queue_puzzle_release_notification() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE key text := 'release:' || NEW.season_id || ':' || NEW.puzzle_id; due timestamptz;
BEGIN
  IF NEW.status <> 'published' OR NEW.published_at IS NULL THEN
    DELETE FROM private.puzzle_notification_jobs WHERE job_key = key AND expanded_at IS NULL;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'published' AND OLD.published_at <= now() AND
        NOT EXISTS (SELECT 1 FROM private.puzzle_notification_jobs WHERE job_key = key AND expanded_at IS NULL) THEN
      RETURN NEW;
    END IF;
  END IF;
  IF NEW.published_at < now() - interval '30 minutes' THEN RETURN NEW; END IF;

  due := NEW.published_at;
  INSERT INTO private.puzzle_notification_jobs (job_key, kind, season_id, puzzle_id, title, body, path, due_at, expires_at)
  VALUES (key, 'release', NEW.season_id, NEW.puzzle_id, '퍼즐 릴리즈',
    NEW.title || CASE WHEN ascii(right(NEW.title, 1)) BETWEEN 44032 AND 55203
      AND (ascii(right(NEW.title, 1)) - 44032) % 28 <> 0 THEN '이' ELSE '가' END || ' 공개되었어요',
    '/' || NEW.puzzle_id || '/', due, due + interval '30 minutes')
  ON CONFLICT (job_key) DO UPDATE SET body = EXCLUDED.body, due_at = EXCLUDED.due_at, expires_at = EXCLUDED.expires_at
    WHERE puzzle_notification_jobs.expanded_at IS NULL;
  IF FOUND AND due <= now() THEN PERFORM private.wake_puzzle_notifications(); END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER queue_puzzle_release_notification
AFTER INSERT OR UPDATE OF status, published_at, title ON public.puzzle_catalog
FOR EACH ROW EXECUTE FUNCTION private.queue_puzzle_release_notification();

CREATE FUNCTION private.queue_daily_puzzle_notifications(at_time timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE seoul_now timestamp := at_time AT TIME ZONE 'Asia/Seoul'; today date := seoul_now::date;
DECLARE starts_at timestamptz; kind text; title text; message text;
BEGIN
  IF seoul_now::time < time '00:10' THEN
    kind := 'daily'; title := '데일리 스도쿠'; message := '오늘의 스도쿠를 풀어보세요';
    starts_at := today::timestamp AT TIME ZONE 'Asia/Seoul';
  ELSIF seoul_now::time >= time '23:00' AND seoul_now::time < time '23:10' THEN
    kind := 'reminder'; title := '데일리 리마인더'; message := '데일리 스도쿠 마감까지 1시간 남았습니다';
    starts_at := (today + time '23:00') AT TIME ZONE 'Asia/Seoul';
  ELSE
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.daily_sudoku p WHERE p.day = today)
    AND EXISTS (SELECT 1 FROM private.daily_sudoku p WHERE p.day = today AND p.opens_at <= clock_timestamp()) THEN
    PERFORM public.publish_daily_sudoku();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.daily_sudoku p WHERE p.day = today AND p.opens_at <= at_time) THEN RETURN; END IF;
  INSERT INTO private.puzzle_notification_jobs (job_key, kind, day, title, body, path, due_at, expires_at)
  VALUES (kind || ':' || today, kind, today, title, message, '/daily-sudoku/', starts_at, starts_at + interval '10 minutes')
  ON CONFLICT (job_key) DO NOTHING;
END
$$;

CREATE FUNCTION private.puzzle_notification_eligible(
  job private.puzzle_notification_jobs, subscription public.puzzle_push_subscriptions
) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE job.kind
    WHEN 'release' THEN subscription.new_puzzle AND public.is_puzzle_published(job.season_id, job.puzzle_id)
    WHEN 'daily' THEN subscription.daily_sudoku
    WHEN 'reminder' THEN subscription.daily_reminder AND NOT EXISTS (
      SELECT 1 FROM public.daily_sudoku_completions c
      WHERE c.day = job.day AND c.user_id = subscription.account_id AND NOT c.excluded
    )
  END
$$;

CREATE FUNCTION public.claim_puzzle_notifications() RETURNS TABLE(
  delivery_id uuid, attempt integer, endpoint text, p256dh text, auth text,
  subscription_revision timestamptz, title text, body text, path text, tag text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE job private.puzzle_notification_jobs;
BEGIN
  UPDATE private.puzzle_notification_deliveries SET status = 'uncertain'
    WHERE status = 'sending' AND claimed_at < now() - interval '2 minutes';

  FOR job IN SELECT * FROM private.puzzle_notification_jobs
    WHERE expanded_at IS NULL AND due_at <= now() AND expires_at > now()
    ORDER BY due_at FOR UPDATE SKIP LOCKED LIMIT 20
  LOOP
    INSERT INTO private.puzzle_notification_deliveries (job_key, subscription_id, account_id)
    SELECT job.job_key, s.id, s.account_id FROM public.puzzle_push_subscriptions s
      WHERE private.puzzle_notification_eligible(job, s);
    UPDATE private.puzzle_notification_jobs j SET expanded_at = now() WHERE j.job_key = job.job_key;
  END LOOP;

  RETURN QUERY WITH claimed AS (
    SELECT d.id FROM private.puzzle_notification_deliveries d
    JOIN private.puzzle_notification_jobs j USING (job_key)
    JOIN public.puzzle_push_subscriptions s ON s.id = d.subscription_id AND s.account_id = d.account_id
    WHERE d.status = 'ready' AND d.next_attempt_at <= now() AND j.expires_at > now()
      AND private.puzzle_notification_eligible(j, s)
    ORDER BY d.next_attempt_at, d.id LIMIT 24 FOR UPDATE OF d SKIP LOCKED
  ), changed AS (
    UPDATE private.puzzle_notification_deliveries d
    SET status = 'sending', attempts = d.attempts + 1, claimed_at = now() FROM claimed c WHERE d.id = c.id
    RETURNING d.*
  )
  SELECT d.id, d.attempts, s.endpoint, s.p256dh, s.auth, s.updated_at, j.title, j.body, j.path, j.job_key
  FROM changed d JOIN private.puzzle_notification_jobs j USING (job_key)
  JOIN public.puzzle_push_subscriptions s ON s.id = d.subscription_id;
END
$$;

CREATE FUNCTION public.finish_puzzle_notification(
  delivery_id uuid, attempt integer, outcome text, subscription_revision timestamptz
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target uuid;
BEGIN
  IF outcome NOT IN ('sent', 'expired', 'retry', 'failed', 'uncertain') THEN RAISE EXCEPTION 'INVALID_OUTCOME'; END IF;
  UPDATE private.puzzle_notification_deliveries d
  SET status = CASE WHEN outcome = 'retry' THEN CASE WHEN d.attempts < 3 THEN 'ready' ELSE 'failed' END ELSE outcome END,
    next_attempt_at = now() + interval '1 minute' * d.attempts
  WHERE d.id = delivery_id AND d.status = 'sending' AND d.attempts = attempt RETURNING d.subscription_id INTO target;
  IF FOUND AND outcome = 'expired' THEN
    DELETE FROM public.puzzle_push_subscriptions s WHERE s.id = target AND s.updated_at = subscription_revision;
  END IF;
END
$$;

CREATE FUNCTION private.tick_puzzle_notifications() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.queue_daily_puzzle_notifications(clock_timestamp());
  IF EXISTS (SELECT 1 FROM private.puzzle_notification_jobs
    WHERE expanded_at IS NULL AND due_at <= now() AND expires_at > now())
  OR EXISTS (
    SELECT 1 FROM private.puzzle_notification_deliveries d
    JOIN private.puzzle_notification_jobs j USING (job_key)
    JOIN public.puzzle_push_subscriptions s ON s.id = d.subscription_id AND s.account_id = d.account_id
    WHERE j.expires_at > now() AND ((d.status = 'ready' AND d.next_attempt_at <= now() AND private.puzzle_notification_eligible(j, s))
      OR (d.status = 'sending' AND d.claimed_at < now() - interval '2 minutes'))
  ) THEN
    PERFORM private.wake_puzzle_notifications();
  END IF;
  DELETE FROM private.puzzle_notification_deliveries d USING private.puzzle_notification_jobs j
  WHERE d.job_key = j.job_key AND j.expires_at < now() - interval '7 days';
END
$$;

REVOKE ALL ON FUNCTION private.wake_puzzle_notifications(), private.queue_puzzle_release_notification(),
  private.queue_daily_puzzle_notifications(timestamptz), private.tick_puzzle_notifications(),
  public.claim_puzzle_notifications(), public.finish_puzzle_notification(uuid,integer,text,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_puzzle_notifications(), public.finish_puzzle_notification(uuid,integer,text,timestamptz)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
